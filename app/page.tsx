"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Shield,
  FileCheck,
  Printer,
  Briefcase,
  GraduationCap,
  QrCode,
  ArrowRight,
  Database,
  Cpu,
} from "lucide-react";
import { getContractReadOnly } from "@/lib/ethereum";
import { SystemCounters } from "@/types";

export default function HomePage() {
  const [counters, setCounters] = useState<SystemCounters>({
    totalUniversities: 0,
    totalStudents: 0,
    totalCredentials: 0,
    totalCompanies: 0,
    totalVerifications: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      // 1. Try server-side cached API for live count synchronized with Admin Console
      try {
        const apiRes = await fetch("/api/blockchain/stats");
        if (apiRes.ok) {
          const data = await apiRes.json();
          setCounters({
            totalUniversities: Number(data.universities || 0),
            totalStudents: Number(data.students || 0),
            totalCredentials: Number(data.credentials || 0),
            totalCompanies: Number(data.companies || 0),
            totalVerifications: Number(data.verifications || 0),
          });
          setIsLoading(false);
          return;
        }
      } catch (e) {
        // Fallback to client RPC
      }

      // 2. Direct client-side RPC query fallback
      try {
        const contract = getContractReadOnly();
        const res = await contract.getCounters();
        const totalU = Number(res.totalUniversities);
        const totalC = Number(res.totalCompanies);

        const LEGACY_TEST_CODES = new Set(["TEST-UNI-001", "CIT", "CIT0107", "INFY-BLR-01", "TCS-MUM-01"]);
        let validU = 0;
        for (let i = 1; i <= totalU; i++) {
          try {
            const u = await contract.getUniversity(i);
            const code = (u.universityCode || "").trim().toUpperCase();
            if (code && !code.startsWith("0x") && !LEGACY_TEST_CODES.has(code)) validU++;
          } catch {}
        }

        let validC = 0;
        for (let i = 1; i <= totalC; i++) {
          try {
            const c = await contract.getCompany(i);
            const code = (c.companyCode || "").trim().toUpperCase();
            if (code && !code.startsWith("0x") && !LEGACY_TEST_CODES.has(code)) validC++;
          } catch {}
        }

        setCounters({
          totalUniversities: validU,
          totalStudents: Number(res.totalStudents),
          totalCredentials: Number(res.totalCredentials),
          totalCompanies: validC,
          totalVerifications: Number(res.totalVerifications),
        });
      } catch (e) {
        console.warn("Public RPC sync fallback:", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="space-y-16 pb-12 transition-colors duration-500">
      {/* Hero Section */}
      <section className="text-center space-y-6 pt-6 sm:pt-10 max-w-4xl mx-auto">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.18] transition-colors">
          Blockchain Based Decentralised
          <br className="hidden sm:inline" />{" "}
          Document Verification{" "}
          <span className="text-indigo-600 dark:text-[#7b9ee8]">for Hiring</span>
          <br />
          <span className="text-cyan-500 dark:text-[#4fd1f5]">Process</span>
        </h1>

        <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed transition-colors">
          Eliminating fake degrees and marksheet tampering in tech recruitment with Ethereum smart contracts, client-side SHA-256 cryptographic proof, and decentralized IPFS storage.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-3">
          <Link
            href="/login"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95"
          >
            <Shield className="w-4 h-4" />
            <span>Access Portals / Sign In</span>
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 font-medium px-6 py-3 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-sm"
          >
            <GraduationCap className="w-4 h-4 text-cyan-400" />
            <span>Student & Recruiter Login</span>
          </Link>
        </div>
      </section>

      {/* Live Blockchain Statistics Strip */}
      <section className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          {[
            { label: "Universities", value: counters.totalUniversities, icon: Printer, color: "text-blue-400" },
            { label: "Students", value: counters.totalStudents, icon: GraduationCap, color: "text-blue-400" },
            { label: "Credentials", value: counters.totalCredentials, icon: FileCheck, color: "text-cyan-400" },
            { label: "Companies", value: counters.totalCompanies, icon: Briefcase, color: "text-emerald-400" },
            { label: "Verifications", value: counters.totalVerifications, icon: Shield, color: "text-purple-400" },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={i}
                className="bg-slate-900/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center space-y-1 shadow-lg transition-transform hover:-translate-y-1"
              >
                <Icon className={`w-5 h-5 ${stat.color} mb-1`} />
                <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 dark:text-white">
                  {stat.value}
                </div>
                <div className="text-xs text-slate-400 font-medium">{stat.label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Core System Features Grid */}
      <section className="space-y-6 pt-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white transition-colors">
            System Capabilities
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm transition-colors">
            Engineered specifically to solve credential fraud for IT campus hiring and corporate recruitment
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            {
              title: "SHA-256 Tamper Audit",
              desc: "Compares applicant PDF hashes with 32-byte blockchain fingerprint. Flags altered marksheets immediately.",
              icon: Cpu,
            },
            {
              title: "Decentralized IPFS",
              desc: "Marksheet documents are pinned to Pinata IPFS; only cryptographic CIDs and hashes are anchored on-chain.",
              icon: Database,
            },
            {
              title: "Two-Tier Verification",
              desc: "Supports quick candidate record screening (Mode 1) and deep document authenticity validation (Mode 2).",
              icon: Shield,
            },
            {
              title: "QR Code Sharing",
              desc: "Students can display and share scannable QR codes for one-click verification on resumes or LinkedIn.",
              icon: QrCode,
            },
          ].map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={index} className="glass-panel-interactive rounded-2xl p-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base">{item.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
