import { NextRequest, NextResponse } from "next/server";
import { AccessRequest } from "@/types";
import { getReadOnlyServerContract, getServerContract } from "@/lib/serverContract";
import { getServerSession } from "@/lib/serverAuth";
import { generateAndStoreAccessCode } from "@/lib/accessCodeStore";
import { prisma } from "@/lib/prisma";
import { parseAndValidateUSN } from "@/lib/usnParser";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session || (session.role !== "admin" && session.role !== "university")) {
    return NextResponse.json(
      { error: "Forbidden: Administrator or College privileges required." },
      { status: 403 }
    );
  }

  // If university session, isolate requests strictly to this college's code
  if (session.role === "university") {
    const collegeCode = session.entityInfo?.code?.trim()?.toUpperCase();
    if (!collegeCode) {
      return NextResponse.json({ requests: [] });
    }
    const dbRequests = await prisma.accessRequest.findMany({
      where: { proposedCode: collegeCode },
      orderBy: { requestId: "asc" },
    });
    return NextResponse.json({
      requests: dbRequests.map((r: any) => ({
        requestId: r.requestId,
        entityType: r.entityType as any,
        name: r.name,
        proposedCode: r.proposedCode,
        contactEmail: r.contactEmail,
        wallet: r.wallet,
        approved: r.approved,
        timestamp: r.createdAt.getTime(),
      })),
    });
  }

  // 1. Fetch persistent requests from PostgreSQL via Prisma
  const dbRequests = await prisma.accessRequest.findMany({
    orderBy: { requestId: "asc" },
  });

  const onChainList: AccessRequest[] = [];

  // 2. Sync with on-chain requests if accessible
  try {
    const contract = getReadOnlyServerContract();
    const countBig = await contract.getAccessRequestCount();
    const total = Number(countBig);

    for (let i = 1; i <= total; i++) {
      try {
        const reqData = await contract.getAccessRequest(i);
        onChainList.push({
          requestId: Number(reqData.requestId),
          entityType: reqData.entityType as any,
          name: reqData.name,
          proposedCode: reqData.proposedCode,
          contactEmail: reqData.contactEmail,
          wallet: reqData.wallet,
          approved: reqData.approved,
          timestamp: Number(reqData.timestamp) * 1000,
        });
      } catch {}
    }
  } catch (err) {
    console.warn("Unable to fetch on-chain access requests directly:", err);
  }

  const map = new Map<string, AccessRequest>();
  for (const r of onChainList) {
    map.set(`code_${r.proposedCode.toUpperCase()}`, r);
  }

  for (const r of dbRequests) {
    const key = `code_${(r.proposedCode || "").toUpperCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        requestId: r.requestId,
        entityType: r.entityType as any,
        name: r.name,
        proposedCode: r.proposedCode,
        contactEmail: r.contactEmail,
        wallet: r.wallet,
        approved: r.approved,
        timestamp: r.createdAt.getTime(),
      });
    }
  }

  const merged = Array.from(map.values());
  return NextResponse.json({ requests: merged });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, requestData, requestId, entityData } = body;

    // ----------------------------------------------------
    // Public Submission of Institutional Access Request
    // ----------------------------------------------------
    if (action === "submit") {
      const { entityType, name, proposedCode, contactEmail, wallet } = requestData || {};
      if (!name || !proposedCode || !contactEmail) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      const cleanCode = proposedCode.trim().toUpperCase();
      let onChainReqId: number | null = null;
      let onChainTxHash: string | null = null;

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

      // Determine next requestId for database
      const highestDbReq = await prisma.accessRequest.findFirst({
        orderBy: { requestId: "desc" },
      });
      const nextId = onChainReqId || (highestDbReq ? highestDbReq.requestId + 1 : 1);

      const dbRecord = await prisma.accessRequest.upsert({
        where: { proposedCode: cleanCode },
        update: {
          name: name.trim(),
          contactEmail: contactEmail.trim(),
          wallet: wallet || "0x0000000000000000000000000000000000000000",
          entityType: entityType || "university",
        },
        create: {
          requestId: nextId,
          entityType: entityType || "university",
          name: name.trim(),
          proposedCode: cleanCode,
          contactEmail: contactEmail.trim(),
          wallet: wallet || "0x0000000000000000000000000000000000000000",
          approved: false,
          status: "pending",
        },
      });

      return NextResponse.json({
        success: true,
        request: {
          requestId: dbRecord.requestId,
          entityType: dbRecord.entityType,
          name: dbRecord.name,
          proposedCode: dbRecord.proposedCode,
          contactEmail: dbRecord.contactEmail,
          wallet: dbRecord.wallet,
          approved: dbRecord.approved,
          timestamp: dbRecord.createdAt.getTime(),
        },
        txHash: onChainTxHash,
      });
    }

    // ----------------------------------------------------
    // SECURITY CHECK: All Actions Below Require Admin Session
    // ----------------------------------------------------
    const session = await getServerSession(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Platform Administrator privileges required." },
        { status: 403 }
      );
    }

    // ----------------------------------------------------
    // Admin Action: Approve Institutional Access Request
    // ----------------------------------------------------
    if (action === "approve") {
      const targetId = Number(requestId);
      const reqRecord = await prisma.accessRequest.findUnique({
        where: { requestId: targetId },
      });

      // Attempt on-chain approval if applicable
      try {
        const { contract } = getServerContract("admin");
        const tx = await contract.approveAccessRequest(targetId);
        await tx.wait();
      } catch (chainErr) {
        console.warn("On-chain approveAccessRequest warning:", chainErr);
      }

      await prisma.accessRequest.updateMany({
        where: { requestId: targetId },
        data: { approved: true, status: "approved" },
      });

      // Generate random high-entropy secret access code, store bcrypt hash in database
      let secretAccessCode = "";
      if (reqRecord) {
        secretAccessCode = await generateAndStoreAccessCode(
          reqRecord.entityType as "university" | "company",
          targetId,
          reqRecord.proposedCode,
          reqRecord.name,
          reqRecord.wallet
        );
      }

      return NextResponse.json({
        success: true,
        requestId: targetId,
        secretAccessCode, // Returned ONCE to the admin to share with the institution
      });
    }

    // ----------------------------------------------------
    // Admin Action: Generate Secret Access Code for Manual Registration
    // ----------------------------------------------------
    if (action === "generate_code") {
      const { entityType, entityId, codeIdentifier, name, wallet } = entityData || {};
      if (!codeIdentifier || !name) {
        return NextResponse.json({ error: "Missing entity details for code generation" }, { status: 400 });
      }

      const secretAccessCode = await generateAndStoreAccessCode(
        entityType || "university",
        Number(entityId) || 1,
        codeIdentifier,
        name,
        wallet || "0x0000000000000000000000000000000000000000"
      );

      return NextResponse.json({
        success: true,
        secretAccessCode,
      });
    }

    // ----------------------------------------------------
    // Admin Action: Reject / Dismiss Request
    // ----------------------------------------------------
    if (action === "reject" || action === "delete") {
      await prisma.accessRequest.deleteMany({
        where: { requestId: Number(requestId) },
      });
      const remaining = await prisma.accessRequest.findMany({
        orderBy: { requestId: "asc" },
      });
      return NextResponse.json({ success: true, requests: remaining });
    }

    // ----------------------------------------------------
    // Admin Action: Clear All Requests
    // ----------------------------------------------------
    if (action === "clear_all") {
      await prisma.accessRequest.deleteMany({});
      return NextResponse.json({ success: true, requests: [] });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to process request" }, { status: 500 });
  }
}
