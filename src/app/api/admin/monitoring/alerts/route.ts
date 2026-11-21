import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  evaluateOperationalAlerts,
  collectSystemTelemetry,
  acknowledgeAlert,
  investigateAlert,
  resolveAlert,
} from "@/lib/monitoring/alerts-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "COMMUNITY_ADMIN", "MODERATOR"].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Administrator clearance required." },
        { status: 403 }
      );
    }

    const [alerts, telemetry] = await Promise.all([
      evaluateOperationalAlerts(),
      collectSystemTelemetry(),
    ]);

    const activeAlerts = alerts.filter((a) => a.status !== "RESOLVED");
    const resolvedAlerts = alerts.filter((a) => a.status === "RESOLVED").slice(0, 20);

    return NextResponse.json({
      success: true,
      telemetry,
      activeAlerts,
      resolvedAlerts,
      stats: {
        totalActive: activeAlerts.length,
        criticalCount: activeAlerts.filter((a) => a.severity === "CRITICAL").length,
        highCount: activeAlerts.filter((a) => a.severity === "HIGH").length,
        mediumCount: activeAlerts.filter((a) => a.severity === "MEDIUM").length,
        lowCount: activeAlerts.filter((a) => a.severity === "LOW").length,
        acknowledgedCount: activeAlerts.filter((a) => a.status === "ACKNOWLEDGED").length,
      },
    });
  } catch (error: any) {
    console.error("[MONITORING_ALERTS_GET_ERROR]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve operational alerts." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "COMMUNITY_ADMIN"].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Executive administrator privileges required." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { action, alertId, notes } = body;

    if (action === "TRIGGER_EVALUATION") {
      const [alerts, telemetry] = await Promise.all([
        evaluateOperationalAlerts(),
        collectSystemTelemetry(),
      ]);
      return NextResponse.json({
        success: true,
        message: "System health re-evaluation completed successfully.",
        telemetry,
        alerts,
      });
    }

    if (action === "ACKNOWLEDGE") {
      if (!alertId) {
        return NextResponse.json({ success: false, error: "Alert id is required." }, { status: 400 });
      }
      const updated = await acknowledgeAlert(alertId, user.id);
      return NextResponse.json({
        success: true,
        message: `Alert "${updated.title}" acknowledged. Note: Alert remains active until resolution criteria are verified.`,
        alert: updated,
      });
    }

    if (action === "INVESTIGATE") {
      if (!alertId) {
        return NextResponse.json({ success: false, error: "Alert id is required." }, { status: 400 });
      }
      const updated = await investigateAlert(alertId, user.id);
      return NextResponse.json({
        success: true,
        message: `Alert "${updated.title}" marked as undergoing investigation.`,
        alert: updated,
      });
    }

    if (action === "RESOLVE") {
      if (!alertId) {
        return NextResponse.json({ success: false, error: "Alert id is required." }, { status: 400 });
      }
      if (!notes || notes.trim().length < 6) {
        return NextResponse.json(
          { success: false, error: "A valid resolution note (min 6 characters) is required for audit logs." },
          { status: 400 }
        );
      }
      const updated = await resolveAlert(alertId, user.id, notes);
      return NextResponse.json({
        success: true,
        message: `Alert "${updated.title}" successfully resolved and archived.`,
        alert: updated,
      });
    }

    return NextResponse.json({ success: false, error: `Unsupported action: "${action}"` }, { status: 400 });
  } catch (error: any) {
    console.error("[MONITORING_ALERTS_POST_ERROR]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process alert action." },
      { status: 500 }
    );
  }
}
