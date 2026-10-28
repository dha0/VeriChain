"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  GraduationCap,
  FileUp,
  FileCheck,
  Upload,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Ban,
  PauseCircle,
  PlayCircle,
  Search,
  Hash,
  Lock,
  Key,
  Copy,
  Layers,
  Award,
  FileSpreadsheet,
  Download,
  Check,
  X,
  FileText,
  Clock,
  ShieldCheck,
  QrCode,
  Eye,
  Sparkles,
} from "lucide-react";
import { parseAndValidateUSN } from "@/lib/usnParser";
import {
  generateMarksheetPDF,
  downloadPDFFile,
  getDefaultSubjectsForCourse,
  SubjectMark,
} from "@/lib/pdfGenerator";
import {
  getContractReadOnly,
  getContractWithSigner,
  isMetaMaskInstalled,
} from "@/lib/ethereum";
import { computeSHA256, generateAccessKey, encryptDocument } from "@/lib/crypto";
import { uploadToIPFS, getIPFSUrl } from "@/lib/pinata";
import {
  Student,
  Credential,
  CredentialStatus,
  DocumentType,
  SUPPORTED_DOCUMENT_TYPES,
  Achievement,
  AchievementStatus,
  CSVStudentRow,
} from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { ProcessStepper } from "@/components/ProcessStepper";
import { getCollegeStepperState } from "@/lib/stepperEngine";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";

type ActiveTab = "single" | "generate" | "bulk" | "achievements" | "credentials" | "history";

export default function UniversityPage() {
  const { entityInfo, isAuthenticated } = useAuth();
  const currentUnivCode = entityInfo?.code || "";
  const currentUnivName = entityInfo?.name || "University Authority";

  const [activeTab, setActiveTab] = useState<ActiveTab>("single");
  const [universityId, setUniversityId] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // Phase 5 Student History States
  const [historyStudents, setHistoryStudents] = useState<any[]>([]);
  const [historySearchUsn, setHistorySearchUsn] = useState("");
  const [selectedHistoryStudent, setSelectedHistoryStudent] = useState<any | null>(null);
  const [historyVersions, setHistoryVersions] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Student Registration Form States
  const [usn, setUsn] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [course, setCourse] = useState("Computer Science & Engineering");
  const [gradYear, setGradYear] = useState(2026);
  const [percentage, setPercentage] = useState(85);
  const [isRegisteringStudent, setIsRegisteringStudent] = useState(false);

  // Credential Issuance Form States
  const [selectedStudentUsn, setSelectedStudentUsn] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<DocumentType>("Degree Certificate");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [computedHash, setComputedHash] = useState("");
  const [ipfsCid, setIpfsCid] = useState("");
  const [encryptBeforeUpload, setEncryptBeforeUpload] = useState(false);
  const [generatedSecretKey, setGeneratedSecretKey] = useState<string | null>(null);
  const [isIssuingCred, setIsIssuingCred] = useState(false);

  // Marksheet & QR Generator States
  const [genStudentId, setGenStudentId] = useState("");
  const [genUsn, setGenUsn] = useState("");
  const [genName, setGenName] = useState("");
  const [genCourse, setGenCourse] = useState("Computer Science & Engineering");
  const [genGradYear, setGenGradYear] = useState(2026);
  const [genPercentage, setGenPercentage] = useState(88);
  const [genDocType, setGenDocType] = useState("Academic Marksheet");
  const [genSemester, setGenSemester] = useState("7th Semester / Final Examination");
  const [genSubjects, setGenSubjects] = useState<SubjectMark[]>(() =>
    getDefaultSubjectsForCourse("Computer Science & Engineering", 88)
  );
  const [isGeneratingMarksheet, setIsGeneratingMarksheet] = useState(false);
  const [lastIssuedPDFResult, setLastIssuedPDFResult] = useState<{
    pdfBytes: Uint8Array;
    fileName: string;
    credentialId?: number;
    txHash?: string;
    cid?: string;
    docHash?: string;
    studentName: string;
    usn: string;
  } | null>(null);

  // Phase 4 Multi-Format Student Onboarding States
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<{
    totalRows: number;
    totalStudents: number;
    validCount: number;
    warningCount: number;
    errorCount: number;
    duplicateCount: number;
  } | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [isConfirmingBulk, setIsConfirmingBulk] = useState(false);
  const [confirmProgress, setConfirmProgress] = useState<{
    current: number;
    total: number;
    currentUsn: string;
  } | null>(null);
  const [confirmResults, setConfirmResults] = useState<{
    rowId?: string;
    usn: string;
    success: boolean;
    studentId?: number;
    txHash?: string;
    error?: string;
    version?: number;
  }[]>([]);

  // Student Achievements Review State
  const [pendingAchievements, setPendingAchievements] = useState<Achievement[]>([]);
  const [isReviewingAchievement, setIsReviewingAchievement] = useState(false);
  const [reviewRemarks, setReviewRemarks] = useState<{ [id: number]: string }>({});

  // Credentials and Students Lists
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    loadUniversityData();
    loadAchievements();
  }, [currentUnivCode]);

  async function loadUniversityData() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const contract = getContractReadOnly();

      // Resolve University ID from registered code
      let uId = 1;
      try {
        const uIdBig = await contract.universityCodeToId(currentUnivCode);
        uId = Number(uIdBig) || 1;
      } catch (e) {}
      setUniversityId(uId);

      const counters = await contract.getCounters();
      const totalCred = Number(counters.totalCredentials);
      const totalS = Number(counters.totalStudents);

      // Fetch students
      const sList: Student[] = [];
      for (let i = 1; i <= totalS; i++) {
        try {
          const s = await contract.getStudent(i);
          if (Number(s.universityId) === uId || uId === 1) {
            sList.push({
              id: Number(s.id),
              usn: s.usn,
              name: s.name,
              course: s.course,
              graduationYear: Number(s.graduationYear),
              percentage: Number(s.percentage),
              universityId: Number(s.universityId),
              exists: s.exists,
            });
          }
        } catch (e) {}
      }
      setStudents(sList);

      // Fetch credentials issued by this university
      const myCreds: Credential[] = [];
      for (let i = 1; i <= totalCred; i++) {
        try {
          const cred = await contract.getCredential(i);
          if (Number(cred.universityId) === uId || uId === 1) {
            myCreds.push({
              credentialId: Number(cred.credentialId),
              studentId: Number(cred.studentId),
              universityId: Number(cred.universityId),
              documentType: cred.documentType || "Academic Credential",
              documentHash: cred.documentHash,
              ipfsCID: cred.ipfsCID,
              issuedAt: Number(cred.issuedAt),
              version: Number(cred.version),
              status: Number(cred.status),
              exists: cred.exists,
            });
          }
        } catch (e) {}
      }
      setCredentials(myCreds);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAchievements() {
    try {
      const res = await fetch("/api/achievements");
      const data = await res.json();
      if (data.achievements) {
        setPendingAchievements(data.achievements);
      }
    } catch (err) {
      console.error("Failed to load achievements", err);
    }
  }

  // Handle file selection & compute SHA-256 client-side
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      try {
        const hash = await computeSHA256(file);
        setComputedHash(hash);
      } catch (err: any) {
        alert("Failed to compute SHA-256 hash: " + err.message);
      }
    }
  };

  // Register Student via Decentralized Relayer
  const handleRegisterStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegisteringStudent(true);
    setStatusMessage(null);
    try {
      setStatusMessage({ text: "Submitting student registration to Ethereum ledger...", type: "info" });
      const res = await fetch("/api/blockchain/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "registerStudent",
          universityCode: currentUnivCode,
          data: { usn, name: studentName, email: studentEmail, course, gradYear, percentage },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register student");

      setStatusMessage({
        text: `Student ${studentName} (${usn}) anchored on Ethereum! Tx: ${data.txHash ? data.txHash.slice(0, 10) + "..." : "Recorded"}`,
        type: "success",
      });
      setUsn("");
      setStudentName("");
      setStudentEmail("");
      await loadUniversityData();
    } catch (err: any) {
      setStatusMessage({
        text: err.message || "Failed to register student",
        type: "error",
      });
    } finally {
      setIsRegisteringStudent(false);
    }
  };

  // Issue Credential (Upload to Pinata -> Relayed on Ethereum)
  const handleIssueCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !computedHash) {
      alert("Please select a document file first.");
      return;
    }

    setIsIssuingCred(true);
    setStatusMessage(null);
    try {
      let uploadFile = selectedFile;

      if (encryptBeforeUpload) {
        setStatusMessage({
          text: "Encrypting document client-side with AES-256-GCM...",
          type: "info",
        });
        const accessKey = generateAccessKey();
        const arrayBuffer = await selectedFile.arrayBuffer();
        const { encryptedBuffer, ivHex } = await encryptDocument(arrayBuffer, accessKey);
        uploadFile = new File([encryptedBuffer], `encrypted_${selectedFile.name}.bin`, {
          type: "application/octet-stream",
        });
        setGeneratedSecretKey(`${accessKey}:${ivHex}`);
      }

      setStatusMessage({
        text: "Pinning document payload to decentralized Pinata IPFS...",
        type: "info",
      });
      const { cid } = await uploadToIPFS(uploadFile);
      setIpfsCid(cid);

      setStatusMessage({
        text: `Anchoring ${selectedDocType} (SHA-256: ${computedHash.slice(0, 10)}...) on Ethereum...`,
        type: "info",
      });

      const cleanUsn = selectedStudentUsn.trim().toUpperCase();
      let targetStudentId = Number(selectedStudentId);
      if (!targetStudentId || targetStudentId <= 0) {
        const found = students.find((s) => s.usn.toUpperCase() === cleanUsn);
        if (found) targetStudentId = found.id;
      }

      const res = await fetch("/api/blockchain/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issueCredential",
          universityCode: currentUnivCode,
          data: {
            usn: cleanUsn || undefined,
            studentUsn: cleanUsn || undefined,
            studentId: targetStudentId || undefined,
            documentType: selectedDocType,
            documentHash: computedHash,
            ipfsCID: cid,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to issue credential on blockchain");

      setStatusMessage({
        text: `${selectedDocType} issued successfully for ${cleanUsn || `Student #${targetStudentId}`}! On-Chain Hash: ${computedHash.slice(0, 10)}... | IPFS: ${cid}`,
        type: "success",
      });

      setSelectedFile(null);
      setComputedHash("");
      setSelectedStudentId("");
      setSelectedStudentUsn("");
      await loadUniversityData();
    } catch (err: any) {
      setStatusMessage({
        text: err.message || "Failed to issue credential",
        type: "error",
      });
    } finally {
      setIsIssuingCred(false);
    }
  };

  // CSV / Excel Template Downloader
  // 1. Template Downloader (Blank with official headers only, no demo data)
  const downloadTemplate = (format: "csv" | "xlsx") => {
    window.location.href = `/api/students/template?format=${format}`;
  };

  // 2. Client-Side File Validation & Server Preview Trigger
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setStatusMessage({
          text: `File Size Error: File (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed 5 MB limit.`,
          type: "error",
        });
        return;
      }

      setUploadFile(file);
      setIsPreviewLoading(true);
      setStatusMessage({
        text: `Parsing and validating ${file.name} on server...`,
        type: "info",
      });

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/students/upload/preview", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to parse file preview.");

        setPreviewSummary(data.summary);
        setPreviewRows(data.rows || []);
        setConfirmResults([]);
        setStatusMessage({
          text: `Parsed ${data.summary.totalStudents} student records from ${file.name}! Review and edit values below before confirming.`,
          type: data.summary.errorCount > 0 ? "error" : data.summary.warningCount > 0 ? "info" : "success",
        });
      } catch (err: any) {
        setStatusMessage({
          text: err.message || "Failed to parse uploaded file.",
          type: "error",
        });
      } finally {
        setIsPreviewLoading(false);
      }
    }
  };

  // 3. In-table cell editing so college can correct typos directly in the preview
  const handleCellEdit = (rowId: string, field: string, value: any) => {
    setPreviewRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const updated = { ...r, [field]: value };
        if (field === "usn") {
          const cleanUsn = String(value || "").trim().toUpperCase();
          const parsed = parseAndValidateUSN(cleanUsn);
          const errors = [...r.errorMessages].filter(
            (errText: string) => !errText.includes("USN") && !errText.includes("Cross-College")
          );
          if (!parsed.valid) {
            errors.push(`Invalid USN: ${parsed.error}`);
          } else if (parsed.collegeCode !== currentUnivCode.toUpperCase()) {
            errors.push(`Cross-College: USN belongs to '${parsed.collegeCode}', not '${currentUnivCode}'.`);
          }
          updated.errorMessages = errors;
          updated.status = errors.length > 0 ? "error" : updated.isAlreadyRegistered ? "warning" : "valid";
        }
        return updated;
      })
    );
  };

  // 4. Confirm & Register rows one-by-one with progress bar & error isolation
  const handleConfirmBatch = async (onlyFailed = false) => {
    const rowsToProcess = onlyFailed
      ? previewRows.filter((r) => {
          const res = confirmResults.find((cr) => cr.usn === r.usn);
          return res && !res.success && r.status !== "error";
        })
      : previewRows.filter((r) => r.status !== "error");

    if (rowsToProcess.length === 0) {
      setStatusMessage({ text: "No valid rows ready for registration.", type: "error" });
      return;
    }

    setIsConfirmingBulk(true);
    const results: any[] = onlyFailed ? [...confirmResults] : [];

    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      setConfirmProgress({
        current: i + 1,
        total: rowsToProcess.length,
        currentUsn: row.usn,
      });

      try {
        const res = await fetch("/api/students/upload/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: [row] }),
        });
        const data = await res.json();
        const rowResult = data.results?.[0] || {
          usn: row.usn,
          success: false,
          error: data.error || "Confirmation failed",
        };

        if (onlyFailed) {
          const idx = results.findIndex((cr) => cr.usn === row.usn);
          if (idx !== -1) results[idx] = rowResult;
          else results.push(rowResult);
        } else {
          results.push(rowResult);
        }
      } catch (err: any) {
        const failedEntry = {
          usn: row.usn,
          success: false,
          error: err.message || "Network error",
        };
        if (onlyFailed) {
          const idx = results.findIndex((cr) => cr.usn === row.usn);
          if (idx !== -1) results[idx] = failedEntry;
          else results.push(failedEntry);
        } else {
          results.push(failedEntry);
        }
      }
    }

    setConfirmResults([...results]);
    setIsConfirmingBulk(false);
    setConfirmProgress(null);

    const successCount = results.filter((r) => r.success).length;
    setStatusMessage({
      text: `Batch registration complete: ${successCount} of ${results.length} students confirmed!`,
      type: successCount === results.length ? "success" : "info",
    });

    await loadUniversityData();
  };

  // Auto-fill Syllabus & Course subjects for the Marksheet Generator
  const handleAutoFillSyllabus = () => {
    const list = getDefaultSubjectsForCourse(genCourse, genPercentage);
    setGenSubjects(list);
  };

  // Preview & Download Marksheet PDF without minting
  const handlePreviewAndDownloadPDF = async () => {
    if (!genUsn.trim() || !genName.trim()) {
      alert("Please enter candidate USN and Name first.");
      return;
    }
    setIsGeneratingMarksheet(true);
    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://blockchain-document-verification-one.vercel.app";
      const verifyUrl = `${origin}/verify?usn=${encodeURIComponent(genUsn.trim().toUpperCase())}`;

      const pdfBytes = await generateMarksheetPDF({
        universityName: currentUnivName,
        universityCode: currentUnivCode,
        studentName: genName.trim(),
        usn: genUsn.trim().toUpperCase(),
        course: genCourse,
        graduationYear: genGradYear,
        percentage: genPercentage,
        semester: genSemester,
        documentType: genDocType,
        academicDistinction:
          genPercentage >= 75 ? "FIRST CLASS WITH DISTINCTION" : "FIRST CLASS",
        verificationUrl: verifyUrl,
        subjects: genSubjects,
      });

      downloadPDFFile(pdfBytes, `${genUsn.trim().toUpperCase()}_marksheet_preview.pdf`);
    } catch (err: any) {
      alert("Failed to generate PDF preview: " + err.message);
    } finally {
      setIsGeneratingMarksheet(false);
    }
  };

  const loadStudentHistoryList = async () => {
    try {
      setIsLoadingHistory(true);
      const res = await fetch("/api/students/history");
      const data = await res.json();
      if (data.students) {
        setHistoryStudents(data.students);
      }
    } catch (e) {
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadStudentVersions = async (usnToLoad: string) => {
    try {
      setIsLoadingHistory(true);
      const res = await fetch(`/api/students/history?usn=${encodeURIComponent(usnToLoad)}`);
      const data = await res.json();
      if (data.student) {
        setSelectedHistoryStudent(data.student);
      }
      if (data.versions) {
        setHistoryVersions(data.versions);
      }
    } catch (e) {
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Generate High-Fidelity PDF with QR & Anchor directly to Ethereum & IPFS
  const handleGenerateAndAnchorMarksheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genUsn.trim() || !genName.trim()) {
      alert("Please enter candidate USN and Name.");
      return;
    }

    setIsGeneratingMarksheet(true);
    setStatusMessage({
      text: `Generating official ${genDocType} PDF with embedded blockchain verification QR code...`,
      type: "info",
    });

    try {
      // 1. Resolve or Register Student
      let studentId = Number(genStudentId);
      if (!studentId || isNaN(studentId)) {
        setStatusMessage({
          text: `Ensuring student ${genName} (${genUsn}) is enrolled on Ethereum...`,
          type: "info",
        });

        const regRes = await fetch("/api/blockchain/relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "registerStudent",
            universityCode: currentUnivCode,
            data: {
              usn: genUsn.trim().toUpperCase(),
              name: genName.trim(),
              course: genCourse,
              gradYear: genGradYear,
              percentage: genPercentage,
            },
          }),
        });

        const regData = await regRes.json();
        if (!regRes.ok || !regData.studentId) {
          throw new Error(regData.error || "Failed to register student on blockchain");
        }
        studentId = Number(regData.studentId);
        setGenStudentId(String(studentId));
      }

      // 2. Build live verification URL
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://blockchain-document-verification-one.vercel.app";
      const verifyUrl = `${origin}/verify?usn=${encodeURIComponent(genUsn.trim().toUpperCase())}`;

      // 3. Generate high-fidelity PDF with embedded verification QR code
      setStatusMessage({
        text: `Compiling academic transcript and generating embedded QR verification seal...`,
        type: "info",
      });

      const pdfBytes = await generateMarksheetPDF({
        universityName: currentUnivName,
        universityCode: currentUnivCode,
        studentName: genName.trim(),
        usn: genUsn.trim().toUpperCase(),
        course: genCourse,
        graduationYear: genGradYear,
        percentage: genPercentage,
        semester: genSemester,
        documentType: genDocType,
        academicDistinction:
          genPercentage >= 75 ? "FIRST CLASS WITH DISTINCTION" : "FIRST CLASS",
        verificationUrl: verifyUrl,
        subjects: genSubjects,
      });

      // 4. Create File and Compute Cryptographic SHA-256 Fingerprint
      const fileName = `${genUsn.trim().toUpperCase()}_official_${genDocType.replace(/\s+/g, "_")}.pdf`;
      const pdfFile = new File([pdfBytes as any], fileName, {
        type: "application/pdf",
      });
      const docHash = await computeSHA256(pdfFile);

      // 5. Pin real PDF document payload to Pinata IPFS
      setStatusMessage({
        text: `Pinning official PDF document (${(pdfBytes.length / 1024).toFixed(1)} KB) to decentralized IPFS...`,
        type: "info",
      });
      const { cid } = await uploadToIPFS(pdfFile);

      // 6. Anchor to Ethereum smart contract via relayer
      setStatusMessage({
        text: `Anchoring SHA-256 fingerprint (${docHash.slice(0, 10)}...) on Ethereum Sepolia...`,
        type: "info",
      });

      const issueRes = await fetch("/api/blockchain/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issueCredential",
          universityCode: currentUnivCode,
          data: {
            studentId,
            documentType: genDocType,
            documentHash: docHash,
            ipfsCID: cid,
          },
        }),
      });

      const issueData = await issueRes.json();
      if (!issueRes.ok) {
        throw new Error(issueData.error || "Failed to anchor credential proof on ledger");
      }

      const credId = issueData.credentialId || undefined;

      setLastIssuedPDFResult({
        pdfBytes,
        fileName,
        credentialId: credId,
        txHash: issueData.txHash,
        cid,
        docHash,
        studentName: genName.trim(),
        usn: genUsn.trim().toUpperCase(),
      });

      setStatusMessage({
        text: `Success! ${genDocType} generated with embedded QR and permanently anchored to Ethereum! Credential #${credId || "Mined"} | IPFS: ${cid}`,
        type: "success",
      });

      await loadUniversityData();
    } catch (err: any) {
      setStatusMessage({
        text: err.message || "Failed to generate and anchor marksheet",
        type: "error",
      });
    } finally {
      setIsGeneratingMarksheet(false);
    }
  };



  // Review & Endorse Student Achievement
  const handleReviewAchievement = async (
    achievementId: number,
    newStatus: AchievementStatus,
    statusText: string
  ) => {
    setIsReviewingAchievement(true);
    setStatusMessage(null);
    try {
      const remarks = reviewRemarks[achievementId] || (newStatus === AchievementStatus.Verified ? "Endorsed and validated as legal and authentic skill by University." : "Verification rejected.");

      // 1. Relay to Ethereum smart contract
      await fetch("/api/blockchain/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reviewAchievement",
          universityCode: currentUnivCode,
          data: {
            achievementId,
            status: newStatus,
            remarks,
          },
        }),
      });

      // 2. Update API store
      await fetch("/api/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          achievementId,
          status: newStatus,
          remarks,
          universityId,
        }),
      });

      setStatusMessage({
        text: `Achievement #${achievementId} officially marked as "${statusText}" on the Ethereum blockchain ledger!`,
        type: "success",
      });

      await loadAchievements();
    } catch (err: any) {
      setStatusMessage({
        text: err.message || "Failed to review achievement",
        type: "error",
      });
    } finally {
      setIsReviewingAchievement(false);
    }
  };

  // 45-second visibility polling (pauses when tab hidden, resumes on visible, stops on logout)
  useVisibilityPolling(
    () => {
      loadUniversityData();
      loadAchievements();
    },
    45000,
    Boolean(isAuthenticated && currentUnivCode)
  );

  // Compute Process Stepper State
  const pendingAchievementsCount = pendingAchievements.filter(
    (a) => a.status === AchievementStatus.PendingReview
  ).length;
  const verifiedAchievementsCount = pendingAchievements.filter(
    (a) => a.status === AchievementStatus.Verified
  ).length;

  const stepperState = getCollegeStepperState({
    university: { id: universityId, active: true, universityCode: currentUnivCode },
    totalStudents: students.length,
    pendingCount: pendingAchievementsCount,
    verifiedCount: verifiedAchievementsCount + credentials.length,
    totalCredentials: credentials.length,
  });

  return (
    <RoleGuard allowedRoles={["university", "admin"]} portalName="University Authority Portal">
      <div className="space-y-8 rounded-3xl p-2 sm:p-4 bg-gradient-to-b from-sky-950/20 via-slate-950/60 to-slate-950">
        {/* Workflow Process Stepper */}
        <ProcessStepper
          state={stepperState}
          onAction={() => {
            if (stepperState.currentStepId === "onboard_students") setActiveTab("bulk");
            else if (stepperState.currentStepId === "review_queue") setActiveTab("achievements");
            else if (stepperState.currentStepId === "endorse_reject") setActiveTab("achievements");
            else if (stepperState.currentStepId === "reports_history") {
              setActiveTab("history");
              if (historyStudents.length === 0) loadStudentHistoryList();
            }
          }}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-sky-900/30 pb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold uppercase tracking-wider">
              <Award className="w-3.5 h-3.5" />
              Accredited Credentialing Authority
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              {currentUnivName}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Institutional Code: <span className="font-mono text-sky-300 font-bold">{currentUnivCode}</span> | Immutable Ethereum Smart Contract Governance
            </p>
          </div>

          <button
            onClick={() => {
              loadUniversityData();
              loadAchievements();
            }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-sky-800/40 text-xs text-sky-300 hover:text-white transition-all shadow-md hover:border-sky-500"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Sync Ledger
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("single")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "single"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Single Student Issuance</span>
          </button>

          <button
            onClick={() => setActiveTab("generate")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "generate"
                ? "bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <QrCode className="w-4 h-4 text-sky-300" />
            <span>Official Marksheet & QR Generator</span>
          </button>

          <button
            onClick={() => setActiveTab("bulk")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "bulk"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Bulk CSV / Excel Upload</span>
          </button>

          <button
            onClick={() => setActiveTab("achievements")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all relative ${
              activeTab === "achievements"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Achievement Legal Review</span>
            {pendingAchievements.filter((a) => a.status === AchievementStatus.PendingReview).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("credentials")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "credentials"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>Issued Records ({credentials.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("history");
              if (historyStudents.length === 0) loadStudentHistoryList();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "history"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Student History & Reports</span>
          </button>
        </div>

        {/* Status Messages */}
        {statusMessage && (
          <div
            className={`p-4 rounded-2xl text-xs flex items-center gap-2 ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                : statusMessage.type === "error"
                ? "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                : "bg-sky-500/10 border border-sky-500/30 text-sky-300"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* TAB 1: Single Student Registration & Issuance */}
        {activeTab === "single" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form 1: Register Single Student */}
            <div className="glass-panel rounded-3xl p-6 space-y-4 border border-sky-500/20 shadow-xl bg-slate-900/60">
              <div className="flex items-center gap-2.5 text-white font-bold text-base border-b border-sky-900/30 pb-3">
                <GraduationCap className="w-5 h-5 text-sky-400" />
                <span>1. Onboard Single Student Identity</span>
              </div>
              <form onSubmit={handleRegisterStudent} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Student USN / Roll No
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter Student USN"
                      value={usn}
                      onChange={(e) => setUsn(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500 uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Full Student Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter Student Full Name"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Student Official Email (Used for secure OTP authentication)
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="student@university.edu"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Academic Degree / Course Program
                  </label>
                  <input
                    type="text"
                    required
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Graduation Year
                    </label>
                    <input
                      type="number"
                      required
                      min={1990}
                      max={2100}
                      value={gradYear}
                      onChange={(e) => setGradYear(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Percentage / Score (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      value={percentage}
                      onChange={(e) => setPercentage(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isRegisteringStudent}
                  className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-sky-600/25 mt-2"
                >
                  {isRegisteringStudent ? "Anchoring on Ethereum Ledger..." : "Register Student Identity"}
                </button>
              </form>
            </div>

            {/* Form 2: Multi-Document Issuance */}
            <div className="glass-panel rounded-3xl p-6 space-y-4 border border-sky-500/20 shadow-xl bg-slate-900/60">
              <div className="flex items-center gap-2.5 text-white font-bold text-base border-b border-sky-900/30 pb-3">
                <FileUp className="w-5 h-5 text-sky-400" />
                <span>2. Issue Single Academic Document</span>
              </div>
              <form onSubmit={handleIssueCredential} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Candidate USN (University Seat Number) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 1CG23CS023"
                      value={selectedStudentUsn}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setSelectedStudentUsn(val);
                        const found = students.find((s) => s.usn.toUpperCase() === val.trim());
                        if (found) setSelectedStudentId(String(found.id));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500 font-mono uppercase tracking-wider"
                    />
                    {students.length > 0 && (
                      <select
                        value={selectedStudentUsn}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedStudentUsn(val);
                          const found = students.find((s) => s.usn.toUpperCase() === val.toUpperCase());
                          if (found) setSelectedStudentId(String(found.id));
                        }}
                        className="w-full mt-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-[11px] text-sky-300 font-mono focus:border-sky-500"
                      >
                        <option value="">-- Or Select from Enrolled Candidates --</option>
                        {students.map((s) => (
                          <option key={s.usn} value={s.usn}>
                            {s.usn} - {s.name} ({s.course})
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedStudentUsn && (() => {
                      const found = students.find((s) => s.usn.toUpperCase() === selectedStudentUsn.trim().toUpperCase());
                      if (found) {
                        return (
                          <div className="mt-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 flex items-center justify-between">
                            <span className="font-semibold">{found.name}</span>
                            <span className="font-mono text-[10px] text-emerald-300">Enrolled ✓</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Document Category
                    </label>
                    <select
                      value={selectedDocType}
                      onChange={(e) => setSelectedDocType(e.target.value as DocumentType)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500"
                    >
                      {SUPPORTED_DOCUMENT_TYPES.map((dt) => (
                        <option key={dt} value={dt}>
                          {dt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Upload Official File (PDF / PNG)
                  </label>
                  <div className="border-2 border-dashed border-slate-700 hover:border-sky-500/50 rounded-2xl p-3 text-center cursor-pointer transition-colors bg-slate-950/60">
                    <input
                      type="file"
                      accept="application/pdf,image/*,.txt"
                      required
                      onChange={handleFileChange}
                      className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-500 cursor-pointer"
                    />
                  </div>
                </div>

                {computedHash && (
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                      <Hash className="w-3 h-3 text-sky-400" />
                      Client-Side SHA-256 Fingerprint:
                    </div>
                    <div className="text-[11px] font-mono text-sky-300 break-all bg-slate-900/80 p-1.5 rounded-lg">
                      {computedHash}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isIssuingCred || !computedHash}
                  className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-sky-600/25 mt-1"
                >
                  {isIssuingCred ? "Uploading to IPFS & Minting Proof..." : "Pin to IPFS & Anchor Credential Proof"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: Official Marksheet & Dynamic QR Generator */}
        {activeTab === "generate" && (
          <div className="space-y-6">
            {/* Success Card from recent issuance */}
            {lastIssuedPDFResult && (
              <div className="glass-panel rounded-3xl p-6 border-2 border-emerald-500/40 bg-emerald-950/20 shadow-xl shadow-emerald-950/30 space-y-4 animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-emerald-500/20 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white flex items-center gap-2">
                        <span>Official Marksheet Successfully Anchored on Ethereum!</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-mono">
                          #{lastIssuedPDFResult.credentialId ? `Cred #${lastIssuedPDFResult.credentialId}` : "Mined"}
                        </span>
                      </h4>
                      <p className="text-xs text-emerald-200/80 mt-0.5">
                        Issued for <strong className="text-white">{lastIssuedPDFResult.studentName}</strong> ({lastIssuedPDFResult.usn}) with embedded on-chain verification QR code.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        downloadPDFFile(lastIssuedPDFResult.pdfBytes, lastIssuedPDFResult.fileName)
                      }
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/30"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Issued Official PDF</span>
                    </button>

                    <a
                      href={`/verify?usn=${encodeURIComponent(lastIssuedPDFResult.usn)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-300 hover:text-white border border-sky-600/40 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Verify on Blockchain</span>
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/20 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold">
                      Cryptographic SHA-256 Hash
                    </span>
                    <p className="text-emerald-300 truncate font-mono text-[11px]" title={lastIssuedPDFResult.docHash}>
                      {lastIssuedPDFResult.docHash}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/20 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold">
                      Decentralized IPFS CID
                    </span>
                    <p className="text-sky-300 truncate font-mono text-[11px]" title={lastIssuedPDFResult.cid}>
                      {lastIssuedPDFResult.cid}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/20 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold">
                      Transaction Hash
                    </span>
                    <p className="text-purple-300 truncate font-mono text-[11px]" title={lastIssuedPDFResult.txHash}>
                      {lastIssuedPDFResult.txHash || "Recorded on Sepolia"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Main Generator Form */}
            <div className="glass-panel rounded-3xl p-6 space-y-6 border border-sky-500/20 bg-slate-900/60 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-sky-900/30 pb-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-sky-400" />
                    <span>Official Marksheet & QR Verification Seal Generator</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Compile high-fidelity academic marksheets & transcripts with auto-calculated CGPAs, client-side cryptographic SHA-256 fingerprints, and embedded dynamic QR codes pointing to live blockchain verification dossiers.
                  </p>
                </div>

                {students.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-semibold text-[11px]">Enrolled Student:</span>
                    <select
                      value={genStudentId}
                      onChange={(e) => {
                        const sId = e.target.value;
                        setGenStudentId(sId);
                        const found = students.find((s) => String(s.id) === sId);
                        if (found) {
                          setGenUsn(found.usn);
                          setGenName(found.name);
                          setGenCourse(found.course);
                          setGenGradYear(found.graduationYear);
                          setGenPercentage(found.percentage);
                          setGenSubjects(getDefaultSubjectsForCourse(found.course, found.percentage));
                        }
                      }}
                      className="bg-slate-950 border border-sky-700/60 rounded-xl px-3 py-1.5 text-xs text-sky-200 focus:border-sky-500 font-mono"
                    >
                      <option value="">-- Autofill from Student Registry --</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          #{s.id} {s.usn} - {s.name} ({s.percentage}%)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <form onSubmit={handleGenerateAndAnchorMarksheet} className="space-y-6">
                {/* Candidate Particulars Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      University Seat No (USN) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter student USN (e.g. 1CG23CS023)"
                      value={genUsn}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setGenUsn(val);
                        const found = students.find((s) => s.usn.toUpperCase() === val.trim());
                        if (found) {
                          setGenStudentId(String(found.id));
                          setGenName(found.name);
                          setGenCourse(found.course);
                          setGenGradYear(found.graduationYear);
                          setGenPercentage(found.percentage);
                          setGenSubjects(getDefaultSubjectsForCourse(found.course, found.percentage));
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500 uppercase font-mono tracking-wider"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Candidate Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter candidate full name"
                      value={genName}
                      onChange={(e) => setGenName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Degree & Branch *
                    </label>
                    <input
                      type="text"
                      required
                      value={genCourse}
                      onChange={(e) => setGenCourse(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Graduation Batch Year
                    </label>
                    <input
                      type="number"
                      required
                      min={1990}
                      max={2100}
                      value={genGradYear}
                      onChange={(e) => setGenGradYear(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Aggregate Percentage (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={40}
                      max={100}
                      value={genPercentage}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setGenPercentage(val);
                        setGenSubjects(getDefaultSubjectsForCourse(genCourse, val));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-emerald-400 font-bold focus:border-sky-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Calculated CGPA (Scale of 10)
                    </label>
                    <div className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 font-bold">
                      {(genPercentage / 9.5).toFixed(2)} / 10.00
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Document Title Type
                    </label>
                    <select
                      value={genDocType}
                      onChange={(e) => setGenDocType(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500"
                    >
                      <option value="Academic Marksheet">Academic Marksheet</option>
                      <option value="Degree Certificate">Degree Certificate</option>
                      <option value="Consolidated Transcript">Consolidated Transcript</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Academic Semester / Exam
                    </label>
                    <input
                      type="text"
                      value={genSemester}
                      onChange={(e) => setGenSemester(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Course Subjects Table */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-sky-400" />
                      Course Subjects & Marks Breakdown ({genSubjects.length} Courses)
                    </span>

                    <button
                      type="button"
                      onClick={handleAutoFillSyllabus}
                      className="px-3 py-1.5 rounded-lg bg-sky-900/40 hover:bg-sky-800/60 text-sky-300 border border-sky-600/40 text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Auto-Calibrate Subject Marks for {genPercentage}%</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-800 rounded-2xl max-h-64">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Subject Code</th>
                          <th className="px-3 py-2">Course / Subject Title</th>
                          <th className="px-3 py-2">Credits</th>
                          <th className="px-3 py-2">Max</th>
                          <th className="px-3 py-2">Marks Scored</th>
                          <th className="px-3 py-2">Grade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
                        {genSubjects.map((sub, idx) => (
                          <tr key={idx} className="hover:bg-slate-950/40">
                            <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={sub.code}
                                onChange={(e) => {
                                  const updated = [...genSubjects];
                                  updated[idx].code = e.target.value;
                                  setGenSubjects(updated);
                                }}
                                className="w-20 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-sky-300 uppercase font-mono"
                              />
                            </td>
                            <td className="px-3 py-2 font-sans font-medium text-white">
                              <input
                                type="text"
                                value={sub.title}
                                onChange={(e) => {
                                  const updated = [...genSubjects];
                                  updated[idx].title = e.target.value;
                                  setGenSubjects(updated);
                                }}
                                className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-slate-200"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={sub.credits}
                                onChange={(e) => {
                                  const updated = [...genSubjects];
                                  updated[idx].credits = Number(e.target.value);
                                  setGenSubjects(updated);
                                }}
                                className="w-12 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-slate-300 text-center"
                              />
                            </td>
                            <td className="px-3 py-2 text-slate-500">100</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={sub.marksObtained}
                                onChange={(e) => {
                                  const updated = [...genSubjects];
                                  const marks = Number(e.target.value);
                                  updated[idx].marksObtained = marks;
                                  if (marks >= 90) updated[idx].grade = "O";
                                  else if (marks >= 80) updated[idx].grade = "A+";
                                  else if (marks >= 70) updated[idx].grade = "A";
                                  else if (marks >= 60) updated[idx].grade = "B+";
                                  else updated[idx].grade = "B";
                                  setGenSubjects(updated);
                                }}
                                className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-emerald-400 font-bold text-center"
                              />
                            </td>
                            <td className="px-3 py-2 font-bold text-emerald-400">{sub.grade}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Actions: Preview & Live On-Chain Issuance */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isGeneratingMarksheet}
                    onClick={handlePreviewAndDownloadPDF}
                    className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors"
                  >
                    <Eye className="w-4 h-4 text-sky-400" />
                    <span>👁️ Preview & Download Marksheet PDF</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isGeneratingMarksheet}
                    className="w-full sm:flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>
                      {isGeneratingMarksheet
                        ? "Generating PDF with QR, Pinning to IPFS & Anchoring on Ethereum..."
                        : "🚀 Generate Official PDF with Embedded QR & Anchor on Ethereum (1-Click)"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: Multi-Format Student Onboarding (CSV, XLSX, PDF) & Marks Engine */}
        {activeTab === "bulk" && (
          <div className="glass-panel rounded-3xl p-6 space-y-6 border border-sky-500/20 bg-slate-900/60 shadow-xl">
            {/* Header & Template Download Options */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-sky-900/30 pb-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-sky-400" />
                  <span>Multi-Format Student Onboarding & Marks Verification</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Upload CSV, Excel (.xlsx), or text-layer PDF marksheets. Automatically extracts candidate records, validates college codes, computes totals & grades, and registers students through the Ethereum relayer.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => downloadTemplate("csv")}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
                  title="Download blank CSV with official headers"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Blank CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => downloadTemplate("xlsx")}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
                  title="Download blank Excel XLSX with official headers"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Blank Excel</span>
                </button>
              </div>
            </div>

            {/* File Picker (CSV, XLSX, PDF) */}
            <div className="border-2 border-dashed border-sky-700/50 hover:border-sky-500 rounded-3xl p-8 text-center bg-slate-950/60 transition-colors">
              <input
                type="file"
                accept=".csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="multiFormatInput"
                disabled={isPreviewLoading || isConfirmingBulk}
              />
              <label htmlFor="multiFormatInput" className="cursor-pointer space-y-3 block">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {uploadFile ? uploadFile.name : "Select or Drop Student File (CSV, Excel .xlsx, or PDF)"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Max file size: <strong>5 MB</strong> · Max rows: <strong>500</strong> · Scanned images must have selectable text layer
                  </p>
                </div>
              </label>
            </div>

            {/* Preview Summary Badges */}
            {previewSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Students</span>
                  <p className="text-lg font-bold text-white font-mono mt-0.5">{previewSummary.totalStudents}</p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/80 border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 uppercase font-semibold">Valid Rows</span>
                  <p className="text-lg font-bold text-emerald-300 font-mono mt-0.5">{previewSummary.validCount}</p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/80 border border-amber-500/30">
                  <span className="text-[10px] text-amber-400 uppercase font-semibold">Existing (v2 Update)</span>
                  <p className="text-lg font-bold text-amber-300 font-mono mt-0.5">{previewSummary.warningCount}</p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/80 border border-rose-500/30">
                  <span className="text-[10px] text-rose-400 uppercase font-semibold">Errors (Rejected)</span>
                  <p className="text-lg font-bold text-rose-300 font-mono mt-0.5">{previewSummary.errorCount}</p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/80 border border-purple-500/30 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-purple-400 uppercase font-semibold">Duplicate USNs</span>
                  <p className="text-lg font-bold text-purple-300 font-mono mt-0.5">{previewSummary.duplicateCount}</p>
                </div>
              </div>
            )}

            {/* Editable Preview Table */}
            {previewRows.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-200">
                    Candidate Pre-Registration Verification Table ({previewRows.length} Students)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    💡 Cells with editable values can be corrected inline prior to ledger confirmation.
                  </span>
                </div>

                <div className="overflow-x-auto max-h-96 border border-slate-800 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800 sticky top-0">
                      <tr>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">USN</th>
                        <th className="px-3 py-2.5">Candidate Name</th>
                        <th className="px-3 py-2.5">Official Email</th>
                        <th className="px-3 py-2.5">Course</th>
                        <th className="px-3 py-2.5">Grad Year</th>
                        <th className="px-3 py-2.5">Score</th>
                        <th className="px-3 py-2.5">Validation Findings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
                      {previewRows.map((r) => (
                        <tr
                          key={r.rowId}
                          className={`hover:bg-slate-900/40 transition-colors ${
                            r.status === "error"
                              ? "bg-rose-950/20"
                              : r.status === "warning"
                              ? "bg-amber-950/20"
                              : ""
                          }`}
                        >
                          <td className="px-3 py-2 font-sans">
                            {r.status === "valid" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                ✅ Valid
                              </span>
                            ) : r.status === "warning" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                ⚠️ Existing
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                ❌ Error
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.usn}
                              onChange={(e) => handleCellEdit(r.rowId, "usn", e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-sky-300 font-bold font-mono w-28 uppercase"
                            />
                          </td>

                          <td className="px-3 py-2 font-sans">
                            <input
                              type="text"
                              value={r.name}
                              onChange={(e) => handleCellEdit(r.rowId, "name", e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white font-sans w-36"
                            />
                          </td>

                          <td className="px-3 py-2">
                            <input
                              type="email"
                              value={r.email}
                              onChange={(e) => handleCellEdit(r.rowId, "email", e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 font-mono w-44"
                            />
                          </td>

                          <td className="px-3 py-2 font-sans">
                            <input
                              type="text"
                              value={r.course}
                              onChange={(e) => handleCellEdit(r.rowId, "course", e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 font-sans w-32"
                            />
                          </td>

                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={r.gradYear}
                              onChange={(e) => handleCellEdit(r.rowId, "gradYear", Number(e.target.value))}
                              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 font-mono w-16"
                            />
                          </td>

                          <td className="px-3 py-2 text-emerald-400 font-bold">
                            {r.computedPercentage}% ({r.computedGrade})
                            {r.subjects && r.subjects.length > 0 && (
                              <span className="block text-[10px] text-slate-400 font-normal">
                                {r.subjects.length} Subjects
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2 font-sans text-[11px]">
                            {r.errorMessages && r.errorMessages.length > 0 ? (
                              <ul className="text-rose-300 list-disc list-inside space-y-0.5">
                                {r.errorMessages.map((msg: string, idx: number) => (
                                  <li key={idx}>{msg}</li>
                                ))}
                              </ul>
                            ) : r.isAlreadyRegistered ? (
                              <span className="text-amber-300">Will update student record and write v2 marks.</span>
                            ) : (
                              <span className="text-emerald-400">Ready for registration.</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Confirm & Progress Section */}
                <div className="space-y-3 pt-2">
                  {confirmProgress && (
                    <div className="p-3 rounded-2xl bg-slate-950 border border-sky-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-sky-300 font-semibold flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Registering Candidate: <strong className="font-mono">{confirmProgress.currentUsn}</strong>
                        </span>
                        <span className="font-mono text-slate-400">
                          {confirmProgress.current} / {confirmProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full transition-all duration-300"
                          style={{
                            width: `${Math.round((confirmProgress.current / confirmProgress.total) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={
                        isConfirmingBulk ||
                        previewRows.filter((r) => r.status !== "error").length === 0
                      }
                      onClick={() => handleConfirmBatch(false)}
                      className="flex-1 bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl text-xs transition-all shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {isConfirmingBulk
                          ? "Executing Row-by-Row Ledger Registration..."
                          : `Confirm & Register Valid Students (${
                              previewRows.filter((r) => r.status !== "error").length
                            })`}
                      </span>
                    </button>

                    {confirmResults.some((r) => !r.success) && (
                      <button
                        type="button"
                        disabled={isConfirmingBulk}
                        onClick={() => handleConfirmBatch(true)}
                        className="px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-lg shadow-amber-600/20"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Failed Rows ({confirmResults.filter((r) => !r.success).length})</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Confirmation Results Audit Log */}
            {confirmResults.length > 0 && (
              <div className="space-y-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Ledger Registration Audit Log ({confirmResults.length} Processed)
                </span>

                <div className="overflow-x-auto max-h-60 border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">USN</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Version</th>
                        <th className="px-3 py-2">Transaction Hash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {confirmResults.map((res, i) => (
                        <tr key={i} className="hover:bg-slate-900/40">
                          <td className="px-3 py-2 font-bold text-sky-300">{res.usn}</td>
                          <td className="px-3 py-2 font-sans">
                            {res.success ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                ✅ Registered On Ledger
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30" title={res.error}>
                                ❌ Failed: {res.error}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-400">{res.version ? `v${res.version}` : "-"}</td>
                          <td className="px-3 py-2 text-slate-500 truncate max-w-xs">{res.txHash || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Student Achievements & Certificates Legal Review Desk */}
        {activeTab === "achievements" && (
          <div className="glass-panel rounded-3xl p-6 space-y-4 border border-sky-500/20 bg-slate-900/60 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-sky-900/30 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-sky-400" />
                  <span>Student Self-Uploaded Achievements Legal Review Desk</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Review certifications and achievements uploaded by students. Mark them as legally verified on Ethereum so that recruiter audits can trust the candidate's real skills.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              {pendingAchievements.length === 0 ? (
                <div className="text-xs text-slate-500 py-8 text-center">
                  No student achievements submitted for review.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-3">ID</th>
                      <th className="px-3 py-3">Achievement Title</th>
                      <th className="px-3 py-3">Issuing Body</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">IPFS Proof</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Legal Endorsement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {pendingAchievements.map((ach) => (
                      <tr key={ach.achievementId} className="hover:bg-slate-900/50 transition-colors">
                        <td className="px-3 py-3 font-mono font-bold text-sky-300">#{ach.achievementId}</td>
                        <td className="px-3 py-3 font-semibold text-white">{ach.title}</td>
                        <td className="px-3 py-3 text-slate-300">{ach.issuerOrg}</td>
                        <td className="px-3 py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                            {ach.category}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <a
                            href={getIPFSUrl(ach.ipfsCID)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 font-mono"
                          >
                            Inspect IPFS <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              ach.status === AchievementStatus.Verified
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : ach.status === AchievementStatus.Rejected
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {ach.status === AchievementStatus.Verified
                              ? "Verified Legal"
                              : ach.status === AchievementStatus.Rejected
                              ? "Rejected"
                              : "Pending Review"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {ach.status === AchievementStatus.PendingReview ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isReviewingAchievement}
                                onClick={() =>
                                  handleReviewAchievement(ach.achievementId, AchievementStatus.Verified, "Verified Legal")
                                }
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Endorse as Legal</span>
                              </button>
                              <button
                                type="button"
                                disabled={isReviewingAchievement}
                                onClick={() =>
                                  handleReviewAchievement(ach.achievementId, AchievementStatus.Rejected, "Rejected")
                                }
                                className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold text-xs transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono">Audited on Ledger</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Issued Credentials & Non-Deletable Notice */}
        {activeTab === "credentials" && (
          <div className="glass-panel rounded-3xl p-6 space-y-4 border border-sky-500/20 shadow-xl bg-slate-900/60">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-sky-900/30 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-sky-400" />
                  <span>Issued Credentials & Lifecycle Governance ({credentials.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Non-Deletable Institutional Records. Once issued, documents are permanently anchored to Ethereum smart contracts and students cannot delete them.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              {credentials.length === 0 ? (
                <div className="text-xs text-slate-500 py-8 text-center">
                  No credentials issued yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-3">Cred ID</th>
                      <th className="px-3 py-3">Student</th>
                      <th className="px-3 py-3">Document Type</th>
                      <th className="px-3 py-3">Version</th>
                      <th className="px-3 py-3">SHA-256 Fingerprint</th>
                      <th className="px-3 py-3">IPFS Doc</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {credentials.map((c) => (
                      <tr key={c.credentialId} className="hover:bg-slate-900/50 transition-colors">
                        <td className="px-3 py-3 font-bold text-sky-300">#{c.credentialId}</td>
                        <td className="px-3 py-3 text-slate-200 font-sans">
                          {(() => {
                            const st = students.find((s) => s.id === c.studentId);
                            return st ? (
                              <div className="flex flex-col">
                                <span className="font-mono text-sky-300 font-bold">{st.usn}</span>
                                <span className="text-[10px] text-slate-400">{st.name}</span>
                              </div>
                            ) : (
                              <span>Student #{c.studentId}</span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-3 font-sans text-slate-300 font-semibold">{c.documentType}</td>
                        <td className="px-3 py-3 text-slate-400">v{c.version}</td>
                        <td className="px-3 py-3 text-cyan-300 max-w-xs truncate" title={c.documentHash}>
                          {c.documentHash.slice(0, 10)}...{c.documentHash.slice(-8)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <a
                              href={getIPFSUrl(c.ipfsCID)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-sans"
                            >
                              IPFS <ExternalLink className="w-3 h-3" />
                            </a>
                            <span className="text-slate-600">|</span>
                            <a
                              href={`/verify/${c.credentialId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-sans"
                            >
                              Verify <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>
                        <td className="px-3 py-3 font-sans">
                          <StatusBadge status={c.status} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: Student Academic Version History & Report Download */}
        {activeTab === "history" && (
          <div className="glass-panel rounded-3xl p-6 space-y-6 border border-sky-500/20 shadow-xl bg-slate-900/60">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-sky-900/30 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-sky-400" />
                  <span>Student Academic Version History & Official Reports</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Append-only immutable audit trail. Every update creates a new version with Keccak-256 hash anchored to Ethereum smart contracts, preserving past versions as superseded.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Enter Student USN (e.g. 1RV21CS001)"
                  value={historySearchUsn}
                  onChange={(e) => setHistorySearchUsn(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono uppercase"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (historySearchUsn.trim()) {
                      loadStudentVersions(historySearchUsn.trim().toUpperCase());
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1 transition-all shadow-md shadow-sky-600/20"
                >
                  <Search className="w-3.5 h-3.5" />
                  Search
                </button>
              </div>
            </div>

            {selectedHistoryStudent ? (
              <div className="space-y-6">
                {/* Candidate Overview Card */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-sky-900/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{selectedHistoryStudent.name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-xs font-bold">
                        {selectedHistoryStudent.usn}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                        Active v{selectedHistoryStudent.marksVersion || 1}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {selectedHistoryStudent.course} · Class of {selectedHistoryStudent.gradYear} · {selectedHistoryStudent.email}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/reports/download?usn=${encodeURIComponent(selectedHistoryStudent.usn)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Latest Official Report
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedHistoryStudent(null);
                        setHistoryVersions([]);
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {/* Versions Table */}
                <div className="overflow-x-auto">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Append-Only Immutable Version Ledger
                  </h4>
                  {historyVersions.length === 0 ? (
                    <div className="text-xs text-slate-500 py-6 text-center">
                      No version history found for candidate {selectedHistoryStudent.usn}.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="text-[11px] text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-3">Version</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Scored / Total</th>
                          <th className="px-3 py-3">Percentage</th>
                          <th className="px-3 py-3">Keccak-256 Marks Hash</th>
                          <th className="px-3 py-3">Editor</th>
                          <th className="px-3 py-3">Recorded At</th>
                          <th className="px-3 py-3">Remarks</th>
                          <th className="px-3 py-3">Report PDF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 font-mono">
                        {historyVersions.map((v) => {
                          const isActive = v.status === "active" || v.version === selectedHistoryStudent.marksVersion;
                          return (
                            <tr key={v.id || v.version} className="hover:bg-slate-900/50 transition-colors">
                              <td className="px-3 py-3 font-bold text-sky-300">v{v.version}</td>
                              <td className="px-3 py-3 font-sans">
                                {isActive ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-400">
                                    Superseded
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3 font-sans text-slate-300">
                                {v.totalMarks} / {v.maxTotalMarks}
                              </td>
                              <td className="px-3 py-3 font-sans font-bold text-emerald-400">
                                {Number(v.percentage || 0).toFixed(2)}%
                              </td>
                              <td className="px-3 py-3 text-cyan-300 max-w-xs truncate" title={v.marksHash}>
                                {v.marksHash ? `${v.marksHash.slice(0, 10)}...${v.marksHash.slice(-8)}` : "N/A"}
                              </td>
                              <td className="px-3 py-3 text-slate-400 font-sans">{v.changedBy || "System"}</td>
                              <td className="px-3 py-3 text-slate-400 font-sans text-[11px]">
                                {new Date(v.createdAt).toLocaleDateString()} {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-3 py-3 text-slate-400 font-sans text-[11px] max-w-xs truncate" title={v.remarks}>
                                {v.remarks || "Onboarding batch"}
                              </td>
                              <td className="px-3 py-3 font-sans">
                                <a
                                  href={`/api/reports/download?usn=${encodeURIComponent(selectedHistoryStudent.usn)}&version=${v.version}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600/30 hover:bg-sky-600/50 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-all"
                                >
                                  <Download className="w-3 h-3" />
                                  PDF
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>Registered College Students ({historyStudents.length})</span>
                  <button
                    type="button"
                    onClick={loadStudentHistoryList}
                    className="text-sky-400 hover:text-sky-300 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingHistory ? "animate-spin" : ""}`} />
                    Refresh Candidate List
                  </button>
                </div>

                {historyStudents.length === 0 ? (
                  <div className="text-xs text-slate-500 py-12 text-center border border-dashed border-slate-800 rounded-2xl">
                    No registered students found for college {currentUnivCode}. Onboard students using Bulk CSV/Excel or Single Student Issuance.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[11px] text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-3">USN</th>
                          <th className="px-3 py-3">Candidate Name</th>
                          <th className="px-3 py-3">Official Email</th>
                          <th className="px-3 py-3">Course</th>
                          <th className="px-3 py-3">Current Version</th>
                          <th className="px-3 py-3">Current %</th>
                          <th className="px-3 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 font-mono">
                        {historyStudents.map((s) => (
                          <tr key={s.id || s.usn} className="hover:bg-slate-900/50 transition-colors">
                            <td className="px-3 py-3 font-bold text-sky-300">{s.usn}</td>
                            <td className="px-3 py-3 font-sans text-white font-medium">{s.name}</td>
                            <td className="px-3 py-3 font-sans text-slate-400">{s.email}</td>
                            <td className="px-3 py-3 font-sans text-slate-300">{s.course}</td>
                            <td className="px-3 py-3 font-sans">
                              <span className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-bold">
                                v{s.marksVersion || 1}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-sans font-bold text-emerald-400">
                              {Number(s.percentage || 0).toFixed(2)}%
                            </td>
                            <td className="px-3 py-3 font-sans">
                              <button
                                type="button"
                                onClick={() => loadStudentVersions(s.usn)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-all shadow-md shadow-sky-600/20"
                              >
                                <Clock className="w-3 h-3" />
                                Inspect History
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
