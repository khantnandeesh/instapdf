/** F2 header and tool menu: AC-23 to AC-39 (AC-34 dropped by design, H-11 item 2). Spec: docs/specs/f2-home.md */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  catalogueSearch,
  categories,
  categoryLinks,
  isDesktop,
  menu,
  menuButton,
  menuLinks,
  menuSearch,
  noHorizontalScroll,
  openHydrated,
  openMenu,
  plannedTools,
  tools,
} from "./support";

const pages = ["/", "/rotate-pdf", "/merge-pdf", "/privacy", "/does-not-exist"];

test("AC-23: every kind of page shows the same header: logo link to / and the All tools button", async ({ page }) => {
  for (const path of pages) {
    await page.goto(path);
    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "InstaPDF home" }), path).toHaveAttribute("href", "/");
    await expect(header.getByRole("button", { name: "All tools" }), path).toBeVisible();
  }
});

test.describe("desktop menu (1366x900)", () => {
  test.use({ viewport: { width: 1366, height: 900 } });
  test.beforeEach(async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "desktop menu");
    await openHydrated(page);
  });

  test("AC-24: the button toggles the menu and aria-expanded", async ({ page }) => {
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await openMenu(page);
    await menuButton(page).click();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menu(page)).toHaveCount(0);
  });

  test("AC-25: the open menu lists every tool under the 8 categories; planned entries say Coming soon", async ({ page }) => {
    await openMenu(page);
    await expect(menuLinks(page)).toHaveCount(tools.length);
    await expect(menu(page).locator("nav h2")).toHaveText(categories.map((c) => new RegExp(`^${c.label.replace(/[&]/g, "\\$&")}`)));
    for (const t of plannedTools) await expect(menu(page).locator(`nav a[href="/${t.slug}"]`)).toHaveAccessibleName(/Coming soon/);
    await expect(menu(page).locator('nav a[href="/rotate-pdf"]')).toHaveAccessibleName(/Beta/);
  });

  test("AC-26: Escape closes the menu and returns focus to the button", async ({ page }) => {
    await openMenu(page);
    await menuSearch(page).fill("split");
    await page.keyboard.press("Escape");
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menuButton(page)).toBeFocused();
  });

  test("AC-27: the backdrop and the close button both close the menu", async ({ page }) => {
    await openMenu(page);
    await page.mouse.click(683, 880); // the scrim below the panel
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await openMenu(page);
    await page.getByRole("button", { name: "Close all tools" }).click();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menuButton(page)).toBeFocused();
  });

  test("AC-28: the menu search is focused on open and filters like the catalogue", async ({ page }) => {
    await openMenu(page);
    await expect(menuSearch(page)).toBeFocused();
    await page.keyboard.type("split");
    const hrefs = await menuLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const s of ["split-pdf", "split-by-bookmarks", "split-by-size", "split-by-text", "split-in-half"]) expect(hrefs).toContain(`/${s}`);
    for (const s of ["merge-pdf", "rotate-pdf", "compress-pdf"]) expect(hrefs).not.toContain(`/${s}`);
    await menuSearch(page).fill("zzqx");
    await expect(page.getByTestId("tool-menu-no-results")).toContainText("No tools match");
  });

  test("AC-29: choosing Rotate opens /rotate-pdf with the menu closed", async ({ page }) => {
    await openMenu(page);
    await menu(page).locator('nav a[href="/rotate-pdf"]').click();
    await expect(page).toHaveURL(/\/rotate-pdf$/);
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menu(page)).toHaveCount(0);
  });

  test("AC-30: Tab goes through the search and every tool link, each with a visible focus ring", async ({ page }) => {
    await openMenu(page);
    await expect(menuSearch(page)).toBeFocused();
    const seen: string[] = [];
    for (let i = 0; i < tools.length; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const s = getComputedStyle(el);
        return { href: el.getAttribute("href"), inMenu: !!el.closest("#tool-menu"), ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 };
      });
      expect(info.inMenu).toBe(true);
      expect(info.ring, info.href ?? "").toBe(true);
      if (info.href) seen.push(info.href);
    }
    expect(new Set(seen)).toEqual(new Set(tools.map((t) => `/${t.slug}`)));
  });

  test("AC-31: at most 5 header shortcuts, none to a planned tool (today: Rotate only)", async ({ page }) => {
    const shortcuts = page.getByRole("navigation", { name: "Quick links" }).getByRole("link");
    const hrefs = await shortcuts.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs.length).toBeLessThanOrEqual(5);
    const planned = new Set(plannedTools.map((t) => `/${t.slug}`));
    expect(hrefs.filter((h) => planned.has(h!))).toEqual([]);
    expect(hrefs).toEqual(["/rotate-pdf"]);
  });

  test("AC-32: opening the menu keeps the scroll position", async ({ page }) => {
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(590);
    const before = await page.evaluate(() => window.scrollY);
    await openMenu(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("AC-35: Enter in the menu search opens the first match", async ({ page }) => {
    await openMenu(page);
    await page.keyboard.type("rota");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/rotate-pdf$/);
  });

  test("H-7: Tab past the last control leaves and closes the panel", async ({ page }) => {
    await openMenu(page);
    await page.getByRole("button", { name: "Close all tools" }).focus();
    await page.keyboard.press("Tab");
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("AC-33 at 1280x720", () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test("AC-33: every menu entry can be scrolled into view", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "desktop menu");
    await openHydrated(page);
    await openMenu(page);
    const links = menuLinks(page);
    await expect(links).toHaveCount(tools.length);
    for (let i = 0; i < tools.length; i++) {
      await links.nth(i).scrollIntoViewIfNeeded();
      await expect(links.nth(i)).toBeInViewport();
    }
  });
});

test.describe("mobile (375x812)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("AC-36: logo and menu button, no shortcuts, no horizontal scroll", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "InstaPDF home" })).toBeVisible();
    await expect(menuButton(page)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Quick links" })).toBeHidden();
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  test("AC-37: the menu is a modal dialog with search and every tool; close returns focus", async ({ page }) => {
    await openHydrated(page);
    await menuButton(page).click();
    const dialog = page.getByRole("dialog", { name: "All tools" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.locator('input[type="search"]')).toBeVisible();
    await expect(dialog.locator("nav a[href]")).toHaveCount(tools.length);
    await expect(dialog.locator("nav h2")).toHaveCount(categories.length);
    await dialog.getByRole("button", { name: "Close all tools" }).click();
    await expect(dialog).toBeHidden();
    await expect(menuButton(page)).toBeFocused();
  });

  test("AC-38: focus stays inside the dialog and the page behind does not scroll", async ({ page }) => {
    await openHydrated(page);
    await page.evaluate(() => window.scrollTo(0, 300));
    await menuButton(page).click();
    const dialog = page.getByRole("dialog", { name: "All tools" });
    await expect(dialog).toBeVisible();
    const before = await page.evaluate(() => window.scrollY);
    for (const key of ["Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      const where = await page.evaluate(() => {
        const el = document.activeElement;
        return !el || el === document.body ? "browser" : el.closest("dialog[open]") ? "dialog" : el.outerHTML.slice(0, 80);
      });
      expect(["dialog", "browser"], key).toContain(where);
    }
    await page.mouse.move(180, 500);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("AC-39: cards are at least 44 px tall, fit the viewport, and search works", async ({ page }) => {
    await openHydrated(page);
    const boxes = await categoryLinks(page).evaluateAll((as) => as.map((a) => a.getBoundingClientRect()).map((r) => ({ h: r.height, l: r.left, r: r.right })));
    for (const b of boxes) {
      expect(b.h).toBeGreaterThanOrEqual(44);
      expect(b.l).toBeGreaterThanOrEqual(0);
      expect(b.r).toBeLessThanOrEqual(375);
    }
    await catalogueSearch(page).fill("split");
    await expect(page.locator('[data-testid=category] a[href="/merge-pdf"]')).toHaveCount(0);
    await expect(page.locator('[data-testid=category] a[href="/split-pdf"]')).toBeVisible();
  });

  test("AC-56: axe finds no critical or serious violations with the mobile menu open", async ({ page }) => {
    await openHydrated(page);
    await menuButton(page).click();
    await expect(page.getByRole("dialog", { name: "All tools" })).toBeVisible();
    await page.waitForTimeout(300);
    const r = await new AxeBuilder({ page }).analyze();
    const bad = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(bad.map((v) => v.id)).toEqual([]);
  });
});
