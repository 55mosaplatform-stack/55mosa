import { NextResponse } from "next/server";
import { getCountryConfigByCode, getCountryConfig } from "@/lib/country-address-config";

export const dynamic = "force-dynamic";

/**
 * GET /api/geo/detect
 * Automatic Visitor Geolocation Detection Endpoint.
 * Determines approximate visitor country, locality, and coordinates from Edge headers
 * (Vercel Geolocation & Cloudflare IP headers) with graceful fallback and testing overrides.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const headers = new Headers(request.headers);

    // 1. Check for manual/test query overrides (for targeted verification and testing)
    const overrideCountryCode = searchParams.get("countryCode") || searchParams.get("code");
    const overrideCountryName = searchParams.get("country");
    const overrideCity = searchParams.get("city") || searchParams.get("locality");
    const overrideLat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : null;
    const overrideLng = searchParams.get("lng") ? parseFloat(searchParams.get("lng")!) : null;

    // 2. Read Edge Geolocation Headers (Vercel & Cloudflare)
    const headerCountryCode =
      headers.get("x-vercel-ip-country") ||
      headers.get("cf-ipcountry") ||
      headers.get("x-country-code");

    const headerCityRaw =
      headers.get("x-vercel-ip-city") ||
      headers.get("cf-ipcity") ||
      headers.get("x-city");

    let headerCity: string | null = null;
    if (headerCityRaw) {
      try {
        headerCity = decodeURIComponent(headerCityRaw);
      } catch {
        headerCity = headerCityRaw;
      }
    }

    const headerRegion =
      headers.get("x-vercel-ip-country-region") ||
      headers.get("x-region");

    const headerLatRaw = headers.get("x-vercel-ip-latitude");
    const headerLngRaw = headers.get("x-vercel-ip-longitude");
    const headerLat = headerLatRaw ? parseFloat(headerLatRaw) : null;
    const headerLng = headerLngRaw ? parseFloat(headerLngRaw) : null;

    // 3. Resolve Country
    let detectedCountryConfig;
    let detectionMethod: "IP" | "OVERRIDE" | "DEFAULT" = "IP";

    if (overrideCountryCode) {
      detectedCountryConfig = getCountryConfigByCode(overrideCountryCode);
      detectionMethod = "OVERRIDE";
    } else if (overrideCountryName) {
      detectedCountryConfig = getCountryConfig(overrideCountryName);
      detectionMethod = "OVERRIDE";
    } else if (headerCountryCode && headerCountryCode !== "XX") {
      detectedCountryConfig = getCountryConfigByCode(headerCountryCode);
      detectionMethod = "IP";
    } else {
      // Default to Rwanda as headquarters reference when edge headers are absent (e.g. localhost)
      detectedCountryConfig = getCountryConfig("Rwanda");
      detectionMethod = "DEFAULT";
    }

    // 4. Resolve Locality / City
    let finalCity = overrideCity || headerCity;
    if (!finalCity) {
      // Use capital or primary economic hub based on resolved country
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
      finalCity = capitalCities[detectedCountryConfig.code] || "Worldwide";
    }

    // 5. Resolve Coordinates
    let finalLat = overrideLat || headerLat;
    let finalLng = overrideLng || headerLng;

    if (finalLat === null || finalLng === null || isNaN(finalLat) || isNaN(finalLng)) {
      finalLat = detectedCountryConfig.defaultCenter.lat;
      finalLng = detectedCountryConfig.defaultCenter.lng;
    }

    // 6. Build Human-Readable Locality Display Label
    const displayLabel = `${finalCity}, ${detectedCountryConfig.name}`;

    return NextResponse.json({
      success: true,
      countryCode: detectedCountryConfig.code,
      country: detectedCountryConfig.name,
      flag: detectedCountryConfig.flag,
      city: finalCity,
      locality: finalCity,
      region: headerRegion || detectedCountryConfig.name,
      latitude: finalLat,
      longitude: finalLng,
      detectionMethod,
      displayLabel,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Geo Detect Error]:", error);
    // Safe non-blocking fallback
    return NextResponse.json({
      success: true,
      countryCode: "RW",
      country: "Rwanda",
      flag: "🇷🇼",
      city: "Kigali",
      locality: "Kigali",
      latitude: -1.9441,
      longitude: 30.0619,
      detectionMethod: "DEFAULT",
      displayLabel: "Kigali, Rwanda",
      fallback: true,
    });
  }
}
