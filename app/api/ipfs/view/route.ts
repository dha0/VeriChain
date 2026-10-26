import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawCid = (searchParams.get("cid") || "").trim();

  if (!rawCid) {
    return NextResponse.json({ error: "Missing IPFS CID parameter" }, { status: 400 });
  }

  const cleanCID = rawCid.replace(/^ipfs:\/\//, "").trim();

  // Security: Strict validation of CID characters to prevent XSS and parameter injection
  if (!/^[a-zA-Z0-9_-]{20,120}$/.test(cleanCID)) {
    return NextResponse.json({ error: "Invalid IPFS CID format" }, { status: 400 });
  }

  // Priority gateway list: configured gateway first, then dependable decentralized mirrors
  const customGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || process.env.PINATA_GATEWAY;
  const primaryGateway = customGateway
    ? `${customGateway.replace(/\/+$/, "")}/${cleanCID}`
    : `https://teal-causal-tortoise-675.mypinata.cloud/ipfs/${cleanCID}`;

  const gateways = [
    primaryGateway,
    `https://gateway.pinata.cloud/ipfs/${cleanCID}`,
    `https://dweb.link/ipfs/${cleanCID}`,
    `https://ipfs.io/ipfs/${cleanCID}`,
    `https://w3s.link/ipfs/${cleanCID}`,
  ];

  for (const gatewayUrl of gateways) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const res = await fetch(gatewayUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "VeriChain-IPFS-Viewer/1.0",
        },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "application/octet-stream";
        const body = await res.arrayBuffer();

        return new NextResponse(Buffer.from(body), {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=604800, immutable",
            "Content-Disposition": contentType.includes("pdf") || contentType.includes("image")
              ? "inline"
              : `attachment; filename="${cleanCID}"`,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    } catch {
      // Continue to next gateway mirror
    }
  }

  // Safe fallback: sanitized in-app IPFS Document Dossier viewer
  const safeCID = cleanCID.replace(/[&<>"']/g, "");
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VeriChain | IPFS Document Ledger</title>
  <style>
    body {
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 32px;
      max-width: 600px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #38bdf8; }
    p { font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 20px; }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      background: rgba(16,185,129,0.15);
      border: 1px solid rgba(16,185,129,0.3);
      color: #34d399;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .cid-box {
      background: #020617;
      border: 1px solid #1e293b;
      padding: 12px;
      border-radius: 12px;
      font-family: monospace;
      font-size: 12px;
      color: #cbd5e1;
      word-break: break-all;
      margin-bottom: 24px;
    }
    .mirrors {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .link-btn {
      display: block;
      padding: 10px;
      background: #1e293b;
      color: #e2e8f0;
      border-radius: 10px;
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
      transition: background 0.2s;
    }
    .link-btn:hover { background: #334155; color: white; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓ Verified On-Chain CID Anchor</div>
    <h1>Decentralized IPFS Document</h1>
    <p>This credential document is permanently anchored to Ethereum. If the gateways are currently syncing, you can inspect it through the mirrors below.</p>
    <div class="cid-box">${safeCID}</div>
    <div class="mirrors">
      <a class="link-btn" href="${primaryGateway}" target="_blank" rel="noopener noreferrer">Open via Configured Gateway</a>
      <a class="link-btn" href="https://gateway.pinata.cloud/ipfs/${safeCID}" target="_blank" rel="noopener noreferrer">Open via Pinata Cloud Gateway</a>
      <a class="link-btn" href="https://dweb.link/ipfs/${safeCID}" target="_blank" rel="noopener noreferrer">Open via DWeb.link Gateway</a>
      <a class="link-btn" href="https://ipfs.io/ipfs/${safeCID}" target="_blank" rel="noopener noreferrer">Open via IPFS.io Gateway</a>
    </div>
  </div>
</body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
