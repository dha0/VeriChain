import fs from "fs";
import path from "path";
import os from "os";
import bcrypt from "bcryptjs";
import { ethers } from "ethers";

export interface EntityCredentialRecord {
  entityType: "university" | "company";
  entityId: number;
  codeIdentifier: string; // Public identifier / abbreviation (e.g. "VTU-KA-001", "CIT")
  name: string;
  wallet: string;
  hashedCode: string; // Salted bcrypt hash of the secret access code
  createdAt: number;
}

const CWD_FILE = path.join(process.cwd(), ".access_credentials.json");
const TMP_FILE = path.join(os.tmpdir(), "access_credentials.json");

declare global {
  var __accessCredentialsCache: EntityCredentialRecord[] | undefined;
}

function readRecords(): EntityCredentialRecord[] {
  if (global.__accessCredentialsCache && Array.isArray(global.__accessCredentialsCache)) {
    return global.__accessCredentialsCache;
  }

  // 1. Check /tmp
  try {
    if (fs.existsSync(TMP_FILE)) {
      const content = fs.readFileSync(TMP_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        global.__accessCredentialsCache = parsed;
        return parsed;
      }
    }
  } catch {}

  // 2. Check project root file
  try {
    if (fs.existsSync(CWD_FILE)) {
      const content = fs.readFileSync(CWD_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        global.__accessCredentialsCache = parsed;
        return parsed;
      }
    }
  } catch {}

  global.__accessCredentialsCache = [];
  return [];
}

function writeRecords(data: EntityCredentialRecord[]) {
  global.__accessCredentialsCache = data;
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2));
  } catch {}
  try {
    fs.writeFileSync(CWD_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

/**
 * Generates a high-entropy random access code, salts and hashes it with bcrypt,
 * and saves only the hash. Returns the plain text code ONCE to display to the user.
 */
export function generateAndStoreAccessCode(
  entityType: "university" | "company",
  entityId: number,
  codeIdentifier: string,
  name: string,
  wallet: string
): string {
  const records = readRecords();
  const cleanId = codeIdentifier.trim().toUpperCase();

  // Generate random 16-byte hex secret: e.g. "AUTH-UNI-7f8a9b2c3d4e5f6a"
  const prefix = entityType === "university" ? "UNI-SEC" : "REC-SEC";
  const randomToken = ethers.hexlify(ethers.randomBytes(8)).replace("0x", "").toUpperCase();
  const plainSecretCode = `${prefix}-${cleanId}-${randomToken}`;

  const hashedCode = bcrypt.hashSync(plainSecretCode, 10);

  const newRecord: EntityCredentialRecord = {
    entityType,
    entityId,
    codeIdentifier: cleanId,
    name: name.trim(),
    wallet: wallet.trim(),
    hashedCode,
    createdAt: Date.now(),
  };

  const existingIdx = records.findIndex(
    (r) => r.codeIdentifier.toUpperCase() === cleanId && r.entityType === entityType
  );

  if (existingIdx >= 0) {
    records[existingIdx] = newRecord;
  } else {
    records.push(newRecord);
  }

  writeRecords(records);
  return plainSecretCode; // Return plain text ONCE
}

/**
 * Verifies a provided access code against the stored bcrypt hash on the server.
 * Supports verifying with codeIdentifier + accessCode, or checking accessCode across records.
 */
export function verifyEntityAccessCode(
  entityType: "university" | "company",
  codeIdentifier: string,
  providedAccessCode: string
): EntityCredentialRecord | null {
  const records = readRecords();
  const cleanId = (codeIdentifier || "").trim().toUpperCase();
  const cleanPass = (providedAccessCode || "").trim();

  // Case 1: Both code identifier and secret passkey are provided
  if (cleanId && cleanPass) {
    const record = records.find(
      (r) => r.codeIdentifier.toUpperCase() === cleanId && r.entityType === entityType
    );
    if (record) {
      const isMatch = bcrypt.compareSync(cleanPass, record.hashedCode);
      if (isMatch) return record;
    }
  }

  // Case 2: Only one credential string provided (check if it matches any bcrypt hash for this entityType)
  const singleInput = cleanPass || cleanId;
  if (singleInput) {
    for (const r of records) {
      if (r.entityType === entityType) {
        if (bcrypt.compareSync(singleInput, r.hashedCode)) {
          return r;
        }
      }
    }
  }

  return null;
}
