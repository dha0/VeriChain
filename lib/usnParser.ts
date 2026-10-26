/**
 * USN (University Seat Number) Parser and Validator
 *
 * Format Specification:
 * - Exactly 10 characters long
 * - Format: [digit][2-letter college code][2-digit year][2-letter branch][3-digit roll number]
 * - Example: "1RV21CS001"
 *   - Region / Affiliation Prefix: "1"
 *   - College Code: "RV" (e.g. RV College of Engineering)
 *   - Admission Year: "21" (2021)
 *   - Branch Code: "CS" (Computer Science)
 *   - Student Roll Number: "001"
 */

export interface ParsedUSN {
  valid: boolean;
  usn: string;
  collegeCode: string;
  year: number;
  branch: string;
  rollNumber: string;
  prefix: string;
  error?: string;
}

export const USN_REGEX = /^([0-9])([A-Z]{2})([0-9]{2})([A-Z]{2})([0-9]{3})$/;

/**
 * Validates and parses a Candidate USN according to the standardized college code format.
 */
export function parseAndValidateUSN(rawUsn: string | null | undefined): ParsedUSN {
  if (!rawUsn || typeof rawUsn !== "string") {
    return {
      valid: false,
      usn: "",
      collegeCode: "",
      year: 0,
      branch: "",
      rollNumber: "",
      prefix: "",
      error: "USN is mandatory and must be a string",
    };
  }

  const cleanUsn = rawUsn.trim().toUpperCase();

  if (cleanUsn.length !== 10) {
    return {
      valid: false,
      usn: cleanUsn,
      collegeCode: "",
      year: 0,
      branch: "",
      rollNumber: "",
      prefix: "",
      error: `USN must be exactly 10 characters long (received ${cleanUsn.length})`,
    };
  }

  const match = cleanUsn.match(USN_REGEX);
  if (!match) {
    return {
      valid: false,
      usn: cleanUsn,
      collegeCode: "",
      year: 0,
      branch: "",
      rollNumber: "",
      prefix: "",
      error:
        "Malformed USN format. Expected format: digit + 2-letter college code + 2-digit year + 2-letter branch + 3 digits (e.g., 1RV21CS001)",
    };
  }

  const [, prefix, collegeCode, yearStr, branch, rollNumber] = match;

  return {
    valid: true,
    usn: cleanUsn,
    collegeCode,
    year: parseInt(yearStr, 10),
    branch,
    rollNumber,
    prefix,
  };
}

/**
 * Extracts college code from a candidate USN. Returns null if malformed.
 */
export function extractCollegeCode(rawUsn: string | null | undefined): string | null {
  const result = parseAndValidateUSN(rawUsn);
  return result.valid ? result.collegeCode : null;
}
