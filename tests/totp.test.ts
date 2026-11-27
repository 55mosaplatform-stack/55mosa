import assert from "assert";
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
  base32Encode,
  base32Decode,
  generateOtpAuthUri,
} from "../src/lib/security/totp";

async function runTotpTests() {
  console.log("=== 55 MOSA TOTP & RECOVERY ENGINE TEST SUITE ===");

  // 1. Base32 Roundtrip
  const testBuffer = Buffer.from("Hello 55 MOSA Platform Secure Auth 2026!", "utf8");
  const encoded = base32Encode(testBuffer);
  const decoded = base32Decode(encoded);
  assert.strictEqual(testBuffer.toString("utf8"), decoded.toString("utf8"), "Base32 roundtrip failed");
  console.log("✔ Test 1: Base32 encode & decode roundtrip verified");

  // 2. Secret generation
  const secret = generateTotpSecret(20);
  assert.ok(secret && secret.length >= 32, "Secret must be at least 32 characters in base32");
  console.log("✔ Test 2: Cryptographic Base32 secret generation verified:", secret);

  // 3. OTP Auth URI
  const uri = generateOtpAuthUri(secret, "admin@55mosa.com", "55 MOSA");
  assert.ok(uri.startsWith("otpauth://totp/55%20MOSA:admin%4055mosa.com?secret="));
  console.log("✔ Test 3: OTPAuth URI generated correctly");

  // 4. Code Generation
  const time = 1795817000000;
  const code = generateTotpCode(secret, time);
  assert.strictEqual(code.length, 6, "Code must be 6 digits");
  assert.ok(/^\d{6}$/.test(code), "Code must be numeric");
  console.log("✔ Test 4: 6-digit TOTP code generated:", code);

  // 5. Code Verification (in-window)
  const verifyCurrent = verifyTotpCode(secret, code, { timeMs: time });
  assert.strictEqual(verifyCurrent.isValid, true, "Current step code must be valid");
  assert.ok(verifyCurrent.step != null);
  console.log("✔ Test 5: In-window verification succeeded at step:", verifyCurrent.step);

  // 6. Clock Drift Window (+/- 30s)
  const driftCodePast = generateTotpCode(secret, time - 25000); // 25s ago
  const verifyPast = verifyTotpCode(secret, driftCodePast, { timeMs: time, window: 1 });
  assert.strictEqual(verifyPast.isValid, true, "Past step within window must be valid");

  const driftCodeFuture = generateTotpCode(secret, time + 25000); // 25s future
  const verifyFuture = verifyTotpCode(secret, driftCodeFuture, { timeMs: time, window: 1 });
  assert.strictEqual(verifyFuture.isValid, true, "Future step within window must be valid");
  console.log("✔ Test 6: Clock drift tolerance (+/- 30s) verified");

  // 7. Invalid Code Rejection
  const badCode = "000000" === code ? "111111" : "000000";
  const verifyBad = verifyTotpCode(secret, badCode, { timeMs: time });
  assert.strictEqual(verifyBad.isValid, false, "Invalid code must be rejected");
  console.log("✔ Test 7: Invalid code strictly rejected");

  // 8. Replay Attack Prevention
  const replayResult = verifyTotpCode(secret, code, {
    timeMs: time,
    lastUsedStep: verifyCurrent.step,
  });
  assert.strictEqual(replayResult.isValid, false, "Replayed code from same step must be rejected");
  assert.ok(replayResult.reason?.includes("replay"));
  console.log("✔ Test 8: Replay attack prevention verified (token reuse rejected)");

  // 9. Emergency Recovery Codes Generation
  const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
  assert.strictEqual(plainCodes.length, 8);
  assert.strictEqual(hashedCodes.length, 8);
  assert.ok(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(plainCodes[0]));
  console.log("✔ Test 9: 8 Emergency recovery codes generated:", plainCodes[0], "...");

  // 10. Recovery Code Verification and Consumption
  const codeToUse = plainCodes[0];
  const consume1 = verifyAndConsumeRecoveryCode(codeToUse, hashedCodes);
  assert.strictEqual(consume1.isValid, true, "Valid recovery code must be accepted");
  assert.strictEqual(consume1.remainingHashedCodes.length, 7, "Used recovery code must be consumed");

  // 11. Consumed Recovery Code Replay Rejection
  const consume2 = verifyAndConsumeRecoveryCode(codeToUse, consume1.remainingHashedCodes);
  assert.strictEqual(consume2.isValid, false, "Consumed recovery code must be rejected on second use");
  console.log("✔ Test 10 & 11: Single-use consumption & replay defense on recovery codes verified");

  console.log("\n=================================================");
  console.log("ALL 11 TOTP & RECOVERY SECURITY TESTS PASSED!");
  console.log("=================================================");
}

runTotpTests().catch((err) => {
  console.error("TOTP Test FAILED:", err);
  process.exit(1);
});
