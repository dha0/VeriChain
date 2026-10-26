"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  Search,
  Building2,
  GraduationCap,
  Briefcase,
  LogOut,
  LogIn,
  AlertTriangle,
  Radio,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import {
  isMetaMaskInstalled,
  getCurrentChainId,
  switchToHardhatLocal,
  switchToSepolia,
} from "@/lib/ethereum";
import { SUPPORTED_CHAIN_ID, SUPPORTED_NETWORK_NAME } from "@/contracts/contractAddress";

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const { role, account, studentUSN, isAuthenticated, logout } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const [currentChainId, setCurrentChainId] = useState<number | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    async function checkChain() {
      if (isMetaMaskInstalled()) {
        const id = await getCurrentChainId();
        setCurrentChainId(id);

        if (window.ethereum?.on) {
          window.ethereum.on("chainChanged", (chainIdHex: string) => {
            setCurrentChainId(parseInt(chainIdHex, 16));
          });
        }
      }
    }
    checkChain();
  }, []);

  const handleNetworkClick = async () => {
    if (currentChainId === 11155111) return;
    setIsSwitching(true);
    try {
      await switchToSepolia();
      const updated = await getCurrentChainId();
      setCurrentChainId(updated);
    } catch (e: any) {
      console.error("Failed to switch network:", e);
      if (e?.code === 4001 || e?.message?.includes("rejected")) {
        return;
      }
      alert(
        "Could not switch to Sepolia automatically in MetaMask.\n\n" +
        "How to enable Sepolia in MetaMask:\n" +
        "1. Open MetaMask\n" +
        "2. Click the Network dropdown at top left\n" +
        "3. Turn ON 'Show test networks'\n" +
        "4. Select 'Sepolia'!"
      );
    } finally {
      setIsSwitching(false);
    }
  };

  const getRoleBadge = () => {
    switch (role) {
      case "admin":
        return (
          <span className="bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/40 text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase">
            Admin
          </span>
        );
      case "university":
        return (
          <span className="bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/40 text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase">
            University
          </span>
        );
      case "company":
        return (
          <span className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase">
            Recruiter
          </span>
        );
      case "student":
        return (
          <span className="bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/40 text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase">
            Student
          </span>
        );
      default:
        return null;
    }
  };

  const getAuthorizedPortalLink = () => {
    switch (role) {
      case "admin":
        return { name: "Admin Console", href: "/admin", icon: Shield };
      case "university":
        return { name: "University Portal", href: "/university", icon: Building2 };
      case "company":
        return { name: "Recruiter Portal", href: "/company", icon: Briefcase };
      case "student":
        return { name: "Student Locker", href: "/student", icon: GraduationCap };
      default:
        return null;
    }
  };

  const portalLink = getAuthorizedPortalLink();
  const isCorrectNetwork = currentChainId === 11155111;

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 transition-colors duration-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 p-0.5 shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[10px] flex items-center justify-center transition-colors">
                <Shield className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              </div>
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 dark:from-blue-400 dark:via-indigo-300 dark:to-cyan-300 bg-clip-text text-transparent">
                VeriChain
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                IT Hiring DApp
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1 lg:space-x-2">
            <Link
              href="/"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs lg:text-sm font-medium transition-all ${
                pathname === "/"
                  ? "bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-900"
              }`}
            >
              <Shield className="w-4 h-4" />
              Home
            </Link>



            {/* Dynamic Authorized Portal Link if logged in */}
            {portalLink && (
              <Link
                href={portalLink.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs lg:text-sm font-semibold transition-all ${
                  pathname === portalLink.href
                    ? "bg-indigo-600/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/40 shadow-sm"
                    : "text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 hover:bg-slate-100 dark:hover:bg-slate-900"
                }`}
              >
                <portalLink.icon className="w-4 h-4" />
                {portalLink.name}
              </Link>
            )}
          </div>

          {/* User Auth, Network Pill & Theme Switcher Actions */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* MetaMask Network Status / Switcher Button */}
            <button
              type="button"
              onClick={handleNetworkClick}
              disabled={isSwitching}
              title={
                currentChainId === null || isCorrectNetwork
                  ? "Target Network: Ethereum Sepolia (11155111)"
                  : "Click to switch to Sepolia"
              }
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold border transition-all ${
                currentChainId === null || isCorrectNetwork
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                  : "bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/50 hover:bg-rose-500/30 animate-pulse"
              }`}
            >
              {currentChainId === null || isCorrectNetwork ? (
                <>
                  <Radio className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                  <span>Sepolia (11155111)</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                  <span>Switch to Sepolia</span>
                </>
              )}
            </button>

            {/* Mode Changer: Dark Mode & Light Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle Dark/Light Mode"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all text-xs font-medium 
                bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700
                dark:bg-slate-900/90 dark:hover:bg-slate-800 dark:border-slate-700 dark:text-slate-300 shadow-sm"
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400 transition-transform rotate-0 hover:rotate-90 duration-300" />
                  <span className="hidden sm:inline text-[11px] font-semibold text-slate-300">Dark</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-600 transition-transform -rotate-12 hover:rotate-0 duration-300" />
                  <span className="hidden sm:inline text-[11px] font-semibold text-slate-700">Light</span>
                </>
              )}
            </button>

            {isAuthenticated ? (
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/80 rounded-full pl-3 pr-1.5 py-1 shadow-inner transition-colors">
                {getRoleBadge()}
                <span className="font-mono text-xs text-slate-800 dark:text-slate-200 font-medium">
                  {studentUSN
                    ? studentUSN
                    : account
                    ? `${account.slice(0, 6)}...${account.slice(-4)}`
                    : "Active"}
                </span>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="p-1.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors ml-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl shadow-lg shadow-blue-600/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In / Portals</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
