const path = require("path");
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
const { POST: relayPostHandler } = require("../app/api/blockchain/relay/route.ts");
const { GET: achievementsGetHandler, POST: achievementsPostHandler } = require("../app/api/achievements/route.ts");

describe("Phase 3: Strict College Binding & Authorized Relayer Test Suite", function () {
  let contract;
  let admin, relayer, collegeAWallet, collegeBWallet, studentAWallet, attacker;

  const COLLEGE_A_CODE = "RV";
  const COLLEGE_B_CODE = "MS";

  const STUDENT_A_USN = "1RV21CS001";
  const STUDENT_B_USN = "1MS21CS002";
  const MALFORMED_USN = "INVALID_USN";

  const MARKS_HASH_A = ethers.keccak256(ethers.toUtf8Bytes("1RV21CS001:85"));

  before(async function () {
    [admin, relayer, collegeAWallet, collegeBWallet, studentAWallet, attacker] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("ITHiringMarksVerification");
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    // Set relayer
    await contract.connect(admin).setAuthorizedRelayer(relayer.address);

    // Register College A (ID 1) and College B (ID 2)
    await contract.connect(admin)["registerUniversity(string,string,string,address)"]("RV College of Engineering", COLLEGE_A_CODE, "VTU", collegeAWallet.address);
    await contract.connect(admin)["registerUniversity(string,string,string,address)"]("MS Ramaiah Institute of Technology", COLLEGE_B_CODE, "VTU", collegeBWallet.address);
  });

  // =========================================================================
  // 1. SMART CONTRACT DIRECT CALLS & RELAYER PROTECTION
  // =========================================================================
  describe("1. Smart Contract Relayer Protection & Direct Calling", function () {
    it("Calling contract write functions directly from a random wallet reverts", async function () {
      // Calling registerStudent from attacker
      await expect(
        contract.connect(attacker).registerStudent(
          1,
          STUDENT_A_USN,
          "Rahul Sharma",
          "Computer Science",
          2025,
          MARKS_HASH_A
        )
      ).to.be.revertedWith("Auth: Only authorized relayer allowed");

      // Calling submitAchievement from attacker
      await expect(
        contract.connect(attacker).submitAchievement(
          STUDENT_A_USN,
          "Hackathon Winner",
          "ETHGlobal",
          "Hackathon",
          MARKS_HASH_A,
          "QmTestCID"
        )
      ).to.be.revertedWith("Auth: Only authorized relayer allowed");

      // Calling issueCredential from attacker
      await expect(
        contract.connect(attacker).issueCredential(
          1,
          1,
          "Degree Certificate",
          MARKS_HASH_A,
          "QmTestCID"
        )
      ).to.be.revertedWith("Auth: Only authorized relayer allowed");

      // Calling reviewAchievement from attacker
      await expect(
        contract.connect(attacker).reviewAchievement(
          1,
          1,
          1, // Verified
          "Approved"
        )
      ).to.be.revertedWith("Auth: Only authorized relayer allowed");
    });
  });

  // =========================================================================
  // 2. USN VALIDATION & COLLEGE CODE MATCHING ON-CHAIN
  // =========================================================================
  describe("2. On-Chain USN Format Validation & College Code Matching", function () {
    it("Solidity parseAndValidateUSN correctly extracts college code", async function () {
      const codeA = await contract.parseAndValidateUSN(STUDENT_A_USN);
      expect(codeA).to.equal(COLLEGE_A_CODE);

      const codeB = await contract.parseAndValidateUSN(STUDENT_B_USN);
      expect(codeB).to.equal(COLLEGE_B_CODE);
    });

    it("Solidity parseAndValidateUSN rejects malformed USNs", async function () {
      await expect(contract.parseAndValidateUSN("SHORT")).to.be.revertedWith(
        "Validation: USN must be exactly 10 characters"
      );

      await expect(contract.parseAndValidateUSN("XRV21CS001")).to.be.revertedWith(
        "Validation: USN prefix must be a digit"
      );

      await expect(contract.parseAndValidateUSN("11V21CS001")).to.be.revertedWith(
        "Validation: USN college code char 1 must be uppercase letter"
      );
    });

    it("registerStudent with mismatched college code fails in contract", async function () {
      // Trying to register student with USN for College B (MS) under College A (RV, ID 1)
      await expect(
        contract.connect(relayer).registerStudent(
          1, // College A (RV)
          STUDENT_B_USN, // USN starts with 1MS
          "Student B",
          "Computer Science",
          2025,
          MARKS_HASH_A
        )
      ).to.be.revertedWith("Auth: USN college code does not match registering college");
    });

    it("registerStudent succeeds when USN college code matches registering college", async function () {
      const tx = await contract.connect(relayer).registerStudent(
        1, // College A (RV)
        STUDENT_A_USN, // 1RV...
        "Rahul Sharma",
        "Computer Science",
        2025,
        MARKS_HASH_A
      );
      await tx.wait();

      const studentData = await contract.getStudentByUSN(STUDENT_A_USN);
      expect(studentData.usn).to.equal(STUDENT_A_USN);
      expect(studentData.universityId).to.equal(1n);
      expect(studentData.marksHash).to.equal(MARKS_HASH_A);
    });
  });

  // =========================================================================
  // 3. CROSS-COLLEGE ACTION RESTRICTIONS ON-CHAIN
  // =========================================================================
  describe("3. Cross-College Action Restrictions On-Chain", function () {
    it("College B cannot issue credential for Student from College A", async function () {
      const studentAId = await contract.usnToStudentId(STUDENT_A_USN);

      // College B (ID 2) tries to issue credential for Student A (College 1)
      await expect(
        contract.connect(relayer).issueCredential(
          2, // College B
          studentAId,
          "Degree Certificate",
          MARKS_HASH_A,
          "QmTestCID"
        )
      ).to.be.revertedWith("Auth: Student belongs to different college");
    });

    it("College B cannot review or approve/reject achievement of Student from College A", async function () {
      // Relayer submits achievement for Student A
      await contract.connect(relayer).submitAchievement(
        STUDENT_A_USN,
        "National Hackathon 1st Place",
        "ETHGlobal",
        "Hackathon",
        MARKS_HASH_A,
        "QmAchievementCID"
      );

      // College B (ID 2) attempts to review achievement 1 belonging to Student A (College 1)
      await expect(
        contract.connect(relayer).reviewAchievement(
          1,
          2, // College B
          1, // Verified
          "College B trying to approve"
        )
      ).to.be.revertedWith("Auth: Student belongs to different college");

      // College A (ID 1) successfully reviews achievement 1
      await expect(
        contract.connect(relayer).reviewAchievement(
          1,
          1, // College A
          1, // Verified
          "Verified by RV College Authority"
        )
      ).to.emit(contract, "AchievementReviewed");
    });
  });

  // =========================================================================
  // 4. BACKEND API & PRISMA QUEUE ISOLATION
  // =========================================================================
  describe("4. Backend API Route Enforcement & Prisma College Queue Isolation", function () {
    let studentAToken, collegeAToken, collegeBToken;

    before(async function () {
      studentAToken = await createSessionJWT({
        role: "student",
        account: studentAWallet.address,
        studentUSN: STUDENT_A_USN,
        entityInfo: { id: 1, name: "Rahul Sharma", code: COLLEGE_A_CODE },
      });

      collegeAToken = await createSessionJWT({
        role: "university",
        account: collegeAWallet.address,
        studentUSN: null,
        entityInfo: { id: 1, name: "RV College of Engineering", code: COLLEGE_A_CODE },
      });

      collegeBToken = await createSessionJWT({
        role: "university",
        account: collegeBWallet.address,
        studentUSN: null,
        entityInfo: { id: 2, name: "MS Ramaiah Institute of Technology", code: COLLEGE_B_CODE },
      });
    });

    it("Registering a USN with wrong college code fails in relay API", async function () {
      // College A trying to register a student with College B's USN
      const req = new NextRequest("http://localhost:3000/api/blockchain/relay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `verichain_session=${collegeAToken}`,
        },
        body: JSON.stringify({
          action: "registerStudent",
          data: {
            usn: STUDENT_B_USN, // "1MS21CS002"
            name: "Mismatched Candidate",
            email: "mismatched@test.com",
            course: "Computer Science",
            gradYear: 2025,
            percentage: 85,
          },
        }),
      });

      const res = await relayPostHandler(req);
      expect(res.status).to.equal(403);
      const json = await res.json();
      expect(json.error).to.include("does not match");
    });

    it("Student from College A submits achievement: derived USN and collegeCode set", async function () {
      const submitReq = new NextRequest("http://localhost:3000/api/achievements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `verichain_session=${studentAToken}`,
        },
        body: JSON.stringify({
          action: "submit",
          achievementData: {
            title: "Web3 Hackathon Grand Prize",
            issuerOrg: "Polygon Guild",
            category: "Hackathon",
            documentHash: MARKS_HASH_A,
            ipfsCID: "QmPolygon123",
          },
        }),
      });

      const res = await achievementsPostHandler(submitReq);
      expect(res.status).to.equal(200);
      const json = await res.json();
      expect(json.success).to.be.true;
    });

    it("College A lists queue: Student A achievement is present", async function () {
      const getReqA = new NextRequest("http://localhost:3000/api/achievements", {
        method: "GET",
        headers: {
          cookie: `verichain_session=${collegeAToken}`,
        },
      });

      const resA = await achievementsGetHandler(getReqA);
      expect(resA.status).to.equal(200);
      const jsonA = await resA.json();
      expect(jsonA.achievements.length).to.be.greaterThan(0);
      const found = jsonA.achievements.some((a) => a.title === "Web3 Hackathon Grand Prize");
      expect(found).to.be.true;
    });

    it("College B lists queue: Student A achievement is NOT returned (isolated)", async function () {
      const getReqB = new NextRequest("http://localhost:3000/api/achievements", {
        method: "GET",
        headers: {
          cookie: `verichain_session=${collegeBToken}`,
        },
      });

      const resB = await achievementsGetHandler(getReqB);
      expect(resB.status).to.equal(200);
      const jsonB = await resB.json();
      const found = jsonB.achievements.some((a) => a.title === "Web3 Hackathon Grand Prize");
      expect(found).to.be.false;
    });

    it("College B cannot approve or reject Student A achievement (fails with 403)", async function () {
      // Find the achievementId
      const allAch = await prisma.studentAchievement.findMany({
        where: { studentUSN: STUDENT_A_USN },
      });
      expect(allAch.length).to.be.greaterThan(0);
      const achId = allAch[0].achievementId;

      const reviewReqB = new NextRequest("http://localhost:3000/api/achievements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `verichain_session=${collegeBToken}`,
        },
        body: JSON.stringify({
          action: "review",
          achievementId: achId,
          status: 1, // Verified
          remarks: "College B attempting unauthorized review",
        }),
      });

      const resB = await achievementsPostHandler(reviewReqB);
      expect(resB.status).to.equal(403);
      const jsonB = await resB.json();
      expect(jsonB.error).to.include("Forbidden");
    });
  });

  after(async function () {
    try {
      await prisma.studentAchievement
        .deleteMany({
          where: { studentUSN: { in: [STUDENT_A_USN, STUDENT_B_USN] } },
        })
        .catch(() => {});
    } catch (e) {}
  });
});
