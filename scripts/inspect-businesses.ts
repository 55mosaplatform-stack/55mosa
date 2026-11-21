import { prisma } from "../src/lib/prisma";

async function main() {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      dataStatus: true,
      verificationStatus: true,
      phone: true,
    },
  });
  console.log("Businesses in Supabase:", businesses.length);
  console.log(JSON.stringify(businesses, null, 2));
}

main().finally(() => prisma.$disconnect());
