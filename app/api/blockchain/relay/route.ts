import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import CONTRACT_ABI from "@/contracts/contractABI.json";
import {
  CONTRACT_ADDRESS,
  SUPPORTED_NETWORKS,
  SUPPORTED_CHAIN_ID,
} from "@/contracts/contractAddress";

// Default Hardhat private keys for institutional relay
const DEFAULT_HARDHAT_ADMIN_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_HARDHAT_UNI_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const DEFAULT_HARDHAT_COMP_KEY =
  "0x5de4111afa1a4b94908f83103eb2f95474831082d4ac969f31ee3021aa30c2da";

function getRelayProviderAndSigner(entityType: "admin" | "university" | "company") {
  const isSepolia = SUPPORTED_CHAIN_ID === 11155111;
  const rpcUrl = isSepolia
    ? process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
    : SUPPORTED_NETWORKS.LOCAL.rpcUrl;

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  let pKey = process.env.PRIVATE_KEY?.trim() || "";
  if (!isSepolia || !pKey) {
    if (entityType === "university") pKey = DEFAULT_HARDHAT_UNI_KEY;
    else if (entityType === "company") pKey = DEFAULT_HARDHAT_COMP_KEY;
    else pKey = DEFAULT_HARDHAT_ADMIN_KEY;
  } else if (!pKey.startsWith("0x")) {
    pKey = `0x${pKey}`;
  }

  const wallet = new ethers.Wallet(pKey, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  return { provider, wallet, contract };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, universityCode, companyCode, data } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    if (action === "registerStudent") {
      const { usn, name, course, gradYear, percentage } = data;
      const { contract } = getRelayProviderAndSigner("university");

      // Find university ID by code
      const uIdBig = await contract.universityCodeToId(universityCode || "VTU-KA-001");
      const uId = Number(uIdBig);
      if (uId === 0) {
        return NextResponse.json(
          { error: `University code ${universityCode} not registered on blockchain` },
          { status: 400 }
        );
      }

      // Check if student already exists
      const existingId = Number(await contract.usnToStudentId(usn));
      if (existingId > 0) {
        return NextResponse.json(
          { success: true, studentId: existingId, message: "Student already registered" },
          { status: 200 }
        );
      }

      const tx = await contract.registerStudentByUniversity(
        uId,
        usn,
        name,
        course,
        gradYear,
        percentage
      );
      const receipt = await tx.wait();
      const newStudentId = Number(await contract.usnToStudentId(usn));

      return NextResponse.json({
        success: true,
        studentId: newStudentId,
        txHash: receipt.hash,
      });
    }

    if (action === "issueCredential") {
      const { studentId, documentType, documentHash, ipfsCID } = data;
      const { contract } = getRelayProviderAndSigner("university");

      const uIdBig = await contract.universityCodeToId(universityCode || "VTU-KA-001");
      const uId = Number(uIdBig);
      if (uId === 0) {
        return NextResponse.json({ error: "University code not found" }, { status: 400 });
      }

      const tx = await contract.issueCredentialByUniversity(
        uId,
        studentId,
        documentType,
        documentHash,
        ipfsCID
      );
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
      });
    }

    if (action === "reviewAchievement") {
      const { achievementId, status, remarks } = data;
      const { contract } = getRelayProviderAndSigner("university");

      const uIdBig = await contract.universityCodeToId(universityCode || "VTU-KA-001");
      const uId = Number(uIdBig);

      const tx = await contract.reviewAchievement(achievementId, uId, status, remarks || "");
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
      });
    }

    if (action === "submitAchievement") {
      const { usn, title, issuerOrg, category, documentHash, ipfsCID } = data;
      const { contract } = getRelayProviderAndSigner("admin");

      const tx = await contract.submitAchievement(
        usn,
        title,
        issuerOrg || "External Organization",
        category || "Certification",
        documentHash,
        ipfsCID
      );
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
      });
    }

    if (action === "recordVerification") {
      const { credentialId, hashMatched, isAuthentic, documentType } = data;
      const { contract } = getRelayProviderAndSigner("company");

      let cId = 1;
      if (companyCode) {
        const cIdBig = await contract.companyCodeToId(companyCode);
        cId = Number(cIdBig) || 1;
      }

      const tx = await contract.recordVerificationByCompany(
        cId,
        credentialId || 0,
        Boolean(hashMatched),
        Boolean(isAuthentic),
        documentType || "Academic Document"
      );
      const receipt = await tx.wait();

      return NextResponse.json({
        success: true,
        txHash: receipt.hash,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Relay route error:", error);
    return NextResponse.json(
      { error: error.reason || error.message || "Blockchain relay failed" },
      { status: 500 }
    );
  }
}
