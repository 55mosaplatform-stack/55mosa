import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getSettlementConfig,
  updateSettlementConfig,
  getTreasuryStats,
  getSettlementHistory,
  executeSettlementSweep,
  reconcileSweepWithBridgeSms,
} from "@/lib/payments/paypack-settlement";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "COMMUNITY_ADMIN")) {
      return NextResponse.json({ success: false, error: "Unauthorized access to treasury data." }, { status: 403 });
    }

    const [stats, config, history] = await Promise.all([
      getTreasuryStats(),
      getSettlementConfig(),
      getSettlementHistory(50),
    ]);

    return NextResponse.json({
      success: true,
      stats,
      config,
      history,
    });
  } catch (error: any) {
    console.error("[ADMIN_SETTLEMENT_GET_ERROR]", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to load settlement data." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    // Only SUPER_ADMIN is authorized to configure or trigger manual treasury payouts
    if (currentUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Only SUPER_ADMIN is authorized to modify settlement rules or trigger payouts." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { action } = body;

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

    // 1. Action: Trigger Emergency / Manual Sweep to Airtel 0729974065
    if (action === "TRIGGER_EMERGENCY_SWEEP" || action === "TRIGGER_MANUAL_SWEEP") {
      const amountToSweep = body.amount ? Number(body.amount) : undefined;

      const result = await executeSettlementSweep({
        amountToSweep,
        forceManual: true, // Super Admin authorized override
        adminUser: { id: currentUser.id, name: currentUser.name || "Super Admin" },
        ipAddress,
      });

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.message,
          skippedReason: result.skippedReason,
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: result.message,
        sweepRecord: result.sweepRecord,
      });
    }

    // 2. Action: Update Settlement Configuration
    if (action === "UPDATE_CONFIG") {
      const { threshold, destinationPhone, autoSweepEnabled, scheduleTime, minSweepAmount } = body;

      const updated = await updateSettlementConfig(
        {
          threshold: threshold !== undefined ? Number(threshold) : undefined,
          destinationPhone: destinationPhone ? String(destinationPhone).trim() : undefined,
          autoSweepEnabled: autoSweepEnabled !== undefined ? Boolean(autoSweepEnabled) : undefined,
          scheduleTime: scheduleTime ? String(scheduleTime).trim() : undefined,
          minSweepAmount: minSweepAmount !== undefined ? Number(minSweepAmount) : undefined,
        },
        { id: currentUser.id, name: currentUser.name || "Super Admin" }
      );

      return NextResponse.json({
        success: true,
        message: "Settlement sweep configuration updated successfully.",
        config: updated,
      });
    }

    // 3. Action: Reconcile with Android Bridge SMS
    if (action === "RECONCILE_BRIDGE_SMS") {
      const { smsReference, amount, sender, smsBody } = body;
      if (!amount) {
        return NextResponse.json({ success: false, error: "amount is required for reconciliation." }, { status: 400 });
      }

      const result = await reconcileSweepWithBridgeSms({
        smsReference: smsReference || `SMS-${Date.now()}`,
        amount: Number(amount),
        sender: sender || "AIRTEL_MONEY",
        smsBody: smsBody || `You have received ${amount} RWF from Paypack`,
      });

      return NextResponse.json({
        success: true,
        ...result,
        message: result.reconciled
          ? `Successfully reconciled sweep ${result.matchedSweepRef} with Bridge SMS evidence.`
          : "No matching pending or recent sweep found for this SMS amount.",
      });
    }

    return NextResponse.json({ success: false, error: `Unsupported settlement action "${action}".` }, { status: 400 });
  } catch (error: any) {
    console.error("[ADMIN_SETTLEMENT_POST_ERROR]", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to process settlement action." }, { status: 500 });
  }
}
