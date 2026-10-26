# Threat Model & Security Architecture

This document defines the formal threat model for **VeriChain**, detailing adversary models, attack surfaces, security controls, and known engineering trade-offs.

---

## 1. Adversary Model & Threat Actors

VeriChain considers four primary adversary profiles:

1. **Malicious Candidate / Student**:
   - *Goal*: Alter academic marks, forge degrees, claim certifications from another university, or bind another candidate's wallet to their profile.
   - *Capabilities*: Full access to client browser, local network manipulation, ability to craft arbitrary HTTP requests, knowledge of other students' public USNs.
2. **Rogue or Compromised Educational Institution**:
   - *Goal*: Issue fraudulent credentials, register students belonging to rival universities (cross-college tampering), or alter past grades without leaving an audit trail.
   - *Capabilities*: Possesses valid institutional credentials, access to university upload interfaces.
3. **Dishonest Corporate Recruiter**:
   - *Goal*: Falsify background screening audit logs, claim unverified candidates are authentic, or tamper with applicant document bitstreams.
   - *Capabilities*: Access to recruiter terminal, ability to manipulate client-side verification forms.
4. **External Network Adversary / Automated Botnet**:
   - *Goal*: Brute-force institutional access codes, spam student OTPs, trigger Denial of Service (DoS) on backend relays, or drain relayer gas funds.
   - *Capabilities*: Distributed IP pools, high-frequency request generation.

---

## 2. Core Security Controls & Defenses

### A. Login with Salted Bcrypt Passkeys
- **Vulnerability Addressed**: Compromise of institutional access passkeys via database breaches or side-channel timing attacks.
- **Implementation**:
  - Educational institutions and corporate recruiters authenticate with high-entropy access codes generated during accreditation.
  - Plaintext passkeys are displayed **exactly once** to the administrator and are **never saved to the database**.
  - The database (`InstitutionCredential`) stores only salted **bcrypt hashes** (cost factor 10).
  - During authentication, [`lib/accessCodeStore.ts`](file:///c:/Users/dhany/Desktop/Project/lib/accessCodeStore.ts) performs a `findUnique` query by `codeIdentifier`. If no matching record is found, the system executes an asynchronous **dummy bcrypt comparison** against a static salt. This ensures that response latency remains constant regardless of whether the code identifier exists, defeating timing enumeration attacks.

### B. Distributed Rate Limiting & Lockout
- **Vulnerability Addressed**: Brute-force password guessing, credential stuffing, and OTP flooding.
- **Implementation**:
  - Implemented via [`RateLimitCounter`](file:///c:/Users/dhany/Desktop/Project/prisma/schema.prisma) across PostgreSQL, supporting distributed serverless instances.
  - Tracks failed attempts keyed by `${clientIP}:${codeIdentifier || wallet || usn}`.
  - **Rules**:
    - Maximum 5 failed attempts within a 5-minute rolling window.
    - Exceeding the threshold triggers an automatic **300-second (5-minute) hard lockout** returning HTTP 429 (`Too Many Requests`).
    - Successfully authenticating immediately resets the counter.

### C. Cryptographic Web3 Wallet Signing (SIWE / EIP-4361)
- **Vulnerability Addressed**: Wallet address spoofing and signature replay attacks.
- **Implementation**:
  - VeriChain implements **Sign-In with Ethereum (EIP-4361)**.
  - The client first requests a challenge from `/api/auth/nonce`. The server generates a high-entropy 32-byte cryptographic nonce ([`crypto.randomBytes(32)`](file:///c:/Users/dhany/Desktop/Project/lib/serverAuth.ts)) stored in `AuthNonce` with a 5-minute TTL.
  - The client signs a standard message including the domain, wallet address, URI, chain ID, and nonce via MetaMask:
    $$\text{Signature} = \text{sign}(\text{Message}, \text{PrivateKey}_{\text{MetaMask}})$$
  - The server verifies the signature using `ethers.verifyMessage` and marks the nonce as used (`used = true`). Nonces are strictly single-use, preventing replay attacks across different sessions or servers.

### D. Ephemeral Candidate OTPs with HMAC-SHA256
- **Vulnerability Addressed**: Account takeover via predictable OTPs or database snooping.
- **Implementation**:
  - Student logins require proof of email ownership.
  - OTPs are generated strictly using cryptographically secure random integers:
    $$\text{OTP} = \text{crypto.randomInt}(100000, 999999)$$
  - Plaintext OTPs are dispatched via email and **never stored in the database in plaintext**.
  - The database (`StudentOTP`) stores an **HMAC-SHA256** digest keyed with a dedicated server secret (`process.env.OTP_SECRET`).
  - Validation employs `crypto.timingSafeEqual` over fixed-length buffer digests to eliminate timing analysis.
  - OTPs expire after 10 minutes and are permanently invalidated after 5 incorrect entry attempts.

### E. Relayer-Only Smart Contract Pattern (`onlyRelayerOrAdmin`)
- **Vulnerability Addressed**: Direct contract tampering by malicious Web3 wallets bypassing business rules, college binding, and validation checks.
- **Implementation**:
  - All state-mutating functions in [`ITHiringMarksVerification.sol`](file:///c:/Users/dhany/Desktop/Project/contracts/ITHiringMarksVerification.sol) (`registerStudent`, `issueCredentialByUniversity`, `reviewAchievement`, `recordVerificationByCompany`) are guarded by:
    ```solidity
    modifier onlyRelayerOrAdmin() {
        require(
            msg.sender == authorizedRelayer || msg.sender == admin,
            "Caller is neither authorized relayer nor admin"
        );
        _;
    }
    ```
  - External users cannot interact with write functions directly from their personal wallets on Etherscan or web3 scripts.
  - Every action must pass through the Next.js API gateway, which enforces JWT session authentication, role checks, and college boundary validation before signing the transaction through the backend relayer.

### F. Strict College Binding & USN Parsing
- **Vulnerability Addressed**: Cross-institutional impersonation and unauthorized credential issuance.
- **Implementation**:
  - The system implements an autonomous USN validation engine ([`lib/usnParser.ts`](file:///c:/Users/dhany/Desktop/Project/lib/usnParser.ts)) adhering to university nomenclature:
    $$\text{USN Regex} = \text{\textasciicircum}\backslash\text{d}[A\text{-}Z]\{2\}\backslash\text{d}\{2\}[A\text{-}Z]\{2\}\backslash\text{d}\{3\}\$$
    *(e.g., `1RV21CS001` $\rightarrow$ Region: `1`, College: `RV`, Year: `21`, Branch: `CS`, Roll: `001`)*.
  - **Zero Trust on File Contents**: When a college uploads candidate sheets, the parser **never trusts any college name or code inside the uploaded file**.
  - **Session Matching**: The college code extracted from each USN is strictly matched against `session.entityInfo.code`. If an officer from College `RV` attempts to upload or confirm a record with USN `1BM21CS001` (BMS College of Engineering), the server immediately aborts the row with a `403 Cross-College Violation`.
  - **Queue Isolation**: In both PostgreSQL and the smart contract, achievement reviews and student queues are filtered by `collegeCode`, preventing one university from viewing or modifying another's candidates.

---

## 3. Known Engineering Limitations & Trade-Offs

While VeriChain provides strong enterprise security, the current implementation has specific engineering boundaries:

### 1. Single Relayer Private Key (Centralization Risk)
- **Current State**: Transactions committed to the blockchain are signed by a single backend relayer account whose private key is configured in `process.env.PRIVATE_KEY`.
- **Risks**:
  - **Single Point of Failure (SPOF)**: If the relayer runs out of Sepolia ETH or crashes, write operations stall.
  - **Key Compromise**: If the server environment is compromised and the relayer private key is extracted, an attacker could sign state changes directly to the smart contract until the owner rotates the key.
- **Future Mitigation Roadmap**:
  - Transition to **Account Abstraction (ERC-4337)** using paymasters and multi-signature relayer pools (e.g. Biconomy, Gelato, or OpenZeppelin Defender).
  - Implement on-chain role separation where universities sign EIP-712 typed data payloads that the relayer submits on their behalf.

### 2. Testnet Reliance (Ethereum Sepolia)
- **Current State**: The platform is deployed on the Ethereum Sepolia Testnet.
- **Risks**:
  - **Block Latency**: Sepolia block times are approximately 12 to 15 seconds. High-volume bulk onboarding operations must rely on asynchronous queues and streaming responses.
  - **RPC Rate Limits**: Public RPC endpoints (Infura, Alchemy) impose rate limits on concurrent `eth_call` and `eth_sendRawTransaction` invocations.
  - **Faucet Dependency**: Testnet ETH availability fluctuates.
- **Production Roadmap**:
  - Deploy to an Ethereum Layer-2 rollup (e.g., Base, Arbitrum, or Polygon PoS) for sub-second finality and near-zero transaction costs ($\le \$0.005$ per credential).

### 3. PDF Parsing & OCR Extraction Accuracy
- **Current State**: The marksheet upload preview engine ([`lib/fileParser.ts`](file:///c:/Users/dhany/Desktop/Project/lib/fileParser.ts)) uses `pdf-parse` to extract embedded text streams using regular expressions.
- **Risks**:
  - **Formatting Drift**: If an autonomous college exports transcripts with irregular layout tables, multi-column bounding boxes, or non-standard subject headers, regex matching may fail to extract subject splits accurately.
  - **Scanned Images**: PDFs containing scanned image marksheets (raster bitmaps without text layers) cannot be parsed by `pdf-parse` alone and will be rejected with an `Unsupported File Format` error.
- **Recommended Best Practice**:
  - Institutions should use the standardized **Excel (`.xlsx`) or CSV template** generated by [`/api/students/template`](file:///c:/Users/dhany/Desktop/Project/app/api/students/template/route.ts) for bulk marks uploads.
  - Integration of an optical character recognition (OCR) pipeline (e.g., AWS Textract or Tesseract.js) is planned for physical paper marksheet digitization in Phase 6.
