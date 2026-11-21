import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://55mosa.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/explore",
          "/demand",
          "/community",
          "/register-business",
          "/business/",
        ],
        disallow: [
          "/admin",
          "/admin/",
          "/owner",
          "/owner/",
          "/agent",
          "/agent/",
          "/api/",
          "/auth/",
          "/business/*/claim",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: [
          "/",
          "/explore",
          "/demand",
          "/community",
          "/register-business",
          "/business/",
        ],
        disallow: [
          "/admin",
          "/admin/",
          "/owner",
          "/owner/",
          "/agent",
          "/agent/",
          "/api/",
          "/auth/",
          "/business/*/claim",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
