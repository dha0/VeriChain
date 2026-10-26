import { ethers } from "ethers";

/**
 * -----------------------------------------------------------------------------
 * 1. CONFIGURABLE GRADING SCHEME
 * Standardized VTU / Autonomous University Grading & Evaluation Table.
 * Modify this array to adapt to institutional or autonomous credit schemes.
 * -----------------------------------------------------------------------------
 */
export interface GradeThreshold {
  minPercentage: number;
  grade: string;
  result: "PASS" | "FAIL";
  gradePoints: number;
  description: string;
}

export const INSTITUTIONAL_GRADING_SCHEME: GradeThreshold[] = [
  { minPercentage: 90, grade: "O",  result: "PASS", gradePoints: 10, description: "Outstanding" },
  { minPercentage: 80, grade: "A+", result: "PASS", gradePoints: 9,  description: "Excellent" },
  { minPercentage: 70, grade: "A",  result: "PASS", gradePoints: 8,  description: "Very Good" },
  { minPercentage: 60, grade: "B+", result: "PASS", gradePoints: 7,  description: "Good" },
  { minPercentage: 55, grade: "B",  result: "PASS", gradePoints: 6,  description: "Above Average" },
  { minPercentage: 50, grade: "C",  result: "PASS", gradePoints: 5,  description: "Average" },
  { minPercentage: 40, grade: "P",  result: "PASS", gradePoints: 4,  description: "Pass" },
  { minPercentage: 0,  grade: "F",  result: "FAIL", gradePoints: 0,  description: "Fail" },
];

/**
 * Computes grade and pass/fail result from a percentage.
 */
export function getGradeFromPercentage(percentage: number): {
  grade: string;
  result: "PASS" | "FAIL";
  gradePoints: number;
  description: string;
} {
  const cleanPct = Math.max(0, Math.min(100, Number(percentage) || 0));
  for (const tier of INSTITUTIONAL_GRADING_SCHEME) {
    if (cleanPct >= tier.minPercentage) {
      return {
        grade: tier.grade,
        result: tier.result,
        gradePoints: tier.gradePoints,
        description: tier.description,
      };
    }
  }
  return { grade: "F", result: "FAIL", gradePoints: 0, description: "Fail" };
}

/**
 * -----------------------------------------------------------------------------
 * 2. SUBJECT-WISE MARKS & AGGREGATE CALCULATOR
 * -----------------------------------------------------------------------------
 */
export interface SubjectInput {
  subjectCode: string;
  subjectName: string;
  semester?: number;
  internalMarks?: number | null;
  externalMarks?: number | null;
  total?: number | null;
  maxMarks?: number | null;
  grade?: string | null;
  result?: string | null;
}

export interface EvaluatedSubject {
  subjectCode: string;
  subjectName: string;
  semester: number;
  internalMarks: number;
  externalMarks: number;
  total: number;
  maxMarks: number;
  percentage: number;
  grade: string;
  result: "PASS" | "FAIL";
}

export interface StudentMarksEvaluation {
  subjects: EvaluatedSubject[];
  totalMarks: number;
  maxTotalMarks: number;
  percentage: number;
  overallGrade: string;
  overallResult: "PASS" | "FAIL";
  marksHash: string; // 32-byte Keccak-256 hash committed on-chain
}

/**
 * Computes a deterministic canonical Keccak-256 hash for student academic records and reports.
 * Enforces:
 * - Normalized USN (trimmed, uppercase)
 * - Fixed field order: USN:PERCENTAGE:[SUBJECTS]
 * - Consistent number formatting: 2 decimal places for percentage and marks
 * - Subjects strictly sorted alphabetically by subjectCode
 * - Zero timestamps or non-deterministic / random values
 */
export function computeCanonicalRecordHash(
  usn: string,
  percentage: number,
  subjects: { subjectCode: string; total?: number | null; maxMarks?: number | null }[] = []
): string {
  const cleanUsn = (usn || "").trim().toUpperCase();
  const normPct = (Math.max(0, Math.min(100, Number(percentage) || 0))).toFixed(2);

  const sortedSubs = [...subjects].sort((a, b) =>
    (a.subjectCode || "").trim().toUpperCase().localeCompare((b.subjectCode || "").trim().toUpperCase())
  );

  const subjectsDigest = sortedSubs
    .map((s) => {
      const code = (s.subjectCode || "").trim().toUpperCase();
      const total = Number(s.total || 0).toFixed(2);
      const max = Number(s.maxMarks || 100).toFixed(2);
      return `${code}:${total}/${max}`;
    })
    .join(",");

  const payload = `${cleanUsn}:${normPct}:[${subjectsDigest}]`;
  return ethers.keccak256(ethers.toUtf8Bytes(payload));
}

export function evaluateStudentMarks(
  usn: string,
  rawSubjects: SubjectInput[],
  fallbackPercentage?: number
): StudentMarksEvaluation {
  const cleanUsn = usn.trim().toUpperCase();

  // If no detailed subject breakdown is available, evaluate from aggregate percentage
  if (!rawSubjects || rawSubjects.length === 0) {
    const pct = fallbackPercentage ?? 0;
    const gradeInfo = getGradeFromPercentage(pct);
    const marksHash = computeCanonicalRecordHash(cleanUsn, pct, []);

    return {
      subjects: [],
      totalMarks: pct,
      maxTotalMarks: 100,
      percentage: Math.round(pct * 100) / 100,
      overallGrade: gradeInfo.grade,
      overallResult: gradeInfo.result,
      marksHash,
    };
  }

  let totalMarks = 0;
  let maxTotalMarks = 0;
  let hasAnyFail = false;

  const evaluatedSubjects: EvaluatedSubject[] = rawSubjects.map((sub) => {
    const code = (sub.subjectCode || "").trim().toUpperCase();
    const name = (sub.subjectName || code).trim();
    const sem = Number(sub.semester) || 1;
    const internal = sub.internalMarks != null ? Math.max(0, Number(sub.internalMarks)) : 0;
    const external = sub.externalMarks != null ? Math.max(0, Number(sub.externalMarks)) : 0;
    const maxMarks = sub.maxMarks != null && Number(sub.maxMarks) > 0 ? Number(sub.maxMarks) : 100;

    let total = sub.total != null && Number(sub.total) > 0 ? Number(sub.total) : internal + external;
    total = Math.min(total, maxMarks);

    const subPct = maxMarks > 0 ? (total / maxMarks) * 100 : 0;
    const gradeInfo = getGradeFromPercentage(subPct);

    // Fail if subject percentage is below passing cutoff (<40%) or external component is below institutional threshold (<18)
    const isSubjectFail = gradeInfo.result === "FAIL" || (sub.externalMarks != null && Number(sub.externalMarks) < 18);
    if (isSubjectFail) {
      hasAnyFail = true;
    }

    totalMarks += total;
    maxTotalMarks += maxMarks;

    return {
      subjectCode: code,
      subjectName: name,
      semester: sem,
      internalMarks: Math.round(internal * 100) / 100,
      externalMarks: Math.round(external * 100) / 100,
      total: Math.round(total * 100) / 100,
      maxMarks: Math.round(maxMarks * 100) / 100,
      percentage: Math.round(subPct * 100) / 100,
      grade: isSubjectFail ? "F" : sub.grade || gradeInfo.grade,
      result: isSubjectFail ? "FAIL" : (sub.result as any) || gradeInfo.result,
    };
  });

  const aggregatePercentage =
    maxTotalMarks > 0 ? Math.round((totalMarks / maxTotalMarks) * 10000) / 100 : fallbackPercentage ?? 0;

  const overallGradeInfo = getGradeFromPercentage(aggregatePercentage);
  const overallResult = hasAnyFail ? "FAIL" : overallGradeInfo.result;

  const marksHash = computeCanonicalRecordHash(cleanUsn, aggregatePercentage, evaluatedSubjects);

  return {
    subjects: evaluatedSubjects,
    totalMarks: Math.round(totalMarks * 100) / 100,
    maxTotalMarks: Math.round(maxTotalMarks * 100) / 100,
    percentage: aggregatePercentage,
    overallGrade: hasAnyFail ? "F" : overallGradeInfo.grade,
    overallResult,
    marksHash,
  };
}

/**
 * -----------------------------------------------------------------------------
 * 3. CSV INJECTION PROTECTION (FORMULA INJECTION DEFENSE)
 * Prefixes cells beginning with =, +, -, @, \t, or \r with an apostrophe.
 * -----------------------------------------------------------------------------
 */
export function sanitizeForCsvExport(value: any): string {
  if (value == null) return "";
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * -----------------------------------------------------------------------------
 * 4. SERVER-SIDE MARKS VALIDATOR
 * Rejects NaN, negative marks, internal/external exceeding max,
 * maxMarks outside 1-1000, empty or excessively long subject codes/names.
 * -----------------------------------------------------------------------------
 */
export function validateSubjectMarks(
  subjects?: SubjectInput[] | null,
  fallbackPercentage?: number
): { valid: boolean; error?: string } {
  if (fallbackPercentage !== undefined && fallbackPercentage !== null) {
    const fp = Number(fallbackPercentage);
    if (isNaN(fp) || fp < 0 || fp > 100) {
      return { valid: false, error: "Invalid fallback percentage: must be a number between 0 and 100." };
    }
  }

  if (!subjects || subjects.length === 0) {
    return { valid: true };
  }

  for (let i = 0; i < subjects.length; i++) {
    const sub = subjects[i];
    const subIndex = i + 1;

    // 1. subjectCode validation: non-empty string, max 30 chars
    if (!sub.subjectCode || typeof sub.subjectCode !== "string" || sub.subjectCode.trim().length === 0) {
      return { valid: false, error: `Subject #${subIndex}: subject code cannot be empty.` };
    }
    if (sub.subjectCode.trim().length > 30) {
      return { valid: false, error: `Subject #${subIndex} ('${sub.subjectCode}'): subject code too long (max 30 characters).` };
    }

    // 2. subjectName validation: non-empty string, max 100 chars
    if (!sub.subjectName || typeof sub.subjectName !== "string" || sub.subjectName.trim().length === 0) {
      return { valid: false, error: `Subject #${subIndex}: subject name cannot be empty.` };
    }
    if (sub.subjectName.trim().length > 100) {
      return { valid: false, error: `Subject #${subIndex} ('${sub.subjectName}'): subject name too long (max 100 characters).` };
    }

    // 3. maxMarks validation: must be a valid number between 1 and 1000
    if (sub.maxMarks === undefined || sub.maxMarks === null || isNaN(Number(sub.maxMarks))) {
      return { valid: false, error: `Subject '${sub.subjectCode}': maxMarks cannot be NaN or empty.` };
    }
    const maxMarks = Number(sub.maxMarks);
    if (maxMarks < 1 || maxMarks > 1000) {
      return { valid: false, error: `Subject '${sub.subjectCode}': maxMarks (${maxMarks}) must be between 1 and 1000.` };
    }

    // 4. internalMarks validation: if present, not NaN, not negative, not > maxMarks
    if (sub.internalMarks !== undefined && sub.internalMarks !== null) {
      const internal = Number(sub.internalMarks);
      if (isNaN(internal)) {
        return { valid: false, error: `Subject '${sub.subjectCode}': internal marks cannot be NaN.` };
      }
      if (internal < 0) {
        return { valid: false, error: `Subject '${sub.subjectCode}': internal marks (${internal}) cannot be negative.` };
      }
      if (internal > maxMarks) {
        return { valid: false, error: `Subject '${sub.subjectCode}': internal marks (${internal}) cannot exceed max marks (${maxMarks}).` };
      }
    }

    // 5. externalMarks validation: if present, not NaN, not negative, not > maxMarks
    if (sub.externalMarks !== undefined && sub.externalMarks !== null) {
      const external = Number(sub.externalMarks);
      if (isNaN(external)) {
        return { valid: false, error: `Subject '${sub.subjectCode}': external marks cannot be NaN.` };
      }
      if (external < 0) {
        return { valid: false, error: `Subject '${sub.subjectCode}': external marks (${external}) cannot be negative.` };
      }
      if (external > maxMarks) {
        return { valid: false, error: `Subject '${sub.subjectCode}': external marks (${external}) cannot exceed max marks (${maxMarks}).` };
      }
    }

    // 6. total validation: if present, not NaN, not negative, not > maxMarks
    if (sub.total !== undefined && sub.total !== null) {
      const total = Number(sub.total);
      if (isNaN(total)) {
        return { valid: false, error: `Subject '${sub.subjectCode}': total marks cannot be NaN.` };
      }
      if (total < 0) {
        return { valid: false, error: `Subject '${sub.subjectCode}': total marks (${total}) cannot be negative.` };
      }
      if (total > maxMarks) {
        return { valid: false, error: `Subject '${sub.subjectCode}': total marks (${total}) cannot exceed max marks (${maxMarks}).` };
      }
    }

    // 7. Combined internal + external sum check
    if (
      sub.internalMarks !== undefined &&
      sub.internalMarks !== null &&
      sub.externalMarks !== undefined &&
      sub.externalMarks !== null
    ) {
      const sum = Number(sub.internalMarks) + Number(sub.externalMarks);
      if (sum > maxMarks) {
        return { valid: false, error: `Subject '${sub.subjectCode}': sum of internal and external marks (${sum}) exceeds max marks (${maxMarks}).` };
      }
    }
  }

  return { valid: true };
}

