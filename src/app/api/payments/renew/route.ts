import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { initiateAnnualRenewalPayment } from "@/lib/payments/renewals-engine";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Please log in to renew registration." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { businessId, provider = "MTN_MOMO", phoneNumber } = body;

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "businessId is required." },
        { status: 400 }
      );
    }

    const result = await initiateAnnualRenewalPayment({
      businessId,
      payerUserId: user.id,
      provider,
      phoneNumber: phoneNumber || user.phone,
    });

    // If mobile money provider and not a free waiver, dispatch genuine payment request / push prompt
    let pushResult = null;
    if ((provider === "MTN_MOMO" || provider === "AIRTEL_MONEY") && !result.isFree) {
      if (!phoneNumber || !phoneNumber.trim()) {
        return NextResponse.json(
          { success: false, error: "A valid mobile phone number is required to request Mobile Money payment." },
          { status: 400 }
        );
      }

      const { detectCarrierAndValidate, requestMobileMoneyPayment } = await import("@/lib/payments/push-gateway");
      const carrierCheck = detectCarrierAndValidate(phoneNumber, provider as any);
      if (!carrierCheck.isValid) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid Rwandan phone number: "${phoneNumber}". Enter a valid 10-digit number (e.g. 078... or 072...) or +250 7X XXX XXXX.`,
          },
          { status: 400 }
        );
      }

      // Phone-Level Cooldown: Max 2 prompt requests per 60 seconds per phone number to prevent phone prompt spamming/harassment
      const { checkPaymentRateLimit, getRateLimitHeaders } = await import("@/lib/payments/rate-limiter");
      const phoneRateLimit = await checkPaymentRateLimit({
        key: `initiate:phone:${carrierCheck.normalizedPhone}`,
        limit: 2,
        windowSeconds: 60,
      });

      if (!phoneRateLimit.isAllowed) {
        return NextResponse.json(
          {
            success: false,
            error: "A payment approval prompt was recently dispatched to this phone number. Please check your handset or wait 60 seconds before requesting another prompt.",
          },
          { status: 429, headers: getRateLimitHeaders(phoneRateLimit) }
        );
      }

      const ref = result.paymentReference || (result.payment as any)?.paymentReference;
      const amt = result.renewalFee ?? (result.payment as any)?.feeAmount ?? 5000;
      const curr = result.currency || (result.payment as any)?.currency || "RWF";

      if (!ref) {
        return NextResponse.json(
          { success: false, error: "Failed to resolve renewal payment reference for push prompt." },
          { status: 500 }
        );
      }

      pushResult = await requestMobileMoneyPayment({
        paymentReference: ref,
        amount: amt,
        currency: curr,
        phoneNumber: carrierCheck.normalizedPhone,
        provider: provider as any,
      });

      // If carrier central push is not yet configured, gracefully fallback to the
      // official verified USSD direct dial route so customer can authorize via phone dialer.
      if (!pushResult.success && pushResult.routeInfo) {
        const updatedPayment = await prisma.registrationPayment.update({
          where: { id: (result.payment as any).id },
          data: {
            status: "WAITING_FOR_CUSTOMER_APPROVAL",
            rawCallbackPayload: JSON.stringify({
              routeInfo: pushResult.routeInfo,
              missingRequirements: pushResult.missingRequirements,
              ussdFallback: true,
              dispatchedAt: new Date().toISOString(),
            }),
          },
        });

        return NextResponse.json({
          ...result,
          payment: updatedPayment,
          pushResult,
          promptDispatched: false,
          isPushAvailable: false,
          routeInfo: pushResult.routeInfo,
          message: pushResult.message,
          missingRequirements: pushResult.missingRequirements,
        });
      }

      if (!pushResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: pushResult.message,
            missingRequirements: pushResult.missingRequirements,
            payment: result.payment,
          },
          { status: 400 }
        );
      }

      // Mark payment as waiting for customer approval
      await prisma.registrationPayment.update({
        where: { id: (result.payment as any).id },
        data: { status: "WAITING_FOR_CUSTOMER_APPROVAL" },
      }).catch(() => null);
    }

    return NextResponse.json({
      ...result,
      pushResult,
      promptDispatched: pushResult?.promptDispatched || false,
    });
  } catch (error: any) {
    console.error("[RENEWAL_INITIATE_ERROR]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to initiate annual renewal payment." },
      { status: 400 }
    );
  }
}
