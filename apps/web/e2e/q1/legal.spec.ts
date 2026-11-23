/** Q1: legal pages and third-party notices (docs/process/backlog.md Q1). */
import { expect, test } from "@playwright/test";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { isDesktop, openHydrated } from "../f2/support";

const LEGAL = [
  { path: "/privacy", h1: "Privacy" },
  { path: "/terms", h1: "Terms of use" },
  { path: "/cookies", h1: "Cookies and browser storage" },
  { path: "/licenses", h1: "Open-source licenses" },
];

test.describe("server HTML", () => {
  test.beforeEach(({}, info) => test.skip(!isDesktop(info.project.name), "server-rendered content; once on desktop"));

  test("legal pages are real, indexable, static pages with the owner's placeholders visible", async ({ request }) => {
    for (const { path, h1 } of LEGAL) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      const html = await res.text();
      expect(html, path).toContain(`<h1`);
      expect(html, path).toContain(h1);
      expect(html, path).not.toMatch(/<meta[^>]*name="robots"[^>]*noindex/);
      expect(html, path).not.toContain("We're writing this page");
      expect(res.headers()["x-nextjs-prerender"] ?? res.headers()["x-nextjs-cache"], `${path} is prerendered`).toBeTruthy();
    }
  });

  test("privacy explains how to verify that files stay on the device", async ({ request }) => {
    const html = await (await request.get("/privacy")).text();
    expect(html).toContain("Your files stay on your device");
    expect(html).toContain("connect-src &#x27;self&#x27;");
    expect(html).toContain("Network");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("berrypdf:recent-tools");
    expect(html).toContain("us-central1");
    expect(html).toMatch(/coming later/i);
  });

  test("owner placeholders are bracketed and marked", async ({ request }) => {
    const privacy = await (await request.get("/privacy")).text();
    for (const p of ["[Company name]", "[contact email]", "[effective date]", "[registered address]"]) expect(privacy).toContain(p);
    const terms = await (await request.get("/terms")).text();
    for (const p of ["[governing law]", "[jurisdiction / courts]"]) expect(terms).toContain(p);
    expect(terms).toContain("data-placeholder");
  });

  test("/licenses lists the real dependency tree, fonts and icons; full texts are served", async ({ request }) => {
    const html = await (await request.get("/licenses")).text();
    for (const name of ["pdfjs-dist", "@cantoo/pdf-lib", "pdf-lib", "react", "next", "fflate", "@fontsource/atkinson-hyperlegible", "Lucide icons"]) expect(html, name).toContain(name);
    expect(html).toContain("OFL-1.1");
    expect(html).toContain("Cole Bemis"); // Feather (MIT) copyright, carried with the Lucide icons
    expect(html).not.toMatch(/data-license="[^"]*GPL/);

    const txt = await request.get("/third-party-notices.txt");
    expect(txt.status()).toBe(200);
    expect(txt.headers()["content-type"]).toContain("text/plain");
    const body = await txt.text();
    expect(body).toContain("SIL OPEN FONT LICENSE");
    expect(body).toContain("Apache License");
    expect(body).toContain("* pdfjs-dist");
  });
});

test("footer links to every legal page", async ({ page }) => {
  await openHydrated(page, "/");
  const legal = page.locator("footer nav[aria-labelledby=footer-legal]");
  for (const name of ["Privacy", "Terms", "Cookies", "Licenses"]) {
    await expect(legal.getByRole("link", { name, exact: true })).toBeVisible();
  }
});

test("axe: legal pages have no serious or critical violations", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "content pages; once on desktop (layout is covered by the no-scroll check)");
  for (const { path } of LEGAL) {
    await openHydrated(page, path);
    await expectNoSeriousAxeViolations(page, path);
  }
});

test("legal pages fit a 375 px screen without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const { path } of LEGAL) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
});
