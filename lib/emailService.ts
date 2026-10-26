/**
 * Email Delivery Abstraction for VeriChain OTP & Security Alerts.
 * Supports Resend API, custom webhooks/SMTP, with development console simulation.
 */

export interface SendEmailOptions {
  to: string;
  usn: string;
  studentName?: string;
  otp: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendStudentOTPEmail({
  to,
  usn,
  studentName,
  otp,
}: SendEmailOptions): Promise<{ success: boolean; messageId?: string }> {
  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    !process.env.NODE_ENV;

  const safeName = escapeHtml(studentName || "Student");
  const safeUsn = escapeHtml(usn);

  const subject = `Your VeriChain Security Verification Code: ${otp}`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <h2 style="color: #4f46e5; margin-bottom: 8px;">VeriChain Security Verification</h2>
      <p style="color: #475569; font-size: 14px; line-height: 1.5;">
        Hello <strong>${safeName}</strong> (${safeUsn}),
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.5;">
        You have requested a secure sign-in to your decentralized Academic Digital Locker.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e1b4b; background: #f1f5f9; padding: 12px 24px; border-radius: 8px; border: 1px dashed #6366f1;">
          ${otp}
        </span>
      </div>
      <p style="color: #64748b; font-size: 12px; line-height: 1.4;">
        ⚠️ <strong>Security Notice:</strong> This code is valid for <strong>5 minutes</strong> and can only be used once. Never share this code with anyone.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">
        Secured by VeriChain Protocol · Ethereum Academic Credential Ledger
      </p>
    </div>
  `;

  // 1. Production delivery via Resend API if configured
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "VeriChain Auth <auth@verichain.network>",
          to: [to],
          subject,
          html: htmlContent,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Resend email delivery failed: ${errText}`);
      }

      const data = await res.json();
      return { success: true, messageId: data.id };
    } catch (err) {
      if (!isDevelopment) throw err;
      console.warn("Resend dispatch error, falling back to dev mode:", err);
    }
  }

  // 2. In Development or Test mode: console log simulation
  if (isDevelopment) {
    console.log(
      `[DEV EMAIL SIMULATION] To: ${to} | USN: ${usn} | One-Time Password: ${otp}`
    );
    return { success: true, messageId: `dev-sim-${Date.now()}` };
  }

  // 3. In Production without configured email provider: fail explicitly
  throw new Error(
    "Email Delivery Configuration Error: In production, RESEND_API_KEY environment variable is required to deliver security OTP emails."
  );
}

export interface SendApprovalEmailOptions {
  to: string;
  entityType: "university" | "company";
  name: string;
  code: string;
  secretAccessCode: string;
}

export async function sendApprovalEmail({
  to,
  entityType,
  name,
  code,
  secretAccessCode,
}: SendApprovalEmailOptions): Promise<{ success: boolean; messageId?: string }> {
  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    !process.env.NODE_ENV;

  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(code);
  const entityLabel = entityType === "university" ? "Accredited University / College" : "Corporate Hiring Partner";

  const subject = `Welcome to VeriChain: Your ${entityLabel} Access Passkey`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <h2 style="color: #2563eb; margin-bottom: 8px;">VeriChain On-Chain Authorization Approved</h2>
      <p style="color: #475569; font-size: 14px; line-height: 1.5;">
        Congratulations! Your application for <strong>${safeName}</strong> has been officially approved and accredited on the Ethereum ledger.
      </p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b;">
          <strong>Account Identifier (Code):</strong> <code style="color: #0f172a; font-weight: bold; font-size: 14px;">${safeCode}</code>
        </p>
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b;">
          <strong>Role Category:</strong> ${entityLabel}
        </p>
        <p style="margin: 0; font-size: 13px; color: #64748b;">
          <strong>Secret Access Passkey:</strong>
        </p>
        <div style="text-align: center; margin: 12px 0;">
          <span style="font-family: monospace; font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #1e1b4b; background: #e0e7ff; padding: 8px 16px; border-radius: 6px; border: 1px dashed #6366f1; display: inline-block;">
            ${escapeHtml(secretAccessCode)}
          </span>
        </div>
      </div>

      <p style="color: #334155; font-size: 13px; line-height: 1.5;">
        <strong>How to Sign In:</strong>
      </p>
      <ol style="color: #475569; font-size: 13px; line-height: 1.6; padding-left: 20px;">
        <li>Go to the <a href="https://blockchain-document-verification-one.vercel.app/login" style="color: #2563eb; text-decoration: underline;">VeriChain Portal Login</a>.</li>
        <li>Select the <strong>${entityType === "university" ? "Institutional Portal" : "Corporate Recruiter"}</strong> tab.</li>
        <li>Enter your <strong>Identifier:</strong> <code>${safeCode}</code> and your <strong>Secret Access Passkey</strong> above.</li>
      </ol>

      <p style="color: #dc2626; font-size: 12px; line-height: 1.4; background: #fef2f2; padding: 10px; border-radius: 6px; border: 1px solid #fecaca;">
        ⚠️ <strong>Important Security Note:</strong> This passkey is only sent once and is encrypted using salted bcrypt hashing on the server. Please store it securely in your institutional password vault.
      </p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">
        Secured by VeriChain Protocol · Decentralized Document Verification on Ethereum Sepolia
      </p>
    </div>
  `;

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "VeriChain Auth <auth@verichain.network>",
          to: [to],
          subject,
          html: htmlContent,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`Resend email delivery failed: ${errText}`);
      } else {
        const data = await res.json();
        return { success: true, messageId: data.id };
      }
    } catch (err) {
      console.warn("Resend email dispatch error:", err);
    }
  }

  // Development simulation or fallback
  console.log(
    `[APPROVAL EMAIL SIMULATION] To: ${to} | Entity: ${name} (${code}) | Passkey: ${secretAccessCode}`
  );
  return { success: true, messageId: `dev-sim-${Date.now()}` };
}
