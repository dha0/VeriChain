import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { AccessRequest } from "@/types";

const CWD_FILE = path.join(process.cwd(), ".access_requests.json");
const TMP_FILE = path.join(os.tmpdir(), "access_requests.json");

// In-memory cache across serverless warm invocations
declare global {
  var __accessRequestsCache: AccessRequest[] | undefined;
}

function readRequests(): AccessRequest[] {
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
  } catch (e) {}

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
  } catch (e) {}

  // Return empty list if no requests found (do not re-seed deleted demo requests)
  global.__accessRequestsCache = [];
  return [];
}

function writeRequests(data: AccessRequest[]) {
  global.__accessRequestsCache = data;

  // 1. Write to /tmp (always writable in Vercel/AWS Lambda)
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to write access requests to /tmp:", e);
  }

  // 2. Try writing to cwd (works in local development, silent no-op on Vercel read-only filesystem)
  try {
    fs.writeFileSync(CWD_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    // EROFS on serverless is expected and handled by /tmp & memory cache
  }
}

export async function GET() {
  const requests = readRequests();
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, requestData, requestId } = body;
    const requests = readRequests();

    if (action === "submit") {
      const { entityType, name, proposedCode, contactEmail, wallet } = requestData;
      if (!name || !proposedCode || !contactEmail) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      const newReq: AccessRequest = {
        requestId: requests.length > 0 ? Math.max(...requests.map((r) => r.requestId)) + 1 : 1,
        entityType,
        name,
        proposedCode: proposedCode.toUpperCase(),
        contactEmail,
        wallet: wallet || "0x0000000000000000000000000000000000000000",
        approved: false,
        timestamp: Date.now(),
      };

      requests.push(newReq);
      writeRequests(requests);
      return NextResponse.json({ success: true, request: newReq });
    }

    if (action === "approve") {
      const index = requests.findIndex((r) => r.requestId === Number(requestId));
      if (index === -1) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }

      requests[index].approved = true;
      writeRequests(requests);
      return NextResponse.json({ success: true, request: requests[index] });
    }

    if (action === "reject" || action === "delete") {
      const filtered = requests.filter((r) => r.requestId !== Number(requestId));
      writeRequests(filtered);
      return NextResponse.json({ success: true, requests: filtered });
    }

    if (action === "clear_all") {
      writeRequests([]);
      return NextResponse.json({ success: true, requests: [] });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
