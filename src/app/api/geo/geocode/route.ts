import { NextResponse } from "next/server";
import { interpretLocationDescription, reverseGeocodeCoords } from "@/lib/geocoding";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const description = (body.description || body.query || body.text || "").trim();
    const context = body.context || undefined;
    const country = body.country || context?.country || undefined;

    if (body.lat !== undefined && body.lng !== undefined) {
      const rev = await reverseGeocodeCoords(Number(body.lat), Number(body.lng));
      return NextResponse.json({ success: true, ...rev, result: rev });
    }

    if (!description) {
      return NextResponse.json(
        { success: false, error: "Location description or coordinates are required" },
        { status: 400 }
      );
    }

    const result = await interpretLocationDescription(description, {
      ...context,
      country,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error("[Geocode API] Error processing location:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to geocode location description",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const latParam = searchParams.get("lat") || searchParams.get("latitude");
    const lngParam = searchParams.get("lng") || searchParams.get("longitude");

    // Reverse Geocoding by Coordinates
    if (latParam && lngParam) {
      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);
      if (!isNaN(lat) && !isNaN(lng)) {
        const rev = await reverseGeocodeCoords(lat, lng);
        return NextResponse.json({ success: true, ...rev, result: rev });
      }
    }

    const description = (searchParams.get("description") || searchParams.get("q") || "").trim();
    const country = searchParams.get("country") || undefined;
    const province = searchParams.get("province") || undefined;
    const district = searchParams.get("district") || undefined;
    const sector = searchParams.get("sector") || undefined;

    if (!description) {
      return NextResponse.json(
        { success: false, error: "Query parameter 'description', 'q', or ('lat' & 'lng') is required" },
        { status: 400 }
      );
    }

    const context = (country || province || district || sector) ? { country, province, district, sector } : undefined;
    const result = await interpretLocationDescription(description, context);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error("[Geocode API] GET Error processing location:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to geocode location description",
      },
      { status: 500 }
    );
  }
}
