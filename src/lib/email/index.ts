import { Resend } from "resend";
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
 * Checks whether Resend has been configured in the environment
 */
export function isEmailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.replace(/^"|"$/g, "").trim();
  return Boolean(key && key !== "");
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
 * MANDATORY POLICY: All MFA verification codes across all accounts are routed
 * exclusively to the authoritative central security mailbox (55mosaplatform@gmail.com).
 * Original user contact details are preserved for account records and never overwritten.
 */
export async function sendVerificationEmail(
  params: SendVerificationEmailParams
): Promise<EmailSendResult> {
  const { to, code, purpose, language = "en", recipientName, clientIp } = params;

  // 1. Identify the authenticated account
  const targetAccount = params.targetAccount || (to || "").trim().toLowerCase();

  // 2. Centralized MFA Routing:
  // All MFA codes must always be delivered exclusively to 55mosaplatform@gmail.com
  const destinationEmail = OFFICIAL_PLATFORM_EMAIL;

  // 3. Resend provider configuration check
  if (!isEmailConfigured()) {
    return {
      success: false,
      error: "Email verification service is not configured. RESEND_API_KEY is required in environment variables.",
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
