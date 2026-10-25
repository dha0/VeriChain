import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";
import { ethers } from "ethers";
import { UserRole } from "@/types";

// JWT Secret Key (derived from environment or secure deterministic fallback)
const JWT_SECRET_STRING =
  process.env.SESSION_SECRET ||
  process.env.PRIVATE_KEY ||
  "verichain-protocol-secure-jwt-secret-key-32-chars-min!";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

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

// In-memory rate limiting map across warm serverless requests
declare global {
  var __authRateLimitMap: Map<string, AttemptRecord> | undefined;
  var __authNonceMap: Map<string, { nonce: string; expiresAt: number }> | undefined;
}

const rateLimitMap: Map<string, AttemptRecord> =
  global.__authRateLimitMap || (global.__authRateLimitMap = new Map());

const nonceMap: Map<string, { nonce: string; expiresAt: number }> =
  global.__authNonceMap || (global.__authNonceMap = new Map());

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_DURATION_MS = 15 * 60 * 1000;

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

  // Check if actively locked out
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      lockoutRemainingSeconds: remainingSeconds,
    };
  }

  // Reset if window expired
  if (now - record.firstAttemptAt > WINDOW_DURATION_MS) {
    rateLimitMap.delete(key);
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - record.count);
  return { allowed: remaining > 0, remainingAttempts: remaining };
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

    // Nonce must be included in the signed message
    if (!nonceRecord || nonceRecord.expiresAt < Date.now()) {
      return false;
    }

    if (!message.includes(nonceRecord.nonce)) {
      return false;
    }

    const recoveredAddress = ethers.verifyMessage(message, signature);
    const isValid = recoveredAddress.trim().toLowerCase() === cleanWallet;

    if (isValid) {
      // Consume nonce so it cannot be replayed
      nonceMap.delete(cleanWallet);
    }
    return isValid;
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// 3. Signed httpOnly JWT Session Token Management
// ----------------------------------------------------
export async function createSessionJWT(payload: SessionPayload): Promise<string> {
  return await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .setIssuer("verichain-protocol")
    .sign(JWT_SECRET);
}

export async function verifySessionJWT(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
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
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400, // 24 hours
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
