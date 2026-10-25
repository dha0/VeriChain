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
} from "@/lib/serverAuth";
import { verifyEntityAccessCode } from "@/lib/accessCodeStore";
import { getReadOnlyServerContract } from "@/lib/serverContract";

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
    const rateCheck = checkRateLimit(rateLimitKey);

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
    // 0. STUDENT OTP REQUEST (Generate & Dispatch 6-digit OTP)
    // -------------------------------------------------------------------------
    if (loginType === "student_request_otp") {
      if (!usn) {
        return NextResponse.json({ error: "Candidate USN is required." }, { status: 400 });
      }

      const cleanUSN = usn.trim().toUpperCase();
      try {
        const s = await contract.getStudentByUSN(cleanUSN);
        if (!s || !s.exists) {
          const attempt = recordFailedAttempt(rateLimitKey);
          return NextResponse.json(
            {
              error: `Student USN "${cleanUSN}" was not found on the blockchain registry.`,
              remainingAttempts: attempt.remainingAttempts,
            },
            { status: 404 }
          );
        }

        const { otp: generatedOtp } = generateStudentOTP(cleanUSN);
        console.log(
          `[AUTH OTP DISPATCH] Verification code for student ${cleanUSN} (${s.name}): ${generatedOtp}`
        );

        return NextResponse.json({
          success: true,
          message: `6-digit security OTP sent to student's registered institutional email for ${cleanUSN}.`,
          devOTP: process.env.NODE_ENV !== "production" ? generatedOtp : undefined,
        });
      } catch (err: any) {
        const attempt = recordFailedAttempt(rateLimitKey);
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
    // 1. INSTITUTIONAL ACCESS CODE LOGIN (University / Company)
    // -------------------------------------------------------------------------
    else if (loginType === "code") {
      if (!codeIdentifier && !accessCode) {
        return NextResponse.json(
          { error: "Institutional Identifier or Secret Access Passkey is required." },
          { status: 400 }
        );
      }

      const verifiedRecord = verifyEntityAccessCode(
        entityType || "university",
        codeIdentifier || "",
        accessCode || ""
      );

      if (!verifiedRecord) {
        const attempt = recordFailedAttempt(rateLimitKey);
        return NextResponse.json(
          {
            error: `Invalid access credentials. ${attempt.remainingAttempts} attempts remaining before temporary lockout.`,
            remainingAttempts: attempt.remainingAttempts,
          },
          { status: 401 }
        );
      }

      // Check on-chain active status
      if (entityType === "university") {
        const u = await contract.getUniversity(verifiedRecord.entityId);
        if (!u.active) {
          return NextResponse.json(
            { error: `University authority "${verifiedRecord.name}" is currently suspended on-chain.` },
            { status: 403 }
          );
        }

        // SIWE wallet verification if wallet signature is attached
        if (signature && message && wallet) {
          if (!verifyWalletSignature(wallet, message, signature)) {
            const attempt = recordFailedAttempt(rateLimitKey);
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
          if (!verifyWalletSignature(wallet, message, signature)) {
            const attempt = recordFailedAttempt(rateLimitKey);
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
    // 2. SIWE CRYPTOGRAPHIC WALLET LOGIN (MetaMask)
    // -------------------------------------------------------------------------
    else if (loginType === "wallet") {
      if (!wallet || !message || !signature) {
        return NextResponse.json(
          { error: "Wallet address, SIWE challenge message, and signature are required." },
          { status: 400 }
        );
      }

      const isValidSig = verifyWalletSignature(wallet, message, signature);
      if (!isValidSig) {
        const attempt = recordFailedAttempt(rateLimitKey);
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
        // Check University wallet mapping
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
        // Check Company wallet mapping
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
        const attempt = recordFailedAttempt(rateLimitKey);
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
    // 3. CANDIDATE STUDENT LOGIN (Requires Email OTP OR Wallet SIWE Signature)
    // -------------------------------------------------------------------------
    else if (loginType === "student") {
      if (!usn) {
        return NextResponse.json({ error: "Candidate USN is required." }, { status: 400 });
      }

      const cleanUSN = usn.trim().toUpperCase();

      // Enforce: USN alone is NOT permitted. Must have OTP or SIWE wallet signature
      if (otp) {
        const isOtpValid = verifyStudentOTP(cleanUSN, otp);
        if (!isOtpValid) {
          const attempt = recordFailedAttempt(rateLimitKey);
          return NextResponse.json(
            {
              error: "Invalid or expired 6-digit OTP. Please request a new verification code.",
              remainingAttempts: attempt.remainingAttempts,
            },
            { status: 401 }
          );
        }
      } else if (wallet && message && signature) {
        const isSigValid = verifyWalletSignature(wallet, message, signature);
        if (!isSigValid) {
          const attempt = recordFailedAttempt(rateLimitKey);
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
              "Unauthorized: Student login requires a 6-digit Email OTP or verified Web3 wallet signature. USN alone is not permitted.",
          },
          { status: 401 }
        );
      }

      try {
        const s = await contract.getStudentByUSN(cleanUSN);
        if (!s || !s.exists) {
          const attempt = recordFailedAttempt(rateLimitKey);
          return NextResponse.json(
            {
              error: `Student USN "${cleanUSN}" was not found on the blockchain registry.`,
              remainingAttempts: attempt.remainingAttempts,
            },
            { status: 404 }
          );
        }

        sessionPayload = {
          role: "student",
          account: wallet || null,
          studentUSN: cleanUSN,
          entityInfo: {
            id: Number(s.id),
            name: s.name,
            code: cleanUSN,
            course: s.course,
            gradYear: Number(s.graduationYear),
            percentage: Number(s.percentage),
          },
        };
      } catch (err: any) {
        const attempt = recordFailedAttempt(rateLimitKey);
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

    // Reset failed rate limit counter on successful authentication
    resetFailedAttempts(rateLimitKey);

    // Issue signed httpOnly JWT session cookie
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
