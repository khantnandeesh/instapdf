/** F2 coming-soon, placeholder and 404 pages and the footer: AC-48 to AC-53. Spec: docs/specs/f2-home.md */
import { expect, test } from "@playwright/test";
import { isDesktop, tools, usableTools } from "./support";

test.beforeEach(async ({}, info) => {
  test.skip(!isDesktop(info.project.name), "server-rendered pages; checked once on desktop");
});

test("AC-48: a planned tool's page is a 200 coming-soon page without a file input", async ({ page }) => {
  const res = await page.goto("/split-pdf"); // F3 AC-77: Merge is usable now
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Split");
  await expect(page.getByTestId("coming-soon").getByRole("heading", { name: "Coming soon" })).toBeVisible();
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await expect(page.locator('main a[href="/#tools"]').first()).toBeVisible();
});

test("AC-48: every planned tool has a coming-soon page", async ({ request }) => {
  for (const t of tools.filter((x) => x.status === "planned")) {
    const res = await request.get(`/${t.slug}`);
    expect(res.status(), t.slug).toBe(200);
    expect(await res.text(), t.slug).toContain("Coming soon");
  }
});

test("AC-49: coming-soon and placeholder pages are noindex; home and usable tools are not", async ({ page }) => {
  const robots = async (path: string) => {
    await page.goto(path);
    return page.locator('meta[name="robots"]').getAttribute("content").catch(() => null);
  };
  for (const path of ["/split-pdf", "/about", "/help", "/privacy", "/terms", "/cookies", "/security"]) expect(await robots(path), path).toMatch(/noindex/);
  for (const path of ["/", "/rotate-pdf", "/merge-pdf"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]'), path).toHaveCount(0);
  }
});

test("AC-49: every planned tool's coming-soon page carries noindex in the server HTML; / and usable tools do not", async ({ request }) => {
  const robotsMeta = (html: string) => html.match(/<meta[^>]*name="robots"[^>]*>/)?.[0] ?? null;
  for (const t of tools.filter((x) => x.status === "planned")) {
    expect(robotsMeta(await (await request.get(`/${t.slug}`)).text()), t.slug).toMatch(/content="[^"]*noindex/);
  }
  for (const path of ["/", ...usableTools.map((t) => `/${t.slug}`)]) {
    expect(robotsMeta(await (await request.get(path)).text()), path).toBeNull();
  }
});

test("AC-50: unknown slugs, near-miss tool slugs and nested paths are all 404 with the catalogue link", async ({ request }) => {
  for (const path of ["/no-such-tool", "/rotate-pdf-pages", "/merge-pdf/extra", "/rotate-pdf/x", "/%E6%97%A5%E6%9C%AC", "/tools"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    const html = await res.text();
    expect(html, path).toContain('href="/#tools"');
    expect(html, path).toContain("InstaPDF home");
  }
});

test("AC-50: an unknown path is a 404 with header, footer, a message and a catalogue link", async ({ page }) => {
  const res = await page.goto("/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.locator("header").first()).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  await expect(page.locator('main a[href="/#tools"]')).toBeVisible();
});

test("AC-51: the coming-soon page lists the tools available now", async ({ page }) => {
  await page.goto("/split-pdf");
  const now = page.getByTestId("available-now");
  for (const t of usableTools) await expect(now.locator(`a[href="/${t.slug}"]`)).toBeVisible();
});

test("AC-52: every page has the footer links and the current year; each link returns 200", async ({ page, request }) => {
  const year = String(new Date().getFullYear());
  for (const path of ["/", "/rotate-pdf", "/merge-pdf", "/privacy", "/does-not-exist"]) {
    await page.goto(path);
    const footer = page.locator("footer");
    await expect(footer.locator('a[href="/#tools"]'), path).toHaveCount(1);
    for (const name of ["About", "Help", "Privacy", "Terms", "Cookies", "Security"]) {
      const link = footer.getByRole("link", { name, exact: true });
      await expect(link, `${path} ${name}`).toBeVisible();
      if (path === "/") expect((await request.get((await link.getAttribute("href"))!)).status(), name).toBe(200);
    }
    await expect(footer, path).toContainText(`© ${year} InstaPDF`);
  }
});

test("AC-53: the footer has an A–Z list with every tool", async ({ page }) => {
  await page.goto("/");
  const az = page.getByTestId("footer-az").locator("a[href]");
  await expect(az).toHaveCount(tools.length);
  const hrefs = await az.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(new Set(hrefs)).toEqual(new Set(tools.map((t) => `/${t.slug}`)));
  const names = await az.evaluateAll((as) => as.map((a) => a.firstElementChild?.firstChild?.textContent ?? ""));
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
});
