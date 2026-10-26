import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/serverAuth";
import { prisma } from "@/lib/prisma";
import { getReadOnlyServerContract } from "@/lib/serverContract";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    // 1. IP-Based Distributed Rate Limiting
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const rateLimitKey = `public_verify:${ip}`;

    const rateStatus = await checkRateLimit(rateLimitKey);
    if (!rateStatus.allowed) {
      return NextResponse.json(
        {
          error: `Too many verification requests. Please wait ${rateStatus.lockoutRemainingSeconds} seconds.`,
        },
        { status: 429 }
      );
    }

    let searchCredentialId: number | null = null;
    let searchHash: string | null = null;

    // 2. Parse JSON or Multipart Upload
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const credIdParam = formData.get("credentialId") as string | null;
      const hashParam = formData.get("hash") as string | null;

      if (file) {
        const fileBytes = Buffer.from(await file.arrayBuffer());
        const sha256Hex = crypto.createHash("sha256").update(fileBytes).digest("hex");
        searchHash = `0x${sha256Hex}`;
      } else if (hashParam) {
        searchHash = hashParam.trim();
      } else if (credIdParam) {
        searchCredentialId = Number(credIdParam);
      }
    } else {
      const body = await req.json().catch(() => ({}));
      if (body.credentialId) {
        searchCredentialId = Number(body.credentialId);
      }
      if (body.hash) {
        searchHash = String(body.hash).trim();
      }
    }

    if (!searchCredentialId && !searchHash) {
      return NextResponse.json(
        { error: "No record found" },
        { status: 404 }
      );
    }

    const contract = getReadOnlyServerContract();

    // -----------------------------------------------------------------
    // CASE 1: Query by Credential ID
    // -----------------------------------------------------------------
    if (searchCredentialId) {
      try {
        const cred = await contract.getCredential(searchCredentialId);
        if (!cred || !cred.exists) {
          return NextResponse.json({ error: "No record found" }, { status: 404 });
        }

        const univ = await contract.getUniversity(Number(cred.universityId));
        const statusCode = Number(cred.status);
        const statusStr =
          statusCode === 0 ? "active" : statusCode === 1 ? "revoked" : "superseded";

        return NextResponse.json({
          valid: statusCode === 0,
          collegeName: univ.name || `Institution #${cred.universityId}`,
          collegeCode: univ.universityCode || "N/A",
          date: new Date(Number(cred.issuedAt) * 1000).toISOString(),
          status: statusStr,
          version: Number(cred.version) || 1,
          documentType: cred.documentType || "Academic Credential",
        });
      } catch (err) {
        return NextResponse.json({ error: "No record found" }, { status: 404 });
      }
    }

    // -----------------------------------------------------------------
    // CASE 2: Query by Cryptographic Hash (Keccak-256 or SHA-256)
    // -----------------------------------------------------------------
    if (searchHash) {
      const normalizedHash = searchHash.startsWith("0x") ? searchHash : `0x${searchHash}`;

      // A. Check Student Academic Mark Versions in Database & Contract
      const versionRecord = await prisma.studentMarkVersion.findFirst({
        where: { marksHash: normalizedHash },
      });

      const profileRecord = await prisma.studentProfile.findFirst({
        where: { marksHash: normalizedHash },
      });

      if (versionRecord || profileRecord) {
        const targetUsn = versionRecord?.usn || profileRecord?.usn;
        try {
          const onChainStudent = await contract.getStudentByUSN(targetUsn);
          if (onChainStudent && onChainStudent.exists) {
            const onChainUniv = await contract.getUniversity(Number(onChainStudent.universityId));
            const isLatest = onChainStudent.marksHash.toLowerCase() === normalizedHash.toLowerCase();
            const versionNum = versionRecord ? versionRecord.version : (profileRecord?.marksVersion || 1);
            const statusStr = isLatest ? "active" : "superseded";

            return NextResponse.json({
              valid: true,
              collegeName: onChainUniv.name || "Accredited College",
              collegeCode: onChainUniv.universityCode || "N/A",
              date: versionRecord
                ? new Date(versionRecord.createdAt).toISOString()
                : new Date().toISOString(),
              status: statusStr,
              version: versionNum,
              documentType: "Academic Marksheet & Cumulative Transcript",
            });
          }
        } catch (chainErr) {}
      }

      // B. Check Student Co-Curricular Achievement Certificates
      const achRecord = await prisma.studentAchievement.findFirst({
        where: { documentHash: normalizedHash },
      });

      if (achRecord) {
        try {
          let collegeName = "Accredited Institutional Authority";
          let collegeCode = achRecord.collegeCode || "N/A";

          if (achRecord.reviewingUniversityId) {
            try {
              const u = await contract.getUniversity(Number(achRecord.reviewingUniversityId));
              if (u && u.active) {
                collegeName = u.name;
                collegeCode = u.universityCode;
              }
            } catch (e) {}
          }

          const isVerified = achRecord.status === "verified" || achRecord.status === "1";
          const isRejected = achRecord.status === "rejected" || achRecord.status === "2";
          const statusStr = isVerified ? "active" : isRejected ? "revoked" : "superseded";

          return NextResponse.json({
            valid: isVerified,
            collegeName,
            collegeCode,
            date: achRecord.reviewedAt
              ? new Date(achRecord.reviewedAt).toISOString()
              : new Date(achRecord.submittedAt).toISOString(),
            status: statusStr,
            version: 1,
            documentType: achRecord.title || "Certification of Achievement",
          });
        } catch (achErr) {}
      }
    }

    // Default: Uniform "No record found" message for all misses (enumeration protection)
    return NextResponse.json({ error: "No record found" }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: "No record found" }, { status: 404 });
  }
}
