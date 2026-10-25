import { ethers } from "ethers";
import CONTRACT_ABI from "@/contracts/contractABI.json";
import {
  CONTRACT_ADDRESS,
  SUPPORTED_NETWORKS,
  SUPPORTED_CHAIN_ID,
} from "@/contracts/contractAddress";

export function getServerProvider() {
  const isSepolia = SUPPORTED_CHAIN_ID === 11155111;
  const rpcUrl = isSepolia
    ? process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
    : SUPPORTED_NETWORKS.LOCAL.rpcUrl;
  return new ethers.JsonRpcProvider(rpcUrl);
}

export function getReadOnlyServerContract() {
  const provider = getServerProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

export function getServerContract(entityType: "admin" | "university" | "company" = "admin") {
  const provider = getServerProvider();
  const isLocalDev =
    process.env.NODE_ENV !== "production" &&
    ((SUPPORTED_CHAIN_ID as number) === 31337 || process.env.NODE_ENV === "test");

  let pKey = process.env.PRIVATE_KEY?.trim() || "";

  if (!pKey) {
    if (!isLocalDev) {
      throw new Error(
        "Server Configuration Error: PRIVATE_KEY environment variable is required outside local development."
      );
    }
    // Only allowed for local test/hardhat emulation
    pKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  } else if (!pKey.startsWith("0x")) {
    pKey = `0x${pKey}`;
  }

  const wallet = new ethers.Wallet(pKey, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  return { provider, wallet, contract };
}
