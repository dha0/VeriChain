import { BrowserProvider, JsonRpcProvider, Contract } from "ethers";
import CONTRACT_ABI from "@/contracts/contractABI.json";
import {
  CONTRACT_ADDRESS,
  SUPPORTED_NETWORKS,
  SUPPORTED_CHAIN_ID,
  SUPPORTED_NETWORK_NAME,
} from "@/contracts/contractAddress";
import { UserRole } from "@/types";

declare global {
  interface Window {
    ethereum?: any;
  }
}

/**
 * Checks if MetaMask or an EVM wallet is installed.
 */
export function isMetaMaskInstalled(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

/**
 * Gets the current Chain ID from MetaMask.
 */
export async function getCurrentChainId(): Promise<number | null> {
  if (!isMetaMaskInstalled()) return null;
  try {
    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    return parseInt(chainIdHex, 16);
  } catch (e) {
    return null;
  }
}

/**
 * Switches network to Hardhat Localhost (31337) or prompts user to add it.
 */
export async function switchToHardhatLocal(): Promise<void> {
  if (!isMetaMaskInstalled()) return;

  const target = SUPPORTED_NETWORKS.LOCAL;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target.chainId }],
    });
  } catch (switchError: any) {
    // 4902 error code means the chain has not been added to MetaMask
    if (switchError.code === 4902 || switchError.message?.includes("Unrecognized chain")) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: target.chainId,
            chainName: target.name,
            nativeCurrency: {
              name: "ETH",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: [target.rpcUrl],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Switches network to Sepolia (11155111) or prompts user to add it.
 */
export async function switchToSepolia(): Promise<void> {
  if (!isMetaMaskInstalled()) return;

  const target = SUPPORTED_NETWORKS.SEPOLIA;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target.chainId }],
    });
  } catch (switchError: any) {
    console.warn("wallet_switchEthereumChain error:", switchError);
    if (
      switchError.code === 4902 ||
      switchError.code === -32603 ||
      switchError.message?.includes("Unrecognized chain") ||
      switchError.message?.includes("wallet_addEthereumChain") ||
      switchError.message?.includes("Try adding the chain")
    ) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: target.chainId,
            chainName: "Sepolia",
            nativeCurrency: {
              name: "Sepolia ETH",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: [
              "https://ethereum-sepolia-rpc.publicnode.com",
              "https://rpc.sepolia.org",
              "https://1rpc.io/sepolia",
            ],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Ensures wallet is connected to Sepolia (11155111).
 */
export async function ensureCorrectNetwork(): Promise<void> {
  if (!isMetaMaskInstalled()) return;
  const currentChain = await getCurrentChainId();
  if (currentChain === 11155111) {
    return;
  }
  await switchToSepolia();
}

/**
 * Formats low-level ethers/RPC errors into actionable human messages.
 */
export function parseBlockchainError(err: any): string {
  if (!err) return "An unexpected error occurred.";

  const message = err.message || err.toString();

  if (
    err.code === "BAD_DATA" ||
    message.includes("could not decode result data") ||
    message.includes('value="0x"')
  ) {
    return (
      "Network Mismatch / Contract Not Found: Your wallet is connected to an unsupported network (e.g. MON or wrong chain). " +
      `Please switch MetaMask to '${SUPPORTED_NETWORK_NAME}' (Chain ID: ${SUPPORTED_CHAIN_ID}) and ensure the smart contract is deployed.`
    );
  }

  if (message.includes("user rejected") || err.code === 4001) {
    return "Transaction or connection was cancelled in MetaMask.";
  }

  if (err.reason) {
    return err.reason;
  }

  return message;
}

/**
 * Requests wallet connection and returns the connected address.
 */
export async function connectWallet(): Promise<string> {
  if (!isMetaMaskInstalled()) {
    throw new Error("MetaMask is not installed. Please install MetaMask to use this application.");
  }

  // Ensure network first
  try {
    await ensureCorrectNetwork();
  } catch (netErr) {
    console.warn("User did not switch network:", netErr);
  }

  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts found. Please unlock MetaMask.");
  }

  return accounts[0];
}

/**
 * Gets an ethers BrowserProvider instance.
 */
export function getProvider(): BrowserProvider {
  if (!isMetaMaskInstalled()) {
    throw new Error("MetaMask is not available.");
  }
  return new BrowserProvider(window.ethereum);
}

/**
 * Gets a Contract instance for write transactions (connected with Signer).
 */
export async function getContractWithSigner(): Promise<Contract> {
  await ensureCorrectNetwork();
  const provider = getProvider();
  const signer = await provider.getSigner();
  return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

/**
 * Gets a Contract instance for read operations.
 * Connects directly via public JSON-RPC to Sepolia so that ANY visitor on ANY device
 * (mobile phone, laptop without MetaMask, incognito) can read stats, verify certificates,
 * and view blockchain state without requiring MetaMask or being on the wrong network.
 */
export function getContractReadOnly(): Contract {
  const primaryRpc =
    SUPPORTED_CHAIN_ID === 11155111
      ? (process.env.NEXT_PUBLIC_RPC_URL || SUPPORTED_NETWORKS.SEPOLIA.rpcUrl)
      : SUPPORTED_NETWORKS.LOCAL.rpcUrl;

  try {
    const provider = new JsonRpcProvider(primaryRpc, SUPPORTED_CHAIN_ID, {
      staticNetwork: true,
    });
    return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  } catch (err) {
    console.warn("Direct RPC init failed, checking fallback:", err);
    if (isMetaMaskInstalled()) {
      try {
        const browserProvider = new BrowserProvider(window.ethereum);
        return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, browserProvider);
      } catch (e) {}
    }
    const backupProvider = new JsonRpcProvider(
      "https://ethereum-sepolia-rpc.publicnode.com",
      11155111,
      { staticNetwork: true }
    );
    return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, backupProvider);
  }
}

/**
 * Detects the user role by checking contract state.
 */
export async function detectUserRole(
  address: string
): Promise<{ role: UserRole; entityId?: number }> {
  try {
    const contract = getContractReadOnly();

    // 1. Check if Admin
    const adminAddress = await contract.admin();
    if (adminAddress.toLowerCase() === address.toLowerCase()) {
      return { role: "admin" };
    }

    // 2. Check if Registered University
    const uIdBigInt = await contract.universityAddressToId(address);
    const uId = Number(uIdBigInt);
    if (uId > 0) {
      const uData = await contract.getUniversity(uId);
      if (uData.active) {
        return { role: "university", entityId: uId };
      }
    }

    // 3. Check if Registered Company
    const cIdBigInt = await contract.companyAddressToId(address);
    const cId = Number(cIdBigInt);
    if (cId > 0) {
      const cData = await contract.getCompany(cId);
      if (cData.active) {
        return { role: "company", entityId: cId };
      }
    }

    return { role: "guest" };
  } catch (err) {
    console.error("Error detecting role:", err);
    return { role: "guest" };
  }
}
