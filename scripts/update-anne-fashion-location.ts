import { prisma } from "../src/lib/prisma";

async function main() {
  const CHIC_COORDINATES = {
    lat: -1.9448,
    lng: 30.0583,
  };

  const kiyovuCell = await prisma.geographicCell.findFirst({
    where: { name: "Kiyovu" },
    include: {
      sectorRel: {
        include: {
          districtRel: {
            include: { province: true }
          }
        }
      }
    }
  });

  const downtownLocalArea = await prisma.localArea.findFirst({
    where: { name: { contains: "Downtown Commercial Center" } }
  });

  console.log("Kiyovu Cell:", kiyovuCell?.id, "Sector:", kiyovuCell?.sectorRel.id, "District:", kiyovuCell?.sectorRel.districtRel.id, "Province:", kiyovuCell?.sectorRel.districtRel.province.id);
  console.log("LocalArea:", downtownLocalArea?.id, downtownLocalArea?.name);

  // 1. Update Anne Fashion
  const updatedAnne = await prisma.business.update({
    where: { id: "cmwxhhawc0002ld07wpyprnyu" },
    data: {
      provinceId: kiyovuCell?.sectorRel.districtRel.province.id,
      districtId: kiyovuCell?.sectorRel.districtRel.id,
      sectorId: kiyovuCell?.sectorRel.id,
      cellId: kiyovuCell?.id,
      localAreaId: downtownLocalArea?.id,
      district: "Nyarugenge",
      sector: "Nyarugenge",
      cell: "Kiyovu",
      locationDescription: "Kigali Town, inside Chic Building, close to Kigali Universe.",
      nearestLandmark: "Inside Chic Building, close to Kigali Universe & Downtown Bus Park",
      streetName: "KN 2 Ave, Chic Building",
      nearbyPlace: "Kigali Universe",
      addressNote: `[Precision: Verified Physical Premises - CHIC Building Downtown Kigali] ${downtownLocalArea?.id || ""}`,
      latitude: CHIC_COORDINATES.lat,
      longitude: CHIC_COORDINATES.lng,
      locationSource: "MAP_SELECTION",
      locationVerificationStatus: "BUSINESS_CONFIRMED",
      verificationStatus: "HIGH_CONFIDENCE",
      lastVerifiedAt: new Date(),
    }
  });
  console.log("=== Updated Anne Fashion ===");
  console.log(JSON.stringify(updatedAnne, null, 2));

  // 2. Also align Kigali Clothes with the verified coordinates & verified location description
  const updatedKigaliClothes = await prisma.business.update({
    where: { id: "cmwxg3lir0002l507pw8kfunv" },
    data: {
      provinceId: kiyovuCell?.sectorRel.districtRel.province.id,
      districtId: kiyovuCell?.sectorRel.districtRel.id,
      sectorId: kiyovuCell?.sectorRel.id,
      cellId: kiyovuCell?.id,
      localAreaId: downtownLocalArea?.id,
      district: "Nyarugenge",
      sector: "Nyarugenge",
      cell: "Kiyovu",
      locationDescription: "Kigali Town, inside Chic Building, close to Kigali Universe.",
      nearestLandmark: "Inside Chic Building, close to Kigali Universe & Downtown Bus Park",
      streetName: "KN 2 Ave, Chic Building",
      nearbyPlace: "Kigali Universe",
      addressNote: `[Precision: Verified Physical Premises - CHIC Building Downtown Kigali] ${downtownLocalArea?.id || ""}`,
      latitude: CHIC_COORDINATES.lat,
      longitude: CHIC_COORDINATES.lng,
      locationSource: "MAP_SELECTION",
      locationVerificationStatus: "BUSINESS_CONFIRMED",
      verificationStatus: "HIGH_CONFIDENCE",
      lastVerifiedAt: new Date(),
    }
  });
  console.log("=== Updated Kigali Clothes ===");
  console.log(JSON.stringify(updatedKigaliClothes, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
