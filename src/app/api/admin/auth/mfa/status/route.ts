import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: authentication required" }, { status: 401 });
    }

    const profile = await prisma.adminMfaProfile.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      success: true,
      mfa: {
        enrolled: Boolean(profile?.totpEnabled),
        totpEnabled: Boolean(profile?.totpEnabled),
        emailEnabled: Boolean(profile?.emailEnabled),
        recoveryCodesCount: profile?.recoveryCodes ? profile.recoveryCodes.length : 0,
        enrolledAt: profile?.enrolledAt || null,
      },
    });
  } catch (error) {
    console.error("[MFA Status Error]:", error);
    return NextResponse.json({ error: "Failed to retrieve MFA status" }, { status: 500 });
  }
}
