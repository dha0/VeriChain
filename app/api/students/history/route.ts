import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/serverAuth";
import { parseAndValidateUSN } from "@/lib/usnParser";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required to view student record history." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const requestedUsn = searchParams.get("usn")?.trim()?.toUpperCase();

    if (session.role === "university") {
      const collegeCode = session.entityInfo?.code?.trim()?.toUpperCase();
      if (!collegeCode) {
        return NextResponse.json(
          { error: "Forbidden: University session missing registered college code." },
          { status: 403 }
        );
      }

      if (requestedUsn) {
        const parsed = parseAndValidateUSN(requestedUsn);
        if (!parsed.valid || parsed.collegeCode !== collegeCode) {
          return NextResponse.json(
            { error: "Forbidden: Candidate does not belong to your college." },
            { status: 403 }
          );
        }

        const student = await prisma.studentProfile.findUnique({
          where: { usn: requestedUsn },
        });

        const versions = await prisma.studentMarkVersion.findMany({
          where: { usn: requestedUsn },
          orderBy: { version: "desc" },
        });

        return NextResponse.json({ student, versions });
      }

      // If no specific USN is requested, return all students belonging to this college
      const students = await prisma.studentProfile.findMany({
        where: { collegeCode },
        orderBy: { updatedAt: "desc" },
      });

      return NextResponse.json({ students });
    }

    if (session.role === "student") {
      const studentUsn = (session.studentUSN || "").trim().toUpperCase();
      if (!studentUsn) {
        return NextResponse.json({ error: "Missing candidate USN in session." }, { status: 400 });
      }

      const student = await prisma.studentProfile.findUnique({
        where: { usn: studentUsn },
      });

      const versions = await prisma.studentMarkVersion.findMany({
        where: { usn: studentUsn },
        orderBy: { version: "desc" },
      });

      return NextResponse.json({ student, versions });
    }

    if (session.role === "admin") {
      if (requestedUsn) {
        const student = await prisma.studentProfile.findUnique({
          where: { usn: requestedUsn },
        });
        const versions = await prisma.studentMarkVersion.findMany({
          where: { usn: requestedUsn },
          orderBy: { version: "desc" },
        });
        return NextResponse.json({ student, versions });
      }

      const students = await prisma.studentProfile.findMany({
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json({ students });
    }

    return NextResponse.json(
      { error: "Forbidden: Insufficient permissions to view record history." },
      { status: 403 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to retrieve student history." },
      { status: 500 }
    );
  }
}
