import { ethers } from "ethers";
import CONTRACT_ABI from "@/contracts/contractABI.json";
import {
  CONTRACT_ADDRESS,
  SUPPORTED_NETWORKS,
  SUPPORTED_CHAIN_ID,
} from "@/contracts/contractAddress";

// Default Hardhat fallback private keys for development
const DEFAULT_HARDHAT_ADMIN_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_HARDHAT_UNI_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const DEFAULT_HARDHAT_COMP_KEY =
  "0x5de4111afa1a4b94908f83103eb2f95474831082d4ac969f31ee3021aa30c2da";

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
  const isSepolia = SUPPORTED_CHAIN_ID === 11155111;

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
