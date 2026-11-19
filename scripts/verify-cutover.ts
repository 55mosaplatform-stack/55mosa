import dns from "dns/promises";

const token = process.env.VERCEL_TOKEN || process.env.AUTH_BEARER_TOKEN || "";
const teamId = "team_MhduoDBY1d6F9Uqe61OPjOpX";
const projId = "prj_XdtdTTJNHyYwtJHTvJ09TljLb0QT";

async function checkDNS() {
  console.log("\n[1/5] Checking DNS Resolution...");
  try {
    const a = await dns.resolve4("55mosa.com");
    console.log("  55mosa.com A:", a);
    const isVercel = a.includes("76.76.21.21") || a.includes("216.198.79.1") || a.includes("64.29.17.1");
    console.log("  Points to Vercel IP?", isVercel ? "YES (76.76.21.21)" : `NO (Current: ${a.join(", ")})`);
  } catch (e: any) {
    console.log("  55mosa.com A error:", e.message);
  }

  try {
    const cname = await dns.resolveCname("www.55mosa.com");
    console.log("  www.55mosa.com CNAME:", cname);
  } catch (e: any) {
    console.log("  www.55mosa.com CNAME error:", e.code || e.message);
  }
}

async function checkVercelConfig() {
  console.log("\n[2/5] Checking Vercel Domain Configuration...");
  const res = await fetch(`https://api.vercel.com/v6/domains/55mosa.com/config?teamId=${teamId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log("  55mosa.com misconfigured:", data.misconfigured);
  console.log("  aValues seen by Vercel:", data.aValues);
}

async function testLiveEndpoints() {
  console.log("\n[3/5] Testing Live Custom Domain Endpoints (https://55mosa.com)...");

  try {
    const hRes = await fetch("https://55mosa.com/api/health");
    console.log("  GET /api/health -> Status:", hRes.status);
    const hData = await hRes.json();
    console.log("  Health payload:", {
      status: hData.status,
      database: hData.database,
      version: hData.version,
      userCount: hData.userCount,
      server: hRes.headers.get("server")
    });
  } catch (e: any) {
    console.log("  /api/health error:", e.message);
  }

  try {
    const bRes = await fetch("https://55mosa.com/api/businesses");
    console.log("  GET /api/businesses -> Status:", bRes.status);
    const bData = await bRes.json();
    console.log("  Businesses payload:", {
      success: bData.success,
      count: bData.count,
      businesses: bData.businesses?.map((b: any) => ({ id: b.id, name: b.name, category: b.category }))
    });
  } catch (e: any) {
    console.log("  /api/businesses error:", e.message);
  }

  try {
    const aRes = await fetch("https://55mosa.com/api/platform/analytics");
    console.log("  GET /api/platform/analytics -> Status:", aRes.status);
    const aData = await aRes.json();
    console.log("  Analytics summary:", aData.summary);
  } catch (e: any) {
    console.log("  /api/platform/analytics error:", e.message);
  }
}

async function testAuth() {
  console.log("\n[4/5] Testing Super Admin Authentication on https://55mosa.com...");
  try {
    const authRes = await fetch("https://55mosa.com/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "55mosaplatform@gmail.com", password: "EddyPro256" })
    });
    console.log("  POST /api/auth/login -> Status:", authRes.status);
    const authData = await authRes.json();
    console.log("  Auth response:", { success: authData.success, role: authData.user?.role, email: authData.user?.email });
  } catch (e: any) {
    console.log("  Auth error:", e.message);
  }
}

async function main() {
  console.log("=== MOSA CUSTOM DOMAIN LIVE VERIFICATION SUITE ===");
  await checkDNS();
  await checkVercelConfig();
  await testLiveEndpoints();
  await testAuth();
  console.log("\n==================================================");
}

main().catch(console.error);
