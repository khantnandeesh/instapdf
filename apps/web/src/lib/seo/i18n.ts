/**
 * Locale scaffolding for hreflang (docs/seo/strategy.md, "Languages").
 *
 * URL scheme, fixed now so it never has to change: English lives at the root (`/merge-pdf`),
 * every other locale under a prefix with a translated slug (`/hi/pdf-jodein` style, decided per
 * locale by the keyword plan). Only English is published today; adding a locale means adding it
 * here with `published: true` once every indexable page has a real translation. Untranslated
 * pages are never listed as alternates (thin or machine-only translations hurt rankings).
 */
export type Locale = {
  /** BCP 47 tag used in `<html lang>` and `hreflang`. */
  code: string;
  /** URL prefix, "" for the default locale. */
  prefix: string;
  published: boolean;
};

export const DEFAULT_LOCALE = "en";

/** Launch order from docs/seo/keyword-plan.md: en first, then hi, es, pt-BR, id, fr, de… */
export const locales: readonly Locale[] = [{ code: "en", prefix: "", published: true }];

export const publishedLocales = () => locales.filter((l) => l.published);

/**
 * Per-page translated paths, by locale code. Pages with no entry exist only in English.
 * Example once Hindi ships: { "/merge-pdf": { hi: "/hi/pdf-jodein" } }.
 */
export const translatedPaths: Record<string, Partial<Record<string, string>>> = {};

/**
 * hreflang map for a page: every published locale that has this page, plus `x-default`
 * (the English page). Always includes the page itself, as Google requires self-reference.
 */
export function languageAlternates(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of publishedLocales()) {
    const p = l.code === DEFAULT_LOCALE ? path : translatedPaths[path]?.[l.code];
    if (p) out[l.code] = p;
  }
  out["x-default"] = path;
  return out;
}
