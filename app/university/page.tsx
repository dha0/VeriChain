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
import * as XLSX from "xlsx";
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

type ActiveTab = "single" | "generate" | "bulk" | "achievements" | "credentials";

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

  // Bulk CSV/Excel Upload States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsedRows, setCsvParsedRows] = useState<CSVStudentRow[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkResults, setBulkResults] = useState<{
    usn: string;
    name: string;
    studentId: number;
    credentialId?: number;
    cid?: string;
    status: "success" | "error";
    error?: string;
    pdfBytes?: Uint8Array;
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

  // CSV / Excel Template Downloader
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

  // Parse CSV or Excel (.xlsx, .xls) File Client-Side using SheetJS
  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCsvFile(file);
      setBulkResults([]);

      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheetName = wb.SheetNames[0];
        const rawJson: any[] = XLSX.utils.sheet_to_json(wb.Sheets[firstSheetName]);

        const rows: CSVStudentRow[] = rawJson
          .map((row: any) => {
            const keys = Object.keys(row);
            const getVal = (target: string) => {
              const foundKey = keys.find((k) => k.trim().toLowerCase() === target.toLowerCase());
              return foundKey !== undefined ? row[foundKey] : undefined;
            };

            const usnVal = String(getVal("usn") || getVal("seatno") || getVal("rollno") || "").trim();
            const nameVal = String(getVal("name") || getVal("studentname") || getVal("candidatename") || "").trim();
            const courseVal = String(
              getVal("course") || getVal("branch") || getVal("program") || "Computer Science & Engineering"
            ).trim();
            const gradYearVal =
              parseInt(String(getVal("graduationyear") || getVal("gradyear") || getVal("batch") || 2026)) || 2026;
            const pctVal =
              parseFloat(String(getVal("percentage") || getVal("marks") || getVal("score") || 85)) || 85;
            const docTypeVal = String(getVal("documenttype") || getVal("doctype") || "Academic Marksheet").trim();
            const remarkVal = String(
              getVal("graderemark") ||
                getVal("remark") ||
                getVal("distinction") ||
                (pctVal >= 75 ? "First Class with Distinction" : "First Class")
            ).trim();

            return {
              usn: usnVal,
              name: nameVal,
              course: courseVal,
              gradYear: gradYearVal,
              graduationYear: gradYearVal,
              percentage: pctVal,
              documentType: docTypeVal,
              gradeRemark: remarkVal,
            };
          })
          .filter((r) => r.usn && r.name);

        if (rows.length === 0) {
          alert("No valid student rows found. Please check columns: usn, name, course, graduationYear, percentage");
          return;
        }

        setCsvParsedRows(rows);
      } catch (err: any) {
        alert("Failed to parse spreadsheet: " + err.message);
      }
    }
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

  // Process Bulk CSV/Excel Upload: Creates individual authentic PDFs with QR, pins separately, and anchors on Ethereum
  const handleProcessBulkUpload = async () => {
    if (csvParsedRows.length === 0) return;

    setIsProcessingBulk(true);
    setStatusMessage({
      text: `Starting decentralized batch processing for ${csvParsedRows.length} students... Generating official PDF marksheets with embedded QR codes & anchoring to Ethereum.`,
      type: "info",
    });

    const results: {
      usn: string;
      name: string;
      studentId: number;
      credentialId?: number;
      cid?: string;
      status: "success" | "error";
      error?: string;
      pdfBytes?: Uint8Array;
    }[] = [];

    try {
      for (let i = 0; i < csvParsedRows.length; i++) {
        const row = csvParsedRows[i];
        setBulkProgress({ current: i + 1, total: csvParsedRows.length });

        try {
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
          if (!regRes.ok || !regData.studentId) {
            throw new Error(regData.error || `Student registration failed for ${row.usn}`);
          }
          const studentId = Number(regData.studentId);

          // 2. Build verify QR URL pointing to /verify?usn=...
          const origin =
            typeof window !== "undefined"
              ? window.location.origin
              : "https://blockchain-document-verification-one.vercel.app";
          const verifyUrl = `${origin}/verify?usn=${encodeURIComponent(row.usn.toUpperCase())}`;

          // 3. Generate high-fidelity official PDF with embedded QR code
          const pdfBytes = await generateMarksheetPDF({
            universityName: currentUnivName,
            universityCode: currentUnivCode,
            studentName: row.name,
            usn: row.usn,
            course: row.course,
            graduationYear: row.graduationYear || new Date().getFullYear(),
            percentage: row.percentage,
            documentType: row.documentType || "Academic Marksheet",
            academicDistinction:
              row.gradeRemark || (row.percentage >= 75 ? "FIRST CLASS WITH DISTINCTION" : "FIRST CLASS"),
            verificationUrl: verifyUrl,
          });

          // 4. Create File and Compute SHA-256
          const pdfFile = new File([pdfBytes as any], `${row.usn}_official_marksheet.pdf`, {
            type: "application/pdf",
          });
          const docHash = await computeSHA256(pdfFile);

          // 5. Pin real PDF to Pinata IPFS
          const { cid } = await uploadToIPFS(pdfFile);

          // 6. Anchor credential proof separately on-chain
          const issueRes = await fetch("/api/blockchain/relay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "issueCredential",
              universityCode: currentUnivCode,
              data: {
                studentId,
                documentType: row.documentType || "Academic Marksheet",
                documentHash: docHash,
                ipfsCID: cid,
              },
            }),
          });
          const issueData = await issueRes.json();
          if (!issueRes.ok) {
            throw new Error(issueData.error || "Failed to anchor credential proof on ledger");
          }

          results.push({
            usn: row.usn,
            name: row.name,
            studentId,
            credentialId: issueData.credentialId,
            cid,
            status: "success",
            pdfBytes,
          });
        } catch (rowErr: any) {
          console.error(`Row ${i + 1} (${row.usn}) failed:`, rowErr);
          results.push({
            usn: row.usn,
            name: row.name,
            studentId: 0,
            status: "error",
            error: rowErr.message || "Failed processing record",
          });
        }
      }

      setBulkResults(results);
      const successCount = results.filter((r) => r.status === "success").length;
      setStatusMessage({
        text: `Batch complete: ${successCount} of ${csvParsedRows.length} students processed! Each received an authentic PDF marksheet with embedded QR code anchored on Ethereum & IPFS.`,
        type: successCount === csvParsedRows.length ? "success" : "info",
      });
      await loadUniversityData();
    } catch (err: any) {
      setStatusMessage({
        text: "Bulk upload error: " + (err.message || "Relayer error"),
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
                      placeholder="e.g. 1RV21CS001"
                      value={genUsn}
                      onChange={(e) => setGenUsn(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-sky-500 uppercase font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Candidate Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
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

        {/* TAB 3: Bulk CSV / Excel Upload & Batch Processor */}
        {activeTab === "bulk" && (
          <div className="glass-panel rounded-3xl p-6 space-y-6 border border-sky-500/20 bg-slate-900/60 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-sky-900/30 pb-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-sky-400" />
                  <span>Bulk Student CSV / Excel Parsing & Automated PDF Generation</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Upload a spreadsheet (.csv, .xlsx, .xls) containing multiple student records. VeriChain generates individual authentic PDF marksheets with embedded blockchain QR codes, computes separate SHA-256 fingerprints, pins files to IPFS, and permanently anchors each record on Ethereum.
                </p>
              </div>

              <button
                type="button"
                onClick={downloadCsvTemplate}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-colors shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Download Sample Template</span>
              </button>
            </div>

            {/* CSV / Excel File Input */}
            <div className="border-2 border-dashed border-sky-700/50 hover:border-sky-500 rounded-3xl p-8 text-center bg-slate-950/60 transition-colors">
              <input
                type="file"
                accept=".csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
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
                    {csvFile ? csvFile.name : "Select or Drop Student Records Spreadsheet (CSV or Excel .xlsx)"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports columns: <code>usn, name, course, graduationYear, percentage, documentType</code>
                  </p>
                </div>
              </label>
            </div>

            {/* Bulk Results Table from recent run */}
            {bulkResults.length > 0 && (
              <div className="space-y-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Batch Processing Ledger Records ({bulkResults.length} Processed)
                  </span>
                </div>

                <div className="overflow-x-auto max-h-64 border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">USN</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Credential</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono">
                      {bulkResults.map((res, i) => (
                        <tr key={i} className="hover:bg-slate-900/40">
                          <td className="px-3 py-2 font-bold text-sky-300">{res.usn}</td>
                          <td className="px-3 py-2 font-sans text-white">{res.name}</td>
                          <td className="px-3 py-2 text-purple-300">
                            {res.credentialId ? `#${res.credentialId}` : "-"}
                          </td>
                          <td className="px-3 py-2 font-sans">
                            {res.status === "success" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                ✅ Minted & Anchored
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30" title={res.error}>
                                ❌ Failed
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-sans">
                            {res.pdfBytes && (
                              <button
                                type="button"
                                onClick={() =>
                                  downloadPDFFile(res.pdfBytes!, `${res.usn}_official_marksheet.pdf`)
                                }
                                className="px-2.5 py-1 rounded bg-sky-900/50 hover:bg-sky-800 text-sky-300 hover:text-white border border-sky-600/40 text-[11px] font-semibold inline-flex items-center gap-1 mr-2"
                              >
                                <Download className="w-3 h-3" />
                                <span>PDF</span>
                              </button>
                            )}
                            <a
                              href={`/verify?usn=${encodeURIComponent(res.usn)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Verify</span>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Parsed Rows Preview Table */}
            {csvParsedRows.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Parsed Records Ready for On-Chain Batch Processing ({csvParsedRows.length} Students)
                  </span>
                  <span className="text-[11px] font-mono text-cyan-400">
                    Each record will generate an authentic PDF with verification QR code & IPFS anchor
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
                      ? `Compiling Marksheets & Anchoring ${bulkProgress?.current} of ${bulkProgress?.total} Students to Ethereum & IPFS...`
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
      </div>
    </RoleGuard>
  );
}
