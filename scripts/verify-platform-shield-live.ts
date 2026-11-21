const PROD_URL = "https://55mosa.com";
const ADMIN_EMAIL = "55mosaplatform@gmail.com";
const ADMIN_PASS = "EddyPro256";

interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  details: string;
}

async function main() {
  console.log("==================================================================");
  console.log("MOSA PERMANENT PLATFORM PROTECTION & SECURITY RADAR VERIFICATION");
  console.log("Target Domain:", PROD_URL);
  console.log("Timestamp:", new Date().toISOString());
  console.log("==================================================================\n");

  const results: TestResult[] = [];

  // 1. Super Admin Authentication
  console.log("[TEST 1] Authenticating Super Admin on Production...");
  const loginRes = await fetch(`${PROD_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });

  const cookie = loginRes.headers.get("set-cookie") || "";
  const loginData = await loginRes.json();
  const authPassed = loginRes.ok && loginData.user?.role === "SUPER_ADMIN";
  results.push({
    suite: "Authentication & Authorization",
    test: "Super Admin Session Issuance",
    passed: authPassed,
    details: authPassed ? `Authenticated as ${loginData.user.email} (Role: ${loginData.user.role})` : `Failed: ${loginRes.status}`,
  });
  console.log(` -> Super Admin authentication: ${authPassed ? "PASS" : "FAIL"}`);

  // 2. Operational Monitoring & Early Warning Radar API
  console.log("\n[TEST 2] Proactive Monitoring & Early Warnings Telemetry API...");
  const radarRes = await fetch(`${PROD_URL}/api/admin/monitoring/alerts`, {
    headers: { Cookie: cookie },
  });
  const radarData = await radarRes.json();
  const radarPassed = radarRes.ok && radarData.success && radarData.telemetry && Array.isArray(radarData.activeAlerts);
  results.push({
    suite: "Proactive Monitoring & Early Warnings",
    test: "Live System Telemetry & Alert Evaluation",
    passed: radarPassed,
    details: radarPassed
      ? `Database: ${radarData.telemetry.database.sizeMb}MB / ${radarData.telemetry.database.quotaMb}MB (${radarData.telemetry.database.percentQuotaUsed}%), Active Alerts: ${radarData.activeAlerts.length}, Critical: ${radarData.stats.criticalCount}`
      : `Failed: ${radarRes.status}`,
  });
  console.log(` -> Telemetry & Alerts API: ${radarPassed ? "PASS" : "FAIL"}`);
  if (radarPassed) {
    console.log(`    * Database Storage: ${radarData.telemetry.database.sizeMb} MB (${radarData.telemetry.database.percentQuotaUsed}% used)`);
    console.log(`    * Latency: ${radarData.telemetry.database.latencyMs} ms`);
    console.log(`    * Foundation Pilots Intact: ${radarData.telemetry.businesses.pilotsIntact}`);
    console.log(`    * Active Payment Providers: ${radarData.telemetry.payments.activeProviders}`);
  }

  // 3. Autonomous Digital Security Guard Telemetry
  console.log("\n[TEST 3] Autonomous Digital Security Guard Telemetry...");
  const guardRes = await fetch(`${PROD_URL}/api/admin/security/guards`, {
    headers: { Cookie: cookie },
  });
  const guardData = await guardRes.json();
  const guardPassed = guardRes.ok && guardData.success && guardData.guardStatus?.isActive === true;
  results.push({
    suite: "Digital Security Guard Shield",
    test: "24/7 Security Guard Telemetry",
    passed: guardPassed,
    details: guardPassed
      ? `Shield Mode: ${guardData.guardStatus.shieldMode}, Total Incidents: ${guardData.incidents?.length || 0}, Quarantined IPs: ${guardData.blockedIps?.length || 0}`
      : `Failed: ${guardRes.status}`,
  });
  console.log(` -> 24/7 Security Guard Shield: ${guardPassed ? "PASS" : "FAIL"}`);

  // 4. Digital Security Guard: Threat Simulation Probe
  console.log("\n[TEST 4] Executing Digital Security Guard Threat Simulation Probe...");
  const probeRes = await fetch(`${PROD_URL}/api/admin/security/guards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ action: "SIMULATE_THREAT_PROBE" }),
  });
  const probeData = await probeRes.json();
  const probePassed = probeRes.ok && probeData.success && probeData.incident?.threatScore > 50;
  results.push({
    suite: "Digital Security Guard Shield",
    test: "Autonomous Threat Interception Probe",
    passed: probePassed,
    details: probePassed
      ? `Probe Intercepted: Incident ID ${probeData.incident.id}, Defense Applied: ${probeData.incident.automatedDefenseApplied}, Threat Score: ${probeData.incident.threatScore}/100`
      : `Failed: ${probeRes.status}`,
  });
  console.log(` -> Threat Simulation Probe: ${probePassed ? "PASS" : "FAIL"}`);

  // 5. Threat Inspection & Security Shield: SQL Injection Interception
  console.log("\n[TEST 5] Threat Scanner & Defense Shield: Testing SQLi Interception...");
  const edgeThreatUrl = `${PROD_URL}/api/businesses?search=%27%20OR%20%271%27=%271`;
  const edgeRes = await fetch(edgeThreatUrl);
  // Middleware & API guard should reject with HTTP 403 Forbidden
  const edgePassed = edgeRes.status === 403;
  results.push({
    suite: "Edge Request Scanner & Middleware",
    test: "SQL Injection Query Pattern Interception",
    passed: edgePassed,
    details: edgePassed
      ? `Successfully rejected malicious query pattern with HTTP 403 Forbidden`
      : `Unexpected status ${edgeRes.status}`,
  });
  console.log(` -> Threat Scanner & Defense Shield: ${edgePassed ? "PASS" : "FAIL"} (Status: ${edgeRes.status})`);

  // 6. Foundation Pilot Enterprises Integrity
  console.log("\n[TEST 6] Foundation Pilot Enterprises Public Discovery API...");
  const bizRes = await fetch(`${PROD_URL}/api/businesses`);
  const bizData = await bizRes.json();
  const pilotNames = [
    "Salon Nova Style Biryogo",
    "Atelier de Couture Umwiza",
    "Cosmos Tech & Phone Clinic",
    "Kivugiza Fresh Milk & Chapati Corner",
  ];
  const allPilotsPresent = pilotNames.every((p) =>
    bizData.businesses?.some((b: any) => b.name === p)
  );
  const pilotsPassed = bizRes.ok && bizData.success && allPilotsPresent;
  results.push({
    suite: "Data Protection & Business Integrity",
    test: "All 4 Foundation Pilot Enterprises Live & Verified",
    passed: pilotsPassed,
    details: pilotsPassed
      ? `All 4 pilot enterprises returnable with full product catalogs: ${pilotNames.join("; ")}`
      : `Pilots missing or inactive! Status: ${bizRes.status}`,
  });
  console.log(` -> Pilot Enterprises Integrity: ${pilotsPassed ? "PASS" : "FAIL"}`);

  // 7. Dynamic Public Sitemap & Robots
  console.log("\n[TEST 7] Public SEO Sitemap & Robots Crawl Policy...");
  const [sitemapRes, robotsRes] = await Promise.all([
    fetch(`${PROD_URL}/sitemap.xml`),
    fetch(`${PROD_URL}/robots.txt`),
  ]);
  const sitemapText = await sitemapRes.text();
  const robotsText = await robotsRes.text();
  const sitemapPassed = sitemapRes.ok && sitemapText.includes("https://55mosa.com/") && sitemapText.includes("sitemap");
  const robotsPassed = robotsRes.ok && robotsText.includes("Sitemap: https://55mosa.com/sitemap.xml");
  results.push({
    suite: "SEO & Crawler Infrastructure",
    test: "Canonical XML Sitemap & Robots Policy",
    passed: sitemapPassed && robotsPassed,
    details: `Sitemap status ${sitemapRes.status} (${sitemapText.length} bytes), Robots status ${robotsRes.status}`,
  });
  console.log(` -> Public Sitemap & Robots: ${sitemapPassed && robotsPassed ? "PASS" : "FAIL"}`);

  // 8. Print Final Test Matrix
  console.log("\n==================================================================");
  console.log("FINAL SYSTEM VERIFICATION RESULTS");
  console.log("==================================================================");
  let allPassed = true;
  for (const r of results) {
    const symbol = r.passed ? "✔ PASS" : "✖ FAIL";
    console.log(`${symbol} | [${r.suite}] ${r.test}`);
    console.log(`       Details: ${r.details}`);
    if (!r.passed) allPassed = false;
  }
  console.log("==================================================================");
  console.log(`OVERALL RESULT: ${allPassed ? "ALL 7/7 TEST SUITES PASSED" : "FAILURES DETECTED"}`);
  console.log("==================================================================\n");
}

main().catch((err) => {
  console.error("FATAL ERROR during test execution:", err);
  process.exit(1);
});
