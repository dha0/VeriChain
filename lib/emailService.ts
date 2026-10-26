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
