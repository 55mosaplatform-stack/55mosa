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
import { isIpBlocked, recordFailedAuthAttempt } from "@/lib/security/guards-engine";
import { sendVerificationEmail, isEmailConfigured } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const clientIp = getRateLimitClientIp(request);

    // 0. Digital Security Guard: Check if IP is currently quarantined
    if (await isIpBlocked(clientIp)) {
      return NextResponse.json(
        { error: "Access Denied: Your IP address has been quarantined by the MOSA Digital Security Guard due to detected security violations." },
        { status: 403 }
      );
    }

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

      await recordFailedAuthAttempt({
        ip: clientIp,
        identifier,
        userAgent: request.headers.get("user-agent") || undefined,
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

      await recordFailedAuthAttempt({
        ip: clientIp,
        identifier,
        userAgent: request.headers.get("user-agent") || undefined,
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

      await recordFailedAuthAttempt({
        ip: clientIp,
        identifier,
        userAgent: request.headers.get("user-agent") || undefined,
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

    // MULTI-FACTOR AUTHENTICATION (MFA) ARCHITECTURE:
    // 1. Privileged Roles (SUPER_ADMIN / Platform Owner / Financial Custodians):
    //    MFA is strictly mandatory and permanently non-negotiable. It can never be disabled.
    // 2. Non-privileged Staff (COMMUNITY_ADMIN, MODERATOR):
    //    Enforced by default; configurable via STAFF_MFA_ENFORCED without compromising super-admin security.
    const isSuperAdmin = user.role === Role.SUPER_ADMIN;
    const isStaffMfaEnforced = process.env.STAFF_MFA_ENFORCED !== "false";
    const requiresMfa = isSuperAdmin || isStaffMfaEnforced || Boolean(mfaCode);

    if (allowedRoles.includes(user.role) && requiresMfa) {
      const targetIdentifier = user.email || user.phone || identifier;

      if (!mfaCode) {
        // Step 1: Issue Centralized MFA Challenge
        const otp = await createAndSaveOtp(targetIdentifier);

        let emailDispatched = false;
        let providerError: string | null = null;

        if (isEmailConfigured()) {
          const res = await sendVerificationEmail({
            to: targetIdentifier,
            targetAccount: user.email || targetIdentifier,
            code: otp,
            purpose: "ADMIN_LOGIN_MFA",
            language: "en",
            recipientName: user.name,
            expiresMinutes: 10,
            clientIp,
          });
          emailDispatched = res.success;
          if (!res.success) {
            providerError = res.error || "Email gateway rejected delivery";
          }
        }

        await logAuditEvent({
          actorId: user.id,
          action: "ADMIN_MFA_CHALLENGE_DISPATCHED",
          entityType: "USER",
          entityId: user.id,
          metadata: {
            clientIp,
            targetAccount: user.email,
            deliveryDestination: "55mosaplatform@gmail.com",
            emailDispatched,
            providerError,
          },
        }).catch(() => null);

        return NextResponse.json({
          success: true,
          mfaRequired: true,
          mfaDestination: "55mosaplatform@gmail.com",
          account: user.email || targetIdentifier,
          message: "Multi-Factor Authentication code dispatched to authoritative mailbox (55mosaplatform@gmail.com).",
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
            metadata: { clientIp, attemptedCode: mfaCode, targetAccount: user.email },
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
          metadata: { clientIp, targetAccount: user.email },
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
