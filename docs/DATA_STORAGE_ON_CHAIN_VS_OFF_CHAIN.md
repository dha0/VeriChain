# Data Architecture: On-Chain vs. Off-Chain Storage Matrix

A core architectural principle of **VeriChain** is the strict separation between public cryptographic proofs and private institutional records. This document details what data is stored on the Ethereum blockchain versus off-chain systems (PostgreSQL and IPFS), along with the technical, privacy, and economic rationales behind every design decision.

---

## 1. Storage Comparison Matrix

| Data Entity | Stored On-Chain (Ethereum) | Stored Off-Chain (PostgreSQL / IPFS) | Primary Rationale |
| :--- | :--- | :--- | :--- |
| **Institution Authority** | University ID, Name, College Code (e.g. `"RV"`), Affiliating University (`"VTU"`), Web3 Wallet, Active Status | Contact Email, Salted Bcrypt Hash of Access Passkey, Profile Metadata | **Public Trust**: Institutional identity and accreditation must be verified publicly without relying on a central database. Secret passkeys must never touch the public blockchain. |
| **Corporate Recruiter** | Company ID, Legal Name, Partner Code (e.g. `"INFY"`), Authorized Web3 Wallet, Active Status | Contact Email, Bcrypt Hash of Access Passkey, Billing/Audit History | **Public Transparency**: Verifies corporate right to record background checks. Access credentials remain confidential off-chain. |
| **Candidate Identity** | Student ID, USN (e.g. `"1RV21CS001"`), Student Name, Degree Course, Graduation Year, Bound College ID | Candidate Email Address, Telephone, Physical Address, Profile Photo, Student Wallet Linkage | **Privacy Minimization**: USN, name, and degree are official academic descriptors. Contact PII (email, phone) is kept strictly off-chain to prevent spam, tracking, and identity theft. |
| **Academic Marks & GPA** | **32-byte `marksHash` only** (Keccak-256 cryptographic commitment of totals and percentages) | Normalized subject-wise marks (`StudentMark`), internal/external splits, max marks, letter grades, semester results, and historical version changelogs (`StudentMarkVersion`) | **GDPR & Gas Optimization**: Plaintext academic scores must never be permanently exposed on a public ledger. Storing a 32-byte hash provides tamper-proof verification while keeping sensitive academic histories private and editable under audit. |
| **Official Documents** | 32-byte `documentHash` (SHA-256), IPFS CID string, Document Type, Mint Timestamp, Version Number, Lifecycle Status (`Active`, `Revoked`, `Suspended`, `Expired`) | Original Unencrypted PDF, AES-256-GCM Encrypted Blob on Pinata IPFS, File Size, Original File Name | **Immutability without Bloat**: Large binary files (PDFs, images) are impossible or cost-prohibitive to store in EVM smart contract storage. Content addressing on IPFS + on-chain SHA-256 anchors guarantee bit-for-bit authenticity. |
| **Student Achievements** | Achievement ID, Bound Student ID, Title, Issuer Organization, Category, 32-byte `documentHash`, IPFS CID, Reviewing College ID, Status (`Pending`, `Verified`, `Rejected`), Review Remarks | Original Certification Files, Detailed Submissions, Local Submission Timestamps | **Decentralized Portfolio**: Verifiable badges and external certs are anchored on-chain upon institutional review. |
| **Verification Records** | Verification ID, Verifying Company ID, Target Credential ID, Block Timestamp, Boolean `hashMatched`, Boolean `isAuthentic`, Document Type | Printable ASCII Receipts, Recruiter Notes, Session Telemetry | **Audit Integrity**: Prevents recruiters from claiming they conducted background screenings when they did not, establishing non-repudiation for hiring compliance. |
| **Authentication & Nonces** | Smart Contract Owner Admin Address | Active Server Sessions (Encrypted JWTs), Single-Use SIWE Nonces (`AuthNonce`), Ephemeral HMAC OTPs (`StudentOTP`), Rate Limit Counters (`RateLimitCounter`) | **Security & Replay Protection**: Transient authentication state changes too frequently for blockchain storage and requires sub-millisecond query responses. |

---

## 2. In-Depth Rationale Behind Architectural Split

### 1. Privacy, PII Minimization & GDPR Compliance
The European Union General Data Protection Regulation (**GDPR Article 17**) enshrines the **"Right to be Forgotten" (Data Erasure)**. 

Blockchains are by definition **immutable and append-only**. If personal candidate records (e.g., student email addresses, home addresses, phone numbers, or academic transcripts) are written directly into smart contract storage, they **can never be deleted, modified, or redacted**. This creates an insurmountable legal and regulatory violation for educational institutions and corporate employers.

#### How VeriChain Solves This:
1. **Zero Plaintext Marks On-Chain**:
   When a university confirms a student's marks, the server computes a deterministic Keccak-256 hash representing the evaluation state:
   $$\text{marksHash} = \text{keccak256}(\text{USN} \parallel \text{Percentage} \parallel \text{SubjectCodesAndMarks})$$
   Only this 32-byte hash is committed to the blockchain (`contract.registerStudent`).
2. **Off-Chain Data Erasure Compliance**:
   If a student requests deletion under applicable privacy regulations, their personal row and subject records can be purged from the relational PostgreSQL database. The on-chain `marksHash` remains on Ethereum as a meaningless pseudo-random cryptographic string from which no personal data can ever be reverse-engineered (pre-image resistance).
3. **Protected Contact Channels**:
   The candidate's email address is exclusively stored in PostgreSQL and used as the destination for multi-factor login OTPs. No client or external blockchain explorer (e.g., Etherscan) can scrape candidate emails from the ledger.

---

### 2. Gas Economics & EVM Storage Costs
On the Ethereum Virtual Machine, writing to permanent storage (`SSTORE`) is the most expensive operation:
- Writing a single 32-byte word (`bytes32`) to a fresh storage slot costs **20,000 gas**.
- Storing a standard 1 MB academic transcript PDF directly on Ethereum would require approximately **32,768 storage words**, costing over **655,000,000 gas units** (which exceeds the block gas limit of 30,000,000 and would cost thousands of dollars per document).

#### How VeriChain Optimizes Costs:
- **Fixed-Size Cryptographic Anchors**: Every document, whether a 500 KB certificate or a 20 MB multi-page transcript, is compressed into a fixed **32-byte SHA-256 fingerprint** and a short string **IPFS Content Identifier (CID)**.
- **Micro-Gas Footprint**: Minting a credential on VeriChain costs approximately **85,000 to 120,000 gas**, making decentralized verification economically feasible on mainnet rollups (Arbitrum, Optimism, Base, Polygon) and testnets (Sepolia).

---

### 3. Subject-Wise Granularity vs. State Commitments
Educational institutions frequently need to record complex, subject-level academic breakdowns:
- Internal assessment marks (out of 20, 30, or 50)
- External semester-end examinations (out of 50, 70, or 100)
- Subject codes, names, credits, and grade points across 8 distinct semesters

Storing this nested relational hierarchy directly in Solidity mappings would make search, filtering, and reporting prohibitively expensive and slow.

#### The VeriChain Hybrid Approach:
1. **Normalized PostgreSQL Schema**:
   Detailed rows are indexed in the `StudentMark` table with composite keys `(usn, semester, subjectCode, version)`.
2. **Auditable Marks Versioning (`StudentMarkVersion`)**:
   When revaluation or grade corrections occur, the system archives the previous state and creates a new version record tracking `version`, `totalMarks`, `maxTotalMarks`, `percentage`, `marksHash`, `txHash`, and `changedBy`.
3. **Single Blockchain Truth**:
   The smart contract holds the latest active `marksHash`. During verification, the company or recruiter compares their local evaluation against the smart contract's single state anchor.

---

### 4. Content Addressing vs. Location Addressing (IPFS)
Traditional web servers store files at specific URLs (location addressing, e.g. `https://university.edu/transcripts/student123.pdf`). If the server administrator modifies the PDF or the server goes down, the document breaks or changes without notice.

**VeriChain uses Pinata IPFS (Content Addressing)**:
- A file's address is derived directly from its cryptographic content (e.g. `QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco`).
- If an attacker tampers with a single character in the PDF, the IPFS hash changes completely.
- The smart contract anchors this CID permanently. Even if our web server is completely decommissioned, the document remains permanently retrievable across decentralized IPFS nodes worldwide.
