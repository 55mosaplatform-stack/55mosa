import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * 55 MOSA — Production Backup Cryptographic Integrity Verification Suite
 * 
 * Verifies that an exported backup snapshot is untampered, structurally valid,
 * and contains complete platform records without performing any write operations.
 */

async function main() {
  const backupsRoot = path.join(process.cwd(), "backups", "production");
  
  if (!fs.existsSync(backupsRoot)) {
    throw new Error(`Backups directory ${backupsRoot} does not exist. Run backup-production-data.ts first.`);
  }

  const snapshotDirs = fs
    .readdirSync(backupsRoot)
    .filter((d) => d.startsWith("snapshot_"))
    .sort()
    .reverse();

  if (snapshotDirs.length === 0) {
    throw new Error("No snapshot directories found in backups/production/.");
  }

  const latestSnapshotDir = path.join(backupsRoot, snapshotDirs[0]);
  const manifestPath = path.join(latestSnapshotDir, "manifest.json");

  console.log("==================================================================");
  console.log("55 MOSA — BACKUP INTEGRITY & DISASTER RECOVERY READINESS VERIFICATION");
  console.log("Inspecting Snapshot:", latestSnapshotDir);
  console.log("Timestamp:", new Date().toISOString());
  console.log("==================================================================\n");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`Snapshot ID: ${manifest.snapshotId}`);
  console.log(`Created At:  ${manifest.createdAt}`);
  console.log(`Engine:      ${manifest.engine}`);
  console.log(`Database:    ${manifest.database}`);
  console.log(`Total Rows:  ${manifest.totalRows}\n`);

  let allHashesValid = true;
  let totalVerifiedRows = 0;

  for (const [tableName, meta] of Object.entries<any>(manifest.tables)) {
    process.stdout.write(`Verifying integrity of [${tableName}]... `);
    const filePath = path.join(latestSnapshotDir, meta.file);

    if (!fs.existsSync(filePath)) {
      console.log(`✗ File missing: ${meta.file}`);
      allHashesValid = false;
      continue;
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const computedHash = crypto.createHash("sha256").update(fileContent).digest("hex");

    if (computedHash !== meta.sha256) {
      console.log(`✗ HASH MISMATCH! Expected: ${meta.sha256}, Got: ${computedHash}`);
      allHashesValid = false;
      continue;
    }

    const records = JSON.parse(fileContent);
    if (records.length !== meta.count) {
      console.log(`✗ ROW COUNT MISMATCH! Manifest: ${meta.count}, Actual: ${records.length}`);
      allHashesValid = false;
      continue;
    }

    totalVerifiedRows += records.length;
    console.log(`✓ VALID (SHA-256 match, ${records.length} rows)`);
  }

  // Verify Foundation Pilots
  const bizPath = path.join(latestSnapshotDir, "businesses.json");
  const businesses = JSON.parse(fs.readFileSync(bizPath, "utf-8"));

  const requiredPilots = [
    "Salon Nova Style Biryogo",
    "Atelier de Couture Umwiza",
    "Cosmos Tech & Phone Clinic",
    "Kivugiza Fresh Milk & Chapati Corner",
  ];

  const missingPilots = requiredPilots.filter(
    (name) => !businesses.some((b: any) => b.name === name && b.status === "ACTIVE")
  );

  console.log("\n------------------------------------------------------------------");
  console.log("INTEGRITY VERIFICATION RESULTS");
  console.log(`All Table SHA-256 Cryptographic Signatures: ${allHashesValid ? "VERIFIED (100% MATCH)" : "FAILED"}`);
  console.log(`Total Verified Database Records:            ${totalVerifiedRows}`);
  console.log(`Foundation Pilot Enterprises Preserved:     ${missingPilots.length === 0 ? "YES (All 4 Active)" : `MISSING: ${missingPilots.join(", ")}`}`);
  console.log("------------------------------------------------------------------\n");

  if (!allHashesValid || missingPilots.length > 0) {
    throw new Error("Backup integrity verification failed!");
  }

  return { success: true, verifiedRows: totalVerifiedRows };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
