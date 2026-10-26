import { NextRequest, NextResponse } from "next/server";
import { getServerSession, checkRateLimit, recordFailedAttempt } from "@/lib/serverAuth";
import { parseAndValidateUSN } from "@/lib/usnParser";
import { prisma } from "@/lib/prisma";
import {
  validateFileSafety,
  parseCsvFile,
  parseExcelFile,
  parsePdfFile,
  groupParsedRowsByStudent,
} from "@/lib/fileParser";
import { evaluateStudentMarks } from "@/lib/marksEngine";

export interface PreviewRow {
  rowId: string;
  originalRowNumbers: number[];
  usn: string;
  name: string;
  email: string;
  course: string;
  gradYear: number;
  semester: number;
  status: "valid" | "warning" | "error";
  errorMessages: string[];
  isDuplicateInFile: boolean;
  isAlreadyRegistered: boolean;
  subjects: {
    subjectCode: string;
    subjectName: string;
    semester: number;
    internalMarks: number | null;
    externalMarks: number | null;
    total: number | null;
    maxMarks: number | null;
    grade?: string;
    result?: string;
  }[];
  computedTotalMarks: number;
  computedMaxMarks: number;
  computedPercentage: number;
  computedGrade: string;
  computedResult: "PASS" | "FAIL";
  marksHash: string;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Session Verification: Strictly University Role Required
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in as an accredited university authority." },
        { status: 401 }
      );
    }

    if (session.role !== "university") {
      return NextResponse.json(
        { error: "Forbidden: Only accredited university authorities may upload candidate student marks." },
        { status: 403 }
      );
    }

    const sessionCollegeCode = session.entityInfo?.code?.trim()?.toUpperCase();
    if (!sessionCollegeCode) {
      return NextResponse.json(
        { error: "Forbidden: Active institutional session is missing registered college code." },
        { status: 403 }
      );
    }

    // 2. Rate Limiting Check
    const rateLimitKey = `upload_preview:${sessionCollegeCode}`;
    const rateStatus = await checkRateLimit(rateLimitKey);
    if (!rateStatus.allowed) {
      return NextResponse.json(
        {
          error: `Upload rate limit exceeded. Please wait ${rateStatus.lockoutRemainingSeconds} seconds before uploading again.`,
        },
        { status: 429 }
      );
    }

    // 3. Process Multipart Form Data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Missing upload file payload." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Validate MIME type, magic bytes, and size <= 5 MB
    const fileFormat = validateFileSafety(buffer, file.type, file.name);

    // 5. Execute Format Parser
    let rawRows: any[] = [];
    if (fileFormat === "csv") {
      rawRows = await parseCsvFile(buffer);
    } else if (fileFormat === "xlsx") {
      rawRows = await parseExcelFile(buffer);
    } else if (fileFormat === "pdf") {
      rawRows = await parsePdfFile(buffer);
    }

    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: "The uploaded file does not contain any student records." },
        { status: 400 }
      );
    }

    // 6. Group Rows by USN (handles multi-subject per student sheets)
    const groupedStudents = groupParsedRowsByStudent(rawRows);

    // Track in-file duplicates across raw rows
    const usnOccurrences = new Map<string, number>();
    for (const r of rawRows) {
      if (r.usn) {
        const u = r.usn.toUpperCase();
        usnOccurrences.set(u, (usnOccurrences.get(u) || 0) + 1);
      }
    }

    // 7. Validate Each Student Record Row-by-Row
    const previewRows: PreviewRow[] = [];
    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

    for (let i = 0; i < groupedStudents.length; i++) {
      const s = groupedStudents[i];
      const errors: string[] = [];
      let isDuplicateInFile = false;
      let isAlreadyRegistered = false;

      // Rule A: USN Validation
      if (!s.usn) {
        errors.push("Missing USN: Student row has no candidate USN.");
      } else {
        const parsedUsn = parseAndValidateUSN(s.usn);
        if (!parsedUsn.valid) {
          errors.push(`Invalid USN: ${parsedUsn.error}`);
        } else if (parsedUsn.collegeCode !== sessionCollegeCode) {
          // Rule B: College Binding: Never trust college in the file
          errors.push(
            `Cross-College USN: Candidate USN '${s.usn}' belongs to college '${parsedUsn.collegeCode}', but your authorized session is '${sessionCollegeCode}'.`
          );
        }
      }

      // Rule C: Mandatory Fields
      if (!s.name) {
        errors.push("Missing Name: Student name is required.");
      }

      if (!s.email) {
        errors.push("Missing Email: Candidate email is required as the only OTP destination.");
      } else if (!emailRegex.test(s.email)) {
        errors.push(`Malformed Email: '${s.email}' is not a valid email address.`);
      }

      // Rule D: In-File Duplicate Detection
      const rawCount = s.usn ? usnOccurrences.get(s.usn.toUpperCase()) || 0 : 0;
      const hasDuplicateCandidateRows =
        rawCount > 1 &&
        (s.subjects.length === 0 ||
          new Set(s.subjects.map((sub) => sub.subjectCode)).size < s.subjects.length ||
          rawCount > s.subjects.length);

      if (hasDuplicateCandidateRows) {
        isDuplicateInFile = true;
        duplicateCount++;
        errors.push("Duplicate In File: Multiple records for this USN exist in this upload.");
      }

      // Rule E: Database Duplicate Detection
      if (s.usn) {
        const existingProfile = await prisma.studentProfile.findUnique({
          where: { usn: s.usn },
        });
        if (existingProfile) {
          isAlreadyRegistered = true;
          duplicateCount++;
        }
      }

      // Rule F: Evaluate Subject-Wise Marks & Calculate Totals / Percentage
      const evalResult = evaluateStudentMarks(
        s.usn || `TEMP_${i + 1}`,
        s.subjects,
        s.fallbackPercentage
      );

      // Determine Row Status
      let status: "valid" | "warning" | "error" = "valid";
      if (errors.length > 0) {
        status = "error";
        errorCount++;
      } else if (isAlreadyRegistered) {
        status = "warning";
        warningCount++;
      } else {
        validCount++;
      }

      previewRows.push({
        rowId: `preview_row_${i + 1}`,
        originalRowNumbers: s.rowNumbers,
        usn: s.usn,
        name: s.name,
        email: s.email,
        course: s.course || "Computer Science",
        gradYear: s.gradYear || new Date().getFullYear(),
        semester: s.semester || 1,
        status,
        errorMessages: errors,
        isDuplicateInFile,
        isAlreadyRegistered,
        subjects: evalResult.subjects,
        computedTotalMarks: evalResult.totalMarks,
        computedMaxMarks: evalResult.maxTotalMarks,
        computedPercentage: evalResult.percentage,
        computedGrade: evalResult.overallGrade,
        computedResult: evalResult.overallResult,
        marksHash: evalResult.marksHash,
      });
    }

    // Log operational telemetry without logging personal data or marks
    console.log(
      `[Upload Preview Processed] College: ${sessionCollegeCode} | File: ${fileFormat.toUpperCase()} | Total: ${
        previewRows.length
      } | Valid: ${validCount} | Warnings: ${warningCount} | Errors: ${errorCount}`
    );

    return NextResponse.json({
      success: true,
      fileFormat,
      summary: {
        totalRows: rawRows.length,
        totalStudents: previewRows.length,
        validCount,
        warningCount,
        errorCount,
        duplicateCount,
      },
      rows: previewRows,
    });
  } catch (err: any) {
    // Record rate limit attempt on failure
    await recordFailedAttempt(`upload_preview_err:${req.ip || "unknown"}`).catch(() => {});

    console.error("[Upload Preview Failure]", err.message || err);

    let statusCode = 500;
    if (err.statusCode && typeof err.statusCode === "number") {
      statusCode = err.statusCode;
    } else if (err.message?.includes("File Size Limit Exceeded")) {
      statusCode = 413;
    } else if (
      err.message?.includes("Unsupported File Format") ||
      err.message?.includes("Binary file uploaded")
    ) {
      statusCode = 415;
    } else if (
      err.message?.includes("Validation Error") ||
      err.message?.includes("does not contain any student records")
    ) {
      statusCode = 400;
    }

    return NextResponse.json(
      { error: err.message || "Failed to process uploaded file preview." },
      { status: statusCode }
    );
  }
}
