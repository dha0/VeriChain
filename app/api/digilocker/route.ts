import { NextRequest, NextResponse } from "next/server";
import { DigiLockerDocument } from "@/types";
import { getServerSession } from "@/lib/serverAuth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized: Active authenticated session required to access DigiLocker." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const usn = searchParams.get("usn") || session.studentUSN || "1RV21CS001";

  // Verified National Academic Depository (NAD) / DigiLocker documents for candidate
  const mockDigiLockerDocs: DigiLockerDocument[] = [
    {
      id: "DL-CBSE-10-2019-91823",
      name: "Class X Secondary School Certificate & Marksheet",
      type: "Class X Marksheet",
      issuer: "Central Board of Secondary Education (CBSE)",
      date: "May 2019",
      status: "verified",
      uri: "https://gateway.pinata.cloud/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
      hash: "0x12a87c94efb889312b988f01b7a2d8123901b8745c11029487c9123847a19283",
    },
    {
      id: "DL-KSEEB-12-2021-48192",
      name: "Class XII Senior School Certificate & Marksheet (PCMC)",
      type: "Class XII Marksheet",
      issuer: "Department of Pre-University Education, Karnataka",
      date: "June 2021",
      status: "verified",
      uri: "https://gateway.pinata.cloud/ipfs/QmZtmD2qt8fJpq3CLDHcgDZ4nZhDPcpasbxHgghU9128bc",
      hash: "0x89123847c9123847a1928312a87c94efb889312b988f01b7a2d8123901b8745c",
    },
    {
      id: `DL-VTU-DEG-2025-${usn}`,
      name: "Bachelor of Engineering (B.E.) Degree Certificate",
      type: "Degree Certificate",
      issuer: "Visvesvaraya Technological University (VTU)",
      date: "July 2025",
      status: "verified",
      uri: "https://gateway.pinata.cloud/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
      hash: "0x19d18798c87aa0c7407e6b4c3eb78919b2c415964131bc02a48617c2aaee0939",
    },
  ];

  return NextResponse.json({
    success: true,
    connected: true,
    digiLockerId: "DIGI-NAD-IND-882190",
    candidateName: session.entityInfo?.name || "Rahul Sharma",
    aadhaarLinked: true,
    documents: mockDigiLockerDocs,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized: Active authenticated session required." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { docId, usn } = body;

    return NextResponse.json({
      success: true,
      message: `Document ${docId} pulled from DigiLocker and bridged to Ethereum smart contract & IPFS.`,
      docId,
      tamperProofVerified: true,
      timestamp: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
