# VeriChain Final-Year Project Demonstration Script

This document provides a turnkey, step-by-step live presentation guide for project examiners, university evaluators, and technical reviewers. Follow these steps in order to demonstrate all major platform capabilities, cryptographic controls, and security boundaries.

---

## Pre-Demo Checklist

1. **Terminal 1 (Blockchain Node)**:
   ```powershell
   npx hardhat node
   ```
2. **Terminal 2 (Deploy Contracts)**:
   ```powershell
   npx hardhat run scripts/deploy.js --network localhost
   ```
3. **Terminal 3 (Web Server)**:
   ```powershell
   npm run dev
   ```
4. **Browser**: Open [http://localhost:3000](http://localhost:3000) in Google Chrome or Brave with MetaMask installed.
5. **MetaMask Setup**: Ensure network is set to `Hardhat Localhost` (`RPC: http://127.0.0.1:8545`, `Chain ID: 31337`).

---

## Phase 1: Platform Administration & College Accreditation

### Goal:
Demonstrate that educational institutions cannot register themselves without central platform verification and that institutional passkeys are cryptographically secured.

1. Navigate to the concealed admin gateway: [http://localhost:3000/admin-login](http://localhost:3000/admin-login).
2. Click **Connect Deployer Wallet**. Connect Account #0 (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`).
3. The dashboard redirects to `/admin` upon verifying `msg.sender == contract.admin()`.
4. In the **Accredit University** section, enter:
   - **University / College Name**: `R.V. College of Engineering`
   - **College Code**: `RV` *(Crucial: must match the 2-letter USN prefix)*
   - **Affiliating University**: `Visvesvaraya Technological University (VTU)`
   - **Authorized Wallet**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` *(Hardhat Account #1)*
5. Click **Accredit Institution**.
6. **Key Evaluator Moment**:
   - The admin terminal displays an alert containing the newly generated **Institutional Access Passkey** (e.g. `RV-SEC-XXXX`).
   - Explain to the examiner: *"This passkey is displayed only once. The database stores only a salted bcrypt hash, ensuring zero plaintext password exposure."*
   - Copy this passkey for Phase 2.

---

## Phase 2: College Portal & Student Onboarding (3 Methods)

### Goal:
Demonstrate that a college can onboard candidates using a manual form, CSV, or Excel, and that subject-wise marks are evaluated server-side.

1. Navigate to [http://localhost:3000/login](http://localhost:3000/login).
2. Select the **University Authority** tab.
3. Enter:
   - **Institution Code**: `RV`
   - **Access Passkey**: *(Paste the passkey generated in Phase 1)*
   - *(Alternatively, connect MetaMask Account #1)*
4. Click **Authenticate Institutional Authority**. You are redirected to `/university`.

### Method A: Single Student Manual Entry
1. In the **Student Registration** tab, select **Manual Form Entry**.
2. Enter the candidate details:
   - **USN**: `1RV21CS001`
   - **Full Name**: `Aarav Sharma`
   - **Email**: `aarav.sharma@example.com` *(Must be a valid email format)*
   - **Degree Course**: `Computer Science & Engineering`
   - **Graduation Year**: `2025`
   - **Internal Marks**: `24` | **External Marks**: `68` | **Max Marks**: `100`
3. Click **Register Candidate**.
4. **Key Evaluator Moment**:
   - Show the terminal or response receipt displaying the transaction hash (`txHash`).
   - Point out that the blockchain stored the computed `marksHash`, while PostgreSQL stored the normalized marks breakdown.

### Method B: Bulk CSV Upload
1. Click **Download Blank Template** and choose **CSV**.
2. Inspect the downloaded file: show the examiner that it contains strict headers only and **zero fake demo data**.
3. Create a test CSV (`students.csv`) containing:
   ```csv
   USN,Name,Email,Course,GraduationYear,Semester,SubjectCode,SubjectName,InternalMarks,ExternalMarks,MaxMarks
   1RV21CS002,Bhavna Patel,bhavna.patel@example.com,Computer Science,2025,6,21CS61,Software Engineering,22,64,100
   ```
4. Drag and drop `students.csv` into the upload dropzone.
5. Click **Generate Upload Preview**.
6. The preview table displays `1RV21CS002` highlighted with a green **Valid** badge.
7. Click **Confirm & Register All Valid Rows**. Show the confirmation message.

### Method C: Multi-Subject Excel (.xlsx) Upload
1. Click **Download Blank Template** and choose **Excel (.xlsx)**.
2. Add a multi-subject sheet for a single student across two subjects:
   - Row 1: `1RV21CS003` | `Chetan Kumar` | `chetan.k@example.com` | `Computer Science` | `2025` | `6` | `21CS61` | `Software Eng` | `20` | `60` | `100`
   - Row 2: `1RV21CS003` | `Chetan Kumar` | `chetan.k@example.com` | `Computer Science` | `2025` | `6` | `21CS62` | `Computer Networks` | `25` | `70` | `100`
3. Upload the Excel file.
4. **Key Evaluator Moment**:
   - Show how the parser automatically groups the rows by USN into a single student record with two subjects.
   - Point out the automatically computed **Total Marks (175/200)**, **Percentage (87.5%)**, **Grade (A+)**, and **Result (PASS)**.
5. Click **Confirm & Register**.

---

## Phase 3: Security Defense - Cross-College Violation Attempt

### Goal:
Prove to the examiner that the server strictly enforces college binding and never trusts user-supplied files.

1. Create a rogue CSV file (`rogue_upload.csv`) containing a student belonging to a different college (`BM` - BMS College of Engineering):
   ```csv
   USN,Name,Email,Course,GraduationYear,Semester,SubjectCode,SubjectName,InternalMarks,ExternalMarks,MaxMarks
   1BM21CS099,Impostor Student,impostor@example.com,Computer Science,2025,6,21CS61,Software Eng,20,50,100
   ```
2. While still logged in as College `RV`, upload `rogue_upload.csv`.
3. Click **Generate Upload Preview**.
4. **Key Evaluator Moment**:
   - The preview engine flags the row in **RED** with status **ERROR**.
   - Show the explicit security violation message:
     ```
     Cross-College USN: Candidate USN '1BM21CS099' belongs to college 'BM',
     but your authorized session is 'RV'.
     ```
   - Explain: *"Even if an adversary attempts to bypass the UI using curl or Postman directly to `/api/students/upload/confirm`, the server re-validates the USN independently and returns HTTP 403 Forbidden."*

---

## Phase 4: Passwordless Student Digital Locker & SIWE Binding

### Goal:
Demonstrate gasless, passwordless student access via email OTP and 1-to-1 Web3 wallet binding.

1. Open a new private/incognito browser window.
2. Navigate to [http://localhost:3000/login](http://localhost:3000/login) and select the **Candidate Student** tab.
3. Enter Candidate USN: `1RV21CS001`.
4. Click **Request Security OTP**.
5. **Key Evaluator Moment**:
   - Show the terminal console log:
     ```
     [DEV EMAIL SIMULATION] To: aarav.sharma@example.com | USN: 1RV21CS001 | One-Time Password: XXXXXX
     ```
   - In production, this OTP is delivered via SMTP/Resend.
6. Enter the 6-digit OTP into the input fields.
7. Click **Verify OTP & Access Locker**.
8. The student dashboard loads at `/student`:
   - Shows candidate name (`Aarav Sharma`), bound university badge (`R.V. College of Engineering`), and degree course.
   - Shows cumulative academic performance.
   - Displays the dynamic **Recruiter QR Verification Card**.
9. *(Optional)* Click **Link MetaMask Wallet**:
   - Sign the Sign-In with Ethereum (SIWE) message in MetaMask.
   - Point out that the wallet is now permanently linked 1-to-1 with USN `1RV21CS001` in the database, preventing another student from claiming that wallet.

---

## Phase 5: Student Co-Curricular Upload & College Endorsement

### Goal:
Show how students upload skill certifications and how colleges endorse them on-chain.

1. On the `/student` dashboard, scroll to **Co-Curricular Portfolio**.
2. Click **Submit Achievement / Certificate**.
3. Enter:
   - **Title**: `AWS Certified Cloud Practitioner`
   - **Issuer**: `Amazon Web Services`
   - **Category**: `Certification`
4. Click **Submit for College Endorsement**.
5. The achievement appears with status badge: **Pending Review (Amber)**.
6. Switch back to the **University Authority** browser window (`/university`).
7. Click the **Review Achievements** tab.
8. Candidate `Aarav Sharma`'s certificate is visible in the queue.
9. Click **Endorse & Verify**.
10. Switch back to the Student window and refresh:
    - Status changes immediately to **Verified (Green)** with official college endorsement anchored on-chain.

---

## Phase 6: Corporate Recruiter Verification & Tamper Detection

### Goal:
Demonstrate Mode 1 quick screening, Mode 2 client-side cryptographic tamper audit, and generation of official audit receipts.

1. Navigate to [http://localhost:3000/login](http://localhost:3000/login) and select **Company Recruiter**.
2. Authenticate using an accredited partner code (or connect authorized corporate wallet).
3. The dashboard opens at `/company`.

### Mode 1: Instant USN Screening
1. In the **Mode 1 Quick Screening** box, enter: `1RV21CS001`.
2. Click **Verify Candidate Record**.
3. Results render instantly:
   - Student enrollment confirmed on blockchain.
   - Issuing college confirmed active and accredited.
   - Cumulative percentage and active credential status verified.

### Mode 2: Deep Cryptographic Tamper Audit
1. In the **Mode 2 Cryptographic Tamper Engine**, select Credential ID `#1`.
2. Upload the original marksheet PDF issued by the college.
3. The client computes the SHA-256 hash using the native browser `crypto.subtle` API.
4. The calculated hash matches the on-chain hash bit-for-bit:
   - **Result**: Display **AUTHENTIC & UNTAMPERED** in glowing green.
5. **Tamper Test**:
   - Open the PDF in a text/hex editor, modify a single character, and re-upload.
   - **Result**: Immediate red alert: **TAMPER DETECTED: Computed hash does not match blockchain anchor**.
6. Click **Generate Official Verification Receipt**.
7. Display the formal bordered ASCII receipt with verification timestamp, company ID, and cryptographic hashes ready for HR compliance records.
