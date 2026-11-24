import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { absoluteUrl, isIndexable } from "@/lib/seo/site";

/**
 * /robots.txt: prod on the canonical host allows crawling and points at the sitemap; everything
 * else (staging, raw Cloud Run URLs) disallows everything. See src/lib/seo/site.ts.
 */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  if (!isIndexable(h.get("host"))) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
