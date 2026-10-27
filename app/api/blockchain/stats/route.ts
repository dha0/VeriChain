import { NextResponse } from "next/server";
import { getReadOnlyServerContract } from "@/lib/serverContract";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Cache in memory for 5 seconds to keep stats synchronized while avoiding RPC rate limits
let cachedStats: {
  universities: number;
  companies: number;
  students: number;
  credentials: number;
  verifications: number;
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 5_000;
const LEGACY_TEST_CODES = new Set(["TEST-UNI-001", "CIT", "CIT0107", "INFY-BLR-01", "TCS-MUM-01"]);

export async function GET() {
  const now = Date.now();
  if (cachedStats && now - cachedStats.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      ...cachedStats,
      cached: true,
    });
  }

  try {
    const contract = getReadOnlyServerContract();

    // Query on-chain statistics
    const counters = await contract.getCounters();
    const totalU = Number(counters[0]);
    const totalS = Number(counters[1]);
    const totalCred = Number(counters[2]);
    const totalC = Number(counters[3]);
    const totalV = Number(counters[4]);

    // Gather valid universities (excluding legacy test entities)
    const validUniCodes = new Set<string>();
    for (let i = 1; i <= totalU; i++) {
      try {
        const u = await contract.getUniversity(i);
        const code = (u.universityCode || "").trim().toUpperCase();
        if (code && !code.startsWith("0x") && !LEGACY_TEST_CODES.has(code)) {
          validUniCodes.add(code);
        }
      } catch {}
    }

    // Gather valid hiring partners (excluding legacy test entities)
    const validCompanyCodes = new Set<string>();
    for (let i = 1; i <= totalC; i++) {
      try {
        const c = await contract.getCompany(i);
        const code = (c.companyCode || "").trim().toUpperCase();
        if (code && !code.startsWith("0x") && !LEGACY_TEST_CODES.has(code)) {
          validCompanyCodes.add(code);
        }
      } catch {}
    }

    // Include institutions accredited in database
    try {
      const dbInstitutions = await prisma.institutionCredential.findMany();
      for (const inst of dbInstitutions) {
        const code = (inst.codeIdentifier || "").trim().toUpperCase();
        if (code && !LEGACY_TEST_CODES.has(code)) {
          if (inst.entityType === "university") {
            validUniCodes.add(code);
          } else {
            validCompanyCodes.add(code);
          }
        }
      }
    } catch {}

    // Students count (max of on-chain and database)
    let students = totalS;
    try {
      const dbStudents = await prisma.studentProfile.count();
      if (dbStudents > students) students = dbStudents;
    } catch {}

    // Credentials count
    let credentials = totalCred;
    try {
      const dbCreds = await prisma.studentMark.count();
      if (dbCreds > credentials) credentials = dbCreds;
    } catch {}

    cachedStats = {
      universities: validUniCodes.size,
      companies: validCompanyCodes.size,
      students,
      credentials,
      verifications: totalV,
      timestamp: now,
    };

    return NextResponse.json({
      ...cachedStats,
      cached: false,
    });
  } catch (error: any) {
    console.error("Failed to query on-chain stats:", error);
    // Return stale cache if available
    if (cachedStats) {
      return NextResponse.json({
        ...cachedStats,
        stale: true,
      });
    }
    return NextResponse.json(
      {
        universities: 0,
        companies: 0,
        students: 0,
        credentials: 0,
        verifications: 0,
        error: error.message || "Failed to query on-chain statistics",
      },
      { status: 500 }
    );
  }
}
