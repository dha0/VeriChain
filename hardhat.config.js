require("@nomicfoundation/hardhat-toolbox");
const fs = require("fs");
const path = require("path");

// Load .env.local if present
try {
  require("dotenv").config({ path: path.resolve(__dirname, ".env.local") });
} catch (e) {}

// Ensure NODE_ENV is set to 'test' when running hardhat test
if (process.argv.includes("test") || process.env.npm_lifecycle_event === "test") {
  process.env.NODE_ENV = "test";
}

const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL || "https://gateway.tenderly.co/public/sepolia";
const rawPrivateKey = process.env.PRIVATE_KEY?.trim() || "";
const accounts = rawPrivateKey
  ? [rawPrivateKey.startsWith("0x") ? rawPrivateKey : `0x${rawPrivateKey}`]
  : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      allowUnlimitedContractSize: true,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: accounts,
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "JQIP9YQEPBCIN3KCQTXIZ7269FK4CUG7ZC",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
