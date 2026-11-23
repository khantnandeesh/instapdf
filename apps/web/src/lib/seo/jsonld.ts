/**
 * schema.org structured data (docs/seo/strategy.md, "Structured data").
 *
 * What we emit, and why:
 * - Home: `Organization` + `WebSite` (site name in results).
 * - Tool pages: `WebApplication` (free offer, browser requirements, feature list),
 *   `BreadcrumbList` (breadcrumb trail instead of the raw URL in results), `HowTo` and
 *   `FAQPage` matching the visible how-to and FAQ. Google no longer shows HowTo/FAQ rich
 *   results for most sites, but other engines and AI answer engines read them; they must
 *   mirror visible text exactly.
 * - Never: `AggregateRating` or `Review` without real, on-page reviews from users (that is
 *   a spam-policy violation and risks a manual action).
 */
import type { Tool } from "@/tools/registry";
import type { ToolSeoContent } from "@/tools/seo";
import { toolSeo } from "@/tools/seo";
import { absoluteUrl, SITE_NAME, SITE_ORIGIN } from "./site";

type Thing = Record<string, unknown>;

const ORG_ID = `${SITE_ORIGIN}/#organization`;
const SITE_ID = `${SITE_ORIGIN}/#website`;

export function organizationLd(): Thing {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/logo.png"),
  };
}

export function websiteLd(): Thing {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): Thing {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

export function webApplicationLd(tool: Tool, title: string): Thing {
  const seo = toolSeo[tool.slug];
  return {
    "@type": "WebApplication",
    "@id": `${absoluteUrl(`/${tool.slug}`)}#app`,
    name: title,
    url: absoluteUrl(`/${tool.slug}`),
    description: seo?.description ?? tool.summary,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "PDF tool",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript and a modern browser",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
  };
}

export function howToLd(name: string, content: ToolSeoContent): Thing {
  return {
    "@type": "HowTo",
    name,
    totalTime: "PT1M",
    estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
    step: content.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
  };
}

export function faqLd(content: ToolSeoContent): Thing {
  return {
    "@type": "FAQPage",
    mainEntity: content.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/** One `@graph` document, serialised safely for an inline <script type="application/ld+json">. */
export function jsonLdString(things: Thing[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": things })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
