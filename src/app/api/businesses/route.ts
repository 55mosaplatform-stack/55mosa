import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { VerificationStatus, LocationSource, LocationVerificationStatus } from "@prisma/client";
import { formatBusinessRecord } from "@/lib/format-business";
import { serializePublicBusiness } from "@/lib/public-serializer";
import { parseSearchQuery } from "@/lib/search-nlp";
import { checkNearDuplicates, haversineDistance } from "@/lib/location-quality";
import { inspectRequestThreats } from "@/lib/security/threat-inspector";

const SEARCH_STOPWORDS = new Set([
  "a", "an", "the", "in", "at", "for", "of", "and", "or", "to", "from", "on", "by",
  "with", "near", "muri", "ku", "ya", "na", "mu", "hafi", "za", "wa", "rwanda", "kigali"
]);

function buildLocationOrConditions(locationTerm: string) {
  const clean = locationTerm.trim();
  const tokens: string[] = [clean];

  const parenMatch = clean.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]) {
    tokens.push(parenMatch[1].trim());
  }

  const beforeParen = clean.split("(")[0].trim();
  if (beforeParen && beforeParen !== clean) {
    tokens.push(beforeParen);
  }

  const stopWords = new Set([
    "area", "st", "street", "rd", "road", "ave", "avenue",
    "zone", "center", "centre", "strip", "corridor", "alley",
    "near", "ahegereye", "junction"
  ]);

  const words = clean
    .replace(/[(),]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !stopWords.has(w.toLowerCase()));

  for (const w of words) {
    if (!tokens.includes(w)) {
      tokens.push(w);
    }
  }

  const orConditions: any[] = [];
  for (const token of tokens) {
    orConditions.push(
      { cell: { contains: token, mode: "insensitive" } },
      { addressNote: { contains: token, mode: "insensitive" } },
      { nearestLandmark: { contains: token, mode: "insensitive" } },
      { streetName: { contains: token, mode: "insensitive" } },
      { nearbyPlace: { contains: token, mode: "insensitive" } },
      { locationDescription: { contains: token, mode: "insensitive" } },
      { localArea: { name: { contains: token, mode: "insensitive" } } },
      { localArea: { landmark: { contains: token, mode: "insensitive" } } },
      { localArea: { addressNote: { contains: token, mode: "insensitive" } } }
    );
  }

  return orConditions;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  const mainCategory = searchParams.get("mainCategory") || undefined;
  const subCategory = searchParams.get("subCategory") || undefined;
  const businessType = searchParams.get("businessType") || undefined;
  const community = searchParams.get("community") || undefined;
  const sector = searchParams.get("sector") || undefined;
  const cell = searchParams.get("cell") || undefined;
  const dataStatus = searchParams.get("dataStatus") || undefined;
  const search = searchParams.get("search") || undefined;

  // Digital Security Guard Defense-in-Depth Threat Inspection
  if (search) {
    const threat = inspectRequestThreats(search);
    if (threat.isMalicious) {
      return NextResponse.json(
        { error: "Forbidden: Security violation pattern intercepted by 55 MOSA Shield.", threatType: threat.threatType },
        { status: 403 }
      );
    }
  }
  const openNowOnly = searchParams.get("openNowOnly") === "true";
  const verification = searchParams.get("verification") || undefined;

  const district = searchParams.get("district") || undefined;
  const districtId = searchParams.get("districtId") || undefined;
  const province = searchParams.get("province") || undefined;
  const provinceId = searchParams.get("provinceId") || undefined;
  const checkDuplicate = searchParams.get("checkDuplicate") === "true";
  const locationVerification = searchParams.get("locationVerification") || searchParams.get("locationVerificationStatus") || undefined;
  const hasOpportunities = searchParams.get("hasOpportunities") === "true";
  const targetLat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : (searchParams.get("latitude") ? parseFloat(searchParams.get("latitude")!) : undefined);
  const targetLng = searchParams.get("lng") ? parseFloat(searchParams.get("lng")!) : (searchParams.get("longitude") ? parseFloat(searchParams.get("longitude")!) : undefined);
  const userCountry = searchParams.get("userCountry") || searchParams.get("country") || undefined;
  const userCity = searchParams.get("userCity") || searchParams.get("city") || undefined;
  const strictLocation = searchParams.get("strictLocation") === "true";
  const limitParam = searchParams.get("limit");
  const pageParam = searchParams.get("page");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100) : 24;
  const page = pageParam ? Math.max(parseInt(pageParam, 10), 1) : 1;

  try {
    // Proximity duplicate detection check using Haversine algorithm
    if (checkDuplicate && (search || searchParams.get("name"))) {
      const nameQuery = (search || searchParams.get("name") || "").trim();
      const candidateBusinesses = await prisma.business.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            ...(sector ? [{ sector: { equals: sector, mode: "insensitive" as const } }] : []),
            ...(cell ? [{ cell: { equals: cell, mode: "insensitive" as const } }] : []),
            ...(provinceId ? [{ provinceId }] : []),
            ...(districtId ? [{ districtId }] : []),
          ],
        },
        select: { id: true, name: true, cell: true, sector: true, district: true, dataStatus: true, latitude: true, longitude: true, category: true },
      });

      if (typeof targetLat === "number" && typeof targetLng === "number") {
        const dupCheck = checkNearDuplicates(
          { lat: targetLat, lng: targetLng, name: nameQuery, category },
          candidateBusinesses,
          25
        );
        return NextResponse.json({
          success: true,
          isDuplicate: dupCheck.isNearDuplicate,
          matchedBusiness: dupCheck.matchedBusiness,
          distanceMeters: dupCheck.distanceMeters,
          matchesCount: dupCheck.isNearDuplicate ? 1 : 0,
        });
      }

      const existing = candidateBusinesses.filter((b) =>
        b.name.toLowerCase().includes(nameQuery.toLowerCase()) || nameQuery.toLowerCase().includes(b.name.toLowerCase())
      );

      return NextResponse.json({
        success: true,
        isDuplicate: existing.length > 0,
        matchesCount: existing.length,
        matches: existing,
      });
    }

    const where: any = {
      status: "ACTIVE",
    };

    if (mainCategory && mainCategory !== "all") {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { mainCategory },
          { category: mainCategory },
        ],
      });
    } else if (category && category !== "all") {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { mainCategory: category },
          { category },
        ],
      });
    }

    if (subCategory && subCategory !== "all") {
      where.subCategory = subCategory;
    }

    if (businessType && businessType !== "all") {
      where.businessType = businessType;
    }

    if (provinceId) {
      where.provinceId = provinceId;
    } else if (province && province !== "all") {
      where.OR = where.OR || [];
      where.provinceRel = {
        OR: [
          { name: { equals: province, mode: "insensitive" } },
          { nameRw: { equals: province, mode: "insensitive" } },
          { code: { equals: province, mode: "insensitive" } },
        ],
      };
    }

    if (districtId) {
      where.districtId = districtId;
    } else if (strictLocation && district && district !== "all") {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { district: { equals: district, mode: "insensitive" } },
          { districtRel: { name: { equals: district, mode: "insensitive" } } },
          { districtRel: { code: { equals: district, mode: "insensitive" } } },
        ],
      });
    }

    if (strictLocation && sector && sector !== "all") {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { sector: { equals: sector, mode: "insensitive" } },
          { sectorRel: { name: { equals: sector, mode: "insensitive" } } },
        ],
      });
    }

    if (strictLocation && cell && cell !== "all") {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { cell: { equals: cell, mode: "insensitive" } },
          { cellRel: { name: { equals: cell, mode: "insensitive" } } },
        ],
      });
    }

    if (community && community !== "all") {
      where.AND = where.AND || [];
      where.AND.push({
        OR: buildLocationOrConditions(community),
      });
    }

    if (dataStatus && dataStatus !== "all") {
      where.dataStatus = dataStatus;
    }

    if (openNowOnly) {
      where.isOpenNow = true;
    }

    if (verification && verification !== "all") {
      where.verificationStatus = verification as VerificationStatus;
    }

    if (locationVerification && locationVerification !== "all") {
      where.locationVerificationStatus = locationVerification as LocationVerificationStatus;
    }

    if (hasOpportunities) {
      where.opportunities = {
        some: {
          status: "OPEN",
          moderationStatus: "APPROVED",
        },
      };
    }

    let parsedNlp: any = null;

    if (search) {
      parsedNlp = parseSearchQuery(search);
      const q = (parsedNlp.cleanQuery || search).trim();
      where.AND = where.AND || [];

      // Extract search tokens across full query and clean query, skipping stopwords
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
        { nameRw: { contains: term, mode: "insensitive" as const } },
        { nameFr: { contains: term, mode: "insensitive" as const } },
        { nameSw: { contains: term, mode: "insensitive" as const } },
        { description: { contains: term, mode: "insensitive" as const } },
        { descriptionRw: { contains: term, mode: "insensitive" as const } },
        { categoryDisplay: { contains: term, mode: "insensitive" as const } },
        { categoryDisplayRw: { contains: term, mode: "insensitive" as const } },
        { businessTypeDisplay: { contains: term, mode: "insensitive" as const } },
        { businessTypeDisplayRw: { contains: term, mode: "insensitive" as const } },
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

      // Exact phrase match conditions
      if (q) {
        orConditions.push(...buildTermConditions(q));
      }
      if (search.trim() !== q) {
        orConditions.push(...buildTermConditions(search.trim()));
      }

      // Individual token matches across goods, services, names and locations
      for (const token of tokens) {
        orConditions.push(...buildTermConditions(token));
      }

      // If category was auto-detected from NLP query, include category matches
      if (parsedNlp.detectedCategory) {
        orConditions.push(
          { category: parsedNlp.detectedCategory },
          { mainCategory: parsedNlp.detectedCategory },
          { categoryDisplay: { contains: parsedNlp.detectedCategory, mode: "insensitive" as const } }
        );
      }

      // If landmark was detected
      if (parsedNlp.matchedLandmark) {
        orConditions.push(...buildLocationOrConditions(parsedNlp.matchedLandmark));
      }

      // If sector was detected
      if (parsedNlp.matchedSector) {
        orConditions.push(
          { sector: { contains: parsedNlp.matchedSector, mode: "insensitive" as const } },
          { sectorRel: { name: { contains: parsedNlp.matchedSector, mode: "insensitive" as const } } },
          { addressNote: { contains: parsedNlp.matchedSector, mode: "insensitive" as const } },
          { locationDescription: { contains: parsedNlp.matchedSector, mode: "insensitive" as const } }
        );
      }

      // If cell was detected
      if (parsedNlp.matchedCell) {
        orConditions.push(
          { cell: { contains: parsedNlp.matchedCell, mode: "insensitive" as const } },
          { cellRel: { name: { contains: parsedNlp.matchedCell, mode: "insensitive" as const } } }
        );
      }

      // If district was detected
      if (parsedNlp.matchedDistrict) {
        orConditions.push(
          { district: { contains: parsedNlp.matchedDistrict, mode: "insensitive" as const } },
          { addressNote: { contains: parsedNlp.matchedDistrict, mode: "insensitive" as const } }
        );
      }

      if (orConditions.length > 0) {
        where.AND.push({ OR: orConditions });
      }

      // If price condition detected (e.g. under 2000 Frw)
      if (parsedNlp.priceMax) {
        where.AND.push({
          OR: [
            { products: { some: { price: { lte: parsedNlp.priceMax } } } },
            { priceRangeMin: { lte: parsedNlp.priceMax } },
          ],
        });
      }

      // Record search event asynchronously for Demand Intelligence
      prisma.searchEvent
        .create({
          data: {
            query: search.trim(),
            sector: sector || parsedNlp.matchedSector || null,
            cell: cell || parsedNlp.matchedCell || community || null,
          },
        })
        .catch(() => {});
    }

    const businessInclude = {
      products: {
        where: { isArchived: false, moderationStatus: { not: "REMOVED" as const } },
        take: 3,
      },
      reviews: {
        select: { id: true, rating: true, verifiedVisit: true },
      },
      businessHours: true,
      localArea: true,
      media: {
        where: { moderationStatus: { not: "REMOVED" as const } },
        take: 2,
      },
      opportunities: {
        where: {
          status: "OPEN" as const,
          moderationStatus: "APPROVED" as const,
        },
        take: 2,
      },
    };

    let businesses: any[] = [];
    try {
      businesses = await prisma.business.findMany({
        where,
        include: businessInclude,
        orderBy: { updatedAt: "desc" },
      });
    } catch (initialDbError) {
      console.warn("[Businesses API] Transient DB pooler delay, retrying query once...", initialDbError);
      await new Promise((resolve) => setTimeout(resolve, 800));
      businesses = await prisma.business.findMany({
        where,
        include: businessInclude,
        orderBy: { updatedAt: "desc" },
      });
    }

    // -------------------------------------------------------------------------
    // MULTI-TIER PROXIMITY & VERIFICATION QUALITY DISCOVERY RANKING
    // -------------------------------------------------------------------------
    // Prioritization:
    // 1. Relevant businesses in the immediate locality (Tier 1)
    // 2. Other businesses in the same city or surrounding area (Tier 2)
    // 3. Businesses elsewhere in the same country (Tier 3)
    // 4. International businesses when relevant or when local results are limited (Tier 4)
    // + Geodesic distance boost (Haversine formula) when GPS/IP coordinates are available
    // + Commercial authenticity & verification quality boost within tiers
    const cleanUserCountry = (userCountry || "").trim().toLowerCase();
    const cleanUserCity = (userCity || "").trim().toLowerCase();
    const cleanSector = (sector && sector !== "all" ? sector : "").trim().toLowerCase();
    const cleanCell = (cell && cell !== "all" ? cell : "").trim().toLowerCase();
    const cleanDistrict = (district && district !== "all" ? district : "").trim().toLowerCase();

    businesses.forEach((biz: any) => {
      let tier = 4; // default international
      let distKm: number | null = null;
      let score = 0;

      // Extract country from addressNote or assume Rwanda
      const note = (biz.addressNote || "").toLowerCase();
      let bizCountry = "rwanda";
      if (note.includes("[country:")) {
        const m = note.match(/\[country:\s*([^|\]]+)/i);
        if (m && m[1]) bizCountry = m[1].trim().toLowerCase();
      }

      const bizSector = (biz.sector || "").trim().toLowerCase();
      const bizDistrict = (biz.district || "").trim().toLowerCase();
      const bizCell = (biz.cell || "").trim().toLowerCase();

      // Geodesic distance calculation if coordinates available
      if (
        targetLat !== undefined &&
        targetLng !== undefined &&
        typeof biz.latitude === "number" &&
        typeof biz.longitude === "number" &&
        !isNaN(targetLat) &&
        !isNaN(targetLng)
      ) {
        const distMeters = haversineDistance(targetLat, targetLng, biz.latitude, biz.longitude);
        distKm = Math.round(distMeters / 100) / 10;

        if (distMeters <= 5000) {
          score += 4000;
        } else if (distMeters <= 20000) {
          score += 2500;
        } else if (distMeters <= 75000) {
          score += 1500;
        } else if (distMeters <= 300000) {
          score += 500;
        }
      }

      // Check Tier 1: Immediate Locality
      const isImmediateLocality =
        (cleanSector && bizSector === cleanSector) ||
        (cleanCell && bizCell === cleanCell) ||
        (cleanUserCity && bizSector.includes(cleanUserCity)) ||
        (distKm !== null && distKm <= 10);

      // Check Tier 2: Same City / District
      const isSameCityOrDistrict =
        (cleanDistrict && bizDistrict === cleanDistrict) ||
        (cleanUserCity && (bizDistrict.includes(cleanUserCity) || cleanUserCity.includes(bizDistrict))) ||
        (distKm !== null && distKm <= 50);

      // Check Tier 3: Same Country
      const isSameCountry =
        cleanUserCountry &&
        (cleanUserCountry === "rw" || cleanUserCountry === "rwanda" ? bizCountry === "rwanda" :
         cleanUserCountry === "ug" || cleanUserCountry === "uganda" ? bizCountry.includes("uganda") :
         cleanUserCountry === "ke" || cleanUserCountry === "kenya" ? bizCountry.includes("kenya") :
         cleanUserCountry === "de" || cleanUserCountry === "germany" ? bizCountry.includes("germany") :
         cleanUserCountry === "gb" || cleanUserCountry === "uk" || cleanUserCountry.includes("kingdom") ? bizCountry.includes("kingdom") || bizCountry.includes("uk") :
         cleanUserCountry === "us" || cleanUserCountry === "usa" || cleanUserCountry.includes("united states") ? bizCountry.includes("united states") || bizCountry.includes("usa") :
         bizCountry.includes(cleanUserCountry));

      if (isImmediateLocality) {
        tier = 1;
        score += 25000;
      } else if (isSameCityOrDistrict) {
        tier = 2;
        score += 12000;
      } else if (isSameCountry) {
        tier = 3;
        score += 5000;
      } else {
        tier = 4;
        score += 0;
      }

      // Quality & verification boost within tier
      if (biz.dataStatus === "VERIFIED") score += 1000;
      else if (biz.dataStatus === "RESEARCHED") score += 500;

      if (biz.verificationStatus === "BUSINESS_VERIFIED") score += 400;
      else if (biz.verificationStatus === "AGENT_VERIFIED") score += 300;
      else if (biz.verificationStatus === "HIGH_CONFIDENCE") score += 200;
      else if (biz.verificationStatus === "COMMUNITY_VERIFIED") score += 100;

      const hasCover = Boolean(biz.coverImage && !biz.coverImage.includes("photo-1544816155-12df9643f363"));
      const hasMedia = Array.isArray(biz.media) && biz.media.length > 0;
      const hasProductMedia = Array.isArray(biz.products) && biz.products.some((p: any) => p.mediaUrl);
      if (hasCover) score += 100;
      else if (hasMedia || hasProductMedia) score += 80;

      if (Array.isArray(biz.products) && biz.products.length > 0) score += 20;

      // Search relevance scoring for goods, services, names and locations
      let searchScore = 0;
      if (search) {
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

        // Exact phrase matches on name, goods, services
        if (bizName.includes(normClean) || bizName.includes(normSearch)) {
          searchScore += 50000;
        }
        if (bizCatDisplay.includes(normClean) || bizCat.includes(normClean)) {
          searchScore += 30000;
        }
        for (const prod of bizProducts) {
          const pName = (prod.name || "").toLowerCase();
          const pDesc = (prod.description || "").toLowerCase();
          if (pName.includes(normClean) || pName.includes(normSearch)) {
            searchScore += 45000;
          }
          if (pDesc.includes(normClean) || pDesc.includes(normSearch)) {
            searchScore += 25000;
          }
        }

        // Token match bonuses
        const queryTokens = Array.from(
          new Set(
            `${normSearch} ${normClean}`
              .replace(/[^a-z0-9\s-]/gi, " ")
              .split(/\s+/)
              .filter((t) => t.length >= 2 && !SEARCH_STOPWORDS.has(t))
          )
        );

        for (const token of queryTokens) {
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

        // NLP category match boost
        if (parsedNlp?.detectedCategory && (bizCat === parsedNlp.detectedCategory || biz.mainCategory === parsedNlp.detectedCategory)) {
          searchScore += 30000;
        }

        // NLP location match boost
        if (parsedNlp?.matchedSector && bizSector.includes(parsedNlp.matchedSector.toLowerCase())) {
          searchScore += 40000;
        }
        if (parsedNlp?.matchedLandmark && (bizLandmark.includes(parsedNlp.matchedLandmark.toLowerCase()) || bizDirections.includes(parsedNlp.matchedLandmark.toLowerCase()))) {
          searchScore += 40000;
        }
      }

      score += searchScore;
      biz._searchRelevanceScore = searchScore;
      biz._proximityScore = score;
      biz.proximityTier = tier;
      biz.isLocalResult = tier <= 3;
      biz.distanceKm = distKm;
    });

    businesses.sort((a: any, b: any) => {
      if (b._proximityScore !== a._proximityScore) {
        return b._proximityScore - a._proximityScore;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const totalMatching = businesses.length;
    const startIndex = (page - 1) * limit;
    const paginatedBusinesses = businesses.slice(startIndex, startIndex + limit);
    const formatted = paginatedBusinesses.map(serializePublicBusiness);

    const isDynamic = Boolean(search || targetLat || targetLng || checkDuplicate);
    const cacheHeader = isDynamic
      ? "private, no-cache, no-store, must-revalidate"
      : "public, s-maxage=60, stale-while-revalidate=300";

    return NextResponse.json({
      success: true,
      source: "live",
      count: formatted.length,
      total: totalMatching,
      page,
      limit,
      detectedLocality: {
        country: userCountry || "Worldwide",
        city: userCity || "Worldwide",
        hasCoords: Boolean(targetLat && targetLng),
      },
      localCount: formatted.filter((b) => b.isLocalResult).length,
      nlpParsed: parsedNlp,
      businesses: formatted,
    }, {
      headers: {
        "Cache-Control": cacheHeader,
        "X-Total-Count": String(totalMatching),
      },
    });
  } catch (error) {
    console.error("[Businesses API] PostgreSQL query error:", error);
    return NextResponse.json({
      error: "Failed to fetch businesses from database",
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required to register a business" },
        { status: 401 }
      );
    }
    const body = await request.json();
    const {
      name,
      nameRw,
      category,
      categoryDisplay,
      categoryDisplayRw,
      description,
      descriptionRw,
      phone,
      whatsapp,
      cell = "Kamutwa",
      sector = "Kacyiru",
      district = "Gasabo",
      province = "City of Kigali",
      addressNote,
      nearestLandmark,
      streetName,
      nearbyPlace,
      locationDescription,
      locationSource: rawLocationSource,
      locationAccuracy: rawLocationAccuracy,
      locationVerificationStatus: rawLocationVerificationStatus,
      latitude = -1.9365,
      longitude = 30.0868,
      priceRange = "LOW",
      priceRangeMin,
      priceRangeMax,
      coverImage,
      provinceId,
      districtId,
      sectorId,
      cellId,
      localAreaId,
      dataStatus = "DEMO",
      source,
      products = [],
    } = body;

    if (!name || !category) {
      return NextResponse.json(
        { error: "Business name and category are required" },
        { status: 400 }
      );
    }

    // Resolve geographic IDs if missing
    let resolvedSectorId = sectorId;
    let resolvedDistrictId = districtId;
    let resolvedProvinceId = provinceId;
    let resolvedCellId = cellId;

    if (!resolvedSectorId && sector) {
      const sec = await prisma.geographicSector.findFirst({
        where: { name: { equals: sector, mode: "insensitive" } },
        include: { districtRel: true },
      });
      if (sec) {
        resolvedSectorId = sec.id;
        if (!resolvedDistrictId) resolvedDistrictId = sec.districtId;
        if (!resolvedProvinceId && sec.districtRel) resolvedProvinceId = sec.districtRel.provinceId;
      }
    }

    if (!resolvedCellId && cell && resolvedSectorId) {
      const c = await prisma.geographicCell.findFirst({
        where: { sectorId: resolvedSectorId, name: { equals: cell, mode: "insensitive" } },
      });
      if (c) resolvedCellId = c.id;
    }

    const accuracy = rawLocationAccuracy ? Number(rawLocationAccuracy) : null;
    const locSource: LocationSource = (rawLocationSource as LocationSource) || (accuracy ? LocationSource.GPS_DEVICE : LocationSource.ADMIN_MANUAL);
    const locVerification: LocationVerificationStatus = (rawLocationVerificationStatus as LocationVerificationStatus) || 
      (accuracy ? LocationVerificationStatus.AGENT_CAPTURED : 
       (user?.role === "COMMUNITY_AGENT" ? LocationVerificationStatus.AGENT_VERIFIED : LocationVerificationStatus.UNVERIFIED));

    const business = await prisma.business.create({
      data: {
        name,
        nameRw: nameRw || name,
        category,
        categoryDisplay: categoryDisplay || "Local Business",
        categoryDisplayRw: categoryDisplayRw || "Ubucuruzi bw'Agace",
        description: description || "Neighborhood business registered on the ground.",
        descriptionRw: descriptionRw || description,
        phone: phone || "+250780000000 (Demo)",
        whatsapp: whatsapp || null,
        cell,
        sector,
        district,
        addressNote,
        nearestLandmark: nearestLandmark || addressNote || null,
        streetName: streetName || null,
        nearbyPlace: nearbyPlace || null,
        locationDescription: locationDescription || null,
        locationSource: locSource,
        locationAccuracy: accuracy,
        locationVerificationStatus: locVerification,
        locationCapturedById: accuracy ? (user?.id || null) : null,
        locationCapturedAt: accuracy ? new Date() : null,
        locationVerifiedById: user?.role === "COMMUNITY_AGENT" ? user.id : null,
        locationVerifiedAt: user?.role === "COMMUNITY_AGENT" ? new Date() : null,
        latitude: Number(latitude),
        longitude: Number(longitude),
        verificationStatus: user?.role === "COMMUNITY_AGENT" ? "AGENT_VERIFIED" : "UNVERIFIED",
        priceRange,
        priceRangeMin: priceRangeMin ? Number(priceRangeMin) : null,
        priceRangeMax: priceRangeMax ? Number(priceRangeMax) : null,
        coverImage: coverImage ? coverImage.trim() : null,
        agentId: user?.id || null,
        provinceId: resolvedProvinceId || null,
        districtId: resolvedDistrictId || null,
        sectorId: resolvedSectorId || null,
        cellId: resolvedCellId || null,
        localAreaId: localAreaId || null,
        dataStatus: (dataStatus as any) || "DEMO",
        source: source || (user ? "COMMUNITY_AGENT" : "SAMPLE_SEED"),
      },
    });

    // Create products if provided
    if (products && Array.isArray(products) && products.length > 0) {
      for (const p of products) {
        if (p.name) {
          await prisma.product.create({
            data: {
              businessId: business.id,
              name: p.name,
              nameRw: p.nameRw || null,
              price: Number(p.price || p.priceMin || 0),
              priceMin: p.priceMin ? Number(p.priceMin) : null,
              priceMax: p.priceMax ? Number(p.priceMax) : null,
              priceType: p.priceType || (p.priceMin && p.priceMax ? "RANGE" : "FIXED"),
              isEstimated: p.isEstimated ?? true,
              currency: "RWF",
              unit: p.unit || "item",
              dataStatus: (dataStatus as any) || "DEMO",
              verifiedByAgent: false,
            },
          }).catch(() => {});
        }
      }
    }

    // Record audit event
    await logAuditEvent({
      actorId: user?.id,
      action: "BUSINESS_REGISTERED",
      entityType: "BUSINESS",
      entityId: business.id,
      metadata: { name: business.name, cell: business.cell, dataStatus: business.dataStatus },
    });

    const fullBusiness = await prisma.business.findUnique({
      where: { id: business.id },
      include: { products: true, localArea: true },
    });

    return NextResponse.json({ success: true, business: formatBusinessRecord(fullBusiness || business) }, { status: 201 });
  } catch (error) {
    console.error("[Business Creation Error]:", error);
    return NextResponse.json(
      { error: "Failed to register business in database" },
      { status: 500 }
    );
  }
}
