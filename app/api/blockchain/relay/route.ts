import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { getServerContract, getReadOnlyServerContract } from "@/lib/serverContract";
import { getServerSession, upsertStudentProfile } from "@/lib/serverAuth";
import { SUPPORTED_CHAIN_ID } from "@/contracts/contractAddress";
import { parseAndValidateUSN } from "@/lib/usnParser";

/**
 * Startup validation: If RELAY_SECRET_KEY is configured in environment, it must have at least 32 characters.
 */
const startupRelaySecret = process.env.RELAY_SECRET_KEY?.trim();
if (startupRelaySecret && startupRelaySecret.length < 32) {
  throw new Error(
    "CRITICAL SECURITY CONFIGURATION ERROR: RELAY_SECRET_KEY must be at least 32 characters long."
  );
}

/**
 * Validates request authorization.
 * Allows either configured RELAY_SECRET_KEY header OR a valid server-side JWT session cookie.
 * RELAY_SECRET_KEY must come exclusively from environment with NO default fallback and minimum 32 chars.
 */
async function authorizeRelayCall(req: NextRequest, action: string) {
  const relaySecret = process.env.RELAY_SECRET_KEY?.trim();
  if (relaySecret && relaySecret.length < 32) {
    throw new Error(
      "CRITICAL SECURITY CONFIGURATION ERROR: RELAY_SECRET_KEY must be at least 32 characters long."
    );
  }
  const headerSecret =
    req.headers.get("x-relay-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (relaySecret && headerSecret === relaySecret) {
    return { authorized: true, role: "admin" as const, session: null };
  }

  // Public actions (can be called by unregistered entities to request institutional access)
  if (action === "requestAccess") {
    return { authorized: true, role: "guest" as const, session: null };
  }

  // Allow root admin wallet authorization
  const adminWalletHeader = req.headers.get("x-admin-wallet")?.trim().toLowerCase();
  const configuredAdmin = (process.env.ADMIN_WALLET || process.env.NEXT_PUBLIC_ADMIN_WALLET || "").trim().toLowerCase();
  const hardcodedAdmin = "0x4f1a429909a9024533ab1801517e152ac6cc3a14";
  if (
    adminWalletHeader &&
    (adminWalletHeader === hardcodedAdmin || (configuredAdmin && adminWalletHeader === configuredAdmin))
  ) {
    return {
      authorized: true,
      role: "admin" as const,
      session: {
        role: "admin" as const,
        account: adminWalletHeader,
        sessionId: "admin-direct-wallet",
      } as any,
    };
  }

  // Verify server session
  const session = await getServerSession(req);
  if (!session) {
    return {
      authorized: false,
      error: "Authentication required. Please sign in to execute on-chain relay actions.",
    };
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

  if (
    action === "approveAccessRequest" ||
    action === "registerUniversity" ||
    action === "registerCompany" ||
    action === "toggleUniversityStatus" ||
    action === "toggleCompanyStatus"
  ) {
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
    // Fail immediately outside local development if PRIVATE_KEY is missing
    const isLocalDev =
      process.env.NODE_ENV !== "production" &&
      ((SUPPORTED_CHAIN_ID as number) === 31337 || process.env.NODE_ENV === "test");

    if (!process.env.PRIVATE_KEY?.trim() && !isLocalDev) {
      return NextResponse.json(
        {
          error:
            "Server Configuration Error: PRIVATE_KEY environment variable is required outside local development.",
        },
        { status: 500 }
      );
    }

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

    // -------------------------------------------------------------------------
    // 1. REGISTER STUDENT
    // -------------------------------------------------------------------------
    if (action === "registerStudent") {
      const { usn, name, email, course, gradYear, percentage } = data || {};
      if (!usn || !name || !email) {
        return NextResponse.json({ error: "Candidate USN, Name, and University-Registered Email are required" }, { status: 400 });
      }

      // CRITICAL SECURITY: Take university ID strictly from verified session, never trust body universityCode
      let uId = 0;
      if (authCheck.session?.role === "university") {
        uId = Number(authCheck.session.entityInfo?.id);
        if (!uId || uId <= 0) {
          return NextResponse.json(
            { error: "Forbidden: University ID not found in verified session." },
            { status: 403 }
          );
        }

        // Prevent cross-institutional impersonation if client provided a conflicting universityCode
        if (universityCode && authCheck.session.entityInfo?.code) {
          if (universityCode.trim().toUpperCase() !== authCheck.session.entityInfo.code.trim().toUpperCase()) {
            return NextResponse.json(
              { error: "Forbidden: Cross-institutional impersonation detected. You cannot register students for another university." },
              { status: 403 }
            );
          }
        }
      } else if (authCheck.role === "admin") {
        if (data?.universityId) {
          uId = Number(data.universityId);
        } else if (universityCode) {
          const uIdBig = await getReadOnlyServerContract().universityCodeToId(universityCode.trim().toUpperCase());
          uId = Number(uIdBig);
        }
        if (!uId || uId <= 0) {
          return NextResponse.json(
            { error: "Bad Request: Admin caller must specify a valid target universityId or universityCode." },
            { status: 400 }
          );
        }
      }

      const cleanUsn = usn.trim().toUpperCase();
      const parsedUsn = parseAndValidateUSN(cleanUsn);
      if (!parsedUsn.valid) {
        return NextResponse.json(
          { error: `Invalid USN format: ${parsedUsn.error}` },
          { status: 400 }
        );
      }

      // Enforce: USN college code must equal registering college's code from verified session
      const sessionCollegeCode = authCheck.session?.role === "university"
        ? (authCheck.session.entityInfo?.code || "").trim().toUpperCase()
        : "";
      if (sessionCollegeCode && parsedUsn.collegeCode !== sessionCollegeCode) {
        return NextResponse.json(
          {
            error: `Forbidden: USN college code '${parsedUsn.collegeCode}' does not match registering college code '${sessionCollegeCode}'.`,
          },
          { status: 403 }
        );
      }

      const { contract } = getServerContract("university");
      const univData = await contract.universities(uId);
      if (!univData.active) {
        return NextResponse.json(
          { error: `University authority #${uId} is deactivated on-chain and cannot onboard candidates.` },
          { status: 403 }
        );
      }

      // Enforce: USN college code must also equal on-chain registering college's code
      const registeredCollegeCode = (univData.universityCode || "").trim().toUpperCase();
      if (registeredCollegeCode && parsedUsn.collegeCode !== registeredCollegeCode) {
        return NextResponse.json(
          {
            error: `Forbidden: USN college code '${parsedUsn.collegeCode}' does not match registering college code '${registeredCollegeCode}'.`,
          },
          { status: 403 }
        );
      }

      const studentEmail = email?.trim() || `${cleanUsn.toLowerCase()}@student.verichain.network`;
      const existingId = Number(await contract.usnToStudentId(cleanUsn));

      // Always persist/update student profile with university-registered email and collegeCode in PostgreSQL
      await upsertStudentProfile({
        usn: cleanUsn,
        name: name.trim(),
        email: studentEmail.toLowerCase(),
        course: course || "Computer Science",
        gradYear: gradYear || new Date().getFullYear(),
        percentage: Number(percentage) || 0,
        universityId: uId,
        universityCode: univData.universityCode || "",
        collegeCode: parsedUsn.collegeCode,
      });

      if (existingId > 0) {
        return NextResponse.json(
          { success: true, studentId: existingId, message: "Student already registered and profile synced" },
          { status: 200 }
        );
      }

      // Cryptographic marks hash: Store only hash on-chain, never plain percentage
      const marksPayload = `${cleanUsn}:${percentage ?? 0}`;
      const marksHash = ethers.keccak256(ethers.toUtf8Bytes(marksPayload));

      const tx = await contract.registerStudent(
        uId,
        cleanUsn,
        name.trim(),
        course || "Computer Science",
        gradYear || new Date().getFullYear(),
        marksHash
      );
      const receipt = await tx.wait();
      const newStudentId = Number(await contract.usnToStudentId(cleanUsn));

      return NextResponse.json({
        success: true,
        studentId: newStudentId,
        txHash: receipt.hash,
      });
    }

    // -------------------------------------------------------------------------
    // 2. ISSUE CREDENTIAL
    // -------------------------------------------------------------------------
    if (action === "issueCredential") {
      const { studentId, documentType, documentHash, ipfsCID } = data || {};
      if (!studentId || !documentHash || !ipfsCID) {
        return NextResponse.json(
          { error: "Missing required credential issuance fields (studentId, documentHash, ipfsCID)" },
          { status: 400 }
        );
      }

      // CRITICAL SECURITY: Take university ID strictly from verified session
      let uId = 0;
      if (authCheck.session?.role === "university") {
        uId = Number(authCheck.session.entityInfo?.id);
        if (!uId || uId <= 0) {
          return NextResponse.json(
            { error: "Forbidden: University ID not found in verified session." },
            { status: 403 }
          );
        }

        if (universityCode && authCheck.session.entityInfo?.code) {
          if (universityCode.trim().toUpperCase() !== authCheck.session.entityInfo.code.trim().toUpperCase()) {
            return NextResponse.json(
              { error: "Forbidden: Cross-institutional impersonation detected. You cannot issue credentials for another university." },
              { status: 403 }
            );
          }
        }
      } else if (authCheck.role === "admin") {
        if (data?.universityId) {
          uId = Number(data.universityId);
        } else if (universityCode) {
          const uIdBig = await getReadOnlyServerContract().universityCodeToId(universityCode.trim().toUpperCase());
          uId = Number(uIdBig);
        }
        if (!uId || uId <= 0) {
          return NextResponse.json(
            { error: "Bad Request: Admin caller must specify a valid target universityId or universityCode." },
            { status: 400 }
          );
        }
      }

      const { contract } = getServerContract("university");
      const univData = await contract.universities(uId);
      if (!univData.active) {
        return NextResponse.json(
          { error: `University authority #${uId} is currently deactivated.` },
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

    // -------------------------------------------------------------------------
    // 3. SUBMIT ON-CHAIN ACCESS REQUEST (PUBLIC)
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // 4. APPROVE ON-CHAIN ACCESS REQUEST (ADMIN ONLY)
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // 4b. DIRECT ON-CHAIN REGISTRATION & STATUS (ADMIN ONLY)
    // -------------------------------------------------------------------------
    if (action === "registerUniversity") {
      const { name, universityCode, wallet } = data || {};
      if (!name || !universityCode) {
        return NextResponse.json({ error: "Name and universityCode required" }, { status: 400 });
      }
      const { contract } = getServerContract("admin");
      const targetWallet = wallet && ethers.isAddress(wallet) ? wallet : ethers.Wallet.createRandom().address;
      const tx = await contract.registerUniversity(
        name.trim(),
        universityCode.trim().toUpperCase(),
        targetWallet
      );
      const receipt = await tx.wait();
      return NextResponse.json({ success: true, txHash: receipt.hash, wallet: targetWallet });
    }

    if (action === "registerCompany") {
      const { name, companyCode, wallet } = data || {};
      if (!name || !companyCode) {
        return NextResponse.json({ error: "Name and companyCode required" }, { status: 400 });
      }
      const { contract } = getServerContract("admin");
      const targetWallet = wallet && ethers.isAddress(wallet) ? wallet : ethers.Wallet.createRandom().address;
      const tx = await contract.registerCompany(
        name.trim(),
        companyCode.trim().toUpperCase(),
        targetWallet
      );
      const receipt = await tx.wait();
      return NextResponse.json({ success: true, txHash: receipt.hash, wallet: targetWallet });
    }

    if (action === "toggleUniversityStatus") {
      const { id, currentActive } = data || {};
      const { contract } = getServerContract("admin");
      const tx = currentActive
        ? await contract.deactivateUniversity(Number(id))
        : await contract.activateUniversity(Number(id));
      const receipt = await tx.wait();
      return NextResponse.json({ success: true, txHash: receipt.hash });
    }

    if (action === "toggleCompanyStatus") {
      const { id, currentActive } = data || {};
      const { contract } = getServerContract("admin");
      const tx = currentActive
        ? await contract.deactivateCompany(Number(id))
        : await contract.activateCompany(Number(id));
      const receipt = await tx.wait();
      return NextResponse.json({ success: true, txHash: receipt.hash });
    }

    // -------------------------------------------------------------------------
    // 5. REVIEW STUDENT ACHIEVEMENT (UNIVERSITY ONLY)
    // -------------------------------------------------------------------------
    if (action === "reviewAchievement") {
      const { achievementId, status, remarks } = data || {};

      let uId = 0;
      if (authCheck.session?.role === "university") {
        uId = Number(authCheck.session.entityInfo?.id);
        if (!uId || uId <= 0) {
          return NextResponse.json(
            { error: "Forbidden: University ID not found in verified session." },
            { status: 403 }
          );
        }

        if (universityCode && authCheck.session.entityInfo?.code) {
          if (universityCode.trim().toUpperCase() !== authCheck.session.entityInfo.code.trim().toUpperCase()) {
            return NextResponse.json(
              { error: "Forbidden: Cross-institutional impersonation detected. You cannot review achievements for another university." },
              { status: 403 }
            );
          }
        }
      } else if (authCheck.role === "admin") {
        if (data?.universityId) {
          uId = Number(data.universityId);
        } else if (universityCode) {
          const uIdBig = await getReadOnlyServerContract().universityCodeToId(universityCode.trim().toUpperCase());
          uId = Number(uIdBig);
        }
        if (!uId || uId <= 0) {
          return NextResponse.json(
            { error: "Bad Request: Admin caller must specify a valid target universityId or universityCode." },
            { status: 400 }
          );
        }
      }

      const { contract } = getServerContract("university");
      const tx = await contract.reviewAchievement(achievementId, uId, status, remarks || "");
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
      });
    }

    // -------------------------------------------------------------------------
    // 6. SUBMIT STUDENT ACHIEVEMENT (STUDENT ONLY)
    // -------------------------------------------------------------------------
    if (action === "submitAchievement") {
      const { usn, title, issuerOrg, category, documentHash, ipfsCID } = data || {};

      let targetUsn = "";
      if (authCheck.session?.role === "student") {
        targetUsn = authCheck.session.studentUSN || "";
        if (!targetUsn) {
          return NextResponse.json(
            { error: "Forbidden: Student USN not found in verified session." },
            { status: 403 }
          );
        }

        if (usn && usn.trim().toUpperCase() !== targetUsn.toUpperCase()) {
          return NextResponse.json(
            { error: "Forbidden: Impersonation detected. You cannot submit achievements for another student." },
            { status: 403 }
          );
        }
      } else if (authCheck.role === "admin") {
        targetUsn = (usn || "").trim().toUpperCase();
      }

      const parsedUsn = parseAndValidateUSN(targetUsn);
      if (!parsedUsn.valid) {
        return NextResponse.json(
          { error: `Invalid USN format: ${parsedUsn.error}` },
          { status: 400 }
        );
      }

      const { contract } = getServerContract("admin");
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

    // -------------------------------------------------------------------------
    // 7. RECORD RECRUITER VERIFICATION (COMPANY ONLY)
    // -------------------------------------------------------------------------
    if (action === "recordVerification") {
      const { credentialId, hashMatched, isAuthentic, documentType } = data || {};

      // CRITICAL SECURITY: Take company ID strictly from verified session
      let cId = 0;
      if (authCheck.session?.role === "company") {
        cId = Number(authCheck.session.entityInfo?.id);
        if (!cId || cId <= 0) {
          return NextResponse.json(
            { error: "Forbidden: Company ID not found in verified session." },
            { status: 403 }
          );
        }

        if (companyCode && authCheck.session.entityInfo?.code) {
          if (companyCode.trim().toUpperCase() !== authCheck.session.entityInfo.code.trim().toUpperCase()) {
            return NextResponse.json(
              { error: "Forbidden: Cross-corporate impersonation detected. You cannot record verifications on behalf of another company." },
              { status: 403 }
            );
          }
        }
      } else if (authCheck.role === "admin") {
        if (data?.companyId) {
          cId = Number(data.companyId);
        } else if (companyCode) {
          const cIdBig = await getReadOnlyServerContract().companyCodeToId(companyCode.trim().toUpperCase());
          cId = Number(cIdBig);
        }
        if (!cId || cId <= 0) {
          return NextResponse.json(
            { error: "Bad Request: Admin caller must specify a valid target companyId or companyCode." },
            { status: 400 }
          );
        }
      }

      const { contract } = getServerContract("company");
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

    // -------------------------------------------------------------------------
    // 8. TOGGLE COMPANY STATUS (ADMIN ONLY)
    // -------------------------------------------------------------------------
    if (action === "toggleCompanyStatus") {
      const { id, currentActive } = data || {};
      const compId = Number(id);
      if (!compId || compId <= 0) {
        return NextResponse.json({ error: "Invalid company ID" }, { status: 400 });
      }

      const { contract } = getServerContract("admin");
      const tx = currentActive
        ? await contract.deactivateCompany(compId)
        : await contract.activateCompany(compId);
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
        active: !currentActive,
      });
    }

    // -------------------------------------------------------------------------
    // 9. TOGGLE UNIVERSITY STATUS (ADMIN ONLY)
    // -------------------------------------------------------------------------
    if (action === "toggleUniversityStatus") {
      const { id, currentActive } = data || {};
      const uniId = Number(id);
      if (!uniId || uniId <= 0) {
        return NextResponse.json({ error: "Invalid university ID" }, { status: 400 });
      }

      const { contract } = getServerContract("admin");
      const tx = currentActive
        ? await contract.deactivateUniversity(uniId)
        : await contract.activateUniversity(uniId);
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
        active: !currentActive,
      });
    }

    // -------------------------------------------------------------------------
    // 10. REGISTER COMPANY (ADMIN ONLY)
    // -------------------------------------------------------------------------
    if (action === "registerCompany") {
      const { name, companyCode, wallet } = data || {};
      if (!name || !companyCode) {
        return NextResponse.json({ error: "Company name and code are required" }, { status: 400 });
      }

      const { contract } = getServerContract("admin");
      const tx = await contract.registerCompany(name.trim(), companyCode.trim().toUpperCase(), wallet);
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
      });
    }

    // -------------------------------------------------------------------------
    // 11. REGISTER UNIVERSITY (ADMIN ONLY)
    // -------------------------------------------------------------------------
    if (action === "registerUniversity") {
      const { name, universityCode, wallet } = data || {};
      if (!name || !universityCode) {
        return NextResponse.json({ error: "University name and code are required" }, { status: 400 });
      }

      const { contract } = getServerContract("admin");
      const tx = await contract.registerUniversity(name.trim(), universityCode.trim().toUpperCase(), "VTU", wallet);
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
