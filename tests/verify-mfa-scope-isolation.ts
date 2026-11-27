/**
 * 55 MOSA — STRICT MFA SCOPE ISOLATION TEST SUITE
 * 
 * Operating Doctrine: IMPROVE 55 MOSA; DO NOT CHANGE 55 MOSA.
 * 
 * Verifies the strict isolation of MFA to the Command Center only:
 * 1. Command Center administrators are required to complete MFA according to role policy.
 * 2. Partner accounts (BUSINESS_OWNER) log in and access their portals without MFA.
 * 3. Partner APIs never return administrator MFA challenges.
 * 4. Public discovery and ordinary consumer authentication remain completely unaffected.
 */

import { prisma } from "../src/lib/prisma";
import { hashPassword, createSessionToken } from "../src/lib/auth";
import { Role } from "@prisma/client";
import { generateTotpSecret, generateTotpCode } from "../src/lib/security/totp";
import { POST as adminLoginHandler } from "../src/app/api/admin/auth/login/route";
import { POST as userLoginHandler } from "../src/app/api/auth/login/route";
import { GET as ownerBusinessHandler } from "../src/app/api/owner/business/route";
import { GET as healthHandler } from "../src/app/api/health/route";
import { GET as businessesHandler } from "../src/app/api/businesses/route";

const runId = Math.random().toString(36).substring(2, 8);
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    if (details) console.log(`       Evidence: ${details}`);
    testsPassed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (details) console.error(`       Failure Details: ${details}`);
    testsFailed++;
  }
}

async function runScopeIsolationTests() {
  console.log("\n==========================================================================");
  console.log("55 MOSA — STRICT MFA SCOPE ISOLATION TEST SUITE");
  console.log(`Run ID: ${runId} | Timestamp: ${new Date().toISOString()}`);
  console.log("==========================================================================\n");

  const testPassword = "MosaSecureTest2026!#";
  const hashedPassword = await hashPassword(testPassword);

  // Define test accounts
  const superAdminEmail = `test.superadmin.${runId}@55mosa.com`;
  const partnerEmail = `test.partner.${runId}@55mosa.com`;
  const consumerEmail = `test.consumer.${runId}@55mosa.com`;

  let superAdminUser: any = null;
  let partnerUser: any = null;
  let consumerUser: any = null;
  let partnerBusiness: any = null;

  try {
    // -------------------------------------------------------------------------
    // SETUP TEST ENTITIES IN POSTGRESQL
    // -------------------------------------------------------------------------
    console.log("▶ Setting up test users...");

    // 1. Super Admin with MFA Enrolled
    const totpSecret = generateTotpSecret();
    superAdminUser = await prisma.user.create({
      data: {
        email: superAdminEmail,
        name: `Super Admin ${runId}`,
        passwordHash: hashedPassword,
        referralCode: `ADM-${runId}`,
        role: Role.SUPER_ADMIN,
        status: "ACTIVE",
        mfaProfile: {
          create: {
            totpSecret,
            totpEnabled: true,
            lastUsedStep: BigInt(0),
          },
        },
      },
      include: { mfaProfile: true },
    });

    // 2. Partner (BUSINESS_OWNER) - No MFA
    partnerUser = await prisma.user.create({
      data: {
        email: partnerEmail,
        name: `Partner Merchant ${runId}`,
        passwordHash: hashedPassword,
        referralCode: `BIZ-${runId}`,
        role: Role.BUSINESS_OWNER,
        status: "ACTIVE",
      },
    });

    // Create a mock business for the partner
    partnerBusiness = await prisma.business.create({
      data: {
        name: `Partner Enterprise ${runId}`,
        description: "Premier retail outlet in Kigali",
        category: "shop_retail",
        phone: `+250788${Math.floor(100000 + Math.random() * 900000)}`,
        email: partnerEmail,
        owner: { connect: { id: partnerUser.id } },
        streetName: "Kigali Market Plaza",
        latitude: -1.9441,
        longitude: 30.0619,
      },
    });

    // 3. Consumer (CUSTOMER) - Standard user
    consumerUser = await prisma.user.create({
      data: {
        email: consumerEmail,
        name: `Customer Shopper ${runId}`,
        passwordHash: hashedPassword,
        referralCode: `CUS-${runId}`,
        role: Role.CUSTOMER,
        status: "ACTIVE",
      },
    });

    console.log("✔ Test entities successfully provisioned.\n");

    // =========================================================================
    // SECTION 1: COMMAND CENTER ADMINISTRATORS ARE REQUIRED TO COMPLETE MFA
    // =========================================================================
    console.log("--------------------------------------------------------------------------");
    console.log("SECTION 1: Command Center Administrator MFA Enforcement");
    console.log("--------------------------------------------------------------------------");

    // 1.1 Super Admin password-only login must trigger MFA challenge
    const adminReq1 = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.55.1.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        identifier: superAdminEmail,
        password: testPassword,
      }),
    });

    const adminRes1 = await adminLoginHandler(adminReq1);
    const adminData1 = await adminRes1.json();

    assert(
      adminRes1.status === 200 && adminData1.mfaRequired === true,
      "Super Admin login requires MFA challenge (mfaRequired: true)",
      `Status: ${adminRes1.status}, mfaRequired: ${adminData1.mfaRequired}`
    );

    assert(
      adminData1.mfaType === "TOTP",
      "Super Admin MFA challenge type is TOTP authenticator",
      `mfaType: ${adminData1.mfaType}`
    );

    const adminCookie1 = adminRes1.headers.get("set-cookie") || "";
    assert(
      !adminCookie1.includes("mosa_session"),
      "No session cookie issued to administrator prior to MFA completion",
      `Cookies issued: ${adminCookie1 ? "Yes" : "None (Secure)"}`
    );

    // 1.2 Invalid TOTP code must be strictly rejected
    const adminReq2 = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.55.2.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        identifier: superAdminEmail,
        password: testPassword,
        totpCode: "000000",
      }),
    });

    const adminRes2 = await adminLoginHandler(adminReq2);
    assert(
      adminRes2.status === 401,
      "Invalid authenticator code is rejected with HTTP 401",
      `Status: ${adminRes2.status}`
    );

    // 1.3 Valid TOTP code successfully completes login and issues session
    const currentCode = generateTotpCode(totpSecret);
    const adminReq3 = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.55.3.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        identifier: superAdminEmail,
        password: testPassword,
        totpCode: currentCode,
      }),
    });

    const adminRes3 = await adminLoginHandler(adminReq3);
    const adminData3 = await adminRes3.json();

    assert(
      adminRes3.status === 200 && adminData3.success === true,
      "Valid TOTP authenticator code allows Super Admin access",
      `Status: ${adminRes3.status}, success: ${adminData3.success}`
    );

    const adminDbSession = await prisma.session.findFirst({
      where: { userId: superAdminUser.id },
      orderBy: { createdAt: "desc" },
    });
    assert(
      !!adminDbSession,
      "Administrator session issued upon successful MFA completion",
      `Session ID: ${adminDbSession?.id || "None"}`
    );

    // =========================================================================
    // SECTION 2: PARTNER ACCOUNTS (BUSINESS_OWNER) LOG IN WITHOUT MFA
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log("SECTION 2: Partner Accounts (BUSINESS_OWNER) Login Without MFA");
    console.log("--------------------------------------------------------------------------");

    const partnerReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.55.4.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        email: partnerEmail,
        password: testPassword,
      }),
    });

    const partnerRes = await userLoginHandler(partnerReq);
    const partnerData = await partnerRes.json();

    assert(
      partnerRes.status === 200 && partnerData.success === true,
      "Partner login succeeds directly with password (HTTP 200)",
      `Status: ${partnerRes.status}, success: ${partnerData.success}`
    );

    assert(
      partnerData.user?.role === "BUSINESS_OWNER",
      "Partner user role confirmed as BUSINESS_OWNER",
      `Role: ${partnerData.user?.role}`
    );

    assert(
      partnerData.mfaRequired === undefined,
      "Partner response strictly contains NO mfaRequired flag",
      `mfaRequired: ${JSON.stringify(partnerData.mfaRequired)}`
    );

    assert(
      partnerData.mfaType === undefined,
      "Partner response strictly contains NO mfaType parameter",
      `mfaType: ${JSON.stringify(partnerData.mfaType)}`
    );

    const partnerDbSession = await prisma.session.findFirst({
      where: { userId: partnerUser.id },
      orderBy: { createdAt: "desc" },
    });
    assert(
      !!partnerDbSession,
      "Partner session created immediately on password login",
      `Session ID: ${partnerDbSession?.id || "None"}`
    );

    // =========================================================================
    // SECTION 3: PARTNER APIS NEVER RETURN ADMINISTRATOR MFA CHALLENGES
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log("SECTION 3: Partner APIs Never Return Administrator MFA Challenges");
    console.log("--------------------------------------------------------------------------");

    // Generate partner session token to simulate authorized partner portal request
    const partnerToken = await createSessionToken({
      userId: partnerUser.id,
      email: partnerUser.email,
      role: Role.BUSINESS_OWNER,
      name: partnerUser.name,
    });

    await prisma.session.create({
      data: {
        userId: partnerUser.id,
        token: partnerToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const ownerBizReq = new Request(`http://localhost:3000/api/owner/business?businessId=${partnerBusiness.id}`, {
      method: "GET",
      headers: {
        Cookie: `mosa_session=${partnerToken}`,
      },
    });

    const ownerBizRes = await ownerBusinessHandler(ownerBizReq);
    const ownerBizData = await ownerBizRes.json();

    assert(
      ownerBizRes.status === 200 && ownerBizData.success === true,
      "Partner portal API (/api/owner/business) returns HTTP 200",
      `Status: ${ownerBizRes.status}, success: ${ownerBizData.success}`
    );

    assert(
      ownerBizData.business?.id === partnerBusiness.id,
      "Partner portal API returns correct business information without friction",
      `Business: ${ownerBizData.business?.name}`
    );

    assert(
      ownerBizData.mfaRequired === undefined,
      "Partner portal API response NEVER returns mfaRequired challenge",
      `mfaRequired: ${JSON.stringify(ownerBizData.mfaRequired)}`
    );

    assert(
      ownerBizData.mfaType === undefined,
      "Partner portal API response NEVER returns mfaType",
      `mfaType: ${JSON.stringify(ownerBizData.mfaType)}`
    );

    // =========================================================================
    // SECTION 4: PUBLIC DISCOVERY AND CONSUMER AUTHENTICATION UNAFFECTED
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log("SECTION 4: Public Discovery & Consumer Authentication Unaffected");
    console.log("--------------------------------------------------------------------------");

    // 4.1 Consumer Login
    const consumerReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.55.5.${runId.slice(0, 2)}`,
      },
      body: JSON.stringify({
        email: consumerEmail,
        password: testPassword,
      }),
    });

    const consumerRes = await userLoginHandler(consumerReq);
    const consumerData = await consumerRes.json();

    assert(
      consumerRes.status === 200 && consumerData.success === true,
      "Consumer login succeeds directly with password (HTTP 200)",
      `Status: ${consumerRes.status}, success: ${consumerData.success}`
    );

    assert(
      consumerData.mfaRequired === undefined,
      "Consumer response strictly contains NO mfaRequired flag",
      `mfaRequired: ${JSON.stringify(consumerData.mfaRequired)}`
    );

    const consumerDbSession = await prisma.session.findFirst({
      where: { userId: consumerUser.id },
      orderBy: { createdAt: "desc" },
    });
    assert(
      !!consumerDbSession,
      "Consumer session created immediately on password login",
      `Session ID: ${consumerDbSession?.id || "None"}`
    );

    // 4.2 Public Discovery API: /api/businesses
    const publicBizReq = new Request("http://localhost:3000/api/businesses", {
      method: "GET",
    });
    const publicBizRes = await businessesHandler(publicBizReq);

    assert(
      publicBizRes.status === 200,
      "Public business discovery (/api/businesses) operates with zero auth/MFA requirements",
      `Status: ${publicBizRes.status}`
    );

    // 4.3 Public Health API: /api/health
    const healthRes = await healthHandler();
    const healthData = await healthRes.json();

    assert(
      healthRes.status === 200 && healthData.status === "ok",
      "Public health API (/api/health) operates with zero auth/MFA requirements",
      `Status: ${healthRes.status}, health: ${healthData.status}`
    );

  } catch (err: any) {
    console.error("Test execution error:", err);
    assert(false, "Test execution completed without uncaught exceptions", err.message);
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP TEMPORARY TEST DATA (Preserving all production data)
    // -------------------------------------------------------------------------
    console.log("\n▶ Cleaning up temporary test entities...");
    try {
      if (partnerBusiness?.id) {
        await prisma.business.delete({ where: { id: partnerBusiness.id } }).catch(() => null);
      }
      if (superAdminUser?.id) {
        await prisma.adminMfaProfile.deleteMany({ where: { userId: superAdminUser.id } }).catch(() => null);
        await prisma.user.delete({ where: { id: superAdminUser.id } }).catch(() => null);
      }
      if (partnerUser?.id) {
        await prisma.user.delete({ where: { id: partnerUser.id } }).catch(() => null);
      }
      if (consumerUser?.id) {
        await prisma.user.delete({ where: { id: consumerUser.id } }).catch(() => null);
      }
      console.log("✔ Temporary test entities cleaned up. Existing production data untouched.");
    } catch (cleanupErr) {
      console.error("Error cleaning up test data:", cleanupErr);
    }
  }

  console.log("\n==========================================================================");
  console.log(`SCOPE ISOLATION SUMMARY: ${testsPassed} PASSED | ${testsFailed} FAILED`);
  console.log("==========================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runScopeIsolationTests()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
