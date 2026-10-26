"use client";

import React, { useState, useEffect } from "react";
import {
  GraduationCap,
  Search,
  FileCheck,
  Building2,
  Calendar,
  Award,
  ExternalLink,
  QrCode as QrIcon,
  Copy,
  Check,
  Hash,
  ShieldCheck,
  Key,
  Unlock,
  Download,
  Layers,
  Sparkles,
  FileText,
  Lock,
  Upload,
  PlusCircle,
  FileBadge,
  AlertCircle,
  Clock,
  Shield,
  FileCheck2,
  CheckCircle2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  getContractReadOnly,
  isMetaMaskInstalled,
  parseBlockchainError,
  switchToHardhatLocal,
  switchToSepolia,
} from "@/lib/ethereum";
import { SUPPORTED_CHAIN_ID, SUPPORTED_NETWORK_NAME } from "@/contracts/contractAddress";
import { uploadToIPFS, getIPFSUrl } from "@/lib/pinata";
import { computeSHA256, decryptDocument } from "@/lib/crypto";
import { StatusBadge } from "@/components/StatusBadge";
import { Credential, Achievement, AchievementStatus, DigiLockerDocument } from "@/types";
import { CandidateSummaryCharts } from "@/components/CandidateSummaryCharts";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { ProcessStepper } from "@/components/ProcessStepper";
import { getStudentStepperState } from "@/lib/stepperEngine";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";

export default function StudentPage() {
  const { studentUSN, entityInfo, role, isAuthenticated } = useAuth();
  const [usnInput, setUsnInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [studentData, setStudentData] = useState<any>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [universityData, setUniversityData] = useState<any>(null);
  const [selectedCredForQR, setSelectedCredForQR] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Student Self-Uploaded Achievements State
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isSubmittingAchievement, setIsSubmittingAchievement] = useState(false);
  const [achTitle, setAchTitle] = useState("");
  const [achIssuer, setAchIssuer] = useState("");
  const [achCategory, setAchCategory] = useState("Certification");
  const [achFile, setAchFile] = useState<File | null>(null);
  const [achHash, setAchHash] = useState("");
  const [showAchModal, setShowAchModal] = useState(false);
  const [achSuccessMsg, setAchSuccessMsg] = useState("");

  // DigiLocker Gateway State
  const [digiLockerDocs, setDigiLockerDocs] = useState<DigiLockerDocument[]>([]);
  const [isDigiLockerConnected, setIsDigiLockerConnected] = useState(false);
  const [isLoadingDigiLocker, setIsLoadingDigiLocker] = useState(false);
  const [bridgedDocMsg, setBridgedDocMsg] = useState("");

  // Decryption modal state
  const [decryptModalCred, setDecryptModalCred] = useState<Credential | null>(null);
  const [decryptionKeyInput, setDecryptionKeyInput] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedFileUrl, setDecryptedFileUrl] = useState<string | null>(null);
  const [decryptionError, setDecryptionError] = useState("");

  // 45-second visibility polling (pauses when hidden, stops on logout)
  useVisibilityPolling(
    () => {
      if (studentUSN) {
        executeSearch(studentUSN);
      }
    },
    45000,
    Boolean(isAuthenticated && studentUSN)
  );

  // Compute Process Stepper State (strictly derives USN from session.studentUSN)
  const stepperState = getStudentStepperState({
    student: studentData,
    achievements,
    session: {
      role,
      studentUSN,
      account: entityInfo?.wallet || null,
    },
  });

  const executeSearch = async (targetUsn: string) => {
    if (!targetUsn.trim()) return;

    setIsLoading(true);
    setError("");
    setStudentData(null);
    setCredentials([]);
    setUniversityData(null);

    try {
      const contract = getContractReadOnly();

      // 1. Fetch student by USN
      const s = await contract.getStudentByUSN(targetUsn.trim());
      const sId = Number(s.id);

      setStudentData({
        id: sId,
        usn: s.usn,
        name: s.name,
        course: s.course,
        graduationYear: Number(s.graduationYear),
        percentage: Number(s.percentage),
        universityId: Number(s.universityId),
      });

      // 2. Fetch issuing university
      const u = await contract.getUniversity(s.universityId);
      setUniversityData({
        id: Number(u.id),
        name: u.name,
        code: u.universityCode,
        active: u.active,
      });

      // 3. Fetch all credentials for this student
      const credIds: bigint[] = await contract.getCredentialsByStudent(sId);
      const credList: Credential[] = [];
      for (const cId of credIds) {
        try {
          const c = await contract.getCredential(Number(cId));
          credList.push({
            credentialId: Number(c.credentialId),
            studentId: Number(c.studentId),
            universityId: Number(c.universityId),
            documentType: c.documentType || "Degree Certificate",
            documentHash: c.documentHash,
            ipfsCID: c.ipfsCID,
            issuedAt: Number(c.issuedAt),
            version: Number(c.version),
            status: Number(c.status),
            exists: c.exists,
          });
        } catch (e) {
          console.error("Error reading cred", e);
        }
      }

      setCredentials(credList);
      if (credList.length > 0) {
        setSelectedCredForQR(credList[credList.length - 1].credentialId);
      }

      // 4. Fetch student achievements
      await fetchAchievements(sId);
      // 5. Load DigiLocker documents
      await loadDigiLocker(targetUsn.trim());
    } catch (err: any) {
      setError(parseBlockchainError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAchievements = async (studentId: number) => {
    try {
      const res = await fetch(`/api/achievements?studentId=${studentId}`);
      const data = await res.json();
      if (data.achievements) {
        setAchievements(data.achievements);
      }
    } catch (e) {
      console.error("Failed to load achievements", e);
    }
  };

  const loadDigiLocker = async (usn: string) => {
    setIsLoadingDigiLocker(true);
    try {
      const res = await fetch(`/api/digilocker?usn=${usn}`);
      const data = await res.json();
      if (data.documents) {
        setDigiLockerDocs(data.documents);
        setIsDigiLockerConnected(true);
      }
    } catch (e) {
      console.error("Failed to load DigiLocker docs", e);
    } finally {
      setIsLoadingDigiLocker(false);
    }
  };

  useEffect(() => {
    const activeUSN = studentUSN || "";
    setUsnInput(activeUSN);
    if (activeUSN) {
      executeSearch(activeUSN);
    }
  }, [studentUSN]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(usnInput);
  };

  const getVerificationUrl = (credId: number) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/verify/${credId}`;
    }
    return `/verify/${credId}`;
  };

  const copyToClipboard = (credId: number) => {
    const url = getVerificationUrl(credId);
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Achievement file change
  const handleAchFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAchFile(file);
      try {
        const hash = await computeSHA256(file);
        setAchHash(hash);
      } catch (err: any) {
        alert("Failed to compute SHA-256 hash");
      }
    }
  };

  // Submit Achievement / Certificate Form (Server computes SHA-256 and pins to IPFS)
  const handleSubmitAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!achFile) {
      alert("Please upload your certification file");
      return;
    }

    setIsSubmittingAchievement(true);
    setAchSuccessMsg("");
    try {
      const formData = new FormData();
      formData.append("file", achFile);
      formData.append("title", achTitle);
      formData.append("issuerOrg", achIssuer);
      formData.append("category", achCategory);

      const res = await fetch("/api/certificates/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload certificate");
      }

      setAchSuccessMsg(
        `Certificate "${achTitle}" uploaded successfully! Document hash: ${data.documentHash ? data.documentHash.slice(0, 16) : ""}... Status: Pending University Endorsement.`
      );
      setAchTitle("");
      setAchIssuer("");
      setAchFile(null);
      setAchHash("");

      if (studentData?.id) {
        await fetchAchievements(studentData.id);
      }
    } catch (err: any) {
      alert("Error submitting certificate: " + err.message);
    } finally {
      setIsSubmittingAchievement(false);
    }
  };

  // Bridge DigiLocker Document
  const handleBridgeDigiLockerDoc = async (doc: DigiLockerDocument) => {
    try {
      const res = await fetch("/api/digilocker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: doc.id,
          usn: studentData?.usn || usnInput,
        }),
      });
      const data = await res.json();
      setBridgedDocMsg(`Government document "${doc.name}" securely bridged and verified!`);
      setTimeout(() => setBridgedDocMsg(""), 4000);
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Client-Side Decryption Handler
  const handleDecryptDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decryptModalCred || !decryptionKeyInput.trim()) return;

    setIsDecrypting(true);
    setDecryptionError("");
    try {
      const parts = decryptionKeyInput.trim().split(":");
      if (parts.length !== 2) {
        throw new Error("Invalid key format. Expected 'secretKey:ivHex'");
      }
      const [hexKey, ivHex] = parts;

      const ipfsUrl = getIPFSUrl(decryptModalCred.ipfsCID);
      const res = await fetch(ipfsUrl);
      if (!res.ok) throw new Error("Failed to download encrypted payload from IPFS gateway.");

      const encryptedBuffer = await res.arrayBuffer();
      const decryptedBuffer = await decryptDocument(encryptedBuffer, hexKey, ivHex);

      const blob = new Blob([decryptedBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDecryptedFileUrl(url);
    } catch (err: any) {
      setDecryptionError(err.message || "Decryption failed. Please check secret key and IV.");
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <RoleGuard
      allowedRoles={["student", "admin", "university", "company"]}
      portalName="Student Digital Credential Locker"
    >
      <div className="max-w-6xl mx-auto space-y-8 rounded-3xl p-2 sm:p-4 bg-gradient-to-b from-indigo-950/20 via-slate-950/60 to-slate-950">
        {/* Workflow Process Stepper */}
        <ProcessStepper
          state={stepperState}
          onAction={() => setShowAchModal(true)}
        />

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Candidate Cryptographic Locker & Portfolios
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
            Decentralized Academic Locker & Skill Vault
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto">
            View immutable academic records issued by your university, showcase peer-verified achievements, and connect directly to DigiLocker for tamper-proof verification.
          </p>
        </div>

        {/* USN Search Form */}
        <div className="glass-panel rounded-3xl p-6 shadow-xl border border-indigo-500/20 bg-slate-900/60">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                placeholder="Enter Student USN / Roll Number"
                value={usnInput}
                onChange={(e) => setUsnInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 uppercase font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 shrink-0"
            >
              {isLoading ? "Querying Ledger..." : "Search Digital Locker"}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Student Profile Card with University Verified Status */}
        {studentData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 glass-panel rounded-3xl p-6 space-y-4 border border-indigo-500/20 bg-slate-900/60 shadow-xl">
              <div className="flex items-center justify-between border-b border-indigo-900/30 pb-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <GraduationCap className="w-4 h-4" />
                  <span>Verified Candidate Ledger Record</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                    ✓ Verified by University
                  </span>
                  <span className="text-xs font-mono text-slate-400">ID #{studentData.id}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Candidate Name</span>
                  <span className="text-base font-bold text-white">{studentData.name}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Seat Number (USN)</span>
                  <span className="text-base font-mono font-bold text-indigo-300">{studentData.usn}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Degree / Course</span>
                  <span className="text-xs font-semibold text-slate-200">{studentData.course}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Graduation Year</span>
                  <span className="text-xs font-semibold text-slate-200">{studentData.graduationYear}</span>
                </div>
              </div>

              {universityData && (
                <div className="mt-4 pt-4 border-t border-indigo-900/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-sky-400" />
                    <div>
                      <span className="text-xs font-semibold text-white block">{universityData.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">Code: {universityData.code}</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    Accredited Authority
                  </span>
                </div>
              )}
            </div>

            {/* Aggregate Score Card */}
            <div className="glass-panel rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-2 border border-indigo-500/20 bg-slate-900/60 shadow-xl">
              <Award className="w-9 h-9 text-amber-400" />
              <span className="text-xs uppercase font-bold text-slate-400">Cumulative Grade</span>
              <span className="text-4xl font-extrabold text-emerald-400">{studentData.percentage}%</span>
              <span className="text-[11px] text-slate-400">Non-Deletable Ledger Record</span>
              <a
                href="/api/reports/download"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/25 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download Official Report (PDF)</span>
              </a>
            </div>
          </div>
        )}

        {/* Candidate Interactive Summary Charts & Academic Dossier */}
        {studentData && (
          <div className="pt-2">
            <CandidateSummaryCharts
              student={studentData}
              credentials={credentials}
              achievements={achievements}
            />
          </div>
        )}

        {/* SECTION 1: University Uploaded Official Credentials (Immutable & Non-Deletable) */}
        {studentData && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-indigo-900/30 pb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-indigo-400" />
                  <span>University Uploaded Official Documents ({credentials.length})</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Uploaded by accredited university authority. These documents are permanently anchored to Ethereum and cannot be modified or deleted.
                </p>
              </div>

              <span className="text-[10px] font-mono px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-amber-400" />
                <span>Tamper-Proof & Non-Deletable</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-3">
                {credentials.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-500">
                    No academic credentials issued by university yet.
                  </div>
                ) : (
                  credentials.map((cred) => (
                    <div
                      key={cred.credentialId}
                      onClick={() => setSelectedCredForQR(cred.credentialId)}
                      className={`glass-panel rounded-2xl p-5 cursor-pointer transition-all border ${
                        selectedCredForQR === cred.credentialId
                          ? "border-cyan-500 bg-cyan-950/20 shadow-lg shadow-cyan-500/10"
                          : "border-slate-800 hover:border-slate-700 bg-slate-900/60"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-cyan-400" />
                          <span className="text-sm font-bold text-white">{cred.documentType}</span>
                          <StatusBadge status={cred.status} size="sm" />
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                          v{cred.version}.0
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        SHA-256: {cred.documentHash}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <a
                            href={getIPFSUrl(cred.ipfsCID)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
                          >
                            View IPFS <ExternalLink className="w-3 h-3" />
                          </a>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDecryptModalCred(cred);
                              setDecryptedFileUrl(null);
                              setDecryptionError("");
                            }}
                            className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                          >
                            <Unlock className="w-3 h-3" />
                            Decrypt
                          </button>
                        </div>

                        <span className="text-[10px] text-slate-500">
                          {new Date(cred.issuedAt * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Recruiter QR Code Generator */}
              <div className="glass-panel rounded-3xl p-6 text-center space-y-4 border border-indigo-500/20 bg-slate-900/60 shadow-xl">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-400">
                  <QrIcon className="w-4 h-4" />
                  <span>Instant Recruiter QR Verification</span>
                </div>

                {selectedCredForQR ? (
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-2xl inline-block shadow-2xl">
                      <QRCodeSVG
                        value={getVerificationUrl(selectedCredForQR)}
                        size={170}
                        level="H"
                        includeMargin={true}
                      />
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Attach this QR code to your resume. IT recruiters scan it to immediately verify your documents against the Ethereum ledger.
                    </p>

                    <button
                      onClick={() => copyToClipboard(selectedCredForQR)}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2.5 px-3 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {copiedLink ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedLink ? "Link Copied!" : "Copy Verification URL"}</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Select a document to generate verification QR code.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: Student Self-Uploaded Achievements & Certifications (University Legal Review) */}
        {studentData && (
          <div className="glass-panel rounded-3xl p-6 space-y-6 border border-purple-500/20 bg-slate-900/60 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-purple-900/30 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-purple-400" />
                  <span>My Extra-Curricular Achievements & Industry Certifications ({achievements.length})</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Upload certifications and achievements. These are reviewed and stamped as legal by your university so employers know your real skills.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowAchModal(true);
                  setAchSuccessMsg("");
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-600/25 transition-colors shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Upload New Achievement</span>
              </button>
            </div>

            {achievements.length === 0 ? (
              <div className="text-xs text-slate-500 py-6 text-center">
                No achievements uploaded yet. Click "Upload New Achievement" to submit external certifications.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {achievements.map((ach) => (
                  <div
                    key={ach.achievementId}
                    className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-sm font-bold text-white block">{ach.title}</span>
                        <span className="text-xs text-slate-400 font-sans block">{ach.issuerOrg}</span>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase shrink-0 ${
                          ach.status === AchievementStatus.Verified
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : ach.status === AchievementStatus.Rejected
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {ach.status === AchievementStatus.Verified
                          ? "✓ Verified Legal by University"
                          : ach.status === AchievementStatus.Rejected
                          ? "Rejected"
                          : "Pending Legal Review"}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      SHA-256: {ach.documentHash}
                    </div>

                    {ach.reviewRemarks && (
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                        <strong className="text-purple-300 block mb-0.5">University Remarks:</strong>
                        {ach.reviewRemarks}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-900">
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-[10px]">
                        {ach.category}
                      </span>
                      <a
                        href={getIPFSUrl(ach.ipfsCID)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 font-mono inline-flex items-center gap-1"
                      >
                        IPFS Certificate <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: National DigiLocker / NAD Verified Gateway */}
        {studentData && (
          <div className="glass-panel rounded-3xl p-6 space-y-4 border border-emerald-500/20 bg-slate-900/60 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-emerald-900/30 pb-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">
                    National Academic Depository & DigiLocker Gateway
                  </h3>
                </div>
                <p className="text-xs text-slate-400">
                  Direct connection with DigiLocker. Government and school-issued records are authenticated via Aadhaar/eKYC and bridged into decentralized IPFS storage.
                </p>
              </div>

              <span className="text-[10px] font-mono px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                ✓ DigiLocker API Connected
              </span>
            </div>

            {bridgedDocMsg && (
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{bridgedDocMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {digiLockerDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">
                        DigiLocker Verified
                      </span>
                      <span className="text-[10px] text-slate-500">{doc.date}</span>
                    </div>
                    <h4 className="text-xs font-bold text-white leading-snug">{doc.name}</h4>
                    <p className="text-[11px] text-slate-400">{doc.issuer}</p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-900">
                    <div className="text-[10px] font-mono text-slate-500 truncate">
                      Ref: {doc.id}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={doc.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold text-center transition-colors"
                      >
                        View Proof
                      </a>
                      <button
                        type="button"
                        onClick={() => handleBridgeDigiLockerDoc(doc)}
                        className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                      >
                        Bridge
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal: Upload Achievement */}
        {showAchModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full glass-panel rounded-3xl p-6 space-y-4 border border-purple-500/40 bg-slate-950 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Award className="w-4 h-4 text-purple-400" />
                  <span>Upload Industry Certification / Skill</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAchModal(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  ✕ Close
                </button>
              </div>

              {achSuccessMsg ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-3">
                  <p>{achSuccessMsg}</p>
                  <button
                    type="button"
                    onClick={() => setShowAchModal(false)}
                    className="w-full py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-500"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitAchievement} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Certification / Award Title
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter Certification / Award Title"
                      value={achTitle}
                      onChange={(e) => setAchTitle(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Issuing Organization
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter Issuing Organization or Platform"
                      value={achIssuer}
                      onChange={(e) => setAchIssuer(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Category
                    </label>
                    <select
                      value={achCategory}
                      onChange={(e) => setAchCategory(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500"
                    >
                      <option value="Certification">Industry Certification</option>
                      <option value="Hackathon">Hackathon & Competition</option>
                      <option value="Research">Research Publication</option>
                      <option value="Internship">Internship Experience</option>
                      <option value="Skill Badge">Technical Skill Badge</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Certificate File (PDF / Image)
                    </label>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      required
                      onChange={handleAchFileChange}
                      className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
                    />
                  </div>

                  {achHash && (
                    <div className="text-[10px] font-mono text-purple-300 truncate">
                      SHA-256: {achHash}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmittingAchievement}
                    className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-purple-600/25 mt-2"
                  >
                    {isSubmittingAchievement ? "Uploading to IPFS & Ledger..." : "Submit for University Legal Review"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* In-Browser Decryption Modal */}
        {decryptModalCred && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full glass-panel rounded-3xl p-6 space-y-4 border border-indigo-500/40 bg-slate-950 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Key className="w-4 h-4 text-indigo-400" />
                  <span>Decrypt Document #{decryptModalCred.credentialId}</span>
                </div>
                <button
                  onClick={() => setDecryptModalCred(null)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  ✕ Close
                </button>
              </div>

              <form onSubmit={handleDecryptDocument} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Decryption Key (format: <code>keyHex:ivHex</code>)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter key:iv string"
                    value={decryptionKeyInput}
                    onChange={(e) => setDecryptionKeyInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-indigo-500"
                  />
                </div>

                {decryptionError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {decryptionError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isDecrypting}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{isDecrypting ? "Decrypting..." : "Decrypt Document"}</span>
                </button>
              </form>

              {decryptedFileUrl && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    Decrypted Successfully!
                  </div>
                  <a
                    href={decryptedFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download / Open Decrypted Document
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
