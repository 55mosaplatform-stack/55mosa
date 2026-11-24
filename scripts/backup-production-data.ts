import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../src/lib/prisma";

/**
 * 55 MOSA — Automated Non-Destructive Production Backup Utility
 * 
 * Extracts a complete, read-only snapshot of all core tables from Supabase PostgreSQL.
 * Generates an immutable, cryptographic SHA-256 integrity manifest.
 * NEVER writes to, modifies, or drops any production database records.
 */

interface TableBackupConfig {
  tableName: string;
  fetchFn: () => Promise<any[]>;
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(process.cwd(), "backups", "production", `snapshot_${timestamp}`);
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log("==================================================================");
  console.log("55 MOSA — AUTOMATED PRODUCTION DATA BACKUP & INTEGRITY SNAPSHOT");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Destination:", backupDir);
  console.log("Mode: STRICT READ-ONLY (Zero write operations to database)");
  console.log("==================================================================\n");

  const tables: TableBackupConfig[] = [
    {
      tableName: "businesses",
      fetchFn: () => prisma.business.findMany({ orderBy: { id: "asc" } }),
    },
    {
      tableName: "products",
      fetchFn: () => prisma.product.findMany({ orderBy: { id: "asc" } }),
    },
    {
      tableName: "users",
      fetchFn: () =>
        prisma.user.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            phone: true,
            createdAt: true,
            updatedAt: true,
            // Password hash preserved for disaster recovery credential restoration
            passwordHash: true,
          },
          orderBy: { id: "asc" },
        }),
    },
    {
      tableName: "fee_promotions",
      fetchFn: () => prisma.feePromotion.findMany({ orderBy: { id: "asc" } }),
    },
    {
      tableName: "payment_provider_configs",
      fetchFn: () => prisma.paymentProviderConfig.findMany({ orderBy: { id: "asc" } }),
    },
    {
      tableName: "registration_payments",
      fetchFn: () => prisma.registrationPayment.findMany({ orderBy: { id: "asc" } }),
    },
    {
      tableName: "audit_logs",
      fetchFn: () => prisma.auditLog.findMany({ orderBy: { id: "asc" } }),
    },
    {
      tableName: "business_claims",
      fetchFn: () => prisma.businessClaim.findMany({ orderBy: { id: "asc" } }),
    },
    {
      tableName: "payment_bridge_devices",
      fetchFn: () => prisma.paymentBridgeDevice.findMany({ orderBy: { id: "asc" } }),
    },
  ];

  const manifest: {
    snapshotId: string;
    createdAt: string;
    engine: string;
    database: string;
    tables: Record<string, { count: number; sha256: string; file: string; sizeBytes: number }>;
    totalRows: number;
    foundationPilotsIntact: boolean;
  } = {
    snapshotId: `snap_${timestamp}`,
    createdAt: new Date().toISOString(),
    engine: "55 MOSA Autonomous Recovery Engine v2.0",
    database: "Supabase PostgreSQL (EU-West-1 Ireland)",
    tables: {},
    totalRows: 0,
    foundationPilotsIntact: false,
  };

  const pilotNames = [
    "JANVIER RETAIL SHOP",
    "Ishyuka Arts",
  ];

  for (const table of tables) {
    process.stdout.write(`Exporting table [${table.tableName}]... `);
    try {
      const records = await table.fetchFn();
      const fileName = `${table.tableName}.json`;
      const filePath = path.join(backupDir, fileName);
      const jsonContent = JSON.stringify(records, null, 2);

      fs.writeFileSync(filePath, jsonContent, "utf-8");

      const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
      const stat = fs.statSync(filePath);

      manifest.tables[table.tableName] = {
        count: records.length,
        sha256: hash,
        file: fileName,
        sizeBytes: stat.size,
      };

      manifest.totalRows += records.length;
      console.log(`✓ (${records.length} records, ${(stat.size / 1024).toFixed(1)} KB)`);

      if (table.tableName === "businesses") {
        const foundPilots = pilotNames.filter((name) =>
          records.some((r: any) => r.name === name && r.status === "ACTIVE")
        );
        manifest.foundationPilotsIntact = foundPilots.length === pilotNames.length;
      }
    } catch (err: any) {
      console.log(`✗ Error: ${err.message}`);
      throw err;
    }
  }

  // Write integrity manifest
  const manifestPath = path.join(backupDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  console.log("\n------------------------------------------------------------------");
  console.log("BACKUP COMPLETED SUCCESSFULLY");
  console.log("Total Records Backed Up:", manifest.totalRows);
  console.log("Foundation Pilots Verified Intact:", manifest.foundationPilotsIntact ? `YES (${pilotNames.length}/${pilotNames.length})` : "NO");
  console.log("Integrity Manifest:", manifestPath);
  console.log("------------------------------------------------------------------\n");

  return { backupDir, manifestPath, manifest };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Backup failed:", err);
      process.exit(1);
    });
}

export { main as executeProductionBackup };
