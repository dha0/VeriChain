import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { AccessRequest } from "@/types";
import { getReadOnlyServerContract, getServerContract } from "@/lib/serverContract";

const CWD_FILE = path.join(process.cwd(), ".access_requests.json");
const TMP_FILE = path.join(os.tmpdir(), "access_requests.json");

// In-memory cache across serverless warm invocations
declare global {
  var __accessRequestsCache: AccessRequest[] | undefined;
}

function readLocalRequests(): AccessRequest[] {
  if (global.__accessRequestsCache && Array.isArray(global.__accessRequestsCache)) {
    return global.__accessRequestsCache;
  }

  // 1. Check /tmp first (writable in Vercel serverless functions)
  try {
    if (fs.existsSync(TMP_FILE)) {
      const content = fs.readFileSync(TMP_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        global.__accessRequestsCache = parsed;
        return parsed;
      }
    }
  } catch {}

  // 2. Check project root file (persisted in git or local dev)
  try {
    if (fs.existsSync(CWD_FILE)) {
      const content = fs.readFileSync(CWD_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        global.__accessRequestsCache = parsed;
        return parsed;
      }
    }
  } catch {}

  global.__accessRequestsCache = [];
  return [];
}

function writeLocalRequests(data: AccessRequest[]) {
  global.__accessRequestsCache = data;

  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2));
  } catch {}

  try {
    fs.writeFileSync(CWD_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

export async function GET() {
  const localList = readLocalRequests();
  const onChainList: AccessRequest[] = [];

  // 1. Fetch on-chain access requests directly from the smart contract
  try {
    const contract = getReadOnlyServerContract();
    const countBig = await contract.getAccessRequestCount();
    const total = Number(countBig);

    for (let i = 1; i <= total; i++) {
      try {
        const req = await contract.getAccessRequest(i);
        onChainList.push({
          requestId: Number(req.requestId),
          entityType: req.entityType as any,
          name: req.name,
          proposedCode: req.proposedCode,
          contactEmail: req.contactEmail,
          wallet: req.wallet,
          approved: req.approved,
          timestamp: Number(req.timestamp) * 1000,
        });
      } catch {}
    }
  } catch (err) {
    console.warn("Unable to fetch on-chain access requests directly:", err);
  }

  // 2. Merge on-chain requests with any local pending requests
  const map = new Map<string, AccessRequest>();
  for (const r of onChainList) {
    map.set(`code_${r.proposedCode.toUpperCase()}`, r);
  }
  for (const r of localList) {
    const key = `code_${(r.proposedCode || "").toUpperCase()}`;
    if (!map.has(key)) {
      map.set(key, r);
    }
  }

  const merged = Array.from(map.values());
  writeLocalRequests(merged);

  return NextResponse.json({ requests: merged });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, requestData, requestId } = body;
    const localRequests = readLocalRequests();

    if (action === "submit") {
      const { entityType, name, proposedCode, contactEmail, wallet } = requestData || {};
      if (!name || !proposedCode || !contactEmail) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      const cleanCode = proposedCode.trim().toUpperCase();
      let onChainReqId: number | null = null;
      let onChainTxHash: string | null = null;

      // Anchor access request on-chain to Ethereum smart contract
      try {
        const { contract } = getServerContract("admin");
        const tx = await contract.requestAccess(
          entityType || "university",
          name.trim(),
          cleanCode,
          contactEmail.trim(),
          wallet || "0x0000000000000000000000000000000000000000"
        );
        const receipt = await tx.wait();
        onChainTxHash = receipt.hash;
        onChainReqId = Number(await contract.getAccessRequestCount());
      } catch (chainErr) {
        console.warn("On-chain requestAccess submission warning:", chainErr);
      }

      const newReq: AccessRequest = {
        requestId:
          onChainReqId ||
          (localRequests.length > 0 ? Math.max(...localRequests.map((r) => r.requestId)) + 1 : 1),
        entityType: entityType || "university",
        name: name.trim(),
        proposedCode: cleanCode,
        contactEmail: contactEmail.trim(),
        wallet: wallet || "0x0000000000000000000000000000000000000000",
        approved: false,
        timestamp: Date.now(),
      };

      const existingIndex = localRequests.findIndex(
        (r) => r.proposedCode.toUpperCase() === cleanCode
      );
      if (existingIndex >= 0) {
        localRequests[existingIndex] = newReq;
      } else {
        localRequests.push(newReq);
      }
      writeLocalRequests(localRequests);

      return NextResponse.json({
        success: true,
        request: newReq,
        txHash: onChainTxHash,
      });
    }

    if (action === "approve") {
      const targetId = Number(requestId);

      // Attempt on-chain approval if applicable
      try {
        const { contract } = getServerContract("admin");
        const tx = await contract.approveAccessRequest(targetId);
        await tx.wait();
      } catch (chainErr) {
        console.warn("On-chain approveAccessRequest warning:", chainErr);
      }

      const index = localRequests.findIndex((r) => r.requestId === targetId);
      if (index >= 0) {
        localRequests[index].approved = true;
        writeLocalRequests(localRequests);
      }

      return NextResponse.json({ success: true, requestId: targetId });
    }

    if (action === "reject" || action === "delete") {
      const filtered = localRequests.filter((r) => r.requestId !== Number(requestId));
      writeLocalRequests(filtered);
      return NextResponse.json({ success: true, requests: filtered });
    }

    if (action === "clear_all") {
      writeLocalRequests([]);
      return NextResponse.json({ success: true, requests: [] });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to process request" }, { status: 500 });
  }
}
