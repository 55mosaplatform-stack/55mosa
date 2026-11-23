/**
 * 55 MOSA — Global Country Administrative & Address Configuration
 * Provides administrative field schemas, search placeholders, default map centers,
 * and geocoding country codes for international business registration.
 */

export interface CountryAddressConfig {
  code: string;            // ISO 2-letter country code (RW, KE, UG, GB, US, etc.)
  name: string;            // Full display name
  flag: string;            // Emoji flag
  currency: string;        // Default currency code (RWF, KES, UGX, GBP, USD, etc.)
  defaultCenter: { lat: number; lng: number }; // Capital / primary economic hub
  defaultZoom: number;
  phonePrefix: string;     // E.164 phone prefix (+250, +254, +256, +44, +1)
  searchPlaceholder: string;
  landmarkExample: string;
  streetExample: string;
  fieldLabels: {
    level1: string;        // e.g. "Province / City" (RW), "County" (KE), "State" (US), "Region" (UG), "Country / Region" (GB)
    level2: string;        // e.g. "District" (RW/UG), "Sub-County / Constituency" (KE), "City / Town" (US/GB)
    level3: string;        // e.g. "Sector" (RW), "Ward / Locality" (KE), "Division / Municipality" (UG), "Borough / Area" (US/GB)
    level4: string;        // e.g. "Cell" (RW), "Estate / Neighborhood" (KE), "Parish / Ward" (UG), "Neighborhood / ZIP" (US), "Postcode / District" (GB)
    postalOrVillage: string; // e.g. "Village (Umudugudu)" (RW), "Zone / LC1" (UG), "Postal Code" (KE/US/GB)
  };
  levelPlaceholders: {
    level1: string;
    level2: string;
    level3: string;
    level4: string;
    postalOrVillage: string;
  };
}

export const GLOBAL_COUNTRY_CONFIGS: Record<string, CountryAddressConfig> = {
  Rwanda: {
    code: "RW",
    name: "Rwanda",
    flag: "🇷🇼",
    currency: "RWF",
    defaultCenter: { lat: -1.9441, lng: 30.0619 },
    defaultZoom: 15,
    phonePrefix: "+250",
    searchPlaceholder: "e.g. Kacyiru, near Kigali Business Centre, KG 7 Ave",
    landmarkExample: "e.g. Kigali Business Centre (KBC), Green Mosque, Near Sacco Kacyiru",
    streetExample: "e.g. KG 7 Ave, KG 548 St, KN 3 Ave",
    fieldLabels: {
      level1: "Province / City",
      level2: "District",
      level3: "Sector",
      level4: "Cell",
      postalOrVillage: "Village (Umudugudu)",
    },
    levelPlaceholders: {
      level1: "Select Province",
      level2: "Select District",
      level3: "Select Sector",
      level4: "Select Cell",
      postalOrVillage: "e.g. Kamutwa I, Inyange",
    },
  },

  Uganda: {
    code: "UG",
    name: "Uganda",
    flag: "🇺🇬",
    currency: "UGX",
    defaultCenter: { lat: 0.3476, lng: 32.5825 }, // Kampala
    defaultZoom: 14,
    phonePrefix: "+256",
    searchPlaceholder: "e.g. Nakawa, near Acacia Mall, Kampala Road",
    landmarkExample: "e.g. Acacia Mall, Clock Tower, Near Uganda House, Garden City",
    streetExample: "e.g. Kampala Road, Jinja Road, Lugogo Bypass",
    fieldLabels: {
      level1: "Region",
      level2: "District / City",
      level3: "Division / Sub-County",
      level4: "Parish / Ward",
      postalOrVillage: "Zone / Village / LC1",
    },
    levelPlaceholders: {
      level1: "e.g. Central Region, Western Region",
      level2: "e.g. Kampala, Wakiso, Jinja, Entebbe, Mbarara",
      level3: "e.g. Nakawa, Kawempe, Makindye, Central Division",
      level4: "e.g. Kololo, Bukoto, Bugolobi, Muyenga, Kisugu",
      postalOrVillage: "e.g. Zone 1, Mawanda Zone, Lower Kololo",
    },
  },

  Kenya: {
    code: "KE",
    name: "Kenya",
    flag: "🇰🇪",
    currency: "KES",
    defaultCenter: { lat: -1.2921, lng: 36.8219 }, // Nairobi
    defaultZoom: 14,
    phonePrefix: "+254",
    searchPlaceholder: "e.g. Westlands, near Sarit Centre, Waiyaki Way",
    landmarkExample: "e.g. Sarit Centre, Junction Mall, City Market, Nairobi Hospital",
    streetExample: "e.g. Waiyaki Way, Kenyatta Avenue, Moi Avenue, Ngong Road",
    fieldLabels: {
      level1: "County",
      level2: "Sub-County / Constituency",
      level3: "Ward / Locality",
      level4: "Estate / Neighborhood",
      postalOrVillage: "Postal Code",
    },
    levelPlaceholders: {
      level1: "e.g. Nairobi, Mombasa, Kisumu, Kiambu, Nakuru",
      level2: "e.g. Westlands, Dagoretti, Starehe, Lang'ata",
      level3: "e.g. Parklands, Kilimani, Upper Hill, Karen",
      level4: "e.g. Highridge, South B, Buruburu, Nyayo Estate",
      postalOrVillage: "e.g. 00100, 00200",
    },
  },

  "United Kingdom": {
    code: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    currency: "GBP",
    defaultCenter: { lat: 51.5074, lng: -0.1278 }, // London
    defaultZoom: 13,
    phonePrefix: "+44",
    searchPlaceholder: "e.g. Westminster, near Oxford Circus, Regent Street",
    landmarkExample: "e.g. Near Piccadilly Circus, Marble Arch, King's Cross Station",
    streetExample: "e.g. Oxford Street, Regent Street, Baker Street",
    fieldLabels: {
      level1: "Country / Region",
      level2: "City / Borough / Town",
      level3: "District / Locality",
      level4: "Postcode",
      postalOrVillage: "Locality / Ward",
    },
    levelPlaceholders: {
      level1: "e.g. England, Greater London, Scotland, Wales",
      level2: "e.g. London, Westminster, Manchester, Birmingham, Camden",
      level3: "e.g. Soho, Shoreditch, Canary Wharf, Covent Garden",
      level4: "e.g. W1D 1BS, SW1A 1AA, EC1A 1BB, M1 1AD",
      postalOrVillage: "e.g. West End, Southwark",
    },
  },

  "United States": {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    currency: "USD",
    defaultCenter: { lat: 40.7128, lng: -74.0060 }, // New York City
    defaultZoom: 13,
    phonePrefix: "+1",
    searchPlaceholder: "e.g. Manhattan, near Times Square, Broadway",
    landmarkExample: "e.g. Near Times Square, Empire State Building, Ferry Building",
    streetExample: "e.g. 5th Avenue, Broadway, Market Street, Main St",
    fieldLabels: {
      level1: "State",
      level2: "City / Municipality",
      level3: "Borough / County",
      level4: "Neighborhood / Suburb",
      postalOrVillage: "ZIP Code",
    },
    levelPlaceholders: {
      level1: "e.g. California, New York, Texas, Florida, Illinois",
      level2: "e.g. New York, San Francisco, Los Angeles, Chicago, Austin",
      level3: "e.g. Manhattan, Brooklyn, Cook County, Travis County",
      level4: "e.g. Midtown, SoHo, Mission District, Hollywood",
      postalOrVillage: "e.g. 10001, 94103, 90210, 60601",
    },
  },

  Tanzania: {
    code: "TZ",
    name: "Tanzania",
    flag: "🇹🇿",
    currency: "TZS",
    defaultCenter: { lat: -6.7924, lng: 39.2083 }, // Dar es Salaam
    defaultZoom: 13,
    phonePrefix: "+255",
    searchPlaceholder: "e.g. Kariakoo, near Clock Tower, Samora Avenue",
    landmarkExample: "e.g. Kariakoo Market, Askari Monument, Mlimani City",
    streetExample: "e.g. Samora Avenue, Morogoro Road, Ali Hassan Mwinyi Rd",
    fieldLabels: {
      level1: "Region",
      level2: "District",
      level3: "Ward / Division",
      level4: "Street / Sub-ward (Mtaa)",
      postalOrVillage: "Postal Code",
    },
    levelPlaceholders: {
      level1: "e.g. Dar es Salaam, Arusha, Mwanza, Dodoma",
      level2: "e.g. Ilala, Kinondoni, Ubungo, Temeke",
      level3: "e.g. Kariakoo, Upanga, Sinza, Masaki",
      level4: "e.g. Msimbazi, Posta, Mikocheni",
      postalOrVillage: "e.g. 11101",
    },
  },

  Nigeria: {
    code: "NG",
    name: "Nigeria",
    flag: "🇳🇬",
    currency: "NGN",
    defaultCenter: { lat: 6.5244, lng: 3.3792 }, // Lagos
    defaultZoom: 13,
    phonePrefix: "+234",
    searchPlaceholder: "e.g. Ikeja, near Computer Village, Allen Avenue",
    landmarkExample: "e.g. Computer Village, Lekki Phase 1 Gate, National Stadium",
    streetExample: "e.g. Allen Avenue, Awolowo Road, Broad Street",
    fieldLabels: {
      level1: "State",
      level2: "LGA / City",
      level3: "District / Area",
      level4: "Neighborhood / Suburb",
      postalOrVillage: "Postal Code",
    },
    levelPlaceholders: {
      level1: "e.g. Lagos State, Abuja FCT, Rivers State, Oyo State",
      level2: "e.g. Ikeja, Eti-Osa, Abuja Municipal, Ibadan",
      level3: "e.g. Victoria Island, Lekki, Ikoyi, Yaba",
      level4: "e.g. Phase 1, Garki, Bodija",
      postalOrVillage: "e.g. 100001",
    },
  },

  Ghana: {
    code: "GH",
    name: "Ghana",
    flag: "🇬🇭",
    currency: "GHS",
    defaultCenter: { lat: 5.6037, lng: -0.1870 }, // Accra
    defaultZoom: 13,
    phonePrefix: "+233",
    searchPlaceholder: "e.g. Osu, near Oxford Street, Ring Road",
    landmarkExample: "e.g. Oxford Street Mall, Accra Mall, Independence Arch",
    streetExample: "e.g. Oxford Street, Ring Road Central, Liberation Road",
    fieldLabels: {
      level1: "Region",
      level2: "Metropolis / District",
      level3: "Municipality / Suburb",
      level4: "Neighborhood / Area",
      postalOrVillage: "Digital Address (GhanaPostGPS)",
    },
    levelPlaceholders: {
      level1: "e.g. Greater Accra, Ashanti, Western",
      level2: "e.g. Accra Metropolitan, Tema, Kumasi",
      level3: "e.g. Osu, East Legon, Airport Residential, Labone",
      level4: "e.g. Ringway, Dzorwulu, Cantonments",
      postalOrVillage: "e.g. GA-183-9020",
    },
  },

  "South Africa": {
    code: "ZA",
    name: "South Africa",
    flag: "🇿🇦",
    currency: "ZAR",
    defaultCenter: { lat: -26.2041, lng: 28.0473 }, // Johannesburg
    defaultZoom: 13,
    phonePrefix: "+27",
    searchPlaceholder: "e.g. Sandton, near Nelson Mandela Square, Rivonia Rd",
    landmarkExample: "e.g. Nelson Mandela Square, Sandton City, V&A Waterfront",
    streetExample: "e.g. Rivonia Road, Long Street, Oxford Road",
    fieldLabels: {
      level1: "Province",
      level2: "Municipality / City",
      level3: "Sub-District / Area",
      level4: "Suburb / Township",
      postalOrVillage: "Postal Code",
    },
    levelPlaceholders: {
      level1: "e.g. Gauteng, Western Cape, KwaZulu-Natal",
      level2: "e.g. Johannesburg, Cape Town, Durban, Pretoria",
      level3: "e.g. Sandton, Rosebank, City Bowl, Umhlanga",
      level4: "e.g. Morningside, Bryanston, Camps Bay",
      postalOrVillage: "e.g. 2196, 8001",
    },
  },
};

export const DEFAULT_INTERNATIONAL_CONFIG: CountryAddressConfig = {
  code: "OTHER",
  name: "Other / International",
  flag: "🌍",
  currency: "USD",
  defaultCenter: { lat: 0, lng: 0 },
  defaultZoom: 3,
  phonePrefix: "+",
  searchPlaceholder: "e.g. Street, Neighborhood, City, Country",
  landmarkExample: "e.g. Famous monument, major shopping centre, central station",
  streetExample: "e.g. Main Street, Commercial Avenue",
  fieldLabels: {
    level1: "State / Province / Region",
    level2: "City / Municipality / Town",
    level3: "Locality / District / Area",
    level4: "Neighborhood / Suburb",
    postalOrVillage: "Postal Code / PIN",
  },
  levelPlaceholders: {
    level1: "e.g. State or Administrative Region",
    level2: "e.g. Primary City or Municipality",
    level3: "e.g. Urban District, Locality, or Zone",
    level4: "e.g. Neighborhood, Quarter, or Suburb",
    postalOrVillage: "e.g. Postal or ZIP code",
  },
};

export function getCountryConfig(countryName?: string): CountryAddressConfig {
  if (!countryName) return GLOBAL_COUNTRY_CONFIGS.Rwanda;
  const match = Object.keys(GLOBAL_COUNTRY_CONFIGS).find(
    (k) => k.toLowerCase() === countryName.toLowerCase().trim()
  );
  return match ? GLOBAL_COUNTRY_CONFIGS[match] : DEFAULT_INTERNATIONAL_CONFIG;
}
