import Papa from "papaparse";
import ExcelJS from "exceljs";
// @ts-ignore
import * as pdfParseModule from "pdf-parse";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS_ALLOWED = 500;

export class FileSizeLimitError extends Error {
  statusCode: number = 413;
  constructor(message: string) {
    super(message);
    this.name = "FileSizeLimitError";
  }
}

export class UnsupportedMediaTypeError extends Error {
  statusCode: number = 415;
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedMediaTypeError";
  }
}

export class FileValidationError extends Error {
  statusCode: number = 400;
  constructor(message: string) {
    super(message);
    this.name = "FileValidationError";
  }
}

export interface RawParsedRow {
  rowNumber: number;
  usn: string;
  name: string;
  email: string;
  course: string;
  gradYear: number;
  semester: number;
  subjectCode: string;
  subjectName: string;
  internalMarks: number | null;
  externalMarks: number | null;
  totalMarks: number | null;
  maxMarks: number | null;
  percentage: number | null;
}

export interface GroupedStudentUpload {
  usn: string;
  name: string;
  email: string;
  course: string;
  gradYear: number;
  semester: number;
  fallbackPercentage: number;
  rowNumbers: number[];
  subjects: {
    subjectCode: string;
    subjectName: string;
    semester: number;
    internalMarks: number | null;
    externalMarks: number | null;
    total: number | null;
    maxMarks: number | null;
  }[];
}

/**
 * Server-side MIME & Magic Bytes Validator
 */
export function validateFileSafety(
  buffer: Buffer,
  declaredMimeType: string,
  fileName: string
): "csv" | "xlsx" | "pdf" {
  if (!buffer || buffer.length === 0) {
    throw new FileValidationError("Validation Error: Uploaded file is empty.");
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new FileSizeLimitError(
      `File Size Limit Exceeded: File size (${(buffer.length / (1024 * 1024)).toFixed(
        2
      )} MB) exceeds the maximum allowed limit of 5.00 MB.`
    );
  }

  const lowerName = fileName.toLowerCase();

  // 1. PDF Verification: Magic bytes "%PDF-" (0x25 0x50 0x44 0x46)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return "pdf";
  }

  // 2. XLSX Verification: ZIP container magic bytes "PK\x03\x04"
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04 &&
    lowerName.endsWith(".xlsx")
  ) {
    return "xlsx";
  }

  // 3. CSV Verification: Must be valid text without binary control characters
  if (lowerName.endsWith(".csv") || declaredMimeType.includes("csv") || declaredMimeType.includes("text")) {
    // Check first 512 bytes for null bytes or binary signatures
    const sampleSize = Math.min(buffer.length, 512);
    for (let i = 0; i < sampleSize; i++) {
      if (buffer[i] === 0x00) {
        throw new UnsupportedMediaTypeError("Validation Error: Binary file uploaded with CSV extension.");
      }
    }
    return "csv";
  }

  throw new UnsupportedMediaTypeError(
    "Unsupported File Format: Only genuine CSV, XLSX (Excel), and text-layer PDF documents up to 5 MB are accepted."
  );
}

/**
 * Normalizes loose column header naming variations
 */
function normalizeHeaderKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-\.\/]+/g, "");
}

function extractFieldValue(row: Record<string, any>, possibleKeys: string[]): any {
  for (const candidate of possibleKeys) {
    const norm = normalizeHeaderKey(candidate);
    for (const [k, v] of Object.entries(row)) {
      if (normalizeHeaderKey(k) === norm) {
        return v;
      }
    }
  }
  return null;
}

/**
 * -----------------------------------------------------------------------------
 * 1. CSV PARSER (PapaParse)
 * -----------------------------------------------------------------------------
 */
export async function parseCsvFile(buffer: Buffer): Promise<RawParsedRow[]> {
  const textContent = buffer.toString("utf-8");
  const parsed = Papa.parse<Record<string, any>>(textContent, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors && parsed.errors.length > 0) {
    const firstErr = parsed.errors[0];
    if (firstErr.type !== "FieldMismatch") {
      throw new Error(`CSV Parsing Error at row ${firstErr.row}: ${firstErr.message}`);
    }
  }

  if (parsed.data.length > MAX_ROWS_ALLOWED) {
    throw new Error(
      `Row Limit Exceeded: File contains ${parsed.data.length} rows. Maximum allowed is ${MAX_ROWS_ALLOWED} rows per upload.`
    );
  }

  return parsed.data.map((row, idx) => mapRawRow(row, idx + 2)); // +2 accounting for 1-based index and header
}

/**
 * -----------------------------------------------------------------------------
 * 2. EXCEL XLSX PARSER (ExcelJS - cell values only, no formulas/macros)
 * -----------------------------------------------------------------------------
 */
export async function parseExcelFile(buffer: Buffer): Promise<RawParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  // Safe load of array buffer ignoring macros and scripts
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Excel Parsing Error: The workbook does not contain any worksheets.");
  }

  const rawRows: Record<string, any>[] = [];
  const headers: string[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      // Header row
      row.eachCell((cell, colNumber) => {
        headers[colNumber] = String(cell.text || cell.value || "").trim();
      });
      return;
    }

    if (rawRows.length >= MAX_ROWS_ALLOWED) {
      throw new Error(
        `Row Limit Exceeded: Worksheet contains more than ${MAX_ROWS_ALLOWED} rows.`
      );
    }

    const rowObj: Record<string, any> = {};
    row.eachCell((cell, colNumber) => {
      const headerName = headers[colNumber];
      if (headerName) {
        // Read strictly cell values, never execute formulas
        let val = cell.value;
        if (val && typeof val === "object") {
          if ("result" in val) {
            val = (val as any).result;
          } else if ("text" in val) {
            val = (val as any).text;
          }
        }
        rowObj[headerName] = val;
      }
    });

    if (Object.keys(rowObj).length > 0) {
      rawRows.push({ ...rowObj, _rowNumber: rowNumber });
    }
  });

  return rawRows.map((row, idx) => mapRawRow(row, row._rowNumber || idx + 2));
}

/**
 * -----------------------------------------------------------------------------
 * 3. PDF PARSER (pdf-parse text layer extraction & table detection)
 * -----------------------------------------------------------------------------
 */
export async function parsePdfFile(buffer: Buffer): Promise<RawParsedRow[]> {
  let text = "";
  try {
    const pkg: any = pdfParseModule;
    if (pkg && typeof pkg.PDFParse === "function") {
      const parser = new pkg.PDFParse({ data: buffer });
      const res = await parser.getText();
      text = (res?.text || "").trim();
    } else if (typeof pkg === "function") {
      const res = await pkg(buffer);
      text = (res?.text || "").trim();
    } else if (pkg && typeof pkg.default === "function") {
      const res = await pkg.default(buffer);
      text = (res?.text || "").trim();
    } else {
      throw new Error("Unable to locate PDF text extraction method");
    }
  } catch (err: any) {
    throw new Error(`PDF Parsing Error: Failed to read PDF stream: ${err.message}`);
  }

  // If text layer is absent or extremely sparse (excluding page counters like "-- 1 of 1 --"), it's a scanned raster image
  const cleanAlphaNum = text.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, "").trim();
  if (cleanAlphaNum.length < 30 || !/[A-Za-z0-9]/.test(cleanAlphaNum)) {
    throw new Error(
      "Scanned Document Detected: The uploaded PDF has no selectable text layer. Please provide an electronic PDF with a text layer or upload a CSV / Excel file instead."
    );
  }

  const lines = text
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  // Extract student header metadata
  let foundUsn = "";
  let foundName = "";
  let foundEmail = "";
  let foundCourse = "Computer Science";
  let foundGradYear = new Date().getFullYear();
  let foundPercentage: number | null = null;

  const usnRegex = /\b([0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3})\b/i;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

  const rows: RawParsedRow[] = [];
  let rowNumber = 1;

  for (const line of lines) {
    if (!foundUsn) {
      const match = line.match(usnRegex);
      if (match) foundUsn = match[1].toUpperCase();
    }
    if (!foundEmail) {
      const match = line.match(emailRegex);
      if (match) foundEmail = match[0].toLowerCase();
    }
    if (!foundName && /name\s*[:\-]/i.test(line)) {
      foundName = line.replace(/^.*?name\s*[:\-]\s*/i, "").trim();
    }
    if (/percentage\s*[:\-]/i.test(line) || /aggregate\s*[:\-]/i.test(line)) {
      const pctMatch = line.match(/([0-9]{1,3}(?:\.[0-9]+)?)\s*%/);
      if (pctMatch) foundPercentage = parseFloat(pctMatch[1]);
    }

    // Try to detect subject row: e.g. "21CS51 Automata Theory 45 42 87 100"
    // Or tab / multi-space separated tokens
    const tokens = line.split(/[\t,|]+|\s{2,}/).map((t: string) => t.trim());
    if (tokens.length >= 3) {
      const codeCandidate = tokens[0].toUpperCase();
      if (/^[0-9]{2}[A-Z]{2,4}[0-9]{2,3}$/.test(codeCandidate)) {
        const nameCandidate = tokens[1];
        const num1 = parseFloat(tokens[2]);
        const num2 = tokens[3] ? parseFloat(tokens[3]) : null;
        const num3 = tokens[4] ? parseFloat(tokens[4]) : null;

        rows.push({
          rowNumber: rowNumber++,
          usn: foundUsn,
          name: foundName,
          email: foundEmail,
          course: foundCourse,
          gradYear: foundGradYear,
          semester: 1,
          subjectCode: codeCandidate,
          subjectName: nameCandidate || codeCandidate,
          internalMarks: num1 != null && !isNaN(num1) ? num1 : null,
          externalMarks: num2 != null && !isNaN(num2) ? num2 : null,
          totalMarks: num3 != null && !isNaN(num3) ? num3 : num1 != null && num2 != null ? num1 + num2 : null,
          maxMarks: 100,
          percentage: null,
        });
      }
    }
  }

  // If no subject lines were detected as a table, return single student summary row
  if (rows.length === 0) {
    if (!foundUsn && !foundName) {
      throw new Error(
        "Could not detect student details or marks table in PDF text. Please verify formatting or use the CSV/Excel template."
      );
    }
    rows.push({
      rowNumber: 1,
      usn: foundUsn,
      name: foundName,
      email: foundEmail,
      course: foundCourse,
      gradYear: foundGradYear,
      semester: 1,
      subjectCode: "",
      subjectName: "",
      internalMarks: null,
      externalMarks: null,
      totalMarks: null,
      maxMarks: null,
      percentage: foundPercentage,
    });
  } else {
    // Fill in top-level student metadata for any rows that were created before USN was found
    for (const r of rows) {
      if (!r.usn) r.usn = foundUsn;
      if (!r.name) r.name = foundName;
      if (!r.email) r.email = foundEmail;
    }
  }

  return rows;
}

/**
 * Maps unstructured dictionary row into a strongly typed `RawParsedRow`
 */
function mapRawRow(row: Record<string, any>, rowNumber: number): RawParsedRow {
  const usn = String(
    extractFieldValue(row, ["usn", "studentusn", "candidateusn", "rollno", "regno"]) || ""
  ).trim().toUpperCase();

  const name = String(
    extractFieldValue(row, ["name", "studentname", "candidatename", "fullname"]) || ""
  ).trim();

  const email = String(
    extractFieldValue(row, ["email", "studentemail", "candidateemail", "mail"]) || ""
  ).trim().toLowerCase();

  const course = String(
    extractFieldValue(row, ["course", "branch", "department", "program"]) || "Computer Science"
  ).trim();

  const gradYearRaw = extractFieldValue(row, ["gradyear", "graduationyear", "batch", "year"]);
  const gradYear = gradYearRaw ? parseInt(String(gradYearRaw), 10) : new Date().getFullYear();

  const semesterRaw = extractFieldValue(row, ["semester", "sem", "term"]);
  const semester = semesterRaw ? parseInt(String(semesterRaw), 10) : 1;

  const subjectCode = String(
    extractFieldValue(row, ["subjectcode", "subcode", "coursecode", "code"]) || ""
  ).trim().toUpperCase();

  const subjectName = String(
    extractFieldValue(row, ["subjectname", "subname", "subject", "title"]) || ""
  ).trim();

  const internalRaw = extractFieldValue(row, ["internalmarks", "internal", "cie", "ia"]);
  const internalMarks = internalRaw != null && internalRaw !== "" ? parseFloat(String(internalRaw)) : null;

  const externalRaw = extractFieldValue(row, ["externalmarks", "external", "see", "exam"]);
  const externalMarks = externalRaw != null && externalRaw !== "" ? parseFloat(String(externalRaw)) : null;

  const totalRaw = extractFieldValue(row, ["totalmarks", "total", "marks"]);
  const totalMarks = totalRaw != null && totalRaw !== "" ? parseFloat(String(totalRaw)) : null;

  const maxRaw = extractFieldValue(row, ["maxmarks", "maximummarks", "max", "outoff"]);
  const maxMarks = maxRaw != null && maxRaw !== "" ? parseFloat(String(maxRaw)) : 100;

  const pctRaw = extractFieldValue(row, ["percentage", "percent", "pct", "aggregate"]);
  const percentage = pctRaw != null && pctRaw !== "" ? parseFloat(String(pctRaw)) : null;

  return {
    rowNumber,
    usn,
    name,
    email,
    course,
    gradYear: isNaN(gradYear) ? new Date().getFullYear() : gradYear,
    semester: isNaN(semester) ? 1 : semester,
    subjectCode,
    subjectName: subjectName || subjectCode,
    internalMarks: internalMarks != null && !isNaN(internalMarks) ? internalMarks : null,
    externalMarks: externalMarks != null && !isNaN(externalMarks) ? externalMarks : null,
    totalMarks: totalMarks != null && !isNaN(totalMarks) ? totalMarks : null,
    maxMarks: maxMarks != null && !isNaN(maxMarks) ? maxMarks : 100,
    percentage: percentage != null && !isNaN(percentage) ? percentage : null,
  };
}

/**
 * Groups flat rows by student USN into structured student records with subject arrays
 */
export function groupParsedRowsByStudent(rows: RawParsedRow[]): GroupedStudentUpload[] {
  const map = new Map<string, GroupedStudentUpload>();

  for (const r of rows) {
    const key = r.usn ? r.usn : `UNASSIGNED_ROW_${r.rowNumber}`;
    let student = map.get(key);

    if (!student) {
      student = {
        usn: r.usn,
        name: r.name,
        email: r.email,
        course: r.course,
        gradYear: r.gradYear,
        semester: r.semester,
        fallbackPercentage: r.percentage ?? 0,
        rowNumbers: [r.rowNumber],
        subjects: [],
      };
      map.set(key, student);
    } else {
      student.rowNumbers.push(r.rowNumber);
      if (!student.name && r.name) student.name = r.name;
      if (!student.email && r.email) student.email = r.email;
      if (!student.course && r.course) student.course = r.course;
      if (r.percentage != null && student.fallbackPercentage === 0) {
        student.fallbackPercentage = r.percentage;
      }
    }

    if (r.subjectCode) {
      student.subjects.push({
        subjectCode: r.subjectCode,
        subjectName: r.subjectName || r.subjectCode,
        semester: r.semester,
        internalMarks: r.internalMarks,
        externalMarks: r.externalMarks,
        total: r.totalMarks,
        maxMarks: r.maxMarks,
      });
    }
  }

  return Array.from(map.values());
}
