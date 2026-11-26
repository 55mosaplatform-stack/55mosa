import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { Role } from "@prisma/client";
import { RWANDA_HIERARCHY } from "@/lib/rwanda-geo";

function buildFallbackTree() {
  const provinces = Object.entries(RWANDA_HIERARCHY).map(([pKey, pVal]) => ({
    id: `fallback-prov-${pKey}`,
    code: pKey.toUpperCase(),
    name: pVal.name,
    nameRw: pVal.nameRw,
    districts: Object.entries(pVal.districts).map(([dKey, dVal]) => ({
      id: `fallback-dist-${dKey}`,
      code: dKey.toUpperCase(),
      name: dVal.name,
      nameRw: dVal.nameRw,
      sectors: Object.entries(dVal.sectors).map(([sKey, sVal]) => ({
        id: `fallback-sect-${sKey}`,
        code: `${dKey.toUpperCase()}_${sKey.toUpperCase()}`,
        name: sVal.name,
        nameRw: sVal.nameRw,
        cells: Object.entries(sVal.cells).map(([cKey, cVal]) => ({
          id: `fallback-cell-${cKey}`,
          name: cVal.name,
          nameRw: cVal.nameRw,
          localAreas: cVal.communities.map((comm) => ({
            id: `fallback-area-${comm.code}`,
            name: comm.name,
            nameRw: comm.nameRw,
            latitude: comm.lat,
            longitude: comm.lng,
          })),
          _count: { businesses: 0 },
        })),
        _count: { businesses: 0, agents: 0 },
      })),
      _count: { sectors: Object.keys(dVal.sectors).length, businesses: 0 },
    })),
  }));

  const counts = {
    provinces: provinces.length,
    districts: provinces.reduce((acc, p) => acc + p.districts.length, 0),
    sectors: provinces.reduce((acc, p) => acc + p.districts.reduce((dAcc, d) => dAcc + d.sectors.length, 0), 0),
    cells: provinces.reduce((acc, p) => acc + p.districts.reduce((dAcc, d) => dAcc + d.sectors.reduce((sAcc, s) => sAcc + s.cells.length, 0), 0), 0),
  };

  return { counts, provinces };
}

// In-memory cache for geographic tree hierarchy (1 hour TTL)
interface CachedGeoTree {
  data: any;
  timestamp: number;
}
let geoTreeCache: CachedGeoTree | null = null;
const GEO_CACHE_TTL_MS = 60 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level") || "tree"; // "tree" | "sectors" | "cells"
  const sectorName = searchParams.get("sector");

  try {
    if (level === "provinces") {
      const provinces = await prisma.geographicProvince.findMany({
        include: {
          _count: { select: { districts: true, businesses: true } },
        },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ success: true, provinces });
    }

    if (level === "districts") {
      const provinceCode = searchParams.get("province");
      const where: any = {};
      if (provinceCode) {
        where.province = {
          OR: [
            { code: { equals: provinceCode, mode: "insensitive" } },
            { name: { equals: provinceCode, mode: "insensitive" } },
          ],
        };
      }

      const districts = await prisma.geographicDistrict.findMany({
        where,
        include: {
          province: true,
          _count: { select: { sectors: true, businesses: true } },
        },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ success: true, count: districts.length, districts });
    }

    if (level === "sectors") {
      const districtId = searchParams.get("districtId");
      const districtName = searchParams.get("district");
      const where: any = {};
      if (districtId) where.districtId = districtId;
      else if (districtName) {
        where.districtRel = {
          OR: [
            { name: { equals: districtName, mode: "insensitive" } },
            { code: { equals: districtName, mode: "insensitive" } },
          ],
        };
      }

      const sectors = await prisma.geographicSector.findMany({
        where,
        include: {
          districtRel: {
            include: { province: true },
          },
          cells: {
            include: {
              localAreas: true,
              _count: { select: { businesses: true } },
            },
          },
          _count: { select: { businesses: true, agents: true, demands: true } },
        },
        orderBy: { name: "asc" },
      });
      
      // Format with clean property names
      const formatted = sectors.map((s: any) => ({
        id: s.id,
        name: s.name,
        nameRw: s.nameRw,
        district: {
          id: s.districtRel?.id,
          name: s.districtRel?.name,
          nameRw: s.districtRel?.nameRw,
          province: {
            id: s.districtRel?.province?.id,
            name: s.districtRel?.province?.name,
            nameRw: s.districtRel?.province?.nameRw,
          },
        },
        cells: (s.cells || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          nameRw: c.nameRw,
          localAreas: c.localAreas,
          _count: c._count,
        })),
        _count: s._count,
      }));

      return NextResponse.json({ success: true, sectors: formatted });
    }

    if (level === "cells" && (sectorName || searchParams.get("sectorId"))) {
      const sectorId = searchParams.get("sectorId");
      const where: any = {};
      if (sectorId) where.sectorId = sectorId;
      else if (sectorName) {
        where.sectorRel = { name: { equals: sectorName, mode: "insensitive" } };
      }

      const cells = await prisma.geographicCell.findMany({
        where,
        include: {
          localAreas: true,
          _count: { select: { businesses: true } },
        },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ success: true, cells });
    }

    // Default: full tree of provinces -> districts -> sectors -> cells -> local areas
    if (geoTreeCache && (Date.now() - geoTreeCache.timestamp < GEO_CACHE_TTL_MS)) {
      return NextResponse.json(geoTreeCache.data, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "X-MOSA-Cache": "HIT",
        },
      });
    }

    const provinces = await prisma.geographicProvince.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        nameRw: true,
        districts: {
          select: {
            id: true,
            code: true,
            name: true,
            nameRw: true,
            sectors: {
              select: {
                id: true,
                code: true,
                name: true,
                nameRw: true,
                cells: {
                  select: {
                    id: true,
                    name: true,
                    nameRw: true,
                    localAreas: {
                      select: {
                        id: true,
                        name: true,
                        nameRw: true,
                        latitude: true,
                        longitude: true,
                        type: true,
                        landmark: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    let finalProvinces = provinces as any[];
    let counts = {
      provinces: provinces.length,
      districts: provinces.reduce((acc, p) => acc + p.districts.length, 0),
      sectors: provinces.reduce((acc, p) => acc + p.districts.reduce((dAcc, d) => dAcc + d.sectors.length, 0), 0),
      cells: provinces.reduce((acc, p) => acc + p.districts.reduce((dAcc, d) => dAcc + d.sectors.reduce((sAcc, s) => sAcc + s.cells.length, 0), 0), 0),
    };

    if (counts.sectors === 0 || finalProvinces.length === 0) {
      const fallback = buildFallbackTree();
      counts = fallback.counts;
      finalProvinces = fallback.provinces as any;
    }

    const responsePayload = {
      success: true,
      counts,
      provinces: finalProvinces,
    };

    geoTreeCache = {
      data: responsePayload,
      timestamp: Date.now(),
    };

    return NextResponse.json(responsePayload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-MOSA-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("[Geo API] Error loading geographic hierarchy, using resilient fallback:", error);
    const fallback = buildFallbackTree();
    return NextResponse.json({
      success: true,
      counts: fallback.counts,
      provinces: fallback.provinces,
      isFallback: true,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=300",
      },
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== Role.SUPER_ADMIN && user.role !== Role.COMMUNITY_ADMIN && user.role !== Role.COMMUNITY_AGENT)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { sectorId, cellId, name, nameRw, type = "LANDMARK", addressNote, latitude, longitude } = body;

    let targetSectorId = sectorId;
    if (!targetSectorId && cellId) {
      const cell = await prisma.geographicCell.findUnique({ where: { id: cellId } });
      if (cell) targetSectorId = cell.sectorId;
    }

    if (!targetSectorId || !name) {
      return NextResponse.json(
        { error: "sectorId and name are required" },
        { status: 400 }
      );
    }

    const localArea = await prisma.localArea.create({
      data: {
        sectorId: targetSectorId,
        cellId: cellId || null,
        name,
        nameRw: nameRw || name,
        type,
        addressNote: addressNote || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
      },
    });

    await logAuditEvent({
      actorId: user.id,
      action: "CREATE_LOCAL_AREA",
      entityType: "LOCAL_AREA",
      entityId: localArea.id,
      metadata: { name, type, cellId, sectorId: targetSectorId },
    });

    return NextResponse.json({ success: true, localArea }, { status: 201 });
  } catch (error) {
    console.error("[Geo API] Error creating local area:", error);
    return NextResponse.json(
      { error: "Failed to create local area" },
      { status: 500 }
    );
  }
}
