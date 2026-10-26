import { NextRequest, NextResponse } from "next/server";
import { generateAuthNonce, buildSIWEMessage } from "@/lib/serverAuth";
import { ethers } from "ethers";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");

    if (!wallet || !ethers.isAddress(wallet)) {
      return NextResponse.json({ error: "Valid Ethereum wallet address required" }, { status: 400 });
    }

    const nonce = await generateAuthNonce(wallet);
    const message = buildSIWEMessage(wallet, nonce);
    return NextResponse.json({ nonce, message });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to generate nonce" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet } = body;

    if (!wallet || !ethers.isAddress(wallet)) {
      return NextResponse.json({ error: "Valid Ethereum wallet address required" }, { status: 400 });
    }

    const nonce = await generateAuthNonce(wallet);
    const message = buildSIWEMessage(wallet, nonce);
    return NextResponse.json({ nonce, message });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to generate nonce" }, { status: 500 });
  }
}

