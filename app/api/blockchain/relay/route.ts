import { NextRequest, NextResponse } from "next/server";
import { getServerContract } from "@/lib/serverContract";
import { getServerSession } from "@/lib/serverAuth";

/**
 * Validates request authentication.
 * Allows either configured RELAY_SECRET_KEY header OR a valid server-side JWT session cookie.
 */
async function authorizeRelayCall(req: NextRequest, action: string) {
  const relaySecret = process.env.RELAY_SECRET_KEY?.trim();
  const headerSecret =
    req.headers.get("x-relay-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (relaySecret && headerSecret === relaySecret) {
    return { authorized: true, role: "admin" as const };
  }

  // Public actions (can be called by unregistered visitors)
  if (action === "requestAccess") {
    return { authorized: true, role: "guest" as const };
  }

  // Verify server session
  const session = await getServerSession(req);
  if (!session) {
    return { authorized: false, error: "Authentication required. Please sign in to execute on-chain relay actions." };
  }

  // Role permissions matrix
  if (action === "registerStudent" || action === "issueCredential" || action === "reviewAchievement") {
    if (session.role !== "university" && session.role !== "admin") {
      return { authorized: false, error: "Forbidden: University institutional privileges required." };
    }
  }

  if (action === "recordVerification") {
    if (session.role !== "company" && session.role !== "admin") {
      return { authorized: false, error: "Forbidden: Corporate recruiter privileges required." };
    }
  }

  if (action === "approveAccessRequest") {
    if (session.role !== "admin") {
      return { authorized: false, error: "Forbidden: Root Platform Administrator privileges required." };
    }
  }

  if (action === "submitAchievement") {
    if (session.role !== "student" && session.role !== "admin") {
      return { authorized: false, error: "Forbidden: Candidate student credentials required." };
    }
  }

  return { authorized: true, role: session.role, session };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, universityCode, companyCode, data } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action parameter" }, { status: 400 });
    }

    const authCheck = await authorizeRelayCall(req, action);
    if (!authCheck.authorized) {
      return NextResponse.json(
        { error: authCheck.error || "Unauthorized relay execution" },
        { status: 403 }
      );
    }

    // 1. REGISTER STUDENT
    if (action === "registerStudent") {
      const { usn, name, course, gradYear, percentage } = data || {};
      if (!usn || !name) {
        return NextResponse.json({ error: "Candidate USN and Name are required" }, { status: 400 });
      }

      const { contract } = getServerContract("university");
      const cleanCode = (universityCode || authCheck.session?.entityInfo?.code || "VTU-KA-001")
        .trim()
        .toUpperCase();

      const uIdBig = await contract.universityCodeToId(cleanCode);
      const uId = Number(uIdBig);
      if (uId === 0) {
        return NextResponse.json(
          { error: `University code "${cleanCode}" is not accredited on the blockchain.` },
          { status: 403 }
        );
      }

      const univData = await contract.universities(uId);
      if (!univData.active) {
        return NextResponse.json(
          { error: `University "${cleanCode}" is deactivated and cannot onboard candidates.` },
          { status: 403 }
        );
      }

      const cleanUsn = usn.trim().toUpperCase();
      const existingId = Number(await contract.usnToStudentId(cleanUsn));
      if (existingId > 0) {
        return NextResponse.json(
          { success: true, studentId: existingId, message: "Student already registered" },
          { status: 200 }
        );
      }

      const tx = await contract.registerStudentByUniversity(
        uId,
        cleanUsn,
        name.trim(),
        course || "Computer Science",
        gradYear || new Date().getFullYear(),
        Math.min(100, Math.max(0, Number(percentage) || 0))
      );
      const receipt = await tx.wait();
      const newStudentId = Number(await contract.usnToStudentId(cleanUsn));

      return NextResponse.json({
        success: true,
        studentId: newStudentId,
        txHash: receipt.hash,
      });
    }

    // 2. ISSUE CREDENTIAL
    if (action === "issueCredential") {
      const { studentId, documentType, documentHash, ipfsCID } = data || {};
      if (!studentId || !documentHash || !ipfsCID) {
        return NextResponse.json(
          { error: "Missing required credential issuance fields (studentId, documentHash, ipfsCID)" },
          { status: 400 }
        );
      }

      const { contract } = getServerContract("university");
      const cleanCode = (universityCode || authCheck.session?.entityInfo?.code || "VTU-KA-001")
        .trim()
        .toUpperCase();

      const uIdBig = await contract.universityCodeToId(cleanCode);
      const uId = Number(uIdBig);
      if (uId === 0) {
        return NextResponse.json(
          { error: `University code "${cleanCode}" not found on ledger` },
          { status: 403 }
        );
      }

      const univData = await contract.universities(uId);
      if (!univData.active) {
        return NextResponse.json(
          { error: `University "${cleanCode}" is currently deactivated` },
          { status: 403 }
        );
      }

      const tx = await contract.issueCredentialByUniversity(
        uId,
        Number(studentId),
        documentType || "Academic Marksheet",
        documentHash,
        ipfsCID
      );
      const receipt = await tx.wait();

      let newCredId = 0;
      try {
        for (const log of receipt.logs || []) {
          try {
            const parsed = contract.interface.parseLog(log);
            if (parsed && parsed.name === "CredentialIssued") {
              newCredId = Number(parsed.args[0]);
              break;
            }
          } catch {}
        }
      } catch {}

      if (!newCredId) {
        try {
          newCredId = Number(await contract.credentialCounter());
        } catch {}
      }

      return NextResponse.json({
        success: true,
        credentialId: newCredId,
        txHash: receipt.hash,
      });
    }

    // 3. SUBMIT ON-CHAIN ACCESS REQUEST (PUBLIC)
    if (action === "requestAccess") {
      const { entityType, name, proposedCode, contactEmail, wallet } = data || {};
      if (!name || !proposedCode || !contactEmail) {
        return NextResponse.json({ error: "Missing required access request fields" }, { status: 400 });
      }

      const { contract } = getServerContract("admin");
      const tx = await contract.requestAccess(
        entityType || "university",
        name.trim(),
        proposedCode.trim().toUpperCase(),
        contactEmail.trim(),
        wallet || "0x0000000000000000000000000000000000000000"
      );
      const receipt = await tx.wait();
      const totalReqs = Number(await contract.getAccessRequestCount());

      return NextResponse.json({
        success: true,
        requestId: totalReqs,
        txHash: receipt.hash,
      });
    }

    // 4. APPROVE ON-CHAIN ACCESS REQUEST (ADMIN ONLY)
    if (action === "approveAccessRequest") {
      const { requestId } = data || {};
      if (!requestId) {
        return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
      }

      const { contract } = getServerContract("admin");
      const tx = await contract.approveAccessRequest(Number(requestId));
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
      });
    }

    // 5. REVIEW STUDENT ACHIEVEMENT (UNIVERSITY ONLY)
    if (action === "reviewAchievement") {
      const { achievementId, status, remarks } = data || {};
      const { contract } = getServerContract("university");

      const cleanCode = (universityCode || authCheck.session?.entityInfo?.code || "VTU-KA-001")
        .trim()
        .toUpperCase();
      const uIdBig = await contract.universityCodeToId(cleanCode);
      const uId = Number(uIdBig);

      const tx = await contract.reviewAchievement(achievementId, uId, status, remarks || "");
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
      });
    }

    // 6. SUBMIT STUDENT ACHIEVEMENT (STUDENT ONLY)
    if (action === "submitAchievement") {
      const { usn, title, issuerOrg, category, documentHash, ipfsCID } = data || {};
      const { contract } = getServerContract("admin");

      const targetUsn = (usn || authCheck.session?.studentUSN || "").trim().toUpperCase();
      const tx = await contract.submitAchievement(
        targetUsn,
        title || "",
        issuerOrg || "External Certification Body",
        category || "Certification",
        documentHash,
        ipfsCID
      );
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
      });
    }

    // 7. RECORD RECRUITER VERIFICATION (COMPANY ONLY)
    if (action === "recordVerification") {
      const { credentialId, hashMatched, isAuthentic, documentType } = data || {};
      const { contract } = getServerContract("company");

      let cId = 1;
      const cleanComp = (companyCode || authCheck.session?.entityInfo?.code || "").trim().toUpperCase();
      if (cleanComp) {
        const cIdBig = await contract.companyCodeToId(cleanComp);
        cId = Number(cIdBig) || 1;
      }

      const tx = await contract.recordVerificationByCompany(
        cId,
        credentialId || 0,
        Boolean(hashMatched),
        Boolean(isAuthentic),
        documentType || "Academic Document"
      );
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error("Relay route error:", error);
    return NextResponse.json(
      { error: error.reason || error.message || "Blockchain relay execution failed" },
      { status: 500 }
    );
  }
}
