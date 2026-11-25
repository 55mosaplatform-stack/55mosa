import { prisma } from "../src/lib/prisma";
import { parseSearchQuery } from "../src/lib/search-nlp";

const SEARCH_STOPWORDS = new Set([
  "a", "an", "the", "in", "at", "for", "of", "and", "or", "to", "from", "on", "by",
  "with", "near", "muri", "ku", "ya", "na", "mu", "hafi", "za", "wa", "rwanda", "kigali"
]);

function buildLocationOrConditions(locationTerm: string) {
  const clean = locationTerm.trim();
  const tokens: string[] = [clean];
  const words = clean.replace(/[(),]/g, " ").split(/\s+/).filter(w => w.length >= 3);
  for (const w of words) if (!tokens.includes(w)) tokens.push(w);

  return tokens.flatMap(token => [
    { cell: { contains: token, mode: "insensitive" as const } },
    { addressNote: { contains: token, mode: "insensitive" as const } },
    { nearestLandmark: { contains: token, mode: "insensitive" as const } },
    { streetName: { contains: token, mode: "insensitive" as const } },
    { nearbyPlace: { contains: token, mode: "insensitive" as const } },
    { locationDescription: { contains: token, mode: "insensitive" as const } },
  ]);
}

async function runTestSearch(search: string) {
  const parsedNlp = parseSearchQuery(search);
  const q = (parsedNlp.cleanQuery || search).trim();
  const where: any = { status: "ACTIVE" };
  where.AND = [];

  const rawTokens = `${search} ${q}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gi, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !SEARCH_STOPWORDS.has(t));
  const tokens = Array.from(new Set(rawTokens));

  const orConditions: any[] = [];
  const buildTermConditions = (term: string) => [
    { name: { contains: term, mode: "insensitive" as const } },
    { description: { contains: term, mode: "insensitive" as const } },
    { categoryDisplay: { contains: term, mode: "insensitive" as const } },
    { businessTypeDisplay: { contains: term, mode: "insensitive" as const } },
    { businessType: { contains: term, mode: "insensitive" as const } },
    { subCategory: { contains: term, mode: "insensitive" as const } },
    { nearestLandmark: { contains: term, mode: "insensitive" as const } },
    { streetName: { contains: term, mode: "insensitive" as const } },
    { nearbyPlace: { contains: term, mode: "insensitive" as const } },
    { locationDescription: { contains: term, mode: "insensitive" as const } },
    { cell: { contains: term, mode: "insensitive" as const } },
    { sector: { contains: term, mode: "insensitive" as const } },
    { district: { contains: term, mode: "insensitive" as const } },
    { addressNote: { contains: term, mode: "insensitive" as const } },
    { products: { some: { name: { contains: term, mode: "insensitive" as const } } } },
    { products: { some: { description: { contains: term, mode: "insensitive" as const } } } },
  ];

  if (q) orConditions.push(...buildTermConditions(q));
  if (search.trim() !== q) orConditions.push(...buildTermConditions(search.trim()));
  for (const token of tokens) orConditions.push(...buildTermConditions(token));
  if (parsedNlp.detectedCategory) {
    orConditions.push(
      { category: parsedNlp.detectedCategory },
      { mainCategory: parsedNlp.detectedCategory },
      { categoryDisplay: { contains: parsedNlp.detectedCategory, mode: "insensitive" as const } }
    );
  }
  if (parsedNlp.matchedLandmark) orConditions.push(...buildLocationOrConditions(parsedNlp.matchedLandmark));
  if (parsedNlp.matchedSector) {
    orConditions.push(
      { sector: { contains: parsedNlp.matchedSector, mode: "insensitive" as const } },
      { sectorRel: { name: { contains: parsedNlp.matchedSector, mode: "insensitive" as const } } },
      { addressNote: { contains: parsedNlp.matchedSector, mode: "insensitive" as const } },
      { locationDescription: { contains: parsedNlp.matchedSector, mode: "insensitive" as const } }
    );
  }
  if (parsedNlp.matchedCell) {
    orConditions.push(
      { cell: { contains: parsedNlp.matchedCell, mode: "insensitive" as const } },
      { cellRel: { name: { contains: parsedNlp.matchedCell, mode: "insensitive" as const } } }
    );
  }
  if (parsedNlp.matchedDistrict) {
    orConditions.push(
      { district: { contains: parsedNlp.matchedDistrict, mode: "insensitive" as const } },
      { addressNote: { contains: parsedNlp.matchedDistrict, mode: "insensitive" as const } }
    );
  }

  if (orConditions.length > 0) {
    where.AND.push({ OR: orConditions });
  }

  const businesses = await prisma.business.findMany({
    where,
    include: { products: true }
  });

  businesses.forEach((biz: any) => {
    let searchScore = 0;
    const normSearch = search.toLowerCase().trim();
    const normClean = (parsedNlp?.cleanQuery || search).toLowerCase().trim();
    const bizName = (biz.name || "").toLowerCase();
    const bizDesc = (biz.description || "").toLowerCase();
    const bizCat = (biz.category || "").toLowerCase();
    const bizCatDisplay = (biz.categoryDisplay || "").toLowerCase();
    const bizSector = (biz.sector || "").toLowerCase();
    const bizCell = (biz.cell || "").toLowerCase();
    const bizDist = (biz.district || "").toLowerCase();
    const bizLandmark = (biz.nearestLandmark || "").toLowerCase();
    const bizDirections = (biz.locationDescription || "").toLowerCase();
    const bizProducts = Array.isArray(biz.products) ? biz.products : [];

    if (bizName.includes(normClean) || bizName.includes(normSearch)) searchScore += 50000;
    if (bizCatDisplay.includes(normClean) || bizCat.includes(normClean)) searchScore += 30000;

    for (const prod of bizProducts) {
      const pName = (prod.name || "").toLowerCase();
      const pDesc = (prod.description || "").toLowerCase();
      if (pName.includes(normClean) || pName.includes(normSearch)) searchScore += 45000;
      if (pDesc.includes(normClean) || pDesc.includes(normSearch)) searchScore += 25000;
    }

    for (const token of tokens) {
      if (bizName.includes(token)) searchScore += 18000;
      if (bizCatDisplay.includes(token) || bizCat.includes(token)) searchScore += 12000;
      if (bizDesc.includes(token)) searchScore += 6000;
      if (bizSector.includes(token) || bizCell.includes(token) || bizDist.includes(token)) searchScore += 14000;
      if (bizLandmark.includes(token) || bizDirections.includes(token)) searchScore += 14000;

      for (const prod of bizProducts) {
        const pName = (prod.name || "").toLowerCase();
        const pDesc = (prod.description || "").toLowerCase();
        if (pName.includes(token)) searchScore += 18000;
        if (pDesc.includes(token)) searchScore += 10000;
      }
    }

    if (parsedNlp?.detectedCategory && (bizCat === parsedNlp.detectedCategory || biz.mainCategory === parsedNlp.detectedCategory)) {
      searchScore += 30000;
    }
    if (parsedNlp?.matchedSector && bizSector.includes(parsedNlp.matchedSector.toLowerCase())) {
      searchScore += 40000;
    }
    if (parsedNlp?.matchedLandmark && (bizLandmark.includes(parsedNlp.matchedLandmark.toLowerCase()) || bizDirections.includes(parsedNlp.matchedLandmark.toLowerCase()))) {
      searchScore += 40000;
    }

    biz._score = searchScore;
  });

  businesses.sort((a: any, b: any) => b._score - a._score);
  return businesses;
}

async function main() {
  const queries = [
    "perfume",
    "headsets",
    "retail shop",
    "kacyiru",
    "janvier",
    "perfume in kacyiru",
    "perfume shop",
    "perfume kacyiru",
    "headsets shop",
    "kacyiru shop",
    "art",
    "ishyuka",
    "remera",
    "art in remera",
    "sacco",
    "sweet love perfume",
    "shop"
  ];

  console.log("=== TESTING SEARCH LOGIC AGAINST REAL DATABASE ===");
  for (const q of queries) {
    const results = await runTestSearch(q);
    const top = results[0];
    console.log(`Query: "${q.padEnd(20)}" -> ${results.length} results | Top: ${top ? `${top.name} (Score: ${top._score})` : "None"}`);
  }
}

main().catch(console.error);
