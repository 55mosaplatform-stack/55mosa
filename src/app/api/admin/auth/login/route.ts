import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, createSessionToken, setSessionCookie, createAndSaveOtp, verifyOtpCode } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { Role } from "@prisma/client";
import {
  checkPaymentRateLimit,
  getRateLimitClientIp,
  getRateLimitHeaders,
} from "@/lib/payments/rate-limiter";
import { sendVerificationEmail, isEmailConfigured } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const clientIp = getRateLimitClientIp(request);

    // Rate Limiting: Max 5 administrator login attempts per 5 minutes per IP
    const ipRateLimit = await checkPaymentRateLimit({
      key: `admin:login:ip:${clientIp}`,
      limit: 5,
      windowSeconds: 300,
    });

    if (!ipRateLimit.isAllowed) {
      return NextResponse.json(
        { error: "Too many failed or rapid administrator login attempts. Access temporarily throttled." },
        { status: 429, headers: getRateLimitHeaders(ipRateLimit) }
      );
    }

    const body = await request.json();
    const identifier = (body.email || body.phone || body.identifier || "").trim().toLowerCase();
    const password = body.password;
    const mfaCode = body.mfaCode ? String(body.mfaCode).trim() : null;

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Administrator email/phone and password are required" },
        { status: 400 }
      );
    }

    // Find administrator by email or phone
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier },
        ],
      },
    });

    if (!user) {
      await logAuditEvent({
        action: "ADMIN_LOGIN_FAILED",
        entityType: "USER",
        entityId: identifier,
        metadata: { clientIp, reason: "ADMIN_NOT_FOUND" },
      }).catch(() => null);

      return NextResponse.json({ error: "Invalid administrator credentials" }, { status: 401 });
    }

    // Role check: Only administrative roles permitted in Command Center
    const allowedRoles: Role[] = [Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR];
    if (!allowedRoles.includes(user.role)) {
      await logAuditEvent({
        actorId: user.id,
        action: "ADMIN_LOGIN_UNAUTHORIZED_ROLE",
        entityType: "USER",
        entityId: user.id,
        metadata: { clientIp, role: user.role },
      }).catch(() => null);

      return NextResponse.json(
        { error: "Access Denied: Administrative clearance required" },
        { status: 403 }
      );
    }

    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Your administrator account has been suspended" },
        { status: 403 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "Administrator password is not initialized" },
        { status: 400 }
      );
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      await logAuditEvent({
        actorId: user.id,
        action: "ADMIN_LOGIN_FAILED",
        entityType: "USER",
        entityId: user.id,
        metadata: { clientIp, reason: "INVALID_CREDENTIALS" },
      }).catch(() => null);

      return NextResponse.json({ error: "Invalid administrator credentials" }, { status: 401 });
    }

    // Check if initial forced password change is required
    if (user.mustChangePassword) {
      return NextResponse.json({
        success: true,
        mustChangePassword: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    }

    // MULTI-FACTOR AUTHENTICATION (MFA) FOR SUPER_ADMIN
    if (user.role === Role.SUPER_ADMIN) {
      const targetIdentifier = user.email || user.phone || identifier;

      if (!mfaCode) {
        // Step 1: Issue MFA Challenge
        const otp = await createAndSaveOtp(targetIdentifier);

        if (user.email && isEmailConfigured()) {
          await sendVerificationEmail({
            to: user.email,
            code: otp,
            purpose: "ADMIN_LOGIN_MFA" as any,
            language: "en",
            recipientName: user.name,
            expiresMinutes: 10,
          }).catch(() => null);
        } else {
          console.log(`[MFA_CHALLENGE] Security verification code for SUPER_ADMIN ${user.email || user.name}: ${otp}`);
        }

        await logAuditEvent({
          actorId: user.id,
          action: "ADMIN_MFA_CHALLENGE_DISPATCHED",
          entityType: "USER",
          entityId: user.id,
          metadata: { clientIp, email: user.email },
        }).catch(() => null);

        return NextResponse.json({
          success: true,
          mfaRequired: true,
          email: user.email,
          message: "Multi-Factor Authentication required for Super Administrator. A 4-digit code has been dispatched.",
        });
      } else {
        // Step 2: Verify MFA Code
        const isValidMfa = await verifyOtpCode(targetIdentifier, mfaCode);
        if (!isValidMfa) {
          await logAuditEvent({
            actorId: user.id,
            action: "ADMIN_MFA_FAILED",
            entityType: "USER",
            entityId: user.id,
            metadata: { clientIp, attemptedCode: mfaCode },
          }).catch(() => null);

          return NextResponse.json(
            { error: "Invalid or expired Multi-Factor Authentication code." },
            { status: 401 }
          );
        }

        await logAuditEvent({
          actorId: user.id,
          action: "ADMIN_MFA_VERIFIED",
          entityType: "USER",
          entityId: user.id,
          metadata: { clientIp },
        }).catch(() => null);
      }
    }

    // Authenticated flow: create session
    const token = await createSessionToken({
      userId: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    await setSessionCookie(token);

    await logAuditEvent({
      actorId: user.id,
      action: "ADMIN_LOGIN_SUCCESS",
      entityType: "USER",
      entityId: user.id,
      metadata: { role: user.role, email: user.email },
    });

    return NextResponse.json({
      success: true,
      mustChangePassword: false,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("[Admin Auth Login Error]:", error);
    return NextResponse.json({ error: "Authentication system error" }, { status: 500 });
  }
}
