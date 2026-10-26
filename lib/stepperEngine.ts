/**
 * Process Stepper State Engine
 * Computes deterministic stepper state, next-action guides, and accessibility metadata
 * for Student, College, and Company roles from existing page and session data.
 */

export type StepStatus =
  | "completed"
  | "current"
  | "available"
  | "upcoming"
  | "error"
  | "unavailable";

export interface StepperStep {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  errorReason?: string;
  actionText?: string;
  nextActionGuide?: string;
}

export interface StepperState {
  role: "student" | "university" | "company";
  steps: StepperStep[];
  currentStepId: string;
  nextStepGuide: string;
  hasError: boolean;
  errorStepId?: string;
  errorMessage?: string;
  actionText?: string;
}

// -----------------------------------------------------------------------------
// 1. STUDENT STEPPER ENGINE
// -----------------------------------------------------------------------------
export interface StudentStepperParams {
  student: { id: number; usn: string; name?: string } | null;
  achievements?: Array<{
    achievementId?: number;
    studentUSN?: string;
    studentId?: number;
    status: number | string;
    reviewRemarks?: string | null;
    submittedAt?: number | string | Date;
  }>;
  session?: {
    role?: string;
    studentUSN?: string | null;
    account?: string | null;
  } | null;
}

export function getStudentStepperState(params: StudentStepperParams): StepperState {
  const sessionRole = params.session?.role;
  const sessionUsn = (params.session?.studentUSN || "").trim().toUpperCase();

  // If no student data or not logged in as student
  const isEnrolled = Boolean(
    sessionRole === "student" &&
      sessionUsn &&
      params.student &&
      params.student.id > 0 &&
      params.student.usn.toUpperCase() === sessionUsn
  );

  // Cross-student data isolation: Filter achievements strictly to the authenticated student
  const studentAchievements = (params.achievements || []).filter(
    (a) => a.studentUSN && a.studentUSN.trim().toUpperCase() === sessionUsn
  );

  const hasUploaded = studentAchievements.length > 0;
  const latestAch = hasUploaded ? studentAchievements[studentAchievements.length - 1] : null;

  // Status mapping: 0 | "pending" = PendingReview, 1 | "verified" = Verified, 2 | "rejected" = Rejected
  const isPending =
    latestAch != null &&
    (latestAch.status === 0 ||
      latestAch.status === "0" ||
      String(latestAch.status).toLowerCase() === "pending" ||
      String(latestAch.status).toLowerCase() === "pendingreview");

  const isVerified =
    latestAch != null &&
    (latestAch.status === 1 ||
      latestAch.status === "1" ||
      String(latestAch.status).toLowerCase() === "verified" ||
      String(latestAch.status).toLowerCase() === "endorsed");

  const isRejected =
    latestAch != null &&
    (latestAch.status === 2 ||
      latestAch.status === "2" ||
      String(latestAch.status).toLowerCase() === "rejected");

  const rejectionReason = isRejected
    ? latestAch?.reviewRemarks?.trim() || "Certificate submission was rejected by your college."
    : undefined;

  // Determine Step 1: College Enrolled & Verified
  const step1Status: StepStatus = isEnrolled ? "completed" : "current";

  // Determine Step 2: Upload Certificate
  let step2Status: StepStatus = "upcoming";
  if (isEnrolled) {
    step2Status = hasUploaded ? "completed" : "current";
  }

  // Determine Step 3: Awaiting College Review
  let step3Status: StepStatus = "upcoming";
  if (isEnrolled && hasUploaded) {
    if (isRejected) {
      step3Status = "error";
    } else if (isVerified) {
      step3Status = "completed";
    } else {
      step3Status = "current";
    }
  }

  // Determine Step 4: Certificate Endorsed
  let step4Status: StepStatus = "upcoming";
  if (isVerified) {
    step4Status = "completed";
  }

  const steps: StepperStep[] = [
    {
      id: "enrolled",
      title: "College Enrolled & Verified",
      description: "Candidate enrolled on ledger by college and session verified",
      status: step1Status,
    },
    {
      id: "upload_cert",
      title: "Upload Certificate",
      description: "Upload co-curricular or academic certificate for official college endorsement",
      status: step2Status,
    },
    {
      id: "under_review",
      title: "Awaiting College Review",
      description: "Certificate submitted to your college's institutional queue",
      status: step3Status,
      errorReason: rejectionReason,
      actionText: isRejected ? "Re-upload Certificate" : undefined,
    },
    {
      id: "endorsed",
      title: "Certificate Endorsed",
      description: "Certificate cryptographically verified and anchored on Ethereum",
      status: step4Status,
    },
  ];

  // Derive active current step ID & Next Action Guide
  let currentStepId = "enrolled";
  let nextStepGuide = "Next: College Registration - Sign in with your registered USN and verified session.";
  let hasError = false;
  let errorStepId: string | undefined;
  let errorMessage: string | undefined;
  let actionText: string | undefined;

  if (isRejected) {
    currentStepId = "under_review";
    hasError = true;
    errorStepId = "under_review";
    errorMessage = rejectionReason;
    actionText = "Re-upload Certificate";
    nextStepGuide = `Action Required: Re-upload Certificate - ${rejectionReason}`;
  } else if (isVerified) {
    currentStepId = "endorsed";
    nextStepGuide = "All Set: Certificate Endorsed - Your credentials are cryptographically anchored on Ethereum.";
  } else if (isPending) {
    currentStepId = "under_review";
    nextStepGuide = "Next: Awaiting College Review - Your college authority will verify your submission.";
  } else if (isEnrolled && !hasUploaded) {
    currentStepId = "upload_cert";
    nextStepGuide = "Next: Upload Certificate - Submit a certificate below to request official college verification.";
  }

  return {
    role: "student",
    steps,
    currentStepId,
    nextStepGuide,
    hasError,
    errorStepId,
    errorMessage,
    actionText,
  };
}

// -----------------------------------------------------------------------------
// 2. COLLEGE (UNIVERSITY) STEPPER ENGINE
// -----------------------------------------------------------------------------
export interface CollegeStepperParams {
  university: { id: number; active: boolean; universityCode?: string } | null;
  totalStudents?: number;
  pendingCount?: number;
  verifiedCount?: number;
  totalCredentials?: number;
}

export function getCollegeStepperState(params: CollegeStepperParams): StepperState {
  const isAccredited = Boolean(params.university && params.university.active);
  const totalStudents = Number(params.totalStudents) || 0;
  const pendingCount = Number(params.pendingCount) || 0;
  const verifiedCount = Number(params.verifiedCount) || 0;
  const totalCredentials = Number(params.totalCredentials) || 0;

  const hasStudents = totalStudents > 0;
  const hasPending = pendingCount > 0;
  const hasDecisions = verifiedCount > 0;
  const hasReports = totalCredentials > 0;

  // Rule: Current step is the first incomplete step; later steps are "available", not locked.
  // Step 1: Institutional Accreditation
  const isStep1Done = isAccredited;
  // Step 2: Onboard Students
  const isStep2Done = isStep1Done && hasStudents;
  // Step 3: Review Queue
  const isStep3Done = isStep2Done && !hasPending && hasDecisions;
  // Step 4: Endorse or Reject
  const isStep4Done = isStep2Done && hasDecisions;
  // Step 5: Reports & History
  const isStep5Done = hasReports;

  // Determine current step (first incomplete step)
  let currentStepId = "accredited";
  if (!isStep1Done) {
    currentStepId = "accredited";
  } else if (!isStep2Done) {
    currentStepId = "onboard_students";
  } else if (hasPending || !isStep3Done) {
    currentStepId = "review_queue";
  } else if (!isStep4Done) {
    currentStepId = "endorse_reject";
  } else if (hasReports) {
    currentStepId = "reports_history";
  } else {
    currentStepId = "endorse_reject";
  }

  const steps: StepperStep[] = [
    {
      id: "accredited",
      title: "Institutional Accreditation",
      description: "College registered and authorized by System Administrator",
      status: isStep1Done ? "completed" : currentStepId === "accredited" ? "current" : "available",
    },
    {
      id: "onboard_students",
      title: "Onboard Students",
      description: "Add candidates via Manual Form, CSV, Excel, or PDF",
      status: isStep2Done
        ? "completed"
        : currentStepId === "onboard_students"
        ? "current"
        : "available",
    },
    {
      id: "review_queue",
      title: "Review Certificate Queue",
      description: "Inspect candidate certificates submitted to your college queue",
      status: isStep3Done
        ? "completed"
        : currentStepId === "review_queue"
        ? "current"
        : "available",
    },
    {
      id: "endorse_reject",
      title: "Endorse or Reject",
      description: "Verify credentials on Ethereum or record rejection with reason",
      status: isStep4Done
        ? "completed"
        : currentStepId === "endorse_reject"
        ? "current"
        : "available",
    },
    {
      id: "reports_history",
      title: "Reports & Ledger History",
      description: hasReports
        ? "Access issued marksheets and cryptographic audit history"
        : "Not available yet - issue credentials or marksheets to unlock reports",
      status: hasReports ? "completed" : "unavailable",
    },
  ];

  let nextStepGuide = "Next: Institutional Accreditation - Awaiting Admin accreditation.";
  if (!isStep1Done) {
    nextStepGuide = "Next: Accreditation - Request system administrator to accredit your college.";
  } else if (!isStep2Done) {
    nextStepGuide = "Next: Onboard Students - Upload your candidate list via CSV, Excel, or PDF.";
  } else if (hasPending) {
    nextStepGuide = `Next: Review Queue - ${pendingCount} candidate certificate(s) awaiting your endorsement.`;
  } else if (!isStep4Done) {
    nextStepGuide = "Next: Endorse or Reject - Review and verify candidate submissions in your queue.";
  } else if (!hasReports) {
    nextStepGuide = "Next: Issue Marksheets - Generate official marksheets to unlock ledger reports.";
  } else {
    nextStepGuide = "All Systems Active: College dashboard is fully initialized and operational.";
  }

  return {
    role: "university",
    steps,
    currentStepId,
    nextStepGuide,
    hasError: false,
  };
}

// -----------------------------------------------------------------------------
// 3. COMPANY (RECRUITER) STEPPER ENGINE
// -----------------------------------------------------------------------------
export interface CompanyStepperParams {
  company: { id: number; active: boolean; companyCode?: string } | null;
  candidate?: { id: number; usn: string } | null;
  credentialsCount?: number;
  tamperAuditResult?: { isAuthentic?: boolean; hashMatched?: boolean } | null;
  verificationReceipt?: { verificationId?: number; txHash?: string } | null;
  hasOnChainVerificationRecord?: boolean;
}

export function getCompanyStepperState(params: CompanyStepperParams): StepperState {
  const isApproved = Boolean(params.company && params.company.active);
  const candidate = params.candidate;
  const hasCandidate = Boolean(candidate && candidate.id > 0);
  const credentialsCount = Number(params.credentialsCount) || 0;
  const hasCheckedCreds = hasCandidate && credentialsCount > 0;
  const hasAudited = Boolean(params.tamperAuditResult != null);
  const hasReceipt = Boolean(
    params.verificationReceipt != null || params.hasOnChainVerificationRecord === true
  );

  let currentStepId = "partner_approved";
  if (!isApproved) {
    currentStepId = "partner_approved";
  } else if (!hasCandidate) {
    currentStepId = "search_candidate";
  } else if (!hasCheckedCreds) {
    currentStepId = "quick_check";
  } else if (!hasAudited) {
    currentStepId = "tamper_audit";
  } else if (!hasReceipt) {
    currentStepId = "receipt_logged";
  } else {
    currentStepId = "receipt_logged";
  }

  const steps: StepperStep[] = [
    {
      id: "partner_approved",
      title: "Recruiter Authorization",
      description: "Corporate hiring partner verified and authorized",
      status: isApproved ? "completed" : "current",
    },
    {
      id: "search_candidate",
      title: "Search Candidate",
      description: "Query candidate records by standardized 10-character USN",
      status: hasCandidate
        ? "completed"
        : currentStepId === "search_candidate"
        ? "current"
        : "upcoming",
    },
    {
      id: "quick_check",
      title: "Credential Inspection",
      description: "Review academic credentials and status on ledger",
      status: hasCheckedCreds
        ? "completed"
        : currentStepId === "quick_check"
        ? "current"
        : "upcoming",
    },
    {
      id: "tamper_audit",
      title: "Tamper Audit",
      description: "Compare applicant file SHA-256 directly with on-chain hash",
      status: hasAudited
        ? "completed"
        : currentStepId === "tamper_audit"
        ? "current"
        : "upcoming",
    },
    {
      id: "receipt_logged",
      title: hasCandidate ? "Verification Receipt" : "Last Verification Recorded",
      description: hasCandidate
        ? (hasReceipt
            ? `On-chain verification record anchored for candidate ${candidate?.usn}`
            : `Record on-chain verification proof for candidate ${candidate?.usn}`)
        : "On-chain verification record anchored on Ethereum",
      status: hasReceipt
        ? "completed"
        : currentStepId === "receipt_logged"
        ? "current"
        : "upcoming",
    },
  ];

  let nextStepGuide = "Next: Recruiter Authorization - Sign in with an approved company account.";
  if (!isApproved) {
    nextStepGuide = "Next: Recruiter Authorization - Awaiting Admin partner approval.";
  } else if (!hasCandidate) {
    nextStepGuide = "Next: Search Candidate - Enter a candidate USN above to inspect credentials.";
  } else if (!hasCheckedCreds) {
    nextStepGuide = "Next: Credential Inspection - Review candidate's enrolled records.";
  } else if (!hasAudited) {
    nextStepGuide = "Next: Tamper Audit - Upload candidate document to run cryptographic hash audit.";
  } else if (!hasReceipt) {
    nextStepGuide = "Next: Verification Receipt - Record verified proof on Ethereum ledger.";
  } else {
    nextStepGuide = "Verified: On-Chain Receipt Recorded - Verification anchored on Ethereum.";
  }

  return {
    role: "company",
    steps,
    currentStepId,
    nextStepGuide,
    hasError: false,
  };
}
