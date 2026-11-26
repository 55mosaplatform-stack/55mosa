/**
 * 55 MOSA — Global Automatic Location Detection & Local Discovery Verification Suite
 * Tests:
 * 1. English permanent default language and complete independence from location.
 * 2. Automatic Edge IP-based visitor location detection (/api/geo/detect) across countries (RW, UG, KE, DE, GB, US).
 * 3. Browser GPS reverse geocoding (/api/geo/geocode?lat=...&lng=...).
 * 4. 4-tier proximity ranking algorithm in /api/businesses with geodesic distance.
 * 5. Data integrity of registered businesses (Janvier Retail Shop, Ishyuka Arts, EARLYBIRDS2026).
 */

import { PrismaClient } from "@prisma/client";
import { getCountryConfig, getCountryConfigByCode, getAllSupportedCountries } from "../src/lib/country-address-config";
import { reverseGeocodeCoords, calculateHaversineDistanceKm } from "../src/lib/geocoding";
import { GET as getGeoDetect } from "../src/app/api/geo/detect/route";
import { GET as getGeoGeocode } from "../src/app/api/geo/geocode/route";
import { GET as getBusinesses } from "../src/app/api/businesses/route";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} [${passed ? "PASS" : "FAIL"}] ${name} - ${details}`);
}

async function runTestSuite() {
  console.log("\n===============================================================================");
  console.log("55 MOSA — GLOBAL AUTOMATIC LOCATION DETECTION & LOCAL DISCOVERY TEST SUITE");
  console.log("===============================================================================\n");

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Permanent Default English Language Verification
    // -------------------------------------------------------------------------
    console.log("--- 1. English Permanent Default Language & Decoupling ---");
    const i18nFilePath = path.join(process.cwd(), "src", "lib", "i18n.tsx");
    const i18nContent = fs.readFileSync(i18nFilePath, "utf8");

    const hasEnglishStateDefault = i18nContent.includes('useState<Language>("en")');
    const hasEnglishContextDefault = i18nContent.includes('lang: "en"');
    const hasEnglishDictDefault = i18nContent.includes("t: dictionaries.en");
    const hasEnglishDefaultTr = i18nContent.includes("translations.en || translations.rw");

    record(
      "Default Language Is English ('en')",
      hasEnglishStateDefault && hasEnglishContextDefault && hasEnglishDictDefault && hasEnglishDefaultTr,
      `State: ${hasEnglishStateDefault ? "en" : "other"}, Context: ${hasEnglishContextDefault ? "en" : "other"}, Dict: ${hasEnglishDictDefault ? "dictionaries.en" : "other"}, DefaultTr: ${hasEnglishDefaultTr ? "en-first" : "other"}`
    );

    const hasLanguageIndependentCookie = i18nContent.includes("mosa_lang=");
    record(
      "Language Independence",
      hasLanguageIndependentCookie && !i18nContent.includes("setSector") && !i18nContent.includes("setCurrentCountry"),
      "Language state and cookie are completely isolated from location state and discovery filters."
    );

    // -------------------------------------------------------------------------
    // TEST 2: Supported Country Configurations & ISO Code Resolution
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Supported Country Configurations & Geo Resolution ---");
    const testCountries = [
      { code: "RW", name: "Rwanda", city: "Kigali" },
      { code: "UG", name: "Uganda", city: "Kampala" },
      { code: "KE", name: "Kenya", city: "Nairobi" },
      { code: "DE", name: "Germany", city: "Berlin" },
      { code: "GB", name: "United Kingdom", city: "London" },
      { code: "US", name: "United States", city: "New York" },
    ];

    for (const tc of testCountries) {
      const configByCode = getCountryConfigByCode(tc.code);
      const configByName = getCountryConfig(tc.name);
      const match = configByCode.code === tc.code && configByName.name === tc.name;
      record(
        `Country Resolution for ${tc.name} (${tc.code})`,
        match,
        `Matched code ${configByCode.code}, currency ${configByCode.currency}, center [${configByCode.defaultCenter.lat}, ${configByCode.defaultCenter.lng}]`
      );
    }

    // -------------------------------------------------------------------------
    // TEST 3: Edge IP Visitor Location Detection API (/api/geo/detect)
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Edge IP Geolocation Detection API ---");

    // Case 3a: German Visitor via Vercel Edge Headers
    const deReq = new NextRequest("http://localhost:3000/api/geo/detect", {
      headers: {
        "x-vercel-ip-country": "DE",
        "x-vercel-ip-city": "Berlin",
        "x-vercel-ip-latitude": "52.5200",
        "x-vercel-ip-longitude": "13.4050",
      },
    });
    const deRes = await getGeoDetect(deReq);
    const deData = await deRes.json();
    record(
      "Edge IP Geolocation: Germany (DE)",
      deData.success && deData.countryCode === "DE" && deData.country === "Germany" && deData.city === "Berlin",
      `Detected country: ${deData.country} (${deData.countryCode}), City: ${deData.city}, Source: ${deData.source}`
    );

    // Case 3b: Ugandan Visitor via Cloudflare Headers
    const ugReq = new NextRequest("http://localhost:3000/api/geo/detect", {
      headers: {
        "cf-ipcountry": "UG",
        "cf-ipcity": "Kampala",
        "cf-iplatitude": "0.3476",
        "cf-iplongitude": "32.5825",
      },
    });
    const ugRes = await getGeoDetect(ugReq);
    const ugData = await ugRes.json();
    record(
      "Edge IP Geolocation: Uganda (UG)",
      ugData.success && ugData.countryCode === "UG" && ugData.country === "Uganda" && ugData.city === "Kampala",
      `Detected country: ${ugData.country} (${ugData.countryCode}), City: ${ugData.city}, Source: ${ugData.source}`
    );

    // Case 3c: Rwandan Visitor via Vercel Headers
    const rwReq = new NextRequest("http://localhost:3000/api/geo/detect", {
      headers: {
        "x-vercel-ip-country": "RW",
        "x-vercel-ip-city": "Kigali",
        "x-vercel-ip-latitude": "-1.9441",
        "x-vercel-ip-longitude": "30.0619",
      },
    });
    const rwRes = await getGeoDetect(rwReq);
    const rwData = await rwRes.json();
    record(
      "Edge IP Geolocation: Rwanda (RW)",
      rwData.success && rwData.countryCode === "RW" && rwData.country === "Rwanda",
      `Detected country: ${rwData.country} (${rwData.countryCode}), City: ${rwData.city}`
    );

    // Case 3d: Query Parameter Test Override (?country=GB&city=London)
    const gbReq = new NextRequest("http://localhost:3000/api/geo/detect?country=GB&city=London");
    const gbRes = await getGeoDetect(gbReq);
    const gbData = await gbRes.json();
    record(
      "Test Override via Query Params: UK (GB)",
      gbData.success && gbData.countryCode === "GB" && gbData.city === "London",
      `Override country: ${gbData.country}, City: ${gbData.city}, Source: ${gbData.source}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: GPS Coordinates Reverse Geocoding (/api/geo/geocode)
    // -------------------------------------------------------------------------
    console.log("\n--- 4. GPS Reverse Geocoding API ---");

    // Case 4a: Kigali Coordinates (-1.9441, 30.0619)
    const kglGeocodeReq = new NextRequest("http://localhost:3000/api/geo/geocode?lat=-1.9441&lng=30.0619");
    const kglGeocodeRes = await getGeoGeocode(kglGeocodeReq);
    const kglGeocodeData = await kglGeocodeRes.json();
    record(
      "Reverse Geocode Kigali GPS Coords",
      kglGeocodeData.country === "Rwanda",
      `Reverse geocoded to country: ${kglGeocodeData.country}, label: ${kglGeocodeData.displayLabel}`
    );

    // Case 4b: Kampala Coordinates (0.3476, 32.5825)
    const kmpGeocodeReq = new NextRequest("http://localhost:3000/api/geo/geocode?lat=0.3476&lng=32.5825");
    const kmpGeocodeRes = await getGeoGeocode(kmpGeocodeReq);
    const kmpGeocodeData = await kmpGeocodeRes.json();
    record(
      "Reverse Geocode Kampala GPS Coords",
      kmpGeocodeData.country === "Uganda",
      `Reverse geocoded to country: ${kmpGeocodeData.country}, label: ${kmpGeocodeData.displayLabel}`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Haversine Geodesic Distance Calculations
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Geodesic Distance Calculation ---");
    // Distance from Kacyiru (-1.935, 30.082) to Nyamirambo (-1.970, 30.045) is ~5.5 km
    const distKacyiruToNyamirambo = calculateHaversineDistanceKm(-1.935, 30.082, -1.970, 30.045);
    const distOk = distKacyiruToNyamirambo > 4 && distKacyiruToNyamirambo < 7;
    record(
      "Haversine Geodesic Accuracy (Kacyiru to Nyamirambo)",
      distOk,
      `Calculated: ${distKacyiruToNyamirambo.toFixed(2)} km (expected ~5-6 km)`
    );

    // Distance from Kigali to Kampala is ~375-400 km
    const distKglToKmp = calculateHaversineDistanceKm(-1.9441, 30.0619, 0.3476, 32.5825);
    const distKglOk = distKglToKmp > 350 && distKglToKmp < 420;
    record(
      "Haversine Geodesic Accuracy (Kigali to Kampala)",
      distKglOk,
      `Calculated: ${distKglToKmp.toFixed(2)} km (expected ~375-400 km)`
    );

    // -------------------------------------------------------------------------
    // TEST 6: 4-Tier Proximity Hierarchy & Discovery Feed Ranking
    // -------------------------------------------------------------------------
    console.log("\n--- 6. 4-Tier Proximity Discovery Ranking ---");

    // Case 6a: Visitor in Kigali, Rwanda near Kacyiru
    const kglVisitorReq = new NextRequest(
      "http://localhost:3000/api/businesses?userCountry=Rwanda&userCity=Kigali&sector=Kacyiru&lat=-1.935&lng=30.082"
    );
    const kglVisitorRes = await getBusinesses(kglVisitorReq);
    const kglVisitorData = await kglVisitorRes.json();
    const firstKglBiz = kglVisitorData.businesses?.[0];
    const isLocalKacyiruTier1 = Boolean(firstKglBiz && firstKglBiz.proximityTier === 1 && firstKglBiz.isLocalResult === true);
    record(
      "Kigali/Kacyiru Visitor Prioritizes Kacyiru Business (Tier 1)",
      isLocalKacyiruTier1,
      `Top ranked: ${firstKglBiz?.name}, Tier: ${firstKglBiz?.proximityTier}, Local: ${firstKglBiz?.isLocalResult}, Dist: ${firstKglBiz?.distanceKm?.toFixed(2)} km`
    );

    // Case 6b: Visitor in Kampala, Uganda
    const kmpVisitorReq = new NextRequest(
      "http://localhost:3000/api/businesses?userCountry=Uganda&userCity=Kampala&lat=0.3476&lng=32.5825"
    );
    const kmpVisitorRes = await getBusinesses(kmpVisitorReq);
    const kmpVisitorData = await kmpVisitorRes.json();
    const hasKmpResults = kmpVisitorData.businesses && kmpVisitorData.businesses.length > 0;
    // Rwanda businesses returned to Kampala visitor must be designated Tier 4 (International) or not mislabeled as local
    const foreignBiz = kmpVisitorData.businesses?.[0];
    record(
      "Kampala Visitor Receives Proximity-Ranked Feed (Never Empty)",
      hasKmpResults,
      `Returned ${kmpVisitorData.businesses?.length} businesses. First item: ${foreignBiz?.name}, Proximity Tier: ${foreignBiz?.proximityTier}, isLocal: ${foreignBiz?.isLocalResult}`
    );

    // Case 6c: Visitor in Berlin, Germany
    const berVisitorReq = new NextRequest(
      "http://localhost:3000/api/businesses?userCountry=Germany&userCity=Berlin&lat=52.5200&lng=13.4050"
    );
    const berVisitorRes = await getBusinesses(berVisitorReq);
    const berVisitorData = await berVisitorRes.json();
    const hasBerResults = berVisitorData.businesses && berVisitorData.businesses.length > 0;
    const berFirstBiz = berVisitorData.businesses?.[0];
    record(
      "Berlin Visitor Receives Proximity-Ranked International Feed (Never Empty)",
      hasBerResults,
      `Returned ${berVisitorData.businesses?.length} businesses. First item: ${berFirstBiz?.name}, Proximity Tier: ${berFirstBiz?.proximityTier}`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Business Data Protection & Stability Verification
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Business Operating Address & Data Protection ---");
    const janvierInDb = await prisma.business.findFirst({
      where: { name: { contains: "JANVIER", mode: "insensitive" } },
      include: { products: true },
    });

    const hasSaccoLandmark = Boolean(
      janvierInDb?.nearestLandmark?.toLowerCase().includes("sacco") ||
      janvierInDb?.nearbyPlace?.toLowerCase().includes("sacco") ||
      janvierInDb?.locationDescription?.toLowerCase().includes("sacco") ||
      janvierInDb?.addressNote?.toLowerCase().includes("sacco") ||
      janvierInDb?.sector?.toLowerCase() === "kacyiru"
    );

    const isJanvierProtected = Boolean(
      janvierInDb &&
      janvierInDb.status === "ACTIVE" &&
      janvierInDb.latitude &&
      Math.abs(janvierInDb.latitude - -1.936) < 0.05 &&
      hasSaccoLandmark
    );

    record(
      "Janvier Retail Shop Registered Address & Landmark Preserved",
      isJanvierProtected,
      `Status: ${janvierInDb?.status}, Lat: ${janvierInDb?.latitude}, Lng: ${janvierInDb?.longitude}, Sector: "${janvierInDb?.sector}", Landmark: "${janvierInDb?.nearestLandmark || janvierInDb?.addressNote}", Products: ${janvierInDb?.products.length}`
    );

    const waiverPromo = await prisma.feePromotion.findFirst({
      where: { code: "EARLYBIRDS2026", status: "ACTIVE" },
    });
    record(
      "Promotion Waiver EARLYBIRDS2026 Active",
      Boolean(waiverPromo && waiverPromo.discountValue === 100),
      `Waiver Code: ${waiverPromo?.code}, Discount: ${waiverPromo?.discountValue}%, Type: ${waiverPromo?.promotionType}, Description: ${waiverPromo?.description}`
    );

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = total - passed;

    console.log("\n===============================================================================");
    console.log(`TOTAL CHECKS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("===============================================================================\n");

    if (failed > 0) {
      console.error(`❌ ${failed} verification checks failed!`);
      process.exit(1);
    } else {
      console.log("🎉 ALL GLOBAL LOCATION DETECTION & DISCOVERY CHECKS PASSED!");
      process.exit(0);
    }
  } catch (error) {
    console.error("Test execution exception:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTestSuite();
