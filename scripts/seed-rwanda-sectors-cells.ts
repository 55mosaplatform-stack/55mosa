import { prisma } from "../src/lib/prisma";
import { RWANDA_HIERARCHY } from "../src/lib/rwanda-geo";

/**
 * 55 MOSA — Seed Geographic Hierarchy (Provinces -> Districts -> Sectors -> Cells -> Local Areas)
 * Safely upserts all geographic entities so that database queries for sectors and cells never return empty arrays.
 */

async function main() {
  console.log("==================================================================");
  console.log("55 MOSA — GEOGRAPHIC SECTORS & CELLS DATABASE SEEDING");
  console.log("Timestamp:", new Date().toISOString());
  console.log("==================================================================");

  let districtsCreated = 0;
  let sectorsCreated = 0;
  let cellsCreated = 0;
  let localAreasCreated = 0;

  // Province code mapping
  const provinceCodeMap: Record<string, string> = {
    kigali: "KIGALI",
    north: "NORTH",
    south: "SOUTH",
    east: "EAST",
    west: "WEST",
  };

  // Default coordinates per district if not in hierarchy
  const districtCoords: Record<string, { lat: number; lng: number }> = {
    gasabo: { lat: -1.9365, lng: 30.0868 },
    nyarugenge: { lat: -1.981, lng: 30.046 },
    kicukiro: { lat: -1.988, lng: 30.103 },
    musanze: { lat: -1.4998, lng: 29.6349 },
    gicumbi: { lat: -1.5768, lng: 30.0682 },
    burera: { lat: -1.4391, lng: 29.8394 },
    rulindo: { lat: -1.7372, lng: 29.9872 },
    gakenke: { lat: -1.6961, lng: 29.7891 },
    huye: { lat: -2.6006, lng: 29.7394 },
    nyanza: { lat: -2.3533, lng: 29.7497 },
    muhanga: { lat: -2.0833, lng: 29.75 },
    kamonyi: { lat: -2.0089, lng: 29.8978 },
    ruhango: { lat: -2.2222, lng: 29.7778 },
    nyamagabe: { lat: -2.4833, lng: 29.5667 },
    nyaruguru: { lat: -2.7167, lng: 29.5833 },
    gisagara: { lat: -2.6167, lng: 29.85 },
    rwamagana: { lat: -1.9489, lng: 30.4347 },
    kayonza: { lat: -1.9333, lng: 30.5667 },
    gatsibo: { lat: -1.6039, lng: 30.4578 },
    nyagatare: { lat: -1.2981, lng: 30.3278 },
    bugesera: { lat: -2.1583, lng: 30.1333 },
    ngoma: { lat: -2.1667, lng: 30.5 },
    kirehe: { lat: -2.2667, lng: 30.65 },
    rubavu: { lat: -1.6761, lng: 29.2611 },
    rusizi: { lat: -2.4833, lng: 28.9 },
    karongi: { lat: -2.1556, lng: 29.3528 },
    rutsiro: { lat: -1.9333, lng: 29.3167 },
    nyamasheke: { lat: -2.35, lng: 29.1333 },
    ngororero: { lat: -1.8667, lng: 29.6167 },
    nyabihu: { lat: -1.65, lng: 29.5 },
  };

  // Sector coordinates
  const sectorCoords: Record<string, { lat: number; lng: number }> = {
    kacyiru: { lat: -1.9365, lng: 30.0868 },
    remera: { lat: -1.946, lng: 30.093 },
    kimironko: { lat: -1.938, lng: 30.125 },
    gisozi: { lat: -1.921, lng: 30.065 },
    nyamirambo: { lat: -1.981, lng: 30.046 },
    kimisagara: { lat: -1.9675, lng: 30.0445 },
    nyarugenge: { lat: -1.952, lng: 30.062 },
    niboye: { lat: -1.988, lng: 30.103 },
    gahanga: { lat: -2.033, lng: 30.095 },
    muhoza: { lat: -1.4998, lng: 29.6349 },
    kinigi: { lat: -1.428, lng: 29.591 },
    cyanika: { lat: -1.345, lng: 29.742 },
    byumba: { lat: -1.5768, lng: 30.0682 },
    tare: { lat: -1.7372, lng: 29.9872 },
    gakenke: { lat: -1.6961, lng: 29.7891 },
    ngoma: { lat: -2.6006, lng: 29.7394 },
    busasamana: { lat: -2.3533, lng: 29.7497 },
    nyamabuye: { lat: -2.0833, lng: 29.75 },
    runda: { lat: -2.0089, lng: 29.8978 },
    ruhango: { lat: -2.2222, lng: 29.7778 },
    gasaka: { lat: -2.4833, lng: 29.5667 },
    kibeho: { lat: -2.7167, lng: 29.5833 },
    ndora: { lat: -2.6167, lng: 29.85 },
    kigabiro: { lat: -1.9489, lng: 30.4347 },
    mukarange: { lat: -1.9333, lng: 30.5667 },
    kabarore: { lat: -1.6039, lng: 30.4578 },
    nyagatare: { lat: -1.2981, lng: 30.3278 },
    nyamata: { lat: -2.1583, lng: 30.1333 },
    kibungo: { lat: -2.1667, lng: 30.5 },
    gatore: { lat: -2.2667, lng: 30.65 },
    gisenyi: { lat: -1.6761, lng: 29.2611 },
    kamembe: { lat: -2.4833, lng: 28.9 },
    bwishyura: { lat: -2.1556, lng: 29.3528 },
    gihango: { lat: -1.9333, lng: 29.3167 },
    kagano: { lat: -2.35, lng: 29.1333 },
    ngororero: { lat: -1.8667, lng: 29.6167 },
    mukamira: { lat: -1.65, lng: 29.5 },
  };

  for (const [pKey, pVal] of Object.entries(RWANDA_HIERARCHY)) {
    const pCode = provinceCodeMap[pKey] || pKey.toUpperCase();
    
    // 1. Ensure Province exists
    const province = await prisma.geographicProvince.upsert({
      where: { code: pCode },
      update: { name: pVal.name, nameRw: pVal.nameRw },
      create: {
        code: pCode,
        name: pVal.name,
        nameRw: pVal.nameRw,
      },
    });

    for (const [dKey, dVal] of Object.entries(pVal.districts)) {
      const dCode = dKey.toUpperCase();
      const dCoord = districtCoords[dKey] || { lat: -1.94, lng: 30.06 };

      // 2. Ensure District exists
      const district = await prisma.geographicDistrict.upsert({
        where: { code: dCode },
        update: {
          name: dVal.name,
          nameRw: dVal.nameRw,
          provinceId: province.id,
          latitude: dCoord.lat,
          longitude: dCoord.lng,
        },
        create: {
          code: dCode,
          name: dVal.name,
          nameRw: dVal.nameRw,
          provinceId: province.id,
          latitude: dCoord.lat,
          longitude: dCoord.lng,
        },
      });
      districtsCreated++;

      for (const [sKey, sVal] of Object.entries(dVal.sectors)) {
        const sCode = `${dCode}_${sKey.toUpperCase()}`;
        const sCoord = sectorCoords[sKey] || dCoord;

        // 3. Ensure Sector exists
        const sector = await prisma.geographicSector.upsert({
          where: { code: sCode },
          update: {
            name: sVal.name,
            nameRw: sVal.nameRw,
            districtId: district.id,
            latitude: sCoord.lat,
            longitude: sCoord.lng,
            isActive: true,
          },
          create: {
            code: sCode,
            name: sVal.name,
            nameRw: sVal.nameRw,
            districtId: district.id,
            latitude: sCoord.lat,
            longitude: sCoord.lng,
            isActive: true,
          },
        });
        sectorsCreated++;

        for (const [cKey, cVal] of Object.entries(sVal.cells)) {
          // Find or create cell by sectorId and name
          let cell = await prisma.geographicCell.findFirst({
            where: {
              sectorId: sector.id,
              name: { equals: cVal.name, mode: "insensitive" },
            },
          });

          // Cell coordinates: take first community coords if available, else sector coords
          const firstComm = cVal.communities[0];
          const cellLat = firstComm ? firstComm.lat : sCoord.lat;
          const cellLng = firstComm ? firstComm.lng : sCoord.lng;

          if (!cell) {
            cell = await prisma.geographicCell.create({
              data: {
                sectorId: sector.id,
                name: cVal.name,
                nameRw: cVal.nameRw,
                latitude: cellLat,
                longitude: cellLng,
              },
            });
            cellsCreated++;
          } else {
            cell = await prisma.geographicCell.update({
              where: { id: cell.id },
              data: {
                nameRw: cVal.nameRw,
                latitude: cellLat,
                longitude: cellLng,
              },
            });
          }

          // 4. Communities / Local Areas
          for (const comm of cVal.communities) {
            const existingArea = await prisma.localArea.findFirst({
              where: {
                sectorId: sector.id,
                name: { equals: comm.name, mode: "insensitive" },
              },
            });

            if (!existingArea) {
              await prisma.localArea.create({
                data: {
                  sectorId: sector.id,
                  cellId: cell.id,
                  name: comm.name,
                  nameRw: comm.nameRw,
                  type: "COMMERCIAL_HUB",
                  latitude: comm.lat,
                  longitude: comm.lng,
                },
              });
              localAreasCreated++;
            }
          }
        }
      }
    }
  }

  console.log("Seeding complete:");
  console.log(`- Districts processed: ${districtsCreated}`);
  console.log(`- Sectors processed: ${sectorsCreated}`);
  console.log(`- Cells created/verified: ${cellsCreated}`);
  console.log(`- Local areas created: ${localAreasCreated}`);

  // Print final counts
  const finalProvs = await prisma.geographicProvince.count();
  const finalDists = await prisma.geographicDistrict.count();
  const finalSects = await prisma.geographicSector.count();
  const finalCells = await prisma.geographicCell.count();
  const finalAreas = await prisma.localArea.count();

  console.log("Final DB counts:", {
    provinces: finalProvs,
    districts: finalDists,
    sectors: finalSects,
    cells: finalCells,
    localAreas: finalAreas,
  });
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
