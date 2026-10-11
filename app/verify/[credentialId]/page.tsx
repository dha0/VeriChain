"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Building2,
  GraduationCap,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Hash,
  ExternalLink,
  Upload,
  Calendar,
  Award,
  ArrowLeft,
  Printer,
  Copy,
  Check,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { getContractReadOnly, isMetaMaskInstalled } from "@/lib/ethereum";
import { computeSHA256 } from "@/lib/crypto";
import { getIPFSUrl } from "@/lib/pinata";
import { StatusBadge } from "@/components/StatusBadge";
import { CredentialStatus } from "@/types";

export default function DynamicVerifyPage() {
  const params = useParams();
  const rawId = params?.credentialId;
  const credentialId = Number(rawId);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<{
    credential: any;
    student: any;
    university: any;
  } | null>(null);

  // Document Tamper Verification
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedHash, setUploadedHash] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchRecord = async () => {
    if (isNaN(credentialId) || credentialId <= 0) {
      setError("Invalid credential ID specified in URL.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const contract = getContractReadOnly();

      // 1. Fetch Credential
      const c = await contract.getCredential(credentialId);
      if (!c.exists) {
        throw new Error(`Credential #${credentialId} does not exist on blockchain.`);
      }

      const studentId = Number(c.studentId);
      const universityId = Number(c.universityId);

      // 2. Fetch Student
      let studentObj: any = null;
      try {
        const s = await contract.students(studentId);
        studentObj = {
          id: Number(s.id),
          usn: s.usn,
          name: s.name,
          course: s.course,
          graduationYear: Number(s.graduationYear),
          percentage: Number(s.percentage),
        };
      } catch (e) {
        studentObj = { id: studentId, usn: "Unknown", name: "Student #" + studentId };
      }

      // 3. Fetch University
      const u = await contract.getUniversity(universityId);
      const universityObj = {
        id: Number(u.id),
        name: u.name,
        code: u.universityCode,
        wallet: u.wallet,
        active: u.active,
      };

      setData({
        credential: {
          credentialId: Number(c.credentialId),
          studentId,
          universityId,
          documentType: c.documentType || "Degree Certificate",
          documentHash: c.documentHash,
          ipfsCID: c.ipfsCID,
          issuedAt: Number(c.issuedAt),
          version: Number(c.version),
          status: Number(c.status),
          exists: c.exists,
        },
        student: studentObj,
        university: universityObj,
      });
    } catch (err: any) {
      setError(err.reason || err.message || "Failed to load credential from blockchain.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecord();
  }, [credentialId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      try {
        const hash = await computeSHA256(file);
        setUploadedHash(hash);
      } catch (err: any) {
        alert("Hash computation failed: " + err.message);
      }
    }
  };

  const copyUrl = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center space-y-4">
        <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mx-auto" />
        <h2 className="text-xl font-bold text-white">Querying Ethereum Ledger...</h2>
        <p className="text-xs text-slate-400">
          Verifying cryptographic hash and smart contract state for Credential #{credentialId}
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
          <XCircle className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Verification Error</h2>
          <p className="text-sm text-slate-400">{error || "Record could not be retrieved."}</p>
        </div>
        <div className="flex justify-center gap-3">
          <Link
            href="/verify"
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Verification Portal
          </Link>
          <button
            onClick={fetchRecord}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Query
          </button>
        </div>
      </div>
    );
  }

  const { credential, student, university } = data;
  const isHashMatched = uploadedHash
    ? credential.documentHash.toLowerCase() === uploadedHash.toLowerCase()
    : null;
  const isAuthentic =
    credential.status === CredentialStatus.Active &&
    university.active &&
    (isHashMatched === null || isHashMatched === true);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Navigation bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/verify"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Search
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={copyUrl}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 border border-slate-700"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedLink ? "Link Copied!" : "Share Link"}
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 border border-slate-700"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Certificate
          </button>
        </div>
      </div>

      {/* Primary Verification Result Banner */}
      <div
        className={`p-6 sm:p-8 rounded-3xl border shadow-2xl relative overflow-hidden ${
          isAuthentic
            ? "bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border-emerald-500/40 shadow-emerald-950/40"
            : "bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 border-rose-500/40 shadow-rose-950/40"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${
                isAuthentic
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              }`}
            >
              {isAuthentic ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white">
                  {isAuthentic ? "Authentic Academic Credential" : "Credential Verification Failed"}
                </h1>
                <StatusBadge status={credential.status} />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Verified against Ethereum Sepolia Smart Contract for Credential ID #{credential.credentialId} (Category: {credential.documentType})
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Issuance Date</span>
            <span className="text-xs font-semibold text-slate-200">
              {new Date(credential.issuedAt * 1000).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* OFFICIAL ASCII / BORDER VERIFICATION CERTIFICATE RECEIPT */}
      <div className="p-6 rounded-3xl bg-black/90 border border-slate-800 text-xs font-mono space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 font-sans">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase">
            <Terminal className="w-4 h-4" />
            <span>Official Recruiter Cryptographic Verification Certificate</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Immutable Hash Anchor</span>
        </div>

        <div className="overflow-x-auto whitespace-pre leading-relaxed text-slate-300 p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px]">
{`╔═══════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                             BLOCKCHAIN CREDENTIAL VERIFICATION RECEIPT                                ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════════════╣
  Credential Identifier:   #${credential.credentialId} (Version ${credential.version}.0)
  Document Category:       ${credential.documentType}
  Student Candidate:       ${student.name} [USN: ${student.usn}]
  Issuing Institution:     ${university.name} (${university.code}) [Active: ${university.active ? "YES" : "NO"}]
  Issuing Ledger Wallet:   ${university.wallet}
─────────────────────────────────────────────────────────────────────────────────────────────────────────
  CRYPTOGRAPHIC PROOF:
  On-Chain Digest SHA-256: ${credential.documentHash}
  Decentralized IPFS CID:  ${credential.ipfsCID}
  Issuance Timestamp:      ${new Date(credential.issuedAt * 1000).toISOString()}
  Status On Blockchain:    ${credential.status === 0 ? "ACTIVE (VALID)" : credential.status === 2 ? "SUSPENDED" : "REVOKED"}
╠═══════════════════════════════════════════════════════════════════════════════════════════════════════╣
║ VERIFICATION OUTCOME:    ${isAuthentic ? "VERIFIED AUTHENTIC - BITSTREAM SECURED ON ETHEREUM" : "UNVERIFIED / REVOKED / SUSPENDED"}
╚═══════════════════════════════════════════════════════════════════════════════════════════════════════╝`}
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Student Academic Identity */}
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
              <GraduationCap className="w-4 h-4" />
              Student Academic Profile
            </div>
            <span className="text-[11px] font-mono text-slate-500">Student ID #{student.id}</span>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Full Name</span>
              <span className="text-base font-bold text-white">{student.name}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">USN / Roll No</span>
                <span className="text-sm font-mono font-bold text-indigo-300">{student.usn}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Graduation Year</span>
                <span className="text-sm font-semibold text-white">{student.graduationYear}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Degree / Course</span>
                <span className="text-xs font-semibold text-slate-200">{student.course}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Aggregate Marks</span>
                <span className="text-base font-extrabold text-emerald-400">{student.percentage}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Issuing University Authority */}
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
              <Building2 className="w-4 h-4" />
              Issuing University Authority
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                university.active
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              }`}
            >
              {university.active ? "Accredited" : "Inactive"}
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Institution Name</span>
              <span className="text-base font-bold text-white">{university.name}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">University Code</span>
                <span className="text-sm font-mono font-bold text-sky-300">{university.code}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">University ID</span>
                <span className="text-sm font-mono font-bold text-slate-200">#{university.id}</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Signer Wallet Address</span>
              <span className="text-[11px] font-mono text-slate-400 break-all">{university.wallet}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cryptographic Proof & IPFS Storage */}
      <div className="glass-panel rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
            <Hash className="w-4 h-4" />
            Immutable Blockchain Ledger Record
          </div>
          <span className="text-xs text-slate-400">Version {credential.version}.0</span>
        </div>

        <div className="space-y-4">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
              On-Chain Cryptographic Digest (SHA-256 / bytes32)
            </span>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 font-mono text-xs text-purple-300 break-all flex items-center justify-between gap-3">
              <span>{credential.documentHash}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(credential.documentHash)}
                className="text-slate-500 hover:text-slate-300 shrink-0"
                title="Copy SHA-256 Hash"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
              Decentralized IPFS Storage Content Identifier (CID)
            </span>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 font-mono text-xs text-cyan-300 break-all flex-1">
                {credential.ipfsCID}
              </div>
              <a
                href={getIPFSUrl(credential.ipfsCID)}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-3 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-2 border border-cyan-500/30 shrink-0 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View Document on IPFS
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Recruiter Document Tamper Verifier (Mode 2) */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm border-b border-slate-800 pb-3">
          <FileCheck className="w-4 h-4" />
          Candidate Document Cryptographic Tamper Test (Mode 2)
        </div>
        <p className="text-xs text-slate-400">
          Did the applicant supply a physical or digital PDF document? Upload it here to compute its SHA-256 fingerprint in your browser and verify it against the immutable hash registered on Ethereum.
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white cursor-pointer transition-colors shrink-0">
            <Upload className="w-4 h-4 text-slate-400" />
            <span>{uploadedFile ? "Change File" : "Select Candidate PDF / Image"}</span>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          <div className="text-xs text-slate-400 truncate">
            {uploadedFile ? (
              <span className="text-emerald-400 font-semibold">{uploadedFile.name}</span>
            ) : (
              "No local document selected yet"
            )}
          </div>
        </div>

        {uploadedHash && (
          <div className="space-y-3 pt-2">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Candidate File SHA-256</span>
              <p className="font-mono text-xs text-slate-300 break-all">{uploadedHash}</p>
            </div>

            {isHashMatched ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-bold">Cryptographic Integrity Confirmed (0% Tampering)</p>
                  <p className="text-[11px] text-emerald-300">
                    The uploaded document bitstream matches the exact SHA-256 hash registered by {university.name}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-bold">FRAUD WARNING: Cryptographic Hash Mismatch Detected!</p>
                  <p className="text-[11px] text-rose-300">
                    The uploaded document has been modified or edited after university issuance. Do not accept this document.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
