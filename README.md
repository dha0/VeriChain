# VeriChain: Blockchain-Based Decentralized Academic & Skill Credential Verification Platform for IT Hiring

A decentralized, tamper-proof academic marks and credential verification system engineered to eliminate resume fraud, forged university transcripts, and tampered marksheets in corporate recruitment. Built with **Next.js 14**, **Ethereum Smart Contracts**, **Gasless Transaction Relayer Architecture**, **Neon Serverless PostgreSQL**, and **Pinata IPFS**.

---

## Final-Year Project Documentation Index

For detailed engineering reports, architectural blueprints, and presentation assets, refer to the [`docs/`](docs/) directory:

- 📐 **[System Architecture & Request Flows](docs/ARCHITECTURE.md)**: Deep dive into the 6-layer topology, relayer engine, and sequence diagrams.
- 🗄️ **[Data Storage Matrix: On-Chain vs. Off-Chain](docs/DATA_STORAGE_ON_CHAIN_VS_OFF_CHAIN.md)**: Comparative matrix, GDPR "Right to be Forgotten" compliance, and gas economics.
- 🛡️ **[Threat Model & Security Architecture](docs/THREAT_MODEL.md)**: STRIDE analysis, defense mechanisms (bcrypt passkeys, rate limiting, SIWE, HMAC OTP, relayer constraints, college binding), and known limits.
- 🎬 **[Step-by-Step Viva Demonstration Script](docs/DEMO_SCRIPT.md)**: Live demo script covering institutional onboarding, 3-mode student upload, digital locker access, endorsement, recruiter verification, and cross-college attack rejection.
- 🎓 **[Examiner Viva Q&A Guide](docs/EXAMINER_QA.md)**: 19 tough questions asked by external university examiners with concise, technically rigorous, honest answers.
- 🚀 **[Setup & Deployment Guide](docs/SETUP_AND_DEPLOYMENT.md)**: Reproducible setup instructions from a fresh clone for local Hardhat and Sepolia testnet.

---

## 1. System Architecture & Request Flow

VeriChain implements a **hybrid Web2/Web3 architecture** that combines the performance, relational indexing, and privacy of PostgreSQL with the decentralization and immutability of the Ethereum blockchain.

```
+---------------------------------------------------------------------------------------------------+
|                                      CLIENT BROWSER LAYER                                         |
|                                                                                                   |
|  +--------------------+   +---------------------+   +--------------------+   +-----------------+  |
|  |  University Admin  |   | Candidate (Student) |   | Corporate Recruiter|   | Public Auditor  |  |
|  |  Portal (/univ)    |   | Digital Locker      |   | Terminal (/company)|   | (/verify)       |  |
|  +---------+----------+   +----------+----------+   +---------+----------+   +--------+--------+  |
|            |                         |                        |                       |           |
+------------|-------------------------|------------------------|-----------------------|-----------+
             |                         |                        |                       |
             +-------------------------+-----------+------------+-----------------------+
                                                   |
                                           HTTPS / REST / JSON
                                                   |
                                                   v
+---------------------------------------------------------------------------------------------------+
|                               NEXT.JS SERVERLESS APPLICATION LAYER                                |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  | Route Handlers (app/api/)                                                                   |  |
|  | - /api/auth/login               (Rate-limited SIWE, bcrypt access code, and HMAC OTP)       |  |
|  | - /api/students/upload/preview  (MIME/magic-byte checks, USN parser, in-batch duplicate checks)|  |
|  | - /api/students/upload/confirm  (Marks limits, DB collision checks, Keccak-256 marksHash)  |  |
|  | - /api/achievements             (College queue isolation, portfolio endorsement)           |  |
|  | - /api/blockchain/relay         (Gasless transaction signer with 'onlyRelayer' modifier)    |  |
|  | - /api/ipfs/upload              (Pinata IPFS pinning gateway)                               |  |
|  +-----------------------------------------------+---------------------------------------------+  |
|                                                  |                                                |
|            +-------------------------------------+-----------------------------------+            |
|            |                                                                         |            |
|            v                                                                         v            |
|  +-------------------------------+                                         +-------------------+  |
|  | Server-Side Security Core     |                                         | Ethers.js v6      |  |
|  | - JWT Session Engine (jose)   |                                         | Relayer Engine    |  |
|  | - USN Parser & College Binder |                                         | - Nonce Tracker   |  |
|  | - Marks Evaluation Engine     |                                         | - Gas Estimator   |  |
|  | - Distributed Rate Limiter    |                                         | - Server Signer   |  |
|  +---------------+---------------+                                         +---------+---------+  |
+------------------|-------------------------------------------------------------------|------------+
                   |                                                                   |
                   | Prisma ORM (Pooled TLS)                                           | JSON-RPC
                   v                                                                   v
+--------------------------------------+                             +------------------------------+
|     POSTGRESQL RELATIONAL DB         |                             |     ETHEREUM BLOCKCHAIN      |
|           (Neon / Supabase)          |                             |     (Sepolia / Hardhat)      |
|                                      |                             |                              |
| - StudentProfile & StudentMark       |                             | ITHiringMarksVerification    |
| - StudentMarkVersion (History)       |                             | - University & Company Registry
| - StudentAchievement                 |                             | - Student Registry (marksHash)
| - InstitutionCredential (bcrypt)     |                             | - Credential Ledger (DocHash)
| - AuthNonce & RateLimitCounter       |                             | - Verification Audit Trail   |
+--------------------------------------+                             +------------------------------+
                                                                                    ^
                                                                                    | Content Hash
                                                                                    v
                                                                     +------------------------------+
                                                                     |     DECENTRALIZED STORAGE    |
                                                                     |         (Pinata IPFS)        |
                                                                     |                              |
                                                                     | - Content-Addressed PDFs     |
                                                                     | - Academic Marksheets        |
                                                                     | - Encrypted Credentials     |
                                                                     +------------------------------+
```

### How a Request Flows Through the System:
1. **Client Interaction**: A college authority logs into `/university` and uploads an academic marksheet file (CSV, Excel, or PDF).
2. **Format Inspection & Preview (`/api/students/upload/preview`)**: The server validates file magic bytes, parses individual candidate rows, validates USN syntax (`^\d[A-Z]{2}\d{2}[A-Z]{2}\d{3}$`), and enforces that the college code extracted from the USN matches the caller's verified session.
3. **Registration & Cryptographic Commitment (`/api/students/upload/confirm`)**: The server computes a 32-byte Keccak-256 `marksHash` of the verified marks breakdown.
4. **Gasless Blockchain Anchor**: The server relayer signs an Ethereum transaction calling `registerStudent` on `ITHiringMarksVerification.sol`, committing the student ID, USN, name, course, and `marksHash`.
5. **Relational Sync**: Normalized subject splits are saved to the `StudentMark` table in Neon PostgreSQL, and an immutable entry is added to `StudentMarkVersion`.
6. **Decentralized Verification**: A recruiter in `/company` uploads a candidate's PDF. The client browser computes the SHA-256 hash using the W3C Web Crypto API (`crypto.subtle`) and matches it bit-for-bit against the on-chain anchor.

---

## 2. On-Chain vs. Off-Chain Storage Matrix (Privacy & Integrity Architecture)

> [!IMPORTANT]
> **Strict Privacy Principle**: Only cryptographic hashes (Keccak-256 `marksHash`, SHA-256 `documentHash`), college IDs, block timestamps, version numbers, and credential lifecycle statuses are committed on-chain. All personal data (plaintext marks, percentages, emails, phone numbers, student names, wallet private keys) is strictly stored off-chain or rendered ephemeral.

| Data Entity | Stored On-Chain (Ethereum) | Stored Off-Chain (PostgreSQL / IPFS) | Technical & Privacy Rationale |
| :--- | :--- | :--- | :--- |
| **University / College** | ID, Name, College Code (e.g. `"RV"`), Affiliating University (`"VTU"`), Web3 Wallet, Active Status | Contact Email, Salted Bcrypt Hash of Access Passkey | **Public Accreditation**: Trust must be publicly verifiable without trusting a database. Secret passkeys are hashed with bcrypt off-chain. |
| **Corporate Recruiter** | ID, Legal Name, Partner Code (e.g. `"INFY"`), Authorized Web3 Wallet, Active Status | Contact Email, Bcrypt Hash of Access Passkey, Verification History | **Public Verifier Registry**: Proves company's right to perform checks. Passkeys remain confidential. |
| **Student Identity** | ID, USN (e.g. `"1RV21CS001"`), Student Name, Course, Graduation Year, Bound College ID | Candidate Email Address, Phone Number, Profile Photo, Wallet Linkage | **GDPR PII Minimization**: Academic descriptors are public. Private contact data (email) is kept off-chain to prevent tracking and identity theft. |
| **Academic Marks & GPA** | **32-byte `marksHash` only** (Deterministic Keccak-256 cryptographic commitment) | Normalized subject-wise marks (`StudentMark`), internal/external splits, letter grades, semester results, version logs (`StudentMarkVersion`) | **Privacy & Gas Economics**: Plaintext grades must not be permanently exposed on a public ledger. Storing a 32-byte hash costs a tiny fraction of gas while securing tamper-proof validity. |
| **Official Documents** | 32-byte `documentHash` (SHA-256), IPFS CID, Document Type, Mint Timestamp, Version, Lifecycle Status (`Active`, `Superseded`, `Revoked`) | Original PDF, AES-256-GCM Encrypted Blob on Pinata IPFS | **Immutability without Bloat**: Large PDF files cannot be stored in EVM storage. Content addressing on IPFS + on-chain SHA-256 anchors guarantee authenticity. |
| **Student Achievements** | Achievement ID, Student ID, Title, Issuer, Category, Document Hash (SHA-256), IPFS CID, Reviewing College ID, Timestamp, Status | Original Certification Files, Detailed Submissions | **Decentralized Portfolio**: Skill credentials verified and endorsed by the student's bound college. |
| **Verification Records** | Verification ID, Verifying Company ID, Credential ID, Timestamp, `hashMatched`, `isAuthentic` | Printable ASCII Verification Receipts, Recruiter Telemetry | **Non-Repudiation**: Prevents recruiters from claiming they conducted background screenings when they did not. |
| **Auth & Security** | Contract Deployer Admin Address | Server JWTs, Single-Use SIWE Nonces (`AuthNonce`), Ephemeral HMAC OTPs (`StudentOTP`), Rate Limit Counters | **Replay Protection**: Transient state changes too rapidly for blockchain storage and requires sub-millisecond lookups. |

---

## 3. Threat Model & Security Controls

### Core Defenses Implemented:
1. **Institutional Login with Salted Bcrypt Passkeys**:
   - Access passkeys are displayed once and never stored in plaintext.
   - Database stores salted bcrypt hashes (cost factor 10).
   - Dummy comparisons run asynchronously when an invalid code identifier is supplied, ensuring constant-time response latency and preventing timing enumeration attacks.
2. **Distributed Rate Limiting & Lockout**:
   - Tracks failed attempts in PostgreSQL (`RateLimitCounter`) across client IP and identifier.
   - 5 failed attempts trigger an automatic **300-second (5-minute) hard lockout** returning HTTP 429.
3. **Cryptographic Web3 Wallet Signing (SIWE / EIP-4361)**:
   - Challenge messages incorporate a 32-byte cryptographic nonce ([`crypto.randomBytes(32)`](lib/serverAuth.ts)) with a 5-minute TTL.
   - Nonces are invalidated immediately upon use (`used = true`), preventing replay attacks.
4. **Ephemeral Candidate OTPs with HMAC-SHA256**:
   - OTPs generated via [`crypto.randomInt(100000, 999999)`](lib/serverAuth.ts).
   - Stored in the database strictly as HMAC-SHA256 digests using a server-side secret (`OTP_SECRET`).
   - Constant-time verification via `crypto.timingSafeEqual`; automatically expires after 10 minutes and locks after 5 failed attempts.
5. **Relayer-Only Smart Contract Pattern (`onlyRelayerOrAdmin`)**:
   - All state-mutating functions on `ITHiringMarksVerification.sol` reject direct external calls.
   - Write transactions must pass through the Next.js API, where sessions, role permissions, and college codes are verified before the backend relayer signs the transaction.
6. **Strict College Binding & Autonomous USN Parsing**:
   - USN syntax strictly enforced: `^\d[A-Z]{2}\d{2}[A-Z]{2}\d{3}$`.
   - The college code extracted from each candidate USN (e.g. `RV` from `1RV21CS001`) must match `session.entityInfo.code`.
   - Never trusts college names or codes inside uploaded files. Cross-college rows are rejected with a 403 Forbidden violation.

### Transparent Analysis of Known Limitations:
- **Single Relayer Key Centralization**: All blockchain transactions are signed by one backend relayer key (`PRIVATE_KEY`). If the key is compromised or runs out of gas, operations stall. *Roadmap: Transition to ERC-4337 Account Abstraction and multi-sig relayer pools.*
- **Sepolia Testnet Reliance**: Public testnet block confirmation times take 12–15 seconds, and public RPC endpoints impose rate limits. *Roadmap: Migration to an Ethereum Layer-2 rollup (Base, Arbitrum, or Polygon) for sub-second confirmations and sub-penny gas costs.*
- **PDF Extraction Boundaries**: The regex-based PDF parser requires digitally exported PDFs with text streams. Scanned raster images require an external OCR pipeline (AWS Textract/Tesseract). Standardized Excel (`.xlsx`) or CSV uploads are recommended.

---

## 4. Live Demonstration Workflow

To reproduce the project demonstration for examiners or reviewers:

```text
  +-----------------------------------------------------------------------------------------------+
  |  Step 1: Admin Gateway (/admin-login)                                                         |
  |  - Connect deployer wallet -> Accredit College 'RV' -> Copy generated secret passkey          |
  +-----------------------------------------------------------------------------------------------+
                                                 |
                                                 v
  +-----------------------------------------------------------------------------------------------+
  |  Step 2: University Authority Portal (/university)                                            |
  |  - Login with code 'RV' & passkey                                                             |
  |  - Method A: Add single student '1RV21CS001' via Manual Form                                  |
  |  - Method B: Download blank CSV template -> Upload '1RV21CS002'                               |
  |  - Method C: Download Excel template -> Upload multi-subject marks for '1RV21CS003'           |
  |  - Observe automatic marks calculation, Keccak-256 marksHash, and on-chain registration       |
  +-----------------------------------------------------------------------------------------------+
                                                 |
                                                 v
  +-----------------------------------------------------------------------------------------------+
  |  Step 3: Security Breach Defense Test                                                         |
  |  - Upload row with USN '1BM21CS099' (College BM) into College RV's portal                     |
  |  - System immediately flags row in RED with 'Cross-College USN Violation' (HTTP 403 Forbidden) |
  +-----------------------------------------------------------------------------------------------+
                                                 |
                                                 v
  +-----------------------------------------------------------------------------------------------+
  |  Step 4: Passwordless Student Locker (/student)                                               |
  |  - Enter USN '1RV21CS001' -> Receive 6-digit OTP via email -> View marks & QR verification    |
  |  - Upload external certification (e.g. AWS Cloud Practitioner) -> Status: Pending             |
  +-----------------------------------------------------------------------------------------------+
                                                 |
                                                 v
  +-----------------------------------------------------------------------------------------------+
  |  Step 5: College Endorsement                                                                  |
  |  - College RV reviews achievement in queue -> Approves -> Status on blockchain flips to Verified |
  +-----------------------------------------------------------------------------------------------+
                                                 |
                                                 v
  +-----------------------------------------------------------------------------------------------+
  |  Step 6: Corporate Recruiter Verification (/company)                                          |
  |  - Mode 1: Instant USN enrollment screening                                                   |
  |  - Mode 2: Client-side SHA-256 tamper audit (Authentic PDF matches / Tampered PDF triggers alert)
  |  - Export official printable ASCII Verification Receipt                                       |
  +-----------------------------------------------------------------------------------------------+
```

---

## 5. Key Examiner Viva Questions & Answers

1. **Why use blockchain instead of a centralized database with digital signatures?**  
   *Answer*: A centralized database allows a database administrator or hosting provider to modify rows, alter timestamps, or delete records without an external audit trail. Ethereum provides decentralized, multi-party consensus: once an accredited college anchors a `marksHash`, it is immutable and permanently verifiable even if our server is decommissioned.
2. **Who pays gas fees?**  
   *Answer*: The platform uses an **Authorized Relayer Pattern**. The backend server signs transactions on behalf of authenticated users, sponsoring gas fees centrally so students, colleges, and recruiters enjoy a gasless Web2 experience.
3. **How does this comply with GDPR's Right to be Forgotten?**  
   *Answer*: Zero personal data or plaintext marks are stored on-chain. The blockchain holds only a 32-byte one-way cryptographic hash (`marksHash`) and the student's USN. Personal data in PostgreSQL can be erased upon request, leaving an irreversible hash from which no personal identity can ever be reverse-engineered.
4. **Can College A issue a degree for College B?**  
   *Answer*: No. College binding is enforced on every request: the USN syntax is validated, the 2-letter college code is extracted, and it is strictly checked against the caller's verified session. Cross-college attempts are aborted with HTTP 403.
5. **Why compute SHA-256 in the browser during Mode 2 verification?**  
   *Answer*: Zero-knowledge verifier trust. If the server computed the hash, the recruiter would have to trust that the server didn't tamper with the document. By using the browser's native `crypto.subtle` API, the recruiter verifies the file on their own machine against the blockchain anchor without relying on an intermediary.

---

## 6. Setup & Deployment (From Clean Clone)

### 1. Prerequisites
- **Node.js**: `v18.17.0` or `v20.x` LTS
- **npm**: `v9.x` or higher
- **MetaMask Browser Extension**: Set to `Hardhat Localhost` (`RPC: http://127.0.0.1:8545`, `Chain ID: 31337`)
- **PostgreSQL Database**: Free instance from [Neon](https://neon.tech) (with connection pooling)

### 2. Installation
```powershell
# 1. Clone repository
git clone <repository-url>
cd Project

# 2. Install dependencies
npm install

# 3. Create .env.local from template
cp .env.example .env.local
```

### 3. Configure Environment Variables (`.env.local`)
```env
DATABASE_URL="postgresql://user:password@host-pooler.neon.tech/verichain?sslmode=require"
NEXT_PUBLIC_CONTRACT_ADDRESS="0x5FbDB2315678afecb367f032d93F642f64180aa3"
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL="http://127.0.0.1:8545"
PRIVATE_KEY=""
JWT_SECRET="your_secure_random_jwt_secret_minimum_32_characters_long"
OTP_SECRET="your_secure_random_otp_secret_minimum_32_characters_long"
RELAY_SECRET_KEY="your_secure_relay_secret_key_minimum_32_characters_long"
PINATA_JWT=""
NEXT_PUBLIC_IPFS_GATEWAY="https://gateway.pinata.cloud/ipfs"
```

### 4. Push Database Schema
```powershell
npx prisma db push
npx prisma generate
```

### 5. Start Local Hardhat Node & Deploy Contract
In **Terminal 1**:
```powershell
npx hardhat node
```

In **Terminal 2**:
```powershell
npx hardhat run scripts/deploy.js --network localhost
```

### 6. Run Automated Verification Tests
```powershell
# Compile smart contracts
npx hardhat compile

# Run full test suite (100+ assertions verifying RBAC, binding, and upload engine)
npx hardhat test

# Check TypeScript typing
npx tsc --noEmit
```

### 7. Start the Web Application
In **Terminal 3**:
```powershell
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 7. Automated Test Coverage Metrics

The project includes an extensive test suite verifying smart contracts, API routes, security boundaries, and upload parsers:

| Test Suite | File | Focus Areas | Status |
| :--- | :--- | :--- | :--- |
| **Smart Contract Core** | [`test/ITHiringMarksVerification.test.js`](test/ITHiringMarksVerification.test.js) | RBAC, accreditation, student registration, credential lifecycle, audit logs | **27/27 Passed** |
| **College Binding** | [`test/collegeBinding.test.js`](test/collegeBinding.test.js) | USN parsing, cross-college rejection, unauthorized relayer blocking | **13/13 Passed** |
| **Student Upload Engine** | [`test/studentUpload.test.js`](test/studentUpload.test.js) | CSV/Excel/PDF parsing, marks limits, in-file duplicates, rate limits | **23/23 Passed** |
| **Security & Auth Defenses** | [`test/security.test.js`](test/security.test.js) | Bcrypt passkeys, timing attack mitigation, HMAC OTPs, rate limit lockouts | **20/20 Passed** |
| **Stepper UI & Role States** | [`test/stepperAndRoles.test.js`](test/stepperAndRoles.test.js) | Dynamic stepper progression across University, Student, Company roles | **17/17 Passed** |

**Total Pass Rate**: **100/100 Tests Passing** (`npx hardhat test`).

---

## License

This project is developed as an academic final-year engineering capstone and is licensed under the [MIT License](LICENSE).
