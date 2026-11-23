import { prisma } from "../src/lib/prisma";

/**
 * 55 MOSA — Production Location & Product Deduplication Fix Script
 * 
 * 1. Corrects JANVIER RETAIL SHOP:
 *    District: Gasabo
 *    Sector: Kacyiru
 *    Cell: Kamutwa
 *    Coordinates: lat -1.9365, lng 30.0868 (near Sacco Kacyiru / KG 548 st 24)
 * 
 * 2. Corrects Ishyuka Arts:
 *    District: Gasabo
 *    Sector: Remera
 *    Cell: Nyabisindu
 *    Coordinates: lat -1.9460, lng 30.0930 (near Kigali Golf Course / KG 565 st)
 * 
 * 3. Safely removes the 6 duplicate products for Janvier Retail Shop,
 *    retaining the 3 canonical items (Perfume, Headsets, Sweet love perfume).
 */

async function main() {
  console.log("==================================================================");
  console.log("55 MOSA — PRODUCTION LOCATION & PRODUCT DEDUPLICATION FIX");
  console.log("Timestamp:", new Date().toISOString());
  console.log("==================================================================");

  // 1. Fetch geographic IDs
  const gasaboDistrict = await prisma.geographicDistrict.findFirst({
    where: { name: { equals: "Gasabo", mode: "insensitive" } },
  });
  const kacyiruSector = await prisma.geographicSector.findFirst({
    where: { name: { equals: "Kacyiru", mode: "insensitive" } },
  });
  const kamutwaCell = await prisma.geographicCell.findFirst({
    where: { name: { equals: "Kamutwa", mode: "insensitive" } },
  });
  const remeraSector = await prisma.geographicSector.findFirst({
    where: { name: { equals: "Remera", mode: "insensitive" } },
  });
  const nyabisinduCell = await prisma.geographicCell.findFirst({
    where: { name: { equals: "Nyabisindu", mode: "insensitive" } },
  });

  console.log("Resolved Geographic Entities:", {
    gasaboDistrictId: gasaboDistrict?.id,
    kacyiruSectorId: kacyiruSector?.id,
    kamutwaCellId: kamutwaCell?.id,
    remeraSectorId: remeraSector?.id,
    nyabisinduCellId: nyabisinduCell?.id,
  });

  // 2. Update JANVIER RETAIL SHOP
  const janvier = await prisma.business.findFirst({
    where: { name: { contains: "JANVIER", mode: "insensitive" } },
  });

  if (janvier) {
    const updatedJanvier = await prisma.business.update({
      where: { id: janvier.id },
      data: {
        district: "Gasabo",
        districtId: gasaboDistrict?.id || null,
        sector: "Kacyiru",
        sectorId: kacyiruSector?.id || null,
        cell: "Kamutwa",
        cellId: kamutwaCell?.id || null,
        latitude: -1.9365,
        longitude: 30.0868,
        locationVerificationStatus: "AGENT_CAPTURED",
      },
    });
    console.log("Updated JANVIER RETAIL SHOP location:", {
      id: updatedJanvier.id,
      name: updatedJanvier.name,
      district: updatedJanvier.district,
      sector: updatedJanvier.sector,
      cell: updatedJanvier.cell,
      latitude: updatedJanvier.latitude,
      longitude: updatedJanvier.longitude,
    });
  } else {
    console.warn("JANVIER RETAIL SHOP not found!");
  }

  // 3. Update Ishyuka Arts
  const ishyuka = await prisma.business.findFirst({
    where: { name: { contains: "Ishyuka", mode: "insensitive" } },
  });

  if (ishyuka) {
    const updatedIshyuka = await prisma.business.update({
      where: { id: ishyuka.id },
      data: {
        district: "Gasabo",
        districtId: gasaboDistrict?.id || null,
        sector: "Remera",
        sectorId: remeraSector?.id || null,
        cell: "Nyabisindu",
        cellId: nyabisinduCell?.id || null,
        latitude: -1.946,
        longitude: 30.093,
        locationVerificationStatus: "AGENT_CAPTURED",
      },
    });
    console.log("Updated Ishyuka Arts location:", {
      id: updatedIshyuka.id,
      name: updatedIshyuka.name,
      district: updatedIshyuka.district,
      sector: updatedIshyuka.sector,
      cell: updatedIshyuka.cell,
      latitude: updatedIshyuka.latitude,
      longitude: updatedIshyuka.longitude,
    });
  } else {
    console.warn("Ishyuka Arts not found!");
  }

  // 4. Clean duplicate products for Janvier Retail Shop
  if (janvier) {
    const products = await prisma.product.findMany({
      where: { businessId: janvier.id },
      orderBy: { createdAt: "asc" },
    });

    console.log(`Janvier currently has ${products.length} products.`);
    
    // Group by lowercase trimmed name
    const grouped = new Map<string, typeof products>();
    for (const p of products) {
      const key = p.name.trim().toLowerCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }

    let deletedCount = 0;
    for (const [name, items] of grouped.entries()) {
      if (items.length > 1) {
        // Keep the first one (canonical item)
        const canonical = items[0];
        const duplicates = items.slice(1);
        console.log(`Found ${duplicates.length} duplicates for "${canonical.name}". Keeping canonical id: ${canonical.id}`);

        for (const dup of duplicates) {
          // Delete audit/history references if any
          await prisma.businessChangeHistory.deleteMany({
            where: { productId: dup.id },
          }).catch(() => {});
          
          await prisma.product.delete({
            where: { id: dup.id },
          });
          deletedCount++;
          console.log(`  - Deleted duplicate product id: ${dup.id} (${dup.name})`);
        }
      }
    }

    console.log(`Duplicate cleanup complete. Total deleted: ${deletedCount}`);

    // Verify remaining products
    const remainingProducts = await prisma.product.findMany({
      where: { businessId: janvier.id },
      select: { id: true, name: true, price: true, createdAt: true },
    });
    console.log("Remaining unique products for Janvier Retail Shop:", remainingProducts);
  }

  console.log("==================================================================");
  console.log("FIX COMPLETED SUCCESSFULLY");
  console.log("==================================================================");
}

main()
  .catch((e) => {
    console.error("Fix script failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
