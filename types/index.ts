// TypeScript Interfaces for Blockchain Marks & Credential Verification

export enum CredentialStatus {
  Active = 0,
  Revoked = 1,
  Suspended = 2,
  Expired = 3,
}

export enum AchievementStatus {
  PendingReview = 0,
  Verified = 1,
  Rejected = 2,
}

export type UserRole = "admin" | "university" | "company" | "student" | "guest";

export type DocumentType =
  | "Degree Certificate"
  | "Marksheet"
  | "Experience Certificate"
  | "Academic Transcript"
  | "Professional Certificate";

export const SUPPORTED_DOCUMENT_TYPES: DocumentType[] = [
  "Degree Certificate",
  "Marksheet",
  "Experience Certificate",
  "Academic Transcript",
  "Professional Certificate",
];

export interface University {
  id: number;
  name: string;
  universityCode: string;
  wallet: string;
  active: boolean;
}

export interface Student {
  id: number;
  usn: string;
  name: string;
  course: string;
  graduationYear: number;
  percentage: number;
  universityId: number;
  exists: boolean;
}

export interface Credential {
  credentialId: number;
  studentId: number;
  universityId: number;
  documentType: string;
  documentHash: string; // 0x... 66-character hex (bytes32)
  ipfsCID: string;
  issuedAt: number; // Unix timestamp
  version: number;
  status: CredentialStatus;
  exists: boolean;
}

export interface Achievement {
  achievementId: number;
  studentId: number;
  studentUSN?: string;
  collegeCode?: string;
  txHash?: string;
  title: string;
  issuerOrg: string;
  category: string;
  documentHash: string;
  ipfsCID: string;
  submittedAt: number;
  reviewedAt: number;
  reviewingUniversityId: number;
  status: AchievementStatus;
  reviewRemarks: string;
  exists: boolean;
}

export interface Company {
  id: number;
  name: string;
  companyCode: string;
  wallet: string;
  active: boolean;
}

export interface VerificationRecord {
  verificationId: number;
  credentialId: number;
  companyId: number;
  documentType: string;
  hashMatched: boolean;
  verified: boolean;
  timestamp: number;
}

export interface AccessRequest {
  requestId: number;
  entityType: "university" | "company";
  name: string;
  proposedCode: string;
  contactEmail: string;
  wallet: string;
  approved: boolean;
  timestamp: number;
}

export interface SystemCounters {
  totalUniversities: number;
  totalStudents: number;
  totalCredentials: number;
  totalCompanies: number;
  totalVerifications: number;
  totalAchievements?: number;
  totalRequests?: number;
}

export interface CSVStudentRow {
  usn: string;
  name: string;
  course: string;
  gradYear: number;
  graduationYear?: number;
  percentage: number;
  documentType: string;
  gradeRemark?: string;
  semester?: string;
  gpa?: string;
  file?: File;
  status?: "pending" | "valid" | "error" | "processed";
  errorMsg?: string;
}

export interface SemesterScore {
  semester: string;
  gpa: number;
  percentage: number;
  credits: number;
}

export interface DigiLockerDocument {
  id: string;
  name: string;
  type: string;
  issuer: string;
  date: string;
  status: "verified" | "pulled";
  uri: string;
  hash: string;
}
