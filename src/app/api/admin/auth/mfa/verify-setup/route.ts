import { NextResponse } from "next/server";
import { getCurrentUser, getJwtSecretKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import { verifyTotpCode } from "@/lib/security/totp";
import { logAuditEvent } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { setupToken, code } = body;

    if (!setupToken || !code) {
      return NextResponse.json(
        { error: "Setup token and verification code are required" },
        { status: 400 }
      );
    }

    // Verify setup token
    let payload: any;
    try {
      const verified = await jwtVerify(setupToken, getJwtSecretKey());
      payload = verified.payload;
    } catch {
      return NextResponse.json(
        { error: "MFA setup session has expired or is invalid. Please start setup again." },
        { status: 400 }
      );
    }

    if (payload.userId !== user.id || payload.action !== "MFA_SETUP") {
      return NextResponse.json({ error: "Invalid setup token authorization" }, { status: 403 });
    }

    const { secret, hashedCodes } = payload;
    const cleanCode = String(code).trim().replace(/\D/g, "");

    const verification = verifyTotpCode(secret, cleanCode);
    if (!verification.isValid) {
      return NextResponse.json(
        { error: "Invalid verification code. Please check your authenticator app and try again." },
        { status: 400 }
      );
    }

    // Persist verified AdminMfaProfile in PostgreSQL
    await prisma.adminMfaProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        totpSecret: secret,
        totpEnabled: true,
        recoveryCodes: hashedCodes,
        lastUsedStep: verification.step,
        enrolledAt: new Date(),
      },
      update: {
        totpSecret: secret,
        totpEnabled: true,
        recoveryCodes: hashedCodes,
        lastUsedStep: verification.step,
        enrolledAt: new Date(),
      },
    });

    await logAuditEvent({
      actorId: user.id,
      action: "ADMIN_MFA_ENROLLED",
      entityType: "USER",
      entityId: user.id,
      metadata: { method: "TOTP", role: user.role, email: user.email },
    });

    return NextResponse.json({
      success: true,
      message: "Authenticator App (TOTP) successfully activated for your administrator account.",
    });
  } catch (error) {
    console.error("[MFA Verify Setup Error]:", error);
    return NextResponse.json({ error: "Failed to complete MFA activation" }, { status: 500 });
  }
}
