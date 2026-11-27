import { NextResponse } from "next/server";
import { getCurrentUser, comparePassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode, verifyAndConsumeRecoveryCode } from "@/lib/security/totp";
import { logAuditEvent } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { password, code } = body;

    if (!password || !code) {
      return NextResponse.json(
        { error: "Administrator password and verification code are required to disable MFA" },
        { status: 400 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: "Administrator password is not initialized" }, { status: 400 });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json({ error: "Invalid administrator password" }, { status: 401 });
    }

    const profile = await prisma.adminMfaProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile || !profile.totpEnabled) {
      return NextResponse.json({ error: "MFA is not currently active for this account" }, { status: 400 });
    }

    // Verify with TOTP code or recovery code
    const cleanCode = String(code).trim();
    let isCodeValid = false;

    if (profile.totpSecret && cleanCode.replace(/\D/g, "").length === 6) {
      const totpCheck = verifyTotpCode(profile.totpSecret, cleanCode);
      isCodeValid = totpCheck.isValid;
    }

    if (!isCodeValid && profile.recoveryCodes.length > 0) {
      const recoveryCheck = verifyAndConsumeRecoveryCode(cleanCode, profile.recoveryCodes);
      isCodeValid = recoveryCheck.isValid;
    }

    if (!isCodeValid) {
      return NextResponse.json({ error: "Invalid authenticator or recovery code" }, { status: 401 });
    }

    // Disable MFA
    await prisma.adminMfaProfile.update({
      where: { userId: user.id },
      data: {
        totpEnabled: false,
        totpSecret: null,
        recoveryCodes: [],
        enrolledAt: null,
      },
    });

    await logAuditEvent({
      actorId: user.id,
      action: "ADMIN_MFA_DISABLED",
      entityType: "USER",
      entityId: user.id,
      metadata: { role: user.role, email: user.email },
    });

    return NextResponse.json({
      success: true,
      message: "Multi-Factor Authentication has been disabled for your account.",
    });
  } catch (error) {
    console.error("[MFA Disable Error]:", error);
    return NextResponse.json({ error: "Failed to disable MFA" }, { status: 500 });
  }
}
