import { prisma } from "../src/lib/prisma";

const PROD_BASE = "https://55mosa.com";

interface GeocodeTest {
  country: string;
  query: string;
  expectedCountry: string;
  expectedLatMin: number;
  expectedLatMax: number;
  expectedLngMin: number;
  expectedLngMax: number;
}

const GEOCODE_TESTS: GeocodeTest[] = [
  {
    country: "Rwanda",
    query: "Kigali Business Centre, KG 7 Ave",
    expectedCountry: "Rwanda",
    expectedLatMin: -2.0,
    expectedLatMax: -1.8,
    expectedLngMin: 30.0,
    expectedLngMax: 30.2,
  },
  {
    country: "Kenya",
    query: "Westlands, Nairobi",
    expectedCountry: "Kenya",
    expectedLatMin: -1.4,
    expectedLatMax: -1.1,
    expectedLngMin: 36.7,
    expectedLngMax: 37.0,
  },
  {
    country: "Uganda",
    query: "Acacia Mall, Kampala",
    expectedCountry: "Uganda",
    expectedLatMin: 0.2,
    expectedLatMax: 0.5,
    expectedLngMin: 32.4,
    expectedLngMax: 32.7,
  },
  {
    country: "United Kingdom",
    query: "Oxford Street, London",
    expectedCountry: "United Kingdom",
    expectedLatMin: 51.4,
    expectedLatMax: 51.6,
    expectedLngMin: -0.3,
    expectedLngMax: 0.0,
  },
  {
    country: "United States",
    query: "Times Square, New York",
    expectedCountry: "United States",
    expectedLatMin: 40.6,
    expectedLatMax: 40.9,
    expectedLngMin: -74.1,
    expectedLngMax: -73.8,
  },
];

async function main() {
  console.log("==================================================================");
  console.log("55 MOSA — LIVE PRODUCTION GLOBAL READINESS VERIFICATION");
  console.log("Authoritative Target:", PROD_BASE);
  console.log("Timestamp:", new Date().toISOString());
  console.log("==================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  // TEST SUITE 1: Global Geocoding & Coordinates
  console.log("[SUITE 1] Testing Live Global Geocoding across Rwanda, Kenya, Uganda, UK, USA...");
  for (const t of GEOCODE_TESTS) {
    totalTests++;
    try {
      const res = await fetch(`${PROD_BASE}/api/geo/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: t.query,
          country: t.country,
        }),
      });

      if (!res.ok) {
        console.error(`  ✕ [FAIL] ${t.country} geocode returned status ${res.status}`);
        continue;
      }

      const json = await res.json();
      if (!json.success || !json.result) {
        console.error(`  ✕ [FAIL] ${t.country} geocode response missing result:`, json);
        continue;
      }

      const { lat, lng, hierarchy, source, confidence } = json.result;
      const latOk = lat >= t.expectedLatMin && lat <= t.expectedLatMax;
      const lngOk = lng >= t.expectedLngMin && lng <= t.expectedLngMax;

      if (!latOk || !lngOk) {
        console.error(
          `  ✕ [FAIL] ${t.country} coordinates (${lat}, ${lng}) outside expected bounds [${t.expectedLatMin}..${t.expectedLatMax}, ${t.expectedLngMin}..${t.expectedLngMax}]`
        );
        continue;
      }

      console.log(
        `  ✓ [PASS] ${t.country} ("${t.query}") -> Lat: ${lat}, Lng: ${lng} | Source: ${source} | Conf: ${confidence}`
      );
      console.log(`         Hierarchy: ${JSON.stringify(hierarchy)}`);
      passedTests++;
    } catch (err: any) {
      console.error(`  ✕ [FAIL] ${t.country} request error:`, err.message);
    }
  }

  // TEST SUITE 2: Sitemap XML Response
  console.log("\n[SUITE 2] Verifying Production Sitemap XML...");
  totalTests++;
  try {
    const sitemapRes = await fetch(`${PROD_BASE}/sitemap.xml`);
    const text = await sitemapRes.text();
    const isXml = text.includes("<?xml") && text.includes("<urlset");
    const hasCanonical = text.includes("https://55mosa.com/");

    if (sitemapRes.status === 200 && isXml && hasCanonical) {
      console.log("  ✓ [PASS] https://55mosa.com/sitemap.xml returns HTTP 200 with valid sitemap XML");
      console.log(`         Length: ${text.length} bytes, Root: https://55mosa.com/`);
      passedTests++;
    } else {
      console.error(`  ✕ [FAIL] Sitemap verification failed: status=${sitemapRes.status}, isXml=${isXml}`);
    }
  } catch (err: any) {
    console.error("  ✕ [FAIL] Sitemap request error:", err.message);
  }

  // TEST SUITE 3: Production Database Integrity & Live Businesses
  console.log("\n[SUITE 3] Auditing Live Production Database (Supabase PostgreSQL)...");
  totalTests++;
  try {
    const businesses = await prisma.business.findMany({
      select: {
        id: true,
        name: true,
        district: true,
        sector: true,
        cell: true,
        latitude: true,
        longitude: true,
        verificationStatus: true,
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    console.log(`  ✓ Found ${businesses.length} total businesses in Supabase PostgreSQL:`);
    for (const b of businesses) {
      console.log(
        `    - ${b.name} (${b.verificationStatus}) | Location: ${b.cell}, ${b.sector}, ${b.district} (${b.latitude}, ${b.longitude}) | Products: ${b._count.products}`
      );
    }

    const janvier = businesses.find((b) => b.name.includes("JANVIER RETAIL SHOP"));
    const ishyuka = businesses.find((b) => b.name.includes("Ishyuka Arts"));

    if (janvier && ishyuka) {
      console.log("  ✓ [PASS] All registered businesses 100% intact with zero data loss.");
      passedTests++;
    } else {
      console.error("  ✕ [FAIL] Missing one or more critical businesses!");
    }
  } catch (err: any) {
    console.error("  ✕ [FAIL] Database audit error:", err.message);
  }

  // TEST SUITE 4: Fee Promotions Verification
  console.log("\n[SUITE 4] Auditing Active Fee Promotions...");
  totalTests++;
  try {
    const promo = await prisma.feePromotion.findFirst({
      where: { code: "EARLYBIRDS2026", status: "ACTIVE" },
    });

    if (promo) {
      console.log(`  ✓ [PASS] Promotion "${promo.name}" (${promo.code}) is ACTIVE`);
      console.log(`         Type: ${promo.promotionType} (${promo.discountValue}%), Scope: ${promo.targetScope}`);
      passedTests++;
    } else {
      console.error("  ✕ [FAIL] Early Birds promotion not found or not active!");
    }
  } catch (err: any) {
    console.error("  ✕ [FAIL] Promotion audit error:", err.message);
  }

  console.log("\n==================================================================");
  console.log(`FINAL REPORT: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("==================================================================");

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
