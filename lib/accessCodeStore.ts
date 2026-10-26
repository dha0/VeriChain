import bcrypt from "bcryptjs";
import { ethers } from "ethers";
import { prisma } from "@/lib/prisma";

export interface EntityCredentialRecord {
  entityType: "university" | "company";
  entityId: number;
  codeIdentifier: string; // Public identifier / abbreviation (e.g. "UNIV-001")
  name: string;
  wallet: string;
  hashedCode: string; // Salted bcrypt hash
  createdAt: number;
}

/**
 * Generates a high-entropy random access code, salts and hashes it with bcrypt,
 * and saves only the hash to PostgreSQL database via Prisma. Returns plain text code ONCE.
 */
export async function generateAndStoreAccessCode(
  entityType: "university" | "company",
  entityId: number,
  codeIdentifier: string,
  name: string,
  wallet: string
): Promise<string> {
  const cleanId = codeIdentifier.trim().toUpperCase();

  const prefix = entityType === "university" ? "UNI-SEC" : "REC-SEC";
  const randomToken = ethers.hexlify(ethers.randomBytes(8)).replace("0x", "").toUpperCase();
  const plainSecretCode = `${prefix}-${cleanId}-${randomToken}`;

  const hashedCode = bcrypt.hashSync(plainSecretCode, 10);

  await prisma.institutionCredential.upsert({
    where: {
      entityType_codeIdentifier: {
        entityType,
        codeIdentifier: cleanId,
      },
    },
    update: {
      entityId,
      name: name.trim(),
      wallet: wallet.trim(),
      hashedCode,
    },
    create: {
      entityType,
      entityId,
      codeIdentifier: cleanId,
      name: name.trim(),
      wallet: wallet.trim(),
      hashedCode,
    },
  });

  return plainSecretCode;
}

// Standard precomputed bcrypt hash (cost 10) for timing-attack mitigation
const DUMMY_BCRYPT_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

/**
 * Verifies a provided access code against the stored bcrypt hash in PostgreSQL.
 * Requires codeIdentifier to look up a single record via unique index.
 * Uses async bcrypt.compare and performs a dummy comparison if no record exists
 * so timing attacks cannot reveal valid institutional identifiers.
 */
export async function verifyEntityAccessCode(
  entityType: "university" | "company",
  codeIdentifier: string,
  providedAccessCode: string
): Promise<EntityCredentialRecord | null> {
  const cleanId = (codeIdentifier || "").trim().toUpperCase();
  const cleanPass = (providedAccessCode || "").trim();

  // Code identifier is strictly required for indexed lookup
  if (!cleanId) {
    await bcrypt.compare(cleanPass || "dummy", DUMMY_BCRYPT_HASH);
    return null;
  }

  const record = await prisma.institutionCredential.findUnique({
    where: {
      entityType_codeIdentifier: {
        entityType,
        codeIdentifier: cleanId,
      },
    },
  });

  // Run dummy comparison if record does not exist to ensure constant response time
  const targetHash = record ? record.hashedCode : DUMMY_BCRYPT_HASH;
  const isMatch = await bcrypt.compare(cleanPass || "dummy", targetHash);

  if (record && isMatch) {
    return {
      entityType: record.entityType as "university" | "company",
      entityId: record.entityId,
      codeIdentifier: record.codeIdentifier,
      name: record.name,
      wallet: record.wallet,
      hashedCode: record.hashedCode,
      createdAt: record.createdAt.getTime(),
    };
  }

  return null;
}
