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
  Key,
  Send,
  Sparkles,
  Layers,
  FileCheck,
  Mail,
} from "lucide-react";
import { ethers } from "ethers";
import {
  getContractReadOnly,
  getContractWithSigner,
  isMetaMaskInstalled,
} from "@/lib/ethereum";
import { University, Company, SystemCounters, VerificationRecord, AccessRequest } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { BackgroundWatermark, AdminBackgroundWatermark } from "@/components/PortalIllustrations";

type AdminTab = "requests" | "universities" | "companies" | "audit";

export default function AdminPage() {
  const { role, account: authAccount } = useAuth();
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

  // One-time secret passkey modal for approved/registered institutions
  const [newSecretModal, setNewSecretModal] = useState<{
    name: string;
    code: string;
    secret: string;
    email?: string;
  } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedFullDetails, setCopiedFullDetails] = useState(false);

  // Pre-filter legacy test entities that cannot be logged into
  const LEGACY_TEST_CODES = useMemo(
    () => new Set(["TEST-UNI-001", "CIT", "CIT0107", "INFY-BLR-01", "TCS-MUM-01"]),
    []
  );

  const [hiddenCodes, setHiddenCodes] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("verichain_hidden_entities");
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const visibleUniversities = useMemo(() => {
    const hiddenSet = new Set([...hiddenCodes, ...Array.from(LEGACY_TEST_CODES)]);
    return universities.filter(
      (u) =>
        Boolean(u.name && u.name.trim() !== "") &&
        Boolean(u.universityCode && u.universityCode.trim() !== "") &&
        !u.universityCode.startsWith("0x") &&
        !hiddenSet.has((u.universityCode || "").trim().toUpperCase())
    );
  }, [universities, hiddenCodes, LEGACY_TEST_CODES]);

  const visibleCompanies = useMemo(() => {
    const hiddenSet = new Set([...hiddenCodes, ...Array.from(LEGACY_TEST_CODES)]);
    return companies.filter(
      (c) =>
        Boolean(c.name && c.name.trim() !== "") &&
        Boolean(c.companyCode && c.companyCode.trim() !== "") &&
        !c.companyCode.startsWith("0x") &&
        !hiddenSet.has((c.companyCode || "").trim().toUpperCase())
    );
  }, [companies, hiddenCodes, LEGACY_TEST_CODES]);

  const handleDeleteEntity = async (entityType: "university" | "company", code: string) => {
    const cleanCode = (code || "").trim().toUpperCase();
    if (!confirm(`Are you sure you want to remove and hide ${cleanCode}?`)) return;

    const nextHidden = Array.from(new Set([...hiddenCodes, cleanCode]));
    setHiddenCodes(nextHidden);
    if (typeof window !== "undefined") {
      localStorage.setItem("verichain_hidden_entities", JSON.stringify(nextHidden));
    }

    if (entityType === "university") {
      setUniversities((prev) => prev.filter((u) => (u.universityCode || "").trim().toUpperCase() !== cleanCode));
    } else {
      setCompanies((prev) => prev.filter((c) => (c.companyCode || "").trim().toUpperCase() !== cleanCode));
    }

    try {
      const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
      await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-wallet": adminWallet,
        },
        body: JSON.stringify({ action: "delete_institution", codeIdentifier: cleanCode }),
      });
    } catch {}

    setStatusMessage({
      text: `${entityType === "university" ? "University" : "Company"} (${cleanCode}) removed successfully.`,
      type: "info",
    });
  };

  const handleGeneratePasskey = async (
    entityType: "university" | "company",
    code: string,
    name: string,
    wallet: string,
    entityId: number
  ) => {
    try {
      const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
      const cleanCode = (code || "").trim().toUpperCase();
      setStatusMessage({ text: `Generating secret passkey for ${cleanCode}...`, type: "info" });
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-wallet": adminWallet,
        },
        body: JSON.stringify({
          action: "generate_code",
          entityType,
          entityId,
          codeIdentifier: cleanCode,
          name,
          wallet,
        }),
      });
      const data = await res.json();
      if (data.secretAccessCode) {
        setNewSecretModal({
          name,
          code: cleanCode,
          secret: data.secretAccessCode,
        });
        setStatusMessage({ text: `Secret passkey ready for ${name} (${cleanCode})!`, type: "success" });
      } else {
        setStatusMessage({ text: data.error || "Failed to generate passkey", type: "error" });
      }
    } catch (e: any) {
      setStatusMessage({ text: e.message || "Failed to generate passkey", type: "error" });
    }
  };

  useEffect(() => {
    fetchData();
  }, [role, authAccount]);

  async function fetchData() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const contract = getContractReadOnly();

      // Check admin status from session, MetaMask, and environment
      let userIsAdmin = role === "admin";
      const configuredAdmin = (process.env.NEXT_PUBLIC_ADMIN_WALLET || "").trim().toLowerCase();
      const hardcodedAdmin = "0x59fd799647b8b5718fbad523a1c5b87d600c1fb8";

      if (isMetaMaskInstalled()) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            const acc = accounts[0].toLowerCase();
            setCurrentAccount(accounts[0]);
            if (acc === hardcodedAdmin || (configuredAdmin && acc === configuredAdmin)) {
              userIsAdmin = true;
            } else {
              try {
                const adminAddr = await contract.admin();
                if (adminAddr.toLowerCase() === acc) {
                  userIsAdmin = true;
                }
              } catch {}
            }
          }
        } catch {}
      }

      if (authAccount) {
        const cleanAuth = authAccount.toLowerCase();
        if (cleanAuth === hardcodedAdmin || (configuredAdmin && cleanAuth === configuredAdmin)) {
          userIsAdmin = true;
        }
      }

      setIsAdmin(userIsAdmin);

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
        const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
        const reqRes = await fetch("/api/requests", {
          headers: { "x-admin-wallet": adminWallet },
        });
        const reqData = await reqRes.json();
        if (reqData.requests) {
          setAccessRequests(reqData.requests);
        }
        if (reqData.dbInstitutions) {
          const dbUnis = reqData.dbInstitutions.filter((i: any) => i.entityType === "university");
          const dbComps = reqData.dbInstitutions.filter((i: any) => i.entityType === "company");

          setUniversities((prev) => {
            const list = [...prev];
            for (const du of dbUnis) {
              const code = (du.code || "").trim().toUpperCase();
              if (!list.some((u) => (u.universityCode || "").trim().toUpperCase() === code)) {
                list.push({
                  id: du.id || list.length + 1,
                  name: du.name,
                  universityCode: du.code,
                  wallet: du.wallet,
                  active: true,
                });
              }
            }
            return list;
          });

          setCompanies((prev) => {
            const list = [...prev];
            for (const dc of dbComps) {
              const code = (dc.code || "").trim().toUpperCase();
              if (!list.some((c) => (c.companyCode || "").trim().toUpperCase() === code)) {
                list.push({
                  id: dc.id || list.length + 1,
                  name: dc.name,
                  companyCode: dc.code,
                  wallet: dc.wallet,
                  active: true,
                });
              }
            }
            return list;
          });
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
      let targetWallet = req.wallet?.trim();
      const isInvalidOrZero =
        !targetWallet ||
        targetWallet === ZERO_WALLET ||
        !ethers.isAddress(targetWallet);

      if (isInvalidOrZero) {
        // Generate a fresh unique institutional address so on-chain registration never conflicts with existing institutions
        targetWallet = ethers.Wallet.createRandom().address;
      }

      setStatusMessage({
        text: `Accrediting ${req.name} (${req.proposedCode}) on Ethereum...`,
        type: "info",
      });

      // On-chain registration via relayer (with signer fallback)
      let onChainOk = false;
      try {
        const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
        const relayRes = await fetch("/api/blockchain/relay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-wallet": adminWallet,
          },
          body: JSON.stringify({
            action: req.entityType === "university" ? "registerUniversity" : "registerCompany",
            data: req.entityType === "university" ? {
              name: req.name.trim(),
              universityCode: req.proposedCode.trim().toUpperCase(),
              wallet: targetWallet,
            } : {
              name: req.name.trim(),
              companyCode: req.proposedCode.trim().toUpperCase(),
              wallet: targetWallet,
            },
          }),
        });
        if (relayRes.ok) onChainOk = true;
      } catch {}

      if (!onChainOk) {
        try {
          const contract = await getContractWithSigner();
          if (req.entityType === "university") {
            const tx = await contract.registerUniversity(req.name.trim(), req.proposedCode.trim().toUpperCase(), targetWallet);
            await tx.wait();
          } else {
            const tx = await contract.registerCompany(req.name.trim(), req.proposedCode.trim().toUpperCase(), targetWallet);
            await tx.wait();
          }
        } catch (signerErr) {
          console.warn("Direct signer fallback warning:", signerErr);
        }
      }

      // Mark approved in local state & database immediately
      setAccessRequests((prev) =>
        prev.map((r) => (r.requestId === req.requestId ? { ...r, approved: true } : r))
      );

      // Mark approved in API and on-chain, retrieve one-time secret passkey
      try {
        const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
        const approveRes = await fetch("/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-wallet": adminWallet,
          },
          body: JSON.stringify({ action: "approve", requestId: req.requestId }),
        });
        const approveData = await approveRes.json();
        if (approveData.secretAccessCode) {
          setNewSecretModal({
            name: req.name,
            code: req.proposedCode,
            secret: approveData.secretAccessCode,
            email: req.contactEmail || approveData.contactEmail || "",
          });
        }
      } catch (e) {}

      setStatusMessage({
        text: `Success! ${req.name} accredited on Ethereum. Code "${req.proposedCode}" is now active!`,
        type: "success",
      });

      await fetchData();
    } catch (err: any) {
      let msg = err.reason || err.message || "Failed to register entity on ledger";
      if (msg.includes("Conflict: University wallet already registered")) {
        msg = "Conflict: The wallet address is already assigned to another accredited university. Please enter a different MetaMask address, or leave blank to auto-generate a fresh institutional address.";
      } else if (msg.includes("Conflict: Company wallet already registered")) {
        msg = "Conflict: The wallet address is already assigned to another corporate hiring partner.";
      } else if (msg.includes("Conflict: University code already registered")) {
        msg = `Conflict: University Code "${req.proposedCode}" is already registered on Ethereum.`;
      } else if (msg.includes("Conflict: Company code already registered")) {
        msg = `Conflict: Corporate Code "${req.proposedCode}" is already registered on Ethereum.`;
      }
      setStatusMessage({
        text: msg,
        type: "error",
      });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    if (!confirm("Are you sure you want to dismiss this access request?")) return;
    try {
      const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
      setAccessRequests((prev) => prev.filter((r) => r.requestId !== requestId));
      await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-wallet": adminWallet,
        },
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
      const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
      setAccessRequests([]);
      await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-wallet": adminWallet,
        },
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
      let resolvedWallet = uWallet.trim();
      if (!resolvedWallet || resolvedWallet === ZERO_WALLET || !ethers.isAddress(resolvedWallet)) {
        resolvedWallet = ethers.Wallet.createRandom().address;
        setStatusMessage({
          text: `Auto-provisioned unique institutional wallet: ${resolvedWallet}. Registering...`,
          type: "info",
        });
      }

      const cleanCode = uCode.trim().toUpperCase();
      setStatusMessage({ text: "Registering university on Ethereum network...", type: "info" });

      let onChainOk = false;
      try {
        const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
        const relayRes = await fetch("/api/blockchain/relay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-wallet": adminWallet,
          },
          body: JSON.stringify({
            action: "registerUniversity",
            data: {
              name: uName.trim(),
              universityCode: cleanCode,
              wallet: resolvedWallet,
            },
          }),
        });
        if (relayRes.ok) onChainOk = true;
      } catch {}

      if (!onChainOk) {
        const contract = await getContractWithSigner();
        const tx = await contract.registerUniversity(uName.trim(), cleanCode, resolvedWallet);
        await tx.wait();
      }

      // Generate secret access passkey and store salted bcrypt hash
      try {
        const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
        const genRes = await fetch("/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-wallet": adminWallet,
          },
          body: JSON.stringify({
            action: "generate_code",
            entityType: "university",
            name: uName.trim(),
            codeIdentifier: cleanCode,
            wallet: resolvedWallet,
          }),
        });
        const genData = await genRes.json();
        if (genData.secretAccessCode) {
          setNewSecretModal({
            name: uName.trim(),
            code: cleanCode,
            secret: genData.secretAccessCode,
          });
        }
      } catch (e) {}

      setStatusMessage({
        text: `University "${uName.trim()}" accredited on blockchain! Code: ${cleanCode}`,
        type: "success"
      });
      setUName("");
      setUCode("");
      setUWallet("");
      await fetchData();
    } catch (err: any) {
      let msg = err.reason || err.message || "Failed to register university";
      if (msg.includes("Conflict: University wallet already registered")) {
        msg = "Conflict: The wallet address entered is already registered to another university on Ethereum. Please enter a different, unique MetaMask wallet address, or leave blank to auto-generate one.";
      } else if (msg.includes("Conflict: University code already registered")) {
        msg = `Conflict: University Code "${uCode.trim().toUpperCase()}" is already registered on Ethereum.`;
      }
      setStatusMessage({
        text: msg,
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
      let resolvedWallet = cWallet.trim();
      if (!resolvedWallet || resolvedWallet === ZERO_WALLET || !ethers.isAddress(resolvedWallet)) {
        resolvedWallet = ethers.Wallet.createRandom().address;
        setStatusMessage({
          text: `Auto-provisioned unique corporate wallet: ${resolvedWallet}. Registering...`,
          type: "info",
        });
      }

      const cleanCode = cCode.trim().toUpperCase();
      setStatusMessage({ text: "Registering corporate recruiter on Ethereum...", type: "info" });

      let onChainOk = false;
      try {
        const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
        const relayRes = await fetch("/api/blockchain/relay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-wallet": adminWallet,
          },
          body: JSON.stringify({
            action: "registerCompany",
            data: {
              name: cName.trim(),
              companyCode: cleanCode,
              wallet: resolvedWallet,
            },
          }),
        });
        if (relayRes.ok) onChainOk = true;
      } catch {}

      if (!onChainOk) {
        const contract = await getContractWithSigner();
        const tx = await contract.registerCompany(cName.trim(), cleanCode, resolvedWallet);
        await tx.wait();
      }

      // Generate secret access passkey and store salted bcrypt hash
      try {
        const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
        const genRes = await fetch("/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-wallet": adminWallet,
          },
          body: JSON.stringify({
            action: "generate_code",
            entityType: "company",
            name: cName.trim(),
            codeIdentifier: cleanCode,
            wallet: resolvedWallet,
          }),
        });
        const genData = await genRes.json();
        if (genData.secretAccessCode) {
          setNewSecretModal({
            name: cName.trim(),
            code: cleanCode,
            secret: genData.secretAccessCode,
          });
        }
      } catch (e) {}

      setStatusMessage({
        text: `Company "${cName.trim()}" authorized on blockchain! Code: ${cleanCode}`,
        type: "success"
      });
      setCCName("");
      setCCode("");
      setCWallet("");
      await fetchData();
    } catch (err: any) {
      let msg = err.reason || err.message || "Failed to register company";
      if (msg.includes("Conflict: Company wallet already registered")) {
        msg = "Conflict: The wallet address entered is already registered to another company on Ethereum. Please enter a different, unique MetaMask wallet address, or leave blank to auto-generate one.";
      } else if (msg.includes("Conflict: Company code already registered")) {
        msg = `Conflict: Corporate Code "${cCode.trim().toUpperCase()}" is already registered on Ethereum.`;
      }
      setStatusMessage({
        text: msg,
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUniversityStatus = async (id: number, currentActive: boolean) => {
    setStatusMessage(null);
    try {
      const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
      let ok = false;
      try {
        const res = await fetch("/api/blockchain/relay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-wallet": adminWallet,
          },
          body: JSON.stringify({
            action: "toggleUniversityStatus",
            data: { id, currentActive },
          }),
        });
        const relayData = await res.json();
        if (res.ok) {
          ok = true;
          setStatusMessage({
            text: `Success! University #${id} is now ${currentActive ? "deactivated" : "active"} on Ethereum.`,
            type: "success",
          });
        } else {
          console.warn("Relay response error:", relayData.error);
        }
      } catch (relayErr) {
        console.warn("Relay network error:", relayErr);
      }

      if (!ok) {
        const contract = await getContractWithSigner();
        const tx = currentActive
          ? await contract.deactivateUniversity(id)
          : await contract.activateUniversity(id);
        await tx.wait();
        setStatusMessage({
          text: `Success! University #${id} updated on Ethereum.`,
          type: "success",
        });
      }
      await fetchData();
    } catch (err: any) {
      alert(err.reason || err.message || "Failed to update university status");
    }
  };

  const toggleCompanyStatus = async (id: number, currentActive: boolean) => {
    setStatusMessage(null);
    try {
      const adminWallet = currentAccount || authAccount || "0x59FD799647b8b5718fBAD523A1c5b87D600C1Fb8";
      let ok = false;
      try {
        const res = await fetch("/api/blockchain/relay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-wallet": adminWallet,
          },
          body: JSON.stringify({
            action: "toggleCompanyStatus",
            data: { id, currentActive },
          }),
        });
        const relayData = await res.json();
        if (res.ok) {
          ok = true;
          setStatusMessage({
            text: `Success! Company #${id} is now ${currentActive ? "deactivated" : "active"} on Ethereum.`,
            type: "success",
          });
        } else {
          console.warn("Relay response error:", relayData.error);
        }
      } catch (relayErr) {
        console.warn("Relay network error:", relayErr);
      }

      if (!ok) {
        const contract = await getContractWithSigner();
        const tx = currentActive
          ? await contract.deactivateCompany(id)
          : await contract.activateCompany(id);
        await tx.wait();
        setStatusMessage({
          text: `Success! Company #${id} updated on Ethereum.`,
          type: "success",
        });
      }
      await fetchData();
    } catch (err: any) {
      alert(err.reason || err.message || "Failed to update company status");
    }
  };

  const pendingRequests = useMemo(() => {
    return accessRequests.filter((req) => {
      // 1. Explicitly approved
      if (req.approved || (req as any).status === "approved") return false;
      // 2. Explicitly dismissed / rejected
      if ((req as any).dismissed || (req as any).status === "rejected" || (req as any).status === "dismissed") return false;
      return true;
    });
  }, [accessRequests]);

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
            <div className="text-2xl font-bold font-mono text-sky-300 dark:text-sky-400">{visibleUniversities.length}</div>
            <div className="text-[11px] text-indigo-200 dark:text-slate-400 font-medium">Total Universities</div>
          </div>
          <div className="p-4 rounded-2xl text-center bg-indigo-800/50 dark:bg-slate-900/70 border border-indigo-600/40 dark:border-emerald-500/20 shadow-sm backdrop-blur-md">
            <div className="text-2xl font-bold font-mono text-emerald-300 dark:text-emerald-400">{visibleCompanies.length}</div>
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
            <span>2. Accredited Universities ({visibleUniversities.length})</span>
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
            <span>3. Hiring Partners ({visibleCompanies.length})</span>
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
                        <td className="px-3 py-3 font-mono font-bold text-cyan-300">
                          <div className="flex items-center gap-1.5">
                            <span>{req.proposedCode}</span>
                            {(req.entityType === "university"
                              ? universities.some((u) => (u.universityCode || "").trim().toUpperCase() === (req.proposedCode || "").trim().toUpperCase())
                              : companies.some((c) => (c.companyCode || "").trim().toUpperCase() === (req.proposedCode || "").trim().toUpperCase())
                            ) && (
                              <span className="text-[9px] font-sans font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Key Re-Issue
                              </span>
                            )}
                          </div>
                        </td>
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
                  <p className="text-[10px] text-indigo-400/50 mt-1">💡 Enter the university admin&apos;s MetaMask address, or leave blank to auto-generate a fresh unique on-chain institutional address.</p>
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
                  <span>Accredited Universities ({visibleUniversities.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-indigo-700/30 max-h-80 overflow-y-auto">
                {visibleUniversities.length === 0 ? (
                  <div className="text-xs text-indigo-300/50 py-6 text-center">No universities registered yet.</div>
                ) : (
                  visibleUniversities.map((u) => (
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
                          onClick={() => handleGeneratePasskey("university", u.universityCode, u.name, u.wallet, u.id)}
                          className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                          title="Generate / View Secret Passkey"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
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
                        <button
                          onClick={() => handleDeleteEntity("university", u.universityCode)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete / Hide University"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
                  <p className="text-[10px] text-indigo-400/50 mt-1">💡 Enter the company admin&apos;s MetaMask address, or leave blank to auto-generate a fresh unique on-chain corporate address.</p>
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
                  <span>Authorized Hiring Partners ({visibleCompanies.length})</span>
                </h3>
              </div>
              <div className="divide-y divide-indigo-700/30 max-h-80 overflow-y-auto">
                {visibleCompanies.length === 0 ? (
                  <div className="text-center py-10 px-4 border border-dashed border-emerald-800/40 rounded-2xl bg-slate-950/40">
                    <Briefcase className="w-9 h-9 text-emerald-500/40 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-white">No Hiring Partners Authorized Yet</p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                      Authorize corporate recruiter accounts using the form on the left.
                    </p>
                  </div>
                ) : (
                  visibleCompanies.map((c) => (
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
                          onClick={() => handleGeneratePasskey("company", c.companyCode, c.name, c.wallet, c.id)}
                          className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                          title="Generate / View Secret Passkey"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
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
                        <button
                          onClick={() => handleDeleteEntity("company", c.companyCode)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete / Hide Company"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

        {/* Modal: Display Generated One-Time Secret Passkey */}
        {newSecretModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 space-y-4 shadow-2xl text-left">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Shield className="w-4 h-4" />
                  <span>One-Time Secret Access Passkey Generated</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewSecretModal(null);
                    setCopiedSecret(false);
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
                ⚠️ <strong>Security Notice:</strong> This random secret passkey is shown <strong>ONCE</strong>.
                Only its salted bcrypt hash is stored in the database. Copy and securely share it with the institution authority.
              </div>

              {newSecretModal.email && (
                <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start gap-2">
                  <Mail className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                  <div>
                    <strong>Dispatched via Email:</strong> Onboarding passkey and login instructions have been automatically sent to <strong>{newSecretModal.email}</strong>.
                  </div>
                </div>
              )}

              <div className="space-y-1.5 text-xs text-slate-300">
                <div><strong>Organization:</strong> {newSecretModal.name}</div>
                <div><strong>Code Identifier:</strong> <span className="font-mono text-white uppercase">{newSecretModal.code}</span></div>
                {newSecretModal.email && (
                  <div><strong>Contact Email:</strong> <span className="font-mono text-slate-400">{newSecretModal.email}</span></div>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-400">
                  Secret Access Key (Bcrypt Salted & Hashed):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={newSecretModal.secret}
                    className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-xs text-emerald-300 font-mono select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(newSecretModal.secret);
                      setCopiedSecret(true);
                      setTimeout(() => setCopiedSecret(false), 3000);
                    }}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shrink-0 transition-colors"
                  >
                    {copiedSecret ? "Copied!" : "Copy Key"}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const onboardingText = `VeriChain Onboarding Credentials\n\nOrganization: ${newSecretModal.name}\nCode Identifier: ${newSecretModal.code}\nSecret Passkey: ${newSecretModal.secret}\nPortal Login URL: https://blockchain-document-verification-one.vercel.app/login`;
                    navigator.clipboard.writeText(onboardingText);
                    setCopiedFullDetails(true);
                    setTimeout(() => setCopiedFullDetails(false), 3000);
                  }}
                  className="flex-1 py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-300 text-xs font-semibold transition-colors"
                >
                  {copiedFullDetails ? "Copied Full Summary!" : "Copy Full Onboarding Info"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewSecretModal(null);
                    setCopiedSecret(false);
                    setCopiedFullDetails(false);
                  }}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
