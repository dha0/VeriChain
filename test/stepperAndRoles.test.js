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
const {
  getStudentStepperState,
  getCollegeStepperState,
  getCompanyStepperState,
} = require("../lib/stepperEngine.ts");

describe("Process Stepper Engine & Multi-Role Workflow Suite", function () {
  // ---------------------------------------------------------------------------
  // 1. EMPTY / NO DATA AT ALL (Requirement 6)
  // ---------------------------------------------------------------------------
  describe("Section 1: No Data At All Handling (All Roles)", function () {
    it("Student role with no data at all initializes gracefully at Step 1", function () {
      const state = getStudentStepperState({
        student: null,
        achievements: [],
        session: null,
      });

      expect(state.role).to.equal("student");
      expect(state.currentStepId).to.equal("enrolled");
      expect(state.hasError).to.be.false;
      expect(state.steps).to.have.lengthOf(4);

      // Step 1 is current, later steps are upcoming
      expect(state.steps[0].id).to.equal("enrolled");
      expect(state.steps[0].status).to.equal("current");
      expect(state.steps[1].status).to.equal("upcoming");
      expect(state.steps[2].status).to.equal("upcoming");
      expect(state.steps[3].status).to.equal("upcoming");
      expect(state.nextStepGuide).to.include("College Registration");
    });

    it("College role with no data at all initializes gracefully at Step 1 with Reports unavailable", function () {
      const state = getCollegeStepperState({
        university: null,
        totalStudents: 0,
        pendingCount: 0,
        verifiedCount: 0,
        totalCredentials: 0,
      });

      expect(state.role).to.equal("university");
      expect(state.currentStepId).to.equal("accredited");
      expect(state.hasError).to.be.false;
      expect(state.steps).to.have.lengthOf(5);

      // Step 1 is current, later intermediate steps are available (not locked)
      expect(state.steps[0].id).to.equal("accredited");
      expect(state.steps[0].status).to.equal("current");
      expect(state.steps[1].status).to.equal("available");
      expect(state.steps[2].status).to.equal("available");
      expect(state.steps[3].status).to.equal("available");

      // Reports step is marked as not available yet
      expect(state.steps[4].id).to.equal("reports_history");
      expect(state.steps[4].status).to.equal("unavailable");
      expect(state.steps[4].description).to.include("Not available yet");
    });

    it("Company role with no data at all initializes gracefully at Step 1", function () {
      const state = getCompanyStepperState({
        company: null,
        candidate: null,
        credentialsCount: 0,
        tamperAuditResult: null,
        verificationReceipt: null,
        hasOnChainVerificationRecord: false,
      });

      expect(state.role).to.equal("company");
      expect(state.currentStepId).to.equal("partner_approved");
      expect(state.hasError).to.be.false;
      expect(state.steps).to.have.lengthOf(5);

      // Step 1 is current, later steps upcoming
      expect(state.steps[0].id).to.equal("partner_approved");
      expect(state.steps[0].status).to.equal("current");
      expect(state.steps[1].status).to.equal("upcoming");
      expect(state.steps[2].status).to.equal("upcoming");
      expect(state.steps[3].status).to.equal("upcoming");
      expect(state.steps[4].status).to.equal("upcoming");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. STUDENT ROLE STEPPER TESTS (Requirement 2 & Rejection Handling)
  // ---------------------------------------------------------------------------
  describe("Section 2: Student Stepper Lifecycle & Security", function () {
    const validStudent = { id: 1, usn: "1RV21CS001", name: "Alice Rao" };
    const validSession = { role: "student", studentUSN: "1RV21CS001" };

    it("Derives USN strictly from session and merges identity into Step 1", function () {
      const state = getStudentStepperState({
        student: validStudent,
        achievements: [],
        session: validSession,
      });

      expect(state.steps[0].title).to.equal("College Enrolled & Verified");
      expect(state.steps[0].status).to.equal("completed");
      expect(state.currentStepId).to.equal("upload_cert");
      expect(state.steps[1].status).to.equal("current");
      expect(state.nextStepGuide).to.include("Upload Certificate");
    });

    it("Advances to Step 3 (Awaiting College Review) when certificate is pending", function () {
      const state = getStudentStepperState({
        student: validStudent,
        achievements: [
          {
            achievementId: 10,
            studentUSN: "1RV21CS001",
            status: 0, // PendingReview
            reviewRemarks: null,
          },
        ],
        session: validSession,
      });

      expect(state.steps[0].status).to.equal("completed");
      expect(state.steps[1].status).to.equal("completed");
      expect(state.steps[2].status).to.equal("current");
      expect(state.currentStepId).to.equal("under_review");
      expect(state.nextStepGuide).to.include("Awaiting College Review");
      expect(state.hasError).to.be.false;
    });

    it("Enters Error/Blocked state with college remarks when rejected", function () {
      const rejectionRemarks = "Certificate image is blurry and issuing authority seal is obscured.";
      const state = getStudentStepperState({
        student: validStudent,
        achievements: [
          {
            achievementId: 10,
            studentUSN: "1RV21CS001",
            status: 2, // Rejected
            reviewRemarks: rejectionRemarks,
          },
        ],
        session: validSession,
      });

      expect(state.hasError).to.be.true;
      expect(state.errorStepId).to.equal("under_review");
      expect(state.errorMessage).to.equal(rejectionRemarks);
      expect(state.actionText).to.equal("Re-upload Certificate");
      expect(state.steps[2].status).to.equal("error");
      expect(state.steps[2].errorReason).to.equal(rejectionRemarks);
      expect(state.nextStepGuide).to.include("Action Required: Re-upload Certificate");
    });

    it("Completes Step 4 (Certificate Endorsed) when verified", function () {
      const state = getStudentStepperState({
        student: validStudent,
        achievements: [
          {
            achievementId: 10,
            studentUSN: "1RV21CS001",
            status: 1, // Verified
            reviewRemarks: "Officially verified and endorsed.",
          },
        ],
        session: validSession,
      });

      expect(state.hasError).to.be.false;
      expect(state.currentStepId).to.equal("endorsed");
      expect(state.steps[0].status).to.equal("completed");
      expect(state.steps[1].status).to.equal("completed");
      expect(state.steps[2].status).to.equal("completed");
      expect(state.steps[3].status).to.equal("completed");
      expect(state.nextStepGuide).to.include("All Set: Certificate Endorsed");
    });

    it("Enforces cross-student data isolation (ignores other student's achievements)", function () {
      const state = getStudentStepperState({
        student: validStudent,
        achievements: [
          {
            achievementId: 99,
            studentUSN: "1MS21CS099", // Different student!
            status: 1,
          },
        ],
        session: validSession,
      });

      // Since the achievements belong to 1MS21CS099, 1RV21CS001 has no achievements
      expect(state.currentStepId).to.equal("upload_cert");
      expect(state.steps[1].status).to.equal("current");
      expect(state.steps[2].status).to.equal("upcoming");
    });

    it("Never relies on URL or non-session USN", function () {
      const state = getStudentStepperState({
        student: validStudent,
        achievements: [],
        session: { role: "student", studentUSN: "" }, // No USN in session!
      });

      // Not considered enrolled because verified session lacks studentUSN
      expect(state.steps[0].status).to.equal("current");
      expect(state.currentStepId).to.equal("enrolled");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. COLLEGE ROLE STEPPER TESTS (Requirement 3: First incomplete is current, later available)
  // ---------------------------------------------------------------------------
  describe("Section 3: College Stepper Progression & Available Steps", function () {
    const activeUniversity = { id: 1, active: true, universityCode: "RV" };

    it("Marks first incomplete step as current and later steps as available (not locked)", function () {
      // Step 1 done (accredited), Step 2 incomplete (no students onboarded)
      const state = getCollegeStepperState({
        university: activeUniversity,
        totalStudents: 0,
        pendingCount: 0,
        verifiedCount: 0,
        totalCredentials: 0,
      });

      expect(state.currentStepId).to.equal("onboard_students");
      expect(state.steps[0].status).to.equal("completed"); // Institutional Accreditation
      expect(state.steps[1].status).to.equal("current"); // Onboard Students
      expect(state.steps[2].status).to.equal("available"); // Review Queue is available!
      expect(state.steps[3].status).to.equal("available"); // Endorse/Reject is available!
      expect(state.steps[4].status).to.equal("unavailable"); // Reports unavailable (0 credentials)
    });

    it("Advances to Review Queue when students onboarded and queue has pending submissions", function () {
      const state = getCollegeStepperState({
        university: activeUniversity,
        totalStudents: 25,
        pendingCount: 4,
        verifiedCount: 0,
        totalCredentials: 0,
      });

      expect(state.currentStepId).to.equal("review_queue");
      expect(state.steps[0].status).to.equal("completed");
      expect(state.steps[1].status).to.equal("completed");
      expect(state.steps[2].status).to.equal("current");
      expect(state.steps[3].status).to.equal("available");
      expect(state.steps[4].status).to.equal("unavailable");
      expect(state.nextStepGuide).to.include("4 candidate certificate(s) awaiting your endorsement");
    });

    it("Marks Reports step as 'not available yet' if credentials are never issued in the flow", function () {
      const state = getCollegeStepperState({
        university: activeUniversity,
        totalStudents: 25,
        pendingCount: 0,
        verifiedCount: 5,
        totalCredentials: 0, // No credentials issued!
      });

      expect(state.steps[4].status).to.equal("unavailable");
      expect(state.steps[4].description).to.equal(
        "Not available yet - issue credentials or marksheets to unlock reports"
      );
    });

    it("Unlocks Reports & Ledger History once credentials or marksheets are issued", function () {
      const state = getCollegeStepperState({
        university: activeUniversity,
        totalStudents: 25,
        pendingCount: 0,
        verifiedCount: 5,
        totalCredentials: 3, // Credentials exist!
      });

      expect(state.steps[4].status).to.equal("completed");
      expect(state.steps[4].description).to.include("Access issued marksheets");
      expect(state.nextStepGuide).to.include("All Systems Active");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. COMPANY ROLE STEPPER TESTS (Requirement 4: On-Chain Receipt & Refresh Persistence)
  // ---------------------------------------------------------------------------
  describe("Section 4: Company Stepper Progression & On-Chain Receipt Derivation", function () {
    const activeCompany = { id: 1, active: true, companyCode: "GOOG" };

    it("Progresses sequentially through Candidate Search, Credential Inspection, Tamper Audit", function () {
      // 1. Authorized recruiter, no search yet
      let state = getCompanyStepperState({
        company: activeCompany,
        candidate: null,
      });
      expect(state.currentStepId).to.equal("search_candidate");
      expect(state.steps[0].status).to.equal("completed");
      expect(state.steps[1].status).to.equal("current");

      // 2. Candidate found, 2 credentials
      state = getCompanyStepperState({
        company: activeCompany,
        candidate: { id: 5, usn: "1RV21CS001" },
        credentialsCount: 2,
      });
      expect(state.currentStepId).to.equal("tamper_audit");
      expect(state.steps[0].status).to.equal("completed");
      expect(state.steps[1].status).to.equal("completed");
      expect(state.steps[2].status).to.equal("completed");
      expect(state.steps[3].status).to.equal("current");

      // 3. Cryptographic tamper audit performed
      state = getCompanyStepperState({
        company: activeCompany,
        candidate: { id: 5, usn: "1RV21CS001" },
        credentialsCount: 2,
        tamperAuditResult: { isAuthentic: true, hashMatched: true },
      });
      expect(state.currentStepId).to.equal("receipt_logged");
      expect(state.steps[3].status).to.equal("completed");
    });

    it("Derives the receipt step from on-chain verification record where one exists", function () {
      // Company has an on-chain verification record in its ledger history
      const state = getCompanyStepperState({
        company: activeCompany,
        candidate: { id: 5, usn: "1RV21CS001" },
        credentialsCount: 2,
        tamperAuditResult: { isAuthentic: true, hashMatched: true },
        hasOnChainVerificationRecord: true,
      });

      expect(state.steps[4].id).to.equal("receipt_logged");
      expect(state.steps[4].status).to.equal("completed");
      expect(state.nextStepGuide).to.include("Verified: On-Chain Receipt Recorded");
    });

    it("Correctly tracks which steps persist and which steps reset on page refresh", function () {
      // BEFORE REFRESH: Full verification performed
      const beforeRefresh = getCompanyStepperState({
        company: activeCompany,
        candidate: { id: 5, usn: "1RV21CS001" },
        credentialsCount: 2,
        tamperAuditResult: { isAuthentic: true, hashMatched: true },
        verificationReceipt: { verificationId: 101, txHash: "0x1234" },
        hasOnChainVerificationRecord: true,
      });
      expect(beforeRefresh.steps.every((s) => s.status === "completed")).to.be.true;

      // ON REFRESH:
      // - Company authorization persists (from verified session cookie)
      // - On-chain verification record persists (reloaded from blockchain)
      // - Candidate search & Tamper audit reset (transient in-memory UI state)
      const afterRefresh = getCompanyStepperState({
        company: activeCompany,
        candidate: null, // Reset on page refresh
        credentialsCount: 0, // Reset on page refresh
        tamperAuditResult: null, // Reset on page refresh
        hasOnChainVerificationRecord: true, // Persists from blockchain ledger!
      });

      expect(afterRefresh.steps[0].status).to.equal("completed"); // Persists
      expect(afterRefresh.steps[1].status).to.equal("current"); // Resets to current
      expect(afterRefresh.steps[2].status).to.equal("upcoming"); // Resets to upcoming
      expect(afterRefresh.steps[3].status).to.equal("upcoming"); // Resets to upcoming
      expect(afterRefresh.steps[4].status).to.equal("completed"); // Persists via on-chain record!
      expect(afterRefresh.steps[4].title).to.equal("Last Verification Recorded");
    });

    it("Step 5 reflects the candidate currently searched and relabels when no candidate is active", function () {
      // 1. Newly searched candidate without verification receipt: Step 5 must NOT be completed
      const unverifiedCandidateState = getCompanyStepperState({
        company: activeCompany,
        candidate: { id: 7, usn: "1RV21CS099" },
        credentialsCount: 1,
        tamperAuditResult: null,
        verificationReceipt: null,
        hasOnChainVerificationRecord: false,
      });

      expect(unverifiedCandidateState.steps[4].title).to.equal("Verification Receipt");
      expect(unverifiedCandidateState.steps[4].description).to.include("1RV21CS099");
      expect(unverifiedCandidateState.steps[4].status).to.equal("upcoming");

      // 2. No candidate searched (general dashboard): Step 5 relabels to 'Last Verification Recorded'
      const generalDashboardState = getCompanyStepperState({
        company: activeCompany,
        candidate: null,
        hasOnChainVerificationRecord: true,
      });

      expect(generalDashboardState.steps[4].title).to.equal("Last Verification Recorded");
      expect(generalDashboardState.steps[4].status).to.equal("completed");
    });
  });
});
