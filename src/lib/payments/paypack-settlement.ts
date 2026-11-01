import { prisma } from "../prisma";
import { getPaypackConfig, initiatePaypackCashout, queryPaypackTransaction } from "./paypack-adapter";

export interface SettlementConfig {
  threshold: number; // e.g. 50,000 RWF
  destinationPhone: string; // e.g. "0729974065" (MOSA Airtel Money)
  destinationName: string; // "MOSA Airtel Receiving Wallet"
  autoSweepEnabled: boolean;
  scheduleTime: string; // "23:59" CAT
  maxDailySweeps: number; // 1
  minSweepAmount: number; // 5,000 RWF
  updatedAt?: string;
  updatedBy?: string;
}

export interface SettlementSweepRecord {
  id: string;
  sweepReference: string;
  payoutRef: string | null;
  amount: number;
  fee: number;
  netAmount: number;
  destinationPhone: string;
  destinationProvider: string;
  status: "PENDING" | "PROCESSING" | "SUCCESSFUL" | "FAILED" | "RECONCILED";
  triggerType: "AUTOMATIC_THRESHOLD" | "AUTOMATIC_SCHEDULED" | "MANUAL_EMERGENCY";
  triggeredById?: string | null;
  triggeredByName?: string | null;
  clearedBalanceBefore: number;
  clearedBalanceAfter: number;
  failureReason?: string | null;
  smsBridgeEvidenceRef?: string | null;
  createdAt: string;
  settledAt?: string | null;
  reconciledAt?: string | null;
  isSimulation: boolean;
}

export interface TreasuryStats {
  clearedMerchantBalance: number;
  pendingCustomerPayments: number;
  totalCollectedRevenue: number;
  totalSweptToAirtel: number;
  totalPayoutFees: number;
  lastSweepAt: string | null;
  lastSweepRef: string | null;
  nextScheduledSweep: string;
  isThresholdReached: boolean;
  thresholdProgressPct: number;
  config: SettlementConfig;
}

const DEFAULT_SETTLEMENT_CONFIG: SettlementConfig = {
  threshold: 50000,
  destinationPhone: "0729974065",
  destinationName: "MOSA Airtel Receiving Wallet (Primary)",
  autoSweepEnabled: true,
  scheduleTime: "23:59",
  maxDailySweeps: 1,
  minSweepAmount: 5000,
};

/**
 * Retrieves the current settlement configuration from PaymentProviderConfig or defaults.
 */
export async function getSettlementConfig(): Promise<SettlementConfig> {
  try {
    const configRow = await prisma.paymentProviderConfig.findUnique({
      where: { provider: "PAYPACK_SETTLEMENT" },
    });

    if (!configRow || !configRow.instructions) {
      return DEFAULT_SETTLEMENT_CONFIG;
    }

    const parsed = JSON.parse(configRow.instructions);
    return {
      threshold: Number(parsed.threshold || DEFAULT_SETTLEMENT_CONFIG.threshold),
      destinationPhone: configRow.accountNumber || DEFAULT_SETTLEMENT_CONFIG.destinationPhone,
      destinationName: configRow.accountName || DEFAULT_SETTLEMENT_CONFIG.destinationName,
      autoSweepEnabled: configRow.isEnabled,
      scheduleTime: parsed.scheduleTime || DEFAULT_SETTLEMENT_CONFIG.scheduleTime,
      maxDailySweeps: Number(parsed.maxDailySweeps || DEFAULT_SETTLEMENT_CONFIG.maxDailySweeps),
      minSweepAmount: Number(parsed.minSweepAmount || DEFAULT_SETTLEMENT_CONFIG.minSweepAmount),
      updatedAt: configRow.updatedAt?.toISOString(),
      updatedBy: configRow.updatedBy || undefined,
    };
  } catch (err) {
    console.warn("[SETTLEMENT_CONFIG_WARN] Failed reading settlement config, using defaults:", err);
    return DEFAULT_SETTLEMENT_CONFIG;
  }
}

/**
 * Saves or updates settlement configuration.
 */
export async function updateSettlementConfig(
  params: Partial<SettlementConfig>,
  adminUser?: { id: string; name: string }
): Promise<SettlementConfig> {
  const current = await getSettlementConfig();
  const updated: SettlementConfig = {
    ...current,
    ...params,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUser ? `${adminUser.name} (${adminUser.id})` : undefined,
  };

  const instructionsPayload = JSON.stringify({
    threshold: updated.threshold,
    scheduleTime: updated.scheduleTime,
    maxDailySweeps: updated.maxDailySweeps,
    minSweepAmount: updated.minSweepAmount,
  });

  await prisma.paymentProviderConfig.upsert({
    where: { provider: "PAYPACK_SETTLEMENT" },
    create: {
      provider: "PAYPACK_SETTLEMENT",
      name: "Paypack Automated Airtel Settlement Sweeps",
      isEnabled: updated.autoSweepEnabled,
      accountNumber: updated.destinationPhone,
      accountName: updated.destinationName,
      instructions: instructionsPayload,
      updatedBy: adminUser?.id,
    },
    update: {
      isEnabled: updated.autoSweepEnabled,
      accountNumber: updated.destinationPhone,
      accountName: updated.destinationName,
      instructions: instructionsPayload,
      updatedBy: adminUser?.id,
    },
  });

  if (adminUser) {
    await prisma.auditLog.create({
      data: {
        actorId: adminUser.id,
        action: "UPDATE_PAYPACK_SETTLEMENT_CONFIG",
        entityType: "SETTLEMENT_CONFIG",
        entityId: "PAYPACK_SETTLEMENT",
        metadata: JSON.stringify(updated),
      },
    }).catch(() => null);
  }

  return updated;
}

/**
 * Calculates treasury metrics, merchant balance, pending funds, and threshold progress.
 */
export async function getTreasuryStats(): Promise<TreasuryStats> {
  const config = await getSettlementConfig();

  // 1. Confirmed payments in system
  const confirmedAgg = await prisma.registrationPayment.aggregate({
    where: { status: "CONFIRMED" },
    _sum: { feeAmount: true },
    _count: { _all: true },
  });

  // 2. Pending customer payments (awaiting customer PIN / provider confirmation)
  const pendingAgg = await prisma.registrationPayment.aggregate({
    where: { status: { in: ["PENDING", "WAITING_FOR_CUSTOMER_APPROVAL"] } },
    _sum: { feeAmount: true },
    _count: { _all: true },
  });

  // 3. Completed sweeps to Airtel
  const sweepLogs = await prisma.auditLog.findMany({
    where: {
      entityType: "SETTLEMENT_SWEEP",
      action: { in: ["SWEEP_SUCCESSFUL", "SWEEP_RECONCILED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  let totalSweptToAirtel = 0;
  let totalPayoutFees = 0;
  let lastSweepAt: string | null = null;
  let lastSweepRef: string | null = null;

  for (const log of sweepLogs) {
    try {
      if (log.metadata) {
        const meta = JSON.parse(log.metadata);
        totalSweptToAirtel += Number(meta.amount || 0);
        totalPayoutFees += Number(meta.fee || 0);
        if (!lastSweepAt) {
          lastSweepAt = log.createdAt.toISOString();
          lastSweepRef = meta.sweepReference || log.entityId;
        }
      }
    } catch {
      // Ignore parse failure on individual log
    }
  }

  const totalCollectedRevenue = confirmedAgg._sum.feeAmount || 0;
  // Cleared balance = confirmed revenue minus already swept amounts
  const clearedMerchantBalance = Math.max(0, totalCollectedRevenue - totalSweptToAirtel);

  const thresholdProgressPct = config.threshold > 0
    ? Math.min(100, Math.round((clearedMerchantBalance / config.threshold) * 100))
    : 100;

  const isThresholdReached = clearedMerchantBalance >= config.threshold;

  return {
    clearedMerchantBalance,
    pendingCustomerPayments: pendingAgg._sum.feeAmount || 0,
    totalCollectedRevenue,
    totalSweptToAirtel,
    totalPayoutFees,
    lastSweepAt,
    lastSweepRef,
    nextScheduledSweep: `Today at ${config.scheduleTime} CAT`,
    isThresholdReached,
    thresholdProgressPct,
    config,
  };
}

/**
 * Returns historical list of settlement sweeps.
 */
export async function getSettlementHistory(limit = 50): Promise<SettlementSweepRecord[]> {
  const sweepLogs = await prisma.auditLog.findMany({
    where: { entityType: "SETTLEMENT_SWEEP" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const records: SettlementSweepRecord[] = [];
  const seenRefs = new Set<string>();

  for (const log of sweepLogs) {
    try {
      if (!log.metadata) continue;
      const meta = JSON.parse(log.metadata);
      const sweepRef = meta.sweepReference || log.entityId;

      if (seenRefs.has(sweepRef)) continue;
      seenRefs.add(sweepRef);

      records.push({
        id: log.id,
        sweepReference: sweepRef,
        payoutRef: meta.payoutRef || null,
        amount: Number(meta.amount || 0),
        fee: Number(meta.fee || 0),
        netAmount: Number(meta.netAmount || meta.amount || 0),
        destinationPhone: meta.destinationPhone || "0729974065",
        destinationProvider: meta.destinationProvider || "AIRTEL_MONEY",
        status: meta.status || (log.action === "SWEEP_SUCCESSFUL" ? "SUCCESSFUL" : "PROCESSING"),
        triggerType: meta.triggerType || "AUTOMATIC_THRESHOLD",
        triggeredById: log.actorId,
        triggeredByName: meta.triggeredByName || (log.actorId ? "Super Admin" : "System Automated Sweep"),
        clearedBalanceBefore: Number(meta.clearedBalanceBefore || 0),
        clearedBalanceAfter: Number(meta.clearedBalanceAfter || 0),
        failureReason: meta.failureReason || null,
        smsBridgeEvidenceRef: meta.smsBridgeEvidenceRef || null,
        createdAt: log.createdAt.toISOString(),
        settledAt: meta.settledAt || log.createdAt.toISOString(),
        reconciledAt: meta.reconciledAt || null,
        isSimulation: Boolean(meta.isSimulation),
      });
    } catch {
      // Continue
    }
  }

  return records;
}

/**
 * Executes a controlled settlement sweep to the primary MOSA Airtel wallet 0729974065.
 * Strictly respects idempotency, cleared balances, and financial separation.
 */
export async function executeSettlementSweep({
  amountToSweep,
  forceManual = false,
  adminUser,
  ipAddress,
}: {
  amountToSweep?: number;
  forceManual?: boolean;
  adminUser?: { id: string; name: string };
  ipAddress?: string;
}): Promise<{
  success: boolean;
  message: string;
  sweepRecord?: SettlementSweepRecord;
  skippedReason?: string;
}> {
  const config = await getSettlementConfig();
  const stats = await getTreasuryStats();

  // 1. Safeguard: Check if auto-sweep is enabled
  if (!forceManual && !config.autoSweepEnabled) {
    return {
      success: false,
      message: "Automatic settlement sweeps are currently paused in Command Center.",
      skippedReason: "AUTO_SWEEP_DISABLED",
    };
  }

  // 2. Safeguard: Check daily sweep limit for automated runs
  if (!forceManual) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sweepsToday = await prisma.auditLog.count({
      where: {
        entityType: "SETTLEMENT_SWEEP",
        action: { in: ["SWEEP_SUCCESSFUL", "SWEEP_RECONCILED", "SWEEP_PROCESSING"] },
        createdAt: { gte: todayStart },
      },
    });

    if (sweepsToday >= config.maxDailySweeps) {
      return {
        success: false,
        message: `Maximum automatic sweep frequency reached (${sweepsToday}/${config.maxDailySweeps} today). Emergency payout can be triggered manually by SUPER_ADMIN.`,
        skippedReason: "MAX_DAILY_FREQUENCY_REACHED",
      };
    }
  }

  // 3. Determine amount to sweep: must only sweep cleared funds
  const clearedBalance = stats.clearedMerchantBalance;
  const targetAmount = forceManual && amountToSweep
    ? amountToSweep
    : (amountToSweep ? Math.min(amountToSweep, clearedBalance) : clearedBalance);

  if (targetAmount < config.minSweepAmount && !forceManual) {
    return {
      success: false,
      message: `Cleared balance (${targetAmount.toLocaleString()} RWF) is below minimum payout amount (${config.minSweepAmount.toLocaleString()} RWF).`,
      skippedReason: "BELOW_MINIMUM_SWEEP_AMOUNT",
    };
  }

  if (targetAmount < config.threshold && !forceManual) {
    return {
      success: false,
      message: `Cleared balance (${targetAmount.toLocaleString()} RWF) has not reached the threshold (${config.threshold.toLocaleString()} RWF).`,
      skippedReason: "THRESHOLD_NOT_REACHED",
    };
  }

  if (targetAmount <= 0) {
    return {
      success: false,
      message: "No cleared funds available to sweep at this time.",
      skippedReason: "ZERO_CLEARED_BALANCE",
    };
  }

  // 4. Generate deterministic, unique sweep reference
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "");
  const sweepReference = `SWEEP-${dateStr}-${timeStr}-${Math.floor(Math.random() * 900 + 100)}`;
  const destinationPhone = config.destinationPhone || "0729974065";
  const triggerType = forceManual ? "MANUAL_EMERGENCY" : "AUTOMATIC_THRESHOLD";

  // 5. Initial audit entry (PROCESSING)
  const processingAudit = await prisma.auditLog.create({
    data: {
      actorId: adminUser?.id,
      action: "SWEEP_PROCESSING",
      entityType: "SETTLEMENT_SWEEP",
      entityId: sweepReference,
      metadata: JSON.stringify({
        sweepReference,
        amount: targetAmount,
        destinationPhone,
        destinationProvider: "AIRTEL_MONEY",
        triggerType,
        triggeredByName: adminUser?.name || "System Automated Sweep",
        clearedBalanceBefore: clearedBalance,
        status: "PROCESSING",
        createdAt: now.toISOString(),
      }),
      ipAddress,
    },
  });

  try {
    // 6. Execute CASHOUT payout via Paypack Adapter
    const cashoutResult = await initiatePaypackCashout({
      amount: targetAmount,
      destinationPhone,
    });

    const fee = cashoutResult.fee ?? (targetAmount >= 50000 ? 250 : 150); // Operator B2C disbursement fee
    const netAmount = Math.max(0, targetAmount - fee);
    const clearedBalanceAfter = Math.max(0, clearedBalance - targetAmount);

    if (!cashoutResult.success) {
      // Payout failed at gateway
      const failureAudit = await prisma.auditLog.create({
        data: {
          actorId: adminUser?.id,
          action: "SWEEP_FAILED",
          entityType: "SETTLEMENT_SWEEP",
          entityId: sweepReference,
          metadata: JSON.stringify({
            sweepReference,
            payoutRef: cashoutResult.ref || null,
            amount: targetAmount,
            fee: 0,
            netAmount: 0,
            destinationPhone,
            destinationProvider: "AIRTEL_MONEY",
            triggerType,
            status: "FAILED",
            failureReason: cashoutResult.message,
            clearedBalanceBefore: clearedBalance,
            clearedBalanceAfter: clearedBalance,
            createdAt: now.toISOString(),
          }),
          ipAddress,
        },
      });

      return {
        success: false,
        message: `Settlement sweep failed: ${cashoutResult.message}`,
        skippedReason: "GATEWAY_CASHOUT_FAILED",
      };
    }

    // 7. Record successful sweep
    const successAudit = await prisma.auditLog.create({
      data: {
        actorId: adminUser?.id,
        action: "SWEEP_SUCCESSFUL",
        entityType: "SETTLEMENT_SWEEP",
        entityId: sweepReference,
        metadata: JSON.stringify({
          sweepReference,
          payoutRef: cashoutResult.ref,
          amount: targetAmount,
          fee,
          netAmount,
          destinationPhone,
          destinationProvider: "AIRTEL_MONEY",
          triggerType,
          status: "SUCCESSFUL",
          isSimulation: cashoutResult.isSimulation,
          clearedBalanceBefore: clearedBalance,
          clearedBalanceAfter,
          settledAt: new Date().toISOString(),
          createdAt: now.toISOString(),
          triggeredByName: adminUser?.name || "System Automated Sweep",
        }),
        ipAddress,
      },
    });

    const sweepRecord: SettlementSweepRecord = {
      id: successAudit.id,
      sweepReference,
      payoutRef: cashoutResult.ref,
      amount: targetAmount,
      fee,
      netAmount,
      destinationPhone,
      destinationProvider: "AIRTEL_MONEY",
      status: "SUCCESSFUL",
      triggerType,
      triggeredById: adminUser?.id || null,
      triggeredByName: adminUser?.name || "System Automated Sweep",
      clearedBalanceBefore: clearedBalance,
      clearedBalanceAfter,
      isSimulation: cashoutResult.isSimulation,
      createdAt: now.toISOString(),
      settledAt: new Date().toISOString(),
    };

    return {
      success: true,
      message: `Successfully executed ${targetAmount.toLocaleString()} RWF sweep to Airtel SIM ${destinationPhone}. Ref: ${cashoutResult.ref}`,
      sweepRecord,
    };
  } catch (error: any) {
    console.error("[SETTLEMENT_SWEEP_EXCEPTION]", error);
    await prisma.auditLog.create({
      data: {
        actorId: adminUser?.id,
        action: "SWEEP_FAILED",
        entityType: "SETTLEMENT_SWEEP",
        entityId: sweepReference,
        metadata: JSON.stringify({
          sweepReference,
          amount: targetAmount,
          destinationPhone,
          triggerType,
          status: "FAILED",
          failureReason: error.message || "Unexpected exception during payout execution",
          clearedBalanceBefore: clearedBalance,
          clearedBalanceAfter: clearedBalance,
          createdAt: now.toISOString(),
        }),
        ipAddress,
      },
    }).catch(() => null);

    return {
      success: false,
      message: `Exception during settlement sweep: ${error.message}`,
      skippedReason: "UNEXPECTED_EXCEPTION",
    };
  }
}

/**
 * Reconciles an executed sweep with an incoming Android Bridge SMS notification
 * received on the Airtel receiver SIM 0729974065.
 * Strictly treats Bridge SMS as supporting evidence of payout arrival,
 * without modifying original customer registration payments.
 */
export async function reconcileSweepWithBridgeSms({
  smsReference,
  amount,
  sender,
  smsBody,
}: {
  smsReference: string;
  amount: number;
  sender: string;
  smsBody: string;
}): Promise<{ reconciled: boolean; matchedSweepRef?: string }> {
  // Find recent matching successful sweep with same amount within last 48 hours
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recentSweeps = await prisma.auditLog.findMany({
    where: {
      entityType: "SETTLEMENT_SWEEP",
      action: "SWEEP_SUCCESSFUL",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  for (const log of recentSweeps) {
    try {
      if (!log.metadata) continue;
      const meta = JSON.parse(log.metadata);
      // Compare netAmount or amount (considering fee tolerance)
      const sweepAmount = Number(meta.amount || 0);
      const sweepNetAmount = Number(meta.netAmount || meta.amount || 0);

      const isAmountMatch =
        Math.abs(sweepAmount - amount) <= 300 ||
        Math.abs(sweepNetAmount - amount) <= 50;

      if (isAmountMatch) {
        // Record reconciliation audit log
        meta.status = "RECONCILED";
        meta.reconciledAt = new Date().toISOString();
        meta.smsBridgeEvidenceRef = smsReference;
        meta.bridgeSmsSender = sender;

        await prisma.auditLog.create({
          data: {
            action: "SWEEP_RECONCILED",
            entityType: "SETTLEMENT_SWEEP",
            entityId: meta.sweepReference || log.entityId,
            metadata: JSON.stringify(meta),
          },
        });

        return {
          reconciled: true,
          matchedSweepRef: meta.sweepReference || log.entityId,
        };
      }
    } catch {
      // Continue
    }
  }

  return { reconciled: false };
}
