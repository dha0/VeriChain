const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=======================================================");
  console.log("Seeding Demo University, Company & Candidate into Ledger");
  console.log("=======================================================");

  const signers = await hre.ethers.getSigners();
  const admin = signers[0];
  const uniWallet = signers[1]?.address || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const compWallet = signers[2]?.address || "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  console.log("Admin Address:      ", admin.address);
  console.log("University Signer:  ", uniWallet);
  console.log("Company Signer:     ", compWallet);

  // Read deployed address
  let CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0xd1156FdEec51bffBb897596fd97B1877ffB2aE61";
  try {
    const tsPath = path.join(__dirname, "../contracts/contractAddress.ts");
    if (fs.existsSync(tsPath)) {
      const tsContent = fs.readFileSync(tsPath, "utf-8");
      const match = tsContent.match(/0x[a-fA-F0-9]{40}/);
      if (match) {
        CONTRACT_ADDRESS = match[0];
      }
    }
  } catch (e) {}

  console.log("Target Contract:    ", CONTRACT_ADDRESS);

  const ContractFactory = await hre.ethers.getContractFactory("ITHiringMarksVerification");
  const contractAsAdmin = ContractFactory.attach(CONTRACT_ADDRESS).connect(admin);

  // 1. Check or Register Demo University
  const uniCode = "VTU-KA-001";
  const uniName = "Visvesvaraya Technological University";

  const existingUniId = Number(await contractAsAdmin.universityCodeToId(uniCode));
  let uniId = existingUniId;

  if (existingUniId === 0) {
    console.log(`\n1. Registering Demo University: "${uniName}" (${uniCode})...`);
    const tx = await contractAsAdmin.registerUniversity(uniName, uniCode, uniWallet);
    await tx.wait();
    uniId = Number(await contractAsAdmin.universityCodeToId(uniCode));
    console.log(`   Registered successfully! University ID: #${uniId}`);
  } else {
    console.log(`\n1. University "${uniName}" (${uniCode}) is already registered with ID: #${existingUniId}.`);
  }

  // 2. Check or Register Demo Company
  const compCode = "INFY-BLR-01";
  const compName = "Infosys Technologies Ltd";

  const existingCompId = Number(await contractAsAdmin.companyCodeToId(compCode));
  let compId = existingCompId;

  if (existingCompId === 0) {
    console.log(`\n2. Registering Demo Company: "${compName}" (${compCode})...`);
    const tx = await contractAsAdmin.registerCompany(compName, compCode, compWallet);
    await tx.wait();
    compId = Number(await contractAsAdmin.companyCodeToId(compCode));
    console.log(`   Registered successfully! Company ID: #${compId}`);
  } else {
    console.log(`\n2. Company "${compName}" (${compCode}) is already registered with ID: #${existingCompId}.`);
  }

  // 3. Check or Register Demo Student
  const studentUSN = "1RV21CS001";
  const studentName = "Rahul Sharma";
  const course = "B.E. Computer Science & Engineering";
  const gradYear = 2025;
  const percentage = 88;

  const existingStudentId = Number(await contractAsAdmin.usnToStudentId(studentUSN));
  let studentId = existingStudentId;

  if (existingStudentId === 0) {
    console.log(`\n3. Registering Demo Student: "${studentName}" (${studentUSN})...`);
    const tx = await contractAsAdmin.registerStudentByUniversity(
      uniId,
      studentUSN,
      studentName,
      course,
      gradYear,
      percentage
    );
    await tx.wait();
    studentId = Number(await contractAsAdmin.usnToStudentId(studentUSN));
    console.log(`   Registered successfully! Student ID: #${studentId}`);
  } else {
    console.log(`\n3. Student "${studentName}" (${studentUSN}) is already registered with ID: #${existingStudentId}.`);
  }

  // 4. Check or Issue Demo Credential
  const studentCreds = await contractAsAdmin.getCredentialsByStudent(studentId);
  if (studentCreds.length === 0) {
    console.log(`\n4. Issuing Demo Degree Credential for Student #${studentId}...`);
    const docType = "Degree Certificate";
    const sampleHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("VERIFIED_DEGREE_SAMPLE_PDF_2025"));
    const sampleCID = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";

    const tx = await contractAsAdmin.issueCredentialByUniversity(
      uniId,
      studentId,
      docType,
      sampleHash,
      sampleCID
    );
    await tx.wait();
    console.log(`   Credential issued successfully!`);
    console.log(`   Document Type: ${docType}`);
    console.log(`   Document Hash: ${sampleHash}`);
    console.log(`   IPFS CID:      ${sampleCID}`);
  } else {
    console.log(`\n4. Demo Credential already exists for student #${studentId}. Total: ${studentCreds.length}`);
  }

  // Read summary counters
  const counters = await contractAsAdmin.getCounters();
  console.log("\n=======================================================");
  console.log(" SEED COMPLETE! CURRENT SMART CONTRACT STATUS");
  console.log("=======================================================");
  console.log(`Total Accredited Universities: ${counters.totalUniversities}`);
  console.log(`Total Authorized Companies:   ${counters.totalCompanies}`);
  console.log(`Total Registered Students:     ${counters.totalStudents}`);
  console.log(`Total Issued Credentials:      ${counters.totalCredentials}`);
  console.log("=======================================================");
  console.log("\nDEMO ACCESS CREDENTIALS FOR TESTING:");
  console.log("-------------------------------------------------------");
  console.log("1. ROOT ADMIN:");
  console.log("   URL: http://localhost:3000/admin-login");
  console.log("   Wallet: Hardhat Account #0 (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)");
  console.log("\n2. UNIVERSITY PORTAL:");
  console.log("   URL: http://localhost:3000/login -> Institutional tab");
  console.log("   Code: VTU-KA-001");
  console.log("   OR Wallet: Hardhat Account #1 (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)");
  console.log("\n3. RECRUITER / COMPANY PORTAL:");
  console.log("   URL: http://localhost:3000/login -> Corporate tab");
  console.log("   Code: INFY-BLR-01");
  console.log("   OR Wallet: Hardhat Account #2 (0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC)");
  console.log("\n4. STUDENT LOCKER & PUBLIC VERIFICATION:");
  console.log("   URL: http://localhost:3000/login -> Candidate Locker");
  console.log("   USN: 1RV21CS001");
  console.log("   Public Audit: http://localhost:3000/verify (search USN 1RV21CS001)");
  console.log("-------------------------------------------------------\n");
}

main().catch((error) => {
  console.error(" Seed script failed:", error);
  process.exitCode = 1;
});
