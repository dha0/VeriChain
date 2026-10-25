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

  // Initial seed with salted bcrypt hashes for initial institutions
  // Default dev access codes: "VTU-PASS-2026", "INFY-PASS-2026", "TCS-PASS-2026"
  const defaultSaltRounds = 10;
  const initial: EntityCredentialRecord[] = [
    {
      entityType: "university",
      entityId: 1,
      codeIdentifier: "VTU-KA-001",
      name: "Visvesvaraya Technological University",
      wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      hashedCode: bcrypt.hashSync("VTU-PASS-2026", defaultSaltRounds),
      createdAt: Date.now(),
    },
    {
      entityType: "company",
      entityId: 1,
      codeIdentifier: "INFY-BLR-01",
      name: "Infosys Technologies Ltd",
      wallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      hashedCode: bcrypt.hashSync("INFY-PASS-2026", defaultSaltRounds),
      createdAt: Date.now(),
    },
    {
      entityType: "company",
      entityId: 2,
      codeIdentifier: "TCS-MUM-01",
      name: "Tata Consultancy Services (TCS)",
      wallet: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
      hashedCode: bcrypt.hashSync("TCS-PASS-2026", defaultSaltRounds),
      createdAt: Date.now(),
    },
  ];

  global.__accessCredentialsCache = initial;
  writeRecords(initial);
  return initial;
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
