import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { persistMediaAsset } from "@/lib/storage";
import { validateUploadSecurity } from "@/lib/security/guards-engine";
import { MosaDirectCategory, MosaDirectPriority, MosaDirectStatus, Role } from "@prisma/client";

export const dynamic = "force-dynamic";

// In-memory sliding rate-limit tracker
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 10;

function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, data] of rateLimitMap.entries()) {
    if (data.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}

function getClientIp(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return headers.get("x-real-ip") || headers.get("cf-connecting-ip") || "127.0.0.1";
}

function hashIp(ip: string): string {
  const salt = process.env.DIRECT_IP_SALT || "mosa_direct_privacy_salt_2026";
  return crypto.createHash("sha256").update(`${ip}:${salt}`).digest("hex").slice(0, 32);
}

function generateReferenceNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let rand = "";
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `MD-${dateStr}-${rand}`;
}

const VALID_CATEGORIES = new Set<string>([
  "SUGGESTION",
  "COMPLAINT_FEEDBACK",
  "INCORRECT_INFO",
  "FRAUD_MISCONDUCT",
  "TECHNICAL_ISSUE",
  "PARTNERSHIP",
  "GENERAL_MESSAGE",
]);

function determineInitialPriority(category: MosaDirectCategory, subject: string, message: string): MosaDirectPriority {
  const lowerText = `${subject} ${message}`.toLowerCase();
  const urgentKeywords = ["urgent", "danger", "fraud", "scam", "extortion", "theft", "illegal", "police", "breach", "exploit"];
  const isUrgent = urgentKeywords.some((kw) => lowerText.includes(kw));

  if (category === MosaDirectCategory.FRAUD_MISCONDUCT || isUrgent) {
    return MosaDirectPriority.URGENT;
  }
  if (category === MosaDirectCategory.COMPLAINT_FEEDBACK || category === MosaDirectCategory.TECHNICAL_ISSUE) {
    return MosaDirectPriority.HIGH;
  }
  return MosaDirectPriority.NORMAL;
}

/**
 * POST /api/direct
 * Public submission endpoint for MOSA DIRECT: Global Feedback & Reporting System.
 * No account required. Supports anonymous submissions, attachments, spam detection,
 * rate limiting, and centralized admin database notifications.
 */
export async function POST(request: Request) {
  try {
    const rawIp = getClientIp(request);
    const ipHashed = hashIp(rawIp);
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Rate Limiting Check
    cleanupRateLimits();
    const now = Date.now();
    const rateData = rateLimitMap.get(ipHashed);
    if (rateData) {
      if (rateData.resetAt > now) {
        if (rateData.count >= MAX_REQUESTS_PER_WINDOW) {
          return NextResponse.json(
            { error: "Too many submissions. Please wait a few minutes before submitting another report." },
            { status: 429 }
          );
        }
        rateData.count += 1;
      } else {
        rateLimitMap.set(ipHashed, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      }
    } else {
      rateLimitMap.set(ipHashed, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }

    const contentType = request.headers.get("content-type") || "";
    let categoryInput = "GENERAL_MESSAGE";
    let subject = "";
    let message = "";
    let isAnonymous = false;
    let senderName: string | undefined;
    let senderEmail: string | undefined;
    let senderPhone: string | undefined;
    let senderCountry: string | undefined;
    let relatedBusinessId: string | undefined;
    let relatedBusinessName: string | undefined;
    let honeypot: string | undefined;
    const attachmentUrls: string[] = [];

    // Parse payload: Multipart or JSON
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      categoryInput = (formData.get("category") as string) || "GENERAL_MESSAGE";
      subject = ((formData.get("subject") as string) || "").trim();
      message = ((formData.get("message") as string) || "").trim();
      isAnonymous = formData.get("isAnonymous") === "true" || formData.get("isAnonymous") === "on";
      senderName = ((formData.get("senderName") as string) || "").trim() || undefined;
      senderEmail = ((formData.get("senderEmail") as string) || "").trim() || undefined;
      senderPhone = ((formData.get("senderPhone") as string) || "").trim() || undefined;
      senderCountry = ((formData.get("senderCountry") as string) || "").trim() || undefined;
      relatedBusinessId = ((formData.get("relatedBusinessId") as string) || "").trim() || undefined;
      relatedBusinessName = ((formData.get("relatedBusinessName") as string) || "").trim() || undefined;
      honeypot = ((formData.get("honeypot") as string) || "").trim();

      // Process uploaded files
      const files = formData.getAll("attachments") as File[];
      for (const file of files) {
        if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const filename = file.name || "attachment.bin";
          const mimeType = file.type || "application/octet-stream";

          const uploadCheck = validateUploadSecurity({
            filename,
            mimeType,
            sizeBytes: buffer.length,
          });

          if (uploadCheck.isAllowed) {
            try {
              const stored = await persistMediaAsset(buffer, filename, mimeType, "direct-attachments");
              attachmentUrls.push(stored.url);
            } catch (storageErr) {
              console.warn("Attachment storage fallback:", storageErr);
            }
          }
        }
      }
    } else {
      const body = await request.json().catch(() => ({}));
      categoryInput = body.category || "GENERAL_MESSAGE";
      subject = (body.subject || "").trim();
      message = (body.message || "").trim();
      isAnonymous = Boolean(body.isAnonymous);
      senderName = body.senderName ? String(body.senderName).trim() : undefined;
      senderEmail = body.senderEmail ? String(body.senderEmail).trim() : undefined;
      senderPhone = body.senderPhone ? String(body.senderPhone).trim() : undefined;
      senderCountry = body.senderCountry ? String(body.senderCountry).trim() : undefined;
      relatedBusinessId = body.relatedBusinessId ? String(body.relatedBusinessId).trim() : undefined;
      relatedBusinessName = body.relatedBusinessName ? String(body.relatedBusinessName).trim() : undefined;
      honeypot = body.honeypot ? String(body.honeypot).trim() : undefined;

      if (Array.isArray(body.attachments)) {
        for (const item of body.attachments) {
          if (typeof item === "string" && item.trim()) {
            attachmentUrls.push(item.trim());
          }
        }
      }
    }

    // Bot honeypot trap: if filled, silently exit with mock success
    if (honeypot) {
      return NextResponse.json({
        success: true,
        referenceNumber: generateReferenceNumber(),
        message: "Your submission has been received.",
      });
    }

    // Validation
    if (!subject || subject.length < 3) {
      return NextResponse.json({ error: "Subject is required (minimum 3 characters)." }, { status: 400 });
    }
    if (subject.length > 200) {
      return NextResponse.json({ error: "Subject must not exceed 200 characters." }, { status: 400 });
    }
    if (!message || message.length < 10) {
      return NextResponse.json({ error: "Message is required (minimum 10 characters)." }, { status: 400 });
    }
    if (message.length > 5000) {
      return NextResponse.json({ error: "Message must not exceed 5000 characters." }, { status: 400 });
    }

    // Category mapping
    const category = VALID_CATEGORIES.has(categoryInput)
      ? (categoryInput as MosaDirectCategory)
      : MosaDirectCategory.GENERAL_MESSAGE;

    // Detect sender country from Edge headers if not supplied
    if (!senderCountry) {
      senderCountry =
        request.headers.get("x-vercel-ip-country") ||
        request.headers.get("cf-ipcountry") ||
        request.headers.get("x-country-code") ||
        undefined;
    }

    // Cleanse sender info if anonymous
    const finalSenderName = isAnonymous ? null : senderName || null;
    const finalSenderEmail = isAnonymous ? null : senderEmail || null;
    const finalSenderPhone = isAnonymous ? null : senderPhone || null;

    // Email validation if supplied
    if (finalSenderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalSenderEmail)) {
      return NextResponse.json({ error: "Invalid email address format." }, { status: 400 });
    }

    const priority = determineInitialPriority(category, subject, message);

    // Generate unique reference number with retry if collision
    let referenceNumber = generateReferenceNumber();
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 5) {
      const existing = await prisma.mosaDirectMessage.findUnique({
        where: { referenceNumber },
        select: { id: true },
      });
      if (!existing) {
        isUnique = true;
      } else {
        referenceNumber = generateReferenceNumber();
        attempts++;
      }
    }

    // Database persistence
    const newRecord = await prisma.mosaDirectMessage.create({
      data: {
        referenceNumber,
        category,
        subject,
        message,
        isAnonymous,
        senderName: finalSenderName,
        senderEmail: finalSenderEmail,
        senderPhone: finalSenderPhone,
        senderCountry: senderCountry || null,
        relatedBusinessId: relatedBusinessId || null,
        relatedBusinessName: relatedBusinessName || null,
        attachments: attachmentUrls,
        priority,
        status: MosaDirectStatus.NEW,
        isRead: false,
        ipHash: ipHashed,
        userAgent: userAgent.slice(0, 255),
      },
    });

    // Notify authorized administrators in database
    try {
      const adminUsers = await prisma.user.findMany({
        where: {
          role: { in: [Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR] },
          status: "ACTIVE",
        },
        select: { id: true },
        take: 20,
      });

      if (adminUsers.length > 0) {
        await prisma.notification.createMany({
          data: adminUsers.map((admin) => ({
            userId: admin.id,
            title: `[MOSA DIRECT] New ${category} Report (${referenceNumber})`,
            message: `New submission received: "${subject}". Priority: ${priority}. Sender: ${
              isAnonymous ? "Anonymous" : finalSenderName || "Visitor"
            }.`,
            type: "SYSTEM",
          })),
        });
      }

      // Record in immutable audit log
      await prisma.auditLog.create({
        data: {
          action: "MOSA_DIRECT_SUBMITTED",
          entityType: "MOSA_DIRECT",
          entityId: newRecord.id,
          metadata: JSON.stringify({
            referenceNumber,
            category,
            priority,
            isAnonymous,
            senderCountry,
            hasAttachments: attachmentUrls.length > 0,
            hasContactDetails: Boolean(finalSenderEmail || finalSenderPhone),
          }),
        },
      });
    } catch (notifyErr) {
      console.warn("Admin notification recording error:", notifyErr);
    }

    return NextResponse.json({
      success: true,
      referenceNumber,
      category,
      priority,
      isAnonymous,
      createdAt: newRecord.createdAt,
      message: "Your message has been received securely by MOSA Administration.",
    });
  } catch (error: any) {
    console.error("MOSA DIRECT submission error:", error);
    return NextResponse.json(
      { error: "Failed to submit message. Please try again later." },
      { status: 500 }
    );
  }
}
