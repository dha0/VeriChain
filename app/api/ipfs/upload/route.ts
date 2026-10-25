import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/serverAuth";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required to pin documents to decentralized IPFS." },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided for IPFS pinning" }, { status: 400 });
    }

    const pinataJWT = process.env.PINATA_JWT?.trim();
    const pinataApiKey = process.env.PINATA_API_KEY?.trim();
    const pinataSecretKey = process.env.PINATA_SECRET_API_KEY?.trim();

    // Mandate real IPFS via Pinata - no mock fallback in final production demo
    if (!pinataJWT && (!pinataApiKey || !pinataSecretKey)) {
      return NextResponse.json(
        {
          error:
            "Real IPFS storage is mandatory for production verification. Please configure PINATA_JWT (or PINATA_API_KEY and PINATA_SECRET_API_KEY) in .env.local.",
        },
        { status: 503 }
      );
    }

    const pinataFormData = new FormData();
    pinataFormData.append("file", file);

    const metadata = JSON.stringify({
      name: `Credential_${Date.now()}_${file.name}`,
    });
    pinataFormData.append("pinataMetadata", metadata);

    const headers: Record<string, string> = {};
    if (pinataJWT) {
      headers["Authorization"] = `Bearer ${pinataJWT}`;
    } else {
      headers["pinata_api_key"] = pinataApiKey!;
      headers["pinata_secret_api_key"] = pinataSecretKey!;
    }

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers,
      body: pinataFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Pinata IPFS upload failed (${response.status}): ${errorText}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({ cid: result.IpfsHash });
  } catch (error: any) {
    console.error("IPFS upload route error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
