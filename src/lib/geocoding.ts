import { getCountryConfig, GLOBAL_COUNTRY_CONFIGS } from "./country-address-config";
import { haversineDistance } from "./location-quality";

/**
 * MOSA Rwanda & Global Geocoding Intelligence & Ground Landmark Resolution Engine
 * Interprets natural human location descriptions and resolves accurate geographic coordinates worldwide.
 */

export interface GeocodingResult {
  lat: number;
  lng: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  matchedPlace: string;
  source: "google" | "nominatim" | "rwanda_ground_index" | "administrative_fallback";
  hierarchy: {
    country: string;
    province?: string;
    provinceId?: string;
    district?: string;
    districtId?: string;
    sector?: string;
    sectorId?: string;
    cell?: string;
    cellId?: string;
    village?: string;
    streetName?: string;
    nearestLandmark?: string;
  };
}

// Authoritative ground index of key Rwanda commercial landmarks, avenues, hubs, and institutions
export interface GroundLandmark {
  keywords: string[];
  name: string;
  lat: number;
  lng: number;
  province: string;
  district: string;
  sector: string;
  cell?: string;
  streetName?: string;
  landmark: string;
  confidence: "HIGH" | "MEDIUM";
}

export const RWANDA_GROUND_INDEX: GroundLandmark[] = [
  // Kacyiru & Ministries
  {
    keywords: ["kigali business centre", "kbc", "kbc building", "opposite kbc", "near kbc"],
    name: "Kigali Business Centre (KBC)",
    lat: -1.953521,
    lng: 30.088612,
    province: "City of Kigali",
    district: "Gasabo",
    sector: "Kacyiru",
    cell: "Kamutwa",
    streetName: "KG 7 Ave",
    landmark: "Kigali Business Centre (KBC)",
    confidence: "HIGH",
  },
  {
    keywords: ["minagri", "ministry of agriculture", "kg 569", "kg 569 st"],
    name: "MINAGRI Headquarters",
    lat: -1.942205,
    lng: 30.088219,
    province: "City of Kigali",
    district: "Gasabo",
    sector: "Kacyiru",
    cell: "Kamutwa",
    streetName: "KG 569 St",
    landmark: "MINAGRI Main Gate",
    confidence: "HIGH",
  },
  {
    keywords: ["kigali heights", "kh", "kimihurura roundabout", "kg 7 ave kimihurura"],
    name: "Kigali Heights (KH)",
    lat: -1.954035,
    lng: 30.091524,
    province: "City of Kigali",
    district: "Gasabo",
    sector: "Kimihurura",
    cell: "Kimihurura",
    streetName: "KG 7 Ave",
    landmark: "Kigali Heights",
    confidence: "HIGH",
  },
  {
    keywords: ["kigali convention centre", "convention centre", "kcc", "radisson blu"],
    name: "Kigali Convention Centre (KCC)",
    lat: -1.955012,
    lng: 30.092811,
    province: "City of Kigali",
    district: "Gasabo",
    sector: "Kimihurura",
    cell: "Kimihurura",
    streetName: "KG 2 Roundabout",
    landmark: "Kigali Convention Centre",
    confidence: "HIGH",
  },

  // Nyamirambo
  {
    keywords: ["green mosque", "misikiti y'icyatsi", "biryogo green mosque", "masjid al-fatah"],
    name: "Green Mosque (Misikiti y'Icyatsi), Biryogo",
    lat: -1.982341,
    lng: 30.046819,
    province: "City of Kigali",
    district: "Nyarugenge",
    sector: "Nyamirambo",
    cell: "Biryogo",
    streetName: "KN 123 St",
    landmark: "Green Mosque (Biryogo)",
    confidence: "HIGH",
  },
  {
    keywords: ["biryogo car-free zone", "biryogo car free", "biryogo tea", "biryogo zone"],
    name: "Biryogo Car-Free Food & Culture Street",
    lat: -1.981255,
    lng: 30.048212,
    province: "City of Kigali",
    district: "Nyarugenge",
    sector: "Nyamirambo",
    cell: "Biryogo",
    streetName: "KN 115 St",
    landmark: "Biryogo Car-Free Zone",
    confidence: "HIGH",
  },
  {
    keywords: ["nyamirambo stadium", "pele stadium", "kigali pele stadium"],
    name: "Kigali Pelé Stadium (Nyamirambo)",
    lat: -1.987512,
    lng: 30.044021,
    province: "City of Kigali",
    district: "Nyarugenge",
    sector: "Nyamirambo",
    cell: "Mumena",
    streetName: "KN 2 Ave",
    landmark: "Pelé Stadium",
    confidence: "HIGH",
  },
  {
    keywords: ["cosmos", "cosmos junction", "cosmos nyamirambo"],
    name: "Cosmos Commercial Junction",
    lat: -1.985612,
    lng: 30.045512,
    province: "City of Kigali",
    district: "Nyarugenge",
    sector: "Nyamirambo",
    cell: "Rwezamenyo",
    streetName: "KN 2 Ave",
    landmark: "Cosmos Junction",
    confidence: "HIGH",
  },

  // Remera & Kisimenti
  {
    keywords: ["kisimenti", "chez lando", "lando", "kg 201 st"],
    name: "Kisimenti / Hotel Chez Lando",
    lat: -1.960244,
    lng: 30.113521,
    province: "City of Kigali",
    district: "Gasabo",
    sector: "Remera",
    cell: "Rukiri I",
    streetName: "KG 201 St",
    landmark: "Chez Lando / Kisimenti Strip",
    confidence: "HIGH",
  },
  {
    keywords: ["remera park", "remera bus park", "gare ya remera", "remera taxi park"],
    name: "Remera Taxi & Bus Park",
    lat: -1.958521,
    lng: 30.118912,
    province: "City of Kigali",
    district: "Gasabo",
    sector: "Remera",
    cell: "Rukiri II",
    streetName: "KG 11 Ave",
    landmark: "Remera Bus Park",
    confidence: "HIGH",
  },
  {
    keywords: ["bk arena", "amahoro stadium", "stade amahoro"],
    name: "BK Arena & Amahoro National Stadium",
    lat: -1.951522,
    lng: 30.113019,
    province: "City of Kigali",
    district: "Gasabo",
    sector: "Remera",
    cell: "Rukiri I",
    streetName: "KG 17 Ave",
    landmark: "BK Arena / Amahoro Stadium",
    confidence: "HIGH",
  },

  // Kicukiro
  {
    keywords: ["kicukiro centre", "centre ya kicukiro", "kicukiro equity bank", "kk 15 rd"],
    name: "Kicukiro Centre Commercial Hub",
    lat: -1.972144,
    lng: 30.104212,
    province: "City of Kigali",
    district: "Kicukiro",
    sector: "Kicukiro",
    cell: "Ngoma",
    streetName: "KK 15 Rd",
    landmark: "Kicukiro Centre (near Equity Bank)",
    confidence: "HIGH",
  },
  {
    keywords: ["sonatubes", "sonatube", "sonatubes roundabout"],
    name: "Sonatubes Roundabout Commercial Corridor",
    lat: -1.965412,
    lng: 30.088921,
    province: "City of Kigali",
    district: "Kicukiro",
    sector: "Kagarama",
    cell: "Muyange",
    streetName: "KK 3 Rd",
    landmark: "Sonatubes Junction",
    confidence: "HIGH",
  },
  {
    keywords: ["gikondo", "merez", "magerwa", "kk 31 ave"],
    name: "Gikondo Merez (MAGERWA Area)",
    lat: -1.973412,
    lng: 30.076821,
    province: "City of Kigali",
    district: "Kicukiro",
    sector: "Gikondo",
    cell: "Kanserege",
    streetName: "KK 31 Ave",
    landmark: "MAGERWA / Merez Gikondo",
    confidence: "HIGH",
  },

  // Nyabugogo & City Centre (CBD)
  {
    keywords: ["nyabugogo bus park", "nyabugogo park", "gare ya nyabugogo", "nyabugogo taxi park"],
    name: "Nyabugogo Bus & Regional Transit Terminal",
    lat: -1.939215,
    lng: 30.044521,
    province: "City of Kigali",
    district: "Nyarugenge",
    sector: "Muhima",
    cell: "Nyabugogo",
    streetName: "KN 1 Rd",
    landmark: "Nyabugogo Bus Terminal",
    confidence: "HIGH",
  },
  {
    keywords: ["downtown kigali", "kigali downtown", "kigali city market", "downtown bus park"],
    name: "Kigali Downtown Commercial Hub & City Market",
    lat: -1.948712,
    lng: 30.058821,
    province: "City of Kigali",
    district: "Nyarugenge",
    sector: "Nyarugenge",
    cell: "Kiyovu",
    streetName: "KN 4 Ave",
    landmark: "Downtown City Market",
    confidence: "HIGH",
  },
  {
    keywords: ["chuk", "centre hospitalier", "kigali hospital", "kn 4 ave"],
    name: "CHUK (University Teaching Hospital of Kigali)",
    lat: -1.954212,
    lng: 30.061211,
    province: "City of Kigali",
    district: "Nyarugenge",
    sector: "Nyarugenge",
    cell: "Kiyovu",
    streetName: "KN 4 Ave",
    landmark: "CHUK Hospital Gate",
    confidence: "HIGH",
  },

  // Kimironko & Gisozi
  {
    keywords: ["kimironko market", "isoko rya kimironko", "kimironko bus park", "kg 11 ave"],
    name: "Kimironko Fresh Food & Artisan Market",
    lat: -1.948212,
    lng: 30.126521,
    province: "City of Kigali",
    district: "Gasabo",
    sector: "Kimironko",
    cell: "Kibagabaga",
    streetName: "KG 11 Ave",
    landmark: "Kimironko Market Gate",
    confidence: "HIGH",
  },
  {
    keywords: ["gisozi ulk", "ulk", "kigali independent university", "kg 14 ave"],
    name: "ULK (Kigali Independent University), Gisozi",
    lat: -1.928512,
    lng: 30.057312,
    province: "City of Kigali",
    district: "Gasabo",
    sector: "Gisozi",
    cell: "Ruhango",
    streetName: "KG 14 Ave",
    landmark: "ULK Main Campus Gate",
    confidence: "HIGH",
  },
  {
    keywords: ["kigali genocide memorial", "gisozi memorial", "memorial gisozi"],
    name: "Kigali Genocide Memorial, Gisozi",
    lat: -1.930812,
    lng: 30.060122,
    province: "City of Kigali",
    district: "Gasabo",
    sector: "Gisozi",
    cell: "Kanyinya",
    streetName: "KG 14 Ave",
    landmark: "Genocide Memorial Gate",
    confidence: "HIGH",
  },

  // Major Secondary Cities in Rwanda
  {
    keywords: ["musanze town", "musanze", "goico plaza", "ruhengeri", "muhoza"],
    name: "Musanze Town Commercial Centre (Goico Plaza)",
    lat: -1.499821,
    lng: 29.634912,
    province: "Northern Province",
    district: "Musanze",
    sector: "Muhoza",
    cell: "Ruhengeri",
    streetName: "RN 4",
    landmark: "Goico Plaza / Musanze Modern Market",
    confidence: "HIGH",
  },
  {
    keywords: ["rubavu town", "rubavu", "gisenyi", "gisenyi market", "lake kivu beach"],
    name: "Rubavu (Gisenyi) Commercial Centre",
    lat: -1.697521,
    lng: 29.256412,
    province: "Western Province",
    district: "Rubavu",
    sector: "Gisenyi",
    cell: "Rubavu",
    streetName: "RN 4",
    landmark: "Rubavu Main Market / Petite Barrière Road",
    confidence: "HIGH",
  },
  {
    keywords: ["huye town", "huye", "butare", "national university", "huye market"],
    name: "Huye (Butare) University & Commercial Hub",
    lat: -2.603312,
    lng: 29.742812,
    province: "Southern Province",
    district: "Huye",
    sector: "Ngoma",
    cell: "Matyazo",
    streetName: "RN 1",
    landmark: "Huye Modern Market / University Way",
    confidence: "HIGH",
  },
  {
    keywords: ["muhanga", "gitarama", "muhanga market", "muhanga bus park"],
    name: "Muhanga (Gitarama) Commercial Centre",
    lat: -2.079211,
    lng: 29.756211,
    province: "Southern Province",
    district: "Muhanga",
    sector: "Nyamabuye",
    cell: "Gitarama",
    streetName: "RN 1",
    landmark: "Muhanga Regional Bus Terminal",
    confidence: "HIGH",
  },
  {
    keywords: ["rwamagana", "rwamagana town", "rwamagana market"],
    name: "Rwamagana Commercial Centre",
    lat: -1.952512,
    lng: 30.434712,
    province: "Eastern Province",
    district: "Rwamagana",
    sector: "Kigabiro",
    cell: "Sibagire",
    streetName: "RN 3",
    landmark: "Rwamagana Central Market",
    confidence: "HIGH",
  },
];

/**
 * Normalizes text for comparison
 */
function cleanQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Searches the ground landmark index for exact or partial keyword matches
 */
export function searchGroundLandmarkIndex(query: string): GroundLandmark | null {
  const cleaned = cleanQuery(query);
  if (!cleaned) return null;

  // 1. Direct keyword match
  for (const item of RWANDA_GROUND_INDEX) {
    for (const kw of item.keywords) {
      if (cleaned.includes(kw)) {
        return item;
      }
    }
  }

  // 2. Token-based matching (e.g. "Kacyiru" + "Kigali Business Centre")
  let bestScore = 0;
  let bestMatch: GroundLandmark | null = null;

  for (const item of RWANDA_GROUND_INDEX) {
    let score = 0;
    const nameLower = item.name.toLowerCase();
    const sectorLower = item.sector.toLowerCase();
    const landmarkLower = item.landmark.toLowerCase();

    if (item.streetName && cleaned.includes(item.streetName.toLowerCase())) score += 3;
    if (cleaned.includes(sectorLower)) score += 2;
    if (cleaned.includes(item.district.toLowerCase())) score += 1;

    for (const kw of item.keywords) {
      const kwTokens = kw.split(" ");
      const matches = kwTokens.filter((token) => cleaned.includes(token));
      if (matches.length === kwTokens.length) {
        score += 5;
      } else if (matches.length > 0) {
        score += matches.length;
      }
    }

    if (score > bestScore && score >= 4) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestMatch;
}

/**
 * Calls Google Geocoding API if key is present (Supports worldwide geocoding & country filtering)
 */
export async function geocodeWithGoogle(query: string, countryCode?: string): Promise<GeocodingResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const isRw = !countryCode || countryCode.toUpperCase() === "RW";
    const address = isRw ? (query.toLowerCase().includes("rwanda") ? query : `${query}, Rwanda`) : query;
    const countryFilter = countryCode && countryCode !== "OTHER" ? `&components=country:${countryCode}` : "";
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}${countryFilter}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const top = data.results[0];
      const lat = top.geometry.location.lat;
      const lng = top.geometry.location.lng;

      // Extract components dynamically
      let country = isRw ? "Rwanda" : "";
      let province = "";
      let district = "";
      let sector = "";
      let cell = "";
      let street = "";
      let postal = "";

      for (const comp of top.address_components || []) {
        const types: string[] = comp.types || [];
        if (types.includes("country")) country = comp.long_name;
        if (types.includes("administrative_area_level_1")) province = comp.long_name;
        if (types.includes("administrative_area_level_2")) district = comp.long_name;
        if (types.includes("locality") || types.includes("postal_town")) {
          if (!district) district = comp.long_name;
          else if (!sector) sector = comp.long_name;
        }
        if (types.includes("sublocality") || types.includes("sublocality_level_1") || types.includes("neighborhood")) {
          if (!sector) sector = comp.long_name;
          else if (!cell) cell = comp.long_name;
        }
        if (types.includes("route")) street = comp.long_name;
        if (types.includes("postal_code")) postal = comp.long_name;
      }

      return {
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        confidence: "HIGH",
        matchedPlace: top.formatted_address || query,
        source: "google",
        hierarchy: {
          country: country || (isRw ? "Rwanda" : "International"),
          province: province || undefined,
          district: district || undefined,
          sector: sector || undefined,
          cell: cell || undefined,
          village: postal || undefined,
          streetName: street || undefined,
          nearestLandmark: query.slice(0, 50),
        },
      };
    }
  } catch (err) {
    console.warn("[Geocoding] Google geocoding error:", err);
  }
  return null;
}

/**
 * Calls OpenStreetMap Nominatim Geocoding API (Worldwide or country-filtered)
 */
export async function geocodeWithNominatim(query: string, countryCode?: string): Promise<GeocodingResult | null> {
  try {
    const isRw = !countryCode || countryCode.toUpperCase() === "RW";
    const cleanCC = countryCode && countryCode !== "OTHER" ? countryCode.toLowerCase() : "";

    let address = query;
    if (isRw && !query.toLowerCase().includes("rwanda")) {
      address = `${query}, Rwanda`;
    }
    const countryFilter = cleanCC ? `&countrycodes=${cleanCC}` : "";
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json${countryFilter}&limit=3&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "MOSA-Geocoding-Engine/1.0 (info@mosa.rw)",
        "Accept-Language": "en,rw",
      },
      signal: AbortSignal.timeout(3500),
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
      const top = data[0];
      const lat = parseFloat(top.lat);
      const lng = parseFloat(top.lon);

      if (isNaN(lat) || isNaN(lng)) return null;

      // Validate bounds: if Rwanda-targeted, ensure within Rwanda; if international, ensure valid globe coordinates
      if (isRw && (lat < -2.9 || lat > -1.0 || lng < 28.8 || lng > 30.9)) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

      const addr = top.address || {};
      const countryFound = addr.country || (isRw ? "Rwanda" : "International");
      const province = addr.state || addr.region || addr.province || (isRw ? "City of Kigali" : "");
      const district = addr.county || addr.city || addr.town || addr.municipality || "";
      const sector = addr.suburb || addr.city_district || addr.district || "";
      const cell = addr.neighbourhood || addr.quarter || addr.subdivision || "";
      const street = addr.road || addr.street || addr.pedestrian || "";
      const postal = addr.postcode || "";

      return {
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        confidence: top.importance > 0.4 ? "HIGH" : "MEDIUM",
        matchedPlace: top.display_name.split(",").slice(0, 3).join(", "),
        source: "nominatim",
        hierarchy: {
          country: countryFound,
          province: province || undefined,
          district: district || undefined,
          sector: sector || undefined,
          cell: cell || undefined,
          village: postal || undefined,
          streetName: street || undefined,
          nearestLandmark: top.name || query.slice(0, 50),
        },
      };
    }
  } catch (err) {
    // Network or rate-limiting error, continue to internal knowledge base
  }
  return null;
}

/**
 * Master Smart Interpreter function for MOSA:
 * Combines Google, Nominatim, and Authoritative Ground Landmark Index across Rwanda and Worldwide.
 */
export async function interpretLocationDescription(
  description: string,
  geoContext?: { country?: string; province?: string; district?: string; sector?: string; cell?: string }
): Promise<GeocodingResult> {
  const query = description.trim();
  const rawCountry = geoContext?.country || "Rwanda";
  const countryConfig = getCountryConfig(rawCountry);
  const isRwanda = countryConfig.code === "RW";

  if (!query) {
    return {
      lat: countryConfig.defaultCenter.lat,
      lng: countryConfig.defaultCenter.lng,
      confidence: "LOW",
      matchedPlace: `${countryConfig.name} default center`,
      source: "administrative_fallback",
      hierarchy: {
        country: countryConfig.name,
        province: geoContext?.province || (isRwanda ? "City of Kigali" : countryConfig.name),
      },
    };
  }

  // 1. If Rwanda: Check Ground Landmark Index first for instant zero-latency match
  if (isRwanda) {
    const groundMatch = searchGroundLandmarkIndex(query);
    if (groundMatch) {
      return {
        lat: groundMatch.lat,
        lng: groundMatch.lng,
        confidence: groundMatch.confidence,
        matchedPlace: `${groundMatch.name}${groundMatch.streetName ? ", " + groundMatch.streetName : ""}, ${groundMatch.sector}`,
        source: "rwanda_ground_index",
        hierarchy: {
          country: "Rwanda",
          province: groundMatch.province,
          district: groundMatch.district,
          sector: groundMatch.sector,
          cell: groundMatch.cell,
          streetName: groundMatch.streetName,
          nearestLandmark: groundMatch.landmark,
        },
      };
    }
  }

  // 2. Try Google Geocoding if API Key is configured (with target country code)
  const googleResult = await geocodeWithGoogle(query, countryConfig.code);
  if (googleResult) {
    return googleResult;
  }

  // 3. Try Nominatim OpenStreetMap Geocoder (with target country code)
  const nominatimResult = await geocodeWithNominatim(query, countryConfig.code);
  if (nominatimResult) {
    return nominatimResult;
  }

  // 4. If Rwanda: Sector Explicit Mention in Query
  if (isRwanda) {
    const cleaned = cleanQuery(query);
    const textMentionedSector = RWANDA_GROUND_INDEX.find(
      (item) => cleaned.includes(item.sector.toLowerCase())
    );

    if (textMentionedSector) {
      return {
        lat: textMentionedSector.lat,
        lng: textMentionedSector.lng,
        confidence: "MEDIUM",
        matchedPlace: `${textMentionedSector.sector}, ${textMentionedSector.district}, ${textMentionedSector.province}`,
        source: "rwanda_ground_index",
        hierarchy: {
          country: "Rwanda",
          province: textMentionedSector.province,
          district: textMentionedSector.district,
          sector: textMentionedSector.sector,
          nearestLandmark: query.slice(0, 50),
        },
      };
    }
  }

  // 5. Unresolved / Vague Description (Fallback with LOW confidence centering on country hub)
  const contextSectorMatch = (isRwanda && geoContext?.sector)
    ? RWANDA_GROUND_INDEX.find((item) => item.sector.toLowerCase() === geoContext.sector?.toLowerCase())
    : null;

  return {
    lat: contextSectorMatch ? contextSectorMatch.lat : countryConfig.defaultCenter.lat,
    lng: contextSectorMatch ? contextSectorMatch.lng : countryConfig.defaultCenter.lng,
    confidence: "LOW",
    matchedPlace: contextSectorMatch
      ? `Approximate area (${contextSectorMatch.sector}, ${contextSectorMatch.district})`
      : `Approximate area (${countryConfig.name})`,
    source: "administrative_fallback",
    hierarchy: {
      country: countryConfig.name,
      province: geoContext?.province || contextSectorMatch?.province || (isRwanda ? "City of Kigali" : countryConfig.name),
      district: geoContext?.district || contextSectorMatch?.district || (isRwanda ? "Gasabo" : ""),
      sector: geoContext?.sector || contextSectorMatch?.sector || (isRwanda ? "Kacyiru" : ""),
      nearestLandmark: query.slice(0, 50),
    },
  };
}

/**
 * Backward compatibility alias for Rwanda location interpretation
 */
export async function interpretRwandaLocationDescription(
  description: string,
  geoContext?: { province?: string; district?: string; sector?: string; cell?: string }
): Promise<GeocodingResult> {
  return interpretLocationDescription(description, { ...geoContext, country: "Rwanda" });
}

export interface ReverseGeocodeResult {
  country: string;
  countryCode: string;
  city: string;
  locality: string;
  displayLabel: string;
  latitude: number;
  longitude: number;
  source: "google" | "geodesic_hubs";
}

/**
 * Reverse Geocode Coordinates to Country, City, and Locality.
 * Uses Google Geocoding API if available, falling back to geodesic hub proximity matching.
 */
export async function reverseGeocodeCoords(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult> {
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "OK" && data.results && data.results.length > 0) {
          const first = data.results[0];
          let country = "";
          let countryCode = "";
          let city = "";
          let locality = "";

          for (const comp of first.address_components) {
            if (comp.types.includes("country")) {
              country = comp.long_name;
              countryCode = comp.short_name;
            }
            if (comp.types.includes("locality")) {
              city = comp.long_name;
              locality = comp.long_name;
            }
            if (!city && comp.types.includes("administrative_area_level_2")) {
              city = comp.long_name;
            }
            if (!locality && comp.types.includes("sublocality")) {
              locality = comp.long_name;
            }
          }

          if (country) {
            return {
              country,
              countryCode: countryCode || "OTHER",
              city: city || locality || country,
              locality: locality || city || country,
              displayLabel: `${city || locality || country}, ${country}`,
              latitude: lat,
              longitude: lng,
              source: "google",
            };
          }
        }
      }
    } catch (e) {
      console.warn("[Reverse Geocode] Google reverse geocoding fallback triggered:", e);
    }
  }

  // Fallback: geodesic proximity matching to known country and city hubs
  let closestCountry = GLOBAL_COUNTRY_CONFIGS.Rwanda;
  let minDistance = Infinity;

  for (const config of Object.values(GLOBAL_COUNTRY_CONFIGS)) {
    const dist = haversineDistance(lat, lng, config.defaultCenter.lat, config.defaultCenter.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closestCountry = config;
    }
  }

  const capitalCities: Record<string, string> = {
    RW: "Kigali",
    UG: "Kampala",
    KE: "Nairobi",
    TZ: "Dar es Salaam",
    DE: "Berlin",
    GB: "London",
    US: "New York",
    FR: "Paris",
    CA: "Toronto",
    ZA: "Johannesburg",
    NG: "Lagos",
    GH: "Accra",
    BI: "Bujumbura",
    CD: "Goma",
    AE: "Dubai",
    IN: "New Delhi",
  };

  const city = capitalCities[closestCountry.code] || closestCountry.name;

  return {
    country: closestCountry.name,
    countryCode: closestCountry.code,
    city,
    locality: city,
    displayLabel: `${city}, ${closestCountry.name}`,
    latitude: lat,
    longitude: lng,
    source: "geodesic_hubs",
  };
}

export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineDistance(lat1, lon1, lat2, lon2) / 1000;
}

export { haversineDistance };
