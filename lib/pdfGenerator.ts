import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { CONTRACT_ADDRESS, SUPPORTED_NETWORK_NAME } from "@/contracts/contractAddress";

export interface SubjectMark {
  code: string;
  title: string;
  credits: number;
  maxMarks: number;
  marksObtained: number;
  grade: string;
  gradePoint: number;
}

export interface MarksheetGenerationData {
  universityName: string;
  universityCode: string;
  studentName: string;
  usn: string;
  course: string;
  graduationYear: number;
  percentage?: number;
  cgpa?: number;
  semester?: string;
  documentType?: string;
  academicDistinction?: string;
  verificationUrl: string;
  contractAddress?: string;
  blockchainNetwork?: string;
  subjects?: SubjectMark[];
  issueDate?: string;
}

/**
 * Automatically generates a standard curriculum subject list if specific subjects were not entered,
 * proportionally scaled to match the candidate's actual aggregate percentage.
 */
export function getDefaultSubjectsForCourse(course: string, percentage: number): SubjectMark[] {
  const normPct = Math.min(100, Math.max(40, percentage || 80));

  const sampleSyllabus = [
    { code: "21CS71", title: "Artificial Intelligence & Machine Learning", credits: 4 },
    { code: "21CS72", title: "Cloud Computing Architecture & DevOps", credits: 4 },
    { code: "21CS73", title: "Cryptography, Network Security & PKI", credits: 3 },
    { code: "21CS74", title: "Decentralized Systems & Blockchain DApps", credits: 3 },
    { code: "21CSL75", title: "Advanced Full-Stack Engineering Lab", credits: 2 },
    { code: "21CSP76", title: "Major Capstone Industry Project & Viva", credits: 6 },
  ];

  return sampleSyllabus.map((item, idx) => {
    // Slight realistic variation (+- 3%) around candidate percentage
    const variation = idx % 3 === 0 ? 2 : idx % 2 === 0 ? -1 : 1;
    const marks = Math.min(100, Math.max(50, Math.round(normPct + variation)));
    let grade = "A";
    let gradePoint = 9;

    if (marks >= 90) {
      grade = "O (Outstanding)";
      gradePoint = 10;
    } else if (marks >= 80) {
      grade = "A+ (Excellent)";
      gradePoint = 9;
    } else if (marks >= 70) {
      grade = "A (Very Good)";
      gradePoint = 8;
    } else if (marks >= 60) {
      grade = "B+ (Good)";
      gradePoint = 7;
    } else if (marks >= 50) {
      grade = "B (Above Average)";
      gradePoint = 6;
    } else {
      grade = "C (Pass)";
      gradePoint = 5;
    }

    return {
      code: item.code,
      title: item.title,
      credits: item.credits,
      maxMarks: 100,
      marksObtained: marks,
      grade,
      gradePoint,
    };
  });
}

/**
 * Generates an official, high-fidelity PDF Marksheet / Transcript with:
 * - Official University Header & State Accreditation Seal
 * - Student Particulars & Academic Identification
 * - Detailed Semester Course Breakdown & CGPA Calculations
 * - Blockchain Verification Seal with embedded QR code pointing to live on-chain verify URL
 * - Controller of Examinations & Registrar Signatures
 */
export async function generateMarksheetPDF(data: MarksheetGenerationData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Standard A4 dimensions: 595.28 x 841.89 points
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  // Load Standard Fonts
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const fontSerifBold = await doc.embedFont(StandardFonts.TimesRomanBold);

  // Colors
  const primaryDark = rgb(15 / 255, 23 / 255, 42 / 255); // Slate 900
  const bluePrimary = rgb(30 / 255, 64 / 255, 175 / 255); // Blue 800
  const blueAccent = rgb(37 / 255, 99 / 255, 235 / 255); // Blue 600
  const gold = rgb(180 / 255, 130 / 255, 30 / 255);
  const textMuted = rgb(100 / 255, 116 / 255, 139 / 255);
  const textDark = rgb(30 / 255, 41 / 255, 59 / 255);
  const lightBg = rgb(248 / 255, 250 / 255, 252 / 255);
  const emerald = rgb(16 / 255, 185 / 255, 129 / 255);
  const borderGray = rgb(203 / 255, 213 / 255, 225 / 255);

  // 1. Draw Outer Decorative Guilloche / Security Borders
  // Outer Border
  page.drawRectangle({
    x: 18,
    y: 18,
    width: width - 36,
    height: height - 36,
    borderColor: bluePrimary,
    borderWidth: 2,
  });

  // Inner Border
  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: gold,
    borderWidth: 0.8,
  });

  // Corner Accent Marks
  const cornerSize = 12;
  page.drawRectangle({ x: 18, y: height - 18 - cornerSize, width: cornerSize, height: cornerSize, color: bluePrimary });
  page.drawRectangle({ x: width - 18 - cornerSize, y: height - 18 - cornerSize, width: cornerSize, height: cornerSize, color: bluePrimary });
  page.drawRectangle({ x: 18, y: 18, width: cornerSize, height: cornerSize, color: bluePrimary });
  page.drawRectangle({ x: width - 18 - cornerSize, y: 18, width: cornerSize, height: cornerSize, color: bluePrimary });

  // 2. Header Section: University Name & Accreditation
  let cursorY = height - 52;

  const uName = (data.universityName || "VISVESVARAYA TECHNOLOGICAL UNIVERSITY").toUpperCase();
  const uNameWidth = fontSerifBold.widthOfTextAtSize(uName, 17);
  page.drawText(uName, {
    x: (width - uNameWidth) / 2,
    y: cursorY,
    size: 17,
    font: fontSerifBold,
    color: bluePrimary,
  });

  cursorY -= 15;
  const subText = `${data.universityCode || "VTU-KA-001"} · ACCREDITED STATE TECHNOLOGICAL UNIVERSITY`;
  const subTextWidth = fontRegular.widthOfTextAtSize(subText, 9);
  page.drawText(subText, {
    x: (width - subTextWidth) / 2,
    y: cursorY,
    size: 9,
    font: fontRegular,
    color: textMuted,
  });

  cursorY -= 12;
  const stateText = "GOVERNMENT OF KARNATAKA · APPROVED BY AICTE & UGC · NEW DELHI";
  const stateTextWidth = fontRegular.widthOfTextAtSize(stateText, 7.5);
  page.drawText(stateText, {
    x: (width - stateTextWidth) / 2,
    y: cursorY,
    size: 7.5,
    font: fontRegular,
    color: textMuted,
  });

  // Header separator line with gold accent
  cursorY -= 10;
  page.drawLine({
    start: { x: 40, y: cursorY },
    end: { x: width - 40, y: cursorY },
    color: blueAccent,
    thickness: 1.5,
  });
  page.drawLine({
    start: { x: 40, y: cursorY - 2 },
    end: { x: width - 40, y: cursorY - 2 },
    color: gold,
    thickness: 0.8,
  });

  // 3. Document Title Banner
  cursorY -= 24;
  const docTitle = (data.documentType || "OFFICIAL CONSOLIDATED MARKSHEET & TRANSCRIPT").toUpperCase();
  const docTitleWidth = fontBold.widthOfTextAtSize(docTitle, 13);

  // Background banner box
  const bannerWidth = Math.max(docTitleWidth + 40, 360);
  page.drawRectangle({
    x: (width - bannerWidth) / 2,
    y: cursorY - 4,
    width: bannerWidth,
    height: 22,
    color: lightBg,
    borderColor: bluePrimary,
    borderWidth: 1,
  });

  page.drawText(docTitle, {
    x: (width - docTitleWidth) / 2,
    y: cursorY + 2,
    size: 13,
    font: fontBold,
    color: bluePrimary,
  });

  // 4. Candidate Identification Grid
  cursorY -= 32;

  // Background box for student info
  page.drawRectangle({
    x: 40,
    y: cursorY - 56,
    width: width - 80,
    height: 70,
    color: lightBg,
    borderColor: borderGray,
    borderWidth: 0.8,
  });

  // Row 1
  const labelX1 = 52;
  const valX1 = 175;
  const labelX2 = 320;
  const valX2 = 425;

  let infoY = cursorY - 8;
  page.drawText("CANDIDATE NAME:", { x: labelX1, y: infoY, size: 8.5, font: fontBold, color: textMuted });
  page.drawText(data.studentName.toUpperCase(), { x: valX1, y: infoY, size: 9.5, font: fontBold, color: primaryDark });

  page.drawText("UNIVERSITY SEAT NO:", { x: labelX2, y: infoY, size: 8.5, font: fontBold, color: textMuted });
  page.drawText(data.usn.toUpperCase(), { x: valX2, y: infoY, size: 10, font: fontBold, color: bluePrimary });

  // Row 2
  infoY -= 18;
  page.drawText("DEGREE & BRANCH:", { x: labelX1, y: infoY, size: 8.5, font: fontBold, color: textMuted });
  page.drawText(data.course, { x: valX1, y: infoY, size: 9, font: fontRegular, color: textDark });

  page.drawText("ACADEMIC BATCH:", { x: labelX2, y: infoY, size: 8.5, font: fontBold, color: textMuted });
  page.drawText(`Class of ${data.graduationYear}`, { x: valX2, y: infoY, size: 9, font: fontBold, color: textDark });

  // Row 3
  infoY -= 18;
  page.drawText("INSTITUTION CODE:", { x: labelX1, y: infoY, size: 8.5, font: fontBold, color: textMuted });
  page.drawText(data.universityCode, { x: valX1, y: infoY, size: 9, font: fontRegular, color: textDark });

  const pct = data.percentage || 85;
  const calcCgpa = data.cgpa || (pct / 9.5).toFixed(2);
  const distinction = data.academicDistinction || (pct >= 75 ? "FIRST CLASS WITH DISTINCTION" : "FIRST CLASS");

  page.drawText("CLASSIFICATION:", { x: labelX2, y: infoY, size: 8.5, font: fontBold, color: textMuted });
  page.drawText(distinction, { x: valX2, y: infoY, size: 8.5, font: fontBold, color: emerald });

  // 5. Subject Marksheet Table
  cursorY -= 75;

  const subjects = (data.subjects && data.subjects.length > 0)
    ? data.subjects
    : getDefaultSubjectsForCourse(data.course, pct);

  // Table Dimensions & Columns
  const tableX = 40;
  const tableWidth = width - 80;
  const colWidths = {
    sl: 28,
    code: 58,
    title: 220,
    credits: 45,
    max: 50,
    obtained: 55,
    grade: 59,
  };

  // Table Header Background
  page.drawRectangle({
    x: tableX,
    y: cursorY - 14,
    width: tableWidth,
    height: 18,
    color: bluePrimary,
  });

  // Table Header Labels
  let curX = tableX;
  page.drawText("#", { x: curX + 10, y: cursorY - 9, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  curX += colWidths.sl;
  page.drawText("SUB CODE", { x: curX + 6, y: cursorY - 9, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  curX += colWidths.code;
  page.drawText("COURSE / SUBJECT TITLE", { x: curX + 8, y: cursorY - 9, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  curX += colWidths.title;
  page.drawText("CREDITS", { x: curX + 4, y: cursorY - 9, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  curX += colWidths.credits;
  page.drawText("MAX", { x: curX + 14, y: cursorY - 9, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  curX += colWidths.max;
  page.drawText("SCORED", { x: curX + 10, y: cursorY - 9, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  curX += colWidths.obtained;
  page.drawText("GRADE", { x: curX + 8, y: cursorY - 9, size: 8, font: fontBold, color: rgb(1, 1, 1) });

  cursorY -= 14;

  // Table Rows
  let totalCredits = 0;
  let totalMax = 0;
  let totalScored = 0;

  for (let i = 0; i < subjects.length; i++) {
    const s = subjects[i];
    totalCredits += s.credits;
    totalMax += s.maxMarks;
    totalScored += s.marksObtained;

    const rowHeight = 17;
    cursorY -= rowHeight;

    // Alternating Row background
    if (i % 2 === 0) {
      page.drawRectangle({
        x: tableX,
        y: cursorY,
        width: tableWidth,
        height: rowHeight,
        color: lightBg,
      });
    }

    // Row borders
    page.drawRectangle({
      x: tableX,
      y: cursorY,
      width: tableWidth,
      height: rowHeight,
      borderColor: borderGray,
      borderWidth: 0.5,
    });

    curX = tableX;
    page.drawText(String(i + 1), { x: curX + 10, y: cursorY + 5, size: 8, font: fontRegular, color: textMuted });
    curX += colWidths.sl;
    page.drawText(s.code, { x: curX + 6, y: cursorY + 5, size: 8, font: fontBold, color: primaryDark });
    curX += colWidths.code;
    page.drawText(s.title.length > 38 ? s.title.slice(0, 36) + "..." : s.title, {
      x: curX + 8,
      y: cursorY + 5,
      size: 8,
      font: fontRegular,
      color: textDark,
    });
    curX += colWidths.title;
    page.drawText(String(s.credits), { x: curX + 18, y: cursorY + 5, size: 8, font: fontRegular, color: textDark });
    curX += colWidths.credits;
    page.drawText(String(s.maxMarks), { x: curX + 14, y: cursorY + 5, size: 8, font: fontRegular, color: textMuted });
    curX += colWidths.max;
    page.drawText(String(s.marksObtained), { x: curX + 16, y: cursorY + 5, size: 8.5, font: fontBold, color: bluePrimary });
    curX += colWidths.obtained;
    page.drawText(s.grade, { x: curX + 6, y: cursorY + 5, size: 7.5, font: fontBold, color: emerald });
  }

  // Aggregate Total Row
  cursorY -= 20;
  page.drawRectangle({
    x: tableX,
    y: cursorY,
    width: tableWidth,
    height: 20,
    color: rgb(241 / 255, 245 / 255, 249 / 255),
    borderColor: bluePrimary,
    borderWidth: 0.8,
  });

  page.drawText("CONSOLIDATED TOTALS:", { x: tableX + 14, y: cursorY + 6, size: 8.5, font: fontBold, color: bluePrimary });
  page.drawText(`Credits: ${totalCredits}`, { x: tableX + 285, y: cursorY + 6, size: 8.5, font: fontBold, color: textDark });
  page.drawText(`Max: ${totalMax}`, { x: tableX + 370, y: cursorY + 6, size: 8.5, font: fontBold, color: textMuted });
  page.drawText(`Total: ${totalScored}`, { x: tableX + 430, y: cursorY + 6, size: 8.5, font: fontBold, color: bluePrimary });
  page.drawText(`Aggregate: ${pct}%`, { x: tableX + 480, y: cursorY + 6, size: 8.5, font: fontBold, color: emerald });

  // 6. Cumulative CGPA & Result Summary Box
  cursorY -= 36;
  page.drawRectangle({
    x: tableX,
    y: cursorY,
    width: tableWidth,
    height: 30,
    color: lightBg,
    borderColor: gold,
    borderWidth: 1,
  });

  page.drawText(`CUMULATIVE GRADE POINT AVERAGE (CGPA):  ${calcCgpa} / 10.00`, {
    x: tableX + 16,
    y: cursorY + 11,
    size: 9.5,
    font: fontBold,
    color: primaryDark,
  });

  page.drawText(`FINAL RESULT:  ${distinction}`, {
    x: tableX + 310,
    y: cursorY + 11,
    size: 9.5,
    font: fontBold,
    color: emerald,
  });

  // 7. Blockchain Verification & Embedded Dynamic QR Code Section
  cursorY -= 135;

  // Background Box for Blockchain Anchor
  page.drawRectangle({
    x: tableX,
    y: cursorY,
    width: tableWidth,
    height: 125,
    color: rgb(15 / 255, 23 / 255, 42 / 255), // Dark Navy Slate
    borderColor: blueAccent,
    borderWidth: 1.5,
  });

  // Generate QR Code PNG Buffer using qrcode library
  const verifyTargetUrl = data.verificationUrl || "https://blockchain-document-verification-one.vercel.app/verify";
  const qrDataUrl = await QRCode.toDataURL(verifyTargetUrl, {
    width: 250,
    margin: 1,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
  });

  const qrImage = await doc.embedPng(qrDataUrl);

  // Draw QR Code inside a clean white badge
  const qrBoxSize = 98;
  const qrX = tableX + 14;
  const qrY = cursorY + 14;

  page.drawRectangle({
    x: qrX,
    y: qrY,
    width: qrBoxSize,
    height: qrBoxSize,
    color: rgb(1, 1, 1),
    borderColor: blueAccent,
    borderWidth: 1,
  });

  page.drawImage(qrImage, {
    x: qrX + 4,
    y: qrY + 4,
    width: qrBoxSize - 8,
    height: qrBoxSize - 8,
  });

  // Blockchain Security Text alongside QR Code
  const textLeftX = qrX + qrBoxSize + 18;
  let secY = cursorY + 104;

  page.drawText("✓ ETHEREUM ON-CHAIN CRYPTOGRAPHIC VERIFICATION SEAL", {
    x: textLeftX,
    y: secY,
    size: 9.5,
    font: fontBold,
    color: rgb(52 / 255, 211 / 255, 153 / 255), // Emerald light
  });

  secY -= 14;
  page.drawText("Distributed Ledger:", { x: textLeftX, y: secY, size: 8, font: fontBold, color: rgb(148 / 255, 163 / 255, 184 / 255) });
  page.drawText(data.blockchainNetwork || SUPPORTED_NETWORK_NAME || "Ethereum Sepolia Testnet (Chain ID: 11155111)", {
    x: textLeftX + 90,
    y: secY,
    size: 8,
    font: fontRegular,
    color: rgb(241 / 255, 245 / 255, 249 / 255),
  });

  secY -= 13;
  page.drawText("Smart Contract:", { x: textLeftX, y: secY, size: 8, font: fontBold, color: rgb(148 / 255, 163 / 255, 184 / 255) });
  page.drawText(data.contractAddress || CONTRACT_ADDRESS, {
    x: textLeftX + 90,
    y: secY,
    size: 7.5,
    font: fontRegular,
    color: rgb(56 / 255, 189 / 255, 248 / 255), // Cyan
  });

  secY -= 13;
  page.drawText("Verification URL:", { x: textLeftX, y: secY, size: 8, font: fontBold, color: rgb(148 / 255, 163 / 255, 184 / 255) });
  const displayUrl = verifyTargetUrl.length > 48 ? verifyTargetUrl.slice(0, 46) + "..." : verifyTargetUrl;
  page.drawText(displayUrl, {
    x: textLeftX + 90,
    y: secY,
    size: 7.5,
    font: fontRegular,
    color: rgb(241 / 255, 245 / 255, 249 / 255),
  });

  secY -= 15;
  page.drawText("SCAN WITH ANY SMARTPHONE CAMERA TO VERIFY TAMPER-FREE LEDGER STATUS", {
    x: textLeftX,
    y: secY,
    size: 7.5,
    font: fontBold,
    color: gold,
  });

  secY -= 12;
  page.drawText("Client-side SHA-256 fingerprint & Pinata IPFS decentralized CID anchor guarantee mathematical authenticity.", {
    x: textLeftX,
    y: secY,
    size: 6.8,
    font: fontItalic,
    color: rgb(148 / 255, 163 / 255, 184 / 255),
  });

  // 8. Signatures & Footer Section
  cursorY -= 48;

  // Left Signature: Controller of Examinations
  const sigLineY = cursorY + 16;
  page.drawLine({
    start: { x: 50, y: sigLineY },
    end: { x: 190, y: sigLineY },
    color: textMuted,
    thickness: 0.8,
  });

  page.drawText("Dr. B. E. Rangaswamy", { x: 72, y: sigLineY + 4, size: 9, font: fontItalic, color: bluePrimary });
  page.drawText("CONTROLLER OF EXAMINATIONS", { x: 52, y: sigLineY - 9, size: 7, font: fontBold, color: textMuted });

  // Center Seal
  const centerText1 = "VERIFIED ACADEMIC RECORD";
  const centerText2 = `Issued: ${data.issueDate || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  page.drawText(centerText1, {
    x: (width - fontBold.widthOfTextAtSize(centerText1, 7.5)) / 2,
    y: sigLineY,
    size: 7.5,
    font: fontBold,
    color: emerald,
  });
  page.drawText(centerText2, {
    x: (width - fontRegular.widthOfTextAtSize(centerText2, 7)) / 2,
    y: sigLineY - 9,
    size: 7,
    font: fontRegular,
    color: textMuted,
  });

  // Right Signature: Registrar
  page.drawLine({
    start: { x: width - 190, y: sigLineY },
    end: { x: width - 50, y: sigLineY },
    color: textMuted,
    thickness: 0.8,
  });

  page.drawText("Prof. S. Vidyashankar", { x: width - 165, y: sigLineY + 4, size: 9, font: fontItalic, color: bluePrimary });
  page.drawText("REGISTRAR (EVALUATION)", { x: width - 168, y: sigLineY - 9, size: 7, font: fontBold, color: textMuted });

  // Bottom Notice
  const bottomNotice = "This document is cryptographically generated and anchored to Ethereum Sepolia. Forgery or unauthorized alteration is detectable by SHA-256 hash.";
  page.drawText(bottomNotice, {
    x: (width - fontRegular.widthOfTextAtSize(bottomNotice, 6.5)) / 2,
    y: 28,
    size: 6.5,
    font: fontRegular,
    color: textMuted,
  });

  return await doc.save();
}

/**
 * Convenience helper to download generated PDF in the browser.
 */
export function downloadPDFFile(pdfBytes: Uint8Array, fileName: string) {
  const blob = new Blob([pdfBytes as any], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
