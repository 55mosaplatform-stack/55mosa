/**
 * 55 MOSA — Live Production Centralized Management & Autonomy Smoke Test
 * Tests the live platform https://55mosa.com directly to verify:
 * 1. Health check endpoint status
 * 2. Foundation business profiles (JANVIER RETAIL SHOP, Ishyuka Arts)
 * 3. /owner entry route responsiveness & redirection
 * 4. Command Center /admin entry point
 * 5. Authorization security on owner & admin API routes
 */

export {};

async function main() {
  console.log("================================================================================");
  console.log("55 MOSA — LIVE PRODUCTION CENTRALIZED MANAGEMENT & AUTONOMY SMOKE TEST");
  console.log("Target Domain: https://55mosa.com");
  console.log("================================================================================\n");

  const baseUrl = "https://55mosa.com";
  let passed = 0;
  let total = 0;

  function record(title: string, success: boolean, detail?: string) {
    total++;
    if (success) {
      passed++;
      console.log(`  [PASS] Test ${total}: ${title}`);
      if (detail) console.log(`         -> ${detail}`);
    } else {
      console.error(`  [FAIL] Test ${total}: ${title}`);
      if (detail) console.error(`         -> ${detail}`);
    }
  }

  // Check 1: Health & Pulse Endpoint
  try {
    const res = await fetch(`${baseUrl}/api/pulse`);
    const data = await res.json().catch(() => ({}));
    record("Platform Health Status (/api/pulse)", res.status === 200 && data.success === true, `HTTP ${res.status}, Success: ${data.success}`);
  } catch (err: any) {
    record("Platform Health Status (/api/pulse)", false, err.message);
  }

  // Check 2: Live Foundation Business Janvier Retail Shop
  try {
    const res = await fetch(`${baseUrl}/api/businesses/cmwtpdnsr0002jw07jijwokpu`);
    const data = await res.json().catch(() => ({}));
    const biz = data.business;
    const hasName = biz && (biz.name.includes("JANVIER") || biz.name.includes("Janvier"));
    const hasLocation = biz && (biz.sector === "Kacyiru" && biz.district === "Gasabo");
    record(
      "Live Foundation Business JANVIER RETAIL SHOP accessible & intact",
      res.status === 200 && Boolean(hasName && hasLocation),
      `HTTP ${res.status}, Name: ${biz?.name}, Sector: ${biz?.sector}, District: ${biz?.district}, Products: ${biz?.products?.length || 0}`
    );
  } catch (err: any) {
    record("Live Foundation Business JANVIER RETAIL SHOP accessible & intact", false, err.message);
  }

  // Check 3: Live Foundation Business Ishyuka Arts
  try {
    const res = await fetch(`${baseUrl}/api/businesses/cmwrpobbg0002l308k1t7ypzs`);
    const data = await res.json().catch(() => ({}));
    const biz = data.business;
    const hasName = biz && biz.name.includes("Ishyuka");
    const hasLocation = biz && (biz.sector === "Remera" && biz.district === "Gasabo");
    record(
      "Live Foundation Business Ishyuka Arts accessible & intact",
      res.status === 200 && Boolean(hasName && hasLocation),
      `HTTP ${res.status}, Name: ${biz?.name}, Sector: ${biz?.sector}, District: ${biz?.district}`
    );
  } catch (err: any) {
    record("Live Foundation Business Ishyuka Arts accessible & intact", false, err.message);
  }

  // Check 4: /owner Route
  try {
    const res = await fetch(`${baseUrl}/owner`, { redirect: "manual" });
    const isRedirectOrOk = [200, 301, 302, 307, 308].includes(res.status);
    const location = res.headers.get("location") || "none";
    record(
      "/owner entry route is active and operational",
      isRedirectOrOk,
      `HTTP ${res.status}, Target Location: ${location}`
    );
  } catch (err: any) {
    record("/owner entry route is active and operational", false, err.message);
  }

  // Check 5: /admin Command Center Route
  try {
    const res = await fetch(`${baseUrl}/admin`);
    record(
      "/admin Command Center entry point accessible",
      res.status === 200 || res.status === 307 || res.status === 308,
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    record("/admin Command Center entry point accessible", false, err.message);
  }

  // Check 6: Unauthenticated Protection on Owner Business API
  try {
    const res = await fetch(`${baseUrl}/api/owner/business`);
    record(
      "Owner API enforces strict unauthenticated protection (401)",
      res.status === 401 || res.status === 403,
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    record("Owner API enforces strict unauthenticated protection (401)", false, err.message);
  }

  // Check 7: Unauthenticated Protection on Admin Content API
  try {
    const res = await fetch(`${baseUrl}/api/admin/businesses/cmwtpdnsr0002jw07jijwokpu/content`);
    record(
      "Admin Business Content API enforces strict authorization (401)",
      res.status === 401 || res.status === 403,
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    record("Admin Business Content API enforces strict authorization (401)", false, err.message);
  }

  // Check 8: Unauthenticated Protection on Owner Media API
  try {
    const res = await fetch(`${baseUrl}/api/owner/media?businessId=cmwtpdnsr0002jw07jijwokpu`);
    record(
      "Owner Media API enforces strict authorization (401)",
      res.status === 401 || res.status === 403,
      `HTTP ${res.status}`
    );
  } catch (err: any) {
    record("Owner Media API enforces strict authorization (401)", false, err.message);
  }

  console.log("\n================================================================================");
  console.log(`LIVE SMOKE TEST RESULT: ${passed}/${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log("================================================================================");
}

main().catch(console.error);
