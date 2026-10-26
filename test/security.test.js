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

// Configure test environment variables with minimum 32-character secrets
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-crypto-secret-key-32-chars-minimum-length!";
process.env.RELAY_SECRET_KEY = "test-relay-shared-secret-key-for-admin-calls-32chars";
process.env.OTP_SECRET = "test-crypto-otp-hmac-secret-key-32-chars-long!";

// Import core security engines (now backed by Prisma / DB)
const {
  checkRateLimit,
  recordFailedAttempt,
  resetFailedAttempts,
  generateAuthNonce,
  verifyWalletSignature,
  createSessionJWT,
  verifySessionJWT,
  generateStudentOTP,
  verifyStudentOTP,
  upsertStudentProfile,
  getStudentRegisteredEmail,
} = require("../lib/serverAuth.ts");

const {
  generateAndStoreAccessCode,
  verifyEntityAccessCode,
} = require("../lib/accessCodeStore.ts");

const {
  getStudentLinkedWallet,
  linkStudentWallet,
  findStudentByWallet,
} = require("../lib/studentWalletStore.ts");

const { prisma } = require("../lib/prisma.ts");

// Import the REAL Next.js POST Route Handler for on-chain relay
const { POST: relayPostHandler } = require("../app/api/blockchain/relay/route.ts");

describe("VeriChain Comprehensive Security & Route Handler Test Suite", function () {
  let contract;
  let admin, univ1, univ2, comp, student, attacker;

  before(async function () {
    [admin, univ1, univ2, comp, student, attacker] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("ITHiringMarksVerification");
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    // Register College 1 (ID: 1) with code RV
    await contract.connect(admin)["registerUniversity(string,string,string,address)"]("RV College of Engineering", "RV", "VTU", univ1.address);
    // Register College 2 (ID: 2) with code MS
    await contract.connect(admin)["registerUniversity(string,string,string,address)"]("MS Ramaiah Institute", "MS", "VTU", univ2.address);
    // Register Student enrolled with College 1 via authorized relayer
    const marksHash = ethers.keccak256(ethers.toUtf8Bytes("1RV21CS001:88"));
    await contract.connect(admin).registerStudent(1, "1RV21CS001", "Rahul Sharma", "CSE", 2025, marksHash);
  });

  // ---------------------------------------------------------------------------
  // TEST 1: WRONG CODE REJECTION
  // ---------------------------------------------------------------------------
  describe("1. Secret Passkey & Wrong Code Verification (Database Backed)", function () {
    it("Should reject an incorrect or non-matching access code", async function () {
      const generatedCode = await generateAndStoreAccessCode(
        "university",
        1,
        "TEST-UNI-001",
        "Test University",
        univ1.address
      );

      expect(generatedCode).to.be.a("string");
      expect(generatedCode.startsWith("UNI-SEC-")).to.be.true;

      // 1. Correct code matches
      const match = await verifyEntityAccessCode("university", "TEST-UNI-001", generatedCode);
      expect(match).to.not.be.null;
      expect(match.name).to.equal("Test University");

      // 2. Wrong code fails
      const wrongMatch = await verifyEntityAccessCode("university", "TEST-UNI-001", "WRONG-PASSKEY-123");
      expect(wrongMatch).to.be.null;

      // 3. Right code but wrong entity type fails
      const wrongTypeMatch = await verifyEntityAccessCode("company", "TEST-UNI-001", generatedCode);
      expect(wrongTypeMatch).to.be.null;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 2: 5 FAILED ATTEMPTS THEN LOCKOUT
  // ---------------------------------------------------------------------------
  describe("2. Rate Limiting & 5 Failed Attempts Temporary Lockout", function () {
    const testIpKey = "192.168.1.100:test-victim-account";

    beforeEach(async function () {
      await resetFailedAttempts(testIpKey);
    });

    it("Should enforce lockout after 5 consecutive failed login attempts", async function () {
      // First check: clean state
      let check = await checkRateLimit(testIpKey);
      expect(check.allowed).to.be.true;
      expect(check.remainingAttempts).to.equal(5);

      // Attempts 1 to 4: allowed with decreasing remaining attempts
      for (let i = 1; i <= 4; i++) {
        const attempt = await recordFailedAttempt(testIpKey);
        expect(attempt.locked).to.be.false;
        expect(attempt.remainingAttempts).to.equal(5 - i);
      }

      // 5th failed attempt: triggers lockout
      const fifthAttempt = await recordFailedAttempt(testIpKey);
      expect(fifthAttempt.locked).to.be.true;
      expect(fifthAttempt.remainingAttempts).to.equal(0);
      expect(fifthAttempt.lockoutRemainingSeconds).to.be.greaterThan(0);

      // Subsequent 6th check: locked out (HTTP 429)
      check = await checkRateLimit(testIpKey);
      expect(check.allowed).to.be.false;
      expect(check.remainingAttempts).to.equal(0);
      expect(check.lockoutRemainingSeconds).to.be.greaterThan(0);

      // Clean up after test
      await resetFailedAttempts(testIpKey);
      check = await checkRateLimit(testIpKey);
      expect(check.allowed).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 3: CALLING THE REAL RELAY ROUTE WITH NO SESSION
  // ---------------------------------------------------------------------------
  describe("3. Relay Protection Without Session (Calls Real POST Handler)", function () {
    it("Should call app/api/blockchain/relay/route.ts POST and return HTTP 403 when unauthenticated", async function () {
      const reqNoAuth = new NextRequest("http://localhost:3000/api/blockchain/relay", {
        method: "POST",
        body: JSON.stringify({
          action: "registerStudent",
          data: { usn: "1RV21CS001", name: "Rahul Sharma", email: "rahul@test.edu" },
        }),
        headers: { "content-type": "application/json" },
      });

      const response = await relayPostHandler(reqNoAuth);
      expect(response.status).to.equal(403);

      const json = await response.json();
      expect(json.error).to.include("Authentication required");
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 4: RELAY SPOOFING & CROSS-COLLEGE PROTECTION (CALLS REAL POST HANDLER)
  // ---------------------------------------------------------------------------
  describe("4. Cross-Institutional Authorization & Impersonation Prevention (Calls Real POST Handler)", function () {
    it("Smart Contract: Should reject a university issuing credentials for another college's student", async function () {
      const docHash = "0x4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
      const ipfsCID = "QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx";

      // College 2 (via relayer) attempts to issue credential on-chain for Student 1 (enrolled under College 1)
      await expect(
        contract.connect(admin).issueCredential(2, 1, "Degree Certificate", docHash, ipfsCID)
      ).to.be.revertedWith("Auth: Student belongs to different college");

      // Non-relayer wallet direct call reverts
      await expect(
        contract.connect(univ2).issueCredential(1, 1, "Degree Certificate", docHash, ipfsCID)
      ).to.be.revertedWith("Auth: Only authorized relayer allowed");
    });

    it("Real Relay POST Handler: Should detect and return HTTP 403 when a university session attempts to spoof another universityCode", async function () {
      // Create a valid JWT session for College 1 (RV)
      const univ1SessionToken = await createSessionJWT({
        role: "university",
        account: univ1.address,
        studentUSN: null,
        entityInfo: {
          id: 1,
          name: "RV College of Engineering",
          code: "RV",
          wallet: univ1.address,
        },
      });

      // College 1 session sends a request pretending to act as College 2 ("MS")
      const spoofingReq = new NextRequest("http://localhost:3000/api/blockchain/relay", {
        method: "POST",
        body: JSON.stringify({
          action: "registerStudent",
          universityCode: "MS", // Conflicting / spoofed universityCode
          data: {
            usn: "1RV21CS999",
            name: "Hacker Attempt",
            email: "hacker@test.edu",
          },
        }),
        headers: {
          "content-type": "application/json",
          cookie: `verichain_session=${univ1SessionToken}`,
        },
      });

      const response = await relayPostHandler(spoofingReq);
      expect(response.status).to.equal(403);

      const json = await response.json();
      expect(json.error).to.include("Cross-institutional impersonation detected");
    });

    it("Real Relay POST Handler: Should return HTTP 400 when admin calls relay without specifying entity", async function () {
      // Admin calls relay with x-relay-secret, but without universityId or universityCode
      const adminMissingEntityReq = new NextRequest("http://localhost:3000/api/blockchain/relay", {
        method: "POST",
        body: JSON.stringify({
          action: "registerStudent",
          data: {
            usn: "1RV21CS999",
            name: "Test Missing Entity",
            email: "missing@test.edu",
          },
        }),
        headers: {
          "content-type": "application/json",
          "x-relay-secret": process.env.RELAY_SECRET_KEY,
        },
      });

      const response = await relayPostHandler(adminMissingEntityReq);
      expect(response.status).to.equal(400);

      const json = await response.json();
      expect(json.error).to.include("Admin caller must specify a valid target universityId");
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 5: TAMPERED JWT SESSION COOKIE REJECTION
  // ---------------------------------------------------------------------------
  describe("5. JWT Session Integrity & Tampering Protection", function () {
    it("Should generate and correctly verify an authentic JWT session token", async function () {
      const payload = {
        role: "university",
        account: univ1.address,
        studentUSN: null,
        entityInfo: { id: 1, name: "VTU", code: "VTU-KA-001" },
      };

      const validToken = await createSessionJWT(payload);
      expect(validToken).to.be.a("string");

      const verified = await verifySessionJWT(validToken);
      expect(verified).to.not.be.null;
      expect(verified.role).to.equal("university");
      expect(verified.account).to.equal(univ1.address);
    });

    it("Should reject a tampered JWT token (altered signature or payload)", async function () {
      const payload = {
        role: "university",
        account: univ1.address,
        studentUSN: null,
        entityInfo: { id: 1, name: "VTU", code: "VTU-KA-001" },
      };

      const validToken = await createSessionJWT(payload);
      const parts = validToken.split(".");

      // 1. Tamper signature: replace last 6 chars with garbage
      const tamperedSignature = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -6)}XYZ123`;
      const verifyTamperedSig = await verifySessionJWT(tamperedSignature);
      expect(verifyTamperedSig).to.be.null;

      // 2. Tamper payload: alter role from "university" to "admin"
      const decodedPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      decodedPayload.role = "admin";
      const forgedPayloadBase64 = Buffer.from(JSON.stringify(decodedPayload)).toString("base64url");
      const forgedToken = `${parts[0]}.${forgedPayloadBase64}.${parts[2]}`;

      const verifyForged = await verifySessionJWT(forgedToken);
      expect(verifyForged).to.be.null;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 6: REUSED SIWE NONCE (REPLAY ATTACK PREVENTION)
  // ---------------------------------------------------------------------------
  describe("6. SIWE Single-Use Nonce & Replay Prevention", function () {
    it("Should consume nonce upon first verification and reject replay with same nonce", async function () {
      const wallet = ethers.Wallet.createRandom();
      const nonce = await generateAuthNonce(wallet.address);

      const challengeMessage = `VeriChain Authentication\n\nWallet: ${wallet.address}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
      const signature = await wallet.signMessage(challengeMessage);

      // First verification: must succeed
      const firstCheck = await verifyWalletSignature(wallet.address, challengeMessage, signature);
      expect(firstCheck).to.be.true;

      // Second verification with the exact same nonce and signature: must fail
      const replayCheck = await verifyWalletSignature(wallet.address, challengeMessage, signature);
      expect(replayCheck).to.be.false;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 7: STUDENT EMAIL OTP ENGINE & MAX 5 FAILED ATTEMPTS INVALIDATION
  // ---------------------------------------------------------------------------
  describe("7. Student Email OTP Rate Limiting & Invalidation", function () {
    it("Should invalidate OTP after max 5 wrong attempts and wipe it from store", async function () {
      const usn = "TEST-OTP-USN-01";
      const { otp } = await generateStudentOTP(usn);

      expect(otp).to.match(/^[0-9]{6}$/);

      // Attempts 1 to 4: rejected with remaining attempts decremented
      for (let i = 1; i <= 4; i++) {
        const attempt = await verifyStudentOTP(usn, "000000");
        expect(attempt.valid).to.be.false;
        expect(attempt.invalidated).to.be.false;
        expect(attempt.remainingAttempts).to.equal(5 - i);
      }

      // 5th wrong attempt: triggers immediate invalidation
      const fifthAttempt = await verifyStudentOTP(usn, "000000");
      expect(fifthAttempt.valid).to.be.false;
      expect(fifthAttempt.invalidated).to.be.true;
      expect(fifthAttempt.remainingAttempts).to.equal(0);
      expect(fifthAttempt.error).to.include("Maximum failed attempts exceeded (5/5)");

      // 6th attempt with the REAL correct OTP: still fails because the OTP record was wiped
      const sixthAttempt = await verifyStudentOTP(usn, otp);
      expect(sixthAttempt.valid).to.be.false;
      expect(sixthAttempt.error).to.include("expired or does not exist");
    });

    it("Should successfully verify correct OTP and consume it single-use", async function () {
      const usn = "TEST-OTP-USN-02";
      const { otp } = await generateStudentOTP(usn);

      // Correct OTP succeeds
      const successCheck = await verifyStudentOTP(usn, otp);
      expect(successCheck.valid).to.be.true;

      // Reused OTP fails (consumed single-use)
      const reuseCheck = await verifyStudentOTP(usn, otp);
      expect(reuseCheck.valid).to.be.false;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 8: STUDENT WALLET LINKING & ENFORCEMENT
  // ---------------------------------------------------------------------------
  describe("8. Student Wallet (SIWE) Link Step & Unauthorized Login Prevention", function () {
    const studentUSN = `TEST-WALLET-${Date.now()}`;
    const studentWallet = ethers.Wallet.createRandom();
    const attackerWallet = ethers.Wallet.createRandom();

    it("Should prevent arbitrary unlinked wallets from signing in as student", async function () {
      const initialLinked = await getStudentLinkedWallet("UNLINKED_USN_999");
      expect(initialLinked).to.be.null;
    });

    it("Should link a student's verified wallet address to their USN", async function () {
      await linkStudentWallet(studentUSN, studentWallet.address);

      const linked = await getStudentLinkedWallet(studentUSN);
      expect(linked).to.equal(studentWallet.address.toLowerCase());

      const foundUSN = await findStudentByWallet(studentWallet.address);
      expect(foundUSN).to.equal(studentUSN);
    });

    it("Should detect and reject an attacker wallet attempting to sign in as the student", async function () {
      const linked = await getStudentLinkedWallet(studentUSN);
      const isAttackerAuthorized = linked === attackerWallet.address.toLowerCase();
      expect(isAttackerAuthorized).to.be.false;
    });

    it("Should allow the authorized linked wallet to authenticate via SIWE signature", async function () {
      const nonce = await generateAuthNonce(studentWallet.address);
      const challengeMessage = `VeriChain Authentication\n\nWallet: ${studentWallet.address}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
      const signature = await studentWallet.signMessage(challengeMessage);

      // Verify wallet matches linked student wallet
      const linked = await getStudentLinkedWallet(studentUSN);
      expect(linked).to.equal(studentWallet.address.toLowerCase());

      // Verify signature
      const validSig = await verifyWalletSignature(studentWallet.address, challengeMessage, signature);
      expect(validSig).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 9: PHASE 2 DATABASE SPECIFIC TESTS
  // ---------------------------------------------------------------------------
  describe("9. Phase 2 Database Tests (Lockout Across Requests, OTP Expiry/Limits, Nonce Reuse, Wallet Link Uniqueness)", function () {
    // 1. Lockout across separate requests
    it("Database Lockout: State persists across separate requests and enforces lockout period", async function () {
      const ipKey = "203.0.113.42:user-target-db-test";
      await resetFailedAttempts(ipKey);

      // Simulate Request 1: 3 failed attempts
      for (let r = 0; r < 3; r++) {
        await recordFailedAttempt(ipKey);
      }

      // Check from a distinct request context: should have 2 attempts remaining
      const midCheck = await checkRateLimit(ipKey);
      expect(midCheck.allowed).to.be.true;
      expect(midCheck.remainingAttempts).to.equal(2);

      // Simulate Request 2: 2 more failed attempts (total 5)
      await recordFailedAttempt(ipKey);
      const lockAttempt = await recordFailedAttempt(ipKey);
      expect(lockAttempt.locked).to.be.true;
      expect(lockAttempt.remainingAttempts).to.equal(0);

      // Check from Request 3: must be locked out
      const lockedCheck = await checkRateLimit(ipKey);
      expect(lockedCheck.allowed).to.be.false;
      expect(lockedCheck.lockoutRemainingSeconds).to.be.greaterThan(0);

      // Cleanup
      await resetFailedAttempts(ipKey);
    });

    // 2. OTP expiry and attempt limit
    it("Database OTP: Enforces attempt limit invalidation and rejects expired OTPs", async function () {
      const usn = "DB-OTP-USN-TEST";
      const { otp } = await generateStudentOTP(usn);

      // Verify DB record exists with 0 attempts
      const initialDbRecord = await prisma.studentOTP.findUnique({ where: { usn } });
      expect(initialDbRecord).to.not.be.null;
      expect(initialDbRecord.failedAttempts).to.equal(0);

      // Fail 4 times
      for (let i = 1; i <= 4; i++) {
        const res = await verifyStudentOTP(usn, "999999");
        expect(res.valid).to.be.false;
        expect(res.remainingAttempts).to.equal(5 - i);
      }

      // 5th failure: must delete OTP from DB table
      const fifth = await verifyStudentOTP(usn, "999999");
      expect(fifth.invalidated).to.be.true;

      const wipedDbRecord = await prisma.studentOTP.findUnique({ where: { usn } });
      expect(wipedDbRecord).to.be.null;

      // Test OTP Expiry: generate new OTP and manually set expiry to the past
      await generateStudentOTP(usn);
      await prisma.studentOTP.upsert({
        where: { usn },
        create: { usn, code: "123456", expiresAt: new Date(Date.now() - 60000), failedAttempts: 0 },
        update: { expiresAt: new Date(Date.now() - 60000) },
      });

      const expiredCheck = await verifyStudentOTP(usn, "123456");
      expect(expiredCheck.valid).to.be.false;
      expect(expiredCheck.error).to.include("expired");
    });

    // 3. Nonce reuse (single-use, expiry)
    it("Database Nonce: Prevents replay reuse and rejects expired nonces", async function () {
      const testWallet = ethers.Wallet.createRandom();
      const nonce = await generateAuthNonce(testWallet.address);

      // Verify DB contains nonce
      const dbNonce = await prisma.authNonce.findUnique({ where: { nonce } });
      expect(dbNonce).to.not.be.null;

      // First use consumes nonce from DB
      const challenge = `VeriChain Authentication\n\nWallet: ${testWallet.address}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
      const sig = await testWallet.signMessage(challenge);

      const firstResult = await verifyWalletSignature(testWallet.address, challenge, sig);
      expect(firstResult).to.be.true;

      // DB record is now marked as used
      const consumedDbNonce = await prisma.authNonce.findUnique({ where: { nonce } });
      expect(consumedDbNonce.used).to.be.true;

      // Replay attempt fails because nonce is already used
      const replayResult = await verifyWalletSignature(testWallet.address, challenge, sig);
      expect(replayResult).to.be.false;
    });

    // 4. Wallet link uniqueness
    it("Database Wallet Uniqueness: Enforces 1-to-1 mapping between student and wallet", async function () {
      const student1 = `DB-STUDENT-${Date.now()}-1`;
      const student2 = `DB-STUDENT-${Date.now()}-2`;
      const walletA = ethers.Wallet.createRandom().address;
      const walletB = ethers.Wallet.createRandom().address;

      // Link student1 -> walletA
      const link1 = await linkStudentWallet(student1, walletA);
      expect(link1.success).to.be.true;

      // Attempt 1: Link student2 to walletA (duplicate wallet) -> must fail
      let duplicateWalletFailed = false;
      try {
        await linkStudentWallet(student2, walletA);
      } catch (err) {
        duplicateWalletFailed = true;
        expect(err.message).to.include("Unique constraint");
      }
      expect(duplicateWalletFailed).to.be.true;

      // Attempt 2: Link student1 to walletB (student already has a linked wallet) -> must fail
      let duplicateStudentFailed = false;
      try {
        await linkStudentWallet(student1, walletB);
      } catch (err) {
        duplicateStudentFailed = true;
        expect(err.message).to.include("Unique constraint");
      }
      expect(duplicateStudentFailed).to.be.true;

      // Clean linking of student2 -> walletB succeeds
      const link2 = await linkStudentWallet(student2, walletB);
      expect(link2.success).to.be.true;
    });

    // 5. Student email registration & profile storage
    it("Database Student Email: University-entered email is stored and used as only OTP destination", async function () {
      const usn = "DB-STUDENT-EMAIL-TEST";
      const email = "official.student@test.verichain.local";

      await upsertStudentProfile({
        usn,
        name: "Test Candidate",
        email,
        course: "Engineering",
        gradYear: 2026,
        percentage: 85,
        universityId: 1,
        universityCode: "VTU-KA-001",
      });

      const registeredEmail = await getStudentRegisteredEmail(usn);
      expect(registeredEmail).to.equal(email.toLowerCase());

      // Querying unonboarded student returns null
      const nonExistentEmail = await getStudentRegisteredEmail("UNREGISTERED_USN");
      expect(nonExistentEmail).to.be.null;
    });
  });

  after(async function () {
    try {
      const testUsns = [
        "DB-STUDENT-EMAIL-TEST",
        "STUDENT-001",
        "STUDENT-002",
        "1RV21CS001",
        "OTP-FAIL-TEST",
        "1RV21CS099",
      ];
      await prisma.studentProfile
        .deleteMany({
          where: {
            OR: [
              { usn: { in: testUsns } },
              { email: { endsWith: "@test.verichain.local" } },
              { email: { endsWith: "@university.edu" } },
            ],
          },
        })
        .catch(() => {});
      await prisma.studentWalletLink
        .deleteMany({
          where: { usn: { in: testUsns } },
        })
        .catch(() => {});
      await prisma.studentOTP
        .deleteMany({
          where: { usn: { in: testUsns } },
        })
        .catch(() => {});
      // Delete test nonces and test rate limit keys specifically created by test cases
      await prisma.authNonce
        .deleteMany({
          where: {
            OR: [
              { nonce: { startsWith: "test_" } },
              { nonce: { startsWith: "sec_test_" } },
              { wallet: { in: testWallets } },
            ],
          },
        })
        .catch(() => {});

      await prisma.rateLimitCounter
        .deleteMany({
          where: {
            OR: [
              { key: { contains: "test" } },
              { key: { contains: "127.0.0.1" } },
              { key: { in: testUsns } },
              { key: { in: testWallets } },
            ],
          },
        })
        .catch(() => {});
    } catch (e) {}
  });
});
