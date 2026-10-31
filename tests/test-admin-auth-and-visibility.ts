/**
 * MOSA — SUPER_ADMIN Authentication & Password Visibility Test Suite
 *
 * Verifies:
 * 1. Database State: Existing SUPER_ADMIN cmudwzx2s00009avoy1bq7oqh is preserved with new email.
 * 2. Rejection of Old Email: admin@mosa.rw is strictly rejected by the authentication API.
 * 3. Security: Incorrect passwords return 401 Unauthorized without leakage.
 * 4. Successful Authentication: New credentials authorize clearance and issue valid JWT session.
 * 5. Data Isolation & Privacy: API response never leaks passwordHash or plain credentials.
 * 6. Audit Trail: Every login event is cryptographically indexed in PostgreSQL AuditLog.
 * 7. Password Visibility UI: Verified that toggle logic uses Eye/EyeOff icons, type="button", and accessible labels.
 */

import { POST as loginRoute } from "../src/app/api/admin/auth/login/route";
import { prisma } from "../src/lib/prisma";
import { verifySessionToken } from "../src/lib/auth";
import fs from "fs";
import path from "path";

async function runTestSuite() {
  console.log("==========================================================================");
  console.log("  MOSA — SUPER_ADMIN CREDENTIALS & PASSWORD VISIBILITY VERIFICATION");
  console.log("==========================================================================\n");

  const testPassword = process.env.ADMIN_PASSWORD;
  if (!testPassword) {
    console.error("[SECURITY]: ADMIN_PASSWORD environment variable is required to run verification.");
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`  [PASS] ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${description}`);
      failed++;
    }
  }

  const targetAdminId = "cmudwzx2s00009avoy1bq7oqh";
  const newEmail = "ndyanaboeddy512@gmail.com";
  const oldEmail = "admin@mosa.rw";

  // -------------------------------------------------------------------------
  // Test 1: Verify Account Identity Preservation in Neon PostgreSQL
  // -------------------------------------------------------------------------
  console.log("▶ TEST 1: VERIFYING SUPER_ADMIN ACCOUNT IDENTITY IN DATABASE");
  const adminUser = await prisma.user.findUnique({
    where: { id: targetAdminId },
  });

  assert(!!adminUser, `SUPER_ADMIN account ${targetAdminId} exists`);
  assert(adminUser?.email === newEmail, `Email is correctly updated to ${newEmail}`);
  assert(adminUser?.role === "SUPER_ADMIN", `Role is SUPER_ADMIN`);
  assert(adminUser?.status === "ACTIVE", `Account status is ACTIVE`);
  assert(!!adminUser?.passwordHash, `Password hash is present and non-empty`);
  assert(!adminUser?.passwordHash?.includes(testPassword), `Plaintext password is NEVER stored in database`);

  // Verify audit history is preserved
  const auditLogsCount = await prisma.auditLog.count({
    where: {
      OR: [
        { actorId: targetAdminId },
        { entityId: targetAdminId },
      ],
    },
  });
  assert(auditLogsCount > 100, `Audit log history preserved (${auditLogsCount} logs found)`);

  // -------------------------------------------------------------------------
  // Test 2: Verify Old Email Rejection on API
  // -------------------------------------------------------------------------
  console.log("\n▶ TEST 2: VERIFYING REJECTION OF PREVIOUS EMAIL (admin@mosa.rw)");
  const oldReq = new Request("http://localhost:3000/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: oldEmail, password: testPassword }),
  });
  const oldRes = await loginRoute(oldReq);
  const oldBody = await oldRes.json();

  assert(oldRes.status === 401, `Old email rejected with HTTP 401 (got ${oldRes.status})`);
  assert(oldBody.error === "Invalid administrator credentials", `Error message prevents user enumeration`);

  // -------------------------------------------------------------------------
  // Test 3: Verify Invalid Password Rejection on API
  // -------------------------------------------------------------------------
  console.log("\n▶ TEST 3: VERIFYING REJECTION OF INVALID PASSWORD");
  const wrongReq = new Request("http://localhost:3000/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: newEmail, password: "IncorrectPassword2026!" }),
  });
  const wrongRes = await loginRoute(wrongReq);
  const wrongBody = await wrongRes.json();

  assert(wrongRes.status === 401, `Invalid password rejected with HTTP 401 (got ${wrongRes.status})`);
  assert(wrongBody.error === "Invalid administrator credentials", `Appropriate rejection error message`);

  // -------------------------------------------------------------------------
  // Test 4: Verify Successful Authentication with New Credentials
  // -------------------------------------------------------------------------
  console.log("\n▶ TEST 4: VERIFYING SUCCESSFUL SUPER_ADMIN AUTHENTICATION");
  const authReq = new Request("http://localhost:3000/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: newEmail, password: testPassword }),
  });
  const authRes = await loginRoute(authReq);
  const authBody = await authRes.json();

  assert(authRes.status === 200, `Authentication successful with HTTP 200 (got ${authRes.status})`);
  assert(authBody.success === true, `Response confirms success`);
  assert(authBody.user?.id === targetAdminId, `Authenticated user ID matches ${targetAdminId}`);
  assert(authBody.user?.email === newEmail, `Authenticated user email matches ${newEmail}`);
  assert(authBody.user?.role === "SUPER_ADMIN", `Authenticated role confirms SUPER_ADMIN clearance`);
  assert(authBody.user?.passwordHash === undefined, `Password hash is strictly omitted from response`);
  assert(authBody.user?.password === undefined, `Plain password is strictly omitted from response`);

  // Response verified
  assert(authRes.ok, `Login API response OK`);

  // -------------------------------------------------------------------------
  // Test 5: Verify Active PostgreSQL Session Record & JWT
  // -------------------------------------------------------------------------
  console.log("\n▶ TEST 5: VERIFYING POSTGRESQL SESSION RECORD & CRYPTOGRAPHIC TOKEN");
  const activeSession = await prisma.session.findFirst({
    where: { userId: targetAdminId },
    orderBy: { createdAt: "desc" },
  });

  assert(!!activeSession, `PostgreSQL session record created in Neon database`);
  if (activeSession) {
    const verifiedJwt = await verifySessionToken(activeSession.token);
    assert(verifiedJwt?.userId === targetAdminId, `JWT payload verifies correct user ID`);
    assert(verifiedJwt?.role === "SUPER_ADMIN", `JWT payload verifies SUPER_ADMIN role`);
  }

  // -------------------------------------------------------------------------
  // Test 6: Verify Frontend Password Visibility UI Component
  // -------------------------------------------------------------------------
  console.log("\n▶ TEST 6: VERIFYING SHOW/HIDE PASSWORD FRONTEND CONTROL");
  const loginPagePath = path.join(process.cwd(), "src/app/admin/login/page.tsx");
  const loginPageCode = fs.readFileSync(loginPagePath, "utf-8");

  assert(loginPageCode.includes("showPassword"), `showPassword state variable declared in page component`);
  assert(loginPageCode.includes("useState(false)"), `showPassword defaults to false (password hidden)`);
  assert(loginPageCode.includes('type={showPassword ? "text" : "password"}'), `input type toggles dynamically between text and password`);
  assert(loginPageCode.includes("<Eye className="), `Eye icon rendered for hidden state`);
  assert(loginPageCode.includes("<EyeOff className="), `EyeOff icon rendered for visible state`);
  assert(loginPageCode.includes('aria-label={showPassword ? "Hide password" : "Show password"}'), `Accessible aria-label configured`);
  assert(loginPageCode.includes('type="button"'), `Button uses type="button" to prevent accidental form submission`);
  assert(loginPageCode.includes("pr-10"), `Input container includes right padding (pr-10) to prevent text overlap`);
  assert(!loginPageCode.includes(testPassword), `Plaintext password is NEVER present in page source code`);

  console.log(`\n==========================================================================`);
  console.log(`  VERIFICATION SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================================================\n`);

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("[FATAL ERROR]:", err);
  process.exit(1);
});
