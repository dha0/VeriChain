import { NextRequest, NextResponse } from "next/server";
import { generateAuthNonce } from "@/lib/serverAuth";
import { ethers } from "ethers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet } = body;

    if (!wallet || !ethers.isAddress(wallet)) {
      return NextResponse.json({ error: "Valid Ethereum wallet address required" }, { status: 400 });
    }

    const nonce = generateAuthNonce(wallet);
    return NextResponse.json({ nonce });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to generate nonce" }, { status: 500 });
  }
}
