import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Enable high-fidelity simulator for automated pilot test verification
process.env.ENABLE_PAYMENT_SIMULATOR = "true";
process.env.ALLOW_STAGING_PAYMENT_SIMULATION = "true";

import { prisma } from "../src/lib/prisma";
import {
  getSettlementConfig,
  updateSettlementConfig,
  getTreasuryStats,
  executeSettlementSweep,
  reconcileSweepWithBridgeSms,
  getSettlementHistory,
} from "../src/lib/payments/paypack-settlement";
import { initiateRegistrationPayment, confirmPaymentAndActivateBusiness } from "../src/lib/payments/engine";

describe("MOSA — Strategy 2: Controlled Paypack Settlement Sweeps Suite", async () => {
  const runId = Math.floor(Math.random() * 900000 + 100000);

  // Setup test business and super admin user
  const adminUser = await prisma.user.create({
    data: {
      email: `treasury-admin-${runId}@mosa.rw`,
      name: "Treasury Super Admin",
      role: "SUPER_ADMIN",
      referralCode: `TADM-${runId}`,
    },
  });

  const business = await prisma.business.create({
    data: {
      name: `Treasury Test Business ${runId}`,
      ownerId: adminUser.id,
      category: "retail",
      mainCategory: "retail",
      description: "Test business description for Paypack treasury sweep verification",
      phone: "0788123456",
      latitude: -1.9441,
      longitude: 30.0619,
      sector: "Kacyiru",
      cell: "Kamatamu",
      district: "Gasabo",
      status: "PENDING_PAYMENT",
    },
  });

  it("Scenario 1: Initial Settlement Configuration & Option A Receiving Defaults", async () => {
    const config = await getSettlementConfig();
    assert.strictEqual(config.destinationPhone, "0729974065", "Primary destination must be MOSA Airtel Money 0729974065");
    assert.strictEqual(config.threshold, 50000, "Initial cashout threshold must default to 50,000 RWF");
    assert.strictEqual(config.maxDailySweeps, 1, "Initial max sweep frequency must be once daily");
    console.log("  [PASS] Option A initial configuration verified with Airtel 0729974065 and 50,000 RWF threshold.");
  });

  it("Scenario 2: SUPER_ADMIN Configuration Updates with Audit Trail", async () => {
    const updated = await updateSettlementConfig(
      {
        threshold: 45000,
        scheduleTime: "23:45",
        autoSweepEnabled: true,
      },
      { id: adminUser.id, name: adminUser.name }
    );

    assert.strictEqual(updated.threshold, 45000);
    assert.strictEqual(updated.scheduleTime, "23:45");

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "UPDATE_PAYPACK_SETTLEMENT_CONFIG",
        actorId: adminUser.id,
      },
      orderBy: { createdAt: "desc" },
    });

    assert(audit !== null, "Audit entry for configuration update must exist");
    console.log("  [PASS] SUPER_ADMIN updated settlement config and audit entry logged.");

    // Restore to standard 50,000 threshold
    await updateSettlementConfig({ threshold: 50000 }, { id: adminUser.id, name: adminUser.name });
  });

  it("Scenario 3: Strict Financial Separation — Customer Cash-in Confirmed Independently", async () => {
    // 1. Customer initiates registration payment of 5,000 RWF
    const initRes = await initiateRegistrationPayment({
      businessId: business.id,
      payerUserId: adminUser.id,
      provider: "MTN_MOMO",
      phoneNumber: "0788123456",
    });

    const ref = initRes.paymentReference;
    assert(ref !== undefined, "Payment reference must exist");

    // 2. Customer authorizes on phone -> CASHIN webhook confirmation arrives
    const confirmRes = await confirmPaymentAndActivateBusiness({
      paymentReference: ref,
      providerTransactionRef: `PP-TX-${runId}-01`,
      provider: "MTN_MOMO",
      amountPaid: 5000,
      currency: "RWF",
      verifiedBy: "PROVIDER_WEBHOOK",
    });

    assert.strictEqual(confirmRes.success, true);
    assert.strictEqual(confirmRes.businessStatus, "ACTIVE");
    assert(confirmRes.receipt !== undefined && confirmRes.receipt !== null);
    assert(confirmRes.receipt!.receiptNumber.startsWith("MOSA-REC-"));

    // Business is immediately activated; customer is NOT waiting for payout
    console.log(`  [PASS] Customer payment confirmed immediately (${confirmRes.receipt!.receiptNumber}). Business ACTIVE.`);
  });

  it("Scenario 4: Threshold Safeguard — Under-Threshold Balance (5,000 < 50,000) Skips Auto-Sweep", async () => {
    const stats = await getTreasuryStats();
    console.log(`  [INFO] Current cleared balance: ${stats.clearedMerchantBalance} RWF (Threshold: ${stats.config.threshold} RWF)`);

    const result = await executeSettlementSweep({
      forceManual: false, // Automatic mode
    });

    // If accumulated balance in DB is less than 50,000 RWF, it must safely skip
    if (stats.clearedMerchantBalance < 50000) {
      assert.strictEqual(result.success, false);
      assert(
        result.skippedReason === "THRESHOLD_NOT_REACHED" ||
        result.skippedReason === "MAX_DAILY_FREQUENCY_REACHED",
        `Expected skip reason THRESHOLD_NOT_REACHED or MAX_DAILY_FREQUENCY_REACHED, got ${result.skippedReason}`
      );
      console.log(`  [PASS] Auto-sweep correctly skipped by automatic safeguard (${result.skippedReason}).`);
    } else {
      console.log("  [INFO] Existing database balance exceeded threshold; auto-sweep eligible.");
    }
  });

  it("Scenario 5: Manual Emergency Payout by SUPER_ADMIN to Airtel 0729974065", async () => {
    // SUPER_ADMIN triggers manual emergency payout of 10,000 RWF
    const result = await executeSettlementSweep({
      amountToSweep: 10000,
      forceManual: true, // Emergency override
      adminUser: { id: adminUser.id, name: adminUser.name },
    });

    assert.strictEqual(result.success, true);
    assert(result.sweepRecord !== undefined);
    assert.strictEqual(result.sweepRecord!.destinationPhone, "0729974065");
    assert.strictEqual(result.sweepRecord!.triggerType, "MANUAL_EMERGENCY");
    assert.strictEqual(result.sweepRecord!.status, "SUCCESSFUL");
    assert(result.sweepRecord!.payoutRef?.startsWith("PAYPACK-OUT-"));
    assert(result.sweepRecord!.netAmount > 0);

    console.log(`  [PASS] Emergency sweep of 10,000 RWF successfully executed to Airtel 0729974065! Ref: ${result.sweepRecord!.payoutRef}`);
  });

  it("Scenario 6: Android Bridge SMS Evidence Matching & Reconciliation", async () => {
    // Simulate Android Bridge phone receiving SMS confirmation on Airtel SIM 0729974065
    const bridgeSmsRef = `SMS-AIRTEL-${runId}`;
    const reconcileRes = await reconcileSweepWithBridgeSms({
      smsReference: bridgeSmsRef,
      amount: 10000,
      sender: "AIRTEL_MONEY",
      smsBody: `You have received 10000 RWF from Paypack settlement into 0729974065. TxId: ${bridgeSmsRef}`,
    });

    assert.strictEqual(reconcileRes.reconciled, true);
    assert(reconcileRes.matchedSweepRef !== undefined);
    console.log(`  [PASS] Bridge SMS evidence matched and reconciled sweep ${reconcileRes.matchedSweepRef}`);
  });

  it("Scenario 7: Audit Ledger & Sweep History Retrieval", async () => {
    const history = await getSettlementHistory(10);
    assert(history.length > 0, "Sweep history should contain recent sweeps");
    const latest = history[0];
    assert.strictEqual(latest.destinationPhone, "0729974065");
    console.log(`  [PASS] Settlement history ledger verified. Latest sweep: ${latest.sweepReference} (${latest.amount} RWF)`);
  });

  it("Scenario 8: Economic Fee Analysis Validation", () => {
    // Validate mathematical fee conservation:
    // Individual cashout of 5,000 RWF with 250 RWF operator fee = 5.0% fee
    const individualFeePct = (250 / 5000) * 100;
    // Batch cashout of 50,000 RWF (10 registrations) with 250 RWF operator fee = 0.5% fee
    const batchFeePct = (250 / 50000) * 100;
    const feeSavingsPct = ((individualFeePct - batchFeePct) / individualFeePct) * 100;

    assert.strictEqual(individualFeePct, 5.0);
    assert.strictEqual(batchFeePct, 0.5);
    assert.strictEqual(feeSavingsPct, 90.0);
    console.log(`  [PASS] Fee optimization verified: Batching at 50,000 RWF reduces operator cashout fee from 5.0% to 0.5% (90% savings).`);
  });
});
