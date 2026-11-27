/**
 * SEO checklist, automated (docs/process/workflow.md "SEO checklist", docs/seo/strategy.md).
 * Runs against the production server (`pnpm build && SITE_INDEXABLE=1 pnpm start`, which the
 * Playwright config does): metadata, robots and the sitemap are only final in a production build. Every indexable page is checked, so a new tool
 * page is covered as soon as it is usable.
 */
import { expect, test, type Page } from "@playwright/test";
import { indexableRoutes } from "../../src/lib/seo/routes";
import { absoluteUrl, SITE_ORIGIN } from "../../src/lib/seo/site";
import { tools } from "../../src/tools/registry";
import { seoContent } from "../../src/tools/seo";

const ROUTES = indexableRoutes().map((r) => r.path);
// Usable tool pages, not counting noindex previews (Edit PDF beta), which are listed but not indexed.
const TOOL_ROUTES = tools.filter((t) => t.status !== "planned" && !t.preview).map((t) => `/${t.slug}`);
const PLANNED = tools.filter((t) => t.status === "planned").map((t) => `/${t.slug}`);
const STAGING_HOST = "web-staging-qzq5fa2g7q-uc.a.run.app";

/** Performance budgets (docs/seo/strategy.md, "Performance budgets"), checked on the mobile project. */
// Phone JS, KiB, counting link-preloaded scripts: 170 with and without cloud sources (#32 had raised it
// to 172 / 174 for F23). Merge measured 158.7 (off) and 160.7 (on) once the header logo stopped
// prefetching the home page and the flow's post-pick parts waited for intent (tool-flow/intent.ts).
const BUDGET = { jsKB: 170, lcpMs: 2500, cls: 0.1 };

type Ld = { "@graph": { "@type": string; [k: string]: unknown }[] };

async function head(page: Page) {
  return page.evaluate(() => {
    const meta = (sel: string) => document.querySelector<HTMLMetaElement>(sel)?.content ?? null;
    return {
      title: document.title,
      description: meta('meta[name="description"]'),
      robots: meta('meta[name="robots"]'),
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
      hreflang: Object.fromEntries([...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')].map((l) => [l.hreflang, l.href])),
      ogTitle: meta('meta[property="og:title"]'),
      ogImage: meta('meta[property="og:image"]'),
      ogUrl: meta('meta[property="og:url"]'),
      twitterCard: meta('meta[name="twitter:card"]'),
      h1: [...document.querySelectorAll("h1")].map((h) => h.textContent?.trim() ?? ""),
      lang: document.documentElement.lang,
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ""),
    };
  });
}

test.describe("indexable pages", () => {
  for (const path of ROUTES) {
    test(`${path} meets the SEO checklist`, async ({ page, request }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      expect(res?.headers()["x-robots-tag"]).toBeUndefined();
      const h = await head(page);

      expect(h.title).toContain("BerryPDF");
      expect(h.title.length).toBeLessThanOrEqual(60);
      expect(h.description?.length ?? 0).toBeGreaterThanOrEqual(50);
      expect(h.description?.length ?? 0).toBeLessThanOrEqual(160);
      expect(h.robots).toContain("index");
      expect(h.robots).not.toContain("noindex");
      expect(h.canonical).toBe(absoluteUrl(path));
      expect(h.hreflang["x-default"]).toBe(absoluteUrl(path));
      expect(h.hreflang.en).toBe(absoluteUrl(path));
      expect(h.lang).toBe("en");
      expect(h.h1).toHaveLength(1);
      expect(h.ogTitle).toBeTruthy();
      expect(new URL(h.ogUrl!).href).toBe(new URL(absoluteUrl(path)).href);
      expect(h.twitterCard).toBe("summary_large_image");

      // The social image exists, is a PNG, and is served by us.
      expect(h.ogImage).toMatch(new RegExp(`^${SITE_ORIGIN.replace(/[.]/g, "\\.")}/`));
      const img = await request.get(h.ogImage!.replace(SITE_ORIGIN, ""));
      expect(img.status()).toBe(200);
      expect(img.headers()["content-type"]).toBe("image/png");

      for (const raw of h.ld) expect(() => JSON.parse(raw)).not.toThrow();
    });
  }

  for (const path of TOOL_ROUTES) {
    test(`${path} has structured data that matches its visible guide`, async ({ page }) => {
      await page.goto(path);
      const ld = (await head(page)).ld.map((raw) => JSON.parse(raw) as Ld).flatMap((d) => d["@graph"]);
      const types = ld.map((t) => t["@type"]);
      expect(types).toEqual(expect.arrayContaining(["WebApplication", "BreadcrumbList", "HowTo", "FAQPage"]));
      expect(types).not.toContain("AggregateRating");
      expect(JSON.stringify(ld)).not.toContain("aggregateRating");

      const content = seoContent[path.slice(1)];
      const faq = ld.find((t) => t["@type"] === "FAQPage") as unknown as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
      const guide = page.getByTestId("tool-guide");
      await expect(guide.locator("summary")).toHaveText(faq.mainEntity.map((q) => q.name));
      expect(faq.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(content.faq.map((f) => f.a));
      await expect(guide.locator("ol > li strong")).toHaveText(content.steps.map((s) => s.name));
    });

    test(`${path} keeps its guide below the tool (minimal text above the fold)`, async ({ page }) => {
      await page.goto(path);
      const box = await page.getByTestId("tool-guide").boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.y).toBeGreaterThanOrEqual(viewport.height * 0.9);
    });
  }

  test("pages stay within the performance budgets on a phone", { tag: "@serial" }, async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "budgets are measured on the mobile project");
    for (const path of ROUTES) {
      await page.addInitScript(() => {
        const w = window as Window & { __lcp?: number; __cls?: number };
        w.__lcp = 0;
        w.__cls = 0;
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) =>
          l.getEntries().forEach((e) => {
            const s = e as PerformanceEntry & { hadRecentInput: boolean; value: number };
            if (!s.hadRecentInput) w.__cls! += s.value;
          }),
        ).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(path, { waitUntil: "load" });
      await page.waitForTimeout(1000);
      const m = await page.evaluate(() => {
        const w = window as Window & { __lcp?: number; __cls?: number };
        // Scripts, and scripts fetched by a <link rel="preload"> (a server-rendered lazy part), which run all the same.
        const js = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
          .filter((r) => r.initiatorType === "script" || (r.initiatorType === "link" && new URL(r.name).pathname.endsWith(".js")))
          .reduce((a, r) => a + r.encodedBodySize, 0);
        return { jsKB: js / 1024, lcp: w.__lcp ?? 0, cls: w.__cls ?? 0 };
      });
      expect(m.jsKB, `${path} JS`).toBeLessThanOrEqual(BUDGET.jsKB);
      expect(m.lcp, `${path} LCP`).toBeLessThanOrEqual(BUDGET.lcpMs);
      expect(m.cls, `${path} CLS`).toBeLessThanOrEqual(BUDGET.cls);
    }
  });
});

test.describe("crawl controls", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "HTTP-level checks; once on desktop"));

  test("the sitemap lists exactly the indexable pages, with hreflang", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.sort()).toEqual(ROUTES.map(absoluteUrl).sort());
    for (const p of PLANNED) expect(xml).not.toContain(`${absoluteUrl(p)}<`);
    expect(xml).toContain('hreflang="x-default"');
  });

  test("robots.txt allows the canonical host and points at the sitemap", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    expect(txt).toMatch(/Allow: \//);
    expect(txt).toContain(`Sitemap: ${absoluteUrl("/sitemap.xml")}`);
  });

  test("staging and other hosts are never indexed", async ({ request }) => {
    const headers = { host: STAGING_HOST };
    const txt = await (await request.get("/robots.txt", { headers })).text();
    expect(txt).toMatch(/Disallow: \/\s*$/m);
    expect(txt).not.toContain("Sitemap:");
    for (const path of ["/", "/rotate-pdf"]) {
      const res = await request.get(path, { headers });
      expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    }
  });

  test("a client-set X-Forwarded-Host cannot change indexing", async ({ request }) => {
    const res = await request.get("/rotate-pdf", { headers: { "x-forwarded-host": STAGING_HOST } });
    expect(res.headers()["x-robots-tag"]).toBeUndefined();
  });

  test("the Organization logo in structured data exists", async ({ page, request }) => {
    await page.goto("/");
    const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
    const org = (JSON.parse(raw!)["@graph"] as { "@type": string; logo?: string }[]).find((t) => t["@type"] === "Organization");
    const res = await request.get(org!.logo!.replace(SITE_ORIGIN, ""));
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  });

  test("coming-soon tools are noindex and stay out of the sitemap", async ({ page }) => {
    await page.goto(PLANNED[0]);
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  });
});
