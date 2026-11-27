import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { Role } from "@prisma/client";
import {
  generateTotpSecret,
  generateOtpAuthUri,
  generateQrSvgDataUri,
  generateRecoveryCodes,
} from "@/lib/security/totp";
import { SignJWT } from "jose";
import { getJwtSecretKey } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: authentication required" }, { status: 401 });
    }

    const allowedRoles: Role[] = [Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN, Role.MODERATOR];
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: "Forbidden: administrator clearance required" }, { status: 403 });
    }

    // Generate new TOTP Base32 secret and emergency recovery codes
    const secret = generateTotpSecret(20);
    const otpauthUri = generateOtpAuthUri(secret, user.email || user.name, "55 MOSA");
    const qrCodeUrl = generateQrSvgDataUri(otpauthUri);
    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);

    // Sign a short-lived (10-minute) setup token containing the unconfirmed secret and hashed codes
    const setupToken = await new SignJWT({
      userId: user.id,
      secret,
      hashedCodes,
      action: "MFA_SETUP",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(getJwtSecretKey());

    return NextResponse.json({
      success: true,
      setupToken,
      secret,
      otpauthUri,
      qrCodeUrl,
      recoveryCodes: plainCodes,
    });
  } catch (error) {
    console.error("[MFA Setup Error]:", error);
    return NextResponse.json({ error: "Failed to initiate MFA setup" }, { status: 500 });
  }
}
