import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

const TEMPLATE_HEADERS = [
  "USN",
  "Name",
  "Email",
  "Course",
  "GraduationYear",
  "Semester",
  "SubjectCode",
  "SubjectName",
  "InternalMarks",
  "ExternalMarks",
  "MaxMarks",
];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") || "csv").toLowerCase();

  // 1. XLSX Template Generation via ExcelJS
  if (format === "xlsx" || format === "excel") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "VeriChain Institutional Protocol";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Students_Marks_Template");
    sheet.columns = [
      { header: "USN", key: "usn", width: 16 },
      { header: "Name", key: "name", width: 24 },
      { header: "Email", key: "email", width: 30 },
      { header: "Course", key: "course", width: 22 },
      { header: "GraduationYear", key: "gradYear", width: 16 },
      { header: "Semester", key: "semester", width: 12 },
      { header: "SubjectCode", key: "subjectCode", width: 16 },
      { header: "SubjectName", key: "subjectName", width: 32 },
      { header: "InternalMarks", key: "internalMarks", width: 16 },
      { header: "ExternalMarks", key: "externalMarks", width: 16 },
      { header: "MaxMarks", key: "maxMarks", width: 14 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" }, // Indigo primary
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 24;

    // Buffer output (no demo rows)
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="verichain_student_upload_template.xlsx"',
      },
    });
  }

  // 2. CSV Template Generation (Headers Only)
  const csvContent = TEMPLATE_HEADERS.join(",") + "\n";
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="verichain_student_upload_template.csv"',
    },
  });
}
