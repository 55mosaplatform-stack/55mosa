import { PrismaClient, DataStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Updating businesses in Supabase to dataStatus: VERIFIED...");

  const updateResult = await prisma.business.updateMany({
    data: {
      dataStatus: DataStatus.VERIFIED,
    },
  });

  console.log(`Updated ${updateResult.count} businesses to dataStatus: VERIFIED.`);

  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      dataStatus: true,
      verificationStatus: true,
      sector: true,
      cell: true,
    },
  });

  console.log("Updated Businesses:", businesses);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
