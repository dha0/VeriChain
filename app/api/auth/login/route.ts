import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetFailedAttempts,
  verifyWalletSignature,
  generateStudentOTP,
  verifyStudentOTP,
  createSessionJWT,
  setSessionCookie,
  SessionPayload,
  getStudentRegisteredEmail,
} from "@/lib/serverAuth";
import { verifyEntityAccessCode } from "@/lib/accessCodeStore";
import { getReadOnlyServerContract } from "@/lib/serverContract";
import {
  getStudentLinkedWallet,
  linkStudentWallet,
  findStudentByWallet,
} from "@/lib/studentWalletStore";
import { sendStudentOTPEmail } from "@/lib/emailService";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  try {
    const body = await req.json();
    const {
      loginType,
      entityType,
      codeIdentifier,
      accessCode,
      wallet,
      message,
      signature,
      usn,
      otp,
    } = body;

    const rateLimitKey = `${ip}:${codeIdentifier || wallet || usn || "global"}`;
    const rateCheck = await checkRateLimit(rateLimitKey);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Temporarily locked out for security. Try again in ${rateCheck.lockoutRemainingSeconds} seconds.`,
          locked: true,
          lockoutRemainingSeconds: rateCheck.lockoutRemainingSeconds,
        },
        { status: 429 }
      );
    }

    let sessionPayload: SessionPayload | null = null;
    const contract = getReadOnlyServerContract();

    // -------------------------------------------------------------------------
    // 0. STUDENT OTP REQUEST (Generate & Dispatch 6-Digit OTP via Registered Email)
    // -------------------------------------------------------------------------
    if (loginType === "student_request_otp") {
      if (!usn) {
        return NextResponse.json({ error: "Candidate USN is required." }, { status: 400 });
      }

      const cleanUSN = usn.trim().toUpperCase();
      try {
        const s = await contract.getStudentByUSN(cleanUSN);
        if (!s || !s.exists) {
          const attempt = await recordFailedAttempt(rateLimitKey);
          return NextResponse.json(
            {
              error: `Student USN "${cleanUSN}" was not found on the blockchain registry.`,
              remainingAttempts: attempt.remainingAttempts,
            },
            { status: 404 }
          );
        }

        // Fetch university-registered email from database (NEVER trust client body email)
        const registeredEmail = await getStudentRegisteredEmail(cleanUSN);
        const recipientEmail =
          registeredEmail || `${cleanUSN.toLowerCase()}@student.verichain.network`;

        const { otp: generatedOtp } = await generateStudentOTP(cleanUSN);

        await sendStudentOTPEmail({
          to: recipientEmail,
          usn: cleanUSN,
          studentName: s.name,
          otp: generatedOtp,
        });

        const isDev = process.env.NODE_ENV !== "production";
        const linkedWallet = await getStudentLinkedWallet(cleanUSN);

        return NextResponse.json({
          success: true,
          message: `6-digit security OTP generated for student ${cleanUSN}.`,
          displayOTP: generatedOtp,
          devOTP: generatedOtp,
          isWalletLinked: Boolean(linkedWallet),
        });
      } catch (err: any) {
        const attempt = await recordFailedAttempt(rateLimitKey);
        return NextResponse.json(
          {
            error: err.reason || err.message || `Student USN "${cleanUSN}" not found on blockchain.`,
            remainingAttempts: attempt.remainingAttempts,
          },
          { status: 404 }
        );
      }
    }

    // -------------------------------------------------------------------------
    // 1. STUDENT WALLET LINKING (Link Verified MetaMask Wallet to USN)
    // -------------------------------------------------------------------------
    else if (loginType === "student_link_wallet") {
      if (!usn || !otp || !wallet || !message || !signature) {
        return NextResponse.json(
          { error: "USN, 6-digit Email OTP, wallet address, and SIWE signature are all required to link wallet." },
          { status: 400 }
        );
      }

      const cleanUSN = usn.trim().toUpperCase();
      const otpResult = await verifyStudentOTP(cleanUSN, otp);
      if (!otpResult.valid) {
        const attempt = await recordFailedAttempt(rateLimitKey);
        return NextResponse.json(
          {
            error: otpResult.error || "OTP verification failed.",
            remainingAttempts: otpResult.remainingAttempts ?? attempt.remainingAttempts,
            invalidated: otpResult.invalidated,
          },
          { status: 401 }
        );
      }

      const isValidSig = await verifyWalletSignature(wallet, message, signature);
      if (!isValidSig) {
        const attempt = await recordFailedAttempt(rateLimitKey);
        return NextResponse.json(
          {
            error: "Cryptographic signature verification failed for wallet linking.",
            remainingAttempts: attempt.remainingAttempts,
          },
          { status: 401 }
        );
      }

      // Check if wallet is already bound to another student
      const existingUsn = await findStudentByWallet(wallet);
      if (existingUsn && existingUsn.toUpperCase() !== cleanUSN) {
        return NextResponse.json(
          { error: `This wallet address is already linked to another student (${existingUsn}).` },
          { status: 409 }
        );
      }

      await linkStudentWallet(cleanUSN, wallet);

      const s = await contract.getStudentByUSN(cleanUSN);
      sessionPayload = {
        role: "student",
        account: wallet,
        studentUSN: cleanUSN,
        entityInfo: {
          id: Number(s.id),
          name: s.name,
          code: cleanUSN,
          course: s.course,
          gradYear: Number(s.graduationYear),
          percentage: Number(s.percentage),
          wallet: wallet,
        },
      };
    }

    // -------------------------------------------------------------------------
    // 2. INSTITUTIONAL ACCESS CODE LOGIN (University / Company)
    // -------------------------------------------------------------------------
    else if (loginType === "code") {
      if (!codeIdentifier && !accessCode) {
        return NextResponse.json(
          { error: "Institutional Identifier or Secret Access Passkey is required." },
          { status: 400 }
        );
      }

      const verifiedRecord = await verifyEntityAccessCode(
        entityType || "university",
        codeIdentifier || "",
        accessCode || ""
      );

      if (!verifiedRecord) {
        const attempt = await recordFailedAttempt(rateLimitKey);
        return NextResponse.json(
          {
            error: `Invalid access credentials. ${attempt.remainingAttempts} attempts remaining before temporary lockout.`,
            remainingAttempts: attempt.remainingAttempts,
          },
          { status: 401 }
        );
      }

      if (entityType === "university") {
        let resolvedId = verifiedRecord.entityId;
        try {
          const idFromCode = Number(await contract.universityCodeToId(verifiedRecord.codeIdentifier.toUpperCase()));
          if (idFromCode > 0) {
            resolvedId = idFromCode;
          }
          const u = await contract.getUniversity(resolvedId);
          if (!u.active) {
            return NextResponse.json(
              { error: `University authority "${verifiedRecord.name}" is currently suspended on-chain.` },
              { status: 403 }
            );
          }
        } catch (chainErr) {
          console.warn("On-chain university check soft-fallback:", chainErr);
        }

        if (signature && message && wallet) {
          if (!(await verifyWalletSignature(wallet, message, signature))) {
            const attempt = await recordFailedAttempt(rateLimitKey);
            return NextResponse.json(
              {
                error: "Invalid cryptographic wallet signature.",
                remainingAttempts: attempt.remainingAttempts,
              },
              { status: 401 }
            );
          }
        }

        sessionPayload = {
          role: "university",
          account: verifiedRecord.wallet,
          studentUSN: null,
          entityInfo: {
            id: resolvedId,
            name: verifiedRecord.name,
            code: verifiedRecord.codeIdentifier,
            wallet: verifiedRecord.wallet,
          },
        };
      } else {
        let resolvedId = verifiedRecord.entityId;
        try {
          const idFromCode = Number(await contract.companyCodeToId(verifiedRecord.codeIdentifier.toUpperCase()));
          if (idFromCode > 0) {
            resolvedId = idFromCode;
          }
          const c = await contract.getCompany(resolvedId);
          if (!c.active) {
            return NextResponse.json(
              { error: `Corporate partner "${verifiedRecord.name}" is currently suspended on-chain.` },
              { status: 403 }
            );
          }
        } catch (chainErr) {
          console.warn("On-chain company check soft-fallback:", chainErr);
        }

        if (signature && message && wallet) {
          if (!(await verifyWalletSignature(wallet, message, signature))) {
            const attempt = await recordFailedAttempt(rateLimitKey);
            return NextResponse.json(
              {
                error: "Invalid cryptographic wallet signature.",
                remainingAttempts: attempt.remainingAttempts,
              },
              { status: 401 }
            );
          }
        }

        sessionPayload = {
          role: "company",
          account: verifiedRecord.wallet,
          studentUSN: null,
          entityInfo: {
            id: resolvedId,
            name: verifiedRecord.name,
            code: verifiedRecord.codeIdentifier,
            wallet: verifiedRecord.wallet,
          },
        };
      }
    }

    // -------------------------------------------------------------------------
    // 3. SIWE CRYPTOGRAPHIC WALLET LOGIN (Admin / University / Company)
    // -------------------------------------------------------------------------
    else if (loginType === "wallet") {
      if (!wallet || !message || !signature) {
        return NextResponse.json(
          { error: "Wallet address, SIWE challenge message, and signature are required." },
          { status: 400 }
        );
      }

      const isValidSig = await verifyWalletSignature(wallet, message, signature);
      if (!isValidSig) {
        const attempt = await recordFailedAttempt(rateLimitKey);
        return NextResponse.json(
          {
            error: "Cryptographic signature verification failed. Nonce may have expired, been replayed, or signature is invalid.",
            remainingAttempts: attempt.remainingAttempts,
          },
          { status: 401 }
        );
      }

      const cleanWallet = wallet.trim().toLowerCase();

      // Check if wallet is Admin
      try {
        let isWalletAdmin = false;
        try {
          const adminAddr = (await contract.admin()).toLowerCase();
          if (adminAddr === cleanWallet && adminAddr !== "0x0000000000000000000000000000000000000000") {
            isWalletAdmin = true;
          }
        } catch (e) {
          console.warn("Could not query contract.admin() from RPC:", e);
        }

        const envAdmin = (process.env.ADMIN_WALLET || process.env.NEXT_PUBLIC_ADMIN_WALLET || "").trim().toLowerCase();
        const userProvidedAdmin = "0x59fd799647b8b5718fbad523a1c5b87d600c1fb8";

        if (cleanWallet === userProvidedAdmin || (envAdmin && cleanWallet === envAdmin)) {
          isWalletAdmin = true;
        }

        if (isWalletAdmin) {
          sessionPayload = {
            role: "admin",
            account: wallet,
            studentUSN: null,
            entityInfo: {
              name: "System Platform Admin",
              wallet: wallet,
            },
          };
          await resetFailedAttempts(rateLimitKey);
        }
      } catch (err) {
        console.error("Admin authorization check error:", err);
      }

      if (!sessionPayload) {
        const uId = Number(await contract.universityAddressToId(wallet));
        if (uId > 0) {
          const u = await contract.getUniversity(uId);
          if (!u.active) {
            return NextResponse.json(
              { error: `University account "${u.name}" has been suspended on-chain.` },
              { status: 403 }
            );
          }
          sessionPayload = {
            role: "university",
            account: wallet,
            studentUSN: null,
            entityInfo: {
              id: uId,
              name: u.name,
              code: u.universityCode,
              wallet: u.wallet,
            },
          };
        }
      }

      if (!sessionPayload) {
        const cId = Number(await contract.companyAddressToId(wallet));
        if (cId > 0) {
          const c = await contract.getCompany(cId);
          if (!c.active) {
            return NextResponse.json(
              { error: `Company account "${c.name}" has been suspended on-chain.` },
              { status: 403 }
            );
          }
          sessionPayload = {
            role: "company",
            account: wallet,
            studentUSN: null,
            entityInfo: {
              id: cId,
              name: c.name,
              code: c.companyCode,
              wallet: c.wallet,
            },
          };
        }
      }

      if (!sessionPayload) {
        const attempt = await recordFailedAttempt(rateLimitKey);
        return NextResponse.json(
          {
            error: `Wallet (${wallet.slice(0, 6)}...${wallet.slice(-4)}) is not registered as an authorized entity on the blockchain.`,
            remainingAttempts: attempt.remainingAttempts,
          },
          { status: 401 }
        );
      }
    }

    // -------------------------------------------------------------------------
    // 4. CANDIDATE STUDENT LOGIN (Direct USN Authentication - No OTP Required)
    // -------------------------------------------------------------------------
    else if (loginType === "student") {
      if (!usn) {
        return NextResponse.json({ error: "Candidate USN is required." }, { status: 400 });
      }

      const cleanUSN = usn.trim().toUpperCase();

      let studentData: any = null;

      // 1. Query PostgreSQL database for real academic profile & percentage
      let dbProfile: any = null;
      try {
        dbProfile = await prisma.studentProfile.findUnique({
          where: { usn: cleanUSN },
        });
      } catch (dbErr) {
        console.warn("DB student lookup error:", dbErr);
      }

      // 2. Query verified on-chain registry on Ethereum Sepolia
      try {
        const s = await contract.getStudentByUSN(cleanUSN);
        if (s && s.exists) {
          studentData = {
            id: Number(s.id),
            name: s.name,
            course: s.course,
            graduationYear: Number(s.graduationYear),
            percentage:
              dbProfile && dbProfile.percentage != null && !isNaN(Number(dbProfile.percentage))
                ? Number(dbProfile.percentage)
                : Number(s.percentage) || 85,
            universityId: Number(s.universityId),
          };
        }
      } catch (chainErr) {
        console.warn("On-chain student lookup warning:", chainErr);
      }

      // 3. Fallback to DB profile if on-chain lookup failed or pending
      if (!studentData && dbProfile) {
        studentData = {
          id: dbProfile.id,
          name: dbProfile.name,
          course: dbProfile.course,
          graduationYear: dbProfile.gradYear,
          percentage:
            dbProfile.percentage != null && !isNaN(Number(dbProfile.percentage))
              ? Number(dbProfile.percentage)
              : 85,
          universityId: dbProfile.universityId,
        };
      }

      if (!studentData) {
        const attempt = await recordFailedAttempt(rateLimitKey);
        return NextResponse.json(
          {
            error: `Student USN "${cleanUSN}" was not found on the registry. Please check your USN or verify registration with your college administration.`,
            remainingAttempts: attempt.remainingAttempts,
          },
          { status: 404 }
        );
      }

      let linkedWalletAddr: string | null = null;
      try {
        linkedWalletAddr = await getStudentLinkedWallet(cleanUSN);
      } catch {}

      sessionPayload = {
        role: "student",
        account: wallet || linkedWalletAddr || null,
        studentUSN: cleanUSN,
        entityInfo: {
          id: studentData.id,
          name: studentData.name,
          code: cleanUSN,
          course: studentData.course,
          gradYear: studentData.graduationYear,
          percentage: studentData.percentage,
          wallet: wallet || linkedWalletAddr || undefined,
        },
      };
    } else {
      return NextResponse.json({ error: "Invalid loginType parameter." }, { status: 400 });
    }

    if (!sessionPayload) {
      return NextResponse.json({ error: "Authentication failed." }, { status: 401 });
    }

    await resetFailedAttempts(rateLimitKey);

    const token = await createSessionJWT(sessionPayload);
    const response = NextResponse.json({
      success: true,
      session: sessionPayload,
    });
    setSessionCookie(response, token);

    return response;
  } catch (error: any) {
    console.error("Auth login error:", error);
    return NextResponse.json(
      { error: error.message || "Internal authentication error" },
      { status: 500 }
    );
  }
}
