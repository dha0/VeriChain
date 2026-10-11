# Blockchain Based Decentralised Document Verification for Hiring Process

A decentralized, tamper-proof academic and professional document verification platform built on Ethereum smart contracts, decentralized IPFS storage, and client-side cryptographic hashing. Engineered to eliminate credential fraud, forged degrees, and modified marksheets in IT hiring and corporate recruitment.

---

## Table of Contents

- [Overview & Problem Statement](#overview--problem-statement)
- [Key Features](#key-features)
- [System Architecture & Portals](#system-architecture--portals)
- [Technology Stack](#technology-stack)
- [Project Directory Structure](#project-directory-structure)
- [Prerequisites](#prerequisites)
- [Local Installation & Setup](#local-installation--setup)
- [MetaMask Setup & Wallet Configuration](#metamask-setup--wallet-configuration)
- [Deploying to Ethereum Sepolia Testnet](#deploying-to-ethereum-sepolia-testnet)
- [Automated Smart Contract Testing](#automated-smart-contract-testing)
- [Team Collaboration Guide (VS Code)](#team-collaboration-guide-vs-code)
- [Portal Roles & User Workflows](#portal-roles--user-workflows)
- [License](#license)

---

## Overview & Problem Statement

In conventional IT recruitment, verifying candidate academic records, university transcripts, and employment credentials relies on slow, centralized third-party screening agencies or easily forged paper documents and modified PDFs. 

This platform replaces centralized trust with **cryptographic truth**:
1. **Immutable Smart Contract Proof**: When an accredited university issues a document, its 32-byte SHA-256 fingerprint, IPFS CID, document type, student ID, and timestamp are anchored directly onto the Ethereum ledger.
2. **Mandatory Decentralized Storage**: Official documents are pinned to Pinata IPFS; raw files never live in vulnerable centralized web servers.
3. **Client-Side SHA-256 Tamper Audit**: Recruiter uploads applicant PDFs directly in their browser. The client computes the SHA-256 hash using the native W3C Web Crypto API and compares it bit-for-bit with the blockchain anchor. Even altering a single character or digit flips the hash completely.
4. **Client-Side AES-256-GCM Privacy**: Universities can encrypt sensitive documents with AES-256-GCM before pinning to IPFS, ensuring only authorized candidates and verifiers with the secret key can decrypt the original payload.
5. **Decentralized Role-Based Access (RBAC)**: No hardcoded demo passwords. Access is verified directly against on-chain smart contract authority mappings.

---

## Key Features

- **Multi-Document Support**: Supports multiple distinct credential types:
  - Degree Certificate
  - Marksheet
  - Experience Certificate
  - Academic Transcript
  - Professional Certificate
- **4-Stage Credential Lifecycle**:
  - `Active (0)`: Valid, authentic, and verified.
  - `Suspended (2)`: Temporarily placed on hold by the issuing university pending review.
  - `Reactivated (0)`: Restored back to Active status once cleared.
  - `Revoked (1)`: Permanently invalidated on-chain with official reason logged.
- **Two-Tier Verification Engine**:
  - **Mode 1 (Quick Record Screening)**: Verifies candidate enrollment, university accreditation status, and latest active credential by USN.
  - **Mode 2 (Deep Cryptographic Tamper Audit)**: Computes file SHA-256 client-side and validates exact bitstream match against the smart contract.
- **Official ASCII & Border Verification Receipt**: Generates a printable, formal blockchain verification certificate for HR audit files.
- **On-Chain Relational Audit Trails**: All verification attempts (both successful and fraudulent) are permanently logged on-chain and retrievable via `getVerificationsByCompany` and `getVerificationsByCredential`.
- **Secret Administrator Gateway**: Admin console is concealed from public navigation and accessible strictly via `/admin-login` by connecting the deployer MetaMask wallet.
- **Gasless Student Locker**: Candidates search and view their credentials using their USN with zero gas fees, generate shareable QR verification cards, and decrypt documents in-browser.

---

## System Architecture & Portals

The application features 3 customized, high-contrast visual portals:

| Portal | Route | Visual Theme | Description |
|---|---|---|---|
| **Public Gateway** | `/` | Cyber Deep Slate | System statistics, platform capabilities, and public verification access. |
| **Secret Admin** | `/admin-login` → `/admin` | Royal Purple & Indigo | Smart contract owner console to accredit universities and authorize IT hiring partners. |
| **University Authority** | `/university` | Deep Academic Navy & Sky Blue | Student registration, multi-document credential issuance, AES-256 encryption, and lifecycle controls. |
| **Company Recruiter** | `/company` | Cyber Corporate Emerald & Slate | Mode 1 & Mode 2 candidate verification, tamper audit engine, official ASCII receipts, and audit history. |
| **Student Locker** | `/student` | Neon Indigo & Holographic Cyan | Student credential portfolio, QR code verification generator, and in-browser decryption assistant. |
| **Public Verifier** | `/verify` & `/verify/[id]` | Electric Blue | Open verification interface for external recruiters and HR evaluators. |

---

## Technology Stack

- **Frontend & App Framework**: [Next.js 14](https://nextjs.org/) (App Router, Server Components & Client Components)
- **Programming Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons & UI Elements**: [Lucide React](https://lucide.dev/), [qrcode.react](https://www.npmjs.com/package/qrcode.react)
- **Smart Contract Language**: [Solidity 0.8.20](https://soliditylang.org/) (EVM Target: Paris, `viaIR: true`)
- **Blockchain Framework**: [Hardhat](https://hardhat.org/)
- **Web3 Library**: [Ethers.js v6](https://docs.ethers.org/v6/)
- **Decentralized Storage**: [Pinata IPFS](https://www.pinata.cloud/)
- **Cryptographic Engine**: Native Browser W3C Web Crypto (`crypto.subtle` SHA-256 & AES-256-GCM)

---

## Project Directory Structure

```text
├── app/
│   ├── admin/page.tsx               # Root administrator governance console
│   ├── admin-login/page.tsx         # Secret admin wallet gateway
│   ├── api/ipfs/upload/route.ts     # Server-side Pinata IPFS pinning route (no fake CIDs)
│   ├── company/page.tsx             # Corporate recruiter verification terminal
│   ├── login/page.tsx               # Decentralized portal access selector
│   ├── student/page.tsx             # Student candidate locker & QR generator
│   ├── university/page.tsx          # University issuance & lifecycle governance
│   ├── verify/
│   │   ├── page.tsx                 # Public verification search engine
│   │   └── [credentialId]/page.tsx  # Dynamic credential verification & ASCII receipt
│   ├── globals.css                  # Core CSS tokens & styles
│   ├── layout.tsx                   # Master layout with responsive navbar & footer
│   └── page.tsx                     # Landing page with live blockchain counters
├── components/
│   ├── Footer.tsx                   # System footer with project attribution
│   ├── Navbar.tsx                   # Navigation header with role badge & logout
│   ├── RoleGuard.tsx                # Client-side RBAC protection component
│   └── StatusBadge.tsx              # Dynamic status pill (Active, Suspended, Revoked, etc.)
├── context/
│   └── AuthContext.tsx              # Decentralized RBAC context (Wallet & Code verification)
├── contracts/
│   ├── ITHiringMarksVerification.sol# Core Solidity smart contract
│   ├── contractABI.json             # Exported contract ABI (46 methods/events)
│   └── contractAddress.ts           # Deployed contract address & network metadata
├── lib/
│   ├── crypto.ts                    # SHA-256 hashing & AES-256-GCM encryption/decryption
│   ├── ethereum.ts                  # Ethers.js provider, signer, and contract factory
│   └── pinata.ts                    # Pinata upload client & IPFS gateway resolver
├── scripts/
│   └── deploy.js                    # Automated deployment & address export script
├── test/
│   └── ITHiringMarksVerification.test.js # Hardhat test suite (27 passing tests)
├── hardhat.config.js                # Hardhat network & compiler configuration (viaIR: true)
├── package.json                     # Dependencies and build scripts
└── tsconfig.json                    # TypeScript compiler options
```

---

## Prerequisites

Before running the project, ensure you have installed:
1. **Node.js**: `v18.17.0` or higher (`v20.x` recommended). Check with:
   ```bash
   node -v
   ```
2. **npm**: `v9.x` or higher. Check with:
   ```bash
   npm -v
   ```
3. **MetaMask**: Browser extension installed on Chrome, Brave, Edge, or Firefox ([metamask.io](https://metamask.io/)).

---

## Local Installation & Setup

### Step 1: Clone or Open the Repository
```bash
git clone <repository-url>
cd Project
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Create a `.env.local` file in the root directory:
```env
# Smart Contract Deployment Address (Defaults to Local Hardhat #0)
NEXT_PUBLIC_CONTRACT_ADDRESS="0x5FbDB2315678afecb367f032d93F642f64180aa3"
NEXT_PUBLIC_CHAIN_ID=31337

# Pinata IPFS Gateway & Secret JWT
NEXT_PUBLIC_IPFS_GATEWAY="https://gateway.pinata.cloud/ipfs"
PINATA_JWT="your_pinata_jwt_here"
```

> **Note**: To upload documents to real IPFS, obtain a free API key and JWT from [Pinata Cloud](https://app.pinata.cloud/keys) and paste it into `PINATA_JWT`.

---

## MetaMask Setup & Wallet Configuration

### 1. Start the Local Hardhat Node
In your first terminal, run:
```powershell
npx hardhat node
```
This spins up a local Ethereum JSON-RPC testnet on `http://127.0.0.1:8545` and outputs 20 funded test accounts with 10,000 ETH each. Keep this terminal open.

### 2. Configure MetaMask for Local Hardhat
1. Open MetaMask, click the network dropdown at top-left, and select **Add Network → Add Network Manually**.
2. Enter the following details:
   - **Network Name**: `Hardhat Localhost`
   - **New RPC URL**: `http://127.0.0.1:8545`
   - **Chain ID**: `31337`
   - **Currency Symbol**: `ETH`
3. Save the network and switch to it.

### 3. Import Hardhat Test Accounts
Copy the private keys printed in the `npx hardhat node` terminal output:
- **Account #0 (Deployer / Admin)**: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- **Account #1 (University)**: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`
- **Account #2 (Company)**: `0x5de4111afa1a4b94908f83103eb2f95408080f08149e29a9e6eb78c850325d36`

In MetaMask:
- Click **Account Circle → Add account or hardware wallet → Import account**.
- Paste the private key. You now have funded test accounts to interact with the platform.

### 4. Deploy the Smart Contract
In a second terminal, execute:
```powershell
npx hardhat run scripts/deploy.js --network localhost
```
This deploys `ITHiringMarksVerification.sol` and automatically updates `contracts/contractAddress.ts` with the deployed address.

### 5. Start the Next.js Web Application
In your third terminal:
```powershell
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deploying to Ethereum Sepolia Testnet

1. Obtain a free Sepolia RPC URL from [Alchemy](https://www.alchemy.com/) or [Infura](https://www.infura.io/).
2. Request free Sepolia test ETH from [sepoliafaucet.com](https://sepoliafaucet.com/) to your MetaMask wallet.
3. Add the following to `.env.local`:
   ```env
   SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY"
   PRIVATE_KEY="YOUR_WALLET_PRIVATE_KEY"
   PINATA_JWT="YOUR_PINATA_JWT"
   ```
4. Deploy to Sepolia:
   ```powershell
   npx hardhat run scripts/deploy.js --network sepolia
   ```
5. Update `.env.local` with the deployed address:
   ```env
   NEXT_PUBLIC_CONTRACT_ADDRESS="0xYourDeployedAddress"
   NEXT_PUBLIC_CHAIN_ID=11155111
   ```
6. Rebuild and run the application:
   ```powershell
   npm run build
   npm run start
   ```

---

## Automated Smart Contract Testing

The platform includes an extensive test suite verifying all 10 architectural enhancements:

```powershell
npx hardhat test
```

### Test Coverage Highlights:
- **Deployment & Admin Permissions**: Verifies deployer ownership and zero counters initialization.
- **University Authority Management**: Tests university accreditation, deactivation, reactivation, duplicate prevention, and authorization checks.
- **Company Management**: Tests corporate partner registration and duplicate prevention.
- **Student Onboarding**: Enforces student uniqueness by USN and validates percentage bounds.
- **Credential Issuance**: Tests multi-document minting with SHA-256 hash and IPFS CID.
- **Two-Tier Verification & Tamper Detection**: Tests Mode 1 USN verification, Mode 2 exact hash matching, and immediate flagging of modified document hashes.
- **Full Credential Lifecycle**: Tests suspension, reactivation, and permanent revocation.
- **Relational Audit Logging**: Tests querying verifications by company and by credential.

**Status**: `27 passing (1s)` (100% pass rate).

---

## Team Collaboration Guide (VS Code)

If you are sharing this project with your team or pushing to GitHub:

### Files & Folders to Share:
- `contracts/`: Smart contract (`ITHiringMarksVerification.sol`), ABI (`contractABI.json`), address config (`contractAddress.ts`).
- `scripts/`: Deployment script (`deploy.js`).
- `test/`: Test suite (`ITHiringMarksVerification.test.js`).
- `app/`: Next.js pages, layouts, and API routes.
- `components/`, `context/`, `lib/`, `types/`: Core libraries and components.
- `hardhat.config.js`, `package.json`, `tsconfig.json`, `tailwind.config.js`.
- `.env.example`: Template for environment variables.

### Files EXCLUDED from sharing (Included in `.gitignore`):
- `node_modules/`: Package dependencies (reinstalled via `npm install`).
- `.next/`: Next.js build output.
- `artifacts/` & `cache/`: Generated Hardhat artifacts.
- `.env.local`: Contains personal private keys and API tokens.

### Quick Setup for Teammates:
```bash
git clone <repo-url>
cd Project
npm install
npx hardhat test
npm run dev
```

---

## Portal Roles & User Workflows

### 1. Platform Administrator
- **Access Route**: Secret URL [`/admin-login`](http://localhost:3000/admin-login).
- **Authentication**: Connect MetaMask wallet. The system verifies if `msg.sender == contract.admin()`.
- **Capabilities**:
  - Accredit and register new educational universities with their name, institution code, and EVM wallet address.
  - Authorize IT corporate recruiters with their company name, partner code, and EVM wallet address.
  - Activate or deactivate institutions and companies.
  - View real-time network-wide verification telemetry and audit logs.

### 2. University Authority Portal
- **Access Route**: [`/university`](http://localhost:3000/university).
- **Authentication**: Connect registered University MetaMask wallet or verify registered institution code (e.g. `VTU-KA-001`).
- **Capabilities**:
  - **Student Registration**: Register candidate USN, name, degree course, graduation year, and academic percentage.
  - **Multi-Document Issuance**: Issue Degree Certificates, Marksheets, Experience Certificates, Transcripts, or Professional Certificates.
  - **Client-Side Hashing & Encryption**: Computes document SHA-256 hash in-memory and optionally encrypts payload with AES-256-GCM before pinning to Pinata IPFS.
  - **Lifecycle Control**: Suspend credentials under investigation, reactivate cleared credentials, or permanently revoke invalid credentials with reason logged.

### 3. Company Recruiter Portal
- **Access Route**: [`/company`](http://localhost:3000/company).
- **Authentication**: Connect authorized Company MetaMask wallet or verify corporate partner code (e.g. `INFY-BLR-01`).
- **Capabilities**:
  - **Mode 1 Quick Screening**: Enter candidate USN to verify enrollment, university standing, and active credential status in seconds.
  - **Mode 2 Cryptographic Tamper Test**: Enter Credential ID and upload the candidate's PDF. The browser calculates the SHA-256 hash and matches it bit-for-bit against the Ethereum ledger.
  - **Official ASCII Receipt**: Generates a standardized, printable verification receipt confirming authentic bitstream or flagging fraudulent alteration.
  - **Audit Trail**: View permanent on-chain history of all verifications executed by the hiring team.

### 4. Student Digital Locker
- **Access Route**: [`/student`](http://localhost:3000/student).
- **Authentication**: Enter student USN (e.g. `1RV21CS001`) — no wallet or gas required.
- **Capabilities**:
  - View verified student profile, university accreditation badge, and cumulative marks.
  - Browse issued credentials with version numbers and on-chain SHA-256 digests.
  - Generate a scannable recruiter QR verification code.
  - In-browser AES-256 decryption tool to decrypt private credentials using the issued secret key.

### 5. Public Verification Engine
- **Access Route**: [`/verify`](http://localhost:3000/verify) & [`/verify/[credentialId]`](http://localhost:3000/verify/1).
- Open to any recruiter, HR manager, or background auditor to verify documents against the smart contract.

---

## Production Build & Verification

To verify that the application compiles and builds for production deployment:

```powershell
# Type check TypeScript codebase
npx tsc --noEmit

# Compile production Next.js bundle
npm run build
```

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.
