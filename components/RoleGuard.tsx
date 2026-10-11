"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types";
import { ShieldAlert, Lock, ArrowRight, RefreshCw } from "lucide-react";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  portalName: string;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  children,
  allowedRoles,
  portalName,
}) => {
  const { role, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
        <p className="text-xs text-slate-400">Verifying authorization permissions...</p>
      </div>
    );
  }

  const isAuthorized = isAuthenticated && allowedRoles.includes(role);
  const isAdminPortal = allowedRoles.length === 1 && allowedRoles[0] === "admin";

  if (!isAuthorized) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4">
        <div className="glass-panel rounded-3xl p-8 border border-rose-500/30 text-center space-y-6 shadow-2xl relative overflow-hidden">
          {/* Glowing background halo */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold uppercase">
              <ShieldAlert className="w-3.5 h-3.5" />
              Restricted Access Block
            </div>
            <h2 className="text-2xl font-bold text-white">
              {portalName} Authentication Required
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
              This dashboard is restricted. You must sign in with authorized{" "}
              <span className="text-indigo-300 font-semibold uppercase">{allowedRoles.join(" or ")}</span> credentials.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Current Status:</span>
            <span className="font-mono uppercase font-bold text-rose-400">
              {role === "guest" ? "Unauthenticated" : role}
            </span>
          </div>

          <div className="pt-2">
            <Link
              href={isAdminPortal ? "/admin-login" : "/login"}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
            >
              <span>{isAdminPortal ? "Go to Admin Gateway" : "Go to Portal Sign In"}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
