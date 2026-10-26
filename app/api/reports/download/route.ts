import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/serverAuth";
import { parseAndValidateUSN } from "@/lib/usnParser";
import { prisma } from "@/lib/prisma";
import { generateStudentReportPDF, SubjectMark } from "@/lib/pdfGenerator";
import { computeCanonicalRecordHash } from "@/lib/marksEngine";

export async function GET(req: NextRequest) {
  try {
    // 1. Session Authentication Required
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required to download official academic report." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    let targetUsn = "";

    // 2. Role-Based Access Control & College Isolation
    if (session.role === "student") {
      // Rule: Student downloads ONLY their own report. Derived strictly from session.
      targetUsn = (session.studentUSN || "").trim().toUpperCase();
      if (!targetUsn) {
        return NextResponse.json(
          { error: "No candidate USN bound to active student session." },
          { status: 400 }
        );
      }
    } else if (session.role === "university") {
      // Rule: College downloads ONLY its own students' reports.
      const sessionCollegeCode = session.entityInfo?.code?.trim()?.toUpperCase();
      if (!sessionCollegeCode) {
        return NextResponse.json(
          { error: "Forbidden: University session is missing registered college code." },
          { status: 403 }
        );
      }

      const requestedUsn = searchParams.get("usn")?.trim()?.toUpperCase();
      if (!requestedUsn) {
        return NextResponse.json(
          { error: "Query parameter 'usn' is required for institutional report download." },
          { status: 400 }
        );
      }

      const parsedUsn = parseAndValidateUSN(requestedUsn);
      if (!parsedUsn.valid) {
        return NextResponse.json(
          { error: `Invalid candidate USN format: ${parsedUsn.error}` },
          { status: 400 }
        );
      }

      if (parsedUsn.collegeCode !== sessionCollegeCode) {
        return NextResponse.json(
          {
            error: `Cross-College Violation: Candidate USN '${requestedUsn}' belongs to college '${parsedUsn.collegeCode}', not authorized '${sessionCollegeCode}'.`,
          },
          { status: 403 }
        );
      }

      targetUsn = requestedUsn;
    } else if (session.role === "admin") {
      const requestedUsn = searchParams.get("usn")?.trim()?.toUpperCase();
      if (!requestedUsn) {
        return NextResponse.json({ error: "Query parameter 'usn' is required." }, { status: 400 });
      }
      targetUsn = requestedUsn;
    } else {
      // Other roles (e.g. company, public) cannot download reports directly
      return NextResponse.json(
        { error: "Forbidden: Academic reports can only be downloaded by the student or issuing college." },
        { status: 403 }
      );
    }

    // 3. Fetch Student Profile
    const student = await prisma.studentProfile.findUnique({
      where: { usn: targetUsn },
    });

    if (!student) {
      return NextResponse.json(
        { error: `Student record with USN '${targetUsn}' was not found in institutional registry.` },
        { status: 404 }
      );
    }

    // 4. Resolve Target Version
    const reqVersion = searchParams.get("version");
    const versionNum = reqVersion ? Number(reqVersion) : (student.marksVersion || 1);

    // 5. Fetch Version Record & Subject Breakdown
    const versionRecord = await prisma.studentMarkVersion.findFirst({
      where: { usn: targetUsn, version: versionNum },
    });

    const marksRecords = await prisma.studentMark.findMany({
      where: { usn: targetUsn, version: versionNum },
      orderBy: { subjectCode: "asc" },
    });

    // 6. Map Subjects (if available)
    let subjects: SubjectMark[] | undefined = undefined;
    if (marksRecords && marksRecords.length > 0) {
      subjects = marksRecords.map((m: any) => ({
        code: m.subjectCode,
        title: m.subjectName || m.subjectCode,
        credits: 4,
        maxMarks: Number(m.maxMarks) || 100,
        marksObtained: Number(m.total) || 0,
        grade: m.grade || (m.result === "FAIL" ? "F" : "P"),
        gradePoint: m.result === "FAIL" ? 0 : 8,
      }));
    }

    const pct = versionRecord ? versionRecord.percentage : (student.percentage || 0);
    const totalScored = versionRecord ? versionRecord.totalMarks : (student.totalMarks || 0);
    const maxTotal = versionRecord ? versionRecord.maxTotalMarks : (student.maxTotalMarks || 0);

    const recordHash =
      versionRecord?.marksHash ||
      student.marksHash ||
      computeCanonicalRecordHash(
        targetUsn,
        pct,
        marksRecords.map((m: any) => ({
          subjectCode: m.subjectCode,
          total: m.total,
          maxMarks: m.maxMarks,
        }))
      );

    // 7. Dynamic Verification URL for QR Code
    const host = req.headers.get("host") || "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const verificationUrl = `${proto}://${host}/verify?hash=${recordHash}`;

    // 8. Generate Official PDF
    const pdfBytes = await generateStudentReportPDF({
      universityName: student.collegeCode ? `${student.collegeCode} Institution of Technology` : "Accredited University",
      universityCode: student.collegeCode || "VTU",
      studentName: student.name,
      usn: student.usn,
      course: student.course || "Computer Science and Engineering",
      graduationYear: student.gradYear || new Date().getFullYear(),
      percentage: pct,
      totalMarks: totalScored,
      maxTotalMarks: maxTotal,
      overallResult: pct >= 40 ? "PASS" : "FAIL",
      subjects,
      version: versionNum,
      recordHash,
      verificationUrl,
      issueDate: versionRecord
        ? new Date(versionRecord.createdAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${targetUsn}_Academic_Report_v${versionNum}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("[Report Download Error]", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error while generating report PDF." },
      { status: 500 }
    );
  }
}
