"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Briefcase,
  GraduationCap,
  ArrowRight,
  AlertCircle,
  Lock,
  ShieldCheck,
  Radio,
  Sparkles,
  KeyRound,
  Send,
  CheckCircle2,
  X,
  FileQuestion,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  parseBlockchainError,
  switchToHardhatLocal,
  switchToSepolia,
} from "@/lib/ethereum";
import { SUPPORTED_CHAIN_ID, SUPPORTED_NETWORK_NAME } from "@/contracts/contractAddress";
import {
  UniversityBanner,
  CompanyBanner,
  StudentBanner,
  BackgroundWatermark,
} from "@/components/PortalIllustrations";

type PortalType = "university" | "company" | "student";

export default function LoginPage() {
  const router = useRouter();
  const {
    role,
    studentUSN,
    isAuthenticated,
    loginUniversityWithCode,
    loginCompanyWithCode,
    loginUniversityWithWallet,
    loginCompanyWithWallet,
    loginWithUSN,
    logout,
  } = useAuth();

  // Active portal controls the background ambient lighting, watermarks, and highlights
  const [activePortal, setActivePortal] = useState<PortalType>("university");

  // University Form State
  const [univCode, setUnivCode] = useState("");
  const [univSecret, setUnivSecret] = useState("");

  // Company Form State
  const [compCode, setCompCode] = useState("");
  const [compSecret, setCompSecret] = useState("");

  // Student Form State
  const [studentInput, setStudentInput] = useState("");

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Request Access Modal State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestEntityType, setRequestEntityType] = useState<"university" | "company">("university");
  const [reqName, setReqName] = useState("");
  const [reqCode, setReqCode] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);
  const [reqSuccessMessage, setReqSuccessMessage] = useState("");

  const handleUnivCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!univCode.trim() && !univSecret.trim()) return;
    setIsLoggingIn(true);
    setErrorMessage("");
    try {
      await loginUniversityWithCode(univCode, univSecret);
      router.push("/university");
    } catch (err: any) {
      setErrorMessage(err.message || parseBlockchainError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleUnivWalletSubmit = async () => {
    setIsLoggingIn(true);
    setErrorMessage("");
    try {
      await loginUniversityWithWallet();
      router.push("/university");
    } catch (err: any) {
      setErrorMessage(err.message || parseBlockchainError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCompCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compCode.trim() && !compSecret.trim()) return;
    setIsLoggingIn(true);
    setErrorMessage("");
    try {
      await loginCompanyWithCode(compCode, compSecret);
      router.push("/company");
    } catch (err: any) {
      setErrorMessage(err.message || parseBlockchainError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCompWalletSubmit = async () => {
    setIsLoggingIn(true);
    setErrorMessage("");
    try {
      await loginCompanyWithWallet();
      router.push("/company");
    } catch (err: any) {
      setErrorMessage(err.message || parseBlockchainError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentInput.trim()) return;
    setIsLoggingIn(true);
    setErrorMessage("");
    try {
      await loginWithUSN(studentInput);
      router.push("/student");
    } catch (err: any) {
      setErrorMessage(parseBlockchainError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingReq(true);
    setReqSuccessMessage("");
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          requestData: {
            entityType: requestEntityType,
            name: reqName.trim(),
            proposedCode: reqCode.trim().toUpperCase(),
            contactEmail: reqEmail.trim(),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit request");

      setReqSuccessMessage(
        `Access request submitted successfully for ${reqName}! The platform Administrator will review and register your institutional code on the Ethereum blockchain.`
      );
      setReqName("");
      setReqCode("");
      setReqEmail("");
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmittingReq(false);
    }
  };

  // Dynamic ambient background styles based on active portal
  const getAmbientBgClasses = () => {
    switch (activePortal) {
      case "university":
        return "from-blue-600/15 via-sky-600/5 to-transparent";
      case "company":
        return "from-emerald-600/15 via-teal-600/5 to-transparent";
      case "student":
        return "from-purple-600/15 via-indigo-600/5 to-transparent";
    }
  };

  const getPillThemeClasses = () => {
    switch (activePortal) {
      case "university":
        return "border-sky-500/40 text-sky-600 dark:text-sky-300 bg-sky-500/10 shadow-[0_0_15px_rgba(56,189,248,0.2)]";
      case "company":
        return "border-emerald-500/40 text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)]";
      case "student":
        return "border-purple-500/40 text-purple-600 dark:text-purple-300 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.2)]";
    }
  };

  return (
    <div className="relative min-h-[85vh] -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-8 overflow-hidden transition-colors duration-700">
      {/* 1. Dynamic Smooth Transition Ambient Background Glows */}
      <div
        className={`absolute inset-0 bg-gradient-to-b ${getAmbientBgClasses()} transition-all duration-700 ease-in-out pointer-events-none`}
      />
      <div
        className={`absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] blur-[120px] rounded-full pointer-events-none transition-all duration-700 ease-in-out ${
          activePortal === "university"
            ? "bg-blue-600/25 dark:bg-blue-500/20"
            : activePortal === "company"
            ? "bg-emerald-600/25 dark:bg-emerald-500/20"
            : "bg-purple-600/25 dark:bg-purple-500/20"
        }`}
      />

      {/* 2. Interactive SVG Background Watermarks */}
      <BackgroundWatermark activePortal={activePortal} />

      {/* Main Container Content */}
      <div className="relative z-10 max-w-6xl mx-auto space-y-10">
        {/* Header */}
        <div className="text-center space-y-3.5">
          <div className="inline-flex items-center justify-center">
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider transition-all duration-500 ${getPillThemeClasses()}`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Institutional Access Gateway</span>
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight transition-colors duration-500">
            Sign In with Authorized Credentials
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto leading-relaxed transition-colors duration-500">
            Access your dedicated verification portal. All educational institutions and corporate employers are strictly registered and governed on-chain by the Administrator.
          </p>

          {/* Quick interactive switcher tabs */}
          <div className="inline-flex items-center gap-1.5 p-1 rounded-full bg-slate-200/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-800 backdrop-blur-md shadow-sm transition-all duration-500">
            <button
              type="button"
              onClick={() => setActivePortal("university")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 flex items-center gap-1.5 ${
                activePortal === "university"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>University</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePortal("company")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 flex items-center gap-1.5 ${
                activePortal === "company"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Recruiter</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePortal("student")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 flex items-center gap-1.5 ${
                activePortal === "student"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Student</span>
            </button>
          </div>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="max-w-md mx-auto p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs space-y-2 shadow-lg">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>

            {(errorMessage.includes("Network Mismatch") || errorMessage.includes("unsupported network")) && (
              <button
                type="button"
                onClick={async () => {
                  if (SUPPORTED_CHAIN_ID === 11155111) {
                    await switchToSepolia();
                  } else {
                    await switchToHardhatLocal();
                  }
                  setErrorMessage("");
                }}
                className="w-full mt-2 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-blue-600/20"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Switch Network to {SUPPORTED_NETWORK_NAME} ({SUPPORTED_CHAIN_ID})</span>
              </button>
            )}
          </div>
        )}

        {/* Active Session Notice */}
        {isAuthenticated && (
          <div className="max-w-2xl mx-auto p-4 rounded-2xl bg-white/90 dark:bg-indigo-950/40 border border-indigo-400/30 dark:border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold uppercase">
                {role.slice(0, 2)}
              </div>
              <div className="text-left">
                <span className="text-xs text-indigo-600 dark:text-indigo-300 block font-semibold">Active Session Detected</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white uppercase">
                  Logged in as <span className="text-indigo-600 dark:text-indigo-400">{role}</span>{" "}
                  {studentUSN && <span className="text-slate-500 dark:text-slate-400 font-mono">({studentUSN})</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={
                  role === "admin"
                    ? "/admin"
                    : role === "university"
                    ? "/university"
                    : role === "company"
                    ? "/company"
                    : "/student"
                }
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/25"
              >
                <span>Enter Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={logout}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-400 hover:text-rose-600 dark:hover:text-white text-xs font-medium border border-slate-300 dark:border-slate-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* 3 Dedicated Portal Access Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {/* Card 1: University Authority Portal (Code Only) */}
          <div
            onMouseEnter={() => setActivePortal("university")}
            className={`group rounded-3xl p-5 sm:p-6 transition-all duration-500 flex flex-col justify-between backdrop-blur-xl relative overflow-hidden ${
              activePortal === "university"
                ? "bg-white/95 dark:bg-slate-900/90 border-2 border-sky-500 shadow-2xl shadow-sky-500/20 scale-[1.02] -translate-y-1"
                : "bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-sky-500/50 shadow-lg"
            }`}
          >
            <div className="space-y-4">
              <UniversityBanner isHovered={activePortal === "university"} />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono tracking-wider uppercase text-slate-500 dark:text-slate-400 font-bold">
                  Accredited Institutions
                </span>
                <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 font-bold">
                  Issuer Authority
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">University Portal</h2>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  For accredited educational institutions to issue tamper-proof academic credentials and upload student records individually or via CSV.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <form onSubmit={handleUnivCodeSubmit} className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      University Identifier
                    </label>
                    <input
                      type="text"
                      value={univCode}
                      onChange={(e) => setUnivCode(e.target.value)}
                      placeholder="e.g. VTU-KA-001"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white uppercase font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Secret Access Passkey
                    </label>
                    <input
                      type="password"
                      value={univSecret}
                      onChange={(e) => setUnivSecret(e.target.value)}
                      placeholder="e.g. VTU-PASS-2026 or secret passkey"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white py-2.5 px-4 rounded-xl text-xs font-semibold transition-all shadow-md shadow-sky-600/25 flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign In with Authority Code</span>
                  </button>
                </form>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                  <span className="flex-shrink mx-2 text-[10px] text-slate-400 uppercase font-mono">or Web3 SIWE</span>
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                </div>

                <button
                  type="button"
                  onClick={handleUnivWalletSubmit}
                  disabled={isLoggingIn}
                  className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-2"
                >
                  <Wallet className="w-4 h-4 text-sky-500" />
                  <span>Sign In with MetaMask (SIWE)</span>
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setRequestEntityType("university");
                      setShowRequestModal(true);
                      setReqSuccessMessage("");
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 hover:underline font-semibold"
                  >
                    <FileQuestion className="w-3.5 h-3.5" />
                    <span>First time? Request Code from Admin</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Company Recruiter Portal */}
          <div
            onMouseEnter={() => setActivePortal("company")}
            className={`group rounded-3xl p-5 sm:p-6 transition-all duration-500 flex flex-col justify-between backdrop-blur-xl relative overflow-hidden ${
              activePortal === "company"
                ? "bg-white/95 dark:bg-slate-900/90 border-2 border-emerald-500 shadow-2xl shadow-emerald-500/20 scale-[1.02] -translate-y-1"
                : "bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 shadow-lg"
            }`}
          >
            <div className="space-y-4">
              <CompanyBanner isHovered={activePortal === "company"} />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono tracking-wider uppercase text-slate-500 dark:text-slate-400 font-bold">
                  IT Hiring Partners
                </span>
                <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold">
                  Hiring Partner
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Company Recruiter</h2>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  For IT employers to perform instant candidate background audits, analyze skill charts, and conduct tamper verification.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <form onSubmit={handleCompCodeSubmit} className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Corporate Identifier
                    </label>
                    <input
                      type="text"
                      value={compCode}
                      onChange={(e) => setCompCode(e.target.value)}
                      placeholder="e.g. INFY-BLR-01"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white uppercase font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Secret Access Passkey
                    </label>
                    <input
                      type="password"
                      value={compSecret}
                      onChange={(e) => setCompSecret(e.target.value)}
                      placeholder="e.g. INFY-PASS-2026 or secret passkey"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2.5 px-4 rounded-xl text-xs font-semibold transition-all shadow-md shadow-emerald-600/25 flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign In with Corporate Code</span>
                  </button>
                </form>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                  <span className="flex-shrink mx-2 text-[10px] text-slate-400 uppercase font-mono">or Web3 SIWE</span>
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                </div>

                <button
                  type="button"
                  onClick={handleCompWalletSubmit}
                  disabled={isLoggingIn}
                  className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-2"
                >
                  <Wallet className="w-4 h-4 text-emerald-500" />
                  <span>Sign In with MetaMask (SIWE)</span>
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setRequestEntityType("company");
                      setShowRequestModal(true);
                      setReqSuccessMessage("");
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                  >
                    <FileQuestion className="w-3.5 h-3.5" />
                    <span>First time? Request Code from Admin</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Student Digital Locker */}
          <div
            onMouseEnter={() => setActivePortal("student")}
            className={`group rounded-3xl p-5 sm:p-6 transition-all duration-500 flex flex-col justify-between backdrop-blur-xl relative overflow-hidden ${
              activePortal === "student"
                ? "bg-white/95 dark:bg-slate-900/90 border-2 border-purple-500 shadow-2xl shadow-purple-500/20 scale-[1.02] -translate-y-1"
                : "bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-purple-500/50 shadow-lg"
            }`}
          >
            <div className="space-y-4">
              <StudentBanner isHovered={activePortal === "student"} />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono tracking-wider uppercase text-slate-500 dark:text-slate-400 font-bold">
                  Verified Candidates
                </span>
                <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-bold">
                  Candidate Locker
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Student Digital Locker</h2>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  View your verified academic proof, non-deletable records, upload extra-curricular achievements for university legal review, and access DigiLocker.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <form onSubmit={handleStudentSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      University Seat Number (USN)
                    </label>
                    <input
                      type="text"
                      required
                      value={studentInput}
                      onChange={(e) => setStudentInput(e.target.value)}
                      placeholder="Enter University Seat Number (USN)"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white uppercase font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-all shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2"
                  >
                    <span>View Digital Locker</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Request Institutional Code from Admin */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl p-6 space-y-4 border border-slate-700 bg-slate-950 shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <KeyRound className="w-4 h-4 text-sky-400" />
                <span>Request Official Institutional Code</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              If this is your first time signing in, submit your organization details below. The platform Administrator will review and register your official code permanently on the Ethereum blockchain ledger.
            </p>

            {reqSuccessMessage ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{reqSuccessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="w-full py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-500 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleRequestSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Organization Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRequestEntityType("university")}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                        requestEntityType === "university"
                          ? "bg-sky-600 border-sky-500 text-white"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>University</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestEntityType("company")}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                        requestEntityType === "company"
                          ? "bg-emerald-600 border-emerald-500 text-white"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Briefcase className="w-3.5 h-3.5" />
                      <span>Company</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    {requestEntityType === "university" ? "University / College Name" : "Company / Enterprise Name"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      requestEntityType === "university"
                        ? "Enter University / College Name"
                        : "Enter Company / Enterprise Name"
                    }
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Proposed Institutional Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter Proposed Institutional Code"
                    value={reqCode}
                    onChange={(e) => setReqCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Official Contact Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Enter Official Contact Email"
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReq}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-1.5 mt-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingReq ? "Submitting Request..." : "Submit Access Request to Admin"}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
