// Auto-generated during deployment on 2026-10-11T11:51:03.048Z
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0xd1156FdEec51bffBb897596fd97B1877ffB2aE61";

export const SUPPORTED_NETWORKS = {
  SEPOLIA: {
    chainId: "0xaa36a7", // 11155111 in hex
    chainIdDecimal: 11155111,
    name: "Ethereum Sepolia Testnet",
    rpcUrl: "https://gateway.tenderly.co/public/sepolia",
    explorerUrl: "https://sepolia.etherscan.io",
  },
  LOCAL: {
    chainId: "0x7a69", // 31337 in hex
    chainIdDecimal: 31337,
    name: "Hardhat Localhost",
    rpcUrl: "http://127.0.0.1:8545",
    explorerUrl: "",
  },
};

export const SUPPORTED_CHAIN_ID = 11155111;
export const SUPPORTED_NETWORK_NAME = "Ethereum Sepolia Testnet";
