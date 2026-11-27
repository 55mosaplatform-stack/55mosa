import { POST as adminLoginRoute } from "../src/app/api/admin/auth/login/route";
import { POST as userLoginRoute } from "../src/app/api/auth/login/route";
import { middleware } from "../src/middleware";
import { prisma } from "../src/lib/prisma";
import { hashPassword, verifySessionToken, createSessionToken } from "../src/lib/auth";
import { Role } from "@prisma/client";
import { NextRequest } from "next/server";

async function runMfaRemovalTestSuite() {
  console.log("==========================================================================");
  console.log("55 MOSA — EMAIL MFA REMOVAL & SECURE ADMIN ACCESS VERIFICATION SUITE");
  console.log("Timestamp:", new Date().toISOString());
  console.log("==========================================================================\n");

  const runId = Math.floor(100000 + Math.random() * 900000).toString();
  const testPassword = "TestPasswordSecure@2026!";
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

  try {
    // -----------------------------------------------------------------------
    // Setup Temporary Test Accounts (Cleanly isolated with test run IDs)
    // -----------------------------------------------------------------------
    const superAdmin = await prisma.user.create({
      data: {
        name: `Test Super Admin ${runId}`,
        phone: `+250789${runId.slice(0, 6)}`,
        email: `test.superadmin.${runId}@55mosa.test`,
        role: Role.SUPER_ADMIN,
        passwordHash: pwdHash,
        status: "ACTIVE",
        referralCode: `MOSA-SA-${runId}`,
      },
    });
    createdUserIds.push(superAdmin.id);

    const communityAdmin = await prisma.user.create({
      data: {
        name: `Test Community Admin ${runId}`,
        phone: `+250788${runId.slice(0, 6)}`,
        email: `test.communityadmin.${runId}@55mosa.test`,
        role: Role.COMMUNITY_ADMIN,
        passwordHash: pwdHash,
        status: "ACTIVE",
        referralCode: `MOSA-CA-${runId}`,
      },
    });
    createdUserIds.push(communityAdmin.id);

    const moderator = await prisma.user.create({
      data: {
        name: `Test Moderator ${runId}`,
        phone: `+250787${runId.slice(0, 6)}`,
        email: `test.moderator.${runId}@55mosa.test`,
        role: Role.MODERATOR,
        passwordHash: pwdHash,
        status: "ACTIVE",
        referralCode: `MOSA-MD-${runId}`,
      },
    });
    createdUserIds.push(moderator.id);

    const customerUser = await prisma.user.create({
      data: {
        name: `Test Customer ${runId}`,
        phone: `+250786${runId.slice(0, 6)}`,
        email: `test.customer.${runId}@55mosa.test`,
        role: Role.CUSTOMER,
        passwordHash: pwdHash,
        status: "ACTIVE",
        referralCode: `MOSA-CU-${runId}`,
      },
    });
    createdUserIds.push(customerUser.id);

    const suspendedAdmin = await prisma.user.create({
      data: {
        name: `Suspended Admin ${runId}`,
        phone: `+250785${runId.slice(0, 6)}`,
        email: `test.suspended.${runId}@55mosa.test`,
        role: Role.SUPER_ADMIN,
        passwordHash: pwdHash,
        status: "SUSPENDED",
        referralCode: `MOSA-SU-${runId}`,
      },
    });
    createdUserIds.push(suspendedAdmin.id);

    // -----------------------------------------------------------------------
    // TEST 1: SUPER_ADMIN Direct Login Without Email MFA Challenge
    // -----------------------------------------------------------------------
    console.log("\n▶ TEST 1: SUPER_ADMIN Direct Authentication (No Email MFA Challenge)");
    const saReq = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.1.${runId.slice(-2)}` },
      body: JSON.stringify({ identifier: superAdmin.email, password: testPassword }),
    });
    const saRes = await adminLoginRoute(saReq);
    const saBody = await saRes.json();

    assert(saRes.status === 200, "SUPER_ADMIN login returns HTTP 200 OK", `Status: ${saRes.status}`);
    assert(saBody.success === true, "SUPER_ADMIN login response confirms success: true");
    assert(!saBody.mfaRequired, "SUPER_ADMIN login strictly DOES NOT require MFA challenge", `mfaRequired: ${saBody.mfaRequired}`);
    assert(saBody.user?.role === "SUPER_ADMIN", "SUPER_ADMIN role confirmed in authenticated response", `Role: ${saBody.user?.role}`);
    assert(saBody.user?.id === superAdmin.id, "Authenticated user ID matches SUPER_ADMIN record");

    // Verify session persistence in PostgreSQL
    const saSession = await prisma.session.findFirst({
      where: { userId: superAdmin.id },
      orderBy: { createdAt: "desc" },
    });
    assert(!!saSession, "PostgreSQL session record created in database for SUPER_ADMIN");
    if (saSession) {
      const payload = await verifySessionToken(saSession.token);
      assert(payload?.role === "SUPER_ADMIN", "JWT session payload verifies SUPER_ADMIN clearance");
    }

    // -----------------------------------------------------------------------
    // TEST 2: COMMUNITY_ADMIN Direct Login Without Email MFA
    // -----------------------------------------------------------------------
    console.log("\n▶ TEST 2: COMMUNITY_ADMIN (Staff) Direct Authentication");
    const caReq = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.2.${runId.slice(-2)}` },
      body: JSON.stringify({ identifier: communityAdmin.email, password: testPassword }),
    });
    const caRes = await adminLoginRoute(caReq);
    const caBody = await caRes.json();

    assert(caRes.status === 200, "COMMUNITY_ADMIN login returns HTTP 200 OK", `Status: ${caRes.status}`);
    assert(caBody.success === true, "COMMUNITY_ADMIN login response confirms success: true");
    assert(!caBody.mfaRequired, "COMMUNITY_ADMIN strictly DOES NOT require MFA challenge");
    assert(caBody.user?.role === "COMMUNITY_ADMIN", "COMMUNITY_ADMIN role confirmed");

    // -----------------------------------------------------------------------
    // TEST 3: MODERATOR Direct Login Without Email MFA
    // -----------------------------------------------------------------------
    console.log("\n▶ TEST 3: MODERATOR (Staff) Direct Authentication");
    const modReq = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.3.${runId.slice(-2)}` },
      body: JSON.stringify({ identifier: moderator.email, password: testPassword }),
    });
    const modRes = await adminLoginRoute(modReq);
    const modBody = await modRes.json();

    assert(modRes.status === 200, "MODERATOR login returns HTTP 200 OK", `Status: ${modRes.status}`);
    assert(modBody.success === true, "MODERATOR login response confirms success: true");
    assert(!modBody.mfaRequired, "MODERATOR strictly DOES NOT require MFA challenge");
    assert(modBody.user?.role === "MODERATOR", "MODERATOR role confirmed");

    // -----------------------------------------------------------------------
    // TEST 4: Unauthorized Role Rejection on Admin Login Route
    // -----------------------------------------------------------------------
    console.log("\n▶ TEST 4: RBAC Protection — Ordinary Users Rejected from Command Center");
    const custReq = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.4.${runId.slice(-2)}` },
      body: JSON.stringify({ identifier: customerUser.email, password: testPassword }),
    });
    const custRes = await adminLoginRoute(custReq);
    const custBody = await custRes.json();

    assert(custRes.status === 403, "CUSTOMER rejected from admin endpoint with HTTP 403 Forbidden", `Status: ${custRes.status}`);
    assert(custBody.error.includes("clearance required"), "Clearance requirement error message returned");

    // -----------------------------------------------------------------------
    // TEST 5: Suspended Admin Account Rejection
    // -----------------------------------------------------------------------
    console.log("\n▶ TEST 5: Suspended Account Protection");
    const suspReq = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.5.${runId.slice(-2)}` },
      body: JSON.stringify({ identifier: suspendedAdmin.email, password: testPassword }),
    });
    const suspRes = await adminLoginRoute(suspReq);
    const suspBody = await suspRes.json();

    assert(suspRes.status === 403, "Suspended admin rejected with HTTP 403 Forbidden", `Status: ${suspRes.status}`);
    assert(suspBody.error.includes("suspended"), "Suspended account message returned");

    // -----------------------------------------------------------------------
    // TEST 6: Invalid Credentials Rejection (Brute-Force / Anti-Enumeration)
    // -----------------------------------------------------------------------
    console.log("\n▶ TEST 6: Security Protection — Incorrect Password Rejection");
    const wrongReq = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.6.${runId.slice(-2)}` },
      body: JSON.stringify({ identifier: superAdmin.email, password: "WrongPassword123!" }),
    });
    const wrongRes = await adminLoginRoute(wrongReq);
    const wrongBody = await wrongRes.json();

    assert(wrongRes.status === 401, "Incorrect password returns HTTP 401 Unauthorized", `Status: ${wrongRes.status}`);
    assert(wrongBody.error === "Invalid administrator credentials", "Generic anti-enumeration error message returned");

    // -----------------------------------------------------------------------
    // TEST 7: Ordinary User Login via /api/auth/login
    // -----------------------------------------------------------------------
    console.log("\n▶ TEST 7: Standard User Password Authentication Flow");
    const userReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.7.${runId.slice(-2)}` },
      body: JSON.stringify({ username: customerUser.email, password: testPassword }),
    });
    const userRes = await userLoginRoute(userReq);
    const userBody = await userRes.json();

    assert(userRes.status === 200, "Standard user password login returns HTTP 200 OK", `Status: ${userRes.status}`);
    assert(userBody.success === true, "Standard user response confirms success: true");
    assert(userBody.user?.role === "CUSTOMER", "Customer role returned correctly");

    // -----------------------------------------------------------------------
    // TEST 8: Middleware RBAC Enforcement for Protected Routes
    // -----------------------------------------------------------------------
    console.log("\n▶ TEST 8: Middleware Protection & Route Authorization");
    // 8a: Unauthenticated access to /admin
    const unauthReq = new NextRequest("http://localhost:3000/admin");
    const unauthRes = await middleware(unauthReq);
    assert(unauthRes.status === 307 || unauthRes.status === 302, "Unauthenticated access to /admin redirects to login", `Status: ${unauthRes.status}`);
    const redirectLocation = unauthRes.headers.get("location");
    assert(Boolean(redirectLocation?.includes("/admin/login")), "Redirect location points to /admin/login", `Location: ${redirectLocation}`);

    // 8b: Unauthenticated access to /api/admin
    const apiUnauthReq = new NextRequest("http://localhost:3000/api/admin/metrics");
    const apiUnauthRes = await middleware(apiUnauthReq);
    assert(apiUnauthRes.status === 401, "Unauthenticated API request to /api/admin returns HTTP 401 Unauthorized", `Status: ${apiUnauthRes.status}`);

    // 8c: CUSTOMER session attempting access to /admin
    const custToken = await createSessionToken({
      userId: customerUser.id,
      email: customerUser.email,
      role: Role.CUSTOMER,
      name: customerUser.name,
    });
    const custAdminReq = new NextRequest("http://localhost:3000/admin", {
      headers: { cookie: `mosa_session=${custToken}` },
    });
    const custAdminRes = await middleware(custAdminReq);
    assert(custAdminRes.status === 307 || custAdminRes.status === 302, "CUSTOMER accessing /admin is redirected", `Status: ${custAdminRes.status}`);
    const custRedirect = custAdminRes.headers.get("location");
    assert(Boolean(custRedirect?.includes("/admin/access-denied")), "CUSTOMER redirected to /admin/access-denied", `Location: ${custRedirect}`);

    // 8d: SUPER_ADMIN session accessing /admin
    const saToken = await createSessionToken({
      userId: superAdmin.id,
      email: superAdmin.email,
      role: Role.SUPER_ADMIN,
      name: superAdmin.name,
    });
    const saAdminReq = new NextRequest("http://localhost:3000/admin", {
      headers: { cookie: `mosa_session=${saToken}` },
    });
    const saAdminRes = await middleware(saAdminReq);
    assert(saAdminRes.status === 200, "SUPER_ADMIN session permitted access to /admin (HTTP 200)", `Status: ${saAdminRes.status}`);

  } finally {
    // -----------------------------------------------------------------------
    // Safe Teardown: Clean up ONLY the temporary test accounts created here
    // -----------------------------------------------------------------------
    console.log("\n▶ TEARDOWN: Cleaning up test accounts...");
    for (const id of createdUserIds) {
      await prisma.session.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { actorId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    console.log(`Cleaned up ${createdUserIds.length} test accounts. Production data untouched.`);
    await prisma.$disconnect();
  }

  console.log("\n==========================================================================");
  console.log(`TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("==========================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runMfaRemovalTestSuite().catch((err) => {
  console.error("FATAL ERROR running verification suite:", err);
  process.exit(1);
});
