/**
 * MOSA Natural Language Location & Commerce Query Parser
 * Interprets queries like "fruit shops in Kimironko", "phone repair near MINAGRI",
 * "tailor in Biryogo under 1500 Frw", "amaduka muri Kacyiru".
 */

export interface ParsedSearchQuery {
  rawQuery: string;
  cleanQuery: string;             // e.g. "fruit shops", "perfume", "shoes"
  locationModifier?: string;      // e.g. "Kimironko", "MINAGRI", "Kacyiru", "Kigali"
  locationType?: "SECTOR" | "CELL" | "LANDMARK" | "DISTRICT" | "CITY" | "COUNTRY";
  priceMax?: number;              // e.g. 1500
  priceMin?: number;
  detectedCategory?: string;      // Canonical category key (e.g. "retail_shops", "food_dining")
  matchedLandmark?: string;
  matchedSector?: string;
  matchedCell?: string;
  matchedDistrict?: string;
  matchedCity?: string;
  matchedCountry?: string;
}

// Known geographic entities in Rwanda & internationally for rapid NLP matching
const KNOWN_SECTORS = [
  "kacyiru", "nyamirambo", "kimironko", "remera", "gisozi",
  "kanombe", "kicukiro", "niboye", "kagarama", "gikondo",
  "muhoza", "huye", "rubavu", "musanze", "nyagatare",
  "muhima", "nyarugenge", "rwezamenyo", "gatsata", "jabana",
  "bumbogo", "ndera", "rusororo", "masaka"
];

const KNOWN_CELLS = [
  "kamutwa", "kibaza", "kamatamu", "biryogo", "mumena",
  "cyivugiza", "kigali", "nyakabanda", "kibagabaga", "nyabisindu",
  "bibare", "kinyinya", "kagugu", "ruhengeri", "matyazo"
];

const KNOWN_DISTRICTS = [
  "gasabo", "nyarugenge", "kicukiro", "musanze", "rubavu",
  "huye", "muhanga", "rwamagana", "bugesera", "rusizi",
  "gatsibo", "kayonza", "nyagatare", "karongi", "nyamasheke"
];

const KNOWN_CITIES_COUNTRIES = [
  { key: "kigali", name: "Kigali", type: "CITY" as const },
  { key: "kampala", name: "Kampala", type: "CITY" as const },
  { key: "nairobi", name: "Nairobi", type: "CITY" as const },
  { key: "mombasa", name: "Mombasa", type: "CITY" as const },
  { key: "london", name: "London", type: "CITY" as const },
  { key: "berlin", name: "Berlin", type: "CITY" as const },
  { key: "new york", name: "New York", type: "CITY" as const },
  { key: "paris", name: "Paris", type: "CITY" as const },
  { key: "rwanda", name: "Rwanda", type: "COUNTRY" as const },
  { key: "uganda", name: "Uganda", type: "COUNTRY" as const },
  { key: "kenya", name: "Kenya", type: "COUNTRY" as const },
  { key: "germany", name: "Germany", type: "COUNTRY" as const },
  { key: "uk", name: "United Kingdom", type: "COUNTRY" as const },
  { key: "usa", name: "United States", type: "COUNTRY" as const },
  { key: "tanzania", name: "Tanzania", type: "COUNTRY" as const },
];

const KNOWN_LANDMARKS = [
  { key: "minagri", name: "MINAGRI Area (KG 569 St)", sector: "Kacyiru", cell: "Kamutwa" },
  { key: "sacco kacyiru", name: "Near SACCO Kacyiru", sector: "Kacyiru", cell: "Kamutwa" },
  { key: "sacco", name: "Near SACCO Kacyiru", sector: "Kacyiru", cell: "Kamutwa" },
  { key: "kbc", name: "Kigali Business Centre (KBC)", sector: "Kacyiru", cell: "Kamutwa" },
  { key: "kigali business centre", name: "Kigali Business Centre (KBC)", sector: "Kacyiru", cell: "Kamutwa" },
  { key: "cosmos", name: "Cosmos Junction", sector: "Nyamirambo", cell: "Biryogo" },
  { key: "biryogo car-free", name: "Biryogo Car-Free Zone", sector: "Nyamirambo", cell: "Biryogo" },
  { key: "car free zone", name: "Biryogo Car-Free Zone", sector: "Nyamirambo", cell: "Biryogo" },
  { key: "tapi rouge", name: "Tapi Rouge", sector: "Nyamirambo", cell: "Mumena" },
  { key: "mumena stadium", name: "Mumena Stadium", sector: "Nyamirambo", cell: "Mumena" },
  { key: "green mosque", name: "Green Mosque (Biryogo)", sector: "Nyamirambo", cell: "Biryogo" },
  { key: "onatracom", name: "Onatracom", sector: "Nyamirambo", cell: "Rwezamenyo" },
  { key: "nyabugogo", name: "Nyabugogo Bus Park", sector: "Muhima", cell: "Nyabugogo" }
];

// Aligned to 55 MOSA Canonical Taxonomy
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  retail_shops: [
    "shop", "shops", "retail", "boutique", "grocery", "duka", "amaduka", 
    "supermarket", "alimentacion", "store", "stores", "kiosk", "depot", "market", "isoko"
  ],
  food_dining: [
    "fruit", "fruits", "vegetables", "restaurant", "food", "milk", "amata", 
    "bakery", "bread", "cafe", "coffee", "ibiryo", "imbuto", "dish", "dishes", 
    "dining", "lunch", "dinner", "breakfast", "brochettes", "meat", "snack", "juice", "bar"
  ],
  beauty_personal_care: [
    "salon", "barber", "haircut", "imishatsi", "yogosha", "imisatsi", "braids", 
    "coiffure", "spa", "nails", "cosmetics", "perfume", "perfumes", "parfum", "cologne", "beauty"
  ],
  fashion_apparel: [
    "tailor", "sewing", "umudozi", "ubudozi", "igitenge", "dresses", "dress", 
    "clothes", "clothing", "shoes", "shoe", "wear", "attire", "fashion", "boutique", "sneakers"
  ],
  repair_maintenance: [
    "repair", "phone", "phones", "screen", "electronics", "telefoni", "mudasobwa", 
    "computer", "laptop", "headsets", "headset", "headphones", "charger", "plumber", "electrician", "spares"
  ],
  creative_art_media: [
    "art", "arts", "painting", "craft", "crafts", "design", "photography", 
    "photo", "video", "media", "print", "gallery", "artist", "ishyuka"
  ],
  automotive_transport: [
    "mechanic", "garage", "moto", "car repair", "spare", "spares", "tyre", "pneu", 
    "transport", "taxi", "logistics", "car", "vehicle"
  ],
  health_wellness: [
    "pharmacy", "clinic", "health", "medicine", "doctor", "dispensary", "herbal", "drugs"
  ],
  hospitality_tourism: [
    "hotel", "lodge", "motel", "guest house", "tourism", "travel", "tour"
  ],
  construction_building: [
    "construction", "cement", "hardware", "quincaillerie", "building", "paint", "tiles", "plumbing"
  ],
};

/**
 * Parses user search query into structured query + location intent + price constraints
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  if (!query || !query.trim()) {
    return { rawQuery: "", cleanQuery: "" };
  }

  const raw = query.trim();
  let working = raw.toLowerCase();

  let priceMax: number | undefined;
  let priceMin: number | undefined;

  // 1. Detect Price Constraints: "under 2000", "munsi ya 1500", "< 5000", "below 3000"
  const priceRegex = /(?:under|below|less than|munsi ya|<)\s*(\d+[\d,]*)\s*(?:rwf|frw|frs)?/i;
  const priceMatch = working.match(priceRegex);
  if (priceMatch) {
    const parsed = parseInt(priceMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(parsed)) {
      priceMax = parsed;
      working = working.replace(priceMatch[0], " ").trim();
    }
  }

  // 2. Detect Landmark Mentions
  let matchedLandmark: string | undefined;
  let matchedSector: string | undefined;
  let matchedCell: string | undefined;
  let matchedDistrict: string | undefined;
  let matchedCity: string | undefined;
  let matchedCountry: string | undefined;
  let locationModifier: string | undefined;
  let locationType: ParsedSearchQuery["locationType"];

  for (const lm of KNOWN_LANDMARKS) {
    if (working.includes(lm.key)) {
      matchedLandmark = lm.name;
      matchedSector = lm.sector;
      matchedCell = lm.cell;
      locationModifier = lm.name;
      locationType = "LANDMARK";
      // Remove the landmark from the working query
      const lmRegex = new RegExp(`(?:near|ahegereye|around|at|ku|muri)?\\s*${lm.key}`, "i");
      working = working.replace(lmRegex, " ").trim();
      break;
    }
  }

  // 3. Detect Sector, Cell, District, City or Country mentions if landmark not found
  if (!locationModifier) {
    // Check preposition phrases: "in [location]", "muri [location]", "near [location]"
    const prepRegex = /(?:in|muri|near|ahegereye|around|close to|ku)\s+([a-zA-Z\s'-]+)$/i;
    const prepMatch = working.match(prepRegex);

    if (prepMatch) {
      const candidate = prepMatch[1].trim().toLowerCase();
      const matchedSec = KNOWN_SECTORS.find((s) => candidate.includes(s));
      const matchedC = KNOWN_CELLS.find((c) => candidate.includes(c));
      const matchedDist = KNOWN_DISTRICTS.find((d) => candidate.includes(d));
      const matchedPlace = KNOWN_CITIES_COUNTRIES.find((p) => candidate.includes(p.key));

      if (matchedSec) {
        matchedSector = matchedSec.charAt(0).toUpperCase() + matchedSec.slice(1);
        locationModifier = matchedSector;
        locationType = "SECTOR";
        working = working.replace(prepMatch[0], " ").trim();
      } else if (matchedC) {
        matchedCell = matchedC.charAt(0).toUpperCase() + matchedC.slice(1);
        locationModifier = matchedCell;
        locationType = "CELL";
        working = working.replace(prepMatch[0], " ").trim();
      } else if (matchedDist) {
        matchedDistrict = matchedDist.charAt(0).toUpperCase() + matchedDist.slice(1);
        locationModifier = matchedDistrict;
        locationType = "DISTRICT";
        working = working.replace(prepMatch[0], " ").trim();
      } else if (matchedPlace) {
        if (matchedPlace.type === "CITY") {
          matchedCity = matchedPlace.name;
          locationModifier = matchedPlace.name;
          locationType = "CITY";
        } else {
          matchedCountry = matchedPlace.name;
          locationModifier = matchedPlace.name;
          locationType = "COUNTRY";
        }
        working = working.replace(prepMatch[0], " ").trim();
      } else {
        locationModifier = prepMatch[1].trim();
        locationType = "LANDMARK";
        working = working.replace(prepMatch[0], " ").trim();
      }
    } else {
      // Direct word match for sector, cell, district, city, country
      for (const s of KNOWN_SECTORS) {
        if (new RegExp(`\\b${s}\\b`, "i").test(working)) {
          matchedSector = s.charAt(0).toUpperCase() + s.slice(1);
          locationModifier = matchedSector;
          locationType = "SECTOR";
          working = working.replace(new RegExp(`\\b${s}\\b`, "i"), " ").trim();
          break;
        }
      }
      if (!locationModifier) {
        for (const c of KNOWN_CELLS) {
          if (new RegExp(`\\b${c}\\b`, "i").test(working)) {
            matchedCell = c.charAt(0).toUpperCase() + c.slice(1);
            locationModifier = matchedCell;
            locationType = "CELL";
            working = working.replace(new RegExp(`\\b${c}\\b`, "i"), " ").trim();
            break;
          }
        }
      }
      if (!locationModifier) {
        for (const d of KNOWN_DISTRICTS) {
          if (new RegExp(`\\b${d}\\b`, "i").test(working)) {
            matchedDistrict = d.charAt(0).toUpperCase() + d.slice(1);
            locationModifier = matchedDistrict;
            locationType = "DISTRICT";
            working = working.replace(new RegExp(`\\b${d}\\b`, "i"), " ").trim();
            break;
          }
        }
      }
      if (!locationModifier) {
        for (const p of KNOWN_CITIES_COUNTRIES) {
          if (new RegExp(`\\b${p.key}\\b`, "i").test(working)) {
            if (p.type === "CITY") {
              matchedCity = p.name;
              locationModifier = p.name;
              locationType = "CITY";
            } else {
              matchedCountry = p.name;
              locationModifier = p.name;
              locationType = "COUNTRY";
            }
            working = working.replace(new RegExp(`\\b${p.key}\\b`, "i"), " ").trim();
            break;
          }
        }
      }
    }
  }

  // 4. Detect Category intent from raw query or working query
  let detectedCategory: string | undefined;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => working.includes(kw) || raw.toLowerCase().includes(kw))) {
      detectedCategory = cat;
      break;
    }
  }

  // Clean trailing punctuation and multiple spaces
  const cleanQuery = working.replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim();

  return {
    rawQuery: raw,
    cleanQuery: cleanQuery,
    locationModifier,
    locationType,
    priceMax,
    priceMin,
    detectedCategory,
    matchedLandmark,
    matchedSector,
    matchedCell,
    matchedDistrict,
    matchedCity,
    matchedCountry,
  };
}
