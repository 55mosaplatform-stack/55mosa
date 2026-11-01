import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { executeSettlementSweep, getSettlementConfig } from "@/lib/payments/paypack-settlement";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  return handleCronSettlementSweep(req);
}

export async function POST(req: NextRequest) {
  return handleCronSettlementSweep(req);
}

/**
 * Production Vercel Cron Endpoint for Automated Daily Settlement Sweeps.
 * Scheduled at 21:59 UTC (23:59 CAT) daily via vercel.json.
 */
async function handleCronSettlementSweep(req: NextRequest) {
  const startTime = Date.now();
  const utcNow = new Date();
  const catNow = new Date(utcNow.getTime() + 2 * 60 * 60 * 1000); // UTC+2 CAT

  try {
    // 1. Authorize: Vercel Cron Secret OR Super Admin Session
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || process.env.PAYMENT_WEBHOOK_SECRET;
    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

    const currentUser = await getCurrentUser(req);
    const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

    if (!isCronAuthorized && !isSuperAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Valid Vercel Cron Bearer token or SUPER_ADMIN session required.",
        },
        { status: 403 }
      );
    }

    const config = await getSettlementConfig();

    // 2. Execute scheduled sweep with automatic schedule guards & distributed locking
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "cron-worker";
    const result = await executeSettlementSweep({
      forceManual: false,
      triggerType: "AUTOMATIC_SCHEDULED",
      adminUser: currentUser ? { id: currentUser.id, name: currentUser.name || "Cron Runner" } : undefined,
      ipAddress,
    });

    const executionDurationMs = Date.now() - startTime;

    // 3. Log execution audit
    await prisma.auditLog.create({
      data: {
        action: result.success ? "CRON_SETTLEMENT_SWEEP_SUCCESS" : "CRON_SETTLEMENT_SWEEP_SKIPPED",
        entityType: "SETTLEMENT_CRON",
        entityId: result.sweepRecord?.sweepReference || `CRON-${utcNow.toISOString().slice(0, 10)}`,
        metadata: JSON.stringify({
          scheduledTimeUtc: "21:59 UTC",
          scheduledTimeCat: "23:59 CAT",
          executedAtUtc: utcNow.toISOString(),
          executedAtCat: catNow.toISOString(),
          durationMs: executionDurationMs,
          success: result.success,
          message: result.message,
          skippedReason: result.skippedReason,
          sweepRecord: result.sweepRecord,
        }),
        ipAddress,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      cronExecution: {
        scheduledUtc: "21:59 UTC",
        scheduledCat: "23:59 CAT",
        executedAtUtc: utcNow.toISOString(),
        executedAtCat: catNow.toISOString(),
        durationMs: executionDurationMs,
        result,
      },
    });
  } catch (error: any) {
    console.error("[CRON_SETTLEMENT_SWEEP_EXCEPTION]:", error);

    // Record high-severity alert in AuditLog for administrative review
    await prisma.auditLog.create({
      data: {
        action: "CRON_SETTLEMENT_SWEEP_ALERT",
        entityType: "SETTLEMENT_CRON",
        entityId: `ALERT-${Date.now()}`,
        metadata: JSON.stringify({
          severity: "HIGH",
          error: error.message || "Unknown error during scheduled settlement sweep",
          timestampUtc: utcNow.toISOString(),
          timestampCat: catNow.toISOString(),
        }),
      },
    }).catch(() => null);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to execute scheduled settlement sweep.",
        executedAtUtc: utcNow.toISOString(),
        executedAtCat: catNow.toISOString(),
      },
      { status: 500 }
    );
  }
}
