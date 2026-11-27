import { Resend } from "resend";
import nodemailer from "nodemailer";
import { SendVerificationEmailParams, EmailSendResult } from "./types";
import { renderVerificationEmail } from "./templates";
import { logAuditEvent } from "@/lib/audit";

export * from "./types";
export * from "./templates";

/**
 * Authoritative official email for 55 MOSA Platform
 * Centrally mandated for all system, administrative, and MFA delivery functions.
 */
export const OFFICIAL_PLATFORM_EMAIL = "55mosaplatform@gmail.com";

/**
 * Standard RFC-5322 compliant email regex check
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const clean = email.trim();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(clean) && clean.length <= 254;
}

/**
 * Checks whether authenticated SMTP is configured in the environment
 */
export function isSmtpConfigured(): boolean {
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "").trim();
  return Boolean(user && pass);
}

/**
 * Checks whether an outbound email gateway (SMTP or Resend) has been configured
 */
export function isEmailConfigured(): boolean {
  const hasResend = Boolean(process.env.RESEND_API_KEY?.replace(/^"|"$/g, "").trim());
  return isSmtpConfigured() || hasResend;
}

/**
 * Gets the configured sender address for transactional emails
 */
export function getSenderEmail(): string {
  const fromEnv = process.env.RESEND_FROM_EMAIL?.replace(/^"|"$/g, "").trim();
  return fromEnv || "55 MOSA Security <onboarding@resend.dev>";
}

/**
 * Dispatches a branded verification code email.
 * SECURITY & PRIVACY POLICY:
 * - Administrator security operations (ADMIN_PASSWORD_RESET) and platform security
 *   alerts route strictly to the authoritative platform security mailbox (55mosaplatform@gmail.com).
 * - Ordinary users' verification and password-recovery codes route to their own verified email addresses.
 * - Never expose one user's authentication codes to another.
 */
export async function sendVerificationEmail(
  params: SendVerificationEmailParams
): Promise<EmailSendResult> {
  const { to, code, purpose, language = "en", recipientName, clientIp } = params;

  // 1. Identify the authenticated account
  const targetAccount = params.targetAccount || (to || "").trim().toLowerCase();

  // 2. Intelligent & Secure Destination Routing:
  // Administrator security alerts route to 55mosaplatform@gmail.com; user codes route to their own email.
  const isAdminPurpose = purpose === "ADMIN_PASSWORD_RESET";
  const destinationEmail = isAdminPurpose ? OFFICIAL_PLATFORM_EMAIL : (to || "").trim().toLowerCase();

  // 3. Validate destination address for user dispatches
  if (!isAdminPurpose && !isValidEmail(destinationEmail)) {
    return {
      success: false,
      error: `Invalid destination email address: "${destinationEmail}". Verification codes must be delivered to the user's verified email address.`,
      isConfigured: isEmailConfigured(),
    };
  }

  // 4. Email provider configuration check
  if (!isEmailConfigured()) {
    return {
      success: false,
      error: "Email verification service is not configured. RESEND_API_KEY or SMTP credentials (SMTP_USER / SMTP_PASS) are required.",
      isConfigured: false,
    };
  }

  // 4. Render branded email template with target account security banner
  const { subject, html, text } = renderVerificationEmail(
    code,
    purpose,
    language,
    recipientName,
    targetAccount,
    clientIp
  );

  // 5. Dual-transport: Attempt Authenticated SMTP first if credentials exist (e.g. Gmail App Password)
  if (isSmtpConfigured()) {
    const smtpUser = process.env.SMTP_USER!.trim();
    const smtpPass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD)!.trim();
    const smtpHost = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
    const smtpPort = Number(process.env.SMTP_PORT) || 465;
    const isSecure = process.env.SMTP_SECURE !== "false" && smtpPort === 465;

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: isSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: `"55 MOSA Security" <${smtpUser}>`,
        to: destinationEmail,
        subject,
        html,
        text,
      });

      await logAuditEvent({
        action: "CENTRAL_MFA_DELIVERY_SUCCESS",
        entityType: "AUTH",
        entityId: targetAccount,
        metadata: {
          destination: destinationEmail,
          purpose,
          messageId: info.messageId,
          provider: "smtp",
        },
      }).catch(() => null);

      return {
        success: true,
        messageId: info.messageId,
        isConfigured: true,
      };
    } catch (smtpErr: any) {
      console.error("[SMTP Gateway Delivery Warning]:", smtpErr?.message);
      await logAuditEvent({
        action: "CENTRAL_MFA_DELIVERY_FAILED",
        entityType: "AUTH",
        entityId: targetAccount,
        metadata: {
          destination: destinationEmail,
          purpose,
          errorMessage: smtpErr?.message,
          provider: "smtp",
        },
      }).catch(() => null);

      // If Resend is not configured, return SMTP error immediately
      if (!process.env.RESEND_API_KEY) {
        return {
          success: false,
          error: smtpErr?.message || "Failed to dispatch email via SMTP gateway.",
          isConfigured: true,
        };
      }
    }
  }

  // 6. Resend Gateway Dispatch
  const from = getSenderEmail();
  const apiKey = (process.env.RESEND_API_KEY || "").replace(/^"|"$/g, "").trim();

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: destinationEmail,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("[Email Gateway Delivery Warning]:", error.message);
      
      await logAuditEvent({
        action: "CENTRAL_MFA_DELIVERY_FAILED",
        entityType: "AUTH",
        entityId: targetAccount,
        metadata: {
          destination: destinationEmail,
          purpose,
          errorName: error.name,
          errorMessage: error.message,
          provider: "resend",
        },
      }).catch(() => null);

      return {
        success: false,
        error: error.message || "Failed to dispatch email via Resend gateway.",
        isConfigured: true,
      };
    }

    await logAuditEvent({
      action: "CENTRAL_MFA_DELIVERY_SUCCESS",
      entityType: "AUTH",
      entityId: targetAccount,
      metadata: {
        destination: destinationEmail,
        purpose,
        messageId: data?.id,
        provider: "resend",
      },
    }).catch(() => null);

    return {
      success: true,
      messageId: data?.id,
      isConfigured: true,
    };
  } catch (err: any) {
    console.error("[Email Gateway Exception]:", err?.message);
    return {
      success: false,
      error: err?.message || "An unexpected error occurred while contacting the email gateway.",
      isConfigured: true,
    };
  }
}
