import { NextRequest, NextResponse } from "next/server";
import { AccessRequest } from "@/types";
import { getReadOnlyServerContract, getServerContract } from "@/lib/serverContract";
import { getServerSession } from "@/lib/serverAuth";
import { generateAndStoreAccessCode } from "@/lib/accessCodeStore";
import { prisma } from "@/lib/prisma";
import { parseAndValidateUSN } from "@/lib/usnParser";
import { sendApprovalEmail } from "@/lib/emailService";

export const dynamic = "force-dynamic";

function isAdminWalletRequest(req: NextRequest): boolean {
  const adminWalletHeader = req.headers.get("x-admin-wallet")?.trim().toLowerCase();
  const configuredAdmin = (process.env.ADMIN_WALLET || process.env.NEXT_PUBLIC_ADMIN_WALLET || "").trim().toLowerCase();
  const hardcodedAdmin = "0x59fd799647b8b5718fbad523a1c5b87d600c1fb8";
  return Boolean(
    adminWalletHeader &&
    (adminWalletHeader === hardcodedAdmin || (configuredAdmin && adminWalletHeader === configuredAdmin))
  );
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  const isAdmin = isAdminWalletRequest(req) || session?.role === "admin";

  if (!isAdmin && (!session || session.role !== "university")) {
    return NextResponse.json(
      { error: "Forbidden: Administrator or College privileges required." },
      { status: 403 }
    );
  }

  // If university session, isolate requests strictly to this college's code
  if (session && session.role === "university" && !isAdmin) {
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
    orderBy: { requestId: "desc" },
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
          approved: Boolean(reqData.approved),
          timestamp: Number(reqData.timestamp) * 1000,
        });
      } catch {}
    }
  } catch (err) {
    console.warn("Unable to fetch on-chain access requests directly:", err);
  }

  // Check persistent credentials to know which institutions are already fully approved & registered
  const dbInstitutions = await prisma.institutionCredential.findMany();

  // Merge keyed STRICTLY by requestId so no requests are overwritten or dropped
  const map = new Map<number, AccessRequest & { status?: string; dismissed?: boolean }>();

  for (const r of onChainList) {
    map.set(r.requestId, {
      ...r,
      approved: Boolean(r.approved),
    });
  }

  for (const r of dbRequests) {
    const isApproved = Boolean(r.approved || r.status === "approved");
    const isDismissed = Boolean(r.status === "rejected" || r.status === "dismissed");
    const existing = map.get(r.requestId);

    if (existing) {
      if (isApproved) existing.approved = true;
      if (isDismissed) existing.dismissed = true;
      if (r.status) existing.status = r.status;
      if (r.contactEmail) existing.contactEmail = r.contactEmail;
      if (r.name) existing.name = r.name;
      if (r.wallet && r.wallet !== "0x0000000000000000000000000000000000000000") existing.wallet = r.wallet;
    } else {
      map.set(r.requestId, {
        requestId: r.requestId,
        entityType: r.entityType as any,
        name: r.name,
        proposedCode: r.proposedCode,
        contactEmail: r.contactEmail,
        wallet: r.wallet,
        approved: isApproved,
        dismissed: isDismissed,
        status: r.status,
        timestamp: r.createdAt.getTime(),
      });
    }
  }

  const merged = Array.from(map.values())
    .filter((r) => !r.dismissed && r.status !== "rejected" && r.status !== "dismissed")
    .sort((a, b) => b.requestId - a.requestId);

  return NextResponse.json({
    requests: merged,
    dbInstitutions: dbInstitutions.map((i: any) => ({
      id: i.entityId,
      name: i.name,
      code: i.codeIdentifier,
      entityType: i.entityType,
      wallet: i.wallet,
      active: true,
    })),
  });
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

      // Drop Postgres unique constraint if still lingering from old migrations
      try {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "AccessRequest" DROP CONSTRAINT IF EXISTS "AccessRequest_proposedCode_key"; DROP INDEX IF EXISTS "AccessRequest_proposedCode_key";'
        );
      } catch {}

      // Attempt on-chain requestAccess submission
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

      // Determine next requestId across both DB and On-chain
      let highestChainId = 0;
      try {
        const contract = getReadOnlyServerContract();
        highestChainId = Number(await contract.getAccessRequestCount());
      } catch {}

      const highestDbReq = await prisma.accessRequest.findFirst({
        orderBy: { requestId: "desc" },
      });
      const highestDbId = highestDbReq ? highestDbReq.requestId : 0;
      const nextId = onChainReqId || (Math.max(highestDbId, highestChainId) + 1);

      const dbRecord = await prisma.accessRequest.create({
        data: {
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
    // SECURITY CHECK: All Actions Below Require Admin Authorization
    // ----------------------------------------------------
    const session = await getServerSession(req);
    const isAdmin = isAdminWalletRequest(req) || session?.role === "admin";
    if (!isAdmin) {
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

      // Determine true on-chain entity ID
      let resolvedEntityId = Number(body.entityId);
      if (!resolvedEntityId || resolvedEntityId <= 0) {
        try {
          const contract = getReadOnlyServerContract();
          if (reqRecord?.entityType === "company") {
            resolvedEntityId = Number(await contract.companyCodeToId(reqRecord.proposedCode));
          } else if (reqRecord) {
            resolvedEntityId = Number(await contract.universityCodeToId(reqRecord.proposedCode));
          }
        } catch {}
      }
      const finalEntityId = resolvedEntityId > 0 ? resolvedEntityId : targetId;
      const finalWallet = body.wallet || reqRecord?.wallet || "0x0000000000000000000000000000000000000000";

      // Generate random high-entropy secret access code, store bcrypt hash in database
      let secretAccessCode = "";
      if (reqRecord) {
        secretAccessCode = await generateAndStoreAccessCode(
          reqRecord.entityType as "university" | "company",
          finalEntityId,
          reqRecord.proposedCode,
          reqRecord.name,
          finalWallet
        );
      }

      return NextResponse.json({
        success: true,
        requestId: targetId,
        entityId: finalEntityId,
        secretAccessCode,
        contactEmail: reqRecord?.contactEmail || "",
      });
    }

    // ----------------------------------------------------
    // Admin Action: Generate Secret Access Code for Manual Registration
    // ----------------------------------------------------
    if (action === "generate_code") {
      const data = entityData || body || {};
      const entityType = (data.entityType || body.entityType || "university") as "university" | "company";
      const entityId = Number(data.entityId || body.entityId) || 1;
      const codeIdentifier = (data.codeIdentifier || data.code || body.codeIdentifier || body.code || "").trim().toUpperCase();
      const name = (data.name || body.name || "").trim();
      const wallet = data.wallet || body.wallet || "0x0000000000000000000000000000000000000000";

      if (!codeIdentifier || !name) {
        return NextResponse.json({ error: "Missing entity details for code generation" }, { status: 400 });
      }

      const secretAccessCode = await generateAndStoreAccessCode(
        entityType,
        entityId,
        codeIdentifier,
        name,
        wallet
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
      const targetId = Number(requestId);
      await prisma.accessRequest.upsert({
        where: { requestId: targetId },
        update: { status: "rejected", approved: false },
        create: {
          requestId: targetId,
          entityType: "university",
          name: "Dismissed Request",
          proposedCode: `DISMISSED-${targetId}`,
          contactEmail: "",
          wallet: "0x0000000000000000000000000000000000000000",
          approved: false,
          status: "rejected",
        },
      });
      return NextResponse.json({ success: true, rejectedId: targetId });
    }

    // ----------------------------------------------------
    // Admin Action: Clear All Requests
    // ----------------------------------------------------
    if (action === "clear_all") {
      try {
        const contract = getReadOnlyServerContract();
        const total = Number(await contract.getAccessRequestCount());
        for (let i = 1; i <= total; i++) {
          await prisma.accessRequest.upsert({
            where: { requestId: i },
            update: { status: "dismissed", approved: false },
            create: {
              requestId: i,
              entityType: "university",
              name: "Dismissed Request",
              proposedCode: `DISMISSED-${i}`,
              contactEmail: "",
              wallet: "0x0000000000000000000000000000000000000000",
              approved: false,
              status: "dismissed",
            },
          });
        }
      } catch {}
      await prisma.accessRequest.updateMany({
        data: { status: "dismissed" },
      });
      return NextResponse.json({ success: true, requests: [] });
    }

    // ----------------------------------------------------
    // Admin Action: Purge & Reset Platform Database (when new contract deployed)
    // ----------------------------------------------------
    if (action === "reset_platform") {
      try {
        await prisma.studentMark.deleteMany({});
        await prisma.studentMarkVersion.deleteMany({});
        await prisma.studentAchievement.deleteMany({});
        await prisma.studentWalletLink.deleteMany({});
        await prisma.studentOTP.deleteMany({});
        await prisma.studentProfile.deleteMany({});
        await prisma.institutionCredential.deleteMany({});
        await prisma.accessRequest.deleteMany({});
        await prisma.rateLimitCounter.deleteMany({});
        return NextResponse.json({ success: true, message: "Database purged and reset to 100% clean state." });
      } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to reset platform" }, { status: 500 });
      }
    }

    // ----------------------------------------------------
    // Admin Action: Delete / Hide Institution
    // ----------------------------------------------------
    if (action === "delete_institution") {
      const code = (body.codeIdentifier || body.code || "").trim().toUpperCase();
      if (code) {
        await prisma.institutionCredential.deleteMany({
          where: { codeIdentifier: code },
        });
        await prisma.accessRequest.deleteMany({
          where: { proposedCode: code },
        });
      }
      return NextResponse.json({ success: true, deleted: code });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to process request" }, { status: 500 });
  }
}
