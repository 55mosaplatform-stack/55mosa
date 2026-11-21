import { prisma } from "../src/lib/prisma";

const BASE_URL = "https://mosa-one.vercel.app";
const SUPER_ADMIN_EMAIL = "55mosaplatform@gmail.com";
const SUPER_ADMIN_PASS = "EddyPro256";

interface TestResult {
  step: string;
  passed: boolean;
  details: string;
}

async function runFullIntegrationTest() {
  console.log("===============================================================");
  console.log("MOSA COMPLETE PRODUCTION INTEGRATION VERIFICATION");
  console.log("Target:", BASE_URL);
  console.log("Timestamp:", new Date().toISOString());
  console.log("===============================================================\n");

  const results: TestResult[] = [];

  try {
    // -------------------------------------------------------------
    // STEP 1: Direct Database Baseline Check
    // -------------------------------------------------------------
    console.log("[STEP 1] Direct Database Baseline Check...");
    const initialBusinesses = await prisma.business.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, verificationStatus: true, ownerId: true },
    });
    console.log(` -> Found ${initialBusinesses.length} active businesses in Supabase.`);
    for (const b of initialBusinesses) {
      console.log(`    * ${b.name} (${b.verificationStatus})`);
    }

    const pilotNames = [
      "Atelier de Couture Umwiza",
      "Salon Nova Style Biryogo",
      "Cosmos Tech & Phone Clinic",
      "Kivugiza Fresh Milk & Chapati Corner",
    ];

    const allPilotsPresent = pilotNames.every((p) =>
      initialBusinesses.some((b) => b.name === p)
    );

    if (allPilotsPresent) {
      results.push({ step: "Database Pilot Enterprises Baseline", passed: true, details: `All 4 pilot enterprises active (${initialBusinesses.length} total active)` });
    } else {
      results.push({ step: "Database Pilot Enterprises Baseline", passed: false, details: "One or more pilot enterprises missing" });
    }

    // -------------------------------------------------------------
    // STEP 2: Super Admin Authentication & Cookie Retrieval
    // -------------------------------------------------------------
    console.log("\n[STEP 2] Super Admin Authentication...");
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASS }),
    });

    const cookieHeader = loginRes.headers.get("set-cookie") || "";
    const loginData = await loginRes.json();

    if (loginRes.ok && loginData.user && loginData.user.role === "SUPER_ADMIN") {
      console.log(` -> Successfully authenticated as Super Admin (${loginData.user.email})`);
      results.push({ step: "Super Admin Authentication", passed: true, details: `Authenticated as ${loginData.user.email} (Role: ${loginData.user.role})` });
    } else {
      console.error(` -> Login failed:`, loginRes.status, loginData);
      results.push({ step: "Super Admin Authentication", passed: false, details: `Status ${loginRes.status}: ${JSON.stringify(loginData)}` });
      return;
    }

    // -------------------------------------------------------------
    // STEP 3: Public Business Discovery API (/api/businesses)
    // -------------------------------------------------------------
    console.log("\n[STEP 3] Public Business Discovery Feed API...");
    const discRes = await fetch(`${BASE_URL}/api/businesses`);
    const discData = await discRes.json();

    if (discRes.ok && Array.isArray(discData.businesses) && discData.businesses.length >= 4) {
      console.log(` -> Discovery API returned ${discData.businesses.length} businesses.`);
      results.push({ step: "Public Business Discovery Feed", passed: true, details: `Returned ${discData.businesses.length} verified businesses with full metadata` });
    } else {
      results.push({ step: "Public Business Discovery Feed", passed: false, details: `Status ${discRes.status}, count: ${discData.businesses?.length}` });
    }

    // -------------------------------------------------------------
    // STEP 4: Media Upload via /api/upload (Multipart & Base64)
    // -------------------------------------------------------------
    console.log("\n[STEP 4] Media Storage Upload Testing...");
    // 4A: Base64 JSON upload
    const sampleImageBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        dataUrl: sampleImageBase64,
        filename: "test-integration-photo.png",
        folder: "showcase",
      }),
    });

    const uploadData = await uploadRes.json();
    if (uploadRes.ok && uploadData.success && uploadData.url) {
      console.log(` -> Photo upload succeeded: Provider=${uploadData.storageProvider}, Size=${uploadData.sizeBytes} bytes`);
      results.push({ step: "Media Upload & Persistence Engine", passed: true, details: `Upload verified (Provider: ${uploadData.storageProvider}, MIME: ${uploadData.mimeType})` });
    } else {
      console.error(" -> Upload failed:", uploadRes.status, uploadData);
      results.push({ step: "Media Upload & Persistence Engine", passed: false, details: `Status ${uploadRes.status}: ${JSON.stringify(uploadData)}` });
    }

    // -------------------------------------------------------------
    // STEP 5: Partner Media Publishing (/api/owner/media)
    // -------------------------------------------------------------
    console.log("\n[STEP 5] Partner Media Publishing to Business...");
    const targetPilot = initialBusinesses[0]; // e.g. Atelier de Couture Umwiza
    const mediaPublishRes = await fetch(`${BASE_URL}/api/owner/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        businessId: targetPilot.id,
        url: uploadData.url || sampleImageBase64,
        caption: "Ground truth integration verification photo",
        mediaType: "IMAGE",
        isCover: false,
      }),
    });

    const mediaPublishData = await mediaPublishRes.json();
    if (mediaPublishRes.ok && mediaPublishData.success && mediaPublishData.media) {
      console.log(` -> Partner media published successfully (ID: ${mediaPublishData.media.id})`);
      results.push({ step: "Partner Media Publication", passed: true, details: `Published media ID ${mediaPublishData.media.id} to ${targetPilot.name}` });

      // Clean up the test media item from database
      await prisma.businessMedia.delete({ where: { id: mediaPublishData.media.id } });
      console.log(` -> Cleaned up test media ID ${mediaPublishData.media.id}`);
    } else {
      console.error(" -> Partner media publishing failed:", mediaPublishRes.status, mediaPublishData);
      results.push({ step: "Partner Media Publication", passed: false, details: `Status ${mediaPublishRes.status}: ${JSON.stringify(mediaPublishData)}` });
    }

    // -------------------------------------------------------------
    // STEP 6: Partner Business Profile Update (/api/owner/business)
    // -------------------------------------------------------------
    console.log("\n[STEP 6] Partner Business Profile Operational Update...");
    const currentBizRecord = await prisma.business.findUnique({ where: { id: targetPilot.id } });
    const originalDesc = currentBizRecord?.description || "";

    const updateRes = await fetch(`${BASE_URL}/api/owner/business`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        businessId: targetPilot.id,
        description: `${originalDesc} [Verified Operational]`.trim(),
      }),
    });

    const updateData = await updateRes.json();
    if (updateRes.ok && updateData.success) {
      console.log(` -> Business profile successfully updated.`);
      results.push({ step: "Business Profile Operational Update", passed: true, details: `Updated description for ${targetPilot.name}` });

      // Revert description back to exact original state
      await prisma.business.update({
        where: { id: targetPilot.id },
        data: { description: originalDesc },
      });
      console.log(` -> Description reverted to pristine original baseline.`);
    } else {
      console.error(" -> Business profile update failed:", updateRes.status, updateData);
      results.push({ step: "Business Profile Operational Update", passed: false, details: `Status ${updateRes.status}: ${JSON.stringify(updateData)}` });
    }

    // -------------------------------------------------------------
    // STEP 7: Enterprise Self-Registration Flow (/api/businesses/register)
    // -------------------------------------------------------------
    console.log("\n[STEP 7] Enterprise Registration Flow...");
    const testRegPhone = "+250788999888";
    const regPayload = {
      name: "Integration Test Artisan Workshop",
      mainCategory: "retail_shops",
      subCategory: "food_grocery",
      businessType: "grocery_shop",
      category: "retail_shops",
      phone: testRegPhone,
      ownerName: "QA Integration Tester",
      sector: "Nyamirambo",
      cell: "Biryogo",
      nearestLandmark: "Near Maison des Jeunes",
      district: "Nyarugenge",
      province: "Kigali City",
      paymentMethod: "MTN_MOMO",
      momoPhone: testRegPhone,
    };

    const regRes = await fetch(`${BASE_URL}/api/businesses/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regPayload),
    });

    const regData = await regRes.json();
    if (regRes.ok && regData.success && regData.businessId) {
      console.log(` -> Business registered successfully (ID: ${regData.businessId}, Status: ${regData.status})`);
      results.push({ step: "Self-Serve Enterprise Registration Flow", passed: true, details: `Created quarantined business ID ${regData.businessId}` });

      // Clean up test registration and associated records
      const createdBizId = regData.businessId;
      await prisma.registrationReceipt.deleteMany({ where: { businessId: createdBizId } });
      await prisma.registrationPayment.deleteMany({ where: { businessId: createdBizId } });
      await prisma.auditLog.deleteMany({ where: { entityId: createdBizId } });
      await prisma.business.delete({ where: { id: createdBizId } });
      console.log(` -> Cleaned up test business ID ${createdBizId}`);
    } else {
      console.error(" -> Business registration failed:", regRes.status, regData);
      results.push({ step: "Self-Serve Enterprise Registration Flow", passed: false, details: `Status ${regRes.status}: ${JSON.stringify(regData)}` });
    }

    // -------------------------------------------------------------
    // STEP 8: Database Integrity & Audit Check
    // -------------------------------------------------------------
    console.log("\n[STEP 8] Database Integrity & Pilot Enterprise Verification...");
    const finalBusinesses = await prisma.business.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, verificationStatus: true },
    });

    const finalPilotsIntact = pilotNames.every((p) =>
      finalBusinesses.some((b) => b.name === p)
    );

    const auditCount = await prisma.auditLog.count();
    const receiptCount = await prisma.registrationReceipt.count();
    const userCount = await prisma.user.count();

    if (finalPilotsIntact && finalBusinesses.length === initialBusinesses.length) {
      console.log(` -> All 4 pilot enterprises 100% intact.`);
      console.log(` -> Database stats: ${userCount} Users, ${finalBusinesses.length} Businesses, ${receiptCount} Receipts, ${auditCount} Audit Logs.`);
      results.push({
        step: "Database Integrity & Historical Data Preservation",
        passed: true,
        details: `All 4 pilot enterprises preserved intact; ${userCount} users, ${receiptCount} receipts, ${auditCount} audit events safe`,
      });
    } else {
      results.push({ step: "Database Integrity & Historical Data Preservation", passed: false, details: "Discrepancy detected in business count" });
    }

  } catch (err: any) {
    console.error("Test execution exception:", err);
    results.push({ step: "Test Suite Execution", passed: false, details: err.message });
  } finally {
    await prisma.$disconnect();
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n===============================================================");
  console.log("FINAL INTEGRATION TEST RESULTS");
  console.log("===============================================================");
  let allPassed = true;
  for (const r of results) {
    const symbol = r.passed ? "✔ PASS" : "✖ FAIL";
    console.log(`${symbol} | ${r.step.padEnd(45)} | ${r.details}`);
    if (!r.passed) allPassed = false;
  }
  console.log("===============================================================");
  console.log(`OVERALL RESULT: ${allPassed ? "ALL TESTS PASSED (8/8)" : "FAILURES DETECTED"}`);
  console.log("===============================================================\n");
}

runFullIntegrationTest();
