import { prisma } from "../src/lib/prisma";

async function main() {
  const businesses = await prisma.business.findMany({
    include: {
      products: true,
      businessHours: true,
      owner: { select: { id: true, name: true, phone: true } },
    },
  });
  console.log("Businesses in Supabase:", businesses.length);
  for (const b of businesses) {
    console.log("------------------------------------------");
    console.log("Name:", b.name);
    console.log("ID:", b.id);
    console.log("District:", b.district);
    console.log("Sector:", b.sector);
    console.log("Cell:", b.cell);
    console.log("Nearest Landmark:", b.nearestLandmark);
    console.log("Street Name:", b.streetName);
    console.log("Address Note:", b.addressNote);
    console.log("Latitude:", b.latitude, "Longitude:", b.longitude);
    console.log("Products Count:", b.products.length);
    console.log("Products:", b.products.map(p => ({ id: p.id, name: p.name, price: p.price })));
  }
}

main().finally(() => prisma.$disconnect());
