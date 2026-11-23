/** F2 home page and catalogue: AC-1 to AC-22, AC-54 to AC-63. Spec: docs/specs/f2-home.md */
import { gzipSync } from "node:zlib";
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
  test("AC-1: / returns 200 with one h1, a title with BerryPDF and a meta description", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page).toHaveTitle(/BerryPDF/);
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

  // AC-4 changed 2026-11-23 per owner (minimal text): the hero is title, one line, the main action
  // and one privacy note; the separate see-all link is gone (the main action leads to the catalogue).
  test("AC-4: the hero is just the title, one line, the main action and one short privacy note", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator(".mp-hero");
    await expect(hero.getByTestId("hero-see-all")).toHaveCount(0);
    await expect(hero.locator("h1")).toHaveCount(1);
    await expect(hero.locator("p")).toHaveCount(2);
    await expect(hero.locator("a")).toHaveCount(1);
    await expect(hero.locator("ul")).toHaveCount(0);
  });
});

test.describe("catalogue", () => {
  test("AC-5: the category sections hold exactly one link per registry tool, no duplicates", async ({ page }) => {
    await page.goto("/");
    const hrefs = await categoryLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toHaveLength(tools.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(hrefs)).toEqual(new Set(tools.map((t) => `/${t.slug}`)));
  });

  test("AC-6: category headings are in the fixed order and each tool sits under its registry category", async ({ page }) => {
    await page.goto("/");
    expect(categories.map((c) => c.id)).toEqual(["organize", "edit", "optimize", "security", "convert-from", "convert-to", "scans", "automate"]);
    // Category headings are h3 under the "All tools" h2 (design H-7); query by section.
    // Text content, not innerText: BerryPDF draws the eyebrows in UPPERCASE with CSS only.
    const headings = (await page.locator("[data-testid=category] h3").allTextContents()).map((t) => t.trim());
    expect(headings).toEqual(categories.map((c) => c.label));
    for (const c of categories) {
      const section = page.locator(`#cat-${c.id}`);
      const inSection = await section.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      expect(inSection, c.id).toEqual(tools.filter((t) => t.category === c.id).map((t) => `/${t.slug}`));
    }
  });

  // AC-7 changed 2026-11-23 per owner (minimal text): the card shows the name; the summary is
  // no longer drawn but stays in the link's accessible name and is its tooltip.
  test("AC-7: each card shows its name, carries its summary in its name and tooltip, and is a single link", async ({ page }) => {
    await page.goto("/");
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const t of tools) {
      const card = page.locator(`[data-testid=category] a[href="/${t.slug}"]`);
      await expect(card).toHaveCount(1);
      await expect(card.locator(".mp-card__name")).toHaveText(t.name);
      await expect(card).toHaveAccessibleName(new RegExp(esc(t.summary)));
      await expect(card).toHaveAttribute("title", t.summary);
      expect(await card.locator("a").count()).toBe(0);
    }
  });

  test("AC-13: a beta tool shows a Beta badge on its card and its menu entry", async ({ page }) => {
    await openHydrated(page);
    const beta = tools.filter((t) => t.status === "beta");
    expect(beta.map((t) => t.slug)).toContain("rotate-pdf");
    for (const t of beta) {
      const card = page.locator(`[data-testid=category] a[href="/${t.slug}"]`);
      await expect(card.getByText("Beta", { exact: true }), t.slug).toBeVisible();
      await expect(card, t.slug).toHaveAccessibleName(/Beta/);
    }
    for (const t of tools.filter((x) => x.status !== "beta"))
      await expect(page.locator(`[data-testid=category] a[href="/${t.slug}"]`), t.slug).not.toHaveAccessibleName(/Beta/);
    await openMenu(page);
    for (const t of beta) {
      const entry = menuLinks(page).and(page.locator(`[href="/${t.slug}"]`));
      await expect(entry.getByText("Beta", { exact: true }), t.slug).toBeVisible();
      await expect(entry, t.slug).toHaveAccessibleName(/Beta/);
    }
    // No other tool carries it.
    for (const t of tools.filter((x) => x.status !== "beta"))
      await expect(menuLinks(page).and(page.locator(`[href="/${t.slug}"]`)), t.slug).not.toHaveAccessibleName(/Beta/);
  });

  test("AC-8: Rotate links to /rotate-pdf, has no coming-soon badge, and opens the tool's empty state", async ({ page }) => {
    await page.goto("/");
    const card = page.locator('[data-testid=category] a[href="/rotate-pdf"]');
    await expect(card).not.toContainText("Coming soon");
    await expect(card).not.toHaveAccessibleName(/Coming soon/);
    await card.click();
    await expect(page).toHaveURL(/\/rotate-pdf$/);
    await expect(page.locator('input[type=file][accept*=".pdf"]')).toBeAttached();
  });

  // AC-9 changed 2026-11-23 per owner (minimal text): the visible mark is a short "Soon"; the
  // accessible name still says "Coming soon".
  test("AC-9: every planned card shows a Soon mark and says Coming soon in its accessible name; usable ones do not", async ({ page }) => {
    await page.goto("/");
    for (const t of plannedTools) {
      const card = page.locator(`[data-testid=category] a[href="/${t.slug}"]`);
      await expect(card.getByText("Soon", { exact: true })).toBeVisible();
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

  /** Independent oracle for the spec's rule: trimmed, case-insensitive substring of name, summary or a keyword. */
  const expectedHrefs = (query: string) => {
    const q = query.trim().toLowerCase();
    const hits = tools.filter((t) => [t.name, t.summary, ...t.keywords].some((s) => s.toLowerCase().includes(q)));
    // Category sections list tools in category order, registry order within each.
    return categories.flatMap((c) => hits.filter((t) => t.category === c.id)).map((t) => `/${t.slug}`);
  };

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

  test("AC-15: special characters are matched literally (no regex, no HTML) and never break the page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => {
      errors.push(`dialog: ${d.message()}`);
      void d.dismiss();
    });
    for (const q of ["&", ".", ".*", "(", "[", "\\", "+?", "^$", "%", "'\"", "<b>x</b>", "<img src=x onerror=alert(1)>", "日本語", "ü"]) {
      await catalogueSearch(page).fill(q);
      const expected = expectedHrefs(q);
      if (expected.length === 0) {
        await expect(page.getByTestId("no-results"), q).toBeVisible();
        // The query is shown as text, never parsed as markup.
        await expect(page.getByTestId("no-results"), q).toContainText(q.trim());
        await expect(page.locator("[data-testid=catalogue] b, [data-testid=catalogue] img")).toHaveCount(0);
      } else {
        await expect(page.getByTestId("no-results"), q).toHaveCount(0);
        expect(await visibleNames(page), q).toEqual(expected);
      }
    }
    // `&` is a real hit: the "X & Y" tools.
    expect(expectedHrefs("&")).toEqual(expect.arrayContaining(["/fill-sign", "/combine-reorder"]));
    expect(errors).toEqual([]);
  });

  test("AC-62: special characters round-trip through ?q and deep links", async ({ page }) => {
    await catalogueSearch(page).fill("fill & sign");
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("fill & sign");
    await page.reload();
    await expect(catalogueSearch(page)).toHaveValue("fill & sign");
    expect(await visibleNames(page)).toEqual(["/fill-sign"]);

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openHydrated(page, `/?q=${encodeURIComponent("<img src=x onerror=alert(1)>")}`);
    await expect(page.getByTestId("no-results")).toContainText("<img src=x onerror=alert(1)>");
    await expect(page.locator("[data-testid=catalogue] img")).toHaveCount(0);

    // A blank or whitespace-only q shows everything and is dropped from the URL.
    await openHydrated(page, "/?q=%20%20");
    await expect(categoryLinks(page)).toHaveCount(tools.length);
    await expect(page.getByTestId("popular")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("AC-62: a deep link /?q=split#tools keeps the hash and the filter", async ({ page }) => {
    await openHydrated(page, "/?q=split#tools");
    await expect(catalogueSearch(page)).toHaveValue("split");
    expect(await visibleNames(page)).toEqual(expectedHrefs("split"));
    expect(new URL(page.url()).hash).toBe("#tools");
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
  // AC-59 changed 2026-11-23 per owner (minimal text): the marker is no longer drawn; it stays in the name.
  test("AC-59: client tools carry 'Runs in your browser' in the card and menu entry name; server tools do not", async ({ page }) => {
    await openHydrated(page);
    await expect(page.getByTestId("catalogue").getByText("Runs in your browser").first()).toHaveClass(/sr-only/);
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

  test("AC-56/AC-59: card, Popular tile and menu entry names are the content in order, comma-separated", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await openHydrated(page);
    const merge = tools.find((t) => t.slug === "merge-pdf")!;
    const rotate = tools.find((t) => t.slug === "rotate-pdf")!;
    expect(merge.status).toBe("planned");
    expect(rotate.status).toBe("beta");
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Exact name: every piece in visual order, joined by ", " (whitespace around the comma may vary).
    const exact = (...parts: (string | false)[]) => new RegExp(`^${parts.filter((p): p is string => !!p).map((p) => esc(p.trim())).join("\\s*,\\s*")}$`);
    const rt = (t: typeof merge) => t.runtime === "client" && "Runs in your browser";

    await expect(page.locator('[data-testid=category] a[href="/merge-pdf"]')).toHaveAccessibleName(exact(merge.name, merge.summary, "Coming soon", rt(merge)));
    await expect(page.getByTestId("popular").locator('a[href="/rotate-pdf"]')).toHaveAccessibleName(exact(rotate.name, rotate.summary, "Beta", rt(rotate)));
    await openMenu(page);
    await expect(menuLinks(page).and(page.locator('[href="/merge-pdf"]'))).toHaveAccessibleName(exact(merge.name, "Coming soon", rt(merge)));
    await expect(menuLinks(page).and(page.locator('[href="/rotate-pdf"]'))).toHaveAccessibleName(exact(rotate.name, "Beta", rt(rotate)));
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

  /*
   * AC-55 is a Lighthouse (mobile) score measured by the evaluator on staging. This is a
   * cheap local proxy that catches the usual regressions: a heavy chunk (pdf-lib / pdf.js)
   * leaking onto the home page, or the page weight growing well past today's baseline
   * (2026-11-23: ~121 KB gzip JS, ~23 KB gzip HTML, ~10 KB gzip CSS).
   */
  test("AC-55 (proxy): / stays inside a page-weight budget and loads no PDF-engine code", async ({ page }, info) => {
    test.skip(isDesktop(info.project.name), "Lighthouse's mobile preset; measured once on mobile");
    const gz: Record<string, number> = {};
    const scripts: { url: string; raw: number }[] = [];
    const pending: Promise<void>[] = [];
    page.on("response", (r) => {
      pending.push(
        r
          .body()
          .then((body) => {
            const type = r.request().resourceType();
            gz[type] = (gz[type] ?? 0) + gzipSync(body).length;
            if (type === "script") scripts.push({ url: r.url(), raw: body.length });
          })
          .catch(() => {}),
      );
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await Promise.all(pending);
    const kb = (n = 0) => Math.round(n / 1024);
    const summary = Object.fromEntries(Object.entries(gz).map(([k, v]) => [k, `${kb(v)} KB`]));
    expect(kb(gz.script), JSON.stringify(summary)).toBeLessThanOrEqual(140);
    expect(kb(gz.document), JSON.stringify(summary)).toBeLessThanOrEqual(40);
    expect(kb(gz.stylesheet), JSON.stringify(summary)).toBeLessThanOrEqual(20);
    // pdf-lib and pdf.js belong to tool pages only; any single chunk this big means one leaked in.
    expect(scripts.filter((s) => s.raw > 250 * 1024).map((s) => s.url)).toEqual([]);
    expect(scripts.filter((s) => /pdf\.worker|pdfjs/i.test(s.url)).map((s) => s.url)).toEqual([]);
  });

  test("fonts: one self-hosted variable Fredoka file is preloaded (not four static weights), and the page loads no other font", async ({ page, request }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const preloads = await page.locator('link[rel="preload"][as="font"]').evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href));
    expect(preloads).toHaveLength(1);
    const origin = new URL(page.url()).origin;
    expect(new URL(preloads[0]).origin).toBe(origin);
    const bytes = (await (await request.get(preloads[0])).body()).length;
    expect(bytes, "variable latin file, about 30 KB").toBeLessThanOrEqual(36 * 1024);
    const fonts = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /\.woff2?($|\?)/.test(e.name)).map((e) => e.name));
    expect(new Set(fonts).size).toBe(1);
    // Every weight we use comes from that one face.
    const weights = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === "loaded" && !/fallback/i.test(f.family)).map((f) => f.weight);
    });
    expect(weights).toEqual(["300 700"]);
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
