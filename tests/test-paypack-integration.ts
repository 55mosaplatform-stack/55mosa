import { prisma } from "../src/lib/prisma";
import {
  initiatePaypackCashin,
  initiatePaypackCashout,
  verifyPaypackWebhookSignature,
  parsePaypackWebhookPayload,
  isPaypackConfigured,
  getPaypackConfig,
} from "../src/lib/payments/paypack-adapter";
import {
  initiateRegistrationPayment,
  confirmPaymentAndActivateBusiness,
} from "../src/lib/payments/engine";
import {
  requestMobileMoneyPayment,
  checkAndReconcilePaymentStatus,
} from "../src/lib/payments/push-gateway";
import crypto from "crypto";
import assert from "assert";

let passedCount = 0;
function logPass(msg: string) {
  passedCount++;
  console.log(`  [PASS] ${msg}`);
}

async function runPaypackSuite() {
  console.log("\n==========================================================================");
  console.log("  MOSA — PAYPACK GATEWAY PILOT INTEGRATION & SETTLEMENT SUITE");
  console.log("==========================================================================\n");

  const runId = Date.now().toString().slice(-6);

  // Setup test owner and business
  const testPhone = `+25078${Math.floor(1000000 + Math.random() * 9000000)}`;
  const testOwner = await prisma.user.create({
    data: {
      email: `paypack_tester_${runId}@mosa.rw`,
      name: `Paypack Tester ${runId}`,
      phone: testPhone,
      role: "BUSINESS_OWNER",
      referralCode: `PP-${runId}`,
    },
  });

  const testBusiness = await prisma.business.create({
    data: {
      name: `Paypack Store ${runId}`,
      category: "retail",
      mainCategory: "retail",
      description: "Test business description for Paypack verification",
      phone: testPhone,
      latitude: -1.9441,
      longitude: 30.0619,
      sector: "Kacyiru",
      cell: "Kamatamu",
      district: "Gasabo",
      status: "DRAFT",
      ownerId: testOwner.id,
    },
  });

  try {
    // ------------------------------------------------------------------------
    // SCENARIO 1: Configuration & Operational State Check
    // ------------------------------------------------------------------------
    console.log("▶ SCENARIO 1: PAYPACK GATEWAY CONFIGURATION DETECTION");
    const config = getPaypackConfig();
    assert.strictEqual(config.cashoutDestinationPhone, "0729974065");
    assert(config.baseUrl.includes("paypack.rw"));
    logPass("Paypack config correctly targets primary receiving Airtel number 0729974065");

    const status = isPaypackConfigured();
    logPass(`Credential check executed: isConfigured=${status.isConfigured} (Missing: ${status.missingRequirements.join(", ") || "None"})`);

    // ------------------------------------------------------------------------
    // SCENARIO 2: MTN Subscriber Cashin (Push Request) Dispatch
    // ------------------------------------------------------------------------
    console.log("\n▶ SCENARIO 2: MTN SUBSCRIBER CASHIN (AUTOMATIC PROMPT DISPATCH)");
    process.env.USE_PAYPACK_GATEWAY = "true";
    process.env.ENABLE_PAYMENT_SIMULATOR = "true";
    process.env.ALLOW_STAGING_PAYMENT_SIMULATION = "true";

    const pMtn = await initiateRegistrationPayment({
      businessId: testBusiness.id,
      payerUserId: testOwner.id,
      provider: "MTN_MOMO",
      phoneNumber: "+250788123456",
    });

    const mtnCashin = await initiatePaypackCashin({
      paymentReference: pMtn.paymentReference!,
      amount: pMtn.feeAmount ?? 5000,
      phoneNumber: "0788123456",
      description: `Registration fee for ${testBusiness.name}`,
    });

    assert.strictEqual(mtnCashin.success, true);
    assert.strictEqual(mtnCashin.provider, "mtn");
    assert.strictEqual(mtnCashin.promptDispatched, true);
    assert(mtnCashin.ref.length > 5);
    logPass("MTN cashin initiated with on-screen prompt dispatched to 0788123456");

    // ------------------------------------------------------------------------
    // SCENARIO 3: Airtel Subscriber Cashin (Push Request) Dispatch
    // ------------------------------------------------------------------------
    console.log("\n▶ SCENARIO 3: AIRTEL SUBSCRIBER CASHIN (AUTOMATIC PROMPT DISPATCH)");
    const bizAirtel = await prisma.business.create({
      data: {
        name: `Airtel Paypack Biz ${runId}`,
        category: "services",
        mainCategory: "services",
        description: "Airtel Paypack Store",
        phone: "+250729974065",
        latitude: -1.9441,
        longitude: 30.0619,
        sector: "Kacyiru",
        cell: "Kamatamu",
        district: "Gasabo",
        status: "DRAFT",
        ownerId: testOwner.id,
      },
    });

    const pAirtel = await initiateRegistrationPayment({
      businessId: bizAirtel.id,
      payerUserId: testOwner.id,
      provider: "AIRTEL_MONEY",
      phoneNumber: "+250729974065",
    });

    const airtelCashin = await initiatePaypackCashin({
      paymentReference: pAirtel.paymentReference!,
      amount: pAirtel.feeAmount ?? 5000,
      phoneNumber: "0729974065",
    });

    assert.strictEqual(airtelCashin.success, true);
    assert.strictEqual(airtelCashin.provider, "airtel");
    assert.strictEqual(airtelCashin.promptDispatched, true);
    logPass("Airtel cashin initiated with on-screen prompt dispatched to 0729974065");

    // ------------------------------------------------------------------------
    // SCENARIO 4: Webhook Signature Verification (x-paypack-signature HMAC)
    // ------------------------------------------------------------------------
    console.log("\n▶ SCENARIO 4: CRYPTOGRAPHIC WEBHOOK SIGNATURE VERIFICATION");
    const testSecret = "paypack_test_secret_mosa_rw";
    const samplePayload = JSON.stringify({
      event_id: `evt_${Date.now()}`,
      kind: "transaction:processed",
      created_at: new Date().toISOString(),
      data: {
        ref: mtnCashin.ref,
        kind: "CASHIN",
        amount: pMtn.feeAmount ?? 5000,
        provider: "mtn",
        client: "0788123456",
        status: "successful",
      },
    });

    // Paypack base64 signature
    const validBase64Signature = crypto
      .createHmac("sha256", testSecret)
      .update(samplePayload)
      .digest("base64");

    const isValidBase64 = verifyPaypackWebhookSignature(samplePayload, validBase64Signature, testSecret);
    assert.strictEqual(isValidBase64, true);
    logPass("Base64 HMAC-SHA256 signature verified successfully");

    const isTamperedRejected = verifyPaypackWebhookSignature(samplePayload, "tampered_signature_123", testSecret);
    assert.strictEqual(isTamperedRejected, false);
    logPass("Tampered webhook signature strictly rejected");

    // ------------------------------------------------------------------------
    // SCENARIO 5: Full Settlement & Business Activation via Paypack Webhook
    // ------------------------------------------------------------------------
    console.log("\n▶ SCENARIO 5: WEBHOOK CONFIRMATION & OFFICIAL RECEIPT ISSUANCE");
    // Attach Paypack transaction ref to payment
    await prisma.registrationPayment.update({
      where: { id: pMtn.payment.id },
      data: {
        providerTransactionRef: mtnCashin.ref,
        status: "WAITING_FOR_CUSTOMER_APPROVAL",
      },
    });

    const parsedEvent = parsePaypackWebhookPayload(JSON.parse(samplePayload));
    assert.strictEqual(parsedEvent.isValid, true);
    assert.strictEqual(parsedEvent.ref, mtnCashin.ref);
    assert.strictEqual(parsedEvent.status, "successful");
    logPass("Webhook payload parsed and validated: kind=CASHIN, status=successful");

    const confirmRes = await confirmPaymentAndActivateBusiness({
      paymentReference: pMtn.paymentReference!,
      providerTransactionRef: mtnCashin.ref,
      provider: "MTN_MOMO",
      amountPaid: pMtn.feeAmount ?? 5000,
      currency: "RWF",
      verifiedBy: "PAYPACK_WEBHOOK",
      rawPayload: samplePayload,
    });

    assert.strictEqual(confirmRes.success, true);
    assert.strictEqual(confirmRes.payment.status, "CONFIRMED");
    assert(confirmRes.receipt !== undefined && confirmRes.receipt !== null);
    assert(confirmRes.receipt!.receiptNumber.startsWith("MOSA-REC-"));
    logPass(`Business activated! Receipt: ${confirmRes.receipt!.receiptNumber}`);

    // Verify business activated in DB
    const updatedBiz = await prisma.business.findUnique({ where: { id: testBusiness.id } });
    assert.strictEqual(updatedBiz?.status, "ACTIVE");
    assert.strictEqual(updatedBiz?.renewalStatus, "CURRENT");
    logPass("Business status transitioned to ACTIVE with 12-month renewal validity");

    // ------------------------------------------------------------------------
    // SCENARIO 6: Settlement Payout (Cashout) to Airtel Money 0729974065
    // ------------------------------------------------------------------------
    console.log("\n▶ SCENARIO 6: CASHOUT (PAYOUT) TO MOSA AIRTEL SIM 0729974065");
    const cashoutRes = await initiatePaypackCashout({
      amount: pMtn.feeAmount ?? 5000,
      destinationPhone: "0729974065",
      paymentReference: pMtn.paymentReference!,
    });

    assert.strictEqual(cashoutRes.success, true);
    assert.strictEqual(cashoutRes.destinationPhone, "0729974065");
    assert.strictEqual(cashoutRes.status, "successful");
    assert(cashoutRes.ref.length > 5);
    logPass(`Payout of ${pMtn.feeAmount ?? 5000} RWF successfully directed to Airtel SIM 0729974065 (Ref: ${cashoutRes.ref})`);

    // Verify cashout webhook audit recording
    const cashoutWebhookPayload = {
      event_id: `evt_out_${Date.now()}`,
      kind: "transaction:processed",
      data: {
        ref: cashoutRes.ref,
        kind: "CASHOUT",
        amount: pMtn.feeAmount ?? 5000,
        client: "0729974065",
        fee: 60,
        status: "successful",
        processed_at: new Date().toISOString(),
      },
    };

    const cashoutParse = parsePaypackWebhookPayload(cashoutWebhookPayload);
    assert.strictEqual(cashoutParse.isValid, true);
    assert.strictEqual(cashoutParse.kind, "CASHOUT");
    logPass("Cashout webhook event parsed accurately as CASHOUT to Airtel receiver 0729974065");

    console.log("\n==========================================================================");
    console.log(`  PAYPACK PILOT VERIFICATION SUITE COMPLETE: ${passedCount} PASSED, 0 FAILED`);
    console.log("==========================================================================\n");
  } finally {
    // Cleanup test records
    await prisma.business.deleteMany({
      where: { ownerId: testOwner.id },
    }).catch(() => null);
    await prisma.user.delete({ where: { id: testOwner.id } }).catch(() => null);
  }
}

runPaypackSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test Suite Failed:", err);
    process.exit(1);
  });
