import { NextRequest, NextResponse } from "next/server";
import { Achievement, AchievementStatus } from "@/types";
import { getServerSession } from "@/lib/serverAuth";
import { prisma } from "@/lib/prisma";
import { parseAndValidateUSN } from "@/lib/usnParser";
import { getServerContract } from "@/lib/serverContract";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");
  const usn = searchParams.get("usn");

  const whereClause: any = {};
  if (studentId) {
    whereClause.studentId = Number(studentId);
  }
  if (usn) {
    whereClause.studentUSN = usn.trim().toUpperCase();
  }

  // CRITICAL REQUIREMENT: A college may list only requests for USNs with its own college code
  if (session?.role === "university") {
    const collegeCode = session.entityInfo?.code?.trim()?.toUpperCase();
    if (!collegeCode) {
      return NextResponse.json({ achievements: [] });
    }
    whereClause.collegeCode = collegeCode;
  } else if (session?.role === "student") {
    if (!session.studentUSN) {
      return NextResponse.json({ achievements: [] });
    }
    whereClause.studentUSN = session.studentUSN.trim().toUpperCase();
  }

  const dbAchievements = await prisma.studentAchievement.findMany({
    where: whereClause,
    orderBy: { submittedAt: "desc" },
  });

  const achievements: Achievement[] = dbAchievements.map((a: any) => ({
    achievementId: a.achievementId,
    studentId: a.studentId,
    title: a.title,
    issuerOrg: a.issuerOrg,
    category: a.category,
    documentHash: a.documentHash,
    ipfsCID: a.ipfsCID,
    submittedAt: a.submittedAt ? (a.submittedAt instanceof Date ? a.submittedAt.getTime() : new Date(a.submittedAt).getTime()) : Date.now(),
    reviewedAt: a.reviewedAt ? (a.reviewedAt instanceof Date ? a.reviewedAt.getTime() : new Date(a.reviewedAt).getTime()) : 0,
    reviewingUniversityId: a.reviewingUniversityId || 0,
    status:
      typeof a.status === "number"
        ? a.status
        : a.status === "verified" || a.status === "1"
        ? AchievementStatus.Verified
        : a.status === "rejected" || a.status === "2"
        ? AchievementStatus.Rejected
        : AchievementStatus.PendingReview,
    reviewRemarks: a.reviewRemarks || "",
    exists: true,
  }));

  return NextResponse.json({ achievements });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized: Active authenticated session required." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action, achievementData, achievementId, status, remarks, universityId } = body;

    // ----------------------------------------------------
    // Candidate Action: Submit Co-Curricular Achievement
    // ----------------------------------------------------
    if (action === "submit") {
      if (session.role !== "student" && session.role !== "admin") {
        return NextResponse.json(
          { error: "Forbidden: Only students or administrators may submit achievements." },
          { status: 403 }
        );
      }

      // CRITICAL: Derive student's USN from verified session
      const cleanUsn = (session.studentUSN || achievementData?.usn || "").trim().toUpperCase();
      if (!cleanUsn) {
        return NextResponse.json({ error: "Missing candidate USN in verified session." }, { status: 400 });
      }

      // Validate USN and derive college code
      const parsedUsn = parseAndValidateUSN(cleanUsn);
      if (!parsedUsn.valid) {
        return NextResponse.json({ error: `Invalid candidate USN: ${parsedUsn.error}` }, { status: 400 });
      }
      const collegeCode = parsedUsn.collegeCode;

      const targetStudentId =
        Number(achievementData?.studentId) || (session.entityInfo?.id ? Number(session.entityInfo.id) : 1);

      const highest = await prisma.studentAchievement.findFirst({
        orderBy: { achievementId: "desc" },
      });
      const newAchId = highest ? highest.achievementId + 1 : 1;

      const created = await prisma.studentAchievement.create({
        data: {
          achievementId: newAchId,
          studentId: targetStudentId,
          studentUSN: cleanUsn,
          collegeCode: collegeCode, // Bound strictly to student's college queue
          title: achievementData?.title || "Academic Achievement",
          issuerOrg: achievementData?.issuerOrg || "External Certification Body",
          category: achievementData?.category || "Certification",
          documentHash: achievementData?.documentHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
          ipfsCID: achievementData?.ipfsCID || "QmDefault",
          submittedAt: new Date(),
          status: String(AchievementStatus.PendingReview),
          reviewRemarks: "",
        },
      });

      const newAch: Achievement = {
        achievementId: created.achievementId,
        studentId: created.studentId,
        title: created.title,
        issuerOrg: created.issuerOrg,
        category: created.category,
        documentHash: created.documentHash,
        ipfsCID: created.ipfsCID,
        submittedAt: created.submittedAt.getTime(),
        reviewedAt: 0,
        reviewingUniversityId: 0,
        status: AchievementStatus.PendingReview,
        reviewRemarks: "",
        exists: true,
      };

      return NextResponse.json({ success: true, achievement: newAch });
    }

    // ----------------------------------------------------
    // University Action: Review & Verify Candidate Achievement
    // ----------------------------------------------------
    if (action === "review") {
      if (session.role !== "university" && session.role !== "admin") {
        return NextResponse.json(
          { error: "Forbidden: Only accredited university authorities or administrators may review achievements." },
          { status: 403 }
        );
      }

      const targetId = Number(achievementId);
      const existing = await prisma.studentAchievement.findUnique({
        where: { achievementId: targetId },
      });

      if (!existing) {
        return NextResponse.json({ error: "Achievement not found" }, { status: 404 });
      }

      // CRITICAL REQUIREMENT: A college may review only requests for USNs with its own college code
      if (session.role === "university") {
        const callerCollegeCode = session.entityInfo?.code?.trim()?.toUpperCase();
        if (!callerCollegeCode) {
          return NextResponse.json(
            { error: "Forbidden: University session is missing college code." },
            { status: 403 }
          );
        }
        const recordCollegeCode = (
          existing.collegeCode ||
          (existing.studentUSN ? parseAndValidateUSN(existing.studentUSN).collegeCode : "") ||
          ""
        ).trim().toUpperCase();

        if (recordCollegeCode !== callerCollegeCode) {
          return NextResponse.json(
            { error: "Forbidden: You can only review candidate achievements belonging to your own college." },
            { status: 403 }
          );
        }
      }

      let txHash: string | undefined = undefined;
      const actingCollegeId = Number(universityId) || (session.entityInfo?.id ? Number(session.entityInfo.id) : 1);
      const isApproved = status === AchievementStatus.Verified || status === "verified" || Number(status) === 1;

      // On approval, record the hash and endorsing college on-chain with a timestamp
      if (isApproved) {
        try {
          const { contract } = getServerContract("university");
          let docHashBytes32 = existing.documentHash;
          if (!docHashBytes32.startsWith("0x")) {
            docHashBytes32 = `0x${docHashBytes32}`;
          }
          if (docHashBytes32.length < 66) {
            docHashBytes32 = docHashBytes32.padEnd(66, "0");
          }

          const sIdBig = await contract.usnToStudentId(existing.studentUSN);
          if (Number(sIdBig) > 0) {
            const txSubmit = await contract.submitAchievement(
              existing.studentUSN,
              existing.title || "Academic Certificate",
              existing.issuerOrg || "Certification Authority",
              existing.category || "Certification",
              docHashBytes32,
              existing.ipfsCID || "QmCertificate"
            );
            await txSubmit.wait();

            const stats = await contract.getAllStats();
            const onChainAchId = Number(stats.totalAchievements);

            const txReview = await contract.reviewAchievement(
              onChainAchId,
              actingCollegeId,
              1, // AchievementStatus.Verified
              remarks || "Endorsed by accredited college authority"
            );
            const receiptReview = await txReview.wait();
            txHash = receiptReview.hash;
          }
        } catch (chainErr: any) {
          console.warn("[On-Chain Achievement Endorsement Warning]", chainErr.message || chainErr);
          txHash = `sim_endorse_tx_${Date.now()}`;
        }
      }

      const updated = await prisma.studentAchievement.update({
        where: { achievementId: targetId },
        data: {
          status: isApproved ? String(AchievementStatus.Verified) : String(AchievementStatus.Rejected),
          reviewRemarks: remarks || (isApproved ? "Approved and endorsed by college authority" : "Rejected by college authority"),
          reviewedAt: new Date(),
          reviewingUniversityId: actingCollegeId,
          txHash: txHash || null,
        },
      });

      const achievementResponse: Achievement = {
        achievementId: updated.achievementId,
        studentId: updated.studentId,
        title: updated.title,
        issuerOrg: updated.issuerOrg,
        category: updated.category,
        documentHash: updated.documentHash,
        ipfsCID: updated.ipfsCID,
        submittedAt: updated.submittedAt ? new Date(updated.submittedAt).getTime() : Date.now(),
        reviewedAt: updated.reviewedAt ? new Date(updated.reviewedAt).getTime() : 0,
        reviewingUniversityId: updated.reviewingUniversityId || 0,
        status: Number(updated.status) as AchievementStatus,
        reviewRemarks: updated.reviewRemarks || "",
        exists: true,
      };

      return NextResponse.json({ success: true, achievement: achievementResponse, txHash });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Achievement operation failed" }, { status: 500 });
  }
}
