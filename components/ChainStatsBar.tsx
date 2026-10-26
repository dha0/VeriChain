"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Building2, GraduationCap, Briefcase, Activity, RefreshCw } from "lucide-react";
import { getContractReadOnly } from "@/lib/ethereum";

interface ChainStats {
  universities: number;
  students: number;
  companies: number;
  credentials: number;
  verifications: number;
  loading: boolean;
  error: boolean;
  lastUpdated: Date | null;
}

/**
 * Live on-chain statistics banner.
 * Reads getAllStats() from the smart contract (read-only, no wallet needed).
 * Auto-refreshes every 60 seconds; pauses when the tab is hidden.
 */
export function ChainStatsBar() {
  const [stats, setStats] = useState<ChainStats>({
    universities: 0,
    students: 0,
    companies: 0,
    credentials: 0,
    verifications: 0,
    loading: true,
    error: false,
    lastUpdated: null,
  });

  const fetchStats = useCallback(async () => {
    try {
      // 1. Try server-side cached stats API (resilient, no client RPC required)
      const res = await fetch("/api/blockchain/stats");
      if (res.ok) {
        const data = await res.json();
        setStats({
          universities: Number(data.universities || 0),
          companies: Number(data.companies || 0),
          students: Number(data.students || 0),
          credentials: Number(data.credentials || 0),
          verifications: Number(data.verifications || 0),
          loading: false,
          error: false,
          lastUpdated: new Date(),
        });
        return;
      }
    } catch (apiErr) {
      console.warn("Stats API error, falling back to direct RPC:", apiErr);
    }

    // 2. Client-side RPC fallback
    try {
      const contract = getContractReadOnly();
      const result = await contract.getAllStats();
      setStats({
        universities: Number(result[0]),
        students: Number(result[1]),
        companies: Number(result[4]),
        credentials: Number(result[2]),
        verifications: Number(result[5]),
        loading: false,
        error: false,
        lastUpdated: new Date(),
      });
    } catch {
      setStats((prev) => ({ ...prev, loading: false, error: true }));
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Poll every 45 s, pause when tab is hidden
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) fetchStats();
    }, 45_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const statItems = [
    {
      label: "Universities Registered",
      value: stats.universities,
      icon: Building2,
      color: "text-sky-400",
      bg: "bg-sky-500/10",
      border: "border-sky-500/20",
      glow: "shadow-sky-500/10",
      subtext: "Accredited Institutions",
    },
    {
      label: "Companies Registered",
      value: stats.companies,
      icon: Briefcase,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      glow: "shadow-emerald-500/10",
      subtext: "Hiring Partners",
    },
    {
      label: "Students Registered",
      value: stats.students,
      icon: GraduationCap,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
      glow: "shadow-indigo-500/10",
      subtext: "Verified Candidates",
    },
    {
      label: "Credentials Issued",
      value: stats.credentials,
      icon: Activity,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      glow: "shadow-amber-500/10",
      subtext: "Immutable Proofs",
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Live On-Chain Registry · Ethereum Sepolia
          </span>
        </div>
        <button
          onClick={fetchStats}
          title="Refresh stats"
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${stats.loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statItems.map((item) => (
          <div
            key={item.label}
            className={`rounded-2xl border ${item.border} ${item.bg} shadow-lg ${item.glow} p-4 flex flex-col items-center text-center gap-1.5 transition-all hover:scale-[1.02]`}
          >
            <item.icon className={`w-5 h-5 ${item.color}`} />
            <span
              className={`text-2xl sm:text-3xl font-extrabold ${item.color} tabular-nums tracking-tight`}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {stats.loading ? (
                <span className="inline-block w-8 h-7 bg-slate-700/60 rounded-lg animate-pulse" />
              ) : stats.error ? (
                "—"
              ) : (
                item.value.toLocaleString()
              )}
            </span>
            <span className="text-xs font-semibold text-slate-200 leading-tight">{item.label}</span>
            {item.subtext && (
              <span className="text-[10px] text-slate-400 font-medium">{item.subtext}</span>
            )}
          </div>
        ))}
      </div>

      {/* Last-updated label */}
      {stats.lastUpdated && !stats.error && (
        <p className="text-[10px] text-slate-600 text-center mt-2">
          Last synced{" "}
          {stats.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </p>
      )}
      {stats.error && (
        <p className="text-[10px] text-rose-500/70 text-center mt-2">
          Unable to reach chain — check RPC or MetaMask network
        </p>
      )}
    </div>
  );
}
