/**
 * Site identity for SEO (docs/seo/strategy.md).
 *
 * The same container image runs on staging and production (prod promotes the image staging
 * built), so the canonical origin is a build-time constant and indexing is decided per request
 * by host: only requests served on the canonical host may be indexed. Staging, the raw Cloud Run
 * URLs and previews all get `X-Robots-Tag: noindex` and a robots.txt that disallows everything.
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
 * True when a request host may be indexed. The canonical host only; `localhost` counts as
 * indexable so local and CI checks see production output.
 */
export function isIndexableHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return h === SITE_HOST || h.startsWith("localhost:") || h === "localhost" || h.startsWith("127.0.0.1");
}
