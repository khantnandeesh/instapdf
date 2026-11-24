# SEO strategy

Goal: when anyone searches for a PDF task, in any language, BerryPDF is the first result they trust. We build the foundations into every tool as it ships (not at the end), then add languages, comparison pages and content at launch. The plan for keywords and content is in [keyword-plan.md](keyword-plan.md).

## 1. Competitor teardown (measured 2026-11-23)

Method: fetched the home page and five tool pages (merge, compress, PDF to Word, JPG to PDF, editor) of each site plus their robots.txt and sitemap, parsed the HTML, and loaded each merge page in headless Chromium as a Pixel 7 (lab numbers, one run, US cloud region). Adobe answers bots with 403, so it is not measured. Raw data: `docs/seo/teardown-2026-11-23.json`.

| | Sejda | iLovePDF | Smallpdf | PDF24 | BerryPDF (staging) |
|---|---|---|---|---|---|
| Tool URL | `/merge-pdf` | `/merge_pdf` (underscores) | `/merge-pdf` | `/en/merge-pdf` | `/merge-pdf` |
| Languages in sitemap | 29 | locales exist, **no hreflang anywhere** | 25 | 44 | en (scaffold ready) |
| Translated slugs | no (`/de/merge-pdf`) | no | **yes** (`/es/unir-pdf`, `/de/pdfs-zusammenfuegen`) | no | planned (yes) |
| hreflang | in HTML + sitemap | none | sitemap only | sitemap only | HTML + sitemap |
| Sitemap URLs | 1,396 | 1,415 | 5,248 | 5,633 | indexable pages only |
| Title (merge) | "Merge PDF Files Online" (22) | "Merge PDF files online. Free service to merge PDF" (49) | "Merge PDF: Combine PDF Files with Free PDF Combiner" (51) | "Merge PDF - 100% free & online - PDF24" (38) | "Merge PDF: Combine PDF Files Free \| BerryPDF" (44) |
| Descriptions | 39–183 chars, one is 39 | 103–168 | 114–144 | 116–158, "✓" lists | 110–160, tested |
| Structured data | **none** | **none** | WebApplication, SoftwareApplication, HowTo, FAQPage, BreadcrumbList, AggregateRating, Organization | WebApplication, AggregateRating, Organization | WebApplication, BreadcrumbList, HowTo, FAQPage, Organization, WebSite |
| h1 per tool page | 2–6 | 1 | 1 | 1 | 1 (tested) |
| h2 quality | limit/error messages render as h2s | 1 tagline | how-to, FAQ, features, blog | how-to, FAQ, reviews, related | how-to, FAQ, related |
| Words on tool page | 2,000–3,900 | 340–440 | 940–1,360 | 840–1,260 | ~350 below the fold |
| FAQ in `<details>` | no | no | yes (6–10) | no | yes |
| Third-party hosts | 0 | 16 | 11 | 9 | 0 |
| Mobile lab: TTFB / LCP | 763 / 1,496 ms | 240 / 664 ms | 192 / 384 ms | 186 / 508 ms | **159 / 440 ms warm, 3,493 ms TTFB cold** |
| Page weight / JS | 348 KB / 2 KB | 979 / 573 KB | 1,150 KB | 674 / 352 KB | 212 / 139 KB |
| robots.txt | `Crawl-delay: 10`, blog sitemap | `Disallow: /upload/` | sitemap | sitemap | sitemap, staging blocked |

What each does well, and the gap we take:

- **Sejda** wins on long, real how-to guides and 29 languages. Gaps: zero structured data, very short titles that skip "free" and "online", several `h1`s per page, and its free-tier limit messages sit in the HTML as `h2` headings on every tool page. Its free tier is capped (3 tasks an hour, 50 pages, 50 MB), which our "no limits on browser tools" answers directly.
- **iLovePDF** wins on brand and speed of the first paint. Gaps: no hreflang at all, so Google has to guess which language page to show; thin tool pages (one `h2`, ~350 words); underscore URLs; heavy third-party script.
- **Smallpdf** is the SEO benchmark: translated slugs, the full schema set, FAQ in `<details>`, blog posts linked from tools, and **format long-tail pages** (`heic-to-pdf`, `webp-to-pdf`, `tiff-to-pdf`, `pdf-annotator`, `pdf-form-filler`) that each target their own query with the same engine. Gaps: 1.1 MB pages with 40 scripts, ratings markup, hreflang only in the sitemap.
- **PDF24** has the most languages (44, including Bengali and Hindi) and the most URLs. Gaps: one template title for every tool ("- 100% free & online - PDF24"), reviews widget and desktop-app upsell as `h2`s, and no HowTo/FAQ markup.
- **Nobody can prove privacy.** All four upload files. Our tools run in the browser and the CSP blocks uploads, so "nothing is uploaded" is a claim only we can make, in titles, descriptions, FAQ and comparison pages.

## 2. What we build (and where it lives)

| Area | Rule | Code |
|---|---|---|
| URLs | One page per task, keyword-first slug with hyphens (`/jpg-to-pdf`, `/delete-pdf-pages`, `/sign-pdf`), English at the root, other languages under `/<locale>/<translated-slug>`. Slugs never change after launch; if they must, 308 redirect. | `src/tools/registry.ts` |
| Titles and descriptions | Primary keyword first, ≤ 60 characters with " \| BerryPDF", descriptions 110–160 with the keyword in the first sentence; unique; no competitor names; "nothing is uploaded" only on browser tools. | `src/tools/seo.ts`, tested in `seo.test.ts` |
| Metadata | Everything goes through `pageMetadata` / `toolMetadata`: canonical, hreflang, Open Graph, X card, robots. | `src/lib/seo/metadata.ts` |
| Indexing | Only the canonical host is indexable. Staging and raw Cloud Run URLs get `X-Robots-Tag: noindex` and a disallow-all robots.txt. Coming-soon tools and placeholders are `noindex` and stay out of the sitemap until they work. | `src/lib/seo/site.ts`, `src/middleware.ts`, `src/app/robots.ts` |
| Sitemap | Exactly the indexable pages, with hreflang alternates. No fake `lastmod`. | `src/app/sitemap.ts`, `src/lib/seo/routes.ts` |
| Structured data | Home: Organization + WebSite. Tools: WebApplication (free offer), BreadcrumbList, HowTo, FAQPage, all matching visible text. **Never** AggregateRating or Review without real on-page user reviews: that breaks Google's spam policies. | `src/lib/seo/jsonld.ts`, `src/components/seo/ToolSeo.tsx` |
| Social cards | 1200×630 PNG per tool, built once at build time, in BerryPDF style. | `src/lib/seo/og.tsx`, `src/app/**/opengraph-image.tsx` |
| Tool-page content | Below the tool only: breadcrumb, 3–5 how-to steps, 4–8 FAQ answers folded in `<details>`, related tools. The tool fills the first screen (`.mp-toolstage`), so nothing is added above the fold. | `src/tools/seo.ts` (`seoContent`) |
| Languages | Scaffold now (English only, self-referencing hreflang + x-default). A locale ships only with human-reviewed translations of every indexable page; partially translated locales are not listed. | `src/lib/seo/i18n.ts` |
| Performance budgets | Per indexable page on a phone: ≤ 170 KB JS transferred, LCP ≤ 2.5 s, CLS ≤ 0.1 (lab, enforced in e2e); Lighthouse performance ≥ 90 mobile (evaluator). Zero third-party scripts. | `e2e/seo/seo.spec.ts` |
| Favicon and app | `logo.png` 512 px, `apple-touch-icon.png`, `manifest.webmanifest`. | `public/`, `src/app/manifest.ts` |

## 3. The minimal-text rule and SEO

The owner's rule is "only the text a task needs" on tool screens. Search engines rank pages that answer the query, which needs some text. We resolve it this way:

1. Nothing new above the fold or inside the tool flow. The `h1` stays the tool name, which is also the primary keyword.
2. The guide sits below the tool, starts after the first screen on every device (tested), and keeps FAQ answers folded. Google indexes content in `<details>` normally.
3. Metadata and structured data carry the rest; they are invisible on the page.

**Tension to flag:** our guide is ~350 words against Sejda's 2,000+ and Smallpdf's ~1,200. For head terms like "merge pdf" we may need more depth (a short comparison table, tips). We will measure in Search Console after launch and add depth only where a page stalls on page 2, always below the fold.

## 4. Risks and owner decisions

- **Domain (owner):** canonical URLs use `https://www.berrypdf.com` as a placeholder (`SITE_ORIGIN` in `src/lib/seo/site.ts`, or the `NEXT_PUBLIC_SITE_ORIGIN` build variable). Nothing is indexable until the real domain is set and live. Every week without it delays ranking.
- **Cold starts:** scale-to-zero gives a 3.5 s first byte after idle. Googlebot sees that as a slow site. Fix in Q3: serve the static pages from Cloud CDN / a cached load balancer (pages are all prerendered), not min-instances (budget rule).
- **Coming-soon pages are `noindex`.** They can't rank until the tool works. That is deliberate: 44 thin pages would drag the whole site down.
- **No fake ratings.** Competitors show stars from their own widgets. We can add a real "Was this helpful?" rating later and mark it up only once it is real.
- **Search Console and Bing Webmaster Tools** need the domain verified (DNS TXT record). Once the domain exists, devops verifies both and submits the sitemap.
