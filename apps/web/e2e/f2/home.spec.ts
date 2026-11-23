/** F2 home page and catalogue: AC-1 to AC-22, AC-54 to AC-63. Spec: docs/specs/f2-home.md */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  catalogueSearch,
  categories,
  categoryLinks,
  isDesktop,
  menuButton,
  menuLinks,
  noHorizontalScroll,
  openHydrated,
  openMenu,
  plannedTools,
  tools,
  usableTools,
} from "./support";

test.describe("hero and page basics", () => {
  test("AC-1: / returns 200 with one h1, a title with InstaPDF and a meta description", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page).toHaveTitle(/InstaPDF/);
    expect((await page.locator('meta[name="description"]').getAttribute("content"))?.trim()).toBeTruthy();
  });

  for (const vp of [
    { width: 1366, height: 900 },
    { width: 375, height: 812 },
  ]) {
    test(`AC-2: the primary call to action is visible without scrolling at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/");
      await expect(page.getByTestId("hero-cta")).toBeInViewport({ ratio: 1 });
    });
  }

  test("AC-3: with the featured tool planned, the CTA scrolls to the catalogue, sets #tools and focuses search", async ({ page }) => {
    await openHydrated(page);
    await page.getByTestId("hero-cta").click();
    await expect(page.getByRole("heading", { level: 2, name: "All tools" })).toBeInViewport();
    await expect(page).toHaveURL(/#tools$/);
    await expect(catalogueSearch(page)).toBeFocused();
  });

  test("AC-4: the see-all link shows the registry count and scrolls to the catalogue", async ({ page }) => {
    await page.goto("/");
    const link = page.getByTestId("hero-see-all");
    await expect(link).toHaveText(new RegExp(`See all ${tools.length} tools`));
    await link.click();
    await expect(page.getByRole("heading", { level: 2, name: "All tools" })).toBeInViewport();
  });
});

test.describe("catalogue", () => {
  test("AC-5 / AC-6: one link per registry tool under its category, categories in order", async ({ page }) => {
    await page.goto("/");
    const hrefs = await categoryLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toHaveLength(tools.length);
    expect(new Set(hrefs)).toEqual(new Set(tools.map((t) => `/${t.slug}`)));
    // Category headings are h3 under the "All tools" h2 (design H-7); query by section.
    const headings = await page.locator("[data-testid=category] h3").allInnerTexts();
    expect(headings).toEqual(categories.map((c) => c.label));
    for (const c of categories) {
      const section = page.locator(`#cat-${c.id}`);
      const inSection = await section.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      expect(inSection, c.id).toEqual(tools.filter((t) => t.category === c.id).map((t) => `/${t.slug}`));
    }
  });

  test("AC-7: each card shows name and summary and is a single link", async ({ page }) => {
    await page.goto("/");
    for (const t of tools) {
      const card = page.locator(`[data-testid=category] a[href="/${t.slug}"]`);
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(t.name);
      await expect(card).toContainText(t.summary);
      expect(await card.locator("a").count()).toBe(0);
    }
  });

  test("AC-8 / AC-13: Rotate links to /rotate-pdf with a Beta badge, no coming-soon, and opens the tool", async ({ page }) => {
    await page.goto("/");
    const card = page.locator('[data-testid=category] a[href="/rotate-pdf"]');
    await expect(card).not.toContainText("Coming soon");
    await expect(card).toContainText("Beta");
    await expect(card).toHaveAccessibleName(/Beta/);
    await card.click();
    await expect(page).toHaveURL(/\/rotate-pdf$/);
    await expect(page.locator('input[type=file][accept*=".pdf"]')).toBeAttached();
  });

  test("AC-9: every planned card shows Coming soon in its visible text and accessible name; usable ones do not", async ({ page }) => {
    await page.goto("/");
    for (const t of plannedTools) {
      const card = page.locator(`[data-testid=category] a[href="/${t.slug}"]`);
      await expect(card.getByText("Coming soon")).toBeVisible();
      await expect(card).toHaveAccessibleName(/Coming soon/);
    }
    for (const t of usableTools) await expect(page.locator(`[data-testid=category] a[href="/${t.slug}"]`)).not.toContainText("Coming soon");
  });

  test("AC-10: no internal link on / (header, menu, catalogue, footer) returns >= 400", async ({ page, request }, info) => {
    test.skip(!isDesktop(info.project.name), "one crawl is enough");
    await openHydrated(page);
    await openMenu(page);
    const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    const internal = [...new Set(hrefs.filter((h) => new URL(h).origin === new URL(page.url()).origin).map((h) => h.split("#")[0]))];
    expect(internal.length).toBeGreaterThan(tools.length);
    for (const url of internal) expect((await request.get(url)).status(), url).toBeLessThan(400);
  });

  test("AC-11: the Popular row is above the categories, usable first, then planned in the fixed order", async ({ page }) => {
    await page.goto("/");
    const popular = page.getByTestId("popular");
    const order = await popular.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    const ranked = tools.filter((t) => t.popularRank).sort((a, b) => a.popularRank! - b.popularRank!);
    const expected = [...ranked.filter((t) => t.status !== "planned"), ...ranked.filter((t) => t.status === "planned")].map((t) => `/${t.slug}`);
    expect(order).toEqual(expected);
    expect(order).toEqual([
      "/rotate-pdf",
      "/pdf-editor",
      "/compress-pdf",
      "/delete-pages",
      "/merge-pdf",
      "/split-pdf",
      "/crop-pdf",
      "/fill-sign",
      "/pdf-to-word",
      "/extract-pages",
    ]);
    const popY = (await popular.boundingBox())!.y;
    const firstCat = (await page.locator("[data-testid=category]").first().boundingBox())!.y;
    expect(popY).toBeLessThan(firstCat);
    await expect(popular.locator('a[href="/merge-pdf"]')).toContainText("Coming soon");
    await expect(popular.locator('a[href="/rotate-pdf"]')).toContainText("Beta");
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });
    test("AC-12: / still has every catalogue link, and All tools falls back to a link", async ({ page }) => {
      await page.goto("/");
      await expect(categoryLinks(page)).toHaveCount(tools.length);
      await expect(page.locator('header a[href="/#tools"]')).toBeVisible();
    });
  });

  test("AC-14: category jump links scroll to the section and set the hash", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Jump to a category" }).getByRole("link", { name: /Security/ }).click();
    await expect(page).toHaveURL(/#cat-security$/);
    await expect(page.locator("#cat-security h3")).toBeInViewport();
  });
});

test.describe("search", () => {
  test.beforeEach(async ({ page }) => {
    await openHydrated(page);
  });

  const visibleNames = (page: import("@playwright/test").Page) =>
    page.locator("[data-testid=category] a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));

  test("AC-15: typing split shows the split tools and hides Merge, Rotate and Compress, live", async ({ page }) => {
    await expect(catalogueSearch(page)).toHaveAttribute("type", "search");
    await expect(page.getByLabel("Search tools", { exact: true }).first()).toBeAttached();
    await catalogueSearch(page).pressSequentially("split");
    const hrefs = await visibleNames(page);
    for (const s of ["split-pdf", "split-by-bookmarks", "split-by-size", "split-by-text", "split-in-half"]) expect(hrefs).toContain(`/${s}`);
    for (const s of ["merge-pdf", "rotate-pdf", "compress-pdf"]) expect(hrefs).not.toContain(`/${s}`);
  });

  test("AC-16: case and surrounding spaces are ignored", async ({ page }) => {
    await catalogueSearch(page).fill("  ROTATE ");
    expect(await visibleNames(page)).toContain("/rotate-pdf");
  });

  test("AC-17: keywords match", async ({ page }) => {
    const cases: [string, string[]][] = [
      ["encrypt", ["/protect-pdf"]],
      ["jpg", ["/image-to-pdf", "/pdf-to-image"]],
      ["combine", ["/merge-pdf", "/combine-reorder"]],
      ["ppt", ["/pdf-to-ppt"]],
    ];
    for (const [q, expected] of cases) {
      await catalogueSearch(page).fill(q);
      const hrefs = await visibleNames(page);
      for (const e of expected) expect(hrefs, q).toContain(e);
    }
  });

  test("AC-18: while searching, Popular, Recent and empty categories are hidden", async ({ page }) => {
    await catalogueSearch(page).fill("split");
    await expect(page.getByTestId("popular")).toHaveCount(0);
    await expect(page.getByTestId("home-recent")).toHaveCount(0);
    await expect(page.locator("[data-testid=category] h3")).toHaveText(["Organize pages"]);
  });

  test("AC-19: no results shows Clear search, which restores everything and focuses the field", async ({ page }) => {
    await catalogueSearch(page).fill("zzqx");
    const none = page.getByTestId("no-results");
    await expect(none).toContainText("No tools match");
    await none.getByRole("button", { name: "Clear search" }).click();
    await expect(catalogueSearch(page)).toHaveValue("");
    await expect(categoryLinks(page)).toHaveCount(tools.length);
    await expect(catalogueSearch(page)).toBeFocused();
  });

  test("AC-20: Escape clears a non-empty search", async ({ page }) => {
    await catalogueSearch(page).fill("split");
    await catalogueSearch(page).press("Escape");
    await expect(catalogueSearch(page)).toHaveValue("");
    await expect(categoryLinks(page)).toHaveCount(tools.length);
  });

  test("AC-21: a polite live region announces the count", async ({ page }) => {
    await catalogueSearch(page).pressSequentially("split");
    const region = page.locator('[data-testid=catalogue] [aria-live="polite"]');
    await expect(region).toHaveText("5 tools");
    await catalogueSearch(page).fill("zzqx");
    await expect(region).toHaveText("No tools found");
  });

  test("AC-22: the ready-only toggle hides every planned card", async ({ page }) => {
    await page.getByRole("switch", { name: "Only ready tools" }).check();
    await expect(categoryLinks(page)).toHaveCount(usableTools.length);
    expect(await visibleNames(page)).toEqual(usableTools.map((t) => `/${t.slug}`));
  });

  test("AC-62: the query is kept in ?q with replaceState, and /?q=split loads filtered", async ({ page }) => {
    const before = await page.evaluate(() => history.length);
    await catalogueSearch(page).pressSequentially("split");
    await expect(page).toHaveURL(/\?q=split$/);
    expect(await page.evaluate(() => history.length)).toBe(before);
    await catalogueSearch(page).fill("");
    await expect(page).not.toHaveURL(/\?q=/);

    await openHydrated(page, "/?q=split");
    await expect(catalogueSearch(page)).toHaveValue("split");
    await expect(page.locator('[data-testid=category] a[href="/merge-pdf"]')).toHaveCount(0);
    await expect(page.locator('[data-testid=category] a[href="/split-in-half"]')).toBeVisible();
  });

  test("AC-62: the server HTML for /?q=split still holds every catalogue link", async ({ request }) => {
    const html = await (await request.get("/?q=split")).text();
    for (const t of tools) expect(html, t.slug).toContain(`href="/${t.slug}"`);
  });

  test("AC-63: matches are wrapped in <mark>; keyword-only hits are not; clearing removes them", async ({ page }) => {
    await catalogueSearch(page).fill("rot");
    const rotate = page.locator('[data-testid=category] a[href="/rotate-pdf"]');
    await expect(rotate.locator("mark").first()).toHaveText("Rot");
    await catalogueSearch(page).fill("encrypt");
    const protect = page.locator('[data-testid=category] a[href="/protect-pdf"]');
    await expect(protect).toBeVisible();
    await expect(protect.locator("mark")).toHaveCount(0);
    await catalogueSearch(page).fill("");
    await expect(page.locator("[data-testid=catalogue] mark")).toHaveCount(0);
  });
});

test.describe("improvements", () => {
  test("AC-59: client tools carry 'Runs in your browser' in the card and menu entry name; server tools do not", async ({ page }) => {
    await openHydrated(page);
    for (const t of tools) {
      const card = page.locator(`[data-testid=category] a[href="/${t.slug}"]`);
      if (t.runtime === "client") await expect(card, t.slug).toHaveAccessibleName(/Runs in your browser/);
      else await expect(card, t.slug).not.toHaveAccessibleName(/Runs in your browser/);
    }
    await openMenu(page);
    for (const t of tools) {
      const entry = menuLinks(page).and(page.locator(`[href="/${t.slug}"]`));
      if (t.runtime === "client") await expect(entry, t.slug).toHaveAccessibleName(/Runs in your browser/);
      else await expect(entry, t.slug).not.toHaveAccessibleName(/Runs in your browser/);
    }
  });

  test("AC-60: every card and menu entry has an aria-hidden inline SVG icon", async ({ page }) => {
    await openHydrated(page);
    const cards = categoryLinks(page);
    expect(await cards.evaluateAll((as) => as.every((a) => a.querySelector('svg[aria-hidden="true"]')))).toBe(true);
    await openMenu(page);
    expect(await menuLinks(page).evaluateAll((as) => as.length > 0 && as.every((a) => a.querySelector('svg[aria-hidden="true"]')))).toBe(true);
  });

  test("AC-61: / focuses the home search without typing it; inside a field it types normally", async ({ page }) => {
    await openHydrated(page);
    await page.locator("h1").click();
    await page.keyboard.press("/");
    await expect(catalogueSearch(page)).toBeFocused();
    await expect(catalogueSearch(page)).toHaveValue("");
    await page.keyboard.type("a/b");
    await expect(catalogueSearch(page)).toHaveValue("a/b");
  });

  test("AC-61: / on another page opens the menu with its search focused", async ({ page }) => {
    await openHydrated(page, "/merge-pdf");
    await page.locator("h1").click();
    await page.keyboard.press("/");
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#tool-menu-search")).toBeFocused();
    await expect(page.locator("#tool-menu-search")).toHaveValue("");
  });
});

test.describe("privacy, accessibility, layout", () => {
  test("AC-54: loading / and opening the menu stays on our origin and sets no cookies", async ({ page, context }) => {
    const origins = new Set<string>();
    page.on("request", (r) => origins.add(new URL(r.url()).origin));
    await openHydrated(page);
    await openMenu(page);
    await page.waitForLoadState("networkidle");
    expect([...origins].filter((o) => o !== new URL(page.url()).origin && !o.startsWith("data:"))).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  });

  test("AC-56: axe finds no critical or serious violations (closed, menu open, no results)", async ({ page }) => {
    const check = async (label: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      const bad = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`), label).toEqual([]);
    };
    await openHydrated(page);
    await check("menu closed");
    await openMenu(page);
    await page.waitForTimeout(300); // let the entry animation finish
    await check("menu open");
    await page.keyboard.press("Escape");
    await catalogueSearch(page).fill("zzqx");
    await check("no results");
  });

  test("AC-57: no horizontal scroll at 320, 375, 768, 1024 and 1440 px", async ({ page }) => {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      expect(await noHorizontalScroll(page), `${width}px`).toBe(true);
    }
  });

  test("AC-58: the first Tab stop is a skip link that moves focus to <main>", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "keyboard path checked on desktop");
    for (const path of ["/", "/rotate-pdf", "/merge-pdf", "/about", "/does-not-exist"]) {
      await openHydrated(page, path);
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "Skip to main content" });
      await expect(skip, path).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("main#main"), path).toBeFocused();
    }
  });
});
