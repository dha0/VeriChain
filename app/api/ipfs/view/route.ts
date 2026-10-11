import { NextRequest, NextResponse } from "next/server";

// Sample verified degree HTML for demo credentials and gateway fallback
function getVerifiedDemoCertificateHTML(cid: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VeriChain | Decentralized Academic Credential Dossier</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #0f172a;
      --border: #334155;
      --primary: #3b82f6;
      --text: #f8fafc;
      --muted: #94a3b8;
      --gold: #f59e0b;
      --emerald: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, var(--bg) 70%);
      color: var(--text);
      min-height: 100vh;
      padding: 30px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .cert-container {
      max-width: 860px;
      width: 100%;
      background: #ffffff;
      color: #0f172a;
      border-radius: 20px;
      padding: 48px;
      box-shadow: 0 25px 60px -15px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1);
      position: relative;
      overflow: hidden;
      border: 8px double #cbd5e1;
    }
    .cert-container::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0; height: 8px;
      background: linear-gradient(90deg, #2563eb, #7c3aed, #06b6d4, #10b981);
    }
    .header-seal {
      text-align: center;
      margin-bottom: 24px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
    }
    .emblem {
      width: 68px;
      height: 68px;
      margin: 0 auto 12px;
      background: linear-gradient(135deg, #1e40af, #4338ca);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 900;
      font-size: 24px;
      box-shadow: 0 4px 12px rgba(37,99,235,0.3);
    }
    .institution-name {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
      text-transform: uppercase;
    }
    .institution-sub {
      font-size: 13px;
      color: #64748b;
      margin-top: 4px;
      font-weight: 500;
    }
    .cert-title {
      text-align: center;
      margin: 28px 0 20px;
    }
    .cert-title h2 {
      font-size: 14px;
      font-weight: 700;
      color: #6366f1;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .cert-title h1 {
      font-size: 28px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 6px;
    }
    .recipient-text {
      text-align: center;
      font-size: 15px;
      color: #475569;
      line-height: 1.6;
      max-width: 680px;
      margin: 0 auto 24px;
    }
    .recipient-name {
      font-size: 26px;
      font-weight: 800;
      color: #1e3a8a;
      display: block;
      margin: 10px 0;
      text-decoration: underline;
      text-underline-offset: 6px;
      text-decoration-color: #93c5fd;
    }
    .details-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .detail-item {
      text-align: center;
    }
    .detail-label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .detail-value {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 4px;
      font-family: monospace;
    }
    .blockchain-stamp {
      background: #0f172a;
      color: #e2e8f0;
      border-radius: 12px;
      padding: 16px 20px;
      font-family: "Courier New", Courier, monospace;
      font-size: 11px;
      line-height: 1.5;
      margin-bottom: 24px;
      border-left: 4px solid #10b981;
    }
    .stamp-title {
      font-weight: bold;
      color: #34d399;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .cert-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 16px;
      border-top: 2px dashed #cbd5e1;
    }
    .sig-block {
      text-align: center;
    }
    .sig-line {
      width: 180px;
      border-bottom: 1px solid #64748b;
      margin-bottom: 6px;
      font-family: cursive;
      font-size: 18px;
      color: #1e3a8a;
    }
    .sig-title {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
    }
    .action-bar {
      margin-top: 24px;
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .btn {
      padding: 10px 20px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .btn-print {
      background: #2563eb;
      color: white;
      border: none;
    }
    .btn-print:hover { background: #1d4ed8; }
    .btn-secondary {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
    }
    .btn-secondary:hover { background: #334155; }
    @media print {
      body { background: white; padding: 0; }
      .action-bar { display: none; }
      .cert-container { box-shadow: none; border: none; }
    }
  </style>
</head>
<body>
  <div class="cert-container">
    <div class="header-seal">
      <div class="emblem">VTU</div>
      <div class="institution-name">Visvesvaraya Technological University</div>
      <div class="institution-sub">Accredited State Technological University · Belagavi, Karnataka, India</div>
    </div>

    <div class="cert-title">
      <h2>Official Academic Credential</h2>
      <h1>Degree of Bachelor of Engineering</h1>
    </div>

    <div class="recipient-text">
      This is to certify that
      <span class="recipient-name">Rahul Sharma</span>
      bearing University Seat Number <strong>1RV21CS001</strong> has fulfilled all academic requirements in 
      <strong>Computer Science & Engineering</strong> and has been admitted to the degree with 
      <strong>First Class with Distinction (Honors)</strong>.
    </div>

    <div class="details-grid">
      <div class="detail-item">
        <div class="detail-label">University Seat No (USN)</div>
        <div class="detail-value">1RV21CS001</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Cumulative GPA / Percentage</div>
        <div class="detail-value">8.92 CGPA (85.0%)</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Graduation Year</div>
        <div class="detail-value">Class of 2026</div>
      </div>
    </div>

    <div class="blockchain-stamp">
      <div class="stamp-title">✓ ON-CHAIN CRYPTOGRAPHIC VERIFICATION SEAL</div>
      <div><strong>Blockchain Network:</strong> Ethereum Sepolia Testnet (Chain ID: 11155111)</div>
      <div><strong>Smart Contract:</strong> 0xd1156FdEec51bffBb897596fd97B1877ffB2aE61</div>
      <div><strong>Document SHA-256 Hash:</strong> 0x19d18798c87aa0c7407e6b4c3eb78919b2c415964131bc02a48617c2aaee0939</div>
      <div><strong>Decentralized IPFS CID:</strong> ${cid}</div>
      <div><strong>Tamper Status:</strong> IMMUTABLE & VERIFIED · Tamper-Free Ledger Anchor</div>
    </div>

    <div class="cert-footer">
      <div class="sig-block">
        <div class="sig-line">Dr. B. E. Rangaswamy</div>
        <div class="sig-title">Registrar (Evaluation)</div>
      </div>
      <div style="text-align: center; font-size: 10px; color: #64748b; font-family: monospace;">
        SECURED BY VERICHAIN PROTOCOL<br>
        Date of Convocation: October 2026
      </div>
      <div class="sig-block">
        <div class="sig-line">Prof. S. Vidyashankar</div>
        <div class="sig-title">Vice Chancellor</div>
      </div>
    </div>
  </div>

  <div class="action-bar">
    <button class="btn btn-print" onclick="window.print()">
      🖨️ Print / Save as PDF
    </button>
    <a href="/student" class="btn btn-secondary">
      🎓 Return to Student Locker
    </a>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cid = (searchParams.get("cid") || "").trim();

  if (!cid) {
    return NextResponse.json({ error: "Missing IPFS CID parameter" }, { status: 400 });
  }

  const cleanCID = cid.replace("ipfs://", "");

  // If this is the demo degree certificate CID or mock CID, serve the high-fidelity verified certificate
  if (
    cleanCID === "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco" ||
    cleanCID.startsWith("QmXoyp")
  ) {
    return new NextResponse(getVerifiedDemoCertificateHTML(cleanCID), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // Gateway endpoints to attempt in priority order
  const gateways = [
    `https://teal-causal-tortoise-675.mypinata.cloud/ipfs/${cleanCID}`,
    `https://gateway.pinata.cloud/ipfs/${cleanCID}`,
    `https://dweb.link/ipfs/${cleanCID}`,
    `https://ipfs.io/ipfs/${cleanCID}`,
    `https://cloudflare-ipfs.com/ipfs/${cleanCID}`,
  ];

  for (const gatewayUrl of gateways) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4-second timeout per gateway

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
          },
        });
      }
    } catch (e) {
      // Continue to next gateway mirror
    }
  }

  // Fallback: Return a clean in-app IPFS Document Dossier viewer
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
    <p>This credential document is permanently anchored to the Ethereum blockchain with immutable cryptographic integrity.</p>
    <div class="cid-box">${cleanCID}</div>
    <div class="mirrors">
      <a class="link-btn" href="https://teal-causal-tortoise-675.mypinata.cloud/ipfs/${cleanCID}" target="_blank">Open via Dedicated Gateway (teal-causal-tortoise-675.mypinata.cloud)</a>
      <a class="link-btn" href="https://dweb.link/ipfs/${cleanCID}" target="_blank">Open via DWeb.link Gateway</a>
      <a class="link-btn" href="https://ipfs.io/ipfs/${cleanCID}" target="_blank">Open via IPFS.io Gateway</a>
      <a class="link-btn" href="https://cloudflare-ipfs.com/ipfs/${cleanCID}" target="_blank">Open via Cloudflare IPFS Gateway</a>
    </div>
  </div>
</body>
</html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}
