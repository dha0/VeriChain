import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      error: "National Academic Depository (NAD) / DigiLocker integration is not integrated.",
      code: "NOT_INTEGRATED",
      status: 501,
    },
    { status: 501 }
  );
}

export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      error: "DigiLocker document bridging service is not integrated.",
      code: "NOT_INTEGRATED",
      status: 501,
    },
    { status: 501 }
  );
}
