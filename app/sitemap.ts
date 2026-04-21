import type { MetadataRoute } from "next";
import { getArticleSlugs } from "@/lib/content";
import { SITE } from "@/lib/constants";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    { url: SITE.url, lastModified: new Date(), priority: 1.0 },
    { url: `${SITE.url}/about`, lastModified: new Date(), priority: 0.8 },
    {
      url: `${SITE.url}/services`,
      lastModified: new Date(),
      priority: 0.8,
    },
    {
      url: `${SITE.url}/pricing`,
      lastModified: new Date(),
      priority: 0.9,
    },
    { url: `${SITE.url}/contact`, lastModified: new Date(), priority: 0.7 },
    {
      url: `${SITE.url}/learning-centre`,
      lastModified: new Date(),
      priority: 0.9,
    },
    {
      url: `${SITE.url}/the-signal-method`,
      lastModified: new Date(),
      priority: 0.8,
    },
  ];

  const articles = getArticleSlugs("learning-centre").map((slug) => ({
    url: `${SITE.url}/learning-centre/${slug}`,
    lastModified: new Date(),
    priority: 0.7 as const,
  }));

  return [...staticPages, ...articles];
}
