import type { MetadataRoute } from "next";
import { languageAlternates } from "@/lib/seo/i18n";
import { indexableRoutes } from "@/lib/seo/routes";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * /sitemap.xml: every indexable page with its hreflang alternates (docs/seo/strategy.md).
 * No lastmod: a build date on every URL is not a real change date, and Google ignores lastmod
 * from sites where it is unreliable. Google ignores changefreq and priority; Bing reads them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return indexableRoutes().map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    changeFrequency,
    priority,
    alternates: {
      languages: Object.fromEntries(Object.entries(languageAlternates(path)).map(([lang, p]) => [lang, absoluteUrl(p)])),
    },
  }));
}
