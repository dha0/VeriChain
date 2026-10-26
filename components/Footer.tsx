import React from "react";
import Link from "next/link";
import { Shield } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 py-10 mt-auto transition-colors duration-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          {/* Project Overview */}
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                <Shield className="w-5 h-5" />
              </div>
              <span className="font-bold text-slate-900 dark:text-slate-200 text-base">
                Blockchain Based Decentralised Document Verification
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Decentralized, tamper-proof academic and credential verification for the IT hiring process. Powered by Ethereum smart contracts, client-side SHA-256 integrity checks, and IPFS storage.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                Solidity ^0.8.20
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                Next.js 14
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                ethers.js v6
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                IPFS / Pinata
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex flex-wrap gap-6 text-xs text-slate-700 dark:text-slate-300 font-medium">
            <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Home
            </Link>
            <Link href="/verify" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Public Verification
            </Link>
            <Link href="/login" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Portal Sign In
            </Link>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-200 dark:border-slate-800/60 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} Decentralised Document Verification. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              EVM Smart Contract Ready
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
