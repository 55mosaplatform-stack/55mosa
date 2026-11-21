import { prisma } from "../src/lib/prisma";

async function main() {
  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, status: true, verificationStatus: true },
  });
  console.log("Businesses in Supabase DB count:", businesses.length);
  for (const b of businesses) {
    console.log(` - ${b.name} (Status: ${b.status}, Verification: ${b.verificationStatus})`);
  }

  const alerts = await prisma.$queryRawUnsafe(`SELECT * FROM "operational_alerts" WHERE "status" != 'RESOLVED'`);
  console.log("Active alerts in DB:", JSON.stringify(alerts, null, 2));
}

main().finally(() => prisma.$disconnect());
