import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { absoluteUrl, isIndexableHost } from "@/lib/seo/site";

/**
 * /robots.txt per host: the canonical host allows crawling and points at the sitemap; any other
 * host (staging, raw Cloud Run URLs) disallows everything. See src/lib/seo/site.ts.
 */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!isIndexableHost(host)) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
