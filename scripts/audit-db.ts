import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, phone: true, name: true, role: true, status: true },
  });
  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, category: true, district: true, sector: true },
  });
  const communities = await prisma.community.findMany({
    select: { id: true, name: true, sector: true },
  });
  const audits = await prisma.auditLog.count();
  const sessions = await prisma.session.count();
  const settings = await prisma.platformSettings.findUnique({ where: { id: "default" } });

  console.log("=== SUPABASE DATABASE AUDIT SUMMARY ===");
  console.log("Users:", JSON.stringify(users, null, 2));
  console.log("Businesses Count:", businesses.length, JSON.stringify(businesses, null, 2));
  console.log("Communities:", JSON.stringify(communities, null, 2));
  console.log("Total Audit Logs:", audits);
  console.log("Total Active Sessions:", sessions);
  console.log("Platform Settings:", JSON.stringify(settings, null, 2));
}

check()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
