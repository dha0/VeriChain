const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ITHiringMarksVerification Smart Contract Test Suite", function () {
  let contract;
  let admin, univWallet, univ2Wallet, compWallet, studentWallet, attacker;

  // Test constants conforming to Phase 3 College Model & USN standard
  const UNIV_NAME = "RV College of Engineering";
  const UNIV_CODE = "RV";

  const UNIV2_NAME = "MS Ramaiah Institute of Technology";
  const UNIV2_CODE = "MS";

  const COMP_NAME = "Infosys Technologies Ltd";
  const COMP_CODE = "INFY-BLR-01";

  const STUDENT_USN = "1RV21CS001";
  const STUDENT_NAME = "Rahul Sharma";
  const STUDENT_COURSE = "B.E. Computer Science & Engineering";
  const STUDENT_GRAD_YEAR = 2025;
  const MARKS_HASH = "0x4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
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
    it("Should set the deploying account as contract admin and authorized relayer", async function () {
      expect(await contract.admin()).to.equal(admin.address);
      expect(await contract.authorizedRelayer()).to.equal(admin.address);
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
      await expect(contract.connect(admin)["registerUniversity(string,string,string,address)"](UNIV_NAME, UNIV_CODE, "VTU", univWallet.address))
        .to.emit(contract, "UniversityRegistered")
        .withArgs(1n, UNIV_NAME, UNIV_CODE, "VTU", univWallet.address);

      const u = await contract.getUniversity(1);
      expect(u.id).to.equal(1n);
      expect(u.name).to.equal(UNIV_NAME);
      expect(u.universityCode).to.equal(UNIV_CODE);
      expect(u.affiliatingUniversity).to.equal("VTU");
      expect(u.wallet).to.equal(univWallet.address);
      expect(u.active).to.be.true;

      expect(await contract.universityAddressToId(univWallet.address)).to.equal(1n);
    });

    it("Should reject university registration from non-admin account", async function () {
      await expect(
        contract.connect(attacker)["registerUniversity(string,string,string,address)"]("Fake Univ", "FK", "VTU", attacker.address)
      ).to.be.revertedWith("Auth: Only platform admin allowed");
    });
  });

  // =========================================================================
  // 3. COMPANY REGISTRATION & GOVERNANCE
  // =========================================================================
  describe("3. Corporate Recruiter Management", function () {
    it("Should allow Admin to register an authorized hiring partner", async function () {
      await expect(contract.connect(admin).registerCompany(COMP_NAME, COMP_CODE, compWallet.address))
        .to.emit(contract, "CompanyRegistered")
        .withArgs(1n, COMP_NAME, COMP_CODE, compWallet.address);

      const c = await contract.getCompany(1);
      expect(c.id).to.equal(1n);
      expect(c.name).to.equal(COMP_NAME);
      expect(c.companyCode).to.equal(COMP_CODE);
      expect(c.active).to.be.true;
    });

    it("Should prevent registering duplicate company code", async function () {
      await contract.connect(admin).registerCompany(COMP_NAME, COMP_CODE, compWallet.address);
      await expect(
        contract.connect(admin).registerCompany("Duplicate Tech", COMP_CODE, attacker.address)
      ).to.be.revertedWith("Conflict: Company code already registered");
    });
  });

  // =========================================================================
  // 4. STUDENT ONBOARDING (PHASE 3 RELAYER ARCHITECTURE & COLLEGE BINDING)
  // =========================================================================
  describe("4. Student Onboarding & Uniqueness Protection", function () {
    beforeEach(async function () {
      await contract.connect(admin)["registerUniversity(string,string,string,address)"](UNIV_NAME, UNIV_CODE, "VTU", univWallet.address);
    });

    it("Should allow authorized relayer to register a student for college", async function () {
      await expect(
        contract
          .connect(admin)
          .registerStudent(1, STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, MARKS_HASH)
      )
        .to.emit(contract, "StudentRegistered")
        .withArgs(1n, STUDENT_USN, STUDENT_NAME, 1n, MARKS_HASH);

      const s = await contract.getStudentByUSN(STUDENT_USN);
      expect(s.id).to.equal(1n);
      expect(s.usn).to.equal(STUDENT_USN);
      expect(s.name).to.equal(STUDENT_NAME);
      expect(s.marksHash).to.equal(MARKS_HASH);
      expect(s.universityId).to.equal(1n);
      expect(s.exists).to.be.true;
    });

    it("Should reject student registration from an unauthorized non-relayer account", async function () {
      await expect(
        contract
          .connect(attacker)
          .registerStudent(1, STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, MARKS_HASH)
      ).to.be.revertedWith("Auth: Only authorized relayer allowed");
    });

    it("Should prevent registering duplicate student USN", async function () {
      await contract
        .connect(admin)
        .registerStudent(1, STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, MARKS_HASH);

      await expect(
        contract
          .connect(admin)
          .registerStudent(1, STUDENT_USN, "Imposter Student", STUDENT_COURSE, STUDENT_GRAD_YEAR, MARKS_HASH)
      ).to.be.revertedWith("Conflict: USN already registered");
    });

    it("Should reject student registration with empty marksHash", async function () {
      await expect(
        contract
          .connect(admin)
          .registerStudent(1, STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, ethers.ZeroHash)
      ).to.be.revertedWith("Validation: Marks hash cannot be empty");
    });

    it("Should reject student registration if USN college code does not match registering college", async function () {
      await expect(
        contract
          .connect(admin)
          .registerStudent(1, "1BM21CS001", STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, MARKS_HASH)
      ).to.be.revertedWith("Auth: USN college code does not match registering college");
    });
  });

  // =========================================================================
  // 5. CREDENTIAL ISSUANCE (RELAYER ONLY)
  // =========================================================================
  describe("5. Cryptographic Credential Issuance", function () {
    beforeEach(async function () {
      await contract.connect(admin)["registerUniversity(string,string,string,address)"](UNIV_NAME, UNIV_CODE, "VTU", univWallet.address);
      await contract.connect(admin)["registerUniversity(string,string,string,address)"](UNIV2_NAME, UNIV2_CODE, "VTU", univ2Wallet.address);
      await contract
        .connect(admin)
        .registerStudent(1, STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, MARKS_HASH);
    });

    it("Should allow relayer to issue credential for student's college", async function () {
      await expect(contract.connect(admin).issueCredential(1, 1, DOC_TYPE, ORIGINAL_DOC_HASH, IPFS_CID))
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

    it("Should prevent another college from issuing credentials for a student not enrolled with them", async function () {
      await expect(
        contract.connect(admin).issueCredential(2, 1, DOC_TYPE, ORIGINAL_DOC_HASH, IPFS_CID)
      ).to.be.revertedWith("Auth: Student belongs to different college");
    });

    it("Should reject credential issuance with empty bytes32(0) document hash", async function () {
      await expect(
        contract.connect(admin).issueCredential(1, 1, DOC_TYPE, ethers.ZeroHash, IPFS_CID)
      ).to.be.revertedWith("Validation: Document hash cannot be empty");
    });
  });

  // =========================================================================
  // 6. TWO-TIER RECRUITER VERIFICATION & FRAUD DETECTION
  // =========================================================================
  describe("6. Two-Tier Recruiter Verification & Cryptographic Tamper Engine", function () {
    beforeEach(async function () {
      await contract.connect(admin)["registerUniversity(string,string,string,address)"](UNIV_NAME, UNIV_CODE, "VTU", univWallet.address);
      await contract.connect(admin).registerCompany(COMP_NAME, COMP_CODE, compWallet.address);
      await contract
        .connect(admin)
        .registerStudent(1, STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, MARKS_HASH);
      await contract.connect(admin).issueCredential(1, 1, DOC_TYPE, ORIGINAL_DOC_HASH, IPFS_CID);
    });

    it("Should record verification on-chain via authorized relayer", async function () {
      await expect(contract.connect(admin).recordVerificationByCompany(1, 1, true, true, DOC_TYPE))
        .to.emit(contract, "CredentialVerified")
        .withArgs(1n, 1n, 1n, DOC_TYPE, true, true, (ts) => ts > 0n);

      const audit = await contract.getVerification(1);
      expect(audit.verificationId).to.equal(1n);
      expect(audit.credentialId).to.equal(1n);
      expect(audit.companyId).to.equal(1n);
      expect(audit.documentType).to.equal(DOC_TYPE);
      expect(audit.hashMatched).to.be.true;
      expect(audit.verified).to.be.true;
    });

    it("Should reject direct recordVerification call from non-relayer account", async function () {
      await expect(
        contract.connect(attacker).recordVerificationByCompany(1, 1, true, true, DOC_TYPE)
      ).to.be.revertedWith("Auth: Only authorized relayer allowed");
    });
  });

  // =========================================================================
  // 7. CREDENTIAL LIFECYCLE (SUSPEND, REACTIVATE, REVOKE)
  // =========================================================================
  describe("7. Credential Lifecycle (Suspend, Reactivate, Revoke)", function () {
    beforeEach(async function () {
      await contract.connect(admin)["registerUniversity(string,string,string,address)"](UNIV_NAME, UNIV_CODE, "VTU", univWallet.address);
      await contract.connect(admin)["registerUniversity(string,string,string,address)"](UNIV2_NAME, UNIV2_CODE, "VTU", univ2Wallet.address);
      await contract.connect(admin).registerCompany(COMP_NAME, COMP_CODE, compWallet.address);
      await contract
        .connect(admin)
        .registerStudent(1, STUDENT_USN, STUDENT_NAME, STUDENT_COURSE, STUDENT_GRAD_YEAR, MARKS_HASH);
      await contract.connect(admin).issueCredential(1, 1, DOC_TYPE, ORIGINAL_DOC_HASH, IPFS_CID);
    });

    it("Should allow the issuing college to suspend an active credential", async function () {
      const REASON = "Audit investigation pending";
      await expect(contract.connect(admin).suspendCredential(1, 1, REASON))
        .to.emit(contract, "CredentialSuspended")
        .withArgs(1n, 1n, REASON);

      const cred = await contract.getCredential(1);
      expect(cred.status).to.equal(2n); // CredentialStatus.Suspended
    });

    it("Should allow the issuing college to reactivate a suspended credential", async function () {
      await contract.connect(admin).suspendCredential(1, 1, "Temporary hold");
      expect((await contract.getCredential(1)).status).to.equal(2n);

      await expect(contract.connect(admin).reactivateCredential(1, 1))
        .to.emit(contract, "CredentialReactivated")
        .withArgs(1n, 1n);

      const cred = await contract.getCredential(1);
      expect(cred.status).to.equal(0n); // CredentialStatus.Active
    });

    it("Should allow the issuing college to permanently revoke a credential", async function () {
      const REASON = "Academic malpractice in final semester thesis";

      await expect(contract.connect(admin).revokeCredential(1, 1, REASON))
        .to.emit(contract, "CredentialRevoked")
        .withArgs(1n, 1n, REASON);

      const cred = await contract.getCredential(1);
      expect(cred.status).to.equal(1n); // CredentialStatus.Revoked
    });

    it("Should prevent an unrelated college from revoking the credential", async function () {
      await expect(
        contract.connect(admin).revokeCredential(2, 1, "Unauthorized revoke attempt")
      ).to.be.revertedWith("Auth: Only issuing college can revoke");
    });
  });
});
