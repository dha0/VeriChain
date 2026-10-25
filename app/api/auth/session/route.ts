import { NextRequest, NextResponse } from "next/server";
import { getServerSession, clearSessionCookie } from "@/lib/serverAuth";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ authenticated: false, session: null }, { status: 200 });
    }
    return NextResponse.json({ authenticated: true, session }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ authenticated: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Logout endpoint
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  clearSessionCookie(response);
  return response;
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  clearSessionCookie(response);
  return response;
}
