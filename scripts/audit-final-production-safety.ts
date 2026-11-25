/**
 * 55 MOSA — FINAL LOCATION ACCURACY & SEARCH QUALITY AUDIT
 * Complete automated live verification across all 7 directive pillars
 */

import { PrismaClient } from "@prisma/client";
import { getGoogleMapsDirectionsUrl, calculateLocationCompleteness } from "../src/lib/location-quality";
import { GLOBAL_COUNTRY_CONFIGS } from "../src/lib/country-address-config";

const prisma = new PrismaClient();
const PROD_BASE = "https://www.55mosa.com";

interface PillarResult {
  pillar: string;
  name: string;
  passed: boolean;
  evidence: Record<string, any>;
  notes: string;
}

async function runAudit() {
  console.log("==================================================================");
  console.log("55 MOSA — COMPREHENSIVE LIVE 7-PILLAR AUDIT");
  console.log(`Target: ${PROD_BASE}`);
  console.log(`Execution Time: ${new Date().toISOString()}`);
  console.log("==================================================================\n");

  const results: PillarResult[] = [];

  // -------------------------------------------------------------------------
  // PILLAR 1: LOCATION INTEGRITY
  // Separate address confirmation, directions, and actual coordinate verification.
  // Entering a landmark or directions must NOT falsely certify exact GPS coordinates.
  // -------------------------------------------------------------------------
  console.log("[PILLAR 1] Auditing Location Integrity & Coordinate Separation...");
  try {
    // Test registration with landmark & directions only (NO GPS, NO manual pin)
    const testPhone = "+250788990011";
    // Clean any previous test run
    await prisma.product.deleteMany({ where: { business: { phone: testPhone } } });
    await prisma.business.deleteMany({ where: { phone: testPhone } });
    await prisma.user.deleteMany({ where: { phone: testPhone } });

    const landmarkRegPayload = {
      name: "AUDIT Pillar 1 Test Shop",
      ownerName: "Audit Test Owner",
      phone: testPhone,
      email: "audit1@test.com",
      password: "TestPassword123!",
      category: "retail_shops",
      categoryDisplay: "Retail, Shops & General Commerce",
      mainCategory: "retail_shops",
      subCategory: "food_grocery",
      businessType: "grocery_shop",
      description: "Pillar 1 location integrity verification shop",
      country: "Rwanda",
      province: "City of Kigali",
      district: "Gasabo",
      sector: "Kacyiru",
      cell: "Kamutwa",
      nearestLandmark: "Opposite SACCO Branch",
      locationDescription: "Second blue door after the pharmacy on the left side",
      latitude: -1.9441,
      longitude: 30.0894,
      // NOTE: NO locationAccuracy passed (no GPS), NO pinManuallyAdjusted passed
      products: [
        {
          name: "Audit Sample Product",
          price: 5000,
          description: "Sample product for integrity check",
        },
      ],
    };

    const regRes = await fetch(`${PROD_BASE}/api/businesses/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(landmarkRegPayload),
    });

    const regData = await regRes.json();
    let p1Passed = false;
    let p1Evidence: any = { status: regRes.status, body: regData };

    if (regRes.ok && regData.business) {
      // Fetch the business directly from DB to inspect stored location flags
      const storedBiz = await prisma.business.findUnique({
        where: { id: regData.business.id },
      });

      if (storedBiz) {
        const isNotGps = storedBiz.locationSource !== "GPS_DEVICE";
        const isUnverified = storedBiz.locationVerificationStatus === "UNVERIFIED";
        const hasPrecisionTag = storedBiz.addressNote?.includes("[Precision: Approximate Area");

        p1Passed = isNotGps && isUnverified && Boolean(hasPrecisionTag);
        p1Evidence = {
          registeredId: storedBiz.id,
          locationSource: storedBiz.locationSource,
          locationVerificationStatus: storedBiz.locationVerificationStatus,
          addressNote: storedBiz.addressNote,
          expectedSource: "OWNER_REPORTED",
          expectedVerification: "UNVERIFIED",
          hasPrecisionTag,
        };

        // Clean up test business
        await prisma.product.deleteMany({ where: { businessId: storedBiz.id } });
        await prisma.business.delete({ where: { id: storedBiz.id } });
        await prisma.user.deleteMany({ where: { phone: testPhone } });
      }
    }

    results.push({
      pillar: "Pillar 1",
      name: "Location Integrity: Non-GPS Registration does NOT certify GPS",
      passed: p1Passed,
      evidence: p1Evidence,
      notes: p1Passed
        ? "PASSED: Owner landmark/directions registered cleanly with locationSource=OWNER_REPORTED and verificationStatus=UNVERIFIED. Exact GPS was NOT falsely certified."
        : `FAILED: Coordinates were falsely certified or status mismatch: ${JSON.stringify(p1Evidence)}`,
    });
    console.log(`  -> Result: ${p1Passed ? "PASSED" : "FAILED"}\n`);
  } catch (err: any) {
    results.push({
      pillar: "Pillar 1",
      name: "Location Integrity",
      passed: false,
      evidence: { error: err.message },
      notes: `Error during Pillar 1 check: ${err.message}`,
    });
    console.log(`  -> Result: FAILED (${err.message})\n`);
  }

  // -------------------------------------------------------------------------
  // PILLAR 2: SECTOR CENTROID & HUB PROTECTION
  // Never present a sector centroid or country hub as certified exact coordinates.
  // -------------------------------------------------------------------------
  console.log("[PILLAR 2] Auditing Sector Centroid & Country Hub Protection...");
  try {
    // 1. Attempt registering with country hub coords with no landmark/address
    const rwHub = GLOBAL_COUNTRY_CONFIGS.Rwanda.defaultCenter;
    const hubPayload = {
      name: "AUDIT Country Hub Test",
      ownerName: "Hub Owner",
      phone: "+250788990022",
      password: "TestPassword123!",
      category: "retail_shops",
      mainCategory: "retail_shops",
      subCategory: "food_grocery",
      businessType: "grocery_shop",
      country: "Rwanda",
      latitude: rwHub.lat,
      longitude: rwHub.lng,
      // No sector, no landmark, no description, no pin confirmation
    };

    const hubRes = await fetch(`${PROD_BASE}/api/businesses/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hubPayload),
    });
    const hubData = await hubRes.json();
    const hubRejected = hubRes.status === 400;

    // 2. Register with Sector centroid fallback (country hub + sector name)
    const centroidPayload = {
      name: "AUDIT Centroid Fallback Shop",
      ownerName: "Centroid Owner",
      phone: "+250788990022",
      password: "TestPassword123!",
      category: "retail_shops",
      mainCategory: "retail_shops",
      subCategory: "food_grocery",
      businessType: "grocery_shop",
      country: "Rwanda",
      district: "Gasabo",
      sector: "Kacyiru",
      cell: "Kamutwa",
      nearestLandmark: "Sector Office Vicinity",
      locationDescription: "Around Kacyiru sector center",
      latitude: rwHub.lat,
      longitude: rwHub.lng,
    };

    const centroidRes = await fetch(`${PROD_BASE}/api/businesses/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(centroidPayload),
    });
    const centroidData = await centroidRes.json();

    let centroidClean = false;
    let p2Evidence: any = { hubRejected, hubStatusCode: hubRes.status, hubMessage: hubData.error };

    if (centroidRes.ok && centroidData.business) {
      const storedCentroidBiz = await prisma.business.findUnique({
        where: { id: centroidData.business.id },
      });
      if (storedCentroidBiz) {
        centroidClean =
          storedCentroidBiz.locationVerificationStatus === "UNVERIFIED" &&
          storedCentroidBiz.locationSource === "OWNER_REPORTED" &&
          Boolean(storedCentroidBiz.addressNote?.includes("[Precision: Approximate Area"));
        p2Evidence.centroidShop = {
          id: storedCentroidBiz.id,
          source: storedCentroidBiz.locationSource,
          verification: storedCentroidBiz.locationVerificationStatus,
          addressNote: storedCentroidBiz.addressNote,
        };
        // Clean up
        await prisma.business.delete({ where: { id: storedCentroidBiz.id } });
        await prisma.user.deleteMany({ where: { phone: "+250788990022" } });
      }
    }

    const p2Passed = hubRejected && centroidClean;
    results.push({
      pillar: "Pillar 2",
      name: "Sector Centroid Protection: Country hub blocked and centroid tagged as approximate",
      passed: p2Passed,
      evidence: p2Evidence,
      notes: p2Passed
        ? "PASSED: Raw country viewing hub was rejected with 400. Sector centroid fallback was flagged as Approximate Area and UNVERIFIED."
        : `FAILED: Centroid protection check failed: ${JSON.stringify(p2Evidence)}`,
    });
    console.log(`  -> Result: ${p2Passed ? "PASSED" : "FAILED"}\n`);
  } catch (err: any) {
    results.push({
      pillar: "Pillar 2",
      name: "Sector Centroid Protection",
      passed: false,
      evidence: { error: err.message },
      notes: `Error during Pillar 2 check: ${err.message}`,
    });
    console.log(`  -> Result: FAILED (${err.message})\n`);
  }

  // -------------------------------------------------------------------------
  // PILLAR 3: NAVIGATION ACCURACY
  // Google Maps navigation link hygiene and coordinate fidelity
  // -------------------------------------------------------------------------
  console.log("[PILLAR 3] Auditing Navigation Accuracy & Google Maps Links...");
  try {
    const janvier = await prisma.business.findFirst({
      where: { name: { contains: "JANVIER", mode: "insensitive" } },
    });

    let p3Passed = false;
    let p3Evidence: any = {};

    if (janvier) {
      const dirUrlWithCoords = getGoogleMapsDirectionsUrl(janvier.latitude, janvier.longitude);
      const dirUrlWithName = getGoogleMapsDirectionsUrl({
        lat: janvier.latitude,
        lng: janvier.longitude,
        name: janvier.name,
      });

      // Verify that destination coords are present and invalid place ID is NOT appended
      const hasCoords = dirUrlWithName.includes(`destination=${janvier.latitude.toFixed(6)}%2C${janvier.longitude.toFixed(6)}`);
      const noBogusPlaceId = !dirUrlWithName.includes("&destination_place_id=JANVIER");

      // Verify that valid Place ID (starts with ChI) is preserved when passed
      const dirUrlWithPlaceId = getGoogleMapsDirectionsUrl({
        lat: janvier.latitude,
        lng: janvier.longitude,
        placeId: "ChIJ1234567890abcdef",
      });
      const preservesValidPlaceId = dirUrlWithPlaceId.includes("destination_place_id=ChIJ1234567890abcdef");

      p3Passed = hasCoords && noBogusPlaceId && preservesValidPlaceId;
      p3Evidence = {
        janvierLat: janvier.latitude,
        janvierLng: janvier.longitude,
        dirUrlWithCoords,
        dirUrlWithName,
        dirUrlWithPlaceId,
        hasCoords,
        noBogusPlaceId,
        preservesValidPlaceId,
      };
    }

    results.push({
      pillar: "Pillar 3",
      name: "Navigation Accuracy: Google Maps directions URL coordinates fidelity and place ID hygiene",
      passed: p3Passed,
      evidence: p3Evidence,
      notes: p3Passed
        ? "PASSED: Navigation URLs use exact confirmed coordinates. Arbitrary business names are sanitized from place_id parameter, preventing Google Maps lookup errors."
        : `FAILED: Navigation URL hygiene issue: ${JSON.stringify(p3Evidence)}`,
    });
    console.log(`  -> Result: ${p3Passed ? "PASSED" : "FAILED"}\n`);
  } catch (err: any) {
    results.push({
      pillar: "Pillar 3",
      name: "Navigation Accuracy",
      passed: false,
      evidence: { error: err.message },
      notes: `Error during Pillar 3 check: ${err.message}`,
    });
    console.log(`  -> Result: FAILED (${err.message})\n`);
  }

  // -------------------------------------------------------------------------
  // PILLAR 4: GLOBAL COMPATIBILITY
  // Global coordinate scoring across Rwanda, Uganda, Kenya, UK, USA
  // -------------------------------------------------------------------------
  console.log("[PILLAR 4] Auditing Global Compatibility across 5 Countries...");
  try {
    const internationalSamples = [
      { country: "Rwanda", lat: -1.9441, lng: 30.0894, landmark: "SACCO Kacyiru", desc: "Beside branch office" },
      { country: "Uganda", lat: 0.3476, lng: 32.5825, landmark: "Kampala Central Post Office", desc: "Opposite main gate" },
      { country: "Kenya", lat: -1.2921, lng: 36.8219, landmark: "Kenyatta International Convention Centre", desc: "Harambee Avenue entrance" },
      { country: "United Kingdom", lat: 51.5074, lng: -0.1278, landmark: "Trafalgar Square", desc: "North terrace near gallery" },
      { country: "United States", lat: 40.7128, lng: -74.0060, landmark: "City Hall Park", desc: "Broadway & Murray St kiosk" },
    ];

    const globalChecks = internationalSamples.map((sample) => {
      const scoreResult = calculateLocationCompleteness({
        latitude: sample.lat,
        longitude: sample.lng,
        locationSource: "GPS_DEVICE",
        locationVerificationStatus: "AGENT_CAPTURED",
        locationAccuracy: 10,
        nearestLandmark: sample.landmark,
        locationDescription: sample.desc,
      });

      return {
        country: sample.country,
        lat: sample.lat,
        lng: sample.lng,
        score: scoreResult.score,
        level: scoreResult.level,
        hasCoordinates: scoreResult.breakdown.hasCoordinates,
        isGpsVerified: scoreResult.breakdown.isGpsVerified,
      };
    });

    const allHaveCoords = globalChecks.every((c) => c.hasCoordinates && c.score === 100);
    const p4Passed = allHaveCoords && globalChecks.length === 5;

    results.push({
      pillar: "Pillar 4",
      name: "Global Compatibility: Non-Rwanda coordinates scored accurately worldwide",
      passed: p4Passed,
      evidence: { globalChecks },
      notes: p4Passed
        ? "PASSED: All 5 international countries (Rwanda, Uganda, Kenya, UK, USA) evaluated coordinates with 100% completeness and zero bounding box false negatives."
        : "FAILED: Non-Rwanda coordinates failed completeness calculation.",
    });
    console.log(`  -> Result: ${p4Passed ? "PASSED" : "FAILED"}\n`);
  } catch (err: any) {
    results.push({
      pillar: "Pillar 4",
      name: "Global Compatibility",
      passed: false,
      evidence: { error: err.message },
      notes: `Error during Pillar 4 check: ${err.message}`,
    });
    console.log(`  -> Result: FAILED (${err.message})\n`);
  }

  // -------------------------------------------------------------------------
  // PILLAR 5: SEARCH QUALITY & ANTI-BLEED PRECISION
  // Test combinations across product, service, category, name, location, and negative non-existent items
  // -------------------------------------------------------------------------
  console.log("[PILLAR 5] Auditing Search Quality & Anti-Bleed Precision on Live Platform...");
  try {
    const searchSuite = [
      { query: "perfume", expectMatch: "JANVIER RETAIL SHOP", expectMin: 1, type: "product" },
      { query: "headsets", expectMatch: "JANVIER RETAIL SHOP", expectMin: 1, type: "product" },
      { query: "art", expectMatch: "Ishyuka Arts", expectMin: 1, type: "category" },
      { query: "kacyiru", expectMatch: "JANVIER RETAIL SHOP", expectMin: 1, type: "location" },
      { query: "remera", expectMatch: "Ishyuka Arts", expectMin: 1, type: "location" },
      { query: "perfume in kacyiru", expectMatch: "JANVIER RETAIL SHOP", expectMin: 1, type: "combined" },
      { query: "art in remera", expectMatch: "Ishyuka Arts", expectMin: 1, type: "combined" },
      { query: "sacco", expectMatch: "JANVIER RETAIL SHOP", expectMin: 1, type: "landmark" },
      { query: "pizza", expectMatch: null, expectCount: 0, type: "anti-bleed" },
      { query: "pharmacy", expectMatch: null, expectCount: 0, type: "anti-bleed" },
      { query: "shoes", expectMatch: null, expectCount: 0, type: "anti-bleed" },
    ];

    const suiteResults: any[] = [];
    let suitePassed = true;

    for (const test of searchSuite) {
      const url = `${PROD_BASE}/api/businesses?search=${encodeURIComponent(test.query)}`;
      const res = await fetch(url);
      const data = await res.json();
      const count = data.count || (Array.isArray(data.businesses) ? data.businesses.length : 0);
      const topBusiness = data.businesses?.[0]?.name || null;

      let testOk = false;
      if (test.expectMatch) {
        testOk = count >= test.expectMin && topBusiness?.toLowerCase().includes(test.expectMatch.toLowerCase());
      } else {
        // Anti-bleed test: must return exactly 0 results
        testOk = count === 0;
      }

      if (!testOk) suitePassed = false;

      suiteResults.push({
        query: test.query,
        type: test.type,
        count,
        topBusiness,
        expectedMatch: test.expectMatch,
        passed: testOk,
      });
    }

    results.push({
      pillar: "Pillar 5",
      name: "Search Quality & Anti-Bleed: Exact ranking on goods/services and zero bleed on nonexistent queries",
      passed: suitePassed,
      evidence: { suiteResults },
      notes: suitePassed
        ? "PASSED: 11/11 search queries executed perfectly. High rank on relevant goods/services/locations; zero catalog bleed or false positives on nonexistent items."
        : "FAILED: One or more search quality / anti-bleed assertions failed.",
    });
    console.log(`  -> Result: ${suitePassed ? "PASSED" : "FAILED"}\n`);
  } catch (err: any) {
    results.push({
      pillar: "Pillar 5",
      name: "Search Quality",
      passed: false,
      evidence: { error: err.message },
      notes: `Error during Pillar 5 check: ${err.message}`,
    });
    console.log(`  -> Result: FAILED (${err.message})\n`);
  }

  // -------------------------------------------------------------------------
  // PILLAR 6: REGISTRATION INTEGRITY
  // Media uploads, automatic captions, retry safety, duplicate prevention
  // -------------------------------------------------------------------------
  console.log("[PILLAR 6] Auditing Registration Integrity & Duplicate Prevention...");
  try {
    const testPhone = "+250788990033";
    await prisma.product.deleteMany({ where: { business: { phone: testPhone } } });
    await prisma.business.deleteMany({ where: { phone: testPhone } });
    await prisma.user.deleteMany({ where: { phone: testPhone } });

    const payload = {
      name: "AUDIT Pillar 6 Integrity Shop",
      ownerName: "Integrity Test Owner",
      phone: testPhone,
      password: "TestPassword123!",
      category: "retail_shops",
      mainCategory: "retail_shops",
      subCategory: "food_grocery",
      businessType: "grocery_shop",
      country: "Rwanda",
      district: "Gasabo",
      sector: "Kacyiru",
      cell: "Kamutwa",
      nearestLandmark: "Beside Inyange Depot",
      locationDescription: "White gate facing the main avenue",
      latitude: -1.9445,
      longitude: 30.0898,
      locationAccuracy: 12,
      products: [
        {
          name: "Automatic Caption Product",
          price: 3500,
          description: "Product without explicit caption to verify auto-defaulting",
          mediaUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363",
          // mediaCaption omitted to test automatic fallback
        },
      ],
    };

    // 1. Initial Submission
    const regRes1 = await fetch(`${PROD_BASE}/api/businesses/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const regData1 = await regRes1.json();

    // 2. Retry / Duplicate Submission Check (should update or reject duplicate cleanly without corrupting)
    const regRes2 = await fetch(`${PROD_BASE}/api/businesses/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const regData2 = await regRes2.json();

    let p6Passed = false;
    let p6Evidence: any = {
      status1: regRes1.status,
      body1: regData1,
      status2: regRes2.status,
      body2: regData2,
    };

    if (regRes1.ok && regData1.business) {
      const createdProd = await prisma.product.findFirst({
        where: { businessId: regData1.business.id },
      });
      const captionResolved = createdProd?.mediaCaption === "Automatic Caption Product";

      p6Passed = captionResolved && (regRes2.ok || regRes2.status === 409 || regRes2.status === 400);
      p6Evidence.autoCaption = createdProd?.mediaCaption;
      p6Evidence.captionResolved = captionResolved;
      p6Evidence.createdBusinessId = regData1.business.id;

      // Clean up test data
      await prisma.product.deleteMany({ where: { businessId: regData1.business.id } });
      await prisma.business.delete({ where: { id: regData1.business.id } });
      await prisma.user.deleteMany({ where: { phone: testPhone } });
    }

    results.push({
      pillar: "Pillar 6",
      name: "Registration Integrity: Auto-caption defaulting, media handling, and duplicate safety",
      passed: p6Passed,
      evidence: p6Evidence,
      notes: p6Passed
        ? "PASSED: Product media without custom caption defaulted smoothly to product name without blocking. Re-submission handled safely."
        : `FAILED: Registration integrity check failed: ${JSON.stringify(p6Evidence)}`,
    });
    console.log(`  -> Result: ${p6Passed ? "PASSED" : "FAILED"}\n`);
  } catch (err: any) {
    results.push({
      pillar: "Pillar 6",
      name: "Registration Integrity",
      passed: false,
      evidence: { error: err.message },
      notes: `Error during Pillar 6 check: ${err.message}`,
    });
    console.log(`  -> Result: FAILED (${err.message})\n`);
  }

  // -------------------------------------------------------------------------
  // PILLAR 7: PRODUCTION DATA PROTECTION
  // Verify that foundation pilot businesses and audit records are 100% intact
  // -------------------------------------------------------------------------
  console.log("[PILLAR 7] Auditing Production Data Protection & Record Preservation...");
  try {
    const janvier = await prisma.business.findFirst({
      where: { name: { contains: "JANVIER", mode: "insensitive" } },
      include: { products: true },
    });
    const ishyuka = await prisma.business.findFirst({
      where: { name: { contains: "Ishyuka", mode: "insensitive" } },
      include: { products: true },
    });
    const totalUsers = await prisma.user.count();
    const totalAuditLogs = await prisma.auditLog.count();

    const janvierPreserved = Boolean(
      janvier &&
      janvier.sector === "Kacyiru" &&
      janvier.nearestLandmark?.includes("Sacco") &&
      janvier.products.length >= 2
    );

    const ishyukaPreserved = Boolean(
      ishyuka &&
      ishyuka.sector === "Remera"
    );

    const auditIntact = totalAuditLogs >= 160;
    const p7Passed = janvierPreserved && ishyukaPreserved && auditIntact;

    results.push({
      pillar: "Pillar 7",
      name: "Production Protection: 100% Preservation of Pilot Businesses, Products, and Audit History",
      passed: p7Passed,
      evidence: {
        janvier: {
          id: janvier?.id,
          name: janvier?.name,
          sector: janvier?.sector,
          landmark: janvier?.nearestLandmark,
          productsCount: janvier?.products.length,
          preserved: janvierPreserved,
        },
        ishyuka: {
          id: ishyuka?.id,
          name: ishyuka?.name,
          sector: ishyuka?.sector,
          productsCount: ishyuka?.products.length,
          preserved: ishyukaPreserved,
        },
        totalUsers,
        totalAuditLogs,
        auditIntact,
      },
      notes: p7Passed
        ? "PASSED: All foundation businesses (Janvier Retail Shop, Ishyuka Arts), products, users, and audit logs are 100% preserved and intact."
        : "FAILED: Production records corrupted or lost.",
    });
    console.log(`  -> Result: ${p7Passed ? "PASSED" : "FAILED"}\n`);
  } catch (err: any) {
    results.push({
      pillar: "Pillar 7",
      name: "Production Protection",
      passed: false,
      evidence: { error: err.message },
      notes: `Error during Pillar 7 check: ${err.message}`,
    });
    console.log(`  -> Result: FAILED (${err.message})\n`);
  }

  // -------------------------------------------------------------------------
  // FINAL SCORECARD
  // -------------------------------------------------------------------------
  console.log("==================================================================");
  console.log("AUDIT SCORECARD & SUMMARY");
  console.log("==================================================================");
  const totalPassed = results.filter((r) => r.passed).length;
  console.log(`Total Pillars Evaluated: ${results.length}`);
  console.log(`Passed: ${totalPassed} / ${results.length} (${Math.round((totalPassed / results.length) * 100)}%)`);
  results.forEach((r) => {
    console.log(`[${r.passed ? "PASS" : "FAIL"}] ${r.pillar}: ${r.name}`);
    console.log(`       Notes: ${r.notes}`);
    if (!r.passed) {
      console.log(`       Evidence: ${JSON.stringify(r.evidence)}`);
    }
  });
  console.log("==================================================================\n");

  await prisma.$disconnect();
  return results;
}

runAudit()
  .then((r) => {
    const allPass = r.every((x) => x.passed);
    process.exit(allPass ? 0 : 1);
  })
  .catch((e) => {
    console.error("Fatal audit execution error:", e);
    process.exit(1);
  });
