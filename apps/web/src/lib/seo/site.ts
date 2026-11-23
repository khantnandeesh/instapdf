/**
 * Site identity for SEO (docs/seo/strategy.md).
 *
 * The same container image runs on staging and production (prod promotes the image staging
 * built), so the canonical origin is a build-time constant and indexing is a runtime switch
 * (see `isIndexable`). Staging, the raw Cloud Run URLs and previews all get
 * `X-Robots-Tag: noindex` and a robots.txt that disallows everything.
 *
 * SITE_ORIGIN is a placeholder until the owner picks the launch domain (docs/seo/strategy.md,
 * "Owner decisions"). Changing it is the only step needed to go live.
 */
export const SITE_NAME = "BerryPDF";

export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://www.berrypdf.com").replace(/\/+$/, "");

export const SITE_HOST = new URL(SITE_ORIGIN).host;

/** Default social image size (Open Graph and X/Twitter large card). */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Absolute URL for a site path ("/rotate-pdf" → "https://…/rotate-pdf"). The root has no trailing slash issue: "/" → origin + "/". */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * True when a response may be indexed. Two conditions, both required:
 * 1. `SITE_INDEXABLE=1` in the runtime environment. Only the prod Cloud Run service sets it
 *    (.github/workflows/deploy-prod.yml); staging runs the same image without it.
 * 2. The `Host` header is exactly the canonical host (or localhost, for local and CI checks).
 *    We never read `X-Forwarded-Host`: clients can set it, and a cache in front of prod
 *    could store a spoofed noindex for everyone.
 */
export function isIndexable(host: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (env.SITE_INDEXABLE !== "1" || !host) return false;
  const h = host.toLowerCase();
  return h === SITE_HOST || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h);
}
