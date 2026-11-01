import { prisma } from "@/lib/prisma";
import { getActiveFeeConfig } from "@/lib/payments/engine";

export interface ActiveReminder {
  id: string;
  type: string;
  title: string;
  titleRw: string;
  message: string;
  messageRw: string;
  severity: "INFO" | "WARNING" | "URGENT";
  actionUrl: string | null;
  createdAt: string;
  deadline?: string | null;
  amountDue?: number | null;
  currency?: string | null;
  businessName?: string;
  isPaymentReminder?: boolean;
}

/**
 * Evaluates database conditions and syncs operational and payment reminders for a business
 */
export async function syncAndGetBusinessReminders(businessId: string): Promise<ActiveReminder[]> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      products: true,
      businessHours: true,
      reminders: { where: { isResolved: false }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!business) return [];

  const existingTypes = new Set(business.reminders.map((r) => r.type));
  const feeConfig = await getActiveFeeConfig();
  const feeAmount = feeConfig.amount || 5000;
  const renewalAmount = feeConfig.renewalAmount || feeConfig.amount || 5000;
  const currency = feeConfig.currency || "RWF";
  const gracePeriodDays = feeConfig.gracePeriodDays || 7;

  // =========================================================================
  // 1. Check Initial Registration Payment Status
  // =========================================================================
  const confirmedPayment = await prisma.registrationPayment.findFirst({
    where: {
      businessId,
      status: "CONFIRMED",
    },
  });

  const isRegistrationPaid = !!business.registrationConfirmedAt || !!confirmedPayment;

  if (!isRegistrationPaid && business.status === "PENDING") {
    if (!existingTypes.has("REGISTRATION_FEE_DUE")) {
      await prisma.businessReminder.create({
        data: {
          businessId,
          type: "REGISTRATION_FEE_DUE",
          title: "Outstanding Registration Fee",
          titleRw: "Kwishyura Kwiyandikisha Birategerejwe",
          message: `Initial registration fee of ${feeAmount.toLocaleString()} ${currency} for ${business.name} is outstanding. Complete payment now to activate your storefront on MOSA.`,
          messageRw: `Amafaranga yo kwiyandikisha angana na ${feeAmount.toLocaleString()} ${currency} ya ${business.name} ntarishyurwa. Ishyura ubu kugira ngo ubucuruzi bwawe bugaragare kuri MOSA.`,
          severity: "URGENT",
          actionUrl: "/owner/dashboard?section=payments",
        },
      });
      existingTypes.add("REGISTRATION_FEE_DUE");
    }
  } else if (isRegistrationPaid && existingTypes.has("REGISTRATION_FEE_DUE")) {
    // Automatically resolve outstanding registration reminder if paid
    await prisma.businessReminder.updateMany({
      where: {
        businessId,
        type: "REGISTRATION_FEE_DUE",
        isResolved: false,
      },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });
    existingTypes.delete("REGISTRATION_FEE_DUE");
  }

  // =========================================================================
  // 2. Check Annual Registration Renewal Reminders (30d, 14d, 7d, 0d, Grace, Expired)
  // =========================================================================
  if (business.registrationExpiresAt) {
    const expiresAt = new Date(business.registrationExpiresAt);
    const now = new Date();
    const msUntilExpiry = expiresAt.getTime() - now.getTime();
    const daysUntilExpiry = Math.ceil(msUntilExpiry / (1000 * 60 * 60 * 24));

    const graceEndsAt = business.gracePeriodEndsAt
      ? new Date(business.gracePeriodEndsAt)
      : new Date(expiresAt.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

    const renewalTypes = ["RENEWAL_30D", "RENEWAL_14D", "RENEWAL_7D", "RENEWAL_EXPIRY_DAY", "RENEWAL_GRACE_PERIOD", "REGISTRATION_EXPIRED"];

    if (daysUntilExpiry > 30) {
      // Up to date — resolve any stale renewal reminders
      const hasStale = renewalTypes.some((t) => existingTypes.has(t));
      if (hasStale) {
        await prisma.businessReminder.updateMany({
          where: {
            businessId,
            type: { in: renewalTypes },
            isResolved: false,
          },
          data: {
            isResolved: true,
            resolvedAt: new Date(),
          },
        });
        renewalTypes.forEach((t) => existingTypes.delete(t));
      }
    } else if (daysUntilExpiry > 14 && daysUntilExpiry <= 30) {
      if (!existingTypes.has("RENEWAL_30D")) {
        await prisma.businessReminder.create({
          data: {
            businessId,
            type: "RENEWAL_30D",
            title: "Annual Renewal Due in 30 Days",
            titleRw: "Ivugurura ry'Umwaka mu Minsi 30",
            message: `Annual registration for ${business.name} expires on ${expiresAt.toLocaleDateString()} (${daysUntilExpiry} days remaining). Renewal fee: ${renewalAmount.toLocaleString()} ${currency}.`,
            messageRw: `Kwandikisha ubucuruzi ${business.name} bizarangira ku ya ${expiresAt.toLocaleDateString()} (hasigaye iminsi ${daysUntilExpiry}). Amafaranga yo kuvugurura: ${renewalAmount.toLocaleString()} ${currency}.`,
            severity: "INFO",
            actionUrl: "/owner/dashboard?section=payments",
          },
        });
        existingTypes.add("RENEWAL_30D");
      }
    } else if (daysUntilExpiry > 7 && daysUntilExpiry <= 14) {
      if (!existingTypes.has("RENEWAL_14D")) {
        await prisma.businessReminder.create({
          data: {
            businessId,
            type: "RENEWAL_14D",
            title: "Annual Renewal Due in 14 Days",
            titleRw: "Ivugurura ry'Umwaka mu Minsi 14",
            message: `Annual registration for ${business.name} expires on ${expiresAt.toLocaleDateString()} (${daysUntilExpiry} days remaining). Renewal fee: ${renewalAmount.toLocaleString()} ${currency}.`,
            messageRw: `Kwandikisha ubucuruzi ${business.name} bizarangira ku ya ${expiresAt.toLocaleDateString()} (hasigaye iminsi ${daysUntilExpiry}). Amafaranga yo kuvugurura: ${renewalAmount.toLocaleString()} ${currency}.`,
            severity: "WARNING",
            actionUrl: "/owner/dashboard?section=payments",
          },
        });
        existingTypes.add("RENEWAL_14D");
      }
    } else if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) {
      if (!existingTypes.has("RENEWAL_7D")) {
        await prisma.businessReminder.create({
          data: {
            businessId,
            type: "RENEWAL_7D",
            title: `URGENT: Renewal Due in ${daysUntilExpiry} Day(s)`,
            titleRw: `UBUTUMWA BW'IHUTIRAHO: Ivugurura mu Minsi ${daysUntilExpiry}`,
            message: `Annual registration for ${business.name} expires on ${expiresAt.toLocaleDateString()}. Renew now to avoid listing suspension. Fee: ${renewalAmount.toLocaleString()} ${currency}.`,
            messageRw: `Kwandikisha ubucuruzi ${business.name} bizarangira ku ya ${expiresAt.toLocaleDateString()}. Vugurura ubu kugira ngo ubucuruzi budahagarikwa. Amafaranga: ${renewalAmount.toLocaleString()} ${currency}.`,
            severity: "URGENT",
            actionUrl: "/owner/dashboard?section=payments",
          },
        });
        existingTypes.add("RENEWAL_7D");
      }
    } else if (daysUntilExpiry === 0) {
      if (!existingTypes.has("RENEWAL_EXPIRY_DAY")) {
        await prisma.businessReminder.create({
          data: {
            businessId,
            type: "RENEWAL_EXPIRY_DAY",
            title: "Registration Expires Today",
            titleRw: "Kwandikisha Ubucuruzi Buri Kurangira Uyu Munsi",
            message: `Annual registration for ${business.name} expires today. Complete your renewal of ${renewalAmount.toLocaleString()} ${currency} to keep your listing active.`,
            messageRw: `Kwandikisha ${business.name} birarangira uyu munsi. Ishyura amafaranga yo kuvugurura angana na ${renewalAmount.toLocaleString()} ${currency} kugira ngo ukomeze gukora.`,
            severity: "URGENT",
            actionUrl: "/owner/dashboard?section=payments",
          },
        });
        existingTypes.add("RENEWAL_EXPIRY_DAY");
      }
    } else if (daysUntilExpiry < 0) {
      if (now.getTime() < graceEndsAt.getTime()) {
        const daysLeftGrace = Math.ceil((graceEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (!existingTypes.has("RENEWAL_GRACE_PERIOD")) {
          await prisma.businessReminder.create({
            data: {
              businessId,
              type: "RENEWAL_GRACE_PERIOD",
              title: "Registration Expired — Grace Period Active",
              titleRw: "Igihe Cyararangiye — Igihe cy'Imbabazi Kirakora",
              message: `Registration for ${business.name} expired on ${expiresAt.toLocaleDateString()}. ${daysLeftGrace} day(s) remain in your grace period (ends ${graceEndsAt.toLocaleDateString()}). Renew now to prevent listing suspension.`,
              messageRw: `Kwandikisha ${business.name} byarangiye ku ya ${expiresAt.toLocaleDateString()}. Hasigaye iminsi ${daysLeftGrace} y'imbabazi (irangira ku ya ${graceEndsAt.toLocaleDateString()}). Vugurura ubu kugira ngo ubucuruzi budahagarikwa.`,
              severity: "URGENT",
              actionUrl: "/owner/dashboard?section=payments",
            },
          });
          existingTypes.add("RENEWAL_GRACE_PERIOD");
        }
      } else {
        if (!existingTypes.has("REGISTRATION_EXPIRED")) {
          await prisma.businessReminder.create({
            data: {
              businessId,
              type: "REGISTRATION_EXPIRED",
              title: "Listing Suspended: Registration Overdue",
              titleRw: "Ubucuruzi Bwahagaritswe: Igihe Cyararenze",
              message: `Public visibility for ${business.name} has been paused because annual registration was not renewed. Complete renewal payment of ${renewalAmount.toLocaleString()} ${currency} to instantly reactivate.`,
              messageRw: `Kugaragara kwa ${business.name} byahagaritswe kubera ko mutavuguruye kwiyandikisha. Ishyura amafaranga yo kuvugurura angana na ${renewalAmount.toLocaleString()} ${currency} kugira ngo bihite byongera gukora.`,
              severity: "URGENT",
              actionUrl: "/owner/dashboard?section=payments",
            },
          });
          existingTypes.add("REGISTRATION_EXPIRED");
        }
      }
    }
  }

  // =========================================================================
  // 3. Operational Profile Reminders (Confirmation, Hours, Prices, Demand)
  // =========================================================================

  // Check Confirmation Due
  const interval = business.confirmationIntervalDays || 60;
  const lastTime = business.lastConfirmedAt ? new Date(business.lastConfirmedAt).getTime() : 0;
  const daysSince = lastTime > 0 ? (Date.now() - lastTime) / (1000 * 60 * 60 * 24) : interval + 1;

  if (daysSince >= interval && !existingTypes.has("CONFIRMATION_DUE")) {
    await prisma.businessReminder.create({
      data: {
        businessId,
        type: "CONFIRMATION_DUE",
        title: "Information Confirmation Needed",
        titleRw: "Amakuru y'Ubucuruzi Akeneye Kwemezwa",
        message: `It has been ${Math.round(daysSince)} days since your profile details were confirmed. Confirm everything is still accurate.`,
        messageRw: `Hasize iminsi ${Math.round(daysSince)} mudasubiramo amakuru yanyu. Kanda hano wemeze ko ibintu byose bikiri ukuri.`,
        severity: "URGENT",
        actionUrl: "/owner/dashboard?tab=overview",
      },
    });
  }

  // Check Missing Hours
  if (business.businessHours.length < 5 && !existingTypes.has("HOURS_MISSING")) {
    await prisma.businessReminder.create({
      data: {
        businessId,
        type: "HOURS_MISSING",
        title: "Opening Hours Not Configured",
        titleRw: "Amasaha yo Gukora Ntaramenyekana",
        message: "Your profile has incomplete opening hours. Add your operating days to guide customers.",
        messageRw: "Shyiraho amasaha mufunguriraho kugira ngo abakiriya bamenye igihe babasanga.",
        severity: "WARNING",
        actionUrl: "/owner/dashboard?tab=hours",
      },
    });
  }

  // Check Products Without Price
  const unpriced = business.products.filter((p) => p.price <= 0 && !p.priceMin);
  if (unpriced.length > 0 && !existingTypes.has("PRICES_MISSING")) {
    await prisma.businessReminder.create({
      data: {
        businessId,
        type: "PRICES_MISSING",
        title: `${unpriced.length} Item(s) Without Price`,
        titleRw: `Ibicuruzwa ${unpriced.length} Bitagira Ibiciro`,
        message: "Customers search for verified prices or estimated price ranges. Add pricing to your catalogue.",
        messageRw: "Abakiriya bashaka ibiciro nyabyo cyangwa ibigereranyo. Shyiraho ibiciro ku bicuruzwa byanyu.",
        severity: "WARNING",
        actionUrl: "/owner/dashboard?tab=catalog",
      },
    });
  }

  // Check Local Demand Surge in Sector/Cell
  const demand = await prisma.communityDemand.findFirst({
    where: {
      OR: [
        { cell: business.cell, category: business.category },
        { sector: business.sector, category: business.category },
      ],
      searchCount: { gte: 8 },
    },
    orderBy: { searchCount: "desc" },
  });

  if (demand && !existingTypes.has("DEMAND_SURGE")) {
    await prisma.businessReminder.create({
      data: {
        businessId,
        type: "DEMAND_SURGE",
        title: `Demand Opportunity: ${demand.queryTerm}`,
        titleRw: `Amahirwe y'Isoko: ${demand.queryTermRw || demand.queryTerm}`,
        message: `${demand.searchCount} neighbors in ${demand.cell} searched for "${demand.queryTerm}". Ensure your services are listed and prices up to date.`,
        messageRw: `Abaturage ${demand.searchCount} muri ${demand.cell} bashatse "${demand.queryTermRw || demand.queryTerm}". Reba ko serivisi zawe ziriho kandi ibiciro bikiri bishya.`,
        severity: "INFO",
        actionUrl: "/owner/dashboard?tab=catalog",
      },
    });
  }

  // Re-fetch all unresolved reminders
  const active = await prisma.businessReminder.findMany({
    where: { businessId, isResolved: false },
    orderBy: { createdAt: "desc" },
  });

  const paymentReminderTypes = new Set([
    "REGISTRATION_FEE_DUE",
    "RENEWAL_30D",
    "RENEWAL_14D",
    "RENEWAL_7D",
    "RENEWAL_EXPIRY_DAY",
    "RENEWAL_GRACE_PERIOD",
    "REGISTRATION_EXPIRED",
  ]);

  return active.map((r) => {
    const isPayment = paymentReminderTypes.has(r.type);
    let deadline: string | null = null;
    let amountDue: number | null = null;

    if (r.type === "REGISTRATION_FEE_DUE") {
      amountDue = feeAmount;
    } else if (isPayment) {
      amountDue = renewalAmount;
      if (business.registrationExpiresAt) {
        deadline = new Date(business.registrationExpiresAt).toISOString();
      }
    }

    return {
      id: r.id,
      type: r.type,
      title: r.title,
      titleRw: r.titleRw,
      message: r.message,
      messageRw: r.messageRw,
      severity: r.severity as "INFO" | "WARNING" | "URGENT",
      actionUrl: r.actionUrl,
      createdAt: r.createdAt.toISOString(),
      deadline,
      amountDue,
      currency,
      businessName: business.name,
      isPaymentReminder: isPayment,
    };
  });
}
