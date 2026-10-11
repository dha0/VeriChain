import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { AccessRequest } from "@/types";

const DATA_FILE = path.join(process.cwd(), ".access_requests.json");

function readRequests(): AccessRequest[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {}

  // Initial seed demo requests
  const initial: AccessRequest[] = [
    {
      requestId: 1,
      entityType: "university",
      name: "Indian Institute of Science (IISc)",
      proposedCode: "IISC-BLR-01",
      contactEmail: "registrar@iisc.ac.in",
      wallet: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
      approved: false,
      timestamp: Date.now() - 3600000 * 24,
    },
    {
      requestId: 2,
      entityType: "company",
      name: "Tata Consultancy Services (TCS)",
      proposedCode: "TCS-MUM-01",
      contactEmail: "campus.hiring@tcs.com",
      wallet: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
      approved: false,
      timestamp: Date.now() - 3600000 * 12,
    },
  ];
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  } catch (e) {}
  return initial;
}

function writeRequests(data: AccessRequest[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to write access requests:", e);
  }
}

export async function GET() {
  const requests = readRequests();
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, requestData, requestId } = body;
    const requests = readRequests();

    if (action === "submit") {
      const { entityType, name, proposedCode, contactEmail, wallet } = requestData;
      if (!name || !proposedCode || !contactEmail) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      const newReq: AccessRequest = {
        requestId: requests.length + 1,
        entityType,
        name,
        proposedCode: proposedCode.toUpperCase(),
        contactEmail,
        wallet: wallet || "0x0000000000000000000000000000000000000000",
        approved: false,
        timestamp: Date.now(),
      };

      requests.push(newReq);
      writeRequests(requests);
      return NextResponse.json({ success: true, request: newReq });
    }

    if (action === "approve") {
      const index = requests.findIndex((r) => r.requestId === Number(requestId));
      if (index === -1) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }

      requests[index].approved = true;
      writeRequests(requests);
      return NextResponse.json({ success: true, request: requests[index] });
    }

    if (action === "reject") {
      const filtered = requests.filter((r) => r.requestId !== Number(requestId));
      writeRequests(filtered);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
