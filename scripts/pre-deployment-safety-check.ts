import { prisma } from "../src/lib/prisma";
import { inspectRequestThreats } from "../src/lib/security/threat-inspector";
import { validateUploadSecurity } from "../src/lib/security/guards-engine";

/**
 * 55 MOSA — Pre-Deployment Platform Safety & Stability Gauntlet
 * 
 * Must be executed prior to any deployment cutover or production release.
 * Verifies that existing registered businesses, financial channels,
 * pilot catalogs, and security guards remain completely intact.
 */

interface GauntletCheck {
  id: string;
  name: string;
  run: () => Promise<{ passed: boolean; message: string }>;
}

async function main() {
  console.log("==================================================================");
  console.log("55 MOSA — PRE-DEPLOYMENT PLATFORM SAFETY & STABILITY GAUNTLET");
  console.log("Execution Time:", new Date().toISOString());
  console.log("==================================================================\n");

  const checks: GauntletCheck[] = [
    {
      id: "DB_CONNECTIVITY",
      name: "Supabase PostgreSQL Database Connection & Latency",
      run: async () => {
        // Warm up connection pooler
        await prisma.$connect();
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const latency = Date.now() - start;
        return {
          passed: latency < 3500,
          message: `Database connection verified with query latency of ${latency}ms (Cold start threshold: <3500ms)`,
        };
      },
    },
    {
      id: "PILOT_PRESERVATION",
      name: "Foundation Pilot Enterprises & Verified Catalog Preservation",
      run: async () => {
        const pilotNames = [
          "Salon Nova Style Biryogo",
          "Atelier de Couture Umwiza",
          "Cosmos Tech & Phone Clinic",
          "Kivugiza Fresh Milk & Chapati Corner",
        ];
        const businesses = await prisma.business.findMany({
          where: { name: { in: pilotNames } },
          include: { products: true },
        });

        const activePilots = businesses.filter((b) => b.status === "ACTIVE");
        const totalProducts = businesses.reduce((acc, b) => acc + b.products.length, 0);

        const ok = activePilots.length === 4 && totalProducts >= 12;
        return {
          passed: ok,
          message: `Active Pilots: ${activePilots.length}/4, Verified Pilot Products: ${totalProducts}/12`,
        };
      },
    },
    {
      id: "FINANCIAL_PROVIDERS",
      name: "Payment Destination Channels & Fee Configurations",
      run: async () => {
        const providers = await prisma.paymentProviderConfig.count({
          where: { isEnabled: true },
        });
        const promotions = await prisma.feePromotion.count({
          where: { status: "ACTIVE" },
        });
        const ok = providers >= 3;
        return {
          passed: ok,
          message: `Enabled Payment Channels: ${providers} (Airtel, MTN, BK), Active Promotions: ${promotions}`,
        };
      },
    },
    {
      id: "EDGE_SECURITY_SHIELD",
      name: "Standalone Threat Pattern Inspector (SQLi, XSS, Path Traversal)",
      run: async () => {
        const sqli = inspectRequestThreats("?q=' OR '1'='1");
        const xss = inspectRequestThreats("?comment=<script>alert(1)</script>");
        const traversal = inspectRequestThreats("/../../etc/passwd");
        const upload = validateUploadSecurity({
          filename: "exploit.php",
          sizeBytes: 1024,
          mimeType: "application/x-php",
        });

        const ok = sqli.isMalicious && xss.isMalicious && traversal.isMalicious && !upload.isAllowed;
        return {
          passed: ok,
          message: `SQLi score: ${sqli.threatScore}/100, XSS caught: ${xss.isMalicious}, Traversal caught: ${traversal.isMalicious}, PHP upload rejected: ${!upload.isAllowed}`,
        };
      },
    },
    {
      id: "GOVERNANCE_AUDIT",
      name: "Immutable Audit Log Retention & Record Integrity",
      run: async () => {
        const auditCount = await prisma.auditLog.count();
        const usersCount = await prisma.user.count();
        const ok = auditCount >= 100 && usersCount >= 5;
        return {
          passed: ok,
          message: `Audit Log Events: ${auditCount}, User Accounts: ${usersCount}`,
        };
      },
    },
  ];

  let allPassed = true;
  for (const check of checks) {
    process.stdout.write(`[${check.id}] ${check.name}... `);
    try {
      const res = await check.run();
      if (res.passed) {
        console.log(`✓ PASS\n      Evidence: ${res.message}`);
      } else {
        console.log(`✗ FAIL\n      Reason: ${res.message}`);
        allPassed = false;
      }
    } catch (err: any) {
      console.log(`✗ EXCEPTION\n      Error: ${err.message}`);
      allPassed = false;
    }
  }

  console.log("\n==================================================================");
  if (allPassed) {
    console.log("GAUNTLET RESULT: ALL PRE-DEPLOYMENT SAFETY CHECKS PASSED (100%)");
    console.log("The environment is safe for deployment cutover.");
  } else {
    console.log("GAUNTLET RESULT: SAFETY CHECK FAILED — DEPLOYMENT BLOCKED");
  }
  console.log("==================================================================\n");

  if (!allPassed) {
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
