# Setup & Deployment Guide (Clean Clone)

This guide provides step-by-step instructions to configure, test, and deploy **VeriChain** starting from a clean repository clone. It covers both local development (Hardhat EVM) and live testnet deployment (Ethereum Sepolia).

---

## 1. Prerequisites

Ensure your development workstation has the following tools installed:

1. **Node.js**: `v18.17.0` or higher (Node `v20.x` LTS recommended).
   ```powershell
   node -v
   ```
2. **npm**: `v9.x` or higher.
   ```powershell
   npm -v
   ```
3. **Git**: Installed and configured.
   ```powershell
   git --version
   ```
4. **MetaMask**: Browser extension installed on Chrome, Brave, Edge, or Firefox ([metamask.io](https://metamask.io/)).

---

## 2. Step 1: Clone Repository & Install Dependencies

```powershell
# 1. Clone the repository
git clone <your-repository-url>
cd Project

# 2. Install dependencies
npm install
```

---

## 3. Step 2: Database Provisioning (PostgreSQL)

VeriChain requires a PostgreSQL database to manage candidate profiles, subject marks, access codes, and rate limits. You can use a free serverless PostgreSQL database from **Neon** ([neon.tech](https://neon.tech)) or **Supabase** ([supabase.com](https://supabase.com)):

1. Sign up for a free project at [neon.tech](https://neon.tech).
2. Create a new database project named `verichain`.
3. In the Neon Dashboard, copy the **Connection string** with **Connection Pooling enabled** (required for serverless Next.js functions):
   ```text
   postgresql://[user]:[password]@[host]-pooler.neon.tech/[dbname]?sslmode=require
   ```

---

## 4. Step 3: Configure Environment Variables

Create a `.env.local` file in the project root directory:

```powershell
# Copy example template
cp .env.example .env.local
```

Populate `.env.local` with your configuration:

```env
# ==============================================================================
# 1. DATABASE CONFIGURATION (PostgreSQL / Neon)
# ==============================================================================
# Pooled PostgreSQL connection string from Neon or Supabase
DATABASE_URL="postgresql://user:password@host-pooler.neon.tech/verichain?sslmode=require"

# Optional: Dedicated unpooled database URL used exclusively for running automated tests
# DATABASE_URL_TEST="postgresql://user:password@host-pooler.neon.tech/verichain_test?sslmode=require"

# ==============================================================================
# 2. SMART CONTRACT & BLOCKCHAIN CONFIGURATION
# ==============================================================================
# Deployed contract address (Updated automatically after running deploy.js)
NEXT_PUBLIC_CONTRACT_ADDRESS="0x5FbDB2315678afecb367f032d93F642f64180aa3"

# Chain ID: 31337 for Local Hardhat Node | 11155111 for Ethereum Sepolia Testnet
NEXT_PUBLIC_CHAIN_ID=31337

# Public JSON-RPC Endpoint (Alchemy, Infura, or Localhost)
NEXT_PUBLIC_RPC_URL="http://127.0.0.1:8545"

# Private key of the backend relayer account (DO NOT include '0x' prefix)
# For local dev, Hardhat Account #0 is used by default if left blank
PRIVATE_KEY=""

# ==============================================================================
# 3. APPLICATION & RELAY SECURITY SECRETS
# ==============================================================================
# Cryptographically random string (min 32 characters) for signing JWT session cookies
JWT_SECRET="your_secure_random_jwt_secret_minimum_32_characters_long"

# Dedicated secret string (min 32 characters) used to HMAC hash candidate OTPs
OTP_SECRET="your_secure_random_otp_secret_minimum_32_characters_long"

# Internal relayer header secret (min 32 characters) protecting backend relay calls
RELAY_SECRET_KEY="your_secure_relay_secret_key_minimum_32_characters_long"

# ==============================================================================
# 4. DECENTRALIZED STORAGE (PINATA IPFS)
# ==============================================================================
# Pinata Master Bearer JWT (Obtain free from app.pinata.cloud/keys)
PINATA_JWT=""

# Dedicated IPFS Gateway (e.g. https://gateway.pinata.cloud/ipfs)
NEXT_PUBLIC_IPFS_GATEWAY="https://gateway.pinata.cloud/ipfs"

# ==============================================================================
# 5. OPTIONAL: PRODUCTION EMAIL DELIVERY (RESEND)
# ==============================================================================
# Leave blank during local development (OTPs will print to terminal console)
RESEND_API_KEY=""
EMAIL_FROM="VeriChain Security <auth@verichain.network>"
```

> [!IMPORTANT]
> Never commit `.env.local` to source control. The file is already listed in `.gitignore`.

---

## 5. Step 4: Apply Database Schema

Push the Prisma schema to your PostgreSQL database:

```powershell
# Push tables to Neon PostgreSQL
npx prisma db push

# Generate Prisma Client
npx prisma generate
```

This creates all required tables: `InstitutionCredential`, `AccessRequest`, `StudentProfile`, `StudentMark`, `StudentMarkVersion`, `StudentWalletLink`, `StudentAchievement`, `StudentOTP`, `AuthNonce`, and `RateLimitCounter`.

---

## 6. Step 5: Option A — Local Hardhat Development

### 1. Launch the Local Hardhat Node
In your first terminal:
```powershell
npx hardhat node
```
This spins up a local Ethereum JSON-RPC testnet on `http://127.0.0.1:8545` with 20 pre-funded test accounts. Keep this terminal running.

### 2. Deploy Smart Contracts to Local Node
In a second terminal:
```powershell
npx hardhat run scripts/deploy.js --network localhost
```
This deploys `ITHiringMarksVerification.sol`, sets the authorized relayer, and automatically updates `contracts/contractAddress.ts` with the new address.

### 3. Configure MetaMask for Localhost
1. Open MetaMask $\rightarrow$ **Add Network $\rightarrow$ Add Network Manually**.
   - **Network Name**: `Hardhat Localhost`
   - **New RPC URL**: `http://127.0.0.1:8545`
   - **Chain ID**: `31337`
   - **Currency Symbol**: `ETH`
2. Import Hardhat test accounts using the private keys printed in the `npx hardhat node` terminal output:
   - Account #0 (Admin / Deployer)
   - Account #1 (University Authority)
   - Account #2 (Corporate Recruiter)

### 4. Start Next.js Development Server
In your third terminal:
```powershell
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 7. Step 5: Option B — Ethereum Sepolia Testnet Deployment

### 1. Acquire Sepolia ETH
1. Create a MetaMask wallet account for testnet deployment.
2. Obtain free Sepolia test ETH from [sepoliafaucet.com](https://sepoliafaucet.com/) or [cloud.google.com/application/faucets/ethereum/sepolia](https://cloud.google.com/application/faucets/ethereum/sepolia).

### 2. Configure Sepolia Variables in `.env.local`
```env
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY"
PRIVATE_KEY="YOUR_SEPOLIA_DEPLOYER_PRIVATE_KEY_WITHOUT_0X"
```

### 3. Deploy to Sepolia
```powershell
npx hardhat run scripts/deploy.js --network sepolia
```
Upon successful deployment, update `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local` with the address printed in the console.

---

## 8. Step 6: Automated Testing & Validation

Execute the test suites to ensure full system integrity:

```powershell
# 1. Compile Smart Contracts
npx hardhat compile

# 2. Run Comprehensive Test Suite (100+ automated test assertions)
npx hardhat test

# 3. Type-check TypeScript Codebase
npx tsc --noEmit

# 4. Validate Production Build
npm run build
```

---

## 9. Verification & Health Check

After launching the dev server (`npm run dev`), verify these key endpoints:

1. **Public Gateway**: [http://localhost:3000](http://localhost:3000) (Loads landing page with live blockchain counters).
2. **Session Health**: [http://localhost:3000/api/auth/session](http://localhost:3000/api/auth/session) (Returns `{ "authenticated": false, "session": null }`).
3. **Template Route**: [http://localhost:3000/api/students/template?format=csv](http://localhost:3000/api/students/template?format=csv) (Downloads blank CSV template).
4. **Admin Portal**: [http://localhost:3000/admin-login](http://localhost:3000/admin-login) (Connects deployer wallet).
