const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

async function generateFixtures() {
  const fixturesDir = path.join(__dirname);
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // 1. CSV Fixture
  const csvContent =
`USN,Name,Email,Course,GraduationYear,Semester,SubjectCode,SubjectName,InternalMarks,ExternalMarks,MaxMarks
1RV21CS001,Alice Sharma,alice.sharma@rvce.edu.in,Computer Science,2025,5,21CS51,Automata Theory,45,45,100
1RV21CS001,Alice Sharma,alice.sharma@rvce.edu.in,Computer Science,2025,5,21CS52,Computer Networks,42,48,100
1RV21CS002,Bob Kumar,bob.kumar@rvce.edu.in,Information Science,2025,5,21IS51,Operating Systems,40,42,100
`;
  fs.writeFileSync(path.join(fixturesDir, "valid_students.csv"), csvContent.trim());
  console.log("Created valid_students.csv");

  // 2. Excel (XLSX) Fixture
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Students");
  worksheet.columns = [
    { header: "USN", key: "usn", width: 15 },
    { header: "Name", key: "name", width: 20 },
    { header: "Email", key: "email", width: 25 },
    { header: "Course", key: "course", width: 20 },
    { header: "GraduationYear", key: "gradYear", width: 15 },
    { header: "Semester", key: "semester", width: 10 },
    { header: "SubjectCode", key: "subjectCode", width: 15 },
    { header: "SubjectName", key: "subjectName", width: 25 },
    { header: "InternalMarks", key: "internalMarks", width: 15 },
    { header: "ExternalMarks", key: "externalMarks", width: 15 },
    { header: "MaxMarks", key: "maxMarks", width: 12 },
  ];

  worksheet.addRow({
    usn: "1RV21CS001",
    name: "Alice Sharma",
    email: "alice.sharma@rvce.edu.in",
    course: "Computer Science",
    gradYear: 2025,
    semester: 5,
    subjectCode: "21CS51",
    subjectName: "Automata Theory",
    internalMarks: 45,
    externalMarks: 45,
    maxMarks: 100,
  });
  worksheet.addRow({
    usn: "1RV21CS001",
    name: "Alice Sharma",
    email: "alice.sharma@rvce.edu.in",
    course: "Computer Science",
    gradYear: 2025,
    semester: 5,
    subjectCode: "21CS52",
    subjectName: "Computer Networks",
    internalMarks: 42,
    externalMarks: 48,
    maxMarks: 100,
  });
  worksheet.addRow({
    usn: "1RV21CS002",
    name: "Bob Kumar",
    email: "bob.kumar@rvce.edu.in",
    course: "Information Science",
    gradYear: 2025,
    semester: 5,
    subjectCode: "21IS51",
    subjectName: "Operating Systems",
    internalMarks: 40,
    externalMarks: 42,
    maxMarks: 100,
  });

  await workbook.xlsx.writeFile(path.join(fixturesDir, "valid_students.xlsx"));
  console.log("Created valid_students.xlsx");

  // 3. Electronic PDF with selectable text layer
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.addPage([600, 400]);

  const textLines = [
    "RV College of Engineering - Official Academic Marksheet",
    "Student Name: Alice Sharma",
    "USN: 1RV21CS001",
    "Email: alice.sharma@rvce.edu.in",
    "Course: Computer Science",
    "Graduation Year: 2025",
    "Aggregate Percentage: 90.0%",
    "",
    "Coursework Evaluation Breakdown:",
    "21CS51 Automata Theory 45 45 90 100",
    "21CS52 Computer Networks 42 48 90 100",
  ];

  let y = 360;
  for (const line of textLines) {
    page.drawText(line, { x: 50, y, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 22;
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(path.join(fixturesDir, "sample_marksheet.pdf"), Buffer.from(pdfBytes));
  console.log("Created sample_marksheet.pdf");

  // 4. Scanned PDF (empty text layer to test rejection of scanned documents)
  const scannedDoc = await PDFDocument.create();
  scannedDoc.addPage([600, 400]);
  const scannedBytes = await scannedDoc.save();
  fs.writeFileSync(path.join(fixturesDir, "scanned_marksheet.pdf"), Buffer.from(scannedBytes));
  console.log("Created scanned_marksheet.pdf");
}

generateFixtures().catch(console.error);
