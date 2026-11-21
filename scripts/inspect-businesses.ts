import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      dataStatus: true,
      verificationStatus: true,
      locationVerificationStatus: true,
      category: true,
      sector: true,
      cell: true,
      isOpenNow: true,
      logo: true,
      coverImage: true,
    },
  });

  console.log("=== BUSINESSES IN SUPABASE ===");
  console.log(JSON.stringify(businesses, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
