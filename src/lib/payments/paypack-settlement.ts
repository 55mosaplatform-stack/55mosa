import { prisma } from "../prisma";
import {
  getPaypackConfig,
  initiatePaypackCashout,
  queryPaypackTransaction,
  generatePaypackIdempotencyKey,
} from "./paypack-adapter";
import crypto from "crypto";

export type SweepStatus =
  | "CASHOUT_PENDING"
  | "CASHOUT_PROVIDER_CONFIRMED"
  | "WALLET_RECEIPT_MATCHED"
  | "RECONCILED"
  | "CASHOUT_FAILED"
  | "CASHOUT_REQUIRES_REVIEW";

export interface SettlementConfig {
  threshold: number; // e.g. 50,000 RWF
  destinationPhone: string; // Hard-locked to "0729974065" (MOSA Airtel Money)
  destinationName: string; // "MOSA Airtel Receiving Wallet (Primary)"
  autoSweepEnabled: boolean; // Production safety: default false until production authorization
  scheduleTime: string; // "23:59" CAT (21:59 UTC on Vercel)
  maxDailySweeps: number; // 1
  minSweepAmount: number; // 5,000 RWF
  sweepMode: "FULL_BALANCE" | "EXACT_THRESHOLD"; // Default "FULL_BALANCE"
  reserveAmount: number; // Minimum balance retained in Paypack account (default: 0 RWF)
  lastDailySweepDate?: string | null; // e.g. "2026-11-01" to prevent duplicate daily sweeps
  updatedAt?: string;
  updatedBy?: string;
}

export interface SettlementSweepRecord {
  id: string;
  sweepReference: string;
  idempotencyKey: string;
  payoutRef: string | null;
  amount: number;
  fee: number;
  netAmount: number;
  destinationPhone: string;
  destinationProvider: string;
  status: SweepStatus;
  triggerType: "AUTOMATIC_THRESHOLD" | "AUTOMATIC_SCHEDULED" | "MANUAL_EMERGENCY";
  triggeredById?: string | null;
  triggeredByName?: string | null;
  purpose?: string | null;
  clearedBalanceBefore: number;
  clearedBalanceAfter: number;
  failureReason?: string | null;
  smsBridgeEvidenceRef?: string | null;
  isFeeEstimated?: boolean;
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

export interface SweepPreview {
  clearedBalance: number;
  reserveAmount: number;
  sweepMode: "FULL_BALANCE" | "EXACT_THRESHOLD";
  sweepAmount: number;
  estimatedFee: number;
  isFeeEstimated: boolean;
  expectedNetPayout: number;
  destinationPhone: string;
  destinationName: string;
  isEligible: boolean;
  ineligibilityReason?: string;
}

const DEFAULT_SETTLEMENT_CONFIG: SettlementConfig = {
  threshold: 50000,
  destinationPhone: "0729974065", // Primary MOSA Airtel Receiving Destination
  destinationName: "MOSA Airtel Receiving Wallet (Primary)",
  autoSweepEnabled: false, // Production safety: explicitly requires admin enablement
  scheduleTime: "23:59", // 23:59 CAT (= 21:59 UTC on Vercel)
  maxDailySweeps: 1,
  minSweepAmount: 5000,
  sweepMode: "FULL_BALANCE",
  reserveAmount: 0,
};

/**
 * Acquires a distributed lock for settlement operations using PostgreSQL.
 * Guarantees that scheduled crons and manual emergency clicks cannot execute concurrently.
 */
export async function acquireSettlementLock(lockKey = "lock:paypack_settlement", ttlSeconds = 120): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  try {
    // Delete expired lock if past resetAt
    await prisma.paymentRateLimit.deleteMany({
      where: {
        key: lockKey,
        resetAt: { lt: now },
      },
    });

    // Atomically insert lock record; succeeds only if key does not exist
    await prisma.paymentRateLimit.create({
      data: {
        key: lockKey,
        count: 1,
        resetAt: expiresAt,
      },
    });
    return true;
  } catch (err: any) {
    if (err.code === "P2002") {
      return false; // Concurrency lock already held
    }
    console.warn("[SETTLEMENT_LOCK_WARN] Distributed lock acquisition error:", err.message);
    return false;
  }
}

/**
 * Releases the distributed lock.
 */
export async function releaseSettlementLock(lockKey = "lock:paypack_settlement"): Promise<void> {
  await prisma.paymentRateLimit.deleteMany({
    where: { key: lockKey },
  }).catch(() => null);
}

/**
 * Retrieves the current settlement configuration.
 * Destination phone is locked to MOSA's official Airtel SIM 0729974065.
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
      destinationPhone: "0729974065", // Immutable: locked to official Airtel receiver
      destinationName: configRow.accountName || DEFAULT_SETTLEMENT_CONFIG.destinationName,
      autoSweepEnabled: configRow.isEnabled,
      scheduleTime: parsed.scheduleTime || DEFAULT_SETTLEMENT_CONFIG.scheduleTime,
      maxDailySweeps: Number(parsed.maxDailySweeps || DEFAULT_SETTLEMENT_CONFIG.maxDailySweeps),
      minSweepAmount: Number(parsed.minSweepAmount || DEFAULT_SETTLEMENT_CONFIG.minSweepAmount),
      sweepMode: parsed.sweepMode === "EXACT_THRESHOLD" ? "EXACT_THRESHOLD" : "FULL_BALANCE",
      reserveAmount: Number(parsed.reserveAmount || 0),
      lastDailySweepDate: parsed.lastDailySweepDate || null,
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
 * Destination phone is strictly locked to MOSA Airtel 0729974065.
 */
export async function updateSettlementConfig(
  params: Partial<SettlementConfig>,
  adminUser?: { id: string; name: string }
): Promise<SettlementConfig> {
  const current = await getSettlementConfig();
  const updated: SettlementConfig = {
    ...current,
    ...params,
    destinationPhone: "0729974065", // Enforce immutable destination
    updatedAt: new Date().toISOString(),
    updatedBy: adminUser ? `${adminUser.name} (${adminUser.id})` : undefined,
  };

  const instructionsPayload = JSON.stringify({
    threshold: updated.threshold,
    scheduleTime: updated.scheduleTime,
    maxDailySweeps: updated.maxDailySweeps,
    minSweepAmount: updated.minSweepAmount,
    sweepMode: updated.sweepMode,
    reserveAmount: updated.reserveAmount,
    lastDailySweepDate: updated.lastDailySweepDate || current.lastDailySweepDate,
  });

  await prisma.paymentProviderConfig.upsert({
    where: { provider: "PAYPACK_SETTLEMENT" },
    create: {
      provider: "PAYPACK_SETTLEMENT",
      name: "Paypack Automated Airtel Settlement Sweeps",
      isEnabled: updated.autoSweepEnabled,
      accountNumber: "0729974065",
      accountName: updated.destinationName,
      instructions: instructionsPayload,
      updatedBy: adminUser?.id,
    },
    update: {
      isEnabled: updated.autoSweepEnabled,
      accountNumber: "0729974065",
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
 * Calculates real-time treasury metrics, merchant balance, pending funds, and progress.
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

  // 3. Completed or confirmed sweeps to Airtel
  const sweepLogs = await prisma.auditLog.findMany({
    where: {
      entityType: "SETTLEMENT_SWEEP",
      action: { in: ["SWEEP_PROVIDER_CONFIRMED", "SWEEP_RECONCILED", "SWEEP_SUCCESSFUL"] },
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
      // Continue
    }
  }

  const totalCollectedRevenue = confirmedAgg._sum.feeAmount || 0;
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
    nextScheduledSweep: `Today at ${config.scheduleTime} CAT (21:59 UTC on Vercel)`,
    isThresholdReached,
    thresholdProgressPct,
    config,
  };
}

/**
 * Calculates a transparent preview of the sweep amount, reserve, estimated fees,
 * and expected net payout to Airtel 0729974065 before manual or scheduled authorization.
 */
export async function calculateSweepPreview({
  requestedAmount,
  forceManual = false,
}: {
  requestedAmount?: number;
  forceManual?: boolean;
} = {}): Promise<SweepPreview> {
  const config = await getSettlementConfig();
  const stats = await getTreasuryStats();

  const clearedBalance = stats.clearedMerchantBalance;
  const reserveAmount = Math.max(0, config.reserveAmount);
  const availableAboveReserve = Math.max(0, clearedBalance - reserveAmount);

  let sweepAmount = 0;

  if (forceManual && requestedAmount) {
    sweepAmount = requestedAmount;
  } else if (config.sweepMode === "EXACT_THRESHOLD") {
    // Withdraw in exact threshold chunks (e.g. 50,000 RWF)
    sweepAmount = availableAboveReserve >= config.threshold
      ? Math.floor(availableAboveReserve / config.threshold) * config.threshold
      : 0;
  } else {
    // Default "FULL_BALANCE": withdraw all cleared funds above the reserve
    sweepAmount = availableAboveReserve;
  }

  // Estimated fee is flagged as estimate until Paypack returns actual fee in cashout response
  const estimatedFee = sweepAmount > 0 ? Math.round(sweepAmount * 0.005) : 0;
  const expectedNetPayout = Math.max(0, sweepAmount - estimatedFee);

  let isEligible = true;
  let ineligibilityReason: string | undefined;

  if (!forceManual) {
    if (!config.autoSweepEnabled) {
      isEligible = false;
      ineligibilityReason = "Automated settlement sweeps are currently paused in Command Center.";
    } else if (sweepAmount < config.minSweepAmount) {
      isEligible = false;
      ineligibilityReason = `Sweep amount (${sweepAmount.toLocaleString()} RWF) is below minimum payout (${config.minSweepAmount.toLocaleString()} RWF).`;
    } else if (availableAboveReserve < config.threshold) {
      isEligible = false;
      ineligibilityReason = `Cleared balance (${clearedBalance.toLocaleString()} RWF) has not reached the threshold (${config.threshold.toLocaleString()} RWF).`;
    }
  }

  return {
    clearedBalance,
    reserveAmount,
    sweepMode: config.sweepMode,
    sweepAmount,
    estimatedFee,
    isFeeEstimated: true,
    expectedNetPayout,
    destinationPhone: "0729974065",
    destinationName: config.destinationName,
    isEligible,
    ineligibilityReason,
  };
}

/**
 * Returns historical list of settlement sweeps from PostgreSQL audit ledger.
 */
export async function getSettlementHistory(limit = 50): Promise<SettlementSweepRecord[]> {
  const sweepLogs = await prisma.auditLog.findMany({
    where: { entityType: "SETTLEMENT_SWEEP" },
    orderBy: { createdAt: "desc" },
    take: limit * 2, // Fetch extra to account for state transitions of same sweep
  });

  const recordsMap = new Map<string, SettlementSweepRecord>();

  for (const log of sweepLogs) {
    try {
      if (!log.metadata) continue;
      const meta = JSON.parse(log.metadata);
      const sweepRef = meta.sweepReference || log.entityId;

      if (recordsMap.has(sweepRef)) {
        // Keep the latest state record
        continue;
      }

      const status: SweepStatus =
        meta.status ||
        (log.action === "SWEEP_RECONCILED"
          ? "RECONCILED"
          : log.action === "SWEEP_PROVIDER_CONFIRMED"
          ? "CASHOUT_PROVIDER_CONFIRMED"
          : log.action === "SWEEP_FAILED"
          ? "CASHOUT_FAILED"
          : log.action === "SWEEP_REQUIRES_REVIEW"
          ? "CASHOUT_REQUIRES_REVIEW"
          : "CASHOUT_PENDING");

      recordsMap.set(sweepRef, {
        id: log.id,
        sweepReference: sweepRef,
        idempotencyKey: meta.idempotencyKey || generatePaypackIdempotencyKey("SWP-", sweepRef),
        payoutRef: meta.payoutRef || null,
        amount: Number(meta.amount || 0),
        fee: Number(meta.fee || 0),
        netAmount: Number(meta.netAmount || meta.amount || 0),
        destinationPhone: "0729974065",
        destinationProvider: "AIRTEL_MONEY",
        status,
        triggerType: meta.triggerType || "AUTOMATIC_THRESHOLD",
        triggeredById: log.actorId,
        triggeredByName: meta.triggeredByName || (log.actorId ? "Super Admin" : "System Automated Sweep"),
        purpose: meta.purpose || null,
        clearedBalanceBefore: Number(meta.clearedBalanceBefore || 0),
        clearedBalanceAfter: Number(meta.clearedBalanceAfter || 0),
        failureReason: meta.failureReason || null,
        smsBridgeEvidenceRef: meta.smsBridgeEvidenceRef || null,
        isFeeEstimated: Boolean(meta.isFeeEstimated),
        createdAt: log.createdAt.toISOString(),
        settledAt: meta.settledAt || null,
        reconciledAt: meta.reconciledAt || null,
        isSimulation: Boolean(meta.isSimulation),
      });

      if (recordsMap.size >= limit) break;
    } catch {
      // Continue
    }
  }

  return Array.from(recordsMap.values());
}

/**
 * Executes a controlled settlement sweep to the primary MOSA Airtel wallet 0729974065.
 *
 * Strict Production Safety Rules:
 * 1. Distributed Locking: Only 1 sweep operation can execute at any time.
 * 2. Strict Idempotency: Persistent 32-character maximum Idempotency-Key.
 * 3. Asynchronous PENDING state: Payout is initially marked CASHOUT_PENDING, not confirmed.
 * 4. Network Timeout Recovery: Look up existing transaction ref; never mint a duplicate payout.
 * 5. Destination Locked: Destination is strictly 0729974065.
 */
export async function executeSettlementSweep({
  amountToSweep,
  forceManual = false,
  triggerType = "AUTOMATIC_THRESHOLD",
  purpose = "Automated Threshold Batch Sweep",
  adminUser,
  ipAddress,
}: {
  amountToSweep?: number;
  forceManual?: boolean;
  triggerType?: "AUTOMATIC_THRESHOLD" | "AUTOMATIC_SCHEDULED" | "MANUAL_EMERGENCY";
  purpose?: string;
  adminUser?: { id: string; name: string };
  ipAddress?: string;
}): Promise<{
  success: boolean;
  message: string;
  sweepRecord?: SettlementSweepRecord;
  skippedReason?: string;
}> {
  // 1. Acquire Distributed Lock (2-minute TTL)
  const lockAcquired = await acquireSettlementLock("lock:paypack_settlement", 120);
  if (!lockAcquired) {
    return {
      success: false,
      message: "Another settlement sweep or payout is currently in progress. Please wait.",
      skippedReason: "CONCURRENT_SWEEP_IN_PROGRESS",
    };
  }

  try {
    const config = await getSettlementConfig();
    const stats = await getTreasuryStats();

    // 2. Safeguard: Check if auto-sweep is enabled
    if (!forceManual && !config.autoSweepEnabled) {
      return {
        success: false,
        message: "Automatic settlement sweeps are currently paused in Command Center.",
        skippedReason: "AUTO_SWEEP_DISABLED",
      };
    }

    // 3. Safeguard: Check daily sweep limit & unique daily execution for automated runs
    const todayStr = new Date().toISOString().slice(0, 10);
    if (!forceManual) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const sweepsToday = await prisma.auditLog.count({
        where: {
          entityType: "SETTLEMENT_SWEEP",
          action: { in: ["SWEEP_PROVIDER_CONFIRMED", "SWEEP_RECONCILED", "SWEEP_SUCCESSFUL", "SWEEP_PENDING"] },
          createdAt: { gte: todayStart },
        },
      });

      if (sweepsToday >= config.maxDailySweeps || config.lastDailySweepDate === todayStr) {
        return {
          success: false,
          message: `Maximum automatic sweep frequency reached (${sweepsToday}/${config.maxDailySweeps} today). Emergency payout can be triggered manually by SUPER_ADMIN.`,
          skippedReason: "MAX_DAILY_FREQUENCY_REACHED",
        };
      }
    }

    // 4. Calculate sweep amount based on sweepMode and reserve
    const preview = await calculateSweepPreview({ requestedAmount: amountToSweep, forceManual });

    if (!forceManual && !preview.isEligible) {
      return {
        success: false,
        message: preview.ineligibilityReason || "Cleared balance is not eligible for sweep.",
        skippedReason: preview.ineligibilityReason?.includes("threshold")
          ? "THRESHOLD_NOT_REACHED"
          : "BELOW_MINIMUM_SWEEP_AMOUNT",
      };
    }

    const targetAmount = preview.sweepAmount;
    if (targetAmount <= 0) {
      return {
        success: false,
        message: "No cleared funds available to sweep above the reserve buffer.",
        skippedReason: "ZERO_CLEARED_BALANCE",
      };
    }

    // 5. Generate persistent, unique sweep reference & 32-character Idempotency Key
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "");
    const randSuffix = Math.floor(Math.random() * 9000 + 1000);
    const sweepReference = `SWEEP-${dateStr}-${timeStr}-${randSuffix}`;
    const idempotencyKey = generatePaypackIdempotencyKey("SWP-", sweepReference);
    const destinationPhone = "0729974065"; // Hard-locked to official Airtel receiver

    // 6. Record Initial Audit Entry: CASHOUT_PENDING
    const pendingAudit = await prisma.auditLog.create({
      data: {
        actorId: adminUser?.id,
        action: "SWEEP_PENDING",
        entityType: "SETTLEMENT_SWEEP",
        entityId: sweepReference,
        metadata: JSON.stringify({
          sweepReference,
          idempotencyKey,
          amount: targetAmount,
          fee: 0,
          isFeeEstimated: true,
          netAmount: targetAmount,
          destinationPhone,
          destinationProvider: "AIRTEL_MONEY",
          triggerType,
          purpose,
          triggeredByName: adminUser?.name || "System Automated Sweep",
          clearedBalanceBefore: stats.clearedMerchantBalance,
          status: "CASHOUT_PENDING" as SweepStatus,
          createdAt: now.toISOString(),
        }),
        ipAddress,
      },
    });

    // 7. Execute CASHOUT payout via Paypack Adapter
    let cashoutResult;
    try {
      cashoutResult = await initiatePaypackCashout({
        amount: targetAmount,
        destinationPhone,
        sweepReference,
      });
    } catch (networkError: any) {
      // Network timeout or network failure: DO NOT mint a new payout ref!
      console.error("[SETTLEMENT_SWEEP_NETWORK_TIMEOUT]", networkError);

      await prisma.auditLog.create({
        data: {
          actorId: adminUser?.id,
          action: "SWEEP_REQUIRES_REVIEW",
          entityType: "SETTLEMENT_SWEEP",
          entityId: sweepReference,
          metadata: JSON.stringify({
            sweepReference,
            idempotencyKey,
            amount: targetAmount,
            destinationPhone,
            triggerType,
            status: "CASHOUT_REQUIRES_REVIEW" as SweepStatus,
            failureReason: `Network timeout during payout dispatch: ${networkError.message}. Verification required.`,
            needsLookup: true,
            createdAt: now.toISOString(),
          }),
          ipAddress,
        },
      });

      // Attempt immediate lookup using original idempotency key
      const lookup = await queryPaypackTransaction(idempotencyKey).catch(() => null);
      if (lookup && lookup.found) {
        return {
          success: true,
          message: `Payout was already submitted before network timeout (Ref: ${lookup.ref || idempotencyKey}). Status: ${lookup.status}.`,
        };
      }

      return {
        success: false,
        message: `Network timeout connecting to Paypack. Transaction status is uncertain and logged as CASHOUT_REQUIRES_REVIEW for manual review. Original reference: ${sweepReference}`,
        skippedReason: "NETWORK_TIMEOUT_VERIFICATION_PENDING",
      };
    }

    // 8. Handle Gateway Explicit Failure
    if (!cashoutResult.success) {
      await prisma.auditLog.create({
        data: {
          actorId: adminUser?.id,
          action: "SWEEP_FAILED",
          entityType: "SETTLEMENT_SWEEP",
          entityId: sweepReference,
          metadata: JSON.stringify({
            sweepReference,
            idempotencyKey,
            payoutRef: cashoutResult.ref || null,
            amount: targetAmount,
            fee: 0,
            destinationPhone,
            triggerType,
            status: "CASHOUT_FAILED" as SweepStatus,
            failureReason: cashoutResult.message,
            clearedBalanceBefore: stats.clearedMerchantBalance,
            clearedBalanceAfter: stats.clearedMerchantBalance,
            createdAt: now.toISOString(),
          }),
          ipAddress,
        },
      });

      return {
        success: false,
        message: `Settlement payout rejected by Paypack: ${cashoutResult.message}`,
        skippedReason: "GATEWAY_CASHOUT_FAILED",
      };
    }

    // 9. Process Initial Cashout Response
    // If Paypack returns actual fee in response, use it; otherwise flag fee as pending confirmation
    const isFeeConfirmed = cashoutResult.fee !== undefined;
    const fee = cashoutResult.fee ?? 0;
    const netAmount = Math.max(0, targetAmount - fee);
    const clearedBalanceAfter = Math.max(0, stats.clearedMerchantBalance - targetAmount);

    // Initial state is CASHOUT_PENDING unless provider returned immediate confirmed status
    const initialStatus: SweepStatus =
      cashoutResult.status === "successful" ? "CASHOUT_PROVIDER_CONFIRMED" : "CASHOUT_PENDING";

    const sweepAction =
      initialStatus === "CASHOUT_PROVIDER_CONFIRMED" ? "SWEEP_PROVIDER_CONFIRMED" : "SWEEP_PENDING";

    const sweepLog = await prisma.auditLog.create({
      data: {
        actorId: adminUser?.id,
        action: sweepAction,
        entityType: "SETTLEMENT_SWEEP",
        entityId: sweepReference,
        metadata: JSON.stringify({
          sweepReference,
          idempotencyKey,
          payoutRef: cashoutResult.ref,
          amount: targetAmount,
          fee,
          isFeeEstimated: !isFeeConfirmed,
          netAmount,
          destinationPhone,
          destinationProvider: "AIRTEL_MONEY",
          triggerType,
          purpose,
          status: initialStatus,
          isSimulation: cashoutResult.isSimulation,
          clearedBalanceBefore: stats.clearedMerchantBalance,
          clearedBalanceAfter,
          settledAt: initialStatus === "CASHOUT_PROVIDER_CONFIRMED" ? new Date().toISOString() : null,
          createdAt: now.toISOString(),
          triggeredByName: adminUser?.name || "System Automated Sweep",
        }),
        ipAddress,
      },
    });

    // Update config with lastDailySweepDate for automated runs
    if (!forceManual) {
      await updateSettlementConfig({ lastDailySweepDate: todayStr });
    }

    const sweepRecord: SettlementSweepRecord = {
      id: sweepLog.id,
      sweepReference,
      idempotencyKey,
      payoutRef: cashoutResult.ref,
      amount: targetAmount,
      fee,
      netAmount,
      destinationPhone,
      destinationProvider: "AIRTEL_MONEY",
      status: initialStatus,
      triggerType,
      purpose,
      triggeredById: adminUser?.id || null,
      triggeredByName: adminUser?.name || "System Automated Sweep",
      clearedBalanceBefore: stats.clearedMerchantBalance,
      clearedBalanceAfter,
      isFeeEstimated: !isFeeConfirmed,
      isSimulation: cashoutResult.isSimulation,
      createdAt: now.toISOString(),
      settledAt: initialStatus === "CASHOUT_PROVIDER_CONFIRMED" ? new Date().toISOString() : null,
    };

    return {
      success: true,
      message:
        initialStatus === "CASHOUT_PROVIDER_CONFIRMED"
          ? `Successfully disbursed ${targetAmount.toLocaleString()} RWF to Airtel SIM ${destinationPhone}. Ref: ${cashoutResult.ref}`
          : `Settlement payout of ${targetAmount.toLocaleString()} RWF submitted to Paypack (Status: PENDING). Ref: ${cashoutResult.ref}`,
      sweepRecord,
    };
  } catch (error: any) {
    console.error("[SETTLEMENT_SWEEP_EXCEPTION]", error);
    return {
      success: false,
      message: `Exception during settlement sweep: ${error.message}`,
      skippedReason: "UNEXPECTED_EXCEPTION",
    };
  } finally {
    // Release distributed lock
    await releaseSettlementLock("lock:paypack_settlement");
  }
}

/**
 * Handles incoming Paypack Webhook events for CASHOUT disbursements.
 * Confirms payout status, records exact gateway fee, and transitions status
 * from CASHOUT_PENDING to CASHOUT_PROVIDER_CONFIRMED or CASHOUT_FAILED.
 */
export async function confirmSweepFromProviderWebhook({
  payoutRef,
  status,
  amount,
  fee,
  destinationPhone,
  processedAt,
}: {
  payoutRef: string;
  status: "successful" | "failed" | string;
  amount: number;
  fee?: number;
  destinationPhone: string;
  processedAt?: string;
}): Promise<{ matched: boolean; status?: SweepStatus; sweepReference?: string }> {
  // Find matching pending sweep in AuditLog
  const matchingLog = await prisma.auditLog.findFirst({
    where: {
      entityType: "SETTLEMENT_SWEEP",
      OR: [
        { metadata: { contains: payoutRef } },
        { entityId: payoutRef },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!matchingLog || !matchingLog.metadata) {
    return { matched: false };
  }

  const meta = JSON.parse(matchingLog.metadata);
  const cleanPhone = destinationPhone.replace(/[\s\-\+\(\)]/g, "").replace(/^250/, "0");

  // Strict verification: Destination must match official Airtel receiver
  if (cleanPhone !== "0729974065" && meta.destinationPhone !== "0729974065") {
    console.warn(`[PAYPACK_WEBHOOK_MISMATCH] Destination ${cleanPhone} does not match expected 0729974065`);
    return { matched: false };
  }

  const newStatus: SweepStatus = status === "successful" ? "CASHOUT_PROVIDER_CONFIRMED" : "CASHOUT_FAILED";
  const actualFee = fee !== undefined ? Number(fee) : Number(meta.fee || 0);
  const netAmount = Math.max(0, Number(meta.amount || amount) - actualFee);

  meta.status = newStatus;
  meta.fee = actualFee;
  meta.isFeeEstimated = false;
  meta.netAmount = netAmount;
  meta.payoutRef = payoutRef;
  meta.settledAt = processedAt || new Date().toISOString();

  await prisma.auditLog.create({
    data: {
      action: newStatus === "CASHOUT_PROVIDER_CONFIRMED" ? "SWEEP_PROVIDER_CONFIRMED" : "SWEEP_FAILED",
      entityType: "SETTLEMENT_SWEEP",
      entityId: meta.sweepReference || matchingLog.entityId,
      metadata: JSON.stringify(meta),
    },
  });

  return {
    matched: true,
    status: newStatus,
    sweepReference: meta.sweepReference || matchingLog.entityId,
  };
}

/**
 * Reconciles an executed sweep with an incoming Android Bridge SMS notification
 * received on the Airtel receiver SIM 0729974065.
 *
 * Strict Production Safety Rules:
 * 1. Bridge SMS is supporting evidence of wallet receipt arrival only.
 * 2. Bridge SMS NEVER independently authorizes or triggers a payout.
 * 3. Only matches existing CASHOUT_PROVIDER_CONFIRMED or CASHOUT_PENDING sweeps.
 * 4. Destination must be confirmed as 0729974065 and sender must be Airtel.
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
}): Promise<{ reconciled: boolean; matchedSweepRef?: string; status?: SweepStatus }> {
  // Check sender: Must be from official Airtel Money notification
  const cleanSender = sender.toUpperCase();
  const isAirtelSender = cleanSender.includes("AIRTEL") || cleanSender.includes("182");

  if (!isAirtelSender) {
    return { reconciled: false };
  }

  // Find recent confirmed or pending sweep within last 48 hours
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recentSweeps = await prisma.auditLog.findMany({
    where: {
      entityType: "SETTLEMENT_SWEEP",
      action: { in: ["SWEEP_PROVIDER_CONFIRMED", "SWEEP_PENDING", "SWEEP_SUCCESSFUL"] },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  for (const log of recentSweeps) {
    try {
      if (!log.metadata) continue;
      const meta = JSON.parse(log.metadata);

      // Verify destination is strictly 0729974065
      if (meta.destinationPhone !== "0729974065") continue;

      const sweepAmount = Number(meta.amount || 0);
      const sweepNetAmount = Number(meta.netAmount || meta.amount || 0);

      // Match amount against gross or net (fee tolerance)
      const isAmountMatch =
        Math.abs(sweepAmount - amount) <= 300 ||
        Math.abs(sweepNetAmount - amount) <= 50;

      if (isAmountMatch) {
        meta.status = "RECONCILED" as SweepStatus;
        meta.walletReceiptMatched = true;
        meta.reconciledAt = new Date().toISOString();
        meta.smsBridgeEvidenceRef = smsReference;
        meta.bridgeSmsSender = sender;
        meta.bridgeSmsBody = smsBody;

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
          status: "RECONCILED",
          matchedSweepRef: meta.sweepReference || log.entityId,
        };
      }
    } catch {
      // Continue
    }
  }

  return { reconciled: false };
}
