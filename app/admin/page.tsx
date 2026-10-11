"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Shield,
  Building2,
  Briefcase,
  UserPlus,
  Power,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Clock,
  Terminal,
  Inbox,
  Check,
  X,
  Trash2,
  Send,
  Sparkles,
  Layers,
  FileCheck,
} from "lucide-react";
import {
  getContractReadOnly,
  getContractWithSigner,
  isMetaMaskInstalled,
} from "@/lib/ethereum";
import { University, Company, SystemCounters, VerificationRecord, AccessRequest } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { RoleGuard } from "@/components/RoleGuard";
import { BackgroundWatermark, AdminBackgroundWatermark } from "@/components/PortalIllustrations";

type AdminTab = "requests" | "universities" | "companies" | "audit";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("requests");

  const [counters, setCounters] = useState<SystemCounters>({
    totalUniversities: 0,
    totalStudents: 0,
    totalCredentials: 0,
    totalCompanies: 0,
    totalVerifications: 0,
  });
  const [universities, setUniversities] = useState<University[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentAccount, setCurrentAccount] = useState("");
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const [uName, setUName] = useState("");
  const [uCode, setUCode] = useState("");
  const [uWallet, setUWallet] = useState("");

  const [cName, setCCName] = useState("");
  const [cCode, setCCode] = useState("");
  const [cWallet, setCWallet] = useState("");

  const ZERO_WALLET = "0x0000000000000000000000000000000000000000";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      if (!isMetaMaskInstalled()) return;

      const contract = getContractReadOnly();
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts.length > 0) {
        setCurrentAccount(accounts[0]);
        try {
          const adminAddr = await contract.admin();
          setIsAdmin(adminAddr.toLowerCase() === accounts[0].toLowerCase());
        } catch (e) {
          setIsAdmin(true);
        }
      }

      // Load counters
      const res = await contract.getCounters();
      const totalU = Number(res.totalUniversities);
      const totalS = Number(res.totalStudents);
      const totalCred = Number(res.totalCredentials);
      const totalC = Number(res.totalCompanies);
      const totalV = Number(res.totalVerifications);

      setCounters({
        totalUniversities: totalU,
        totalStudents: totalS,
        totalCredentials: totalCred,
        totalCompanies: totalC,
        totalVerifications: totalV,
      });

      // Load Universities list
      const uList: University[] = [];
      for (let i = 1; i <= totalU; i++) {
        try {
          const u = await contract.getUniversity(i);
          uList.push({
            id: Number(u.id),
            name: u.name,
            universityCode: u.universityCode,
            wallet: u.wallet,
            active: u.active,
          });
        } catch (e) {}
      }
      setUniversities(uList);

      // Load Companies list
      const cList: Company[] = [];
      for (let i = 1; i <= totalC; i++) {
        try {
          const c = await contract.getCompany(i);
          cList.push({
            id: Number(c.id),
            name: c.name,
            companyCode: c.companyCode,
            wallet: c.wallet,
            active: c.active,
          });
        } catch (e) {}
      }
      setCompanies(cList);

      // Load System-Wide Verification History (recent 25)
      const vList: VerificationRecord[] = [];
      for (let i = totalV; i >= Math.max(1, totalV - 25); i--) {
        try {
          const v = await contract.getVerification(i);
          vList.push({
            verificationId: Number(v.verificationId),
            credentialId: Number(v.credentialId),
            companyId: Number(v.companyId),
            documentType: v.documentType || "Academic Document",
            hashMatched: v.hashMatched,
            verified: v.verified,
            timestamp: Number(v.timestamp),
          });
        } catch (e) {}
      }
      setVerifications(vList);

      // Load Institutional Access Requests from API
      try {
        const reqRes = await fetch("/api/requests");
        const reqData = await reqRes.json();
        if (reqData.requests) {
          setAccessRequests(reqData.requests);
        }
      } catch (err) {
        console.error("Failed to load access requests", err);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Approve Request On-Chain
  const handleApproveRequest = async (req: AccessRequest) => {
    setProcessingRequestId(req.requestId);
    setStatusMessage(null);
    try {
      const contract = await getContractWithSigner();
      const targetWallet =
        req.wallet && req.wallet !== "0x0000000000000000000000000000000000000000"
          ? req.wallet
          : req.entityType === "university"
          ? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
          : "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

      setStatusMessage({
        text: `Transacting on Ethereum: Registering ${req.name} (${req.proposedCode})...`,
        type: "info",
      });

      if (req.entityType === "university") {
        const tx = await contract.registerUniversity(req.name, req.proposedCode, targetWallet);
        await tx.wait();
      } else {
        const tx = await contract.registerCompany(req.name, req.proposedCode, targetWallet);
        await tx.wait();
      }

      // Mark approved in local state & localStorage immediately
      setAccessRequests((prev) =>
        prev.map((r) => (r.requestId === req.requestId ? { ...r, approved: true } : r))
      );
      try {
        const approved = JSON.parse(localStorage.getItem("admin_approved_requests") || "[]");
        if (!approved.includes(req.requestId)) {
          localStorage.setItem("admin_approved_requests", JSON.stringify([...approved, req.requestId]));
        }
      } catch (e) {}

      // Mark approved in API
      try {
        await fetch("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve", requestId: req.requestId }),
        });
      } catch (e) {}

      setStatusMessage({
        text: `Success! ${req.name} registered on Ethereum. Code "${req.proposedCode}" is now active!`,
        type: "success",
      });

      await fetchData();
    } catch (err: any) {
      setStatusMessage({
        text: err.reason || err.message || "Failed to register entity on ledger",
        type: "error",
      });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    if (!confirm("Are you sure you want to dismiss this access request?")) return;
    try {
      setAccessRequests((prev) => prev.filter((r) => r.requestId !== requestId));
      try {
        const dismissed = JSON.parse(localStorage.getItem("admin_dismissed_requests") || "[]");
        if (!dismissed.includes(requestId)) {
          localStorage.setItem("admin_dismissed_requests", JSON.stringify([...dismissed, requestId]));
        }
      } catch (e) {}

      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", requestId }),
      });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAllRequests = async () => {
    if (!confirm("Are you sure you want to dismiss all pending access requests?")) return;
    try {
      const allPendingIds = pendingRequests.map((r) => r.requestId);
      setAccessRequests([]);
      try {
        const dismissed = JSON.parse(localStorage.getItem("admin_dismissed_requests") || "[]");
        const updated = Array.from(new Set([...dismissed, ...allPendingIds]));
        localStorage.setItem("admin_dismissed_requests", JSON.stringify(updated));
      } catch (e) {}

      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_all" }),
      });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegisterUniversity = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const contract = await getContractWithSigner();
      // Use provided wallet, or fall back to admin wallet (university must update via re-register)
      const resolvedWallet = uWallet.trim() || ZERO_WALLET;
      if (resolvedWallet === ZERO_WALLET) {
        setStatusMessage({ text: "Warning: No wallet provided — university login will require re-registration with their address.", type: "info" });
        await new Promise(r => setTimeout(r, 1500));
      }
      const tx = await contract.registerUniversity(uName, uCode, resolvedWallet);
      setStatusMessage({ text: "Submitting to Ethereum network...", type: "info" });
      await tx.wait();
      setStatusMessage({ text: `University "${uName}" accredited on blockchain! Code: ${uCode}`, type: "success" });
      setUName("");
      setUCode("");
      setUWallet("");
      await fetchData();
    } catch (err: any) {
      setStatusMessage({
        text: err.reason || err.message || "Failed to register university",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const contract = await getContractWithSigner();
      const resolvedWallet = cWallet.trim() || ZERO_WALLET;
      if (resolvedWallet === ZERO_WALLET) {
        setStatusMessage({ text: "Warning: No wallet provided — company login will require re-registration with their address.", type: "info" });
        await new Promise(r => setTimeout(r, 1500));
      }
      const tx = await contract.registerCompany(cName, cCode, resolvedWallet);
      setStatusMessage({ text: "Submitting to Ethereum network...", type: "info" });
      await tx.wait();
      setStatusMessage({ text: `Company "${cName}" authorized on blockchain! Code: ${cCode}`, type: "success" });
      setCCName("");
      setCCode("");
      setCWallet("");
      await fetchData();
    } catch (err: any) {
      setStatusMessage({
        text: err.reason || err.message || "Failed to register company",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUniversityStatus = async (id: number, currentActive: boolean) => {
    try {
      const contract = await getContractWithSigner();
      const tx = currentActive
        ? await contract.deactivateUniversity(id)
        : await contract.activateUniversity(id);
      await tx.wait();
      await fetchData();
    } catch (err: any) {
      alert(err.reason || err.message);
    }
  };

  const toggleCompanyStatus = async (id: number, currentActive: boolean) => {
    try {
      const contract = await getContractWithSigner();
      const tx = currentActive
        ? await contract.deactivateCompany(id)
        : await contract.activateCompany(id);
      await tx.wait();
      await fetchData();
    } catch (err: any) {
      alert(err.reason || err.message);
    }
  };

  const pendingRequests = useMemo(() => {
    let dismissedIds: number[] = [];
    let approvedIds: number[] = [];
    if (typeof window !== "undefined") {
      try {
        dismissedIds = JSON.parse(localStorage.getItem("admin_dismissed_requests") || "[]");
        approvedIds = JSON.parse(localStorage.getItem("admin_approved_requests") || "[]");
      } catch (e) {}
    }

    return accessRequests.filter((req) => {
      // 1. Explicitly approved or dismissed
      if (req.approved) return false;
      if (dismissedIds.includes(req.requestId)) return false;
      if (approvedIds.includes(req.requestId)) return false;

      // 2. Check if already registered on the blockchain ledger
      const targetCode = (req.proposedCode || "").trim().toUpperCase();
      const targetName = (req.name || "").trim().toLowerCase();

      if (req.entityType === "university") {
        const codeMatch = universities.some(
          (u) => (u.universityCode || "").trim().toUpperCase() === targetCode
        );
        const nameMatch = universities.some(
          (u) => (u.name || "").trim().toLowerCase() === targetName
        );
        if (codeMatch || nameMatch) return false;
      } else {
        const codeMatch = companies.some(
          (c) => (c.companyCode || "").trim().toUpperCase() === targetCode
        );
        const nameMatch = companies.some(
          (c) => (c.name || "").trim().toLowerCase() === targetName
        );
        if (codeMatch || nameMatch) return false;
      }

      return true;
    });
  }, [accessRequests, universities, companies]);

  return (
    <RoleGuard allowedRoles={["admin"]} portalName="System Admin Console">
      <div className="relative overflow-hidden rounded-3xl p-3 sm:p-6 transition-all duration-500 space-y-8
        bg-gradient-to-br from-slate-800/95 via-indigo-950/90 to-slate-900/95 dark:from-purple-950/20 dark:via-slate-950/70 dark:to-slate-950
        border border-indigo-700/40 dark:border-slate-800 shadow-2xl shadow-indigo-900/20">
        <AdminBackgroundWatermark />

        {/* Header */}
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-indigo-700/40 dark:border-purple-900/30 pb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 dark:text-purple-300 text-xs font-semibold uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5" />
              Platform Smart Contract Governance
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white dark:text-white">
              Root Administration &amp; Governance
            </h1>
            <p className="text-xs sm:text-sm text-indigo-200/80 dark:text-slate-400">
              Manage incoming access requests, accredit universities, authorize recruiters, and monitor smart contract audits.
            </p>
          </div>

          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-800/60 dark:bg-slate-900/90 border border-indigo-600/50 dark:border-purple-800/40 text-xs text-indigo-100 dark:text-purple-300 hover:text-white dark:hover:text-white transition-all shadow-sm hover:border-indigo-400 hover:bg-indigo-700/60 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Sync Ledger
          </button>
        </div>


        {/* Notifications */}
        {statusMessage && (
          <div
            className={`relative z-10 p-4 rounded-2xl text-xs flex items-center gap-2 shadow-sm ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                : statusMessage.type === "error"
                ? "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                : "bg-indigo-500/10 border border-indigo-500/30 text-indigo-200"
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

        {/* Statistics Cards */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-4 rounded-2xl text-center bg-indigo-800/50 dark:bg-slate-900/70 border border-indigo-600/40 dark:border-sky-500/20 shadow-sm backdrop-blur-md">
            <div className="text-2xl font-bold font-mono text-sky-300 dark:text-sky-400">{counters.totalUniversities}</div>
            <div className="text-[11px] text-indigo-200 dark:text-slate-400 font-medium">Total Universities</div>
          </div>
          <div className="p-4 rounded-2xl text-center bg-indigo-800/50 dark:bg-slate-900/70 border border-indigo-600/40 dark:border-emerald-500/20 shadow-sm backdrop-blur-md">
            <div className="text-2xl font-bold font-mono text-emerald-300 dark:text-emerald-400">{counters.totalCompanies}</div>
            <div className="text-[11px] text-indigo-200 dark:text-slate-400 font-medium">Total Companies</div>
          </div>
          <div className="p-4 rounded-2xl text-center bg-indigo-800/50 dark:bg-slate-900/70 border border-indigo-600/40 dark:border-indigo-500/20 shadow-sm backdrop-blur-md">
            <div className="text-2xl font-bold font-mono text-indigo-300 dark:text-indigo-400">{counters.totalStudents}</div>
            <div className="text-[11px] text-indigo-200 dark:text-slate-400 font-medium">Total Students</div>
          </div>
          <div className="p-4 rounded-2xl text-center bg-indigo-800/50 dark:bg-slate-900/70 border border-indigo-600/40 dark:border-cyan-500/20 shadow-sm backdrop-blur-md">
            <div className="text-2xl font-bold font-mono text-cyan-300 dark:text-cyan-400">{counters.totalCredentials}</div>
            <div className="text-[11px] text-indigo-200 dark:text-slate-400 font-medium">Credentials Issued</div>
          </div>
          <div className="p-4 rounded-2xl text-center bg-amber-900/40 dark:bg-slate-900/70 border border-amber-600/40 dark:border-purple-500/20 shadow-sm backdrop-blur-md">
            <div className="text-2xl font-bold font-mono text-amber-300 dark:text-purple-400">{pendingRequests.length}</div>
            <div className="text-[11px] text-amber-200 dark:text-slate-400 font-medium">Pending Requests</div>
          </div>
        </div>

        {/* ADMIN WORKSPACE TAB NAVIGATION */}
        <div className="relative z-10 flex flex-wrap items-center gap-2 border-b border-indigo-700/40 dark:border-purple-900/40 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("requests")}
            className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "requests"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/40 font-bold"
                : "bg-indigo-800/60 dark:bg-slate-900/70 text-indigo-200 dark:text-slate-400 hover:text-white dark:hover:text-white border border-indigo-600/40 dark:border-slate-800 shadow-sm hover:bg-indigo-700/60 dark:hover:bg-slate-800"
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>1. Access Requests</span>
            {pendingRequests.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/30 text-amber-200 dark:text-amber-300 border border-amber-500/50 font-mono font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("universities")}
            className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "universities"
                ? "bg-sky-600 text-white shadow-lg shadow-sky-600/40 font-bold"
                : "bg-indigo-800/60 dark:bg-slate-900/70 text-indigo-200 dark:text-slate-400 hover:text-white dark:hover:text-white border border-indigo-600/40 dark:border-slate-800 shadow-sm hover:bg-indigo-700/60 dark:hover:bg-slate-800"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>2. Accredited Universities ({universities.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("companies")}
            className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "companies"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/40 font-bold"
                : "bg-indigo-800/60 dark:bg-slate-900/70 text-indigo-200 dark:text-slate-400 hover:text-white dark:hover:text-white border border-indigo-600/40 dark:border-slate-800 shadow-sm hover:bg-indigo-700/60 dark:hover:bg-slate-800"
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>3. Hiring Partners ({companies.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "audit"
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/40 font-bold"
                : "bg-indigo-800/60 dark:bg-slate-900/70 text-indigo-200 dark:text-slate-400 hover:text-white dark:hover:text-white border border-indigo-600/40 dark:border-slate-800 shadow-sm hover:bg-indigo-700/60 dark:hover:bg-slate-800"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>4. Verification Audit Log ({verifications.length})</span>
          </button>
        </div>

        {/* TAB 1: Institutional Access Requests Queue */}
        {activeTab === "requests" && (
          <div className="relative z-10 rounded-3xl p-6 space-y-4 bg-slate-900/80 dark:bg-slate-900/80 border border-indigo-600/30 dark:border-purple-500/30 shadow-xl shadow-purple-500/10 backdrop-blur-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-indigo-700/30 dark:border-purple-900/30 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-purple-400" />
                  <span>Incoming Institutional Access Requests ({pendingRequests.length} Pending)</span>
                </h3>
                <p className="text-xs text-indigo-200/70">
                  Universities and IT employers requesting institutional registration codes. Review and approve with 1-click on Ethereum.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {pendingRequests.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllRequests}
                    className="flex items-center gap-1 text-[11px] font-semibold text-rose-300 hover:text-white bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/30 px-2.5 py-1 rounded-full transition-colors"
                    title="Dismiss all current pending requests"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Dismiss All</span>
                  </button>
                )}
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/30 font-semibold">
                  Governance Queue
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              {pendingRequests.length === 0 ? (
                <div className="text-xs text-indigo-200/60 py-10 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-1 opacity-80" />
                  <p className="font-semibold text-white text-sm">All access requests have been processed!</p>
                  <p className="text-[11px] text-indigo-200/50">
                    When an unregistered university or company submits a request via the login portal, it appears here immediately.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] text-indigo-200/70 uppercase bg-indigo-950/80 border-b border-indigo-700/40">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Req #</th>
                      <th className="px-3 py-3 font-semibold">Type</th>
                      <th className="px-3 py-3 font-semibold">Organization Name</th>
                      <th className="px-3 py-3 font-semibold">Proposed Code</th>
                      <th className="px-3 py-3 font-semibold">Official Email</th>
                      <th className="px-3 py-3 font-semibold">Requested At</th>
                      <th className="px-3 py-3 text-right font-semibold">On-Chain Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-700/30">
                    {pendingRequests.map((req) => (
                      <tr key={req.requestId} className="hover:bg-indigo-900/40 transition-colors">
                        <td className="px-3 py-3 font-mono font-bold text-purple-300">#{req.requestId}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              req.entityType === "university"
                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            }`}
                          >
                            {req.entityType}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-semibold text-white">{req.name}</td>
                        <td className="px-3 py-3 font-mono font-bold text-cyan-300">{req.proposedCode}</td>
                        <td className="px-3 py-3 text-indigo-200/80">{req.contactEmail}</td>
                        <td className="px-3 py-3 text-indigo-200/50">
                          {new Date(req.timestamp).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={processingRequestId === req.requestId}
                              onClick={() => handleApproveRequest(req)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-600/25 flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>
                                {processingRequestId === req.requestId ? "Anchoring..." : "Approve & Anchor"}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectRequest(req.requestId)}
                              className="p-1.5 rounded-xl bg-indigo-800/60 hover:bg-rose-500/20 text-indigo-300 hover:text-rose-400 transition-colors"
                              title="Dismiss Request"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Accredited Universities Management */}
        {activeTab === "universities" && (
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form: Register University */}
            <div className="rounded-3xl p-6 space-y-4 bg-slate-900/80 dark:bg-slate-900/80 border border-sky-600/30 dark:border-sky-500/20 shadow-xl shadow-sky-500/10 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-sky-700/30 dark:border-sky-900/30 pb-3">
                <div className="flex items-center gap-2 text-white font-bold text-base">
                  <Building2 className="w-5 h-5 text-sky-400" />
                  <span>Direct Accredit University</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUName("Visvesvaraya Technological University");
                      setUCode("VTU-KA-001");
                      setUWallet("");
                    }}
                    className="px-2 py-0.5 rounded bg-sky-900/60 hover:bg-sky-800/80 border border-sky-600/40 text-[10px] font-mono text-sky-300 transition-colors font-semibold"
                  >
                    ⚡ Fill VTU Demo
                  </button>
                </div>
              </div>

              <form onSubmit={handleRegisterUniversity} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-sky-200/80 mb-1">University Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter Full University Name"
                    value={uName}
                    onChange={(e) => setUName(e.target.value)}
                    className="w-full bg-indigo-950/60 border border-indigo-700/50 rounded-xl px-3 py-2 text-xs text-white placeholder-indigo-400/40 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-sky-200/80 mb-1">University Code</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter Unique University Code"
                    value={uCode}
                    onChange={(e) => setUCode(e.target.value)}
                    className="w-full bg-indigo-950/60 border border-indigo-700/50 rounded-xl px-3 py-2 text-xs text-white placeholder-indigo-400/40 uppercase font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-sky-200/80 mb-1">
                    University MetaMask Login Address
                    <span className="ml-1 text-indigo-400/60 font-normal">(Optional — the wallet they will use to sign in)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="0x... (leave blank if unknown)"
                    value={uWallet}
                    onChange={(e) => setUWallet(e.target.value)}
                    className="w-full bg-indigo-950/60 border border-indigo-700/50 rounded-xl px-3 py-2 text-xs text-white placeholder-indigo-400/40 font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                  <p className="text-[10px] text-indigo-400/50 mt-1">💡 The university admin&apos;s MetaMask wallet address. You can add it later when they share it with you.</p>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-sky-600/30 mt-1"
                >
                  {isSubmitting ? "Accrediting on Ledger..." : "Register University on Blockchain"}
                </button>
              </form>
            </div>

            {/* List: Accredited Universities */}
            <div className="rounded-3xl p-6 space-y-4 bg-slate-900/80 dark:bg-slate-900/80 border border-sky-600/30 dark:border-sky-500/20 shadow-xl shadow-sky-500/10 backdrop-blur-xl">
              <div className="flex justify-between items-center border-b border-indigo-700/30 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-sky-400" />
                  <span>Accredited Universities ({universities.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-indigo-700/30 max-h-80 overflow-y-auto">
                {universities.length === 0 ? (
                  <div className="text-xs text-indigo-300/50 py-6 text-center">No universities registered yet.</div>
                ) : (
                  universities.map((u) => (
                    <div key={u.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="font-bold text-white">
                          #{u.id} {u.name}
                        </div>
                        <div className="text-sky-400 font-mono text-[11px] font-bold">Code: {u.universityCode}</div>
                        <div className="text-indigo-400/60 font-mono text-[10px] truncate max-w-xs">{u.wallet}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={u.active ? "active" : "inactive"} size="sm" />
                        <button
                          onClick={() => toggleUniversityStatus(u.id, u.active)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            u.active
                              ? "hover:bg-rose-500/10 text-rose-400"
                              : "hover:bg-emerald-500/10 text-emerald-400"
                          }`}
                          title={u.active ? "Deactivate" : "Activate"}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Authorized Corporate Partners Management */}
        {activeTab === "companies" && (
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form: Register Company */}
            <div className="rounded-3xl p-6 space-y-4 bg-slate-900/80 dark:bg-slate-900/80 border border-emerald-600/30 dark:border-emerald-500/20 shadow-xl shadow-emerald-500/10 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-emerald-700/30 dark:border-emerald-900/30 pb-3">
                <div className="flex items-center gap-2 text-white font-bold text-base">
                  <Briefcase className="w-5 h-5 text-emerald-400" />
                  <span>Direct Authorize Company</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCCName("Infosys Technologies Ltd");
                      setCCode("INFY-BLR-01");
                      setCWallet("");
                    }}
                    className="px-2 py-0.5 rounded bg-emerald-900/60 hover:bg-emerald-800/80 border border-emerald-600/40 text-[10px] font-mono text-emerald-300 transition-colors font-semibold"
                  >
                    ⚡ Fill Infosys Demo
                  </button>
                </div>
              </div>

              <form onSubmit={handleRegisterCompany} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-200/80 mb-1">
                    Company / Organization Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter Full Company Name"
                    value={cName}
                    onChange={(e) => setCCName(e.target.value)}
                    className="w-full bg-indigo-950/60 border border-indigo-700/50 rounded-xl px-3 py-2 text-xs text-white placeholder-indigo-400/40 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-200/80 mb-1">Corporate Code</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter Unique Corporate Code"
                    value={cCode}
                    onChange={(e) => setCCode(e.target.value)}
                    className="w-full bg-indigo-950/60 border border-indigo-700/50 rounded-xl px-3 py-2 text-xs text-white placeholder-indigo-400/40 uppercase font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-200/80 mb-1">
                    Company MetaMask Login Address
                    <span className="ml-1 text-indigo-400/60 font-normal">(Optional — the wallet they will use to sign in)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="0x... (leave blank if unknown)"
                    value={cWallet}
                    onChange={(e) => setCWallet(e.target.value)}
                    className="w-full bg-indigo-950/60 border border-indigo-700/50 rounded-xl px-3 py-2 text-xs text-white placeholder-indigo-400/40 font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <p className="text-[10px] text-indigo-400/50 mt-1">💡 The HR/recruiter&apos;s MetaMask wallet address. You can add it later when they share it with you.</p>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-emerald-600/30 mt-1"
                >
                  {isSubmitting ? "Authorizing on Ledger..." : "Authorize Company on Blockchain"}
                </button>
              </form>
            </div>

            {/* List: Authorized Companies */}
            <div className="rounded-3xl p-6 space-y-4 bg-slate-900/80 dark:bg-slate-900/80 border border-emerald-600/30 dark:border-emerald-500/20 shadow-xl shadow-emerald-500/10 backdrop-blur-xl">
              <div className="flex justify-between items-center border-b border-indigo-700/30 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-emerald-400" />
                  <span>Authorized Hiring Partners ({companies.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-indigo-700/30 max-h-80 overflow-y-auto">
                {companies.length === 0 ? (
                  <div className="text-xs text-indigo-300/50 py-6 text-center">No companies authorized yet.</div>
                ) : (
                  companies.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="font-bold text-white">
                          #{c.id} {c.name}
                        </div>
                        <div className="text-emerald-400 font-mono text-[11px] font-bold">Code: {c.companyCode}</div>
                        <div className="text-indigo-400/60 font-mono text-[10px] truncate max-w-xs">{c.wallet}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.active ? "active" : "inactive"} size="sm" />
                        <button
                          onClick={() => toggleCompanyStatus(c.id, c.active)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            c.active
                              ? "hover:bg-rose-500/10 text-rose-400"
                              : "hover:bg-emerald-500/10 text-emerald-400"
                          }`}
                          title={c.active ? "Deactivate" : "Activate"}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Network-Wide Audit Trail */}
        {activeTab === "audit" && (
          <div className="relative z-10 rounded-3xl p-6 space-y-4 bg-slate-900/80 dark:bg-slate-900/80 border border-indigo-600/30 dark:border-indigo-500/20 shadow-xl shadow-indigo-500/10 backdrop-blur-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-indigo-700/30 dark:border-indigo-900/30 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                <span>Network-Wide Verification Audit Log ({verifications.length})</span>
              </h3>
              <span className="text-[11px] text-indigo-300/60 font-mono font-medium">
                Immutable On-Chain Audits
              </span>
            </div>

            <div className="overflow-x-auto">
              {verifications.length === 0 ? (
                <div className="text-xs text-indigo-300/50 py-8 text-center">
                  No verification audits recorded yet across the network.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] text-indigo-200/60 uppercase bg-indigo-950/80 border-b border-indigo-700/40">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Audit ID</th>
                      <th className="px-3 py-3 font-semibold">Credential ID</th>
                      <th className="px-3 py-3 font-semibold">Auditing Company</th>
                      <th className="px-3 py-3 font-semibold">Document Category</th>
                      <th className="px-3 py-3 font-semibold">Hash Integrity</th>
                      <th className="px-3 py-3 font-semibold">Final Verdict</th>
                      <th className="px-3 py-3 font-semibold">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-700/30 font-mono">
                    {verifications.map((v) => (
                      <tr key={v.verificationId} className="hover:bg-indigo-900/30 transition-colors">
                        <td className="px-3 py-3 font-bold text-purple-300">#{v.verificationId}</td>
                        <td className="px-3 py-3 text-white font-semibold">Credential #{v.credentialId}</td>
                        <td className="px-3 py-3 font-sans text-indigo-200/80">Company #{v.companyId}</td>
                        <td className="px-3 py-3 font-sans text-white font-medium">{v.documentType}</td>
                        <td className="px-3 py-3 font-sans">
                          {v.hashMatched ? (
                            <span className="text-emerald-400 font-semibold">Matched (100%)</span>
                          ) : (
                            <span className="text-rose-400 font-semibold">Tampered / Mismatch</span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-sans">
                          <StatusBadge status={v.verified ? "authentic" : "tampered"} size="sm" />
                        </td>
                        <td className="px-3 py-3 text-indigo-300/50 font-sans">
                          {new Date(v.timestamp * 1000).toLocaleString()}
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
