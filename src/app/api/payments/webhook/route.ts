import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyWebhookSignature,
  confirmPaymentAndActivateBusiness,
  getPaymentProviders,
} from "@/lib/payments/engine";
import { parseMtnMoMoSms } from "@/lib/payments/momo-sms";
import { parseAirtelMoneySms } from "@/lib/payments/airtel-sms";
import { authenticateWebhookRequest } from "@/lib/payments/bridge-devices";
import {
  getPaypackConfig,
  initiatePaypackCashout,
  verifyPaypackWebhookSignature,
} from "@/lib/payments/paypack-adapter";

export const ALLOWED_WEBHOOK_PROVIDERS = [
  "MTN_MOMO",
  "AIRTEL_MONEY",
  "BANK_TRANSFER",
  "PAYPACK",
] as const;

export type AllowedWebhookProvider = (typeof ALLOWED_WEBHOOK_PROVIDERS)[number];

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-paypack-signature") ||
      req.headers.get("x-signature") ||
      req.headers.get("x-provider-signature") ||
      req.headers.get("x-callback-signature") ||
      "";

    const url = new URL(req.url);
    const providerParam = url.searchParams.get("provider")?.toUpperCase() || "";

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    // 0. Handle Paypack Cashout (Disbursement to MOSA Airtel receiving SIM 0729974065)
    if (payload.data?.kind === "CASHOUT") {
      const cashoutRef = payload.data.ref || payload.data.transaction_id || "CASHOUT-EVENT";
      const cashoutStatus = payload.data.status || "successful";
      const cashoutAmount = Number(payload.data.amount || 0);
      const cashoutFee = payload.data.fee !== undefined ? Number(payload.data.fee) : undefined;
      const cashoutPhone = payload.data.client || payload.data.number || payload.data.phone || "0729974065";
      const processedAt = payload.data.processed_at || payload.data.created_at || new Date().toISOString();

      const { confirmSweepFromProviderWebhook } = await import("@/lib/payments/paypack-settlement");
      const sweepConfirm = await confirmSweepFromProviderWebhook({
        payoutRef: cashoutRef,
        status: cashoutStatus,
        amount: cashoutAmount,
        fee: cashoutFee,
        destinationPhone: cashoutPhone,
        processedAt,
      });

      await prisma.auditLog.create({
        data: {
          action: "PAYPACK_CASHOUT_TO_AIRTEL_RECEIVED",
          entityType: "RegistrationPayment",
          entityId: cashoutRef,
          metadata: JSON.stringify({
            amount: cashoutAmount,
            destinationPhone: cashoutPhone,
            status: cashoutStatus,
            fee: cashoutFee,
            sweepMatched: sweepConfirm.matched,
            sweepStatus: sweepConfirm.status,
            processedAt,
          }),
        },
      }).catch(() => null);

      return NextResponse.json({
        success: true,
        message: `Paypack cashout of ${cashoutAmount} RWF to Airtel wallet ${cashoutPhone} processed (Status: ${cashoutStatus}).`,
        ref: cashoutRef,
        status: cashoutStatus,
        sweepMatched: sweepConfirm.matched,
        sweepStatus: sweepConfirm.status,
      });
    }

    // 1. Strict Provider Allowlist Validation
    // Auto-detect provider if Paypack payload or header is present
    let rawProvider = (providerParam || payload.provider || "").trim().toUpperCase();
    if (!rawProvider && payload.data?.provider) {
      rawProvider = payload.data.provider.toLowerCase() === "airtel" ? "AIRTEL_MONEY" : "MTN_MOMO";
    }
    if (!rawProvider && req.headers.get("x-paypack-signature")) {
      rawProvider = "PAYPACK";
    }

    if (!rawProvider || !ALLOWED_WEBHOOK_PROVIDERS.includes(rawProvider as AllowedWebhookProvider)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported, missing, or unclassified payment provider: "${rawProvider || "EMPTY"}". Inbound payments labeled UNKNOWN are rejected for manual reconciliation.`,
        },
        { status: 400 }
      );
    }

    const provider = rawProvider as AllowedWebhookProvider;

    // 2. Provider-Aware Evidence Extraction from Raw SMS (if provided by bridge forwarder)
    let parsedSms: any = null;
    const rawSmsText = payload.rawSms || payload.sms || payload.body;
    if (rawSmsText && typeof rawSmsText === "string") {
      if (provider === "AIRTEL_MONEY") {
        parsedSms = parseAirtelMoneySms(rawSmsText);
      } else if (provider === "MTN_MOMO") {
        parsedSms = parseMtnMoMoSms(rawSmsText);
      }
    }

    // Replay protection window check for request timestamp
    const headerTimestamp = req.headers.get("x-mosa-timestamp") || req.headers.get("x-timestamp");
    if (headerTimestamp) {
      const reqTime = new Date(headerTimestamp).getTime();
      if (isNaN(reqTime) || Math.abs(Date.now() - reqTime) > 15 * 60 * 1000) {
        return NextResponse.json(
          {
            success: false,
            error: "Request timestamp is expired or outside the valid 15-minute replay window.",
          },
          { status: 400 }
        );
      }
    }

    const txRef =
      payload.providerTransactionRef ||
      payload.transactionId ||
      payload.transId ||
      payload.data?.ref ||
      parsedSms?.providerTransactionRef;

    let paymentReference =
      payload.paymentReference ||
      payload.reference ||
      payload.externalReference ||
      parsedSms?.paymentReference;

    // If Paypack webhook without paymentReference, lookup by providerTransactionRef
    if (!paymentReference && txRef) {
      const match = await prisma.registrationPayment.findFirst({
        where: {
          OR: [
            { providerTransactionRef: String(txRef) },
            { paymentReference: String(txRef) },
          ],
        },
        select: { paymentReference: true },
      });
      if (match) {
        paymentReference = match.paymentReference;
      }
    }

    const providerTransactionRef = txRef;

    const amountPaid =
      payload.amount !== undefined && payload.amount !== null
        ? Number(payload.amount)
        : payload.data?.amount !== undefined
        ? Number(payload.data.amount)
        : parsedSms?.amount;

    if (!paymentReference || !providerTransactionRef) {
      await prisma.auditLog.create({
        data: {
          action: "PAYMENT_UNMATCHED_REFERENCE",
          entityType: "RegistrationPayment",
          entityId: paymentReference || "MISSING_REF",
          metadata: JSON.stringify({
            provider,
            providerTransactionRef,
            amountPaid,
            rawSms: rawSmsText,
          }),
        },
      }).catch(() => null);

      return NextResponse.json(
        {
          success: false,
          error: "Webhook payload missing required paymentReference or providerTransactionRef. Transaction left pending for manual administrative reconciliation.",
          parsedSms: parsedSms || undefined,
        },
        { status: 400 }
      );
    }

    // 3. Currency Validation
    const currency = (payload.currency || parsedSms?.currency || "RWF").trim().toUpperCase();
    if (currency !== "RWF") {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported payment currency: "${currency}". Only RWF payments are accepted for settlement.`,
        },
        { status: 400 }
      );
    }

    // 4. Look up provider config to ensure provider is enabled
    const lookupProvider = provider === "PAYPACK" ? "AIRTEL_MONEY" : provider;
    let providerConfig = await prisma.paymentProviderConfig.findUnique({
      where: { provider: lookupProvider },
    });

    if (!providerConfig) {
      await getPaymentProviders(false);
      providerConfig = await prisma.paymentProviderConfig.findUnique({
        where: { provider: lookupProvider },
      });
    }

    if (!providerConfig || !providerConfig.isEnabled) {
      return NextResponse.json(
        { success: false, error: `Provider ${provider} is not configured or disabled.` },
        { status: 403 }
      );
    }

    // 5. Dual-mode authentication: Enrolled Android Bridge Device credentials OR Provider Webhook Secret
    const deviceIdHeader = req.headers.get("x-mosa-device-id") || payload.bridgeDeviceId;
    const authHeader = req.headers.get("authorization");

    let isPaypackAuthenticated = false;
    if (req.headers.get("x-paypack-signature") || provider === "PAYPACK") {
      isPaypackAuthenticated = verifyPaypackWebhookSignature(
        rawBody,
        req.headers.get("x-paypack-signature") || signature
      );
    }

    const authResult = isPaypackAuthenticated
      ? { isAuthenticated: true, authMethod: "PROVIDER_SECRET" as const }
      : await authenticateWebhookRequest({
          rawBody,
          signature,
          deviceIdHeader,
          authHeader,
          provider: lookupProvider,
        });

    if (!authResult.isAuthenticated) {
      console.warn(
        `[SECURITY WARNING]: Rejected unverified webhook for ${paymentReference} from ${provider}: ${authResult.error || "Invalid signature"}`
      );
      return NextResponse.json(
        { success: false, error: authResult.error || "Invalid cryptographic webhook signature." },
        { status: 401 }
      );
    }

    // 5b. Destination / Recipient Validation: Ensure payment destination matches MOSA's configured SIM or till
    const suppliedDestination =
      payload.recipient ||
      payload.destination ||
      payload.accountNumber ||
      payload.merchantNumber ||
      payload.tillNumber;

    if (suppliedDestination && typeof suppliedDestination === "string") {
      const cleanSupplied = suppliedDestination.replace(/[\s\-\+\(\)]/g, "").replace(/^250/, "0");
      const allProviders = await prisma.paymentProviderConfig.findMany({ select: { accountNumber: true } });
      const validDestinations = [
        providerConfig.accountNumber,
        ...allProviders.map((p) => p.accountNumber),
        authResult.device?.simPhoneNumber,
        "0729974065", // Primary Airtel Money Receiving SIM
        "999888",     // MTN MoMo Merchant Code
        "0788123456", // MTN MoMo Account
      ]
        .filter(Boolean)
        .map((d) => String(d).replace(/[\s\-\+\(\)]/g, "").replace(/^250/, "0"));

      const isMatch = validDestinations.some(
        (v) => v === cleanSupplied || cleanSupplied.includes(v) || v.includes(cleanSupplied)
      );

      if (!isMatch) {
        await prisma.auditLog.create({
          data: {
            action: "PAYMENT_WRONG_RECIPIENT_REJECTED",
            entityType: "RegistrationPayment",
            entityId: paymentReference || "UNKNOWN",
            metadata: JSON.stringify({
              provider,
              suppliedDestination,
              providerTransactionRef,
              amountPaid,
              expectedDestinations: validDestinations,
            }),
          },
        }).catch(() => null);

        return NextResponse.json(
          {
            success: false,
            error: `Payment destination "${suppliedDestination}" does not match configured merchant recipient for ${provider}.`,
          },
          { status: 400 }
        );
      }
    }

    // 5c. Provider Status Validation: If provider reported FAILED or CANCELLED, do not confirm
    const reportedStatus = (payload.data?.status || payload.status || "").toLowerCase();
    if (reportedStatus === "failed" || reportedStatus === "cancelled") {
      if (paymentReference) {
        await prisma.registrationPayment.updateMany({
          where: { paymentReference, status: { in: ["PENDING", "WAITING_FOR_CUSTOMER_APPROVAL"] } },
          data: {
            status: reportedStatus === "cancelled" ? "CANCELLED" : "FAILED",
            failureReason: `Transaction marked ${reportedStatus} by payment provider.`,
            rawCallbackPayload: rawBody,
          },
        }).catch(() => null);

        await prisma.auditLog.create({
          data: {
            action: "PAYMENT_PROVIDER_REPORTED_FAILURE",
            entityType: "RegistrationPayment",
            entityId: paymentReference,
            metadata: JSON.stringify({
              provider,
              txRef,
              status: reportedStatus,
              amountPaid,
            }),
          },
        }).catch(() => null);
      }

      return NextResponse.json(
        {
          success: false,
          status: reportedStatus,
          message: `Payment provider reported transaction as ${reportedStatus}.`,
        },
        { status: 200 }
      );
    }

    // 5d. Android Payment Bridge Handling (Strict Enforcement of MOSA-Only Treasury Verification)
    if (authResult.authMethod === "DEVICE_CREDENTIAL") {
      // 1. Destination Verification: Must match MOSA's official Airtel SIM 0729974065
      const cleanDest = (suppliedDestination || authResult.device?.simPhoneNumber || "0729974065")
        .replace(/[\s\-\+\(\)]/g, "")
        .replace(/^250/, "0");

      if (cleanDest !== "0729974065" && cleanDest !== (authResult.device?.simPhoneNumber || "").replace(/^250/, "0")) {
        // Discard unrelated personal SMS to other phone numbers without storing or logging it
        return NextResponse.json(
          {
            success: false,
            ignored: true,
            error: "Personal or unrelated transaction: Destination does not match MOSA receiving wallet 0729974065.",
          },
          { status: 200 }
        );
      }

      // 2. Check if sender is official Airtel Money notification
      const senderHeader = req.headers.get("x-sms-sender") || payload.sender || "";
      const isAirtelOfficial =
        !senderHeader ||
        senderHeader.toUpperCase().includes("AIRTEL") ||
        senderHeader.includes("182");

      if (senderHeader && !isAirtelOfficial) {
        // Discard unrelated personal SMS
        return NextResponse.json(
          {
            success: false,
            ignored: true,
            error: "Untrusted or personal SMS sender ignored by Android Bridge.",
          },
          { status: 200 }
        );
      }

      // 3. Reconcile with pending/confirmed treasury settlement sweeps
      const { reconcileSweepWithBridgeSms } = await import("@/lib/payments/paypack-settlement");
      const sweepReconciliation = await reconcileSweepWithBridgeSms({
        smsReference: String(providerTransactionRef || txRef),
        amount: Number(amountPaid || 0),
        sender: senderHeader || "AIRTEL_MONEY",
        smsBody: rawSmsText || "",
      });

      if (sweepReconciliation.reconciled) {
        return NextResponse.json({
          success: true,
          message: `Bridge SMS successfully reconciled MOSA treasury payout ${sweepReconciliation.matchedSweepRef} in Airtel wallet 0729974065.`,
          matchedSweepRef: sweepReconciliation.matchedSweepRef,
          status: sweepReconciliation.status,
          isSettlementReconciliation: true,
        });
      }

      // 4. Android Bridge supporting evidence:
      // An Android Bridge notification alone without matching payment reference or recipient cannot confirm customer payment
      if (!paymentReference && !txRef) {
        return NextResponse.json(
          {
            success: false,
            status: "REQUIRES_REVIEW",
            error: "Notification does not match any active MOSA payout or registration payment. Marked for review.",
          },
          { status: 400 }
        );
      }
    }

    const verifiedBy = authResult.device
      ? `ANDROID_BRIDGE_${authResult.device.deviceId}`
      : payload.bridgeDeviceId
      ? `ANDROID_BRIDGE_${payload.bridgeDeviceId}`
      : `WEBHOOK_${provider}`;

    // 6. Process idempotent confirmation, activation, and receipt generation
    // Actual settled provider is strictly persisted across payment, receipt, and audit log
    const result = await confirmPaymentAndActivateBusiness({
      paymentReference,
      providerTransactionRef: String(providerTransactionRef),
      provider,
      amountPaid,
      currency,
      rawPayload: rawBody,
      verifiedBy,
    });

    // 7. Strategy 2: Controlled Settlement Sweeps to Airtel Money SIM 0729974065
    // Asynchronously checks accumulated cleared balance against configured threshold (50,000 RWF)
    // and sweeps when eligible without delaying or blocking customer confirmation.
    if (result.success && !result.alreadyConfirmed) {
      import("@/lib/payments/paypack-settlement")
        .then(({ executeSettlementSweep }) => {
          return executeSettlementSweep({ forceManual: false });
        })
        .catch((err) => {
          console.warn(`[PAYPACK_SETTLEMENT_SWEEP_WARN]: ${err.message}`);
        });
    }

    return NextResponse.json({
      success: true,
      message: result.alreadyConfirmed
        ? "Payment already processed and business active."
        : "Payment confirmed, receipt generated, and business activated.",
      receiptNumber: result.receipt?.receiptNumber,
      businessStatus: result.businessStatus,
    });
  } catch (error: any) {
    console.error("[PAYMENTS_WEBHOOK_ERROR]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process webhook." },
      { status: 400 }
    );
  }
}
