import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Achievement, AchievementStatus } from "@/types";

const DATA_FILE = path.join(process.cwd(), ".student_achievements.json");

function readAchievements(): Achievement[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {}

  // Initial seed achievement for demo student Rahul Sharma (1RV21CS001, studentId: 1)
  const initial: Achievement[] = [
    {
      achievementId: 1,
      studentId: 1,
      title: "AWS Certified Solutions Architect - Associate",
      issuerOrg: "Amazon Web Services",
      category: "Certification",
      documentHash: "0x89d2c67aa410b05b38d38102ff98e09653066a5c37894a8520261176b6b71f90",
      ipfsCID: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
      submittedAt: Date.now() - 3600000 * 48,
      reviewedAt: Date.now() - 3600000 * 20,
      reviewingUniversityId: 1,
      status: AchievementStatus.Verified,
      reviewRemarks: "Credential verified against AWS certification validation registry. Legitimate cloud skill.",
      exists: true,
    },
    {
      achievementId: 2,
      studentId: 1,
      title: "1st Place - Smart India National Hackathon 2024",
      issuerOrg: "Ministry of Education & AICTE",
      category: "Hackathon",
      documentHash: "0x77c2a11bf30219c009bb31980072b210084318c390291ba83017643b00c82133",
      ipfsCID: "QmZtmD2qt8fJpq3CLDHcgDZ4nZhDPcpasbxHgghU9128bc",
      submittedAt: Date.now() - 3600000 * 10,
      reviewedAt: 0,
      reviewingUniversityId: 0,
      status: AchievementStatus.PendingReview,
      reviewRemarks: "",
      exists: true,
    },
  ];
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  } catch (e) {}
  return initial;
}

function writeAchievements(data: Achievement[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to write achievements:", e);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");
  const achievements = readAchievements();

  if (studentId) {
    const filtered = achievements.filter((a) => a.studentId === Number(studentId));
    return NextResponse.json({ achievements: filtered });
  }

  return NextResponse.json({ achievements });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, achievementData, achievementId, status, remarks, universityId } = body;
    const achievements = readAchievements();

    if (action === "submit") {
      const newAch: Achievement = {
        achievementId: achievements.length + 1,
        studentId: Number(achievementData.studentId) || 1,
        title: achievementData.title,
        issuerOrg: achievementData.issuerOrg || "External Organization",
        category: achievementData.category || "Certification",
        documentHash: achievementData.documentHash,
        ipfsCID: achievementData.ipfsCID,
        submittedAt: Date.now(),
        reviewedAt: 0,
        reviewingUniversityId: 0,
        status: AchievementStatus.PendingReview,
        reviewRemarks: "",
        exists: true,
      };

      achievements.push(newAch);
      writeAchievements(achievements);
      return NextResponse.json({ success: true, achievement: newAch });
    }

    if (action === "review") {
      const idx = achievements.findIndex((a) => a.achievementId === Number(achievementId));
      if (idx === -1) {
        return NextResponse.json({ error: "Achievement not found" }, { status: 404 });
      }

      achievements[idx].status = status;
      achievements[idx].reviewRemarks = remarks || "";
      achievements[idx].reviewedAt = Date.now();
      achievements[idx].reviewingUniversityId = Number(universityId) || 1;

      writeAchievements(achievements);
      return NextResponse.json({ success: true, achievement: achievements[idx] });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
