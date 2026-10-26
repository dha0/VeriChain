"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Search,
  FileCheck,
  Building2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Hash,
  Upload,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
  FileText,
} from "lucide-react";

interface VerificationResult {
  valid: boolean;
  collegeName: string;
  collegeCode: string;
  date: string;
  status: "active" | "superseded" | "revoked";
  version: number;
  documentType: string;
}

export default function VerifyPage() {
  const [activeTab, setActiveTab] = useState<"hash" | "credentialId" | "file">("hash");
  const [hashInput, setHashInput] = useState("");
  const [credIdInput, setCredIdInput] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);

  // Auto-verify if URL parameters are provided (e.g. from QR code scan: /verify?hash=0x...)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlHash = params.get("hash");
      const urlCredId = params.get("credentialId");

      if (urlHash) {
        setHashInput(urlHash);
        setActiveTab("hash");
        executeVerification({ hash: urlHash });
      } else if (urlCredId) {
        setCredIdInput(urlCredId);
        setActiveTab("credentialId");
        executeVerification({ credentialId: urlCredId });
      }
    }
  }, []);

  const executeVerification = async (payload: { credentialId?: string; hash?: string; file?: File }) => {
    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      let res: Response;

      if (payload.file) {
        const formData = new FormData();
        formData.append("file", payload.file);
        res = await fetch("/api/verify/public", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/verify/public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credentialId: payload.credentialId,
            hash: payload.hash,
          }),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "No record found");
        return;
      }

      setResult(data as VerificationResult);
    } catch (err: any) {
      setError("No record found");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === "hash") {
      if (!hashInput.trim()) return;
      executeVerification({ hash: hashInput.trim() });
    } else if (activeTab === "credentialId") {
      if (!credIdInput.trim()) return;
      executeVerification({ credentialId: credIdInput.trim() });
    } else if (activeTab === "file") {
      if (!uploadedFile) return;
      executeVerification({ file: uploadedFile });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16 px-4">
      {/* Header */}
      <div className="text-center space-y-3 pt-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-sky-400" />
          Public Decentralized Ledger Verification
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Verify Academic Credentials & Certificates
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto">
          Instant on-chain verification powered by Ethereum smart contracts. Query official report hashes, credential IDs, or upload a certificate file for cryptographic tamper detection.
        </p>
      </div>

      {/* Query Card */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6 border border-sky-500/20 bg-slate-900/60 shadow-2xl">
        {/* Toggle Query Mode */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4">
          <button
            type="button"
            onClick={() => {
              setActiveTab("hash");
              setError("");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "hash"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-950/70 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            <span>Report / Document Hash</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("credentialId");
              setError("");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "credentialId"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-950/70 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Credential ID</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("file");
              setError("");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "file"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-950/70 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Certificate File</span>
          </button>
        </div>

        {/* Input Form */}
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {activeTab === "hash" && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Report Keccak-256 or Certificate SHA-256 Hash
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. 0x4a9b2f8c1d3e... (found on verified PDF report or QR code)"
                  value={hashInput}
                  onChange={(e) => setHashInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Enter the 32-byte cryptographic hash printed on the official academic report or certificate.
              </p>
            </div>
          )}

          {activeTab === "credentialId" && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                On-Chain Credential ID
              </label>
              <input
                type="number"
                min="1"
                required
                placeholder="e.g. 1, 2, 3..."
                value={credIdInput}
                onChange={(e) => setCredIdInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Enter the unique integer identifier assigned during on-chain institutional minting.
              </p>
            </div>
          )}

          {activeTab === "file" && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Upload Original Document / Certificate (PDF, PNG, JPG)
              </label>
              <div className="p-6 border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-2xl bg-slate-950/70 text-center transition-all cursor-pointer">
                <input
                  type="file"
                  id="public-verify-file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadedFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <label htmlFor="public-verify-file" className="cursor-pointer space-y-2 block">
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mx-auto">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-xs text-slate-300 font-medium">
                    {uploadedFile ? (
                      <span className="text-sky-300 font-bold">{uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)</span>
                    ) : (
                      <>
                        <span className="text-sky-400 font-semibold">Click to browse</span> or drag and drop file here
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">Max size 5 MB. Server computes SHA-256 fingerprint in-memory.</p>
                </label>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-lg shadow-sky-600/25 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Querying Ethereum Consensus State...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Verify Ledger Authenticity
              </>
            )}
          </button>
        </form>

        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
            <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <div>
              <span className="font-bold">Verification Result: </span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Verification Success Result Card */}
        {result && (
          <div className="p-6 rounded-2xl bg-slate-950/90 border border-emerald-500/30 space-y-5 shadow-xl animate-in fade-in duration-200">
            {/* Top Validity Badge */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{result.valid ? "Cryptographically Valid Academic Record" : "Invalid / Revoked Record"}</span>
                  </h3>
                  <p className="text-xs text-slate-400">Anchored to Ethereum Smart Contract Ledger</p>
                </div>
              </div>

              <div>
                {result.status === "active" ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Active Ledger Record
                  </span>
                ) : result.status === "superseded" ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                    Superseded by Newer Version
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                    Revoked / Inactive
                  </span>
                )}
              </div>
            </div>

            {/* Verification Metadata Grid (ZERO Personal Data Leaked) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 flex items-center gap-1.5 text-[11px] font-semibold uppercase">
                  <Building2 className="w-3.5 h-3.5 text-sky-400" />
                  Issuing / Reviewing Institution
                </span>
                <p className="font-bold text-white text-sm">{result.collegeName}</p>
                <p className="text-slate-400 font-mono text-[11px]">Code: {result.collegeCode}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 flex items-center gap-1.5 text-[11px] font-semibold uppercase">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Document Type
                </span>
                <p className="font-bold text-white text-sm">{result.documentType}</p>
                <p className="text-slate-400 text-[11px]">Official Credential Record</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 flex items-center gap-1.5 text-[11px] font-semibold uppercase">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Document Version
                </span>
                <p className="font-bold text-white text-sm">Version {result.version}</p>
                <p className="text-slate-400 text-[11px]">
                  {result.status === "active" ? "Current official active version" : "Historical archived snapshot"}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 flex items-center gap-1.5 text-[11px] font-semibold uppercase">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  Ledger Commitment Date
                </span>
                <p className="font-bold text-white text-sm">
                  {new Date(result.date).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <p className="text-slate-400 font-mono text-[11px]">
                  {new Date(result.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>

            {/* Privacy Compliance Banner */}
            <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-900/40 text-[11px] text-sky-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-sky-400" />
              <span>
                <strong>Zero Personal Data Guarantee:</strong> Compliant with GDPR Article 17 (&quot;Right to be Forgotten&quot;). No candidate names, marks, grades, emails, or wallet keys are accessible via this public endpoint.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
