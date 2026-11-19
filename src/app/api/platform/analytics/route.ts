import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/platform/analytics
 * Public telemetry and live ecosystem analytics computed directly from Supabase PostgreSQL.
 * Strict privacy shield: Aggregated counts and categorical distributions only.
 */
export async function GET() {
  try {
    const [
      totalBusinesses,
      verifiedBusinesses,
      pendingBusinesses,
      totalUsers,
      totalAnnouncements,
      totalBusinessUpdates,
      totalOffers,
      totalReviews,
      categoryDistribution,
      districtDistribution,
    ] = await Promise.all([
      // 1. Registered businesses (active + pending)
      prisma.business.count({
        where: { status: { in: ["ACTIVE", "PENDING"] } },
      }),
      // 2. Verified enterprises
      prisma.business.count({
        where: {
          status: "ACTIVE",
          verificationStatus: { in: ["AGENT_VERIFIED", "HIGH_CONFIDENCE", "COMMUNITY_VERIFIED"] },
        },
      }),
      // 3. Pending verification queue
      prisma.business.count({
        where: { status: "PENDING" },
      }),
      // 4. Platform users & community members
      prisma.user.count(),
      // 5. Official platform announcements
      prisma.partnerAnnouncement.count({
        where: { status: { in: ["SENT", "PUBLISHED"] } },
      }),
      // 6. Enterprise updates & news
      prisma.businessUpdate.count({
        where: { status: "ACTIVE" },
      }),
      // 7. Active community promotions & offers
      prisma.offer.count({
        where: { status: "ACTIVE" },
      }),
      // 8. Public reviews & recommendations
      prisma.review.count(),
      // 9. Popular business categories
      prisma.business.groupBy({
        by: ["category"],
        where: { status: "ACTIVE" },
        _count: { _all: true },
        orderBy: { _count: { category: "desc" } },
        take: 8,
      }),
      // 10. Geographic distribution by District
      prisma.business.groupBy({
        by: ["district"],
        where: { status: "ACTIVE" },
        _count: { _all: true },
        orderBy: { _count: { district: "desc" } },
        take: 8,
      }),
    ]);

    const totalCommunityPublications = totalAnnouncements + totalBusinessUpdates + totalOffers;

    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        summary: {
          totalRegisteredBusinesses: totalBusinesses,
          verifiedEnterprises: verifiedBusinesses,
          pendingVerification: pendingBusinesses,
          communityMembers: totalUsers,
          communityPublications: totalCommunityPublications,
          activeOffers: totalOffers,
          verifiedReviews: totalReviews,
        },
        distributions: {
          categories: categoryDistribution.map((c) => ({
            category: c.category,
            count: (c as any)._count?._all ?? 0,
          })),
          districts: districtDistribution.map((d) => ({
            district: d.district || "Unassigned",
            count: (d as any)._count?._all ?? 0,
          })),
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error: any) {
    console.error("[Platform Analytics API] Error calculating metrics:", error);
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to compute platform analytics from database",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
