import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { calculateEffectiveFee } from "@/lib/payments/promotions-engine";
import { syncAndGetBusinessReminders } from "@/lib/reminders-engine";
import { getPaymentProviders } from "@/lib/payments/engine";

export type ComputedPaymentStatus = "PAID" | "PENDING" | "UNPAID" | "DUE_SOON" | "OVERDUE" | "EXPIRED";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth([Role.BUSINESS_OWNER, Role.SUPER_ADMIN, Role.COMMUNITY_ADMIN]);
    if (auth.error || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedBizId = searchParams.get("businessId");

    // 1. Fetch all businesses owned by this authenticated user (strictly tenant-isolated)
    const userBusinesses = await prisma.business.findMany({
      where: auth.user.role === Role.BUSINESS_OWNER ? { ownerId: auth.user.id } : undefined,
      select: {
        id: true,
        name: true,
        status: true,
        renewalStatus: true,
        category: true,
        categoryDisplay: true,
        phone: true,
        registrationConfirmedAt: true,
        registrationExpiresAt: true,
        gracePeriodEndsAt: true,
      },
      orderBy: { name: "asc" },
    });

    if (userBusinesses.length === 0) {
      return NextResponse.json({
        success: true,
        hasBusiness: false,
        business: null,
        userBusinesses: [],
        message: "No business found for this partner account.",
      });
    }

    // 2. Select the target business (validate ownership)
    let business: any = null;
    if (requestedBizId) {
      const match = userBusinesses.find((b) => b.id === requestedBizId);
      if (!match) {
        if (auth.user.role === Role.BUSINESS_OWNER) {
          return NextResponse.json(
            { success: false, error: "Forbidden: You do not have authorization to view this business's financial data." },
            { status: 403 }
          );
        }
        // Admin viewing
        business = await prisma.business.findUnique({ where: { id: requestedBizId } });
      } else {
        business = match;
      }
    } else {
      business = userBusinesses[0];
    }

    if (!business) {
      return NextResponse.json({ success: false, error: "Business not found." }, { status: 404 });
    }

    // 3. Fetch full payment and receipt records for the target business
    const [payments, receipts, reminders, providers] = await Promise.all([
      prisma.registrationPayment.findMany({
        where: { businessId: business.id },
        orderBy: { createdAt: "desc" },
        include: {
          receipt: true,
          feeConfig: true,
        },
      }),
      prisma.registrationReceipt.findMany({
        where: { businessId: business.id },
        orderBy: { issuedAt: "desc" },
        include: {
          payment: true,
        },
      }),
      syncAndGetBusinessReminders(business.id),
      getPaymentProviders(true),
    ]);

    // 4. Calculate Fee Configurations from Command Center
    const [regFeeResult, renewFeeResult] = await Promise.all([
      calculateEffectiveFee({
        businessId: business.id,
        category: business.category || business.categoryDisplay || undefined,
        feeType: "REGISTRATION",
      }),
      calculateEffectiveFee({
        businessId: business.id,
        category: business.category || business.categoryDisplay || undefined,
        feeType: "ANNUAL_RENEWAL",
      }),
    ]);

    // 5. Evaluate Last Successful Payment & Active Pending Invoice
    const lastSuccessfulPayment = payments.find((p) => p.status === "CONFIRMED") || null;
    const activePendingPayment = payments.find((p) => ["PENDING", "WAITING_FOR_CUSTOMER_APPROVAL"].includes(p.status)) || null;

    // 6. Compute Comprehensive Payment Status & Outstanding Balance
    const now = Date.now();
    const isRegistrationConfirmed = !!business.registrationConfirmedAt || lastSuccessfulPayment !== null;
    let paymentStatus: ComputedPaymentStatus = "UNPAID";
    let outstandingBalance = 0;
    let outstandingType: "REGISTRATION" | "RENEWAL" | "NONE" = "NONE";

    if (!isRegistrationConfirmed || business.status === "PENDING") {
      if (activePendingPayment) {
        paymentStatus = "PENDING";
        outstandingBalance = activePendingPayment.feeAmount;
        outstandingType = "REGISTRATION";
      } else {
        paymentStatus = "UNPAID";
        outstandingBalance = regFeeResult.effectiveFee;
        outstandingType = "REGISTRATION";
      }
    } else if (business.registrationExpiresAt) {
      const expiresAt = new Date(business.registrationExpiresAt).getTime();
      const gracePeriodDays = renewFeeResult.feeConfig.gracePeriodDays || 7;
      const graceEnds = business.gracePeriodEndsAt
        ? new Date(business.gracePeriodEndsAt).getTime()
        : expiresAt + gracePeriodDays * 24 * 60 * 60 * 1000;
      const daysUntilExpiry = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 0) {
        if (now < graceEnds) {
          paymentStatus = "OVERDUE";
          outstandingBalance = renewFeeResult.effectiveFee;
          outstandingType = "RENEWAL";
        } else {
          paymentStatus = "EXPIRED";
          outstandingBalance = renewFeeResult.effectiveFee;
          outstandingType = "RENEWAL";
        }
      } else if (daysUntilExpiry <= 30) {
        paymentStatus = "DUE_SOON";
        outstandingBalance = renewFeeResult.effectiveFee;
        outstandingType = "RENEWAL";
      } else {
        paymentStatus = "PAID";
        outstandingBalance = 0;
        outstandingType = "NONE";
      }

      if (activePendingPayment && activePendingPayment.paymentType === "ANNUAL_RENEWAL") {
        paymentStatus = "PENDING";
        outstandingBalance = activePendingPayment.feeAmount;
        outstandingType = "RENEWAL";
      }
    } else {
      paymentStatus = "PAID";
      outstandingBalance = 0;
      outstandingType = "NONE";
    }

    // Grace Period Status Details
    const graceEndsAtDate = business.gracePeriodEndsAt
      ? new Date(business.gracePeriodEndsAt)
      : business.registrationExpiresAt
      ? new Date(new Date(business.registrationExpiresAt).getTime() + (renewFeeResult.feeConfig.gracePeriodDays || 7) * 24 * 60 * 60 * 1000)
      : null;

    const isGracePeriodActive =
      business.registrationExpiresAt &&
      new Date(business.registrationExpiresAt).getTime() <= now &&
      graceEndsAtDate &&
      now < graceEndsAtDate.getTime();

    const daysRemainingInGrace =
      isGracePeriodActive && graceEndsAtDate
        ? Math.max(0, Math.ceil((graceEndsAtDate.getTime() - now) / (1000 * 60 * 60 * 24)))
        : 0;

    return NextResponse.json({
      success: true,
      hasBusiness: true,
      business: {
        id: business.id,
        name: business.name,
        status: business.status,
        renewalStatus: business.renewalStatus,
        phone: business.phone,
        category: business.category,
        categoryDisplay: business.categoryDisplay,
        registrationConfirmedAt: business.registrationConfirmedAt,
        registrationExpiresAt: business.registrationExpiresAt,
        gracePeriodEndsAt: business.gracePeriodEndsAt,
      },
      userBusinesses,
      paymentStatus,
      outstandingBalance,
      outstandingType,
      currency: regFeeResult.currency || "RWF",
      fees: {
        initialRegistrationFee: {
          effectiveAmount: regFeeResult.effectiveFee,
          baseAmount: regFeeResult.baseFee,
          discount: regFeeResult.discount,
          isFree: regFeeResult.isFree,
          currency: regFeeResult.currency,
          promotion: regFeeResult.promotion,
        },
        annualRenewalFee: {
          effectiveAmount: renewFeeResult.effectiveFee,
          baseAmount: renewFeeResult.baseFee,
          discount: renewFeeResult.discount,
          isFree: renewFeeResult.isFree,
          currency: renewFeeResult.currency,
          promotion: renewFeeResult.promotion,
          gracePeriodDays: renewFeeResult.feeConfig.gracePeriodDays,
          reminderSchedule: renewFeeResult.feeConfig.reminderSchedule,
        },
      },
      lastSuccessfulPayment: lastSuccessfulPayment
        ? {
            id: lastSuccessfulPayment.id,
            paymentReference: lastSuccessfulPayment.paymentReference,
            feeAmount: lastSuccessfulPayment.feeAmount,
            currency: lastSuccessfulPayment.currency,
            provider: lastSuccessfulPayment.provider,
            paymentType: lastSuccessfulPayment.paymentType,
            verifiedAt: lastSuccessfulPayment.verifiedAt || lastSuccessfulPayment.createdAt,
            receiptNumber: lastSuccessfulPayment.receipt?.receiptNumber || null,
            periodCoveredStart: lastSuccessfulPayment.periodCoveredStart,
            periodCoveredEnd: lastSuccessfulPayment.periodCoveredEnd,
          }
        : null,
      registrationExpiryDate: business.registrationExpiresAt,
      nextRenewalDate: business.registrationExpiresAt,
      gracePeriod: {
        isActive: !!isGracePeriodActive,
        graceEndsAt: graceEndsAtDate ? graceEndsAtDate.toISOString() : null,
        daysRemaining: daysRemainingInGrace,
      },
      pendingInvoice: activePendingPayment
        ? {
            id: activePendingPayment.id,
            paymentReference: activePendingPayment.paymentReference,
            feeAmount: activePendingPayment.feeAmount,
            currency: activePendingPayment.currency,
            provider: activePendingPayment.provider,
            paymentType: activePendingPayment.paymentType,
            status: activePendingPayment.status,
            createdAt: activePendingPayment.createdAt,
            phoneNumber: activePendingPayment.phoneNumber,
          }
        : null,
      reminders: reminders.filter((r) => r.isPaymentReminder || r.severity === "URGENT"),
      payments: payments.map((p) => ({
        id: p.id,
        paymentReference: p.paymentReference,
        providerTransactionRef: p.providerTransactionRef,
        feeAmount: p.feeAmount,
        currency: p.currency,
        provider: p.provider,
        paymentType: p.paymentType,
        status: p.status,
        createdAt: p.createdAt,
        verifiedAt: p.verifiedAt,
        receiptNumber: p.receipt?.receiptNumber || null,
        receiptId: p.receipt?.id || null,
        isWaiver: p.isWaiver,
        waiverReason: p.waiverReason,
      })),
      receipts: receipts.map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        amountPaid: r.amountPaid,
        currency: r.currency,
        paymentMethod: r.paymentMethod,
        receiptType: r.receiptType,
        issuedAt: r.issuedAt,
        periodCoveredStart: r.periodCoveredStart,
        periodCoveredEnd: r.periodCoveredEnd,
        paymentReference: r.payment?.paymentReference || null,
        providerTransactionRef: r.providerTransactionRef || r.payment?.providerTransactionRef || null,
      })),
      providers: providers.map((p) => ({
        id: p.id,
        provider: p.provider,
        name: p.name,
        accountNumber: p.accountNumber,
        accountName: p.accountName,
        instructions: p.instructions,
        instructionsRw: p.instructionsRw,
      })),
    });
  } catch (error: any) {
    console.error("[OWNER_PAYMENTS_GET_ERROR]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve payments and registration details." },
      { status: 500 }
    );
  }
}
