const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ITHiringMarksVerification Smart Contract Test Suite", function () {
  let contract;
  let admin, univWallet, univ2Wallet, compWallet, studentWallet, attacker;

  // Test constants
  const UNIV_NAME = "Visvesvaraya Technological University";
  const UNIV_CODE = "VTU-KA-001";

  const UNIV2_NAME = "Bangalore University";
  const UNIV2_CODE = "BU-KA-002";

  const COMP_NAME = "Infosys Technologies Ltd";
  const COMP_CODE = "INFY-BLR-01";

  const STUDENT_USN = "1RV21CS001";
  const STUDENT_NAME = "Rahul Sharma";
  const STUDENT_COURSE = "B.E. Computer Science & Engineering";
  const STUDENT_GRAD_YEAR = 2025;
  const STUDENT_PERCENTAGE = 88;
  const DOC_TYPE = "Degree Certificate";

  // SHA-256 hash of original marksheet PDF (bytes32 hex format)
  const ORIGINAL_DOC_HASH = "0x4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
  const TAMPERED_DOC_HASH = "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
  const IPFS_CID = "QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx";

  beforeEach(async function () {
    [admin, univWallet, univ2Wallet, compWallet, studentWallet, attacker] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("ITHiringMarksVerification");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  // =========================================================================
  // 1. DEPLOYMENT & ADMIN PERMISSIONS
  // =========================================================================
  describe("1. Deployment & System Initialization", function () {
    it("Should set the deploying account as contract admin", async function () {
      expect(await contract.admin()).to.equal(admin.address);
    });

    it("Should initialize all entity counters to zero", async function () {
      const counters = await contract.getCounters();
      expect(counters[0]).to.equal(0n); // totalUniversities
      expect(counters[1]).to.equal(0n); // totalStudents
      expect(counters[2]).to.equal(0n); // totalCredentials
      expect(counters[3]).to.equal(0n); // totalCompanies
      expect(counters[4]).to.equal(0n); // totalVerifications
    });
  });

  // =========================================================================
  // 2. UNIVERSITY REGISTRATION & GOVERNANCE
  // =========================================================================
  describe("2. University Authority Management", function () {
    it("Should allow Admin to register an accredited university", async function () {
      await expect(contract.connect(admin).registerUniversity(UNIV_NAME, UNIV_CODE, univWallet.address))
        .to.emit(contract, "UniversityRegistered")
        .withArgs(1n, UNIV_NAME, UNIV_CODE, univWallet.address);

      const u = await contract.getUniversity(1);
      expect(u.id).to.equal(1n);
      expect(u.name).to.equal(UNIV_NAME);
      expect(u.universityCode).to.equal(UNIV_CODE);
      expect(u.wallet).to.equal(univWallet.address);
      expect(u.active).to.be.true;

      expect(await contract.universityAddressToId(univWallet.address)).to.equal(1n);
    });

    it("Should reject university registration from non-admin account", async function () {
      await expect(
        contract.connect(attacker).registerUniversity("Fake Univ", "FAKE-01", attacker.address)
      ).to.be.revertedWith("Auth: Only platform admin allowed");
    });

    it("Should prevent registering duplicate university code", async function () {
      await contract.connect(admin).registerUniversity(UNIV_NAME, UNIV_CODE, univWallet.address);
      await expect(
        contract.connect(admin).registerUniversity("Duplicate Univ", UNIV_CODE, univ2Wallet.address)
      ).to.be.revertedWith("Conflict: University code already registered");
    });

    it("Should prevent binding the same wallet address to multiple universities", async function () {
      await contract.connect(admin).registerUniversity(UNIV_NAME, UNIV_CODE, univWallet.address);
      await expect(
        contract.connect(admin).registerUniversity("Another Univ", "DIFF-CODE", univWallet.address)
      ).to.be.revertedWith("Conflict: University wallet already registered");
    });

    it("Should allow Admin to deactivate and reactivate a university", async function () {
      await contract.connect(admin).registerUniversity(UNIV_NAME, UNIV_CODE, univWallet.address);

      // Deactivate
      await expect(contract.connect(admin).deactivateUniversity(1))
        .to.emit(contract, "UniversityStatusChanged")
        .withArgs(1n, false);

      let u = await contract.getUniversity(1);
      expect(u.active).to.be.false;

      // Reactivate
      await expect(contract.connect(admin).activateUniversity(1))
        .to.emit(contract, "UniversityStatusChanged")
        .withArgs(1n, true);

      u = await contract.getUniversity(1);
      expect(u.active).to.be.true;
    });
  });

  // =========================================================================
  // 3. COMPANY (RECRUITER) MANAGEMENT
  // =========================================================================
  describe("3. Company (IT Recruiter) Management", function () {
    it("Should allow Admin to register an authorized IT hiring partner", async function () {
      await expect(contract.connect(admin).registerCompany(COMP_NAME, COMP_CODE, compWallet.address))
        .to.emit(contract, "CompanyRegistered")
        .withArgs(1n, COMP_NAME, COMP_CODE, compWallet.address);

      const c = await contract.getCompany(1);
      expect(c.id).to.equal(1n);
      expect(c.name).to.equal(COMP_NAME);
      expect(c.companyCode).to.equal(COMP_CODE);
      expect(c.wallet).to.equal(compWallet.address);
      expect(c.active).to.be.true;

      expect(await contract.companyAddressToId(compWallet.address)).to.equal(1n);
    });

    it("Should reject company registration from non-admin account", async function () {
      await expect(
        contract.connect(attacker).registerCompany("Fake Company", "FAKE-CO", attacker.address)
      ).to.be.revertedWith("Auth: Only platform admin allowed");
    });

    it("Should prevent registering duplicate company code", async function () {
      await contract.connect(admin).registerCompany(COMP_NAME, COMP_CODE, compWallet.address);
      await expect(
        contract.connect(admin).registerCompany("Duplicate Tech", COMP_CODE, attacker.address)
      ).to.be.revertedWith("Conflict: Company code already registered");
    });
  });

  // =========================================================================
  // 4. STUDENT ONBOARDING
  // =========================================================================
  describe("4. Student Onboarding & Uniqueness Protection", function () {
    beforeEach(async function () {
      await contract.connect(admin).registerUniversity(UNIV_NAME, UNIV_CODE, univWallet.address);
    });

    it("Should allow an accredited university to register a student", async function () {
      await expect(
        contract
          .connect(univWallet)
          .registerStudent(STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, STUDENT_PERCENTAGE)
      )
        .to.emit(contract, "StudentRegistered")
        .withArgs(1n, STUDENT_USN, STUDENT_NAME, 1n);

      const s = await contract.getStudentByUSN(STUDENT_USN);
      expect(s.id).to.equal(1n);
      expect(s.usn).to.equal(STUDENT_USN);
      expect(s.name).to.equal(STUDENT_NAME);
      expect(s.percentage).to.equal(BigInt(STUDENT_PERCENTAGE));
      expect(s.universityId).to.equal(1n);
      expect(s.exists).to.be.true;
    });

    it("Should reject student registration from an unauthorized account", async function () {
      await expect(
        contract
          .connect(attacker)
          .registerStudent(STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, STUDENT_PERCENTAGE)
      ).to.be.revertedWith("Auth: Caller is not a registered university");
    });

    it("Should prevent registering duplicate student USN", async function () {
      await contract
        .connect(univWallet)
        .registerStudent(STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, STUDENT_PERCENTAGE);

      await expect(
        contract
          .connect(univWallet)
          .registerStudent(STUDENT_USN, "Imposter Student", STUDENT_COURSE, STUDENT_GRAD_YEAR, 92)
      ).to.be.revertedWith("Conflict: USN already registered");
    });

    it("Should reject student registration with percentage > 100", async function () {
      await expect(
        contract
          .connect(univWallet)
          .registerStudent(STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, 105)
      ).to.be.revertedWith("Validation: Percentage cannot exceed 100");
    });
  });

  // =========================================================================
  // 5. CREDENTIAL ISSUANCE
  // =========================================================================
  describe("5. Cryptographic Credential Issuance", function () {
    beforeEach(async function () {
      await contract.connect(admin).registerUniversity(UNIV_NAME, UNIV_CODE, univWallet.address);
      await contract.connect(admin).registerUniversity(UNIV2_NAME, UNIV2_CODE, univ2Wallet.address);
      await contract
        .connect(univWallet)
        .registerStudent(STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, STUDENT_PERCENTAGE);
    });

    it("Should allow issuing university to mint a credential with docType, hash, and IPFS CID", async function () {
      await expect(contract.connect(univWallet).issueCredential(1, DOC_TYPE, ORIGINAL_DOC_HASH, IPFS_CID))
        .to.emit(contract, "CredentialIssued")
        .withArgs(1n, 1n, 1n, DOC_TYPE, ORIGINAL_DOC_HASH, IPFS_CID, 1n);

      const cred = await contract.getCredential(1);
      expect(cred.credentialId).to.equal(1n);
      expect(cred.studentId).to.equal(1n);
      expect(cred.universityId).to.equal(1n);
      expect(cred.documentType).to.equal(DOC_TYPE);
      expect(cred.documentHash).to.equal(ORIGINAL_DOC_HASH);
      expect(cred.ipfsCID).to.equal(IPFS_CID);
      expect(cred.version).to.equal(1n);
      expect(cred.status).to.equal(0n); // CredentialStatus.Active
      expect(cred.exists).to.be.true;

      const studentCreds = await contract.getCredentialsByStudent(1);
      expect(studentCreds.length).to.equal(1);
      expect(studentCreds[0]).to.equal(1n);
    });

    it("Should prevent another university from issuing credentials for a student not enrolled with them", async function () {
      await expect(
        contract.connect(univ2Wallet).issueCredential(1, DOC_TYPE, ORIGINAL_DOC_HASH, IPFS_CID)
      ).to.be.revertedWith("Auth: Student belongs to different university");
    });

    it("Should reject credential issuance with empty bytes32(0) document hash", async function () {
      await expect(
        contract.connect(univWallet).issueCredential(1, DOC_TYPE, ethers.ZeroHash, IPFS_CID)
      ).to.be.revertedWith("Validation: Document hash cannot be empty");
    });
  });

  // =========================================================================
  // 6. TWO-TIER RECRUITER VERIFICATION & FRAUD DETECTION
  // =========================================================================
  describe("6. Two-Tier Recruiter Verification & Cryptographic Tamper Engine", function () {
    beforeEach(async function () {
      await contract.connect(admin).registerUniversity(UNIV_NAME, UNIV_CODE, univWallet.address);
      await contract.connect(admin).registerCompany(COMP_NAME, COMP_CODE, compWallet.address);
      await contract
        .connect(univWallet)
        .registerStudent(STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, STUDENT_PERCENTAGE);
      await contract.connect(univWallet).issueCredential(1, DOC_TYPE, ORIGINAL_DOC_HASH, IPFS_CID);
    });

    it("Mode 1: Should verify active student credential via quick USN lookup", async function () {
      const tx = await contract.connect(compWallet).verifyCredentialQuick(STUDENT_USN);
      await tx.wait();

      const res = await contract.connect(compWallet).verifyCredentialQuick.staticCall(STUDENT_USN);
      expect(res.isValid).to.be.true;
      expect(res.studentId).to.equal(1n);
      expect(res.latestCredentialId).to.equal(1n);
      expect(res.documentType).to.equal(DOC_TYPE);
      expect(res.status).to.equal(0n); // Active
    });

    it("Mode 1: Should reject verification call from an unregistered company", async function () {
      await expect(
        contract.connect(attacker).verifyCredentialQuick(STUDENT_USN)
      ).to.be.revertedWith("Auth: Caller is not a registered company");
    });

    it("Mode 2: Should confirm authenticity when candidate submits exact matching document hash", async function () {
      const res = await contract
        .connect(compWallet)
        .verifyCredentialWithHash.staticCall(1, ORIGINAL_DOC_HASH);

      expect(res.isAuthentic).to.be.true;
      expect(res.hashMatched).to.be.true;
      expect(res.documentType).to.equal(DOC_TYPE);
      expect(res.status).to.equal(0n); // Active

      // Execute transaction and check event emission
      await expect(contract.connect(compWallet).verifyCredentialWithHash(1, ORIGINAL_DOC_HASH))
        .to.emit(contract, "CredentialVerified")
        .withArgs(1n, 1n, 1n, DOC_TYPE, true, true, (ts) => ts > 0n);

      // Verify on-chain permanent audit log
      const audit = await contract.getVerification(1);
      expect(audit.verificationId).to.equal(1n);
      expect(audit.credentialId).to.equal(1n);
      expect(audit.companyId).to.equal(1n);
      expect(audit.documentType).to.equal(DOC_TYPE);
      expect(audit.hashMatched).to.be.true;
      expect(audit.verified).to.be.true;

      // Verify company relational audit query
      const compAudits = await contract.getVerificationsByCompany(1);
      expect(compAudits.length).to.equal(1);
      expect(compAudits[0]).to.equal(1n);

      // Verify credential relational audit query
      const credAudits = await contract.getVerificationsByCredential(1);
      expect(credAudits.length).to.equal(1);
      expect(credAudits[0]).to.equal(1n);
    });

    it("Mode 2: Should flag TAMPER DETECTED when candidate submits altered document hash", async function () {
      const res = await contract
        .connect(compWallet)
        .verifyCredentialWithHash.staticCall(1, TAMPERED_DOC_HASH);

      expect(res.isAuthentic).to.be.false;
      expect(res.hashMatched).to.be.false;

      // On-chain audit trail must record the failed tamper attempt
      await expect(contract.connect(compWallet).verifyCredentialWithHash(1, TAMPERED_DOC_HASH))
        .to.emit(contract, "CredentialVerified")
        .withArgs(1n, 1n, 1n, DOC_TYPE, false, false, (ts) => ts > 0n);

      const audit = await contract.getVerification(1);
      expect(audit.hashMatched).to.be.false;
      expect(audit.verified).to.be.false;
    });
  });

  // =========================================================================
  // 7. CREDENTIAL LIFECYCLE (SUSPEND, REACTIVATE, REVOKE)
  // =========================================================================
  describe("7. Credential Lifecycle (Suspend, Reactivate, Revoke)", function () {
    beforeEach(async function () {
      await contract.connect(admin).registerUniversity(UNIV_NAME, UNIV_CODE, univWallet.address);
      await contract.connect(admin).registerUniversity(UNIV2_NAME, UNIV2_CODE, univ2Wallet.address);
      await contract.connect(admin).registerCompany(COMP_NAME, COMP_CODE, compWallet.address);
      await contract
        .connect(univWallet)
        .registerStudent(STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, STUDENT_PERCENTAGE);
      await contract.connect(univWallet).issueCredential(1, DOC_TYPE, ORIGINAL_DOC_HASH, IPFS_CID);
    });

    it("Should allow the issuing university to suspend an active credential", async function () {
      const REASON = "Audit investigation pending";
      await expect(contract.connect(univWallet).suspendCredential(1, REASON))
        .to.emit(contract, "CredentialSuspended")
        .withArgs(1n, 1n, REASON);

      const cred = await contract.getCredential(1);
      expect(cred.status).to.equal(2n); // CredentialStatus.Suspended

      // Verification should fail when suspended
      const res = await contract
        .connect(compWallet)
        .verifyCredentialWithHash.staticCall(1, ORIGINAL_DOC_HASH);
      expect(res.hashMatched).to.be.true;
      expect(res.isAuthentic).to.be.false;
      expect(res.status).to.equal(2n);
    });

    it("Should allow the issuing university to reactivate a suspended credential", async function () {
      await contract.connect(univWallet).suspendCredential(1, "Temporary hold");
      expect((await contract.getCredential(1)).status).to.equal(2n);

      await expect(contract.connect(univWallet).reactivateCredential(1))
        .to.emit(contract, "CredentialReactivated")
        .withArgs(1n, 1n);

      const cred = await contract.getCredential(1);
      expect(cred.status).to.equal(0n); // CredentialStatus.Active

      // Verification succeeds again
      const res = await contract
        .connect(compWallet)
        .verifyCredentialWithHash.staticCall(1, ORIGINAL_DOC_HASH);
      expect(res.isAuthentic).to.be.true;
    });

    it("Should allow the issuing university to permanently revoke a credential", async function () {
      const REASON = "Academic malpractice in final semester thesis";

      await expect(contract.connect(univWallet).revokeCredential(1, REASON))
        .to.emit(contract, "CredentialRevoked")
        .withArgs(1n, 1n, REASON);

      const cred = await contract.getCredential(1);
      expect(cred.status).to.equal(1n); // CredentialStatus.Revoked
    });

    it("Should prevent an unrelated university from revoking the credential", async function () {
      await expect(
        contract.connect(univ2Wallet).revokeCredential(1, "Unauthorized revoke attempt")
      ).to.be.revertedWith("Auth: Only issuing university can revoke");
    });

    it("Should reject verification of a revoked credential even if document hash matches", async function () {
      await contract.connect(univWallet).revokeCredential(1, "Forged prerequisite marks");

      const res = await contract
        .connect(compWallet)
        .verifyCredentialWithHash.staticCall(1, ORIGINAL_DOC_HASH);

      expect(res.hashMatched).to.be.true; // Document bitstream is genuine
      expect(res.isAuthentic).to.be.false; // But credential has been revoked!
      expect(res.status).to.equal(1n); // Status is Revoked
    });

    it("Should prevent revoking an already revoked credential", async function () {
      await contract.connect(univWallet).revokeCredential(1, "First revocation");

      await expect(
        contract.connect(univWallet).revokeCredential(1, "Second revocation attempt")
      ).to.be.revertedWith("State: Already revoked");
    });
  });
});
