import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || "";
  const directUrl = process.env.DIRECT_URL || "";

  // Mask database URL for safety: show user, host, port, db name
  const maskedDbUrl = dbUrl
    ? dbUrl.replace(/:([^:@]+)@/, ":***@")
    : "NOT_SET";

  const maskedDirectUrl = directUrl
    ? directUrl.replace(/:([^:@]+)@/, ":***@")
    : "NOT_SET";

  const envDiagnostic = {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasDirectUrl: Boolean(process.env.DIRECT_URL),
    hasJwtSecret: Boolean(process.env.JWT_SECRET),
    maskedDbUrl,
    maskedDirectUrl,
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    const userCount = await prisma.user.count();
    return NextResponse.json({
      status: "ok",
      database: "connected",
      userCount,
      env: envDiagnostic,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        errorName: error?.name || "UnknownError",
        errorMessage: error?.message || String(error),
        errorCode: error?.code || null,
        env: envDiagnostic,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
