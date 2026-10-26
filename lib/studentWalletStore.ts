import { prisma } from "@/lib/prisma";

/**
 * Verifies if a student USN already has a linked Web3 wallet.
 */
export async function getStudentLinkedWallet(usn: string): Promise<string | null> {
  const cleanUsn = usn.trim().toUpperCase();
  const record = await prisma.studentWalletLink.findUnique({
    where: { usn: cleanUsn },
  });
  return record ? record.wallet.toLowerCase() : null;
}

/**
 * Finds the student USN bound to a given Web3 wallet address.
 */
export async function findStudentByWallet(wallet: string): Promise<string | null> {
  const cleanWallet = wallet.trim().toLowerCase();
  const record = await prisma.studentWalletLink.findFirst({
    where: { wallet: cleanWallet },
  });
  return record ? record.usn.toUpperCase() : null;
}

/**
 * Links a student USN to a verified Web3 wallet address in PostgreSQL.
 * Enforces strict 1-to-1 uniqueness: a wallet cannot be bound to multiple students,
 * and a student cannot have multiple wallets.
 */
export async function linkStudentWallet(usn: string, wallet: string): Promise<{ success: boolean }> {
  const cleanUsn = usn.trim().toUpperCase();
  const cleanWallet = wallet.trim().toLowerCase();

  // 1. Check if wallet is already bound to another USN
  const existingWallet = await prisma.studentWalletLink.findFirst({
    where: { wallet: cleanWallet },
  });
  if (existingWallet && existingWallet.usn.toUpperCase() !== cleanUsn) {
    throw new Error(`Unique constraint failed: Wallet ${cleanWallet} is already linked to student ${existingWallet.usn}`);
  }

  // 2. Check if student already has a different wallet linked
  const existingStudent = await prisma.studentWalletLink.findUnique({
    where: { usn: cleanUsn },
  });
  if (existingStudent && existingStudent.wallet.toLowerCase() !== cleanWallet) {
    throw new Error(`Unique constraint failed: Student ${cleanUsn} is already linked to wallet ${existingStudent.wallet}`);
  }

  await prisma.studentWalletLink.upsert({
    where: { usn: cleanUsn },
    update: {
      wallet: cleanWallet,
      linkedAt: new Date(),
    },
    create: {
      usn: cleanUsn,
      wallet: cleanWallet,
      linkedAt: new Date(),
    },
  });

  return { success: true };
}
