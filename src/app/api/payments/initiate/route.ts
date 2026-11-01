import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { initiateRegistrationPayment } from "@/lib/payments/engine";
import {
  checkPaymentRateLimit,
  getRateLimitClientIp,
  getRateLimitHeaders,
} from "@/lib/payments/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    const clientIp = getRateLimitClientIp(req);

    // 1. IP-Level Rate Limit: Max 10 initiate requests per 60 seconds
    const ipRateLimit = await checkPaymentRateLimit({
      key: `initiate:ip:${clientIp}`,
      limit: 10,
      windowSeconds: 60,
    });

    if (!ipRateLimit.isAllowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many payment requests from this IP. Please wait a moment before trying again.",
        },
        { status: 429, headers: getRateLimitHeaders(ipRateLimit) }
      );
    }

    const body = await req.json();
    const { businessId, provider, phoneNumber } = body;

    if (!businessId || !provider) {
      return NextResponse.json(
        { success: false, error: "businessId and provider are required." },
        { status: 400 }
      );
    }

    // 2. Business-Level Rate Limit: Max 5 initiate requests per 120 seconds
    const bizRateLimit = await checkPaymentRateLimit({
      key: `initiate:biz:${businessId}`,
      limit: 5,
      windowSeconds: 120,
    });

    if (!bizRateLimit.isAllowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment was recently initiated for this business. Please check status or wait before retrying.",
        },
        { status: 429, headers: getRateLimitHeaders(bizRateLimit) }
      );
    }

    if (!["MTN_MOMO", "AIRTEL_MONEY", "BANK_TRANSFER"].includes(provider)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid payment provider specified. Permitted channels: MTN_MOMO, AIRTEL_MONEY, BANK_TRANSFER.",
        },
        { status: 400 }
      );
    }

    // Determine target business and owner
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, ownerId: true, name: true, status: true },
    });

    if (!business) {
      return NextResponse.json(
        { success: false, error: `Business with ID "${businessId}" not found.` },
        { status: 404 }
      );
    }

    // Determine payer user and enforce authorization
    let payerUserId: string | null = null;
    const currentUser = await getCurrentUser(req);

    if (currentUser) {
      const isSuperAdmin = currentUser.role === "SUPER_ADMIN";
      const isCommunityAdmin = currentUser.role === "COMMUNITY_ADMIN";
      const isOwner = business.ownerId === currentUser.id;

      if (!isSuperAdmin && !isCommunityAdmin && !isOwner) {
        return NextResponse.json(
          { success: false, error: "You are not authorized to initiate payments for this business." },
          { status: 403 }
        );
      }
      payerUserId = currentUser.id;
    } else {
      // For unauthenticated flows (e.g. self-registration checkout), the business MUST be in PENDING status
      if (business.status !== "PENDING") {
        return NextResponse.json(
          { success: false, error: "Authentication required to initiate payments for this business." },
          { status: 401 }
        );
      }
      payerUserId = business.ownerId;
    }

    if (!payerUserId) {
      return NextResponse.json(
        { success: false, error: "Unable to identify payer user for this business." },
        { status: 400 }
      );
    }

    const result = await initiateRegistrationPayment({
      businessId,
      payerUserId,
      provider: provider as any,
      phoneNumber,
    });

    // If mobile money provider and not a free waiver, dispatch genuine payment request / push prompt
    let pushResult = null;
    if ((provider === "MTN_MOMO" || provider === "AIRTEL_MONEY") && !result.isFree && !result.isAlreadyPaid) {
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

      // 3. Phone-Level Rate Limit & Cooldown: Max 2 prompt requests per 60 seconds per phone number
      // to strictly prevent payment-prompt abuse / harassment against other people's phones
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

      const ref = result.paymentReference || result.payment?.paymentReference;
      const amt = result.feeAmount ?? result.payment?.feeAmount ?? 5000;
      const curr = result.currency || result.payment?.currency || "RWF";

      if (!ref) {
        return NextResponse.json(
          { success: false, error: "Failed to resolve payment reference for push prompt." },
          { status: 500 }
        );
      }

      pushResult = await requestMobileMoneyPayment({
        paymentReference: ref,
        amount: amt,
        currency: curr,
        phoneNumber: carrierCheck.normalizedPhone,
        provider: provider as any,
        businessName: business.name,
      });

      // If carrier central push is not yet configured, gracefully fallback to the
      // official verified USSD direct dial route so customer can authorize via phone dialer.
      if (!pushResult.success && pushResult.routeInfo) {
        const updatedPayment = await prisma.registrationPayment.update({
          where: { id: result.payment.id },
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

        return NextResponse.json(
          {
            success: true,
            ...result,
            payment: updatedPayment,
            pushResult,
            promptDispatched: false,
            isPushAvailable: false,
            routeInfo: pushResult.routeInfo,
            message: pushResult.message,
            missingRequirements: pushResult.missingRequirements,
          },
          { headers: getRateLimitHeaders(ipRateLimit) }
        );
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
        where: { id: result.payment.id },
        data: { status: "WAITING_FOR_CUSTOMER_APPROVAL" },
      }).catch(() => null);
    }

    return NextResponse.json(
      {
        success: true,
        ...result,
        pushResult,
        promptDispatched: pushResult?.promptDispatched || false,
      },
      { headers: getRateLimitHeaders(ipRateLimit) }
    );
  } catch (error: any) {
    console.error("[PAYMENTS_INITIATE_ERROR]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to initiate payment." },
      { status: 500 }
    );
  }
}
