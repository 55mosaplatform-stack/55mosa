import { NextRequest, NextResponse } from "next/server";
import { completeDevicePairing } from "@/lib/payments/bridge-devices";
import {
  checkPaymentRateLimit,
  getRateLimitClientIp,
  getRateLimitHeaders,
} from "@/lib/payments/rate-limiter";

/**
 * Public terminal pairing endpoint called by the newly installed Android Bridge app.
 * Accepts one-time pairingCode, activates the device, wipes the one-time code,
 * and securely returns the device's credentials (deviceToken & hmacSecret).
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp = getRateLimitClientIp(req);

    // Rate Limiting: Max 5 pairing attempts per 5 minutes per IP to prevent brute-force attacks
    const ipRateLimit = await checkPaymentRateLimit({
      key: `bridge:pair:${clientIp}`,
      limit: 5,
      windowSeconds: 300,
    });

    if (!ipRateLimit.isAllowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many pairing attempts from this IP address. Please wait before retrying.",
        },
        { status: 429, headers: getRateLimitHeaders(ipRateLimit) }
      );
    }

    const body = await req.json();
    const { pairingCode, deviceHardwareId, appVersion } = body;

    if (!pairingCode) {
      return NextResponse.json(
        { success: false, error: "One-time pairingCode is required." },
        { status: 400 }
      );
    }

    const result = await completeDevicePairing({
      pairingCode,
      deviceHardwareId,
      appVersion,
    });

    return NextResponse.json({
      success: true,
      message: "Device successfully paired and activated as an authorized MOSA payment terminal.",
      device: {
        deviceId: result.deviceId,
        deviceToken: result.deviceToken,
        hmacSecret: result.hmacSecret,
        name: result.name,
        carrier: result.carrier,
        simPhoneNumber: result.simPhoneNumber,
        enrolledAt: result.enrolledAt,
        serverUrl: result.serverUrl,
        approvedDomains: result.approvedDomains,
      },
    });
  } catch (error: any) {
    console.error("[BRIDGE_PAIR_ERROR]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to pair device." },
      { status: 400 }
    );
  }
}
