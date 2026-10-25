"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BrowserProvider } from "ethers";
import { connectWallet, isMetaMaskInstalled } from "@/lib/ethereum";
import { UserRole } from "@/types";

export interface EntityInfo {
  id?: number;
  name?: string;
  code?: string;
  wallet?: string;
  course?: string;
  gradYear?: number;
  percentage?: number;
}

interface AuthContextType {
  role: UserRole;
  account: string | null;
  studentUSN: string | null;
  entityInfo: EntityInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginUniversityWithWallet: () => Promise<void>;
  loginCompanyWithWallet: () => Promise<void>;
  loginUniversityWithCode: (code: string, accessCode?: string) => Promise<void>;
  loginCompanyWithCode: (code: string, accessCode?: string) => Promise<void>;
  loginWithUSN: (usn: string, otp?: string) => Promise<void>;
  requestStudentOTP: (usn: string) => Promise<{ success: boolean; message: string; devOTP?: string }>;
  loginStudentWithOTP: (usn: string, otp: string) => Promise<void>;
  loginStudentWithWallet: (usn: string) => Promise<void>;
  loginAdminWithWallet: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Requests an ephemeral SIWE cryptographic nonce from the server,
 * then prompts MetaMask to sign it using personal_sign.
 */
async function requestSIWESignature(walletAddress: string): Promise<{ message: string; signature: string }> {
  const nonceRes = await fetch(`/api/auth/nonce?wallet=${encodeURIComponent(walletAddress)}`);
  const nonceData = await nonceRes.json();
  if (!nonceRes.ok || !nonceData.message) {
    throw new Error(nonceData.error || "Failed to generate authentication challenge from server.");
  }

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const signature = await signer.signMessage(nonceData.message);
  return { message: nonceData.message, signature };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("guest");
  const [account, setAccount] = useState<string | null>(null);
  const [studentUSN, setStudentUSN] = useState<string | null>(null);
  const [entityInfo, setEntityInfo] = useState<EntityInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session exclusively from signed server httpOnly JWT cookie on mount
  useEffect(() => {
    async function restoreServerSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.session) {
            setRole(data.session.role || "guest");
            setAccount(data.session.account || null);
            setStudentUSN(data.session.studentUSN || null);
            setEntityInfo(data.session.entityInfo || null);
          }
        }
      } catch (e) {
        console.warn("Failed to restore server session:", e);
      } finally {
        setIsLoading(false);
      }
    }
    restoreServerSession();
  }, []);

  /**
   * Cryptographic SIWE University Login via MetaMask
   * Prompts MetaMask signature and verifies against server & smart contract.
   */
  const loginUniversityWithWallet = async () => {
    setIsLoading(true);
    try {
      if (!isMetaMaskInstalled()) {
        throw new Error("MetaMask is required for Web3 Institutional login.");
      }

      const connectedAccount = await connectWallet();
      const { message, signature } = await requestSIWESignature(connectedAccount);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginType: "wallet",
          wallet: connectedAccount,
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "University wallet authentication failed.");
      }

      setRole(data.session.role);
      setAccount(data.session.account);
      setStudentUSN(data.session.studentUSN);
      setEntityInfo(data.session.entityInfo);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Server-Side University Login via Salted Bcrypt Access Code
   * Verifies against server database and issues httpOnly JWT session cookie.
   * If MetaMask is connected, also requires SIWE signature.
   */
  const loginUniversityWithCode = async (code: string, accessCode?: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode && !accessCode) {
      throw new Error("Please enter your University Authority Code or Secret Passkey.");
    }

    setIsLoading(true);
    try {
      let wallet: string | undefined;
      let message: string | undefined;
      let signature: string | undefined;

      // SIWE wallet signature where available
      if (isMetaMaskInstalled()) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts && accounts.length > 0) {
            const sig = await requestSIWESignature(accounts[0]);
            wallet = accounts[0];
            message = sig.message;
            signature = sig.signature;
          }
        } catch (sigErr) {
          console.warn("SIWE signature skipped or cancelled:", sigErr);
        }
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginType: "code",
          entityType: "university",
          codeIdentifier: cleanCode,
          accessCode: (accessCode || cleanCode).trim(),
          wallet,
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid University credentials.");
      }

      setRole(data.session.role);
      setAccount(data.session.account);
      setStudentUSN(data.session.studentUSN);
      setEntityInfo(data.session.entityInfo);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Cryptographic SIWE Recruiter Login via MetaMask
   */
  const loginCompanyWithWallet = async () => {
    setIsLoading(true);
    try {
      if (!isMetaMaskInstalled()) {
        throw new Error("MetaMask is required for Web3 Recruiter login.");
      }

      const connectedAccount = await connectWallet();
      const { message, signature } = await requestSIWESignature(connectedAccount);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginType: "wallet",
          wallet: connectedAccount,
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Company recruiter authentication failed.");
      }

      setRole(data.session.role);
      setAccount(data.session.account);
      setStudentUSN(data.session.studentUSN);
      setEntityInfo(data.session.entityInfo);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Server-Side Recruiter Login via Salted Bcrypt Corporate Code
   */
  const loginCompanyWithCode = async (code: string, accessCode?: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode && !accessCode) {
      throw new Error("Please enter your Corporate Hiring Code or Secret Passkey.");
    }

    setIsLoading(true);
    try {
      let wallet: string | undefined;
      let message: string | undefined;
      let signature: string | undefined;

      if (isMetaMaskInstalled()) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts && accounts.length > 0) {
            const sig = await requestSIWESignature(accounts[0]);
            wallet = accounts[0];
            message = sig.message;
            signature = sig.signature;
          }
        } catch (sigErr) {
          console.warn("SIWE signature skipped or cancelled:", sigErr);
        }
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginType: "code",
          entityType: "company",
          codeIdentifier: cleanCode,
          accessCode: (accessCode || cleanCode).trim(),
          wallet,
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid Company credentials.");
      }

      setRole(data.session.role);
      setAccount(data.session.account);
      setStudentUSN(data.session.studentUSN);
      setEntityInfo(data.session.entityInfo);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Request Email OTP for Student Login
   */
  const requestStudentOTP = async (usn: string) => {
    const cleanUSN = usn.trim().toUpperCase();
    if (!cleanUSN) throw new Error("Please enter your University Seat Number (USN).");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginType: "student_request_otp",
        usn: cleanUSN,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to generate security OTP.");
    }
    return data;
  };

  /**
   * Student Login via USN + Verified Email OTP
   */
  const loginStudentWithOTP = async (usn: string, otp: string) => {
    const cleanUSN = usn.trim().toUpperCase();
    const cleanOTP = otp.trim();
    if (!cleanUSN) throw new Error("Please enter a valid USN / Roll Number");
    if (!cleanOTP) throw new Error("Please enter the 6-digit OTP sent to your email.");

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginType: "student",
          usn: cleanUSN,
          otp: cleanOTP,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Student OTP verification failed.");
      }

      setRole(data.session.role);
      setAccount(data.session.account);
      setStudentUSN(data.session.studentUSN);
      setEntityInfo(data.session.entityInfo);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Student Login via MetaMask SIWE Cryptographic Signature
   */
  const loginStudentWithWallet = async (usn: string) => {
    const cleanUSN = usn.trim().toUpperCase();
    if (!cleanUSN) throw new Error("Please enter your USN / Roll Number");
    if (!isMetaMaskInstalled()) {
      throw new Error("MetaMask is required for Web3 cryptographic student sign-in.");
    }

    setIsLoading(true);
    try {
      const connectedAccount = await connectWallet();
      const { message, signature } = await requestSIWESignature(connectedAccount);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginType: "student",
          usn: cleanUSN,
          wallet: connectedAccount,
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Student wallet verification failed.");
      }

      setRole(data.session.role);
      setAccount(data.session.account);
      setStudentUSN(data.session.studentUSN);
      setEntityInfo(data.session.entityInfo);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Legacy wrapper supporting OTP or direct login
   */
  const loginWithUSN = async (usn: string, otp?: string) => {
    if (otp) {
      await loginStudentWithOTP(usn, otp);
    } else {
      await loginStudentWithWallet(usn);
    }
  };

  /**
   * Cryptographic Admin Login: SIWE Signature Verification via MetaMask
   */
  const loginAdminWithWallet = async () => {
    setIsLoading(true);
    try {
      if (!isMetaMaskInstalled()) {
        throw new Error("MetaMask is required for Admin governance. Please install MetaMask.");
      }

      const connectedAccount = await connectWallet();
      const { message, signature } = await requestSIWESignature(connectedAccount);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginType: "wallet",
          wallet: connectedAccount,
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Platform Admin authentication failed.");
      }

      setRole(data.session.role);
      setAccount(data.session.account);
      setStudentUSN(data.session.studentUSN);
      setEntityInfo(data.session.entityInfo);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Signs out user and clears the httpOnly session cookie on the server.
   */
  const logout = async () => {
    try {
      await fetch("/api/auth/session", { method: "POST" });
    } catch (e) {
      console.warn("Failed to clear server session:", e);
    }
    setRole("guest");
    setAccount(null);
    setStudentUSN(null);
    setEntityInfo(null);
    try {
      localStorage.removeItem("verichain_auth");
    } catch {}
    router.push("/login");
  };

  const isAuthenticated = role !== "guest";

  return (
    <AuthContext.Provider
      value={{
        role,
        account,
        studentUSN,
        entityInfo,
        isAuthenticated,
        isLoading,
        loginUniversityWithWallet,
        loginCompanyWithWallet,
        loginUniversityWithCode,
        loginCompanyWithCode,
        loginWithUSN,
        requestStudentOTP,
        loginStudentWithOTP,
        loginStudentWithWallet,
        loginAdminWithWallet,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
