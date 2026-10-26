// Auto-generated during deployment on 2026-10-25T14:38:04.471Z
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const SUPPORTED_NETWORKS = {
  LOCAL: {
    chainId: "0x7a69", // 31337 in hex
    chainIdDecimal: 31337,
    name: "Hardhat Localhost",
    rpcUrl: "http://127.0.0.1:8545",
    explorerUrl: "",
  },
  SEPOLIA: {
    chainId: "0xaa36a7", // 11155111 in hex
    chainIdDecimal: 11155111,
    name: "Ethereum Sepolia Testnet",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://gateway.tenderly.co/public/sepolia",
    explorerUrl: "https://sepolia.etherscan.io",
  },
};

export const SUPPORTED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 31337;
export const SUPPORTED_NETWORK_NAME = "Hardhat Localhost";
