import { prisma } from "../src/lib/prisma";

async function checkDbSize() {
  try {
    const sizeResult: any = await prisma.$queryRawUnsafe(
      "SELECT pg_size_pretty(pg_database_size(current_database())) as db_size, pg_database_size(current_database()) as raw_bytes;"
    );
    console.log("Database size on Supabase:", sizeResult);

    const tableSizes: any = await prisma.$queryRawUnsafe(`
      SELECT relname AS table_name,
             pg_size_pretty(pg_total_relation_size(relid)) AS total_size
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 10;
    `);
    console.log("Top table sizes on Supabase:", tableSizes);
  } catch (e) {
    console.error("Error querying size:", e);
  } finally {
    await prisma.$disconnect();
  }
}

checkDbSize();
