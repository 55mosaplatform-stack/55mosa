import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://55mosa.com";
  const now = new Date();

  // Static indexable public routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/demand`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/community`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/register-business`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  // Dynamic public business profiles
  try {
    const activeBusinesses = await prisma.business.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, updatedAt: true },
    });

    const businessRoutes: MetadataRoute.Sitemap = activeBusinesses.map((b) => ({
      url: `${baseUrl}/business/${b.id}`,
      lastModified: b.updatedAt ? new Date(b.updatedAt) : now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

    return [...staticRoutes, ...businessRoutes];
  } catch (error) {
    console.error("[Sitemap Generation Warning]: Failed to fetch dynamic business routes:", error);
    return staticRoutes;
  }
}
