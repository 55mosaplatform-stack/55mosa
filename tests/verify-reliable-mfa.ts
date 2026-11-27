import { POST as adminLoginRoute } from "../src/app/api/admin/auth/login/route";
import { POST as mfaSetupRoute } from "../src/app/api/admin/auth/mfa/setup/route";
import { POST as mfaVerifySetupRoute } from "../src/app/api/admin/auth/mfa/verify-setup/route";
import { GET as mfaStatusRoute } from "../src/app/api/admin/auth/mfa/status/route";
import { POST as mfaDisableRoute } from "../src/app/api/admin/auth/mfa/disable/route";
import { POST as mfaRegenerateCodesRoute } from "../src/app/api/admin/auth/mfa/regenerate-recovery-codes/route";
import { prisma } from "../src/lib/prisma";
import { hashPassword, createSessionToken } from "../src/lib/auth";
import { generateTotpCode } from "../src/lib/security/totp";
import { Role } from "@prisma/client";
import { NextRequest } from "next/server";

async function runMfaVerificationSuite() {
  console.log("==========================================================================");
  console.log("55 MOSA — RELIABLE ADMINISTRATOR MFA & RECOVERY TEST SUITE");
  console.log("Timestamp:", new Date().toISOString());
  console.log("==========================================================================\n");

  const runId = Math.floor(100000 + Math.random() * 900000).toString();
  const testPassword = "AdminSecurePassword@2026!";
  const pwdHash = await hashPassword(testPassword);
  const createdUserIds: string[] = [];

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = "") {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      if (detail) console.log(`       Evidence: ${detail}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      failed++;
    }
  }

  // Helper to create synthetic NextRequest with isolated IP per test step to avoid cross-test throttling
  function makeReq(
    url: string,
    method: "GET" | "POST",
    body?: any,
    cookieToken?: string,
    ipSuffix = 1
  ): NextRequest {
    const headers = new Headers();
    if (body) headers.set("Content-Type", "application/json");
    if (cookieToken) headers.set("Cookie", `mosa_session=${cookieToken}`);
    headers.set("x-forwarded-for", `10.55.${ipSuffix}.${runId.slice(0, 3)}`);

    const req = new NextRequest(new URL(url, "http://localhost:3000"), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (cookieToken) {
      req.cookies.set("mosa_session", cookieToken);
    }
    return req;
  }

  try {
    // -----------------------------------------------------------------------
    // Setup Temporary Super Admin for Isolated MFA Testing
    // -----------------------------------------------------------------------
    const adminUser = await prisma.user.create({
      data: {
        name: `Test MFA Admin ${runId}`,
        phone: `+250789${runId.slice(0, 6)}`,
        email: `test.mfa.admin.${runId}@55mosa.test`,
        role: Role.SUPER_ADMIN,
        passwordHash: pwdHash,
        status: "ACTIVE",
        referralCode: `MOSA-MFA-${runId}`,
      },
    });
    createdUserIds.push(adminUser.id);

    // Initial session for adminUser
    const sessionToken = await createSessionToken({
      userId: adminUser.id,
      phone: adminUser.phone,
      email: adminUser.email,
      role: adminUser.role,
      name: adminUser.name,
    });
    await prisma.session.create({
      data: {
        userId: adminUser.id,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    console.log("▶ TEST 1: Unenrolled Administrator Password Login (Fallback Safety)");
    const loginReq1 = makeReq("http://localhost:3000/api/admin/auth/login", "POST", {
      identifier: adminUser.email,
      password: testPassword,
    }, undefined, 1);
    const res1 = await adminLoginRoute(loginReq1);
    const body1 = await res1.json();
    assert(res1.status === 200, "Unenrolled admin login succeeds with HTTP 200", `Status: ${res1.status}`);
    assert(body1.success === true, "Response confirms success: true");
    assert(!body1.mfaRequired, "No mandatory MFA lockout for unenrolled administrator");
    assert(body1.mfaEnrollmentRecommended === true, "MFA enrollment recommendation flagged");

    console.log("\n▶ TEST 2: MFA Setup Initiation (Secret & Recovery Codes Generation)");
    const setupReq = makeReq("http://localhost:3000/api/admin/auth/mfa/setup", "POST", {}, sessionToken, 2);
    const setupRes = await mfaSetupRoute(setupReq);
    const setupBody = await setupRes.json();
    assert(setupRes.status === 200, "MFA setup returns HTTP 200", `Status: ${setupRes.status}`);
    assert(Boolean(setupBody.secret && setupBody.secret.length >= 32), "Base32 secret generated");
    assert(Boolean(setupBody.otpauthUri?.startsWith("otpauth://totp/")), "otpauth URI formatted");
    assert(Array.isArray(setupBody.recoveryCodes) && setupBody.recoveryCodes.length === 8, "8 recovery codes generated");

    console.log("\n▶ TEST 3: MFA Setup Verification (Activation with Authenticator Code)");
    const validSetupTotp = generateTotpCode(setupBody.secret);
    const verifySetupReq = makeReq(
      "http://localhost:3000/api/admin/auth/mfa/verify-setup",
      "POST",
      {
        setupToken: setupBody.setupToken,
        code: validSetupTotp,
      },
      sessionToken,
      3
    );
    const verifySetupRes = await mfaVerifySetupRoute(verifySetupReq);
    const verifySetupBody = await verifySetupRes.json();
    assert(verifySetupRes.status === 200, "MFA activation returns HTTP 200", `Status: ${verifySetupRes.status}`);
    assert(verifySetupBody.success === true, "MFA successfully activated");

    // Verify database record
    const profile = await prisma.adminMfaProfile.findUnique({ where: { userId: adminUser.id } });
    assert(profile?.totpEnabled === true, "AdminMfaProfile persisted in PostgreSQL with totpEnabled: true");
    assert(profile?.recoveryCodes.length === 8, "8 hashed recovery codes stored in PostgreSQL");

    // Simulate enrollment having occurred earlier so subsequent logins can proceed cleanly
    const currentStep = BigInt(Math.floor(Date.now() / 1000 / 30));
    await prisma.adminMfaProfile.update({
      where: { userId: adminUser.id },
      data: { lastUsedStep: currentStep - 2n },
    });

    console.log("\n▶ TEST 4: MFA Status API Check");
    const statusReq = makeReq("http://localhost:3000/api/admin/auth/mfa/status", "GET", null, sessionToken, 4);
    const statusRes = await mfaStatusRoute(statusReq);
    const statusBody = await statusRes.json();
    assert(statusBody.mfa.totpEnabled === true, "MFA status confirms totpEnabled: true");
    assert(statusBody.mfa.recoveryCodesCount === 8, "MFA status confirms 8 recovery codes active");

    console.log("\n▶ TEST 5: Password-Only Login Triggering Two-Factor Challenge");
    const loginReq2 = makeReq("http://localhost:3000/api/admin/auth/login", "POST", {
      identifier: adminUser.email,
      password: testPassword,
    }, undefined, 5);
    const res2 = await adminLoginRoute(loginReq2);
    const body2 = await res2.json();
    assert(res2.status === 200, "Login returns HTTP 200 challenge", `Status: ${res2.status}`);
    assert(body2.mfaRequired === true, "Challenge flag mfaRequired: true returned");
    assert(body2.mfaType === "TOTP", "mfaType is TOTP");
    assert(!res2.headers.get("set-cookie"), "No session cookie issued before second factor");

    console.log("\n▶ TEST 6: Invalid Authenticator Code Rejection");
    const badTotpReq = makeReq("http://localhost:3000/api/admin/auth/login", "POST", {
      identifier: adminUser.email,
      password: testPassword,
      totpCode: "000000",
    }, undefined, 6);
    const badTotpRes = await adminLoginRoute(badTotpReq);
    assert(badTotpRes.status === 401, "Bad TOTP code rejected with HTTP 401", `Status: ${badTotpRes.status}`);

    console.log("\n▶ TEST 7: Successful TOTP Code Authentication & Session Issue");
    const validTotp = generateTotpCode(setupBody.secret);
    const goodTotpReq = makeReq("http://localhost:3000/api/admin/auth/login", "POST", {
      identifier: adminUser.email,
      password: testPassword,
      totpCode: validTotp,
    }, undefined, 7);
    const goodTotpRes = await adminLoginRoute(goodTotpReq);
    const goodTotpBody = await goodTotpRes.json();
    assert(goodTotpRes.status === 200, "Valid TOTP login returns HTTP 200", `Status: ${goodTotpRes.status}, Error: ${goodTotpBody.error || "None"}`);
    assert(goodTotpBody.success === true, "Login confirmed success: true");
    assert(!goodTotpBody.mfaRequired, "MFA completed successfully");

    console.log("\n▶ TEST 8: Replay Attack Defense (Token Reuse Rejection)");
    const replayReq = makeReq("http://localhost:3000/api/admin/auth/login", "POST", {
      identifier: adminUser.email,
      password: testPassword,
      totpCode: validTotp,
    }, undefined, 8);
    const replayRes = await adminLoginRoute(replayReq);
    const replayBody = await replayRes.json();
    assert(replayRes.status === 401, "Replayed TOTP code rejected with HTTP 401", `Status: ${replayRes.status}`);
    assert(replayBody.error?.toLowerCase().includes("replay"), "Replay defense error message returned");

    console.log("\n▶ TEST 9: Emergency Recovery Code Authentication & Single-Use Consumption");
    const recoveryToUse = setupBody.recoveryCodes[0];
    const recoveryReq = makeReq("http://localhost:3000/api/admin/auth/login", "POST", {
      identifier: adminUser.email,
      password: testPassword,
      recoveryCode: recoveryToUse,
    }, undefined, 9);
    const recoveryRes = await adminLoginRoute(recoveryReq);
    const recoveryBody = await recoveryRes.json();
    assert(recoveryRes.status === 200, "Valid recovery code returns HTTP 200", `Status: ${recoveryRes.status}, Error: ${recoveryBody.error || "None"}`);
    assert(recoveryBody.success === true, "Recovery code login succeeded");

    // Verify recovery code was consumed in DB (now 7 remaining)
    const updatedProfile = await prisma.adminMfaProfile.findUnique({ where: { userId: adminUser.id } });
    assert(updatedProfile?.recoveryCodes.length === 7, "Used recovery code permanently consumed (7 remaining)");

    console.log("\n▶ TEST 10: Consumed Recovery Code Replay Rejection");
    const replayedRecoveryReq = makeReq("http://localhost:3000/api/admin/auth/login", "POST", {
      identifier: adminUser.email,
      password: testPassword,
      recoveryCode: recoveryToUse,
    }, undefined, 10);
    const replayedRecoveryRes = await adminLoginRoute(replayedRecoveryReq);
    assert(replayedRecoveryRes.status === 401, "Already used recovery code strictly rejected with HTTP 401", `Status: ${replayedRecoveryRes.status}`);

    console.log("\n▶ TEST 11: Regenerate Emergency Recovery Codes");
    // Ensure lastUsedStep allows TOTP verification for management action
    await prisma.adminMfaProfile.update({
      where: { userId: adminUser.id },
      data: { lastUsedStep: currentStep - 2n },
    });
    const regenTotp = generateTotpCode(setupBody.secret);
    const regenReq = makeReq(
      "http://localhost:3000/api/admin/auth/mfa/regenerate-recovery-codes",
      "POST",
      {
        password: testPassword,
        code: regenTotp,
      },
      sessionToken,
      11
    );
    const regenRes = await mfaRegenerateCodesRoute(regenReq);
    const regenBody = await regenRes.json();
    assert(regenRes.status === 200, "Regenerate recovery codes returns HTTP 200", `Status: ${regenRes.status}, Error: ${regenBody.error || "None"}`);
    assert(Array.isArray(regenBody.recoveryCodes) && regenBody.recoveryCodes.length === 8, "8 new recovery codes returned");

    console.log("\n▶ TEST 12: Disable MFA (Clean Teardown)");
    // Ensure lastUsedStep allows TOTP verification for disable action
    await prisma.adminMfaProfile.update({
      where: { userId: adminUser.id },
      data: { lastUsedStep: currentStep - 2n },
    });
    const disableTotp = generateTotpCode(setupBody.secret);
    const disableReq = makeReq(
      "http://localhost:3000/api/admin/auth/mfa/disable",
      "POST",
      {
        password: testPassword,
        code: disableTotp,
      },
      sessionToken,
      12
    );
    const disableRes = await mfaDisableRoute(disableReq);
    const disableBody = await disableRes.json();
    assert(disableRes.status === 200, "Disable MFA returns HTTP 200", `Status: ${disableRes.status}, Error: ${disableBody.error || "None"}`);
    assert(disableBody.success === true, "MFA successfully disabled");

    const finalProfile = await prisma.adminMfaProfile.findUnique({ where: { userId: adminUser.id } });
    assert(finalProfile?.totpEnabled === false, "AdminMfaProfile reflects totpEnabled: false");

    console.log("\n==========================================================================");
    console.log(`RELIABLE MFA VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log("==========================================================================\n");
  } finally {
    console.log("▶ Cleaning up test accounts...");
    if (createdUserIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => null);
      await prisma.adminMfaProfile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => null);
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => null);
    }
    console.log("✔ Cleaned up temporary test data. Existing production data intact.");
  }
}

runMfaVerificationSuite().catch((err) => {
  console.error("MFA Test Suite FAILED:", err);
  process.exit(1);
});
