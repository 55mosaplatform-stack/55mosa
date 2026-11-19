import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function testAdapter() {
  const connectionString = process.env.DATABASE_URL;
  console.log("Testing with DATABASE_URL:", connectionString ? "Present" : "Missing");

  if (!connectionString) {
    throw new Error("DATABASE_URL missing in environment");
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log("Connecting via Prisma Client + @prisma/adapter-pg...");
  const t0 = Date.now();
  const businesses = await prisma.business.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, category: true, district: true, status: true, dataStatus: true }
  });
  const dur = Date.now() - t0;

  console.log(`Query successful in ${dur}ms! Found ${businesses.length} verified businesses:`);
  console.log(businesses);

  const usersCount = await prisma.user.count();
  console.log("Total users in Supabase:", usersCount);

  await prisma.$disconnect();
  await pool.end();
}

testAdapter().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
