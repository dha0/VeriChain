import React from "react";
import { CredentialStatus } from "@/types";
import { CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";

interface StatusBadgeProps {
  status: CredentialStatus | "authentic" | "tampered" | "revoked" | "not_found" | "active" | "inactive";
  size?: "sm" | "md" | "lg";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = "md" }) => {
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-xs font-semibold",
    lg: "px-3.5 py-1.5 text-sm font-bold",
  }[size];

  // Numerical CredentialStatus or string
  if (status === CredentialStatus.Active || status === "active" || status === "authentic") {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ${sizeClasses}`}>
        <CheckCircle2 className="w-3.5 h-3.5" />
        {status === "authentic" ? "AUTHENTIC" : "ACTIVE"}
      </span>
    );
  }

  if (status === CredentialStatus.Revoked || status === "revoked") {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 ${sizeClasses}`}>
        <XCircle className="w-3.5 h-3.5" />
        REVOKED
      </span>
    );
  }

  if (status === "tampered") {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-red-600/20 text-red-400 border border-red-500/50 animate-pulse ${sizeClasses}`}>
        <XCircle className="w-3.5 h-3.5" />
        TAMPERED / MISMATCH
      </span>
    );
  }

  if (status === CredentialStatus.Suspended) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 ${sizeClasses}`}>
        <AlertTriangle className="w-3.5 h-3.5" />
        SUSPENDED
      </span>
    );
  }

  if (status === CredentialStatus.Expired) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/30 ${sizeClasses}`}>
        <Clock className="w-3.5 h-3.5" />
        EXPIRED
      </span>
    );
  }

  if (status === "inactive") {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/30 ${sizeClasses}`}>
        <AlertTriangle className="w-3.5 h-3.5" />
        INACTIVE
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/30 ${sizeClasses}`}>
      NOT FOUND
    </span>
  );
};
