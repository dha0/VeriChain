// Auto-generated during deployment on 2026-10-26T15:47:51.317Z
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x20Eb97621eDB01106b9FA712828926cBdfE0dda3";

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
    rpcUrl: "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
  },
};

export const SUPPORTED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 11155111;
export const SUPPORTED_NETWORK_NAME = "Ethereum Sepolia Testnet";
