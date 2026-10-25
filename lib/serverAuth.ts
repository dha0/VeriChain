import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";
import { ethers } from "ethers";
import { UserRole } from "@/types";

/**
 * Returns the JWT secret from environment variables.
 * Enforces NO DEFAULT fallback strings.
 */
export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "Server Configuration Error: Mandatory environment variable JWT_SECRET is missing. No default secret permitted."
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

// ----------------------------------------------------
// 1. Rate Limiting & Account Lockout Engine
// ----------------------------------------------------
interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

interface OTPRecord {
  code: string;
  usn: string;
  expiresAt: number;
}

// In-memory state across warm serverless requests
declare global {
  var __authRateLimitMap: Map<string, AttemptRecord> | undefined;
  var __authNonceMap: Map<string, { nonce: string; expiresAt: number }> | undefined;
  var __studentOTPStore: Map<string, OTPRecord> | undefined;
}

const rateLimitMap: Map<string, AttemptRecord> =
  global.__authRateLimitMap || (global.__authRateLimitMap = new Map());

const nonceMap: Map<string, { nonce: string; expiresAt: number }> =
  global.__authNonceMap || (global.__authNonceMap = new Map());

const otpStore: Map<string, OTPRecord> =
  global.__studentOTPStore || (global.__studentOTPStore = new Map());

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const WINDOW_DURATION_MS = 15 * 60 * 1000;

export function checkRateLimit(key: string): {
  allowed: boolean;
  remainingAttempts: number;
  lockoutRemainingSeconds?: number;
} {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  // Active lockout check
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      lockoutRemainingSeconds: remainingSeconds,
    };
  }

  // Window expired -> reset
  if (now - record.firstAttemptAt > WINDOW_DURATION_MS) {
    rateLimitMap.delete(key);
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  return {
    allowed: record.count < MAX_FAILED_ATTEMPTS,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - record.count),
  };
}

export function recordFailedAttempt(key: string): {
  locked: boolean;
  remainingAttempts: number;
  lockoutRemainingSeconds?: number;
} {
  const now = Date.now();
  let record = rateLimitMap.get(key);

  if (!record || now - record.firstAttemptAt > WINDOW_DURATION_MS) {
    record = { count: 1, firstAttemptAt: now, lockedUntil: null };
  } else {
    record.count += 1;
  }

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    rateLimitMap.set(key, record);
    return {
      locked: true,
      remainingAttempts: 0,
      lockoutRemainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
    };
  }

  rateLimitMap.set(key, record);
  return {
    locked: false,
    remainingAttempts: MAX_FAILED_ATTEMPTS - record.count,
  };
}

export function resetFailedAttempts(key: string) {
  rateLimitMap.delete(key);
}

// ----------------------------------------------------
// 2. SIWE-Style Nonce & Signature Verification
// ----------------------------------------------------
export function generateAuthNonce(wallet: string): string {
  const cleanWallet = wallet.trim().toLowerCase();
  const nonce = `verichain_${ethers.hexlify(ethers.randomBytes(16)).slice(2)}`;
  nonceMap.set(cleanWallet, {
    nonce,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
  });
  return nonce;
}

export function verifyWalletSignature(
  wallet: string,
  message: string,
  signature: string
): boolean {
  try {
    const cleanWallet = wallet.trim().toLowerCase();
    const nonceRecord = nonceMap.get(cleanWallet);

    // Nonce must exist and not be expired
    if (!nonceRecord || nonceRecord.expiresAt < Date.now()) {
      return false;
    }

    // Challenge message must include the exact issued nonce
    if (!message.includes(nonceRecord.nonce)) {
      return false;
    }

    const recoveredAddress = ethers.verifyMessage(message, signature);
    const isValid = recoveredAddress.trim().toLowerCase() === cleanWallet;

    if (isValid) {
      // Consume nonce immediately so it cannot be replayed
      nonceMap.delete(cleanWallet);
    }
    return isValid;
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// 3. Student Email OTP Engine
// ----------------------------------------------------
export function generateStudentOTP(usn: string): { otp: string; expiresAt: number } {
  const cleanUsn = usn.trim().toUpperCase();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min TTL
  otpStore.set(cleanUsn, { code: otp, usn: cleanUsn, expiresAt });
  return { otp, expiresAt };
}

export function verifyStudentOTP(usn: string, providedOtp: string): boolean {
  const cleanUsn = usn.trim().toUpperCase();
  const record = otpStore.get(cleanUsn);
  if (!record || record.expiresAt < Date.now()) {
    return false;
  }
  const isMatch = record.code === providedOtp.trim();
  if (isMatch) {
    otpStore.delete(cleanUsn); // consume OTP single-use
  }
  return isMatch;
}

// ----------------------------------------------------
// 4. Signed httpOnly JWT Session Token Management
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
