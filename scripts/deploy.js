const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=======================================================");
  console.log("Deploying ITHiringMarksVerification to Network...");
  console.log("=======================================================");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer Account Address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account Balance:", hre.ethers.formatEther(balance), "ETH");

  // Get current network info
  const net = await hre.ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const isSepolia = chainId === 11155111;
  const networkName = isSepolia ? "Ethereum Sepolia Testnet" : "Hardhat Localhost";

  console.log(`Target Network: ${networkName} (Chain ID: ${chainId})`);

  // Deploy Contract
  const ContractFactory = await hre.ethers.getContractFactory("ITHiringMarksVerification");
  const contract = await ContractFactory.deploy();

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("\n Contract Successfully Deployed!");
  console.log("-------------------------------------------------------");
  console.log("Deployed Contract Address:", contractAddress);
  console.log("Admin Address:", deployer.address);

  // Authorized Relayer: Constructor sets deployer by default; check if separate RELAYER_ADDRESS is set
  const explicitRelayer = process.env.RELAYER_ADDRESS?.trim();
  if (explicitRelayer && explicitRelayer.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`Setting explicit authorized relayer: ${explicitRelayer}`);
    const tx = await contract.setAuthorizedRelayer(explicitRelayer);
    await tx.wait();
    console.log("Authorized relayer updated on-chain.");
  } else {
    const onChainRelayer = await contract.authorizedRelayer();
    console.log("Authorized Relayer Address:", onChainRelayer, "(configured automatically)");
  }
  console.log("-------------------------------------------------------");

  // Save address into contractAddress.ts with full network metadata
  const contractAddressTsPath = path.join(__dirname, "../contracts/contractAddress.ts");
  const tsContent = `// Auto-generated during deployment on ${new Date().toISOString()}
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "${contractAddress}";

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

export const SUPPORTED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || ${chainId};
export const SUPPORTED_NETWORK_NAME = "${networkName}";
`;
  fs.writeFileSync(contractAddressTsPath, tsContent);
  console.log(" Updated contracts/contractAddress.ts with deployed address.");

  // Save updated ABI into contracts/contractABI.json
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/ITHiringMarksVerification.sol/ITHiringMarksVerification.json"
  );
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const abiPath = path.join(__dirname, "../contracts/contractABI.json");
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
    console.log(" Updated contracts/contractABI.json with compiled ABI.");
  }

  console.log("\nNext Steps:");
  console.log(`1. Ensure NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress} in .env.local`);
  console.log(`2. Ensure NEXT_PUBLIC_CHAIN_ID=${chainId} in .env.local`);
  console.log("3. Switch MetaMask to the corresponding network and connect!");
}

main().catch((error) => {
  console.error(" Deployment failed:", error);
  process.exitCode = 1;
});
