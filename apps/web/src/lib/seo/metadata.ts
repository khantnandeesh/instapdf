/**
 * One way to build page metadata (docs/seo/strategy.md). Every indexable page goes through
 * `pageMetadata`, which sets the title, description, canonical, hreflang alternates, Open Graph
 * and X/Twitter tags consistently. Social images come from the `opengraph-image` file
 * convention (src/app/opengraph-image.tsx and per-tool files), which Next merges in.
 */
import type { Metadata } from "next";
import type { Tool } from "@/tools/registry";
import { toolPageTitle, toolSeo } from "@/tools/seo";
import { languageAlternates } from "./i18n";
import { OG_SIZE, SITE_NAME, SITE_ORIGIN } from "./site";

export type PageSeo = {
  /** Site path, e.g. "/rotate-pdf". Used for canonical, og:url and hreflang. */
  path: string;
  /** Full title as it should appear in search (already includes the brand). */
  title: string;
  description: string;
  /** Keep the page out of the index (coming-soon pages, utility pages). */
  noindex?: boolean;
};

/**
 * The site-wide card (src/app/opengraph-image.tsx). A page's own `openGraph` replaces its parent's,
 * which would drop the inherited image, so every page names it; a segment's own
 * `opengraph-image` file (tool pages) still wins, as file metadata has priority.
 */
const defaultImage = { url: "/opengraph-image", width: OG_SIZE.width, height: OG_SIZE.height, alt: "BerryPDF: free, private PDF tools" };

export function pageMetadata({ path, title, description, noindex }: PageSeo): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path, languages: noindex ? undefined : languageAlternates(path) },
    openGraph: { type: "website", siteName: SITE_NAME, url: path, title, description, locale: "en_US", images: [defaultImage] },
    twitter: { card: "summary_large_image", title, description, images: [defaultImage] },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  };
}

/** Metadata for a tool page. Planned tools are noindex until they work (thin pages hurt the site). */
export function toolMetadata(tool: Tool): Metadata {
  const seo = toolSeo[tool.slug];
  const planned = tool.status === "planned";
  return pageMetadata({
    path: `/${tool.slug}`,
    title: planned ? `${tool.name} (coming soon) | ${SITE_NAME}` : toolPageTitle(tool.slug),
    description: seo?.description ?? tool.summary,
    noindex: planned,
  });
}

/** Root defaults: `metadataBase` makes every relative URL above absolute. */
export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE_NAME,
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { title: SITE_NAME },
  // Search results show the favicon: it needs a square icon of at least 48px besides favicon.ico.
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/logo.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};
