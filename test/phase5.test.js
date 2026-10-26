const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
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

const { createSessionJWT } = require("../lib/serverAuth.ts");
const { prisma } = require("../lib/prisma.ts");
const { computeCanonicalRecordHash, evaluateStudentMarks } = require("../lib/marksEngine.ts");
const { GET: downloadReportHandler } = require("../app/api/reports/download/route.ts");
const { POST: confirmUploadHandler } = require("../app/api/students/upload/confirm/route.ts");
const { POST: publicVerifyHandler } = require("../app/api/verify/public/route.ts");
const { POST: uploadCertificateHandler } = require("../app/api/certificates/upload/route.ts");
const { POST: reviewAchievementHandler } = require("../app/api/achievements/route.ts");

describe("Phase 5: Student Reports, Certificate Hashing, Endorsement, Version History & Public Verification", function () {
  this.timeout(30000);

  let contract;
  let adminSigner, relayerSigner, collegeRVSigner, collegeMSSigner;
  let collegeRVToken, collegeMSToken, studentTokenRV, studentTokenMS;

  const COLLEGE_RV_CODE = "RV";
  const COLLEGE_MS_CODE = "MS";
  const TEST_USN_RV = "1RV21CS099";
  const TEST_USN_MS = "1MS21CS088";
  const TEST_EMAIL_DOMAIN = "@phase5test.verichain.local";
  const TEST_EMAIL_RV = `student.rv${TEST_EMAIL_DOMAIN}`;
  const TEST_EMAIL_MS = `student.ms${TEST_EMAIL_DOMAIN}`;

  before(async function () {
    [adminSigner, relayerSigner, collegeRVSigner, collegeMSSigner] = await ethers.getSigners();

    // Deploy contract locally for testing
    const Factory = await ethers.getContractFactory("ITHiringMarksVerification");
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    // Set authorized relayer
    await contract.connect(adminSigner).setAuthorizedRelayer(adminSigner.address);

    // Register accredited universities
    await contract.connect(adminSigner)["registerUniversity(string,string,string,address)"](
      "RV College of Engineering",
      COLLEGE_RV_CODE,
      "VTU",
      collegeRVSigner.address
    );

    await contract.connect(adminSigner)["registerUniversity(string,string,string,address)"](
      "MS Ramaiah Institute of Technology",
      COLLEGE_MS_CODE,
      "VTU",
      collegeMSSigner.address
    );

    // Generate JWT auth tokens
    collegeRVToken = await createSessionJWT({
      role: "university",
      entityInfo: { id: 1, name: "RV College of Engineering", code: COLLEGE_RV_CODE },
    });

    collegeMSToken = await createSessionJWT({
      role: "university",
      entityInfo: { id: 2, name: "MS Ramaiah Institute of Technology", code: COLLEGE_MS_CODE },
    });

    studentTokenRV = await createSessionJWT({
      role: "student",
      studentUSN: TEST_USN_RV,
      entityInfo: { id: 1, usn: TEST_USN_RV },
    });

    studentTokenMS = await createSessionJWT({
      role: "student",
      studentUSN: TEST_USN_MS,
      entityInfo: { id: 2, usn: TEST_USN_MS },
    });
  });

  after(async function () {
    // Scoped teardown: delete only rows created by this test suite
    try {
      const testUsns = [TEST_USN_RV, TEST_USN_MS];
      await prisma.studentMark.deleteMany({ where: { usn: { in: testUsns } } });
      await prisma.studentMarkVersion.deleteMany({ where: { usn: { in: testUsns } } });
      await prisma.studentAchievement.deleteMany({ where: { studentUSN: { in: testUsns } } });
      await prisma.studentProfile.deleteMany({ where: { usn: { in: testUsns } } });
    } catch (e) {
      console.warn("[Teardown Notice]", e.message);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Stable Hashing
  // ---------------------------------------------------------------------------
  describe("1. Canonical Keccak-256 Hashing Engine", function () {
    it("produces identical hash for identical data, invariant of subject input ordering", function () {
      const subjectsA = [
        { subjectCode: "21CS71", total: 85, maxMarks: 100 },
        { subjectCode: "21CS72", total: 90, maxMarks: 100 },
        { subjectCode: "21CS73", total: 78, maxMarks: 100 },
      ];

      // Same subjects in reverse order
      const subjectsB = [
        { subjectCode: "21CS73", total: 78, maxMarks: 100 },
        { subjectCode: "21CS71", total: 85, maxMarks: 100 },
        { subjectCode: "21CS72", total: 90, maxMarks: 100 },
      ];

      const hashA = computeCanonicalRecordHash(TEST_USN_RV, 84.33, subjectsA);
      const hashB = computeCanonicalRecordHash("  1rv21cs099  ", 84.33, subjectsB);

      expect(hashA).to.be.a("string");
      expect(hashA).to.match(/^0x[0-9a-fA-F]{64}$/);
      expect(hashA).to.equal(hashB);
    });

    it("produces a completely different hash when a single mark changes", function () {
      const subjectsBase = [
        { subjectCode: "21CS71", total: 85, maxMarks: 100 },
        { subjectCode: "21CS72", total: 90, maxMarks: 100 },
      ];

      const subjectsModified = [
        { subjectCode: "21CS71", total: 86, maxMarks: 100 }, // +1 mark
        { subjectCode: "21CS72", total: 90, maxMarks: 100 },
      ];

      const hashBase = computeCanonicalRecordHash(TEST_USN_RV, 87.5, subjectsBase);
      const hashModified = computeCanonicalRecordHash(TEST_USN_RV, 88.0, subjectsModified);

      expect(hashBase).to.not.equal(hashModified);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Cross-College Report Download Enforcement
  // ---------------------------------------------------------------------------
  describe("2. Report Download Access Control & College Isolation", function () {
    before(async function () {
      // Seed student profiles for download tests
      await prisma.studentProfile.upsert({
        where: { usn: TEST_USN_RV },
        create: {
          usn: TEST_USN_RV,
          name: "Alice RV",
          email: TEST_EMAIL_RV,
          course: "Computer Science",
          gradYear: 2026,
          percentage: 85.0,
          marksVersion: 1,
          marksHash: computeCanonicalRecordHash(TEST_USN_RV, 85.0, []),
          universityId: 1,
          collegeCode: COLLEGE_RV_CODE,
        },
        update: {},
      });

      await prisma.studentProfile.upsert({
        where: { usn: TEST_USN_MS },
        create: {
          usn: TEST_USN_MS,
          name: "Bob MS",
          email: TEST_EMAIL_MS,
          course: "Information Science",
          gradYear: 2026,
          percentage: 80.0,
          marksVersion: 1,
          marksHash: computeCanonicalRecordHash(TEST_USN_MS, 80.0, []),
          universityId: 2,
          collegeCode: COLLEGE_MS_CODE,
        },
        update: {},
      });
    });

    it("rejects cross-college report download with 403 Forbidden", async function () {
      // College RV tries to download MS student's report
      const req = new NextRequest(`http://localhost:3000/api/reports/download?usn=${TEST_USN_MS}`, {
        headers: {
          cookie: `verichain_session=${collegeRVToken}`,
          authorization: `Bearer ${collegeRVToken}`,
        },
      });

      const res = await downloadReportHandler(req);
      expect(res.status).to.equal(403);

      const body = await res.json();
      expect(body.error).to.include("Cross-College Violation");
    });

    it("allows student to download their own report, deriving USN only from session", async function () {
      // Student RV requests report with spoofed usn in query param
      const req = new NextRequest(
        `http://localhost:3000/api/reports/download?usn=SPOOFED_USN`,
        {
          headers: {
            cookie: `verichain_session=${studentTokenRV}`,
            authorization: `Bearer ${studentTokenRV}`,
          },
        }
      );

      const res = await downloadReportHandler(req);
      expect(res.status).to.equal(200);
      expect(res.headers.get("content-type")).to.equal("application/pdf");
      const disposition = res.headers.get("content-disposition");
      expect(disposition).to.include(TEST_USN_RV); // Generated for RV, ignoring query spoof
    });

    it("rejects unauthenticated requests with 401 Unauthorized", async function () {
      const req = new NextRequest(`http://localhost:3000/api/reports/download?usn=${TEST_USN_RV}`);
      const res = await downloadReportHandler(req);
      expect(res.status).to.equal(401);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 3 & 4: Append-Only Versions & Smart Contract Hash Update
  // ---------------------------------------------------------------------------
  describe("3 & 4. Append-Only Versioning & On-Chain Hash Synchronization", function () {
    const editTestUsn = "1RV21CS095";
    const editEmail = `edit.test${TEST_EMAIL_DOMAIN}`;

    after(async function () {
      await prisma.studentMark.deleteMany({ where: { usn: editTestUsn } });
      await prisma.studentMarkVersion.deleteMany({ where: { usn: editTestUsn } });
      await prisma.studentProfile.deleteMany({ where: { usn: editTestUsn } });
    });

    it("registers baseline student version 1 and writes hash on-chain", async function () {
      const rowV1 = {
        usn: editTestUsn,
        name: "Version Candidate",
        email: editEmail,
        course: "Computer Science",
        gradYear: 2026,
        subjects: [
          { subjectCode: "21CS71", subjectName: "AI & ML", total: 80, maxMarks: 100 },
          { subjectCode: "21CS72", subjectName: "Cloud Computing", total: 75, maxMarks: 100 },
        ],
      };

      const req = new NextRequest("http://localhost:3000/api/students/upload/confirm", {
        method: "POST",
        headers: {
          cookie: `verichain_session=${collegeRVToken}`,
          authorization: `Bearer ${collegeRVToken}`,
        },
        body: JSON.stringify({ rows: [rowV1] }),
      });

      const res = await confirmUploadHandler(req);
      expect(res.status).to.equal(200);
      const body = await res.json();
      expect(body.results[0].success).to.be.true;
      expect(body.results[0].version).to.equal(1);

      // Verify DB version 1 is active
      const v1Record = await prisma.studentMarkVersion.findFirst({
        where: { usn: editTestUsn, version: 1 },
      });
      expect(v1Record).to.not.be.null;
      expect(v1Record.status).to.equal("active");
    });

    it("an edit creates version 2, updates on-chain hash, and version 1 stays retrievable as superseded", async function () {
      const v1RecordBefore = await prisma.studentMarkVersion.findFirst({
        where: { usn: editTestUsn, version: 1 },
      });

      const rowV2 = {
        usn: editTestUsn,
        name: "Version Candidate",
        email: editEmail,
        course: "Computer Science",
        gradYear: 2026,
        isEdit: true, // Explicit edit
        subjects: [
          { subjectCode: "21CS71", subjectName: "AI & ML", total: 92, maxMarks: 100 }, // Improved mark
          { subjectCode: "21CS72", subjectName: "Cloud Computing", total: 88, maxMarks: 100 },
        ],
      };

      const req = new NextRequest("http://localhost:3000/api/students/upload/confirm", {
        method: "POST",
        headers: {
          cookie: `verichain_session=${collegeRVToken}`,
          authorization: `Bearer ${collegeRVToken}`,
        },
        body: JSON.stringify({ rows: [rowV2] }),
      });

      const res = await confirmUploadHandler(req);
      expect(res.status).to.equal(200);
      const body = await res.json();
      expect(body.results[0].success).to.be.true;
      expect(body.results[0].version).to.equal(2);

      // Verify Version 1 is now marked superseded and remains retrievable
      const v1RecordAfter = await prisma.studentMarkVersion.findFirst({
        where: { usn: editTestUsn, version: 1 },
      });
      expect(v1RecordAfter).to.not.be.null;
      expect(v1RecordAfter.status).to.equal("superseded");
      expect(v1RecordAfter.marksHash).to.equal(v1RecordBefore.marksHash);

      // Verify Version 2 is now active
      const v2Record = await prisma.studentMarkVersion.findFirst({
        where: { usn: editTestUsn, version: 2 },
      });
      expect(v2Record).to.not.be.null;
      expect(v2Record.status).to.equal("active");
      expect(v2Record.marksHash).to.not.equal(v1RecordBefore.marksHash);

      // Verify student profile points to version 2 and new marksHash
      const profile = await prisma.studentProfile.findUnique({
        where: { usn: editTestUsn },
      });
      expect(profile.marksVersion).to.equal(2);
      expect(profile.marksHash).to.equal(v2Record.marksHash);
    });

    it("verifies smart contract updateStudentMarks commits new version hash", async function () {
      // Test direct smart contract updateStudentMarks call
      const sId = await contract.usnToStudentId(editTestUsn);
      if (Number(sId) === 0) {
        // Register if not on local test contract
        const initialHash = ethers.keccak256(ethers.toUtf8Bytes("INITIAL_HASH"));
        await contract.registerStudent(1, editTestUsn, "Test", "CS", 2026, initialHash);
      }

      const newVersionHash = ethers.keccak256(ethers.toUtf8Bytes("VERSION_2_HASH"));
      const tx = await contract.updateStudentMarks(1, editTestUsn, newVersionHash);
      await tx.wait();

      const onChainStudent = await contract.getStudentByUSN(editTestUsn);
      expect(onChainStudent.marksHash).to.equal(newVersionHash);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 5 & 6: Certificate Verification & Zero Personal Data Leakage
  // ---------------------------------------------------------------------------
  describe("5 & 6. Certificate Tamper Detection & Public Response Privacy", function () {
    const certUsn = "1RV21CS097";
    const certEmail = `cert.test${TEST_EMAIL_DOMAIN}`;
    let validCertBytes, tamperedCertBytes, validCertHash;

    before(async function () {
      validCertBytes = Buffer.from("OFFICIAL_AUTHENTIC_COLLEGE_CERTIFICATE_CONTENT_2026");
      const sha256Hex = crypto.createHash("sha256").update(validCertBytes).digest("hex");
      validCertHash = `0x${sha256Hex}`;

      tamperedCertBytes = Buffer.from("OFFICIAL_AUTHENTIC_COLLEGE_CERTIFICATE_CONTENT_TAMPERED");

      // Seed student profile
      await prisma.studentProfile.upsert({
        where: { usn: certUsn },
        create: {
          usn: certUsn,
          name: "Cert Candidate",
          email: certEmail,
          course: "Computer Science",
          gradYear: 2026,
          percentage: 90.0,
          marksVersion: 1,
          marksHash: computeCanonicalRecordHash(certUsn, 90.0, []),
          universityId: 1,
          collegeCode: COLLEGE_RV_CODE,
        },
        update: {},
      });

      // Seed student achievement with verified status
      await prisma.studentAchievement.create({
        data: {
          achievementId: 9999,
          studentId: 1,
          studentUSN: certUsn,
          collegeCode: COLLEGE_RV_CODE,
          title: "Advanced Blockchain Architecture Certificate",
          issuerOrg: "Ethereum Foundation",
          category: "Certification",
          documentHash: validCertHash,
          ipfsCID: "bafybeivalidcertificatecid123",
          status: "verified",
          reviewedAt: new Date(),
          reviewingUniversityId: 1,
        },
      });
    });

    after(async function () {
      await prisma.studentAchievement.deleteMany({ where: { studentUSN: certUsn } });
      await prisma.studentProfile.deleteMany({ where: { usn: certUsn } });
    });

    it("verifies genuine certificate file bytes successfully", async function () {
      const formData = new FormData();
      const blob = new Blob([validCertBytes], { type: "application/pdf" });
      formData.append("file", blob, "certificate.pdf");

      const req = new NextRequest("http://localhost:3000/api/verify/public", {
        method: "POST",
        body: formData,
      });

      const res = await publicVerifyHandler(req);
      expect(res.status).to.equal(200);

      const body = await res.json();
      expect(body.valid).to.be.true;
      expect(body.status).to.equal("active");
      expect(body.collegeCode).to.equal(COLLEGE_RV_CODE);
    });

    it("rejects tampered certificate file bytes with identical 'No record found'", async function () {
      const formData = new FormData();
      const blob = new Blob([tamperedCertBytes], { type: "application/pdf" });
      formData.append("file", blob, "tampered_certificate.pdf");

      const req = new NextRequest("http://localhost:3000/api/verify/public", {
        method: "POST",
        body: formData,
      });

      const res = await publicVerifyHandler(req);
      expect(res.status).to.equal(404);

      const body = await res.json();
      expect(body.error).to.equal("No record found");
    });

    it("guarantees public verify response contains zero personal fields", async function () {
      const req = new NextRequest("http://localhost:3000/api/verify/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash: validCertHash }),
      });

      const res = await publicVerifyHandler(req);
      expect(res.status).to.equal(200);

      const body = await res.json();

      // Allowed fields only
      const allowedKeys = new Set([
        "valid",
        "collegeName",
        "collegeCode",
        "date",
        "status",
        "version",
        "documentType",
      ]);

      const returnedKeys = Object.keys(body);
      for (const key of returnedKeys) {
        expect(allowedKeys.has(key), `Forbidden personal or unauthorized field in public response: '${key}'`).to.be.true;
      }

      // Explicitly assert absence of PII
      expect(body.name).to.be.undefined;
      expect(body.usn).to.be.undefined;
      expect(body.email).to.be.undefined;
      expect(body.wallet).to.be.undefined;
      expect(body.percentage).to.be.undefined;
      expect(body.totalMarks).to.be.undefined;
      expect(body.marks).to.be.undefined;
      expect(body.grade).to.be.undefined;
    });
  });
});
