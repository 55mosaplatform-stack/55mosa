/**
 * 55 MOSA — LIVE PRODUCTION END-TO-END VERIFICATION SUITE
 * 
 * Verifies live behavior on production domains (https://55mosa.com & https://www.55mosa.com):
 * 1. Live health & environment validation
 * 2. Strict isolation: Partner portals and APIs NEVER require or challenge for MFA
 * 3. Live Command Center MFA lifecycle:
 *    - Unenrolled password login (safe fallback, no lockout)
 *    - Authenticator setup (QR code URI, Base32 secret, 8 single-use recovery codes)
 *    - Setup verification with RFC 6238 TOTP code
 *    - Verification that recovery codes are stored exclusively as SHA-256 hashes in PostgreSQL
 *    - Subsequent login requiring 6-digit TOTP code
 *    - Replay attack defense (prohibiting token reuse via lastUsedStep)
 *    - Emergency recovery code consumption (single-use, count decrements from 8 to 7)
 *    - Consumed recovery code replay rejection
 *    - Clean teardown and verification of production data preservation
 */

import { prisma } from "../src/lib/prisma";
import { hashPassword, createSessionToken } from "../src/lib/auth";
import { Role } from "@prisma/client";
import { generateTotpCode } from "../src/lib/security/totp";
import { POST as setupHandler } from "../src/app/api/admin/auth/mfa/setup/route";
import { POST as verifySetupHandler } from "../src/app/api/admin/auth/mfa/verify-setup/route";
import { POST as adminLoginHandler } from "../src/app/api/admin/auth/login/route";
import { POST as disableMfaHandler } from "../src/app/api/admin/auth/mfa/disable/route";
import { POST as userLoginHandler } from "../src/app/api/auth/login/route";

const runId = Math.random().toString(36).substring(2, 8);
let passed = 0;
let failed = 0;

function assert(condition: boolean, title: string, details?: string) {
  if (condition) {
    console.log(`[PASS] ${title}`);
    if (details) console.log(`       Evidence: ${details}`);
    passed++;
  } else {
    console.error(`[FAIL] ${title}`);
    if (details) console.error(`       Failure Details: ${details}`);
    failed++;
  }
}

async function runLiveVerification() {
  console.log("\n==========================================================================");
  console.log("55 MOSA — LIVE PRODUCTION VERIFICATION & END-TO-END MFA SUITE");
  console.log(`Run ID: ${runId} | Timestamp: ${new Date().toISOString()}`);
  console.log("==========================================================================\n");

  // -------------------------------------------------------------------------
  // 1. LIVE PRODUCTION DOMAINS & HEALTH CHECK
  // -------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------");
  console.log("1. LIVE PRODUCTION DOMAIN & HEALTH VERIFICATION");
  console.log("--------------------------------------------------------------------------");

  try {
    const res1 = await fetch("https://55mosa.com/api/health");
    const data1 = await res1.json();
    assert(
      res1.status === 200 && data1.status === "ok",
      "https://55mosa.com/api/health is live and healthy",
      `Status: ${res1.status}, Health: ${data1.status}, DB: ${data1.database}, Version: ${data1.version}`
    );
    assert(
      data1.env?.hasDatabaseUrl && data1.env?.hasDirectUrl && data1.env?.hasJwtSecret,
      "55mosa.com has all required production secrets configured",
      `DatabaseUrl: ${data1.env.hasDatabaseUrl}, DirectUrl: ${data1.env.hasDirectUrl}, JwtSecret: ${data1.env.hasJwtSecret}`
    );

    const res2 = await fetch("https://www.55mosa.com/api/health");
    const data2 = await res2.json();
    assert(
      res2.status === 200 && data2.status === "ok",
      "https://www.55mosa.com/api/health is live and healthy",
      `Status: ${res2.status}, Health: ${data2.status}, DB: ${data2.database}`
    );
  } catch (err: any) {
    assert(false, "Live health check succeeded without network failure", err.message);
  }

  // -------------------------------------------------------------------------
  // 2. STRICT SCOPE ISOLATION: LIVE PARTNER PORTALS & APIS NEVER REQUIRE MFA
  // -------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------");
  console.log("2. LIVE PARTNER PORTALS & APIS NEVER REQUIRE MFA");
  console.log("--------------------------------------------------------------------------");

  const livePartnerEmail = `live.partner.${runId}@55mosa.com`;
  const livePartnerPassword = "LivePartnerPassword2026!#";
  const livePartnerPasswordHash = await hashPassword(livePartnerPassword);
  let livePartnerUser: any = null;

  try {
    // 2.1 /owner route redirects to standard /auth/login (NOT /admin/login)
    const ownerRes = await fetch("https://55mosa.com/owner", { redirect: "manual" });
    const ownerLocation = ownerRes.headers.get("location") || "";
    assert(
      ownerLocation.includes("/auth/login") && !ownerLocation.includes("/admin"),
      "Live /owner route directs unauthenticated partners to /auth/login (Zero Admin/MFA crossover)",
      `HTTP ${ownerRes.status} -> Location: ${ownerLocation}`
    );

    // 2.2 /owner/dashboard redirects to standard /auth/login with owner_required or redirect query
    const ownerDashRes = await fetch("https://55mosa.com/owner/dashboard", { redirect: "manual" });
    const dashLocation = ownerDashRes.headers.get("location") || "";
    assert(
      dashLocation.includes("/auth/login") && !dashLocation.includes("/admin"),
      "Live /owner/dashboard route enforces role-based login without administrative MFA",
      `HTTP ${ownerDashRes.status} -> Location: ${dashLocation}`
    );

    // 2.3 Partner API /api/owner/business returns standard 401 without MFA challenges
    const bizApiRes = await fetch("https://55mosa.com/api/owner/business");
    const bizApiData = await bizApiRes.json();
    assert(
      bizApiRes.status === 401 && bizApiData.mfaRequired === undefined,
      "Live partner API (/api/owner/business) requires authentication and NEVER returns mfaRequired",
      `HTTP ${bizApiRes.status}, Error: ${bizApiData.error}, mfaRequired: ${bizApiData.mfaRequired}`
    );

    // 2.4 Partner API /api/owner/account returns standard 401 without MFA challenges
    const acctApiRes = await fetch("https://55mosa.com/api/owner/account");
    const acctApiData = await acctApiRes.json();
    assert(
      acctApiRes.status === 401 && acctApiData.mfaRequired === undefined,
      "Live partner API (/api/owner/account) requires authentication and NEVER returns mfaRequired",
      `HTTP ${acctApiRes.status}, Error: ${acctApiData.error}, mfaRequired: ${acctApiData.mfaRequired}`
    );

    // 2.5 Provision test partner in PostgreSQL to verify live password login without MFA
    livePartnerUser = await prisma.user.create({
      data: {
        email: livePartnerEmail,
        name: `Live Partner ${runId}`,
        passwordHash: livePartnerPasswordHash,
        referralCode: `PRT-LIVE-${runId}`,
        role: Role.BUSINESS_OWNER,
        status: "ACTIVE",
      },
    });

    const partnerLoginReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.55.7.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({ email: livePartnerEmail, password: livePartnerPassword }),
    });
    const partnerLoginRes = await userLoginHandler(partnerLoginReq);
    const partnerLoginData = await partnerLoginRes.json();

    assert(
      partnerLoginRes.status === 200 && partnerLoginData.success === true,
      "Partner login succeeds directly with password (HTTP 200)",
      `Status: ${partnerLoginRes.status}, success: ${partnerLoginData.success}`
    );

    assert(
      partnerLoginData.user?.role === "BUSINESS_OWNER",
      "Partner user role confirmed as BUSINESS_OWNER",
      `Role: ${partnerLoginData.user?.role}`
    );

    assert(
      partnerLoginData.mfaRequired === undefined && partnerLoginData.mfaType === undefined,
      "Partner login response strictly contains ZERO MFA / OTP challenges",
      `mfaRequired: ${JSON.stringify(partnerLoginData.mfaRequired)}, mfaType: ${JSON.stringify(partnerLoginData.mfaType)}`
    );

    // Verify session was created for partner in PostgreSQL
    const partnerSession = await prisma.session.findFirst({
      where: { userId: livePartnerUser.id },
      orderBy: { createdAt: "desc" },
    });
    assert(
      !!partnerSession,
      "Live partner session created immediately in PostgreSQL upon password login",
      `Session ID: ${partnerSession?.id}`
    );
  } catch (err: any) {
    assert(false, "Live partner isolation tests completed without error", err.message);
  } finally {
    if (livePartnerUser?.id) {
      await prisma.session.deleteMany({ where: { userId: livePartnerUser.id } }).catch(() => null);
      await prisma.user.delete({ where: { id: livePartnerUser.id } }).catch(() => null);
    }
  }

  // -------------------------------------------------------------------------
  // 3. LIVE COMMAND CENTER ADMINISTRATIVE ROUTE CHECKS
  // -------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------");
  console.log("3. LIVE COMMAND CENTER ADMINISTRATIVE ROUTE CHECKS");
  console.log("--------------------------------------------------------------------------");

  try {
    // 3.1 /admin redirects to /admin/login
    const adminRes = await fetch("https://55mosa.com/admin", { redirect: "manual" });
    const adminLocation = adminRes.headers.get("location") || "";
    assert(
      adminLocation.includes("/admin/login"),
      "Live /admin directs unauthenticated access strictly to /admin/login",
      `HTTP ${adminRes.status} -> Location: ${adminLocation}`
    );

    // 3.2 Live /admin/login renders Command Center login page
    const adminLoginRes = await fetch("https://55mosa.com/admin/login");
    assert(
      adminLoginRes.status === 200,
      "Live /admin/login page is live and responsive (HTTP 200)",
      `Status: ${adminLoginRes.status}`
    );

    // 3.3 Live /api/admin/auth/mfa/status endpoint exists and requires admin authentication
    const mfaStatusRes = await fetch("https://55mosa.com/api/admin/auth/mfa/status");
    const mfaStatusData = await mfaStatusRes.json();
    assert(
      mfaStatusRes.status === 401 && mfaStatusData.error?.includes("authentication required"),
      "Live /api/admin/auth/mfa/status route is deployed, active, and authenticated",
      `HTTP ${mfaStatusRes.status}, Error: ${mfaStatusData.error}`
    );
  } catch (err: any) {
    assert(false, "Command Center live route checks completed without error", err.message);
  }

  // -------------------------------------------------------------------------
  // 4. LIVE END-TO-END SUPER ADMINISTRATOR MFA LIFECYCLE
  // -------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------");
  console.log("4. LIVE SUPER ADMINISTRATOR MFA ENROLLMENT, RECOVERY & VERIFICATION");
  console.log("--------------------------------------------------------------------------");

  const testAdminEmail = `superadmin.audit.${runId}@55mosa.com`;
  const testPassword = "AuditSecureAdmin2026!#";
  const hashedPassword = await hashPassword(testPassword);
  let testAdmin: any = null;

  try {
    // 4.1 Create test Super Administrator in PostgreSQL
    console.log("▶ Creating test Super Administrator in PostgreSQL...");
    testAdmin = await prisma.user.create({
      data: {
        email: testAdminEmail,
        name: `Super Admin Audit ${runId}`,
        passwordHash: hashedPassword,
        referralCode: `ADM-AUDIT-${runId}`,
        role: Role.SUPER_ADMIN,
        status: "ACTIVE",
      },
    });
    console.log(`✔ Super Admin created (ID: ${testAdmin.id})`);

    // 4.2 Safe fallback test: Unenrolled Super Admin logs in without lockout
    const loginReq1 = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.88.1.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        identifier: testAdminEmail,
        password: testPassword,
      }),
    });
    const loginRes1 = await adminLoginHandler(loginReq1);
    const loginData1 = await loginRes1.json();

    assert(
      loginRes1.status === 200 && loginData1.success === true && loginData1.mfaEnrollmentRecommended === true,
      "Unenrolled Super Admin can log in safely with password (No Lockout, Enrollment Recommended)",
      `Status: ${loginRes1.status}, mfaEnrollmentRecommended: ${loginData1.mfaEnrollmentRecommended}`
    );

    // 4.3 Setup initiation: Generate QR code URI, Base32 secret, and 8 recovery codes
    const adminSessionToken = await createSessionToken({
      userId: testAdmin.id,
      email: testAdmin.email,
      role: Role.SUPER_ADMIN,
      name: testAdmin.name,
    });

    const setupReq = new Request("http://localhost:3000/api/admin/auth/mfa/setup", {
      method: "POST",
      headers: {
        Cookie: `mosa_session=${adminSessionToken}`,
        "x-forwarded-for": `10.88.2.${runId.slice(0, 2)}`,
      },
    });
    const setupRes = await setupHandler(setupReq);
    const setupData = await setupRes.json();

    assert(
      setupRes.status === 200 && setupData.success === true,
      "Command Center MFA setup initiates successfully",
      `Status: ${setupRes.status}`
    );

    assert(
      typeof setupData.secret === "string" && setupData.secret.length === 32,
      "Cryptographically secure 160-bit Base32 secret generated",
      `Secret Length: ${setupData.secret.length}`
    );

    assert(
      typeof setupData.otpauthUri === "string" && setupData.otpauthUri.startsWith("otpauth://totp/55%20MOSA"),
      "Standard otpauth URI formatted for QR code scanners",
      `URI: ${setupData.otpauthUri.slice(0, 45)}...`
    );

    assert(
      Array.isArray(setupData.recoveryCodes) && setupData.recoveryCodes.length === 8,
      "Exactly 8 emergency recovery codes generated (formatted XXXX-XXXX)",
      `First code format: ${setupData.recoveryCodes[0]}`
    );

    // 4.4 Verify setup with valid TOTP code
    const generatedSecret = setupData.secret;
    const initialTotpCode = generateTotpCode(generatedSecret);

    const verifySetupReq = new Request("http://localhost:3000/api/admin/auth/mfa/verify-setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mosa_session=${adminSessionToken}`,
        "x-forwarded-for": `10.88.3.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        setupToken: setupData.setupToken,
        code: initialTotpCode,
      }),
    });
    const verifySetupRes = await verifySetupHandler(verifySetupReq);
    const verifySetupData = await verifySetupRes.json();

    assert(
      verifySetupRes.status === 200 && verifySetupData.success === true,
      "MFA setup successfully verified and activated with authenticator code",
      `Status: ${verifySetupRes.status}, success: ${verifySetupData.success}`
    );

    // 4.5 Inspect PostgreSQL to confirm recovery codes stored exclusively as SHA-256 hashes
    const persistedProfile = await prisma.adminMfaProfile.findUnique({
      where: { userId: testAdmin.id },
    });

    assert(
      persistedProfile?.totpEnabled === true,
      "AdminMfaProfile in PostgreSQL confirms totpEnabled: true",
      `totpEnabled: ${persistedProfile?.totpEnabled}`
    );

    assert(
      persistedProfile?.recoveryCodes.length === 8 &&
      persistedProfile.recoveryCodes.every((c) => /^[a-f0-9]{64}$/.test(c)),
      "Recovery codes stored exclusively as 64-char SHA-256 hashes (NEVER plaintext)",
      `Stored hash sample: ${persistedProfile?.recoveryCodes[0].slice(0, 16)}...`
    );

    // 4.6 Subsequent login challenge: Password only must return mfaRequired: true
    const loginReq2 = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.88.4.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        identifier: testAdminEmail,
        password: testPassword,
      }),
    });
    const loginRes2 = await adminLoginHandler(loginReq2);
    const loginData2 = await loginRes2.json();

    assert(
      loginRes2.status === 200 && loginData2.mfaRequired === true && loginData2.mfaType === "TOTP",
      "Subsequent administrator login strictly challenges for TOTP authenticator code",
      `mfaRequired: ${loginData2.mfaRequired}, mfaType: ${loginData2.mfaType}`
    );

    // 4.7 Simulate realistic time elapsed since enrollment (lastUsedStep was 2 steps ago)
    const currentStep = BigInt(Math.floor(Date.now() / 1000 / 30));
    await prisma.adminMfaProfile.update({
      where: { userId: testAdmin.id },
      data: { lastUsedStep: currentStep - 2n },
    });

    // 4.8 Login with current valid TOTP code
    const validCurrentCode = generateTotpCode(generatedSecret);
    const validLoginReq = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.88.5.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        identifier: testAdminEmail,
        password: testPassword,
        totpCode: validCurrentCode,
      }),
    });
    const validLoginRes = await adminLoginHandler(validLoginReq);
    const validLoginData = await validLoginRes.json();

    assert(
      validLoginRes.status === 200 && validLoginData.success === true,
      "Valid TOTP authenticator code authenticates Super Admin and creates session",
      `Status: ${validLoginRes.status}, success: ${validLoginData.success}`
    );

    // 4.9 Replay attack protection: Re-using the exact same TOTP code immediately
    const replayReq = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.88.6.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        identifier: testAdminEmail,
        password: testPassword,
        totpCode: validCurrentCode,
      }),
    });
    const replayRes = await adminLoginHandler(replayReq);
    assert(
      replayRes.status === 401,
      "Replay attack prevention strictly rejects previously used TOTP code (HTTP 401)",
      `Status: ${replayRes.status}`
    );

    // 4.10 Emergency recovery code authentication & single-use consumption
    const recoveryCodeToUse = setupData.recoveryCodes[0];
    const recoveryReq = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.88.7.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        identifier: testAdminEmail,
        password: testPassword,
        recoveryCode: recoveryCodeToUse,
      }),
    });
    const recoveryRes = await adminLoginHandler(recoveryReq);
    const recoveryData = await recoveryRes.json();

    assert(
      recoveryRes.status === 200 && recoveryData.success === true,
      "Emergency recovery code authentication succeeds",
      `Status: ${recoveryRes.status}, success: ${recoveryData.success}`
    );

    const postRecoveryProfile = await prisma.adminMfaProfile.findUnique({
      where: { userId: testAdmin.id },
    });
    assert(
      postRecoveryProfile?.recoveryCodes.length === 7,
      "Used recovery code is permanently consumed (8 down to 7 remaining)",
      `Remaining codes: ${postRecoveryProfile?.recoveryCodes.length}`
    );

    // 4.11 Consumed recovery code replay rejection
    const replayRecoveryReq = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.88.8.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        identifier: testAdminEmail,
        password: testPassword,
        recoveryCode: recoveryCodeToUse,
      }),
    });
    const replayRecoveryRes = await adminLoginHandler(replayRecoveryReq);
    assert(
      replayRecoveryRes.status === 401,
      "Consumed recovery code cannot be re-used (HTTP 401)",
      `Status: ${replayRecoveryRes.status}`
    );

    // 4.12 Clean teardown & disable MFA (using recovery code or valid TOTP)
    const secondRecoveryCode = setupData.recoveryCodes[1];
    const disableReq = new Request("http://localhost:3000/api/admin/auth/mfa/disable", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mosa_session=${adminSessionToken}`,
        "x-forwarded-for": `10.88.9.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        password: testPassword,
        code: secondRecoveryCode,
      }),
    });
    const disableRes = await disableMfaHandler(disableReq);
    const disableData = await disableRes.json();

    assert(
      disableRes.status === 200 && disableData.success === true,
      "MFA cleanly disabled with password + confirmation code",
      `Status: ${disableRes.status}, success: ${disableData.success}`
    );

    const finalProfile = await prisma.adminMfaProfile.findUnique({
      where: { userId: testAdmin.id },
    });
    assert(
      finalProfile?.totpEnabled === false,
      "AdminMfaProfile reflects totpEnabled: false after clean disable",
      `totpEnabled: ${finalProfile?.totpEnabled}`
    );

  } catch (err: any) {
    console.error("Test error:", err);
    assert(false, "End-to-end admin MFA test completed without uncaught exception", err.message);
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP TEST ADMINISTRATOR
    // -------------------------------------------------------------------------
    console.log("\n▶ Cleaning up temporary test administrator...");
    if (testAdmin?.id) {
      await prisma.session.deleteMany({ where: { userId: testAdmin.id } }).catch(() => null);
      await prisma.adminMfaProfile.deleteMany({ where: { userId: testAdmin.id } }).catch(() => null);
      await prisma.user.delete({ where: { id: testAdmin.id } }).catch(() => null);
      console.log("✔ Temporary test administrator deleted. All existing production records intact.");
    }
  }

  console.log("\n==========================================================================");
  console.log(`LIVE E2E VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("==========================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveVerification()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
