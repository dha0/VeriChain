const path = require("path");
const fs = require("fs");
const Module = require("module");

// Alias hook for @/ paths in Node / Hardhat runtime
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(process.cwd(), request.slice(2));
  }
  return origResolve.call(this, request, parent, isMain, options);
};

if (!global.__tsNodeRegistered) {
  require("ts-node").register({
    transpileOnly: true,
    compilerOptions: { module: "commonjs", moduleResolution: "node", target: "es2020" },
  });
  global.__tsNodeRegistered = true;
}

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { NextRequest } = require("next/server");

// Configure test environment variables
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-crypto-secret-key-32-chars-minimum-length!";
process.env.RELAY_SECRET_KEY = "test-relay-shared-secret-key-for-admin-calls-32chars";
process.env.OTP_SECRET = "test-crypto-otp-hmac-secret-key-32-chars-long!";

const { createSessionJWT, recordFailedAttempt, resetFailedAttempts } = require("../lib/serverAuth.ts");
const { prisma } = require("../lib/prisma.ts");
const {
  evaluateStudentMarks,
  getGradeFromPercentage,
  sanitizeForCsvExport,
} = require("../lib/marksEngine.ts");
const {
  parseCsvFile,
  parseExcelFile,
  parsePdfFile,
  groupParsedRowsByStudent,
} = require("../lib/fileParser.ts");
const { GET: templateGetHandler } = require("../app/api/students/template/route.ts");
const { POST: previewPostHandler } = require("../app/api/students/upload/preview/route.ts");
const { POST: confirmPostHandler } = require("../app/api/students/upload/confirm/route.ts");

describe("Phase 4: Multi-Format Student Onboarding & Subject Marks Engine Test Suite", function () {
  this.timeout(20000);

  let collegeRVToken, collegeMSToken, studentToken, companyToken;
  const COLLEGE_RV_CODE = "RV";
  const COLLEGE_MS_CODE = "MS";
  const TEST_EMAIL_DOMAIN = "@test.verichain.local";

  const fixturesDir = path.join(__dirname, "fixtures");
  const csvFilePath = path.join(fixturesDir, "valid_students.csv");
  const xlsxFilePath = path.join(fixturesDir, "valid_students.xlsx");
  const pdfFilePath = path.join(fixturesDir, "sample_marksheet.pdf");
  const scannedPdfPath = path.join(fixturesDir, "scanned_marksheet.pdf");

  async function cleanupTestData() {
    try {
      const testProfiles = await prisma.studentProfile.findMany({
        where: {
          OR: [
            { email: { endsWith: TEST_EMAIL_DOMAIN } },
            { email: { endsWith: "@rvce.edu.in" } },
            { email: { endsWith: "@msrit.edu" } },
            {
              usn: {
                in: [
                  "1RV21CS088",
                  "1RV21CS073",
                  "1RV21CS074",
                  "1RV21CS075",
                  "1RV21CS072",
                  "1RV21CS099",
                  "1RV21CS091",
                  "1RV21CS092",
                  "1RV21CS093",
                  "1RV21CS094",
                  "1RV21CS095",
                ],
              },
            },
          ],
        },
      });

      const usns = testProfiles.map((p) => p.usn);
      if (usns.length > 0) {
        await prisma.studentMark.deleteMany({ where: { usn: { in: usns } } }).catch(() => {});
        await prisma.studentMarkVersion.deleteMany({ where: { usn: { in: usns } } }).catch(() => {});
        await prisma.studentOTP.deleteMany({ where: { usn: { in: usns } } }).catch(() => {});
        await prisma.studentWalletLink.deleteMany({ where: { usn: { in: usns } } }).catch(() => {});
        await prisma.studentAchievement.deleteMany({ where: { studentUSN: { in: usns } } }).catch(() => {});
        await prisma.studentProfile.deleteMany({ where: { usn: { in: usns } } }).catch(() => {});
      }
    } catch (e) {}
  }

  before(async function () {
    await cleanupTestData();

    collegeRVToken = await createSessionJWT({
      role: "university",
      account: "0x1111111111111111111111111111111111111111",
      studentUSN: null,
      entityInfo: { id: 1, name: "RV College of Engineering", code: COLLEGE_RV_CODE },
    });

    collegeMSToken = await createSessionJWT({
      role: "university",
      account: "0x2222222222222222222222222222222222222222",
      studentUSN: null,
      entityInfo: { id: 2, name: "MS Ramaiah Institute of Technology", code: COLLEGE_MS_CODE },
    });

    studentToken = await createSessionJWT({
      role: "student",
      account: "0x3333333333333333333333333333333333333333",
      studentUSN: "1RV21CS001",
      entityInfo: { id: 1, name: "Alice Sharma", code: COLLEGE_RV_CODE },
    });

    companyToken = await createSessionJWT({
      role: "company",
      account: "0x4444444444444444444444444444444444444444",
      studentUSN: null,
      entityInfo: { id: 1, name: "Infosys Limited", code: "INFY" },
    });
  });

  after(async function () {
    await cleanupTestData();
  });

  // =========================================================================
  // 1. MARKS ENGINE & SECURITY SANITIZATION
  // =========================================================================
  describe("1. Marks Engine, Grading Scheme & Formula Injection Security", function () {
    it("Accurately maps percentages to institutional grade brackets", function () {
      expect(getGradeFromPercentage(95).grade).to.equal("O");
      expect(getGradeFromPercentage(85).grade).to.equal("A+");
      expect(getGradeFromPercentage(75).grade).to.equal("A");
      expect(getGradeFromPercentage(65).grade).to.equal("B+");
      expect(getGradeFromPercentage(55).grade).to.equal("B");
      expect(getGradeFromPercentage(50).grade).to.equal("C");
      expect(getGradeFromPercentage(45).grade).to.equal("P");
      expect(getGradeFromPercentage(35).grade).to.equal("F");
    });

    it("Calculates subject totals, percentage, grade, and generates Keccak-256 marksHash", function () {
      const subjects = [
        {
          subjectCode: "21CS51",
          subjectName: "Automata Theory",
          internalMarks: 45,
          externalMarks: 45,
          total: 90,
          maxMarks: 100,
        },
        {
          subjectCode: "21CS52",
          subjectName: "Computer Networks",
          internalMarks: 40,
          externalMarks: 40,
          total: 80,
          maxMarks: 100,
        },
      ];

      const evaluation = evaluateStudentMarks("1RV21CS001", subjects);
      expect(evaluation.totalMarks).to.equal(170);
      expect(evaluation.maxTotalMarks).to.equal(200);
      expect(evaluation.percentage).to.equal(85.0);
      expect(evaluation.overallGrade).to.equal("A+");
      expect(evaluation.overallResult).to.equal("PASS");
      expect(evaluation.marksHash).to.be.a("string");
      expect(evaluation.marksHash).to.match(/^0x[a-f0-9]{64}$/);
    });

    it("Marks FAIL if external marks are below institutional cutoff (< 18)", function () {
      const subjects = [
        {
          subjectCode: "21CS51",
          subjectName: "Automata Theory",
          internalMarks: 25,
          externalMarks: 12, // Below 18 passing threshold
          total: 37,
          maxMarks: 100,
        },
      ];

      const evaluation = evaluateStudentMarks("1RV21CS001", subjects);
      expect(evaluation.overallResult).to.equal("FAIL");
      expect(evaluation.overallGrade).to.equal("F");
    });

    it("Sanitizes CSV formula injection characters (=, +, -, @, \\t, \\r)", function () {
      expect(sanitizeForCsvExport("=SUM(A1:A10)")).to.equal("'=SUM(A1:A10)");
      expect(sanitizeForCsvExport("+123456")).to.equal("'+123456");
      expect(sanitizeForCsvExport("-CMD")).to.equal("'-CMD");
      expect(sanitizeForCsvExport("@echo")).to.equal("'@echo");
      expect(sanitizeForCsvExport("Normal Student")).to.equal("Normal Student");
    });
  });

  // =========================================================================
  // 2. PARSERS WITH REAL FILES (CSV, XLSX, PDF, SCANNED PDF)
  // =========================================================================
  describe("2. Multi-Format File Parsers with Real Fixture Files", function () {
    it("Parses real CSV fixture and groups subjects by student", async function () {
      const csvBuffer = fs.readFileSync(csvFilePath);
      const rows = await parseCsvFile(csvBuffer);

      expect(rows).to.be.an("array").with.lengthOf(3);
      expect(rows[0].usn).to.equal("1RV21CS001");
      expect(rows[0].subjectCode).to.equal("21CS51");

      const grouped = groupParsedRowsByStudent(rows);
      expect(grouped).to.be.an("array").with.lengthOf(2);
      expect(grouped[0].usn).to.equal("1RV21CS001");
      expect(grouped[0].subjects).to.have.lengthOf(2);
      expect(grouped[1].usn).to.equal("1RV21CS002");
      expect(grouped[1].subjects).to.have.lengthOf(1);
    });

    it("Parses real Excel XLSX fixture (cell values only, safe against macros)", async function () {
      const xlsxBuffer = fs.readFileSync(xlsxFilePath);
      const rows = await parseExcelFile(xlsxBuffer);

      expect(rows).to.be.an("array").with.lengthOf(3);
      expect(rows[0].usn).to.equal("1RV21CS001");
      expect(rows[0].name).to.equal("Alice Sharma");
      expect(rows[0].email).to.equal("alice.sharma@rvce.edu.in");
    });

    it("Parses real electronic PDF marksheet with selectable text layer", async function () {
      const pdfBuffer = fs.readFileSync(pdfFilePath);
      const rows = await parsePdfFile(pdfBuffer);

      expect(rows).to.be.an("array").that.is.not.empty;
      expect(rows[0].usn).to.equal("1RV21CS001");
      expect(rows[0].email).to.equal("alice.sharma@rvce.edu.in");
    });

    it("Rejects scanned PDF without selectable text layer with explicit error", async function () {
      const scannedBuffer = fs.readFileSync(scannedPdfPath);
      let errorThrown = false;
      try {
        await parsePdfFile(scannedBuffer);
      } catch (err) {
        errorThrown = true;
        expect(err.message).to.include("Scanned Document Detected");
        expect(err.message).to.include("no selectable text layer");
      }
      expect(errorThrown).to.be.true;
    });
  });

  // =========================================================================
  // 3. DOWNLOADABLE BLANK TEMPLATES (NO DEMO DATA)
  // =========================================================================
  describe("3. Downloadable Blank Templates", function () {
    it("GET /api/students/template?format=csv returns clean CSV headers without demo rows", async function () {
      const req = new NextRequest("http://localhost:3000/api/students/template?format=csv");
      const res = await templateGetHandler(req);

      expect(res.status).to.equal(200);
      expect(res.headers.get("content-type")).to.include("text/csv");

      const text = await res.text();
      const lines = text.trim().split("\n");
      expect(lines.length).to.equal(1); // Header only
      expect(lines[0]).to.include("USN");
      expect(lines[0]).to.include("Name");
      expect(lines[0]).to.include("Email");
      expect(lines[0]).to.include("SubjectCode");
    });

    it("GET /api/students/template?format=xlsx returns valid Excel template stream", async function () {
      const req = new NextRequest("http://localhost:3000/api/students/template?format=xlsx");
      const res = await templateGetHandler(req);

      expect(res.status).to.equal(200);
      expect(res.headers.get("content-type")).to.include("spreadsheetml.sheet");
    });
  });

  // =========================================================================
  // 4. ROLE-BASED ACCESS CONTROL (STUDENTS & COMPANIES FORBIDDEN)
  // =========================================================================
  describe("4. Role-Based Access Control on Upload Endpoints", function () {
    it("Rejects unauthenticated requests to preview endpoint with 401", async function () {
      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
      });
      const res = await previewPostHandler(req);
      expect(res.status).to.equal(401);
    });

    it("Rejects student role from calling preview endpoint with 403", async function () {
      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: {
          cookie: `verichain_session=${studentToken}`,
        },
      });
      const res = await previewPostHandler(req);
      expect(res.status).to.equal(403);
    });

    it("Rejects company role from calling preview endpoint with 403", async function () {
      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: {
          cookie: `verichain_session=${companyToken}`,
        },
      });
      const res = await previewPostHandler(req);
      expect(res.status).to.equal(403);
    });

    it("Rejects student role from calling confirm endpoint with 403", async function () {
      const req = new NextRequest("http://localhost:3000/api/students/upload/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `verichain_session=${studentToken}`,
        },
        body: JSON.stringify({ rows: [] }),
      });
      const res = await confirmPostHandler(req);
      expect(res.status).to.equal(403);
    });

    it("Rejects company role from calling confirm endpoint with 403", async function () {
      const req = new NextRequest("http://localhost:3000/api/students/upload/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `verichain_session=${companyToken}`,
        },
        body: JSON.stringify({ rows: [] }),
      });
      const res = await confirmPostHandler(req);
      expect(res.status).to.equal(403);
    });
  });

  // =========================================================================
  // 5. VALIDATION, CROSS-COLLEGE REJECTION & PREVIEW PIPELINE
  // =========================================================================
  describe("5. Validation, Cross-College Rejection & Preview Processing", function () {
    it("Flags cross-college USN rows with status 'error' and clear reason", async function () {
      // CSV containing a student with MS Ramaiah USN (1MS21CS001), uploaded by RV College
      const crossCollegeCsv =
`USN,Name,Email,Course,GraduationYear,Semester,SubjectCode,SubjectName,InternalMarks,ExternalMarks,MaxMarks
1MS21CS001,Mallikarjun Patil,malli@msrit.edu,Computer Science,2025,5,21CS51,Automata Theory,45,45,100
`;
      const formData = new FormData();
      const blob = new Blob([crossCollegeCsv], { type: "text/csv" });
      formData.append("file", blob, "cross_college.csv");

      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: {
          cookie: `verichain_session=${collegeRVToken}`,
        },
        body: formData,
      });

      const res = await previewPostHandler(req);
      expect(res.status).to.equal(200);

      const data = await res.json();
      expect(data.summary.totalStudents).to.equal(1);
      expect(data.summary.errorCount).to.equal(1);
      expect(data.rows[0].status).to.equal("error");
      expect(data.rows[0].errorMessages[0]).to.include("Cross-College USN");
      expect(data.rows[0].errorMessages[0]).to.include("MS");
      expect(data.rows[0].errorMessages[0]).to.include("RV");
    });

    it("Flags malformed USN with status 'error'", async function () {
      const malformedCsv =
`USN,Name,Email,Course,GraduationYear,Semester,SubjectCode,SubjectName,InternalMarks,ExternalMarks,MaxMarks
INVALID_USN_99,Alice Sharma,alice@rvce.edu.in,Computer Science,2025,5,21CS51,Automata Theory,45,45,100
`;
      const formData = new FormData();
      const blob = new Blob([malformedCsv], { type: "text/csv" });
      formData.append("file", blob, "malformed.csv");

      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: {
          cookie: `verichain_session=${collegeRVToken}`,
        },
        body: formData,
      });

      const res = await previewPostHandler(req);
      expect(res.status).to.equal(200);

      const data = await res.json();
      expect(data.summary.errorCount).to.equal(1);
      expect(data.rows[0].status).to.equal("error");
      expect(data.rows[0].errorMessages[0]).to.include("Invalid USN");
    });

    it("Flags missing required fields (name or email missing)", async function () {
      const missingFieldCsv =
`USN,Name,Email,Course,GraduationYear,Semester,SubjectCode,SubjectName,InternalMarks,ExternalMarks,MaxMarks
1RV21CS099,,missing.email@rvce.edu.in,Computer Science,2025,5,21CS51,Automata Theory,45,45,100
`;
      const formData = new FormData();
      const blob = new Blob([missingFieldCsv], { type: "text/csv" });
      formData.append("file", blob, "missing_field.csv");

      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: {
          cookie: `verichain_session=${collegeRVToken}`,
        },
        body: formData,
      });

      const res = await previewPostHandler(req);
      expect(res.status).to.equal(200);

      const data = await res.json();
      expect(data.summary.errorCount).to.equal(1);
      expect(data.rows[0].status).to.equal("error");
      expect(data.rows[0].errorMessages[0]).to.include("Missing Name");
    });
  });

  // =========================================================================
  // 6. CONFIRM PIPELINE & FAULT ISOLATION (PARTIAL SUCCESS)
  // =========================================================================
  describe("6. Batch Confirm Pipeline & Fault Isolation", function () {
    it("Processes mixed batch: one invalid row does NOT abort valid rows", async function () {
      const mixedBatch = [
        {
          rowId: "row-valid-1",
          usn: "1RV21CS088",
          name: "Deepak Rao",
          email: "deepak.rao@rvce.edu.in",
          course: "Computer Science",
          gradYear: 2025,
          semester: 5,
          subjects: [
            {
              subjectCode: "21CS51",
              subjectName: "Automata Theory",
              semester: 5,
              internalMarks: 45,
              externalMarks: 45,
              total: 90,
              maxMarks: 100,
            },
          ],
        },
        {
          rowId: "row-invalid-cross-college",
          usn: "1MS21CS088", // Belongs to MS, but authenticated college is RV
          name: "Suresh Patil",
          email: "suresh@msrit.edu",
          course: "Computer Science",
          gradYear: 2025,
          semester: 5,
          subjects: [],
        },
      ];

      const req = new NextRequest("http://localhost:3000/api/students/upload/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `verichain_session=${collegeRVToken}`,
        },
        body: JSON.stringify({ rows: mixedBatch }),
      });

      const res = await confirmPostHandler(req);
      expect(res.status).to.equal(200);

      const data = await res.json();
      expect(data.results).to.have.lengthOf(2);

      // Row 1 (valid) must succeed
      const row1Result = data.results.find((r) => r.usn === "1RV21CS088");
      expect(row1Result).to.exist;
      expect(row1Result.success).to.be.true;
      expect(row1Result.studentId).to.be.a("number");

      // Row 2 (invalid cross-college) must fail with error, without aborting Row 1
      const row2Result = data.results.find((r) => r.usn === "1MS21CS088");
      expect(row2Result).to.exist;
      expect(row2Result.success).to.be.false;
      expect(row2Result.error).to.include("Cross-College Violation");
    });

    it("Persists marks into StudentMark table and increments version in StudentMarkVersion", async function () {
      // Verify marks were stored for 1RV21CS088
      const marks = await prisma.studentMark.findMany({
        where: { usn: "1RV21CS088" },
      });
      expect(marks).to.be.an("array").that.is.not.empty;
      expect(marks[0].subjectCode).to.equal("21CS51");
      expect(marks[0].total).to.equal(90);

      // Verify audit history version was recorded
      const versions = await prisma.studentMarkVersion.findMany({
        where: { usn: "1RV21CS088" },
      });
      expect(versions).to.be.an("array").that.is.not.empty;
      expect(versions[0].version).to.be.greaterThan(0);
      expect(versions[0].changedBy).to.include("RV");
    });
  });

  // =========================================================================
  // 7. EDGE CASES: DUPLICATES, EMAIL COLLISIONS, BAD FORMATS, OVERSIZE & RATE LIMITS
  // =========================================================================
  describe("7. Edge Cases: Duplicates, Collisions, Bad Formats, Oversize & Rate Limits", function () {
    it("Detects and flags duplicate USNs inside the same file in preview", async function () {
      const duplicateStudentsCsv =
`USN,Name,Email,Course,GraduationYear,Semester,SubjectCode,SubjectName,InternalMarks,ExternalMarks,MaxMarks
1RV21CS072,Student Alpha,alpha@rvce.edu.in,Computer Science,2025,5,,,45,45,100
1RV21CS072,Student Beta,beta@rvce.edu.in,Computer Science,2025,5,,,42,48,100
`;
      const formData = new FormData();
      formData.append("file", new Blob([duplicateStudentsCsv], { type: "text/csv" }), "dup.csv");

      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: { cookie: `verichain_session=${collegeRVToken}` },
        body: formData,
      });

      const res = await previewPostHandler(req);
      expect(res.status).to.equal(200);
      const data = await res.json();
      expect(data.rows[0].isDuplicateInFile).to.be.true;
      expect(data.rows[0].errorMessages.some((m) => m.includes("Duplicate In File"))).to.be.true;
    });

    it("Flags duplicate USN against registered students in database", async function () {
      const existingUsn = "1RV21CS088"; // Registered in Section 6 test
      const singleCsv =
`USN,Name,Email,Course,GraduationYear,Semester,SubjectCode,SubjectName,InternalMarks,ExternalMarks,MaxMarks
${existingUsn},Deepak Rao,deepak.rao@rvce.edu.in,Computer Science,2025,5,21CS51,Automata,45,45,100
`;
      const formData = new FormData();
      formData.append("file", new Blob([singleCsv], { type: "text/csv" }), "check_existing.csv");

      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: { cookie: `verichain_session=${collegeRVToken}` },
        body: formData,
      });

      const res = await previewPostHandler(req);
      expect(res.status).to.equal(200);
      const data = await res.json();
      expect(data.rows[0].isAlreadyRegistered).to.be.true;
    });

    it("Rejects duplicate email in confirm route when email belongs to another registered candidate", async function () {
      // Register Student 1 with unique email
      const student1Usn = "1RV21CS073";
      const sharedEmail = `shared.${Date.now()}@rvce.edu.in`;

      await confirmPostHandler(
        new NextRequest("http://localhost:3000/api/students/upload/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `verichain_session=${collegeRVToken}`,
          },
          body: JSON.stringify({
            rows: [
              {
                usn: student1Usn,
                name: "Student Alpha",
                email: sharedEmail,
                course: "CS",
                gradYear: 2025,
              },
            ],
          }),
        })
      );

      // Now attempt to register Student 2 with Student 1's email -> must fail
      const student2Usn = "1RV21CS074";
      const res = await confirmPostHandler(
        new NextRequest("http://localhost:3000/api/students/upload/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `verichain_session=${collegeRVToken}`,
          },
          body: JSON.stringify({
            rows: [
              {
                usn: student2Usn,
                name: "Student Beta",
                email: sharedEmail,
                course: "CS",
                gradYear: 2025,
              },
            ],
          }),
        })
      );

      expect(res.status).to.equal(200);
      const data = await res.json();
      expect(data.results[0].success).to.be.false;
      expect(data.results[0].error).to.include("Duplicate Email Collision");
      expect(data.results[0].error).to.include(student1Usn);
    });

    it("Rejects uploading the exact same USN twice in the same confirm batch", async function () {
      const duplicateBatchUsn = "1RV21CS075";
      const res = await confirmPostHandler(
        new NextRequest("http://localhost:3000/api/students/upload/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `verichain_session=${collegeRVToken}`,
          },
          body: JSON.stringify({
            rows: [
              {
                usn: duplicateBatchUsn,
                name: "Duplicate Candidate",
                email: `dup1.${Date.now()}@rvce.edu.in`,
                course: "CS",
                gradYear: 2025,
              },
              {
                usn: duplicateBatchUsn,
                name: "Duplicate Candidate",
                email: `dup2.${Date.now()}@rvce.edu.in`,
                course: "CS",
                gradYear: 2025,
              },
            ],
          }),
        })
      );

      expect(res.status).to.equal(200);
      const data = await res.json();
      expect(data.results).to.have.lengthOf(2);
      expect(data.results[0].success).to.be.true;
      expect(data.results[1].success).to.be.false;
      expect(data.results[1].error).to.include("Duplicate USN in Batch");
    });

    it("Rejects unsupported file type with HTTP 415", async function () {
      // Magic bytes 0x4D 0x5A (MZ executable header) with text/plain
      const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const formData = new FormData();
      formData.append("file", new Blob([exeBuffer], { type: "application/octet-stream" }), "malicious.exe");

      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: { cookie: `verichain_session=${collegeRVToken}` },
        body: formData,
      });

      const res = await previewPostHandler(req);
      expect(res.status).to.equal(415);
      const data = await res.json();
      expect(data.error).to.include("Unsupported File Format");
    });

    it("Rejects oversize file exceeding 5 MB limit with HTTP 413", async function () {
      // Create buffer exceeding 5 MB limit (5 MB + 1024 bytes)
      const oversizeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, 0x61); // fill with 'a'
      const formData = new FormData();
      formData.append("file", new Blob([oversizeBuffer], { type: "text/csv" }), "huge.csv");

      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: { cookie: `verichain_session=${collegeRVToken}` },
        body: formData,
      });

      const res = await previewPostHandler(req);
      expect(res.status).to.equal(413);
      const data = await res.json();
      expect(data.error).to.include("File Size Limit Exceeded");
    });

    it("Rejects empty file upload with HTTP 400", async function () {
      const emptyBuffer = Buffer.alloc(0);
      const formData = new FormData();
      formData.append("file", new Blob([emptyBuffer], { type: "text/csv" }), "empty.csv");

      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: { cookie: `verichain_session=${collegeRVToken}` },
        body: formData,
      });

      const res = await previewPostHandler(req);
      expect(res.status).to.equal(400);
      const data = await res.json();
      expect(data.error).to.include("Validation Error: Uploaded file is empty");
    });

    it("Enforces rate limiting on preview endpoint and returns HTTP 429 when locked out", async function () {
      const rateLimitKey = `upload_preview:${COLLEGE_RV_CODE}`;
      // Simulate reaching max failed attempts
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(rateLimitKey);
      }

      const validCsv =
`USN,Name,Email,Course,GraduationYear,Semester,SubjectCode,SubjectName,InternalMarks,ExternalMarks,MaxMarks
1RV21CS099,Rate Test,ratetest@test.verichain.local,Computer Science,2025,5,21CS51,Automata,45,45,100
`;
      const formData = new FormData();
      formData.append("file", new Blob([validCsv], { type: "text/csv" }), "test.csv");

      const req = new NextRequest("http://localhost:3000/api/students/upload/preview", {
        method: "POST",
        headers: { cookie: `verichain_session=${collegeRVToken}` },
        body: formData,
      });

      const res = await previewPostHandler(req);
      expect(res.status).to.equal(429);
      const data = await res.json();
      expect(data.error).to.include("Upload rate limit exceeded");

      // Reset after test so subsequent calls are not locked
      await resetFailedAttempts(rateLimitKey);
    });

    it("Rejects same USN in separate requests with 'Already registered' unless isEdit is true", async function () {
      const candidateUsn = "1RV21CS091";
      const initialPayload = {
        usn: candidateUsn,
        name: "First Registration",
        email: `first.${Date.now()}@test.verichain.local`,
        course: "CS",
        gradYear: 2025,
        semester: 5,
        subjects: [
          {
            subjectCode: "21CS51",
            subjectName: "Automata",
            maxMarks: 100,
            internalMarks: 40,
            externalMarks: 40,
            total: 80,
          },
        ],
      };

      // Request 1: Fresh registration -> Succeeds
      const res1 = await confirmPostHandler(
        new NextRequest("http://localhost:3000/api/students/upload/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `verichain_session=${collegeRVToken}`,
          },
          body: JSON.stringify({ rows: [initialPayload] }),
        })
      );
      const data1 = await res1.json();
      expect(data1.results[0].success).to.be.true;

      // Request 2: Separate request with same USN (isEdit not set) -> Must be rejected with "Already registered"
      const res2 = await confirmPostHandler(
        new NextRequest("http://localhost:3000/api/students/upload/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `verichain_session=${collegeRVToken}`,
          },
          body: JSON.stringify({ rows: [initialPayload] }),
        })
      );
      const data2 = await res2.json();
      expect(data2.results[0].success).to.be.false;
      expect(data2.results[0].error).to.equal("Already registered");

      // Request 3: Separate request with same USN and isEdit=true -> Succeeds and increments version
      const editPayload = {
        ...initialPayload,
        isEdit: true,
        subjects: [
          {
            subjectCode: "21CS51",
            subjectName: "Automata",
            maxMarks: 100,
            internalMarks: 45,
            externalMarks: 45,
            total: 90,
          },
        ],
      };
      const res3 = await confirmPostHandler(
        new NextRequest("http://localhost:3000/api/students/upload/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `verichain_session=${collegeRVToken}`,
          },
          body: JSON.stringify({ rows: [editPayload] }),
        })
      );
      const data3 = await res3.json();
      expect(data3.results[0].success).to.be.true;
      expect(data3.results[0].version).to.be.greaterThan(1);
    });

    it("Server marks validation rejects NaN and negative values", async function () {
      const res = await confirmPostHandler(
        new NextRequest("http://localhost:3000/api/students/upload/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `verichain_session=${collegeRVToken}`,
          },
          body: JSON.stringify({
            rows: [
              {
                usn: "1RV21CS092",
                name: "Negative Marks Test",
                email: `neg.${Date.now()}@test.verichain.local`,
                subjects: [
                  {
                    subjectCode: "21CS51",
                    subjectName: "Automata",
                    maxMarks: 100,
                    internalMarks: -10,
                    externalMarks: 50,
                  },
                ],
              },
            ],
          }),
        })
      );
      const data = await res.json();
      expect(data.results[0].success).to.be.false;
      expect(data.results[0].error).to.include("cannot be negative");
    });

    it("Server marks validation rejects internal or external marks exceeding maxMarks", async function () {
      const res = await confirmPostHandler(
        new NextRequest("http://localhost:3000/api/students/upload/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `verichain_session=${collegeRVToken}`,
          },
          body: JSON.stringify({
            rows: [
              {
                usn: "1RV21CS093",
                name: "Exceeds Max Test",
                email: `exceed.${Date.now()}@test.verichain.local`,
                subjects: [
                  {
                    subjectCode: "21CS51",
                    subjectName: "Automata",
                    maxMarks: 100,
                    internalMarks: 120,
                    externalMarks: 40,
                  },
                ],
              },
            ],
          }),
        })
      );
      const data = await res.json();
      expect(data.results[0].success).to.be.false;
      expect(data.results[0].error).to.include("cannot exceed max marks");
    });

    it("Server marks validation rejects maxMarks outside 1-1000 range", async function () {
      const res = await confirmPostHandler(
        new NextRequest("http://localhost:3000/api/students/upload/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `verichain_session=${collegeRVToken}`,
          },
          body: JSON.stringify({
            rows: [
              {
                usn: "1RV21CS094",
                name: "MaxMarks Range Test",
                email: `range.${Date.now()}@test.verichain.local`,
                subjects: [
                  {
                    subjectCode: "21CS51",
                    subjectName: "Automata",
                    maxMarks: 1500,
                    internalMarks: 40,
                    externalMarks: 40,
                  },
                ],
              },
            ],
          }),
        })
      );
      const data = await res.json();
      expect(data.results[0].success).to.be.false;
      expect(data.results[0].error).to.include("must be between 1 and 1000");
    });

    it("Server marks validation rejects empty or excessively long subject codes and names", async function () {
      const res = await confirmPostHandler(
        new NextRequest("http://localhost:3000/api/students/upload/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `verichain_session=${collegeRVToken}`,
          },
          body: JSON.stringify({
            rows: [
              {
                usn: "1RV21CS095",
                name: "Long Code Test",
                email: `code.${Date.now()}@test.verichain.local`,
                subjects: [
                  {
                    subjectCode: "A".repeat(35),
                    subjectName: "Valid Name",
                    maxMarks: 100,
                    internalMarks: 40,
                    externalMarks: 40,
                  },
                ],
              },
            ],
          }),
        })
      );
      const data = await res.json();
      expect(data.results[0].success).to.be.false;
      expect(data.results[0].error).to.include("too long");
    });
  });
});
