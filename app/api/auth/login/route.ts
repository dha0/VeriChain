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
          message: `6-digit security OTP sent to student's registered email (${recipientEmail}).`,
          devOTP: isDev ? generatedOtp : undefined,
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
        const u = await contract.getUniversity(verifiedRecord.entityId);
        if (!u.active) {
          return NextResponse.json(
            { error: `University authority "${verifiedRecord.name}" is currently suspended on-chain.` },
            { status: 403 }
          );
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
            id: verifiedRecord.entityId,
            name: verifiedRecord.name,
            code: verifiedRecord.codeIdentifier,
            wallet: verifiedRecord.wallet,
          },
        };
      } else {
        const c = await contract.getCompany(verifiedRecord.entityId);
        if (!c.active) {
          return NextResponse.json(
            { error: `Corporate partner "${verifiedRecord.name}" is currently suspended on-chain.` },
            { status: 403 }
          );
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
            id: verifiedRecord.entityId,
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
        const adminAddr = (await contract.admin()).toLowerCase();
        if (adminAddr === cleanWallet && adminAddr !== "0x0000000000000000000000000000000000000000") {
          sessionPayload = {
            role: "admin",
            account: wallet,
            studentUSN: null,
            entityInfo: {
              name: "System Platform Admin",
              wallet: wallet,
            },
          };
        }
      } catch {}

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
    // 4. CANDIDATE STUDENT LOGIN (Requires Email OTP OR Linked Wallet SIWE)
    // -------------------------------------------------------------------------
    else if (loginType === "student") {
      if (!usn) {
        return NextResponse.json({ error: "Candidate USN is required." }, { status: 400 });
      }

      const cleanUSN = usn.trim().toUpperCase();

      // Path A: Authenticate with 6-Digit Email OTP
      if (otp) {
        const otpResult = await verifyStudentOTP(cleanUSN, otp);
        if (!otpResult.valid) {
          const attempt = await recordFailedAttempt(rateLimitKey);
          return NextResponse.json(
            {
              error: otpResult.error || "Invalid or expired OTP.",
              remainingAttempts: otpResult.remainingAttempts ?? attempt.remainingAttempts,
              invalidated: otpResult.invalidated,
            },
            { status: 401 }
          );
        }
      }
      // Path B: Authenticate with Web3 Wallet SIWE Signature (Enforce Verified Linkage)
      else if (wallet && message && signature) {
        const linkedWallet = await getStudentLinkedWallet(cleanUSN);

        if (!linkedWallet) {
          return NextResponse.json(
            {
              error: `No Web3 wallet has been linked to student USN "${cleanUSN}" yet. Please sign in with Email OTP first to link your wallet.`,
              requiresOtpLink: true,
            },
            { status: 401 }
          );
        }

        if (linkedWallet.toLowerCase() !== wallet.trim().toLowerCase()) {
          const attempt = await recordFailedAttempt(rateLimitKey);
          return NextResponse.json(
            {
              error: `Unauthorized: Wallet (${wallet.slice(0, 6)}...${wallet.slice(-4)}) is not linked to USN ${cleanUSN}. Access denied.`,
              remainingAttempts: attempt.remainingAttempts,
            },
            { status: 401 }
          );
        }

        const isSigValid = await verifyWalletSignature(wallet, message, signature);
        if (!isSigValid) {
          const attempt = await recordFailedAttempt(rateLimitKey);
          return NextResponse.json(
            {
              error: "Invalid cryptographic wallet signature.",
              remainingAttempts: attempt.remainingAttempts,
            },
            { status: 401 }
          );
        }
      } else {
        return NextResponse.json(
          {
            error:
              "Unauthorized: Student login requires a 6-digit Email OTP or verified Web3 wallet signature. USN alone is strictly prohibited.",
          },
          { status: 401 }
        );
      }

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

        const linkedWalletAddr = await getStudentLinkedWallet(cleanUSN);
        sessionPayload = {
          role: "student",
          account: wallet || linkedWalletAddr || null,
          studentUSN: cleanUSN,
          entityInfo: {
            id: Number(s.id),
            name: s.name,
            code: cleanUSN,
            course: s.course,
            gradYear: Number(s.graduationYear),
            percentage: Number(s.percentage),
            wallet: wallet || linkedWalletAddr || undefined,
          },
        };
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
