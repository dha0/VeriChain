const hre = require("hardhat");

async function main() {
  const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0xd1156FdEec51bffBb897596fd97B1877ffB2aE61";
  console.log("Checking contract at:", address);
  const contract = await hre.ethers.getContractAt("ITHiringMarksVerification", address);

  const stats = await contract.getAllStats();
  console.log("Stats on-chain:", {
    totalUniversities: Number(stats[0]),
    totalStudents: Number(stats[1]),
    totalCredentials: Number(stats[2]),
    totalAchievements: Number(stats[3]),
    totalCompanies: Number(stats[4]),
    totalVerifications: Number(stats[5]),
    totalRequests: Number(stats[6]),
  });

  const totalU = Number(stats[0]);
  for (let i = 1; i <= totalU; i++) {
    const u = await contract.getUniversity(i);
    console.log(`University #${i}:`, {
      id: Number(u.id),
      name: u.name,
      code: u.universityCode,
      wallet: u.wallet,
      active: u.active,
    });
  }

  const totalC = Number(stats[4]);
  for (let i = 1; i <= totalC; i++) {
    const c = await contract.getCompany(i);
    console.log(`Company #${i}:`, {
      id: Number(c.id),
      name: c.name,
      code: c.companyCode,
      wallet: c.wallet,
      active: c.active,
    });
  }

  const totalReq = Number(stats[6]);
  for (let i = 1; i <= totalReq; i++) {
    const r = await contract.getAccessRequest(i);
    console.log(`AccessRequest #${i}:`, {
      requestId: Number(r.requestId),
      entityType: r.entityType,
      name: r.name,
      proposedCode: r.proposedCode,
      wallet: r.wallet,
      approved: r.approved,
    });
  }
}

main().catch(console.error);
