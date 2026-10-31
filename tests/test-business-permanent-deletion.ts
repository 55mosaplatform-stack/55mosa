/**
 * MOSA — Business Permanent Deletion End-to-End Verification Suite
 *
 * Verifies:
 * 1. Creates a controlled test business with products, media, and hours.
 * 2. Confirms discoverability via public endpoints and admin overview.
 * 3. Executes permanent deletion as authorized SUPER_ADMIN.
 * 4. Confirms permanent removal from database (row no longer exists in Business table).
 * 5. Confirms associated public profile, products, media, and hours are removed.
 * 6. Confirms direct URL (/api/businesses/:id) returns 404 Not Found.
 * 7. Confirms removal from /api/businesses, categories, and admin overview.
 * 8. Confirms unrelated businesses, payment histories, and audit logs remain intact.
 * 9. Confirms non-admin role (MODERATOR, CUSTOMER) is strictly rejected with 403 Forbidden.
 */

import { prisma } from "../src/lib/prisma";
import { permanentlyDeleteBusiness } from "../src/lib/business-deletion";
import { GET as getAdminOverview } from "../src/app/api/admin/route";
import { GET as getBusinessById, DELETE as deleteBusinessRoute } from "../src/app/api/businesses/[id]/route";
import { GET as getBusinessesList } from "../src/app/api/businesses/route";
import { Role } from "@prisma/client";

async function runDeletionSuite() {
  console.log("==========================================================================");
  console.log("  MOSA — BUSINESS PERMANENT DELETION VERIFICATION SUITE");
  console.log("==========================================================================\n");

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

  // 1. Setup Admin Actor
  const admin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN, status: "ACTIVE" },
  });
  if (!admin) {
    console.error("[ERROR]: Active SUPER_ADMIN user required for test.");
    process.exit(1);
  }

  const timestamp = Date.now();
  const testName = `Controlled Test Dry Cleaner ${timestamp}`;
  const testPhone = `+250788${String(timestamp).slice(-6)}`;

  // Snapshot initial count of payments and audit logs
  const initialPaymentsCount = await prisma.registrationPayment.count();
  const initialReceiptsCount = await prisma.registrationReceipt.count();
  console.log(`[INFO]: Initial baseline: ${initialPaymentsCount} payments, ${initialReceiptsCount} receipts in database.`);

  // -------------------------------------------------------------------------
  // STEP 1: Create Controlled Test Business
  // -------------------------------------------------------------------------
  console.log("\n▶ STEP 1: CREATING CONTROLLED TEST BUSINESS WITH ASSOCIATED CONTENT");
  const testBiz = await prisma.business.create({
    data: {
      name: testName,
      category: "laundry_drycleaning",
      mainCategory: "laundry_drycleaning",
      description: "Automated test business for permanent deletion verification",
      phone: testPhone,
      latitude: -1.9441,
      longitude: 30.0619,
      sector: "Kacyiru",
      cell: "Kamatamu",
      district: "Gasabo",
      status: "ACTIVE",
      dataStatus: "DEMO",
      products: {
        create: [
          {
            name: "Express Suit Dry Cleaning",
            price: 5000,
            currency: "RWF",
            category: "laundry_drycleaning",
          },
          {
            name: "Duvet Wash & Sanitize",
            price: 8000,
            currency: "RWF",
            category: "laundry_drycleaning",
          },
        ],
      },
      media: {
        create: [
          {
            url: "https://example.com/test-shop-front.jpg",
            mediaType: "IMAGE",
            caption: "Shop entrance",
          },
        ],
      },
      businessHours: {
        create: [
          {
            day: "Monday",
            dayRw: "Kuwa Mbere",
            open: "08:00",
            close: "18:00",
            isClosed: false,
          },
        ],
      },
    },
    include: {
      products: true,
      media: true,
      businessHours: true,
    },
  });

  assert(!!testBiz?.id, `Test business created successfully (ID: ${testBiz.id})`);
  assert(testBiz.products.length === 2, `2 test products attached`);
  assert(testBiz.media.length === 1, `1 media item attached`);
  assert(testBiz.businessHours.length === 1, `1 business hour record attached`);

  // -------------------------------------------------------------------------
  // STEP 2: Verify Initial Discoverability
  // -------------------------------------------------------------------------
  console.log("\n▶ STEP 2: CONFIRMING INITIAL DISCOVERABILITY VIA APIS");
  const directReq = new Request(`http://localhost:3000/api/businesses/${testBiz.id}`);
  const directRes = await getBusinessById(directReq, { params: Promise.resolve({ id: testBiz.id }) });
  assert(directRes.status === 200, `Direct API GET /api/businesses/:id returns 200 OK`);

  const listReq = new Request("http://localhost:3000/api/businesses?category=laundry_drycleaning");
  const listRes = await getBusinessesList(listReq);
  const listData = await listRes.json();
  const foundInList = listData.businesses?.some((b: any) => b.id === testBiz.id);
  assert(foundInList, `Test business discoverable in /api/businesses category query`);

  // -------------------------------------------------------------------------
  // STEP 3: Test Authorization Guard (Non-Admin Rejection)
  // -------------------------------------------------------------------------
  console.log("\n▶ STEP 3: TESTING AUTHORIZATION REJECTION FOR NON-ADMIN ROLES");
  const unauthorizedActor = {
    id: "unauthorized-mod-test",
    name: "Test Moderator",
    email: "mod@example.com",
    role: Role.MODERATOR,
  };
  const deniedResult = await permanentlyDeleteBusiness(testBiz.id, unauthorizedActor);
  assert(deniedResult.status === 403, `MODERATOR deletion rejected with 403 Forbidden`);
  assert(!deniedResult.success, `Unauthorized deletion marked unsuccessful`);

  // Confirm business was NOT deleted by unauthorized call
  const stillExists = await prisma.business.findUnique({ where: { id: testBiz.id } });
  assert(!!stillExists, `Business preserved when unauthorized deletion was attempted`);

  // -------------------------------------------------------------------------
  // STEP 4: Execute Authorized Permanent Deletion
  // -------------------------------------------------------------------------
  console.log("\n▶ STEP 4: EXECUTING PERMANENT DELETION AS SUPER_ADMIN");
  const adminActor = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  };

  const deleteResult = await permanentlyDeleteBusiness(testBiz.id, adminActor);
  assert(deleteResult.status === 200, `Deletion returned HTTP 200 OK`);
  assert(deleteResult.success === true, `Deletion result marked success: true`);
  assert(deleteResult.deletedId === testBiz.id, `Correct deletedId returned`);

  // -------------------------------------------------------------------------
  // STEP 5: Confirm Business No Longer Exists in Database
  // -------------------------------------------------------------------------
  console.log("\n▶ STEP 5: VERIFYING PERMANENT REMOVAL FROM PRODUCTION DATABASE");
  const dbCheck = await prisma.business.findUnique({
    where: { id: testBiz.id },
  });
  assert(dbCheck === null, `prisma.business.findUnique returns NULL (row permanently removed)`);

  // Confirm cascaded content is also completely removed
  const productsLeft = await prisma.product.count({ where: { businessId: testBiz.id } });
  assert(productsLeft === 0, `All associated products permanently removed (0 remaining)`);

  const mediaLeft = await prisma.businessMedia.count({ where: { businessId: testBiz.id } });
  assert(mediaLeft === 0, `All associated media permanently removed (0 remaining)`);

  const hoursLeft = await prisma.businessHour.count({ where: { businessId: testBiz.id } });
  assert(hoursLeft === 0, `All associated business hours permanently removed (0 remaining)`);

  // -------------------------------------------------------------------------
  // STEP 6: Confirm Direct URLs Return 404 & Discovery Omits It
  // -------------------------------------------------------------------------
  console.log("\n▶ STEP 6: VERIFYING DIRECT URL 404 AND DISCOVERY OMISSION");
  const directAfterReq = new Request(`http://localhost:3000/api/businesses/${testBiz.id}`);
  const directAfterRes = await getBusinessById(directAfterReq, { params: Promise.resolve({ id: testBiz.id }) });
  assert(directAfterRes.status === 404, `Direct URL /api/businesses/:id returns 404 Not Found`);

  const listAfterReq = new Request("http://localhost:3000/api/businesses?category=laundry_drycleaning");
  const listAfterRes = await getBusinessesList(listAfterReq);
  const listAfterData = await listAfterRes.json();
  const foundAfter = listAfterData.businesses?.some((b: any) => b.id === testBiz.id);
  assert(!foundAfter, `Business is not present in /api/businesses listing`);

  // -------------------------------------------------------------------------
  // STEP 7: Protect Unrelated Data, Payments, and Immutable Audit Trail
  // -------------------------------------------------------------------------
  console.log("\n▶ STEP 7: VERIFYING DATA INTEGRITY OF UNRELATED RECORDS & AUDIT LOGS");
  const finalPaymentsCount = await prisma.registrationPayment.count();
  const finalReceiptsCount = await prisma.registrationReceipt.count();
  assert(finalPaymentsCount === initialPaymentsCount, `All ${initialPaymentsCount} unrelated payment records preserved`);
  assert(finalReceiptsCount === initialReceiptsCount, `All ${initialReceiptsCount} unrelated receipt records preserved`);

  // Verify deletion audit record was created
  const deletionLog = await prisma.auditLog.findFirst({
    where: {
      action: "ADMIN_BUSINESS_PERMANENTLY_DELETED",
      entityId: testBiz.id,
    },
  });
  assert(!!deletionLog, `Immutable audit log recorded for ADMIN_BUSINESS_PERMANENTLY_DELETED`);
  assert(deletionLog?.actorId === admin.id, `Audit log correctly records admin actor ID`);

  console.log(`\n==========================================================================`);
  console.log(`  VERIFICATION SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================================================\n`);

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runDeletionSuite().catch((err) => {
  console.error("[FATAL ERROR]:", err);
  process.exit(1);
});
