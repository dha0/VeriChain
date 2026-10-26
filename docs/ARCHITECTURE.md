# VeriChain System Architecture & Request Lifecycle

This document provides a comprehensive technical overview of the **VeriChain** decentralized document and marks verification platform. It details the structural components, data boundaries, communication protocols, and step-by-step request lifecycles across the application.

---

## 1. High-Level Component Topology

VeriChain implements a modern **hybrid Web2/Web3 architecture**. It leverages the performance and privacy of serverless relational storage alongside the immutability and decentralized trust of the Ethereum blockchain.

```
+---------------------------------------------------------------------------------------------------+
|                                      CLIENT BROWSER LAYER                                         |
|                                                                                                   |
|  +--------------------+   +---------------------+   +--------------------+   +-----------------+  |
|  |  University Admin  |   | Candidate (Student) |   | Corporate Recruiter|   | Public Auditor  |  |
|  |  Portal (/univ)    |   | Digital Locker      |   | Terminal (/company)|   | (/verify)       |  |
|  +---------+----------+   +----------+----------+   +---------+----------+   +--------+--------+  |
|            |                         |                        |                       |           |
|            +-------------------------+-----------+------------+-----------------------+           |
|                                                  |                                                |
|                                          HTTPS / REST / JSON                                      |
+--------------------------------------------------+------------------------------------------------+
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

---

## 2. Core Architectural Components

### A. Next.js 14 Presentation & Route Layer
- **App Router Framework**: Built with modern Server and Client Components.
- **Role-Based Portals**:
  - `/university`: Onboarding students, subject-wise marks management, multi-format upload preview, credential issuance, and achievement review.
  - `/student`: Passwordless candidate digital locker, academic records view, QR verification code generator, and achievement upload.
  - `/company`: Corporate recruiter terminal with Mode 1 (enrollment status) and Mode 2 (cryptographic tamper audit) engines, producing official printable verification receipts.
  - `/admin-login` & `/admin`: Restricted platform governance console protected by contract deployer wallet authentication.
  - `/verify` & `/verify/[credentialId]`: Public verification search engine.
- **Process Steppers**: Real-time progress trackers mounted at the top of each dashboard driven by active session and on-chain state.

### B. Gasless Transaction Relayer Layer
In typical decentralized applications, end users must hold native cryptocurrency (e.g. Sepolia ETH) to pay gas fees for every write operation. This creates massive friction for university staff and recruiters.

**VeriChain eliminates gas barriers through an Authorized Relayer Pattern**:
1. All client write operations send authenticated requests to the internal Next.js API (`/api/blockchain/relay` or `/api/students/upload/confirm`).
2. The server verifies user identity, role privileges, and college binding.
3. The server signer ([`lib/serverContract.ts`](file:///c:/Users/dhany/Desktop/Project/lib/serverContract.ts)) signs and broadcasts the Ethereum transaction using its funded relayer key.
4. The smart contract validates that `msg.sender == authorizedRelayer` via the `onlyRelayerOrAdmin` modifier.
5. Gas fees are sponsored centrally by the platform authority, offering users a Web2-like user experience with Web3 trust guarantees.

### C. Neon Serverless PostgreSQL & Prisma ORM
- Provides ACID-compliant relational storage for high-frequency queries, audit versions, and private candidate details.
- Leverages Neon serverless connection pooling to withstand concurrent serverless function invocations without exhausting database connection pools.
- **Database Schema Models**:
  - `StudentProfile`: USN, student name, official email, degree course, graduation year, cumulative totals, current `marksVersion`, and on-chain `marksHash`.
  - `StudentMark`: Normalized subject-level marks breakdown per student, semester, subject code, internal/external splits, max marks, and grades.
  - `StudentMarkVersion`: Immutable audit log of every revision, tracking marks totals, computed Keccak-256 hashes, modifying college identity, and transaction hashes.
  - `StudentAchievement`: Candidate-uploaded credentials, IPFS CIDs, document hashes, and endorsing college review statuses.
  - `InstitutionCredential`: Bcrypt-hashed access passkeys for institutional logins.
  - `StudentWalletLink`: Strict 1-to-1 mappings between verified USNs and Ethereum addresses.
  - `AuthNonce` & `RateLimitCounter`: Ephemeral tables providing distributed brute-force protection and replay prevention across serverless instances.

### D. Ethereum Smart Contract Layer (`ITHiringMarksVerification.sol`)
- Deployed on **Ethereum Sepolia Testnet** (or local Hardhat EVM at `0x5FbDB2315678afecb367f032d93F642f64180aa3`).
- **Core Responsibilities**:
  - Institutional accreditation state (active/suspended colleges and companies).
  - Student registration binding candidate USN to their college ID and `marksHash`.
  - Credential minting: Anchoring 32-byte SHA-256 document fingerprints, IPFS CIDs, and document types.
  - 4-Stage Credential Lifecycle: `Active (0)`, `Revoked (1)`, `Suspended (2)`, `Expired (3)`.
  - Student Achievement endorsement records.
  - Permanent, immutable relational verification logs (`recordVerificationByCompany`).

### E. Decentralized IPFS Storage Layer (Pinata)
- Official marksheet documents, degree certificates, and student portfolio files are pinned to IPFS.
- Content addressing guarantees that if a file is tampered with by even a single bit, its resulting Content Identifier (CID) changes completely.
- Documents can be encrypted client-side using AES-256-GCM prior to pinning for maximum candidate confidentiality.

---

## 3. End-to-End Request Lifecycles

### Flow 1: Bulk Student Marks Upload & Blockchain Anchor

```mermaid
sequenceDiagram
    autonumber
    actor College as University Officer
    participant Browser as Browser Client
    participant PreviewAPI as /api/students/upload/preview
    participant Parser as File & Marks Engine
    participant ConfirmAPI as /api/students/upload/confirm
    participant DB as Neon PostgreSQL (Prisma)
    participant Relayer as Backend Signer
    participant Blockchain as Sepolia Contract

    College->>Browser: Selects CSV, Excel (.xlsx), or PDF file
    Browser->>PreviewAPI: POST multipart file payload
    PreviewAPI->>PreviewAPI: Verify session.role === "university"
    PreviewAPI->>PreviewAPI: Rate limit check (upload_preview:collegeCode)
    PreviewAPI->>Parser: Validate MIME magic bytes & parse rows
    Parser->>Parser: Parse USNs & enforce parsedUsn.collegeCode === sessionCollegeCode
    Parser->>Parser: Calculate subject totals, percentage & marksHash
    PreviewAPI->>DB: Check for existing USN duplicates in DB
    PreviewAPI-->>Browser: Return preview matrix (valid, warning, error rows)

    College->>Browser: Clicks "Confirm & Register"
    Browser->>ConfirmAPI: POST row payload (streamed / looped)
    ConfirmAPI->>ConfirmAPI: Server-side safety re-check (USN, email, marks ranges)
    ConfirmAPI->>Relayer: contract.registerStudent(collegeId, usn, name, course, gradYear, marksHash)
    Relayer->>Blockchain: Broadcast transaction via relayer wallet
    Blockchain-->>Relayer: Tx receipt & mined block confirmation
    ConfirmAPI->>DB: Upsert StudentProfile & insert StudentMark rows
    ConfirmAPI->>DB: Record immutable StudentMarkVersion with marksHash & txHash
    ConfirmAPI-->>Browser: Return registration confirmation with txHash
```

---

### Flow 2: Passwordless Student Authentication (OTP & SIWE)

```mermaid
sequenceDiagram
    autonumber
    actor Student as Candidate Student
    participant Browser as Browser Client
    participant LoginAPI as /api/auth/login
    participant Contract as Read-Only Contract
    participant DB as Neon PostgreSQL
    participant Email as Email Service (Resend/SMTP)

    Student->>Browser: Inputs Candidate USN
    Browser->>LoginAPI: POST { loginType: "student_request_otp", usn }
    LoginAPI->>LoginAPI: Rate limit check on client IP and USN
    LoginAPI->>Contract: contract.getStudentByUSN(cleanUSN)
    Contract-->>LoginAPI: Student details (exists: true)
    LoginAPI->>DB: Query university-registered email for USN
    LoginAPI->>LoginAPI: Generate 6-digit OTP via crypto.randomInt
    LoginAPI->>DB: Store HMAC-SHA256(OTP) with 10-minute expiry
    LoginAPI->>Email: Send security OTP to registered email
    LoginAPI-->>Browser: OTP dispatched confirmation

    Student->>Browser: Enters 6-digit OTP (Optional: connects MetaMask)
    Browser->>LoginAPI: POST { loginType: "student", usn, otp, wallet, signature }
    LoginAPI->>DB: Fetch OTP record & verify HMAC hash in constant time
    alt Wallet Signature Provided
        LoginAPI->>DB: Verify single-use SIWE challenge nonce
        LoginAPI->>LoginAPI: ethers.verifyMessage(challenge, signature)
        LoginAPI->>DB: Link wallet to USN in StudentWalletLink
    end
    LoginAPI->>LoginAPI: Generate JWT signed with JWT_SECRET
    LoginAPI-->>Browser: Set HTTP-only secure cookie ('verichain_session')
    Browser->>Browser: Redirect to /student dashboard
```

---

### Flow 3: Mode 2 Deep Cryptographic Tamper Audit

```mermaid
sequenceDiagram
    autonumber
    actor Recruiter as Corporate Recruiter
    participant Browser as Recruiter Browser (Web Crypto)
    participant Contract as Sepolia Contract
    participant RelayAPI as /api/blockchain/relay
    participant Relayer as Backend Signer

    Recruiter->>Browser: Enters Credential ID & uploads applicant's PDF
    Browser->>Browser: Native crypto.subtle.digest("SHA-256", fileBuffer)
    Browser->>Contract: Read-only query: contract.getCredential(credentialId)
    Contract-->>Browser: Returns on-chain documentHash, studentId, status
    
    Browser->>Browser: Compare computedHash === onChainHash (Bit-for-bit)
    alt Hash Matches Exactly
        Browser->>Browser: Render verified authentic badge & candidate standing
    else Bitstream Difference Detected
        Browser->>Browser: Flag TAMPER ALERT: Document hash differs from blockchain anchor
    end

    Browser->>RelayAPI: POST { action: "recordVerification", credentialId, hashMatched, isAuthentic }
    RelayAPI->>RelayAPI: Verify recruiter session (company role)
    RelayAPI->>Relayer: contract.recordVerificationByCompany(companyId, credId, hashMatched, isAuthentic)
    Relayer->>Contract: Commit verification audit log on-chain
    Contract-->>Relayer: Tx receipt
    RelayAPI-->>Browser: Success with receipt link
    Browser->>Browser: Generate printable ASCII & bordered verification certificate
```
