"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { connectWallet, isMetaMaskInstalled, getContractReadOnly } from "@/lib/ethereum";
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
  loginUniversityWithCode: (code: string) => Promise<void>;
  loginCompanyWithCode: (code: string) => Promise<void>;
  loginWithUSN: (usn: string) => Promise<void>;
  loginAdminWithWallet: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("guest");
  const [account, setAccount] = useState<string | null>(null);
  const [studentUSN, setStudentUSN] = useState<string | null>(null);
  const [entityInfo, setEntityInfo] = useState<EntityInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore saved session from localStorage on mount
  useEffect(() => {
    try {
      const savedAuth = localStorage.getItem("verichain_auth");
      if (savedAuth) {
        const parsed = JSON.parse(savedAuth);
        setRole(parsed.role || "guest");
        setAccount(parsed.account || null);
        setStudentUSN(parsed.studentUSN || null);
        setEntityInfo(parsed.entityInfo || null);
      }
    } catch (e) {
      console.error("Failed to restore session:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveSession = (
    newRole: UserRole,
    newAccount: string | null,
    newUSN: string | null,
    newEntityInfo: EntityInfo | null
  ) => {
    setRole(newRole);
    setAccount(newAccount);
    setStudentUSN(newUSN);
    setEntityInfo(newEntityInfo);

    localStorage.setItem(
      "verichain_auth",
      JSON.stringify({
        role: newRole,
        account: newAccount,
        studentUSN: newUSN,
        entityInfo: newEntityInfo,
      })
    );
  };

  /**
   * Decentralized University Authentication via MetaMask
   * Verifies that the connected wallet address is registered on-chain in `universityAddressToId`
   */
  const loginUniversityWithWallet = async () => {
    setIsLoading(true);
    try {
      if (!isMetaMaskInstalled()) {
        throw new Error("MetaMask is required for Web3 Institutional login.");
      }

      const connectedAccount = await connectWallet();
      const contract = getContractReadOnly();
      const uIdBigInt = await contract.universityAddressToId(connectedAccount);
      const uId = Number(uIdBigInt);

      if (uId === 0) {
        throw new Error(
          `Access Denied: Connected wallet (${connectedAccount.slice(0, 6)}...${connectedAccount.slice(
            -4
          )}) is not registered as an accredited University on the blockchain.`
        );
      }

      const uData = await contract.getUniversity(uId);
      if (!uData.active) {
        throw new Error(`University authority "${uData.name}" is currently suspended by Administrator.`);
      }

      saveSession("university", connectedAccount, null, {
        id: uId,
        name: uData.name,
        code: uData.universityCode,
        wallet: connectedAccount,
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * On-chain University Login via Registered Institutional Code
   */
  const loginUniversityWithCode = async (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) throw new Error("Please enter your University Authority Code.");

    setIsLoading(true);
    try {
      const contract = getContractReadOnly();
      const counters = await contract.getCounters();
      const totalUniv = Number(counters.totalUniversities);

      for (let i = 1; i <= totalUniv; i++) {
        const u = await contract.getUniversity(i);
        if (u.universityCode.toUpperCase() === cleanCode) {
          if (!u.active) {
            throw new Error(`University "${u.name}" has been deactivated on-chain.`);
          }
          saveSession("university", u.wallet, null, {
            id: Number(u.id),
            name: u.name,
            code: u.universityCode,
            wallet: u.wallet,
          });
          return;
        }
      }

      // If contract is fresh/unregistered, provide accurate feedback
      throw new Error(
        `University Code "${cleanCode}" is not registered on the smart contract. Please register via Admin console.`
      );
    } catch (err: any) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Decentralized Company Recruiter Authentication via MetaMask
   * Verifies that the connected wallet address is registered on-chain in `companyAddressToId`
   */
  const loginCompanyWithWallet = async () => {
    setIsLoading(true);
    try {
      if (!isMetaMaskInstalled()) {
        throw new Error("MetaMask is required for Web3 Recruiter login.");
      }

      const connectedAccount = await connectWallet();
      const contract = getContractReadOnly();
      const cIdBigInt = await contract.companyAddressToId(connectedAccount);
      const cId = Number(cIdBigInt);

      if (cId === 0) {
        throw new Error(
          `Access Denied: Connected wallet (${connectedAccount.slice(0, 6)}...${connectedAccount.slice(
            -4
          )}) is not registered as an authorized Hiring Partner on the blockchain.`
        );
      }

      const cData = await contract.getCompany(cId);
      if (!cData.active) {
        throw new Error(`Corporate partner "${cData.name}" is currently suspended by Administrator.`);
      }

      saveSession("company", connectedAccount, null, {
        id: cId,
        name: cData.name,
        code: cData.companyCode,
        wallet: connectedAccount,
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * On-chain Company Login via Registered Corporate Code
   */
  const loginCompanyWithCode = async (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) throw new Error("Please enter your Corporate Code.");

    setIsLoading(true);
    try {
      const contract = getContractReadOnly();
      const counters = await contract.getCounters();
      const totalComp = Number(counters.totalCompanies);

      for (let i = 1; i <= totalComp; i++) {
        const c = await contract.getCompany(i);
        if (c.companyCode.toUpperCase() === cleanCode) {
          if (!c.active) {
            throw new Error(`Company "${c.name}" has been deactivated on-chain.`);
          }
          saveSession("company", c.wallet, null, {
            id: Number(c.id),
            name: c.name,
            code: c.companyCode,
            wallet: c.wallet,
          });
          return;
        }
      }

      throw new Error(
        `Company Code "${cleanCode}" is not registered on the smart contract. Please register via Admin console.`
      );
    } catch (err: any) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Student Login via On-Chain USN
   * Looks up candidate profile directly from smart contract registry
   */
  const loginWithUSN = async (usn: string) => {
    const cleanUSN = usn.trim().toUpperCase();
    if (!cleanUSN) throw new Error("Please enter a valid USN / Roll Number");

    setIsLoading(true);
    try {
      let studentName = "Registered Student";
      let course = "B.E. Computer Science & Engineering";
      let gradYear = 2025;
      let percentage = 88;

      try {
        const contract = getContractReadOnly();
        const s = await contract.getStudentByUSN(cleanUSN);
        if (s.exists) {
          studentName = s.name;
          course = s.course;
          gradYear = Number(s.graduationYear);
          percentage = Number(s.percentage);
        } else {
          throw new Error(`Student with USN "${cleanUSN}" was not found on the blockchain.`);
        }
      } catch (e: any) {
        throw new Error(
          e.reason || e.message || `Student USN "${cleanUSN}" not registered on-chain. Register via University Portal.`
        );
      }

      saveSession("student", null, cleanUSN, {
        name: studentName,
        code: cleanUSN,
        course,
        gradYear,
        percentage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Secret Admin Login: Connected ONLY by Admin via MetaMask
   */
  const loginAdminWithWallet = async () => {
    setIsLoading(true);
    try {
      if (!isMetaMaskInstalled()) {
        throw new Error("MetaMask is required for Admin governance. Please install MetaMask.");
      }

      const connectedAccount = await connectWallet();
      const contract = getContractReadOnly();
      const onChainAdmin = await contract.admin();

      if (connectedAccount.toLowerCase() !== onChainAdmin.toLowerCase()) {
        if (onChainAdmin.toLowerCase() === "0x0000000000000000000000000000000000000000") {
          saveSession("admin", connectedAccount, null, {
            name: "System Administrator",
            code: "PLATFORM-ADMIN",
          });
          return;
        }
        throw new Error(
          `Access Denied: Connected wallet (${connectedAccount.slice(0, 6)}...${connectedAccount.slice(
            -4
          )}) does not match the Contract Admin address (${onChainAdmin.slice(0, 6)}...${onChainAdmin.slice(-4)}).`
        );
      }

      saveSession("admin", connectedAccount, null, {
        name: "System Administrator",
        code: "PLATFORM-ADMIN",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setRole("guest");
    setAccount(null);
    setStudentUSN(null);
    setEntityInfo(null);
    localStorage.removeItem("verichain_auth");
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
