"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  Wallet,
  Lock,
  ArrowLeft,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Radio,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  parseBlockchainError,
  switchToHardhatLocal,
  switchToSepolia,
} from "@/lib/ethereum";
import { SUPPORTED_CHAIN_ID, SUPPORTED_NETWORK_NAME } from "@/contracts/contractAddress";

export default function AdminLoginPage() {
  const router = useRouter();
  const { role, isAuthenticated, loginAdminWithWallet } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitchingNet, setIsSwitchingNet] = useState(false);
  const [error, setError] = useState("");

  const handleAdminConnect = async () => {
    setIsConnecting(true);
    setError("");
    try {
      await loginAdminWithWallet();
      router.push("/admin");
    } catch (err: any) {
      setError(parseBlockchainError(err));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSwitchNetwork = async () => {
    setIsSwitchingNet(true);
    try {
      if (SUPPORTED_CHAIN_ID === 11155111) {
        await switchToSepolia();
      } else {
        await switchToHardhatLocal();
      }
      setError("");
      // Retry connect automatically after switching network
      await loginAdminWithWallet();
      router.push("/admin");
    } catch (err: any) {
      setError(parseBlockchainError(err));
    } finally {
      setIsSwitchingNet(false);
    }
  };

  const isNetworkIssue =
    error.includes("Network Mismatch") ||
    error.includes("unsupported network") ||
    error.includes("BAD_DATA") ||
    error.includes("0x");

  return (
    <div className="max-w-md mx-auto py-16 px-4 space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Return to Home
      </Link>

      <div className="rounded-3xl p-8 border border-slate-200/90 dark:border-purple-500/30 text-center space-y-6 shadow-2xl relative overflow-hidden bg-white/95 dark:bg-slate-950/80 backdrop-blur-xl">
        {/* Glow halo */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto">
          <Shield className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400 text-[11px] font-semibold uppercase">
            <Lock className="w-3 h-3" />
            Restricted Access
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Admin Gateway</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            This gateway is restricted to the platform administrators. Connect your authorized administrator MetaMask wallet to proceed to root administration.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-2 text-left">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>

            {isNetworkIssue && (
              <button
                type="button"
                onClick={handleSwitchNetwork}
                disabled={isSwitchingNet}
                className="w-full mt-2 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-purple-600/20"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>
                  {isSwitchingNet
                    ? "Switching Network..."
                    : `Switch MetaMask to ${SUPPORTED_NETWORK_NAME}`}
                </span>
              </button>
            )}
          </div>
        )}

        {isAuthenticated && role === "admin" ? (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-semibold">
              Authenticated as Root Administrator
            </div>
            <Link
              href="/admin"
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2"
            >
              <span>Proceed to Admin Console</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <button
              onClick={handleAdminConnect}
              disabled={isConnecting}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2"
            >
              <Wallet className="w-4 h-4" />
              <span>{isConnecting ? "Verifying Administrator Signature..." : "Connect Admin Wallet"}</span>
            </button>
            <p className="text-[11px] text-slate-500">
              Authorized admin wallet (e.g. 0x4F1A...3A14 or contract owner) required.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
