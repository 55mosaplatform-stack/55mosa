import { prisma } from "../src/lib/prisma";

async function inspectStorage() {
  console.log("==========================================================================");
  console.log("  MOSA — NEON DATABASE STORAGE & OBJECT INSPECTION (READ-ONLY)");
  console.log("==========================================================================\n");

  try {
    // 1. Total Database Size
    const [dbSizeRes]: any = await prisma.$queryRawUnsafe(`
      SELECT 
        current_database() AS db_name,
        pg_database_size(current_database()) AS db_bytes,
        pg_size_pretty(pg_database_size(current_database())) AS db_size_pretty;
    `);
    console.log(`[DATABASE METRICS]`);
    console.log(`Database Name: ${dbSizeRes.db_name}`);
    console.log(`Total Database Size: ${dbSizeRes.db_size_pretty} (${Number(dbSizeRes.db_bytes).toLocaleString()} bytes)`);

    // 2. All User Tables in Schema
    console.log("\n[TOP TABLES BY TOTAL STORAGE CONSUMPTION]");
    const tableSizes: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        c.relname AS table_name,
        pg_stat_get_live_tuples(c.oid) AS estimated_rows,
        pg_total_relation_size(c.oid) AS total_bytes,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
        pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
        pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size,
        pg_size_pretty(COALESCE(pg_total_relation_size(reltoastrelid), 0)) AS toast_size
      FROM pg_class c
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname = 'public'
      ORDER BY pg_total_relation_size(c.oid) DESC;
    `);

    console.table(
      tableSizes.map((t) => ({
        Table: t.table_name,
        Rows: Number(t.estimated_rows),
        "Total Size": t.total_size,
        "Table Data": t.table_size,
        Indexes: t.indexes_size,
        TOAST: t.toast_size,
        Bytes: Number(t.total_bytes),
      }))
    );

    // 3. Inspect Largest Indexes
    console.log("\n[TOP 15 LARGEST INDEXES]");
    const indexSizes: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        c.relname AS index_name,
        t.relname AS table_name,
        pg_relation_size(c.oid) AS bytes,
        pg_size_pretty(pg_relation_size(c.oid)) AS index_size
      FROM pg_class c
      JOIN pg_index i ON i.indexrelid = c.oid
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'i' AND n.nspname = 'public'
      ORDER BY pg_relation_size(c.oid) DESC
      LIMIT 15;
    `);

    console.table(
      indexSizes.map((idx) => ({
        Index: idx.index_name,
        Table: idx.table_name,
        Size: idx.index_size,
        Bytes: Number(idx.bytes),
      }))
    );

    // 4. Inspect Tables Not Managed in Prisma Schema
    console.log("\n[POTENTIAL UNMANAGED / LEGACY TABLES]");
    const schemaModelNames = [
      "User", "Session", "OtpVerification", "GeographicProvince", "GeographicDistrict",
      "GeographicSector", "GeographicCell", "LocalArea", "AgentAssignment", "Community",
      "Business", "BusinessClaim", "Product", "BusinessHour", "BusinessMedia",
      "ReceiptCapture", "ReceiptItem", "VerificationRecord", "Review", "Report",
      "Offer", "Mission", "CommunityDemand", "SearchEvent", "BusinessViewEvent",
      "Notification", "PartnerAnnouncement", "AuditLog", "BusinessChangeHistory",
      "BusinessReminder", "SMSMessage", "BusinessPurchase", "MonthlyFinancialReport",
      "BusinessExpense", "BusinessInventoryItem", "BusinessUpdate", "BusinessOpportunity",
      "OpportunityInquiry", "CustomerInquiry", "PlatformSettings", "RegistrationFeeConfig",
      "PaymentProviderConfig", "RegistrationPayment", "FeePromotion", "RegistrationReceipt",
      "RenewalNotificationLog", "PaymentBridgeDevice", "PaymentRateLimit", "_prisma_migrations"
    ].map(m => m.toLowerCase());

    const unmanagedTables = tableSizes.filter(
      (t) => !schemaModelNames.includes(t.table_name.toLowerCase())
    );

    if (unmanagedTables.length > 0) {
      console.log(`Found ${unmanagedTables.length} unmanaged tables:`);
      console.table(
        unmanagedTables.map((t) => ({
          Table: t.table_name,
          Rows: Number(t.estimated_rows),
          "Total Size": t.total_size,
        }))
      );
    } else {
      console.log("No unmanaged tables found.");
    }

    // 5. Inspect Content / Column Size Outliers (Base64 or large text)
    console.log("\n[CHECKING LARGE COLUMN CONTENT IN BUSINESS, MEDIA & AUDIT]");
    try {
      const [mediaStats]: any = await prisma.$queryRawUnsafe(`
        SELECT 
          COUNT(*) AS count,
          pg_size_pretty(COALESCE(SUM(LENGTH("url")), 0)::bigint) AS total_url_len,
          MAX(LENGTH("url")) AS max_url_len
        FROM "BusinessMedia";
      `);
      console.log(`BusinessMedia: Count=${mediaStats.count}, Total URL chars=${mediaStats.total_url_len}, Max URL length=${mediaStats.max_url_len}`);
    } catch (e: any) {
      console.log("Could not query BusinessMedia:", e.message);
    }

    try {
      const [auditStats]: any = await prisma.$queryRawUnsafe(`
        SELECT 
          COUNT(*) AS count,
          pg_size_pretty(COALESCE(SUM(LENGTH("details")), 0)::bigint) AS total_details_len
        FROM "AuditLog";
      `);
      console.log(`AuditLog: Count=${auditStats.count}, Total Details chars=${auditStats.total_details_len}`);
    } catch (e: any) {
      console.log("Could not query AuditLog:", e.message);
    }

    try {
      const [eventStats]: any = await prisma.$queryRawUnsafe(`
        SELECT 
          (SELECT COUNT(*) FROM "SearchEvent") AS search_count,
          (SELECT COUNT(*) FROM "BusinessViewEvent") AS view_count,
          (SELECT COUNT(*) FROM "Session") AS session_count,
          (SELECT COUNT(*) FROM "SMSMessage") AS sms_count;
      `);
      console.log(`Analytics & Ephemeral Events: SearchEvents=${eventStats.search_count}, ViewEvents=${eventStats.view_count}, Sessions=${eventStats.session_count}, SMSMessages=${eventStats.sms_count}`);
    } catch (e: any) {
      console.log("Could not query Events:", e.message);
    }

    try {
      const [paymentStats]: any = await prisma.$queryRawUnsafe(`
        SELECT 
          (SELECT COUNT(*) FROM "RegistrationPayment") AS payments_count,
          (SELECT COUNT(*) FROM "RegistrationReceipt") AS receipts_count,
          (SELECT COUNT(*) FROM "Business") AS businesses_count,
          (SELECT COUNT(*) FROM "User") AS users_count;
      `);
      console.log(`Core Business & Financial Records: Payments=${paymentStats.payments_count}, Receipts=${paymentStats.receipts_count}, Businesses=${paymentStats.businesses_count}, Users=${paymentStats.users_count}`);
    } catch (e: any) {
      console.log("Could not query Core counts:", e.message);
    }

  } catch (err: any) {
    console.error("Error during storage inspection:", err);
  } finally {
    await prisma.$disconnect();
  }
}

inspectStorage();
