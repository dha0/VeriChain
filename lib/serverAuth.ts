import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";
import { ethers } from "ethers";
import crypto from "crypto";
import { UserRole } from "@/types";
import { prisma } from "@/lib/prisma";

/**
 * Returns the JWT secret from environment variables.
 * Enforces NO DEFAULT fallback strings and a minimum 32-character length.
 */
export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "Server Configuration Error: Mandatory environment variable JWT_SECRET is missing. No default secret permitted."
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "Security Configuration Error: JWT_SECRET must be at least 32 characters in length for cryptographic security."
    );
  }
  return new TextEncoder().encode(secret);
}

export const SESSION_COOKIE_NAME = "verichain_session";

export interface SessionPayload {
  role: UserRole;
  account: string | null;
  studentUSN: string | null;
  entityInfo: {
    id?: number;
    name?: string;
    code?: string;
    wallet?: string;
    course?: string;
    gradYear?: number;
    percentage?: number;
  } | null;
}

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const WINDOW_DURATION_MS = 15 * 60 * 1000;

// ----------------------------------------------------
// 1. Distributed Rate Limiting & Account Lockout Engine (Prisma)
// ----------------------------------------------------
export async function checkRateLimit(key: string): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  lockoutRemainingSeconds?: number;
}> {
  const now = new Date();
  const record = await prisma.rateLimitCounter.findUnique({
    where: { key },
  });

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  // Active lockout check
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      lockoutRemainingSeconds: remainingSeconds,
    };
  }

  // Window expired -> reset
  if (now.getTime() - record.firstAttemptAt.getTime() > WINDOW_DURATION_MS) {
    await prisma.rateLimitCounter.delete({ where: { key } }).catch(() => {});
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  return {
    allowed: record.count < MAX_FAILED_ATTEMPTS,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - record.count),
  };
}

export async function recordFailedAttempt(key: string): Promise<{
  locked: boolean;
  remainingAttempts: number;
  lockoutRemainingSeconds?: number;
}> {
  const now = new Date();
  let record = await prisma.rateLimitCounter.findUnique({
    where: { key },
  });

  if (!record || now.getTime() - record.firstAttemptAt.getTime() > WINDOW_DURATION_MS) {
    record = await prisma.rateLimitCounter.upsert({
      where: { key },
      update: {
        count: 1,
        firstAttemptAt: now,
        lockedUntil: null,
      },
      create: {
        key,
        count: 1,
        firstAttemptAt: now,
        lockedUntil: null,
      },
    });
  } else {
    record = await prisma.rateLimitCounter.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
  }

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
    await prisma.rateLimitCounter.update({
      where: { key },
      data: { lockedUntil },
    });
    return {
      locked: true,
      remainingAttempts: 0,
      lockoutRemainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
    };
  }

  return {
    locked: false,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - record.count),
  };
}

export async function resetFailedAttempts(key: string): Promise<void> {
  await prisma.rateLimitCounter.deleteMany({ where: { key } }).catch(() => {});
}

// ----------------------------------------------------
// 2. SIWE-Style Nonce & Signature Verification (Prisma)
// ----------------------------------------------------
export async function generateAuthNonce(wallet: string): Promise<string> {
  const cleanWallet = wallet.trim().toLowerCase();
  const nonce = `verichain_${ethers.hexlify(ethers.randomBytes(16)).slice(2)}`;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL

  // Delete expired nonces for this wallet
  await prisma.authNonce.deleteMany({
    where: { wallet: cleanWallet },
  }).catch(() => {});

  await prisma.authNonce.create({
    data: {
      wallet: cleanWallet,
      nonce,
      expiresAt,
      used: false,
    },
  });

  return nonce;
}

export async function verifyWalletSignature(
  wallet: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const cleanWallet = wallet.trim().toLowerCase();
    const nonceRecord = await prisma.authNonce.findFirst({
      where: {
        wallet: cleanWallet,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!nonceRecord) {
      return false;
    }

    if (!message.includes(nonceRecord.nonce)) {
      return false;
    }

    const recoveredAddress = ethers.verifyMessage(message, signature);
    const isValid = recoveredAddress.trim().toLowerCase() === cleanWallet;

    if (isValid) {
      // Mark as used immediately to eliminate replay attacks
      await prisma.authNonce.update({
        where: { id: nonceRecord.id },
        data: { used: true },
      }).catch(() => {});
    }

    return isValid;
  } catch (err) {
    console.error("[verifyWalletSignature error]", err);
    return false;
  }
}

// ----------------------------------------------------
// 3. Student Registered Profile & Email Management (Prisma)
// ----------------------------------------------------
export async function getStudentRegisteredEmail(usn: string): Promise<string | null> {
  const cleanUsn = usn.trim().toUpperCase();
  const profile = await prisma.studentProfile.findUnique({
    where: { usn: cleanUsn },
  });
  return profile ? profile.email : null;
}

export async function upsertStudentProfile(data: {
  usn: string;
  name: string;
  email: string;
  course?: string;
  gradYear?: number;
  percentage?: number;
  universityId: number;
  universityCode?: string;
  collegeCode?: string;
}): Promise<void> {
  const cleanUsn = data.usn.trim().toUpperCase();
  const cleanEmail = data.email.trim().toLowerCase();

  await prisma.studentProfile.upsert({
    where: { usn: cleanUsn },
    update: {
      name: data.name.trim(),
      email: cleanEmail,
      course: data.course || "Computer Science",
      gradYear: data.gradYear || new Date().getFullYear(),
      percentage: data.percentage ?? 0,
      universityId: data.universityId,
      universityCode: data.universityCode,
      collegeCode: data.collegeCode,
    },
    create: {
      usn: cleanUsn,
      name: data.name.trim(),
      email: cleanEmail,
      course: data.course || "Computer Science",
      gradYear: data.gradYear || new Date().getFullYear(),
      percentage: data.percentage ?? 0,
      universityId: data.universityId,
      universityCode: data.universityCode,
      collegeCode: data.collegeCode,
    },
  });
}

// ----------------------------------------------------
// 4. Student Email OTP Engine with Attempt Tracking (Prisma)
// ----------------------------------------------------
export function hashOtp(otp: string): string {
  const secret = process.env.OTP_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      "Server configuration error: OTP_SECRET environment variable is missing. A secure server secret is required for HMAC."
    );
  }
  return crypto.createHmac("sha256", secret.trim()).update(otp).digest("hex");
}

export async function generateStudentOTP(usn: string): Promise<{ otp: string; expiresAt: number }> {
  const cleanUsn = usn.trim().toUpperCase();
  const otp = crypto.randomInt(100000, 1000000).toString();
  const hashedCode = hashOtp(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL

  await prisma.studentOTP.upsert({
    where: { usn: cleanUsn },
    update: {
      code: hashedCode,
      expiresAt,
      failedAttempts: 0,
    },
    create: {
      usn: cleanUsn,
      code: hashedCode,
      expiresAt,
      failedAttempts: 0,
    },
  });

  return { otp, expiresAt: expiresAt.getTime() };
}

export async function verifyStudentOTP(
  usn: string,
  providedOtp: string
): Promise<{
  valid: boolean;
  error?: string;
  remainingAttempts?: number;
  invalidated?: boolean;
}> {
  const cleanUsn = usn.trim().toUpperCase();
  const now = new Date();
  const record = await prisma.studentOTP.findUnique({
    where: { usn: cleanUsn },
  });

  if (!record || record.expiresAt < now) {
    if (record) {
      await prisma.studentOTP.delete({ where: { usn: cleanUsn } }).catch(() => {});
    }
    return {
      valid: false,
      error: "OTP has expired or does not exist. Please request a new verification code.",
    };
  }

  const providedHash = hashOtp(providedOtp.trim());
  const isMatch =
    record.code.length === providedHash.length
      ? crypto.timingSafeEqual(Buffer.from(record.code), Buffer.from(providedHash))
      : false;

  if (!isMatch) {
    const updated = await prisma.studentOTP.update({
      where: { usn: cleanUsn },
      data: { failedAttempts: { increment: 1 } },
    });

    const remaining = Math.max(0, 5 - updated.failedAttempts);

    if (updated.failedAttempts >= 5) {
      await prisma.studentOTP.delete({ where: { usn: cleanUsn } }).catch(() => {});
      return {
        valid: false,
        error: "Maximum failed attempts exceeded (5/5). This OTP has been invalidated for security. Please request a new verification code.",
        remainingAttempts: 0,
        invalidated: true,
      };
    }

    return {
      valid: false,
      error: `Invalid 6-digit OTP. ${remaining} attempts remaining before code is invalidated.`,
      remainingAttempts: remaining,
      invalidated: false,
    };
  }

  // Consume OTP single-use on successful verification
  await prisma.studentOTP.delete({ where: { usn: cleanUsn } }).catch(() => {});
  return { valid: true };
}

// ----------------------------------------------------
// 5. Signed httpOnly JWT Session Token Management
// ----------------------------------------------------
export async function createSessionJWT(payload: SessionPayload): Promise<string> {
  const secretKey = getJwtSecret();
  return await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .setIssuer("verichain-protocol")
    .sign(secretKey);
}

export async function verifySessionJWT(token: string): Promise<SessionPayload | null> {
  try {
    const secretKey = getJwtSecret();
    const { payload } = await jose.jwtVerify(token, secretKey, {
      issuer: "verichain-protocol",
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getServerSession(req: NextRequest): Promise<SessionPayload | null> {
  // 1. Check httpOnly cookie
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    const session = await verifySessionJWT(cookie);
    if (session) return session;
  }

  // 2. Check Authorization Bearer header
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const session = await verifySessionJWT(token);
    if (session) return session;
  }

  return null;
}

export function setSessionCookie(res: NextResponse, token: string) {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 86400, // 24 hours
  });
}

export function clearSessionCookie(res: NextResponse) {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
