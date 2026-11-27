import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { verifyTotpCode, verifyAndConsumeRecoveryCode } from "@/lib/security/totp";
import { logAuditEvent } from "@/lib/audit";
import { Role } from "@prisma/client";
import {
  checkPaymentRateLimit,
  getRateLimitClientIp,
  getRateLimitHeaders,
} from "@/lib/payments/rate-limiter";
import { isIpBlocked, recordFailedAuthAttempt } from "@/lib/security/guards-engine";

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
    const totpCode = body.totpCode || (body.mfaCode && String(body.mfaCode).trim().length === 6 ? body.mfaCode : null);
    const recoveryCode = body.recoveryCode || (body.mfaCode && String(body.mfaCode).includes("-") ? body.mfaCode : null);

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Administrator email/phone and password are required" },
        { status: 400 }
      );
    }

    // Find administrator by email or phone, including their MFA configuration profile
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier },
        ],
      },
      include: {
        mfaProfile: true,
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

    // -------------------------------------------------------------------------
    // RELIABLE MULTI-FACTOR AUTHENTICATION (TOTP Authenticator & Recovery Codes)
    // -------------------------------------------------------------------------
    const mfaProfile = user.mfaProfile;
    if (mfaProfile && mfaProfile.totpEnabled && mfaProfile.totpSecret) {
      // If no TOTP code or recovery code is supplied, return challenge prompt
      if (!totpCode && !recoveryCode) {
        return NextResponse.json({
          success: true,
          mfaRequired: true,
          mfaType: "TOTP",
          email: user.email,
          recoveryCodesAvailable: (mfaProfile.recoveryCodes?.length || 0) > 0,
          message: "Multi-Factor Authentication required. Enter the 6-digit code from your authenticator app or an emergency recovery code.",
        });
      }

      // 1. Verify with 6-digit TOTP code
      if (totpCode) {
        const cleanTotp = String(totpCode).trim().replace(/\D/g, "");
        const verification = verifyTotpCode(mfaProfile.totpSecret, cleanTotp, {
          lastUsedStep: mfaProfile.lastUsedStep,
        });

        if (!verification.isValid) {
          await logAuditEvent({
            actorId: user.id,
            action: "ADMIN_MFA_FAILED",
            entityType: "USER",
            entityId: user.id,
            metadata: { clientIp, reason: verification.reason || "INVALID_TOTP" },
          }).catch(() => null);

          await recordFailedAuthAttempt({
            ip: clientIp,
            identifier,
            userAgent: request.headers.get("user-agent") || undefined,
          }).catch(() => null);

          return NextResponse.json(
            { error: verification.reason || "Invalid authenticator code. Please check your app and try again." },
            { status: 401 }
          );
        }

        // Update lastUsedStep in PostgreSQL to prevent replay attacks
        await prisma.adminMfaProfile.update({
          where: { userId: user.id },
          data: { lastUsedStep: verification.step },
        });

        await logAuditEvent({
          actorId: user.id,
          action: "ADMIN_MFA_VERIFIED",
          entityType: "USER",
          entityId: user.id,
          metadata: { clientIp, method: "TOTP" },
        });
      }
      // 2. Or verify with emergency recovery code
      else if (recoveryCode) {
        const recoveryResult = verifyAndConsumeRecoveryCode(
          String(recoveryCode).trim(),
          mfaProfile.recoveryCodes
        );

        if (!recoveryResult.isValid) {
          await logAuditEvent({
            actorId: user.id,
            action: "ADMIN_MFA_RECOVERY_FAILED",
            entityType: "USER",
            entityId: user.id,
            metadata: { clientIp },
          }).catch(() => null);

          await recordFailedAuthAttempt({
            ip: clientIp,
            identifier,
            userAgent: request.headers.get("user-agent") || undefined,
          }).catch(() => null);

          return NextResponse.json(
            { error: "Invalid or already used emergency recovery code." },
            { status: 401 }
          );
        }

        // Consume the recovery code (single use)
        await prisma.adminMfaProfile.update({
          where: { userId: user.id },
          data: { recoveryCodes: recoveryResult.remainingHashedCodes },
        });

        await logAuditEvent({
          actorId: user.id,
          action: "ADMIN_MFA_RECOVERY_CODE_CONSUMED",
          entityType: "USER",
          entityId: user.id,
          metadata: { clientIp, remainingCount: recoveryResult.remainingHashedCodes.length },
        });
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
      mfaEnrollmentRecommended: user.role === Role.SUPER_ADMIN && !mfaProfile?.totpEnabled,
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

