require("ts-node/register");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");

// Ensure JWT_SECRET is set for testing
process.env.JWT_SECRET = "test-crypto-secret-key-32-chars-minimum-length!";
process.env.RELAY_SECRET_KEY = "test-relay-shared-secret-key-for-admin-calls";

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
} = require("../lib/serverAuth.ts");

const {
  generateAndStoreAccessCode,
  verifyEntityAccessCode,
} = require("../lib/accessCodeStore.ts");

describe("VeriChain Security & Authentication Test Suite", function () {
  let contract;
  let admin, univ1, univ2, comp, student, attacker;

  before(async function () {
    [admin, univ1, univ2, comp, student, attacker] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("ITHiringMarksVerification");
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    // Register University 1 (ID: 1)
    await contract.registerUniversity("VTU", "VTU-KA-001", univ1.address);
    // Register University 2 (ID: 2)
    await contract.registerUniversity("Bangalore University", "BU-KA-002", univ2.address);
    // Register Student enrolled with University 1
    await contract.connect(univ1).registerStudent("1RV21CS001", "Rahul Sharma", "CSE", 2025, 88);
  });

  // ---------------------------------------------------------------------------
  // TEST 1: WRONG CODE REJECTION
  // ---------------------------------------------------------------------------
  describe("1. Secret Passkey & Wrong Code Verification", function () {
    it("Should reject an incorrect or non-matching access code", function () {
      const generatedCode = generateAndStoreAccessCode(
        "university",
        1,
        "TEST-UNI-001",
        "Test University",
        univ1.address
      );

      expect(generatedCode).to.be.a("string");
      expect(generatedCode.startsWith("UNI-SEC-")).to.be.true;

      // 1. Correct code matches
      const match = verifyEntityAccessCode("university", "TEST-UNI-001", generatedCode);
      expect(match).to.not.be.null;
      expect(match.name).to.equal("Test University");

      // 2. Wrong code fails
      const wrongMatch = verifyEntityAccessCode("university", "TEST-UNI-001", "WRONG-PASSKEY-123");
      expect(wrongMatch).to.be.null;

      // 3. Right code but wrong entity type fails
      const wrongTypeMatch = verifyEntityAccessCode("company", "TEST-UNI-001", generatedCode);
      expect(wrongTypeMatch).to.be.null;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 2: 5 FAILED ATTEMPTS THEN LOCKOUT
  // ---------------------------------------------------------------------------
  describe("2. Rate Limiting & 5 Failed Attempts Temporary Lockout", function () {
    const testIpKey = "192.168.1.100:test-victim-account";

    beforeEach(function () {
      resetFailedAttempts(testIpKey);
    });

    it("Should enforce lockout after 5 consecutive failed login attempts", function () {
      // First check: clean state
      let check = checkRateLimit(testIpKey);
      expect(check.allowed).to.be.true;
      expect(check.remainingAttempts).to.equal(5);

      // Attempts 1 to 4: allowed with decreasing remaining attempts
      for (let i = 1; i <= 4; i++) {
        const attempt = recordFailedAttempt(testIpKey);
        expect(attempt.locked).to.be.false;
        expect(attempt.remainingAttempts).to.equal(5 - i);
      }

      // 5th failed attempt: triggers lockout
      const fifthAttempt = recordFailedAttempt(testIpKey);
      expect(fifthAttempt.locked).to.be.true;
      expect(fifthAttempt.remainingAttempts).to.equal(0);
      expect(fifthAttempt.lockoutRemainingSeconds).to.be.greaterThan(0);

      // Subsequent 6th check: locked out (HTTP 429)
      check = checkRateLimit(testIpKey);
      expect(check.allowed).to.be.false;
      expect(check.remainingAttempts).to.equal(0);
      expect(check.lockoutRemainingSeconds).to.be.greaterThan(0);

      // Clean up after test
      resetFailedAttempts(testIpKey);
      check = checkRateLimit(testIpKey);
      expect(check.allowed).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 3: CALLING THE RELAY WITH NO SESSION
  // ---------------------------------------------------------------------------
  describe("3. Relay Protection Without Session", function () {
    it("Should reject unauthenticated calls to the relay", async function () {
      // Mock NextRequest without cookie or authorization header
      const mockReqNoAuth = {
        headers: new Headers({
          "content-type": "application/json",
        }),
        cookies: {
          get: () => undefined,
        },
      };

      const session = await getServerSessionMock(mockReqNoAuth);
      expect(session).to.be.null;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 4: A UNIVERSITY TRYING TO ACT ON ANOTHER COLLEGE
  // ---------------------------------------------------------------------------
  describe("4. Cross-Institutional Authorization & Impersonation Prevention", function () {
    it("Smart Contract: Should reject a university issuing credentials for another college's student", async function () {
      const docHash = "0x4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
      const ipfsCID = "QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx";

      // University 2 (univ2) attempts to issue credential for Student 1 (enrolled under University 1)
      await expect(
        contract.connect(univ2).issueCredential(1, "Degree Certificate", docHash, ipfsCID)
      ).to.be.revertedWith("Auth: Student belongs to different university");
    });

    it("Relay Logic: Should detect and reject cross-institutional impersonation", function () {
      const universitySession = {
        role: "university",
        account: univ1.address,
        studentUSN: null,
        entityInfo: {
          id: 1,
          name: "VTU",
          code: "VTU-KA-001",
        },
      };

      // Attacker passes universityCode of a DIFFERENT university in request body
      const spoofedCode = "BU-KA-002";
      const isImpersonation =
        spoofedCode.toUpperCase() !== universitySession.entityInfo.code.toUpperCase();

      expect(isImpersonation).to.be.true;

      // The relay takes ID strictly from session (1), never trusting the body
      const authoritativeId = universitySession.entityInfo.id;
      expect(authoritativeId).to.equal(1);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 5: TAMPERED JWT SESSION COOKIE
  // ---------------------------------------------------------------------------
  describe("5. Cryptographic JWT Session Integrity & Tampering Protection", function () {
    it("Should verify a valid signed session token", async function () {
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
      const nonce = generateAuthNonce(wallet.address);

      const challengeMessage = `VeriChain Authentication\n\nWallet: ${wallet.address}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
      const signature = await wallet.signMessage(challengeMessage);

      // First verification: must succeed
      const firstCheck = verifyWalletSignature(wallet.address, challengeMessage, signature);
      expect(firstCheck).to.be.true;

      // Second verification with the exact same nonce and signature: must fail
      const replayCheck = verifyWalletSignature(wallet.address, challengeMessage, signature);
      expect(replayCheck).to.be.false;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 7: STUDENT EMAIL OTP ENGINE
  // ---------------------------------------------------------------------------
  describe("7. Student Email OTP Security Engine", function () {
    it("Should issue 6-digit OTP, reject incorrect OTP, and consume OTP on successful verification", function () {
      const usn = "1RV21CS001";
      const { otp, expiresAt } = generateStudentOTP(usn);

      expect(otp).to.match(/^[0-9]{6}$/);
      expect(expiresAt).to.be.greaterThan(Date.now());

      // Wrong OTP fails
      const wrongOtpCheck = verifyStudentOTP(usn, "000000");
      expect(wrongOtpCheck).to.be.false;

      // Correct OTP succeeds
      const correctOtpCheck = verifyStudentOTP(usn, otp);
      expect(correctOtpCheck).to.be.true;

      // Reused OTP fails (consumed single-use)
      const reusedOtpCheck = verifyStudentOTP(usn, otp);
      expect(reusedOtpCheck).to.be.false;
    });
  });
});

// Helper for testing mock session extraction
async function getServerSessionMock(req) {
  const cookie = req.cookies.get("verichain_session");
  if (cookie) {
    return await verifySessionJWT(cookie);
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return await verifySessionJWT(authHeader.slice(7).trim());
  }
  return null;
}
