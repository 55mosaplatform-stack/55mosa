import { prisma } from "../src/lib/prisma";

async function main() {
  const localAreas = await prisma.localArea.findMany({
    where: {
      OR: [
        { name: { contains: "chic", mode: "insensitive" } },
        { landmark: { contains: "chic", mode: "insensitive" } },
        { name: { contains: "downtown", mode: "insensitive" } },
        { landmark: { contains: "downtown", mode: "insensitive" } },
        { name: { contains: "kiyovu", mode: "insensitive" } }
      ]
    }
  });
  console.log("LocalAreas:", JSON.stringify(localAreas, null, 2));

  const downtownBizs = await prisma.business.findMany({
    where: {
      OR: [
        { nearestLandmark: { contains: "downtown", mode: "insensitive" } },
        { locationDescription: { contains: "downtown", mode: "insensitive" } }
      ]
    },
    select: {
      id: true,
      name: true,
      district: true,
      sector: true,
      cell: true,
      latitude: true,
      longitude: true,
      nearestLandmark: true,
      streetName: true,
      locationDescription: true,
    }
  });
  console.log("Downtown Businesses:", JSON.stringify(downtownBizs, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
