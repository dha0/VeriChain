import { NextResponse } from "next/server";
import { getReadOnlyServerContract } from "@/lib/serverContract";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Cache in memory for 15 seconds to avoid rate limiting public RPCs
let cachedStats: {
  universities: number;
  companies: number;
  students: number;
  credentials: number;
  verifications: number;
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 15_000;

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
    let universities = 0;
    let students = 0;
    let credentials = 0;
    let companies = 0;
    let verifications = 0;

    try {
      const stats = await contract.getAllStats();
      universities = Number(stats[0]);
      students = Number(stats[1]);
      credentials = Number(stats[2]);
      companies = Number(stats[4]);
      verifications = Number(stats[5]);
    } catch {
      // Fallback to getCounters if getAllStats fails
      const counters = await contract.getCounters();
      universities = Number(counters[0]);
      students = Number(counters[1]);
      credentials = Number(counters[2]);
      companies = Number(counters[3]);
      verifications = Number(counters[4]);
    }

    // Synchronize with active credentials in database to exclude old defunct test numbers
    try {
      const dbInstitutions = await prisma.institutionCredential.findMany();
      const validUnis = dbInstitutions.filter((i: any) => i.entityType === "university").length;
      const validComps = dbInstitutions.filter((i: any) => i.entityType === "company").length;
      if (validUnis > 0) universities = validUnis;
      if (validComps > 0) companies = validComps;
    } catch {}

    cachedStats = {
      universities,
      companies,
      students,
      credentials,
      verifications,
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
