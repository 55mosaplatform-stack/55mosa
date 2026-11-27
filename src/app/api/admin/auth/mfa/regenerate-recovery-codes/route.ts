import { NextResponse } from "next/server";
import { getCurrentUser, comparePassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode, generateRecoveryCodes } from "@/lib/security/totp";
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
        { error: "Administrator password and authenticator code are required" },
        { status: 400 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: "Administrator password is not initialized" }, { status: 400 });
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json({ error: "Invalid administrator password" }, { status: 401 });
    }

    const profile = await prisma.adminMfaProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile || !profile.totpEnabled || !profile.totpSecret) {
      return NextResponse.json({ error: "MFA is not active on this account" }, { status: 400 });
    }

    const cleanCode = String(code).trim().replace(/\D/g, "");
    const totpCheck = verifyTotpCode(profile.totpSecret, cleanCode);
    if (!totpCheck.isValid) {
      return NextResponse.json({ error: "Invalid authenticator code" }, { status: 401 });
    }

    // Generate 8 new recovery codes
    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);

    await prisma.adminMfaProfile.update({
      where: { userId: user.id },
      data: {
        recoveryCodes: hashedCodes,
      },
    });

    await logAuditEvent({
      actorId: user.id,
      action: "ADMIN_MFA_RECOVERY_CODES_REGENERATED",
      entityType: "USER",
      entityId: user.id,
      metadata: { role: user.role, email: user.email },
    });

    return NextResponse.json({
      success: true,
      recoveryCodes: plainCodes,
      message: "New emergency recovery codes generated. Please store them securely.",
    });
  } catch (error) {
    console.error("[Regenerate Recovery Codes Error]:", error);
    return NextResponse.json({ error: "Failed to regenerate recovery codes" }, { status: 500 });
  }
}
