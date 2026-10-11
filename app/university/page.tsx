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
} from "lucide-react";
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

type ActiveTab = "single" | "bulk" | "achievements" | "credentials";

export default function UniversityPage() {
  const { entityInfo } = useAuth();
  const currentUnivCode = entityInfo?.code || "VTU-KA-001";
  const currentUnivName = entityInfo?.name || "Visvesvaraya Technological University";

  const [activeTab, setActiveTab] = useState<ActiveTab>("single");
  const [universityId, setUniversityId] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // Student Registration Form States
  const [usn, setUsn] = useState("");
  const [studentName, setStudentName] = useState("");
  const [course, setCourse] = useState("Computer Science & Engineering");
  const [gradYear, setGradYear] = useState(2026);
  const [percentage, setPercentage] = useState(85);
  const [isRegisteringStudent, setIsRegisteringStudent] = useState(false);

  // Credential Issuance Form States
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<DocumentType>("Degree Certificate");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [computedHash, setComputedHash] = useState("");
  const [ipfsCid, setIpfsCid] = useState("");
  const [encryptBeforeUpload, setEncryptBeforeUpload] = useState(false);
  const [generatedSecretKey, setGeneratedSecretKey] = useState<string | null>(null);
  const [isIssuingCred, setIsIssuingCred] = useState(false);

  // Bulk CSV Upload States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsedRows, setCsvParsedRows] = useState<CSVStudentRow[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

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
          data: { usn, name: studentName, course, gradYear, percentage },
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

      const res = await fetch("/api/blockchain/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issueCredential",
          universityCode: currentUnivCode,
          data: {
            studentId: Number(selectedStudentId),
            documentType: selectedDocType,
            documentHash: computedHash,
            ipfsCID: cid,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to issue credential on blockchain");

      setStatusMessage({
        text: `${selectedDocType} issued successfully! On-Chain Hash: ${computedHash.slice(0, 10)}... | IPFS: ${cid}`,
        type: "success",
      });

      setSelectedFile(null);
      setComputedHash("");
      setSelectedStudentId("");
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

  // CSV Template Downloader
  const downloadCsvTemplate = () => {
    const csvContent =
      "usn,name,course,graduationYear,percentage,documentType,gradeRemark\n" +
      "1RV21CS002,Priya Nair,Computer Science & Engineering,2025,91,Degree Certificate,First Class with Distinction\n" +
      "1RV21CS003,Aditya Verma,Information Science & Engineering,2025,87,Academic Marksheet,First Class Honors\n" +
      "1RV21CS004,Sneha Kulkarni,Artificial Intelligence & Machine Learning,2025,94,Consolidated Transcript,University Gold Medalist\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "student_bulk_upload_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Parse CSV File Client-Side
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCsvFile(file);

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (!text) return;

        const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        if (lines.length < 2) return;

        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const rows: CSVStudentRow[] = [];

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map((p) => p.trim());
          if (parts.length >= 5) {
            rows.push({
              usn: parts[0] || "",
              name: parts[1] || "",
              course: parts[2] || "Computer Science & Engineering",
              gradYear: parseInt(parts[3]) || 2025,
              graduationYear: parseInt(parts[3]) || 2025,
              percentage: parseInt(parts[4]) || 85,
              documentType: parts[5] || "Degree Certificate",
              gradeRemark: parts[6] || "Verified Academic Record",
            });
          }
        }
        setCsvParsedRows(rows);
      };
      reader.readAsText(file);
    }
  };

  // Process Bulk CSV Upload: Reads each row, creates files separately, pins separately, and anchors on Ethereum
  const handleProcessBulkUpload = async () => {
    if (csvParsedRows.length === 0) return;

    setIsProcessingBulk(true);
    setStatusMessage({
      text: `Starting decentralized batch processing for ${csvParsedRows.length} students...`,
      type: "info",
    });

    try {
      for (let i = 0; i < csvParsedRows.length; i++) {
        const row = csvParsedRows[i];
        setBulkProgress({ current: i + 1, total: csvParsedRows.length });

        // 1. Register student on-chain
        const regRes = await fetch("/api/blockchain/relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "registerStudent",
            universityCode: currentUnivCode,
            data: {
              usn: row.usn,
              name: row.name,
              course: row.course,
              gradYear: row.graduationYear,
              percentage: row.percentage,
            },
          }),
        });
        const regData = await regRes.json();
        const studentId = regData.studentId || i + 1;

        // 2. Generate individual student certificate document content
        const certificateDocumentText = `
================================================================================
                    OFFICIAL ACCREDITED ACADEMIC CREDENTIAL
================================================================================
Issuing University:   ${currentUnivName} (${currentUnivCode})
Candidate Full Name:  ${row.name}
University Seat No:   ${row.usn}
Academic Program:     ${row.course}
Graduation Year:      ${row.graduationYear}
Cumulative Score:     ${row.percentage}%
Document Type:        ${row.documentType || "Degree Certificate"}
Academic Distinction: ${row.gradeRemark || "Verified First Class"}
Timestamp:            ${new Date().toISOString()}
Decentralized Proof:  Anchored to Ethereum Smart Contract & Pinata IPFS
================================================================================
`;
        const blob = new Blob([certificateDocumentText], { type: "text/plain" });
        const studentDocFile = new File([blob], `${row.usn}_${(row.documentType || "degree").replace(/\s+/g, "_")}.txt`, {
          type: "text/plain",
        });

        // 3. Compute separate SHA-256 hash
        const docHash = await computeSHA256(studentDocFile);

        // 4. Pin separate file to IPFS
        const { cid } = await uploadToIPFS(studentDocFile);

        // 5. Issue credential proof separately on-chain
        await fetch("/api/blockchain/relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "issueCredential",
            universityCode: currentUnivCode,
            data: {
              studentId,
              documentType: row.documentType || "Degree Certificate",
              documentHash: docHash,
              ipfsCID: cid,
            },
          }),
        });
      }

      setStatusMessage({
        text: `Successfully processed ${csvParsedRows.length} student records! Each student file was generated, hashed, pinned to IPFS, and anchored separately on Ethereum.`,
        type: "success",
      });
      setCsvParsedRows([]);
      setCsvFile(null);
      await loadUniversityData();
    } catch (err: any) {
      setStatusMessage({
        text: "Bulk upload stopped: " + (err.message || "Relayer error"),
        type: "error",
      });
    } finally {
      setIsProcessingBulk(false);
      setBulkProgress(null);
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

  return (
    <RoleGuard allowedRoles={["university", "admin"]} portalName="University Authority Portal">
      <div className="space-y-8 rounded-3xl p-2 sm:p-4 bg-gradient-to-b from-sky-950/20 via-slate-950/60 to-slate-950">
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
            onClick={() => setActiveTab("bulk")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "bulk"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Bulk CSV File Upload</span>
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
                      Student ID (#)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      placeholder="Enter Registered Student ID"
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500 font-mono"
                    />
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

        {/* TAB 2: Bulk CSV Upload & Batch Processor */}
        {activeTab === "bulk" && (
          <div className="glass-panel rounded-3xl p-6 space-y-6 border border-sky-500/20 bg-slate-900/60 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-sky-900/30 pb-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-sky-400" />
                  <span>Bulk Student CSV Parsing & Separate File Anchoring</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Upload a CSV file containing multiple students. The website parses the contents, creates separate digital certificates for each student, computes individual SHA-256 hashes, pins files separately to IPFS, and permanently registers each student on Ethereum.
                </p>
              </div>

              <button
                type="button"
                onClick={downloadCsvTemplate}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-colors shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Download Sample CSV Template</span>
              </button>
            </div>

            {/* CSV File Input */}
            <div className="border-2 border-dashed border-sky-700/50 hover:border-sky-500 rounded-3xl p-8 text-center bg-slate-950/60 transition-colors">
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleCsvFileChange}
                className="hidden"
                id="bulkCsvInput"
              />
              <label htmlFor="bulkCsvInput" className="cursor-pointer space-y-3 block">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {csvFile ? csvFile.name : "Select or Drop Student Records CSV File"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports columns: <code>usn, name, course, graduationYear, percentage, documentType</code>
                  </p>
                </div>
              </label>
            </div>

            {/* Parsed Rows Preview Table */}
            {csvParsedRows.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Parsed Records Ready for On-Chain Batch Processing ({csvParsedRows.length} Students)
                  </span>
                  <span className="text-[11px] font-mono text-cyan-400">
                    Each record will be saved & pinned separately
                  </span>
                </div>

                <div className="overflow-x-auto max-h-72 border border-slate-800 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2.5">#</th>
                        <th className="px-3 py-2.5">USN</th>
                        <th className="px-3 py-2.5">Candidate Name</th>
                        <th className="px-3 py-2.5">Course</th>
                        <th className="px-3 py-2.5">Grad Year</th>
                        <th className="px-3 py-2.5">Score</th>
                        <th className="px-3 py-2.5">Document Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
                      {csvParsedRows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-900/50">
                          <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                          <td className="px-3 py-2 font-bold text-sky-300">{r.usn}</td>
                          <td className="px-3 py-2 font-sans font-semibold text-white">{r.name}</td>
                          <td className="px-3 py-2 font-sans text-slate-300">{r.course}</td>
                          <td className="px-3 py-2">{r.graduationYear}</td>
                          <td className="px-3 py-2 text-emerald-400">{r.percentage}%</td>
                          <td className="px-3 py-2 font-sans text-cyan-300">{r.documentType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  disabled={isProcessingBulk}
                  onClick={handleProcessBulkUpload}
                  className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-xs transition-all shadow-lg shadow-sky-600/25 flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {isProcessingBulk
                      ? `Anchoring ${bulkProgress?.current} of ${bulkProgress?.total} Students to Ethereum & IPFS...`
                      : `Execute Decentralized Bulk Anchoring (${csvParsedRows.length} Students)`}
                  </span>
                </button>
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
                        <td className="px-3 py-3 text-slate-200 font-sans">Student #{c.studentId}</td>
                        <td className="px-3 py-3 font-sans text-slate-300 font-semibold">{c.documentType}</td>
                        <td className="px-3 py-3 text-slate-400">v{c.version}</td>
                        <td className="px-3 py-3 text-cyan-300 max-w-xs truncate" title={c.documentHash}>
                          {c.documentHash.slice(0, 10)}...{c.documentHash.slice(-8)}
                        </td>
                        <td className="px-3 py-3">
                          <a
                            href={getIPFSUrl(c.ipfsCID)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-sans"
                          >
                            View IPFS <ExternalLink className="w-3 h-3" />
                          </a>
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
      </div>
    </RoleGuard>
  );
}
