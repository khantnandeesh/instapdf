/** F2 header and tool menu: AC-23 to AC-39 (AC-34 dropped by design, H-11 item 2). Spec: docs/specs/f2-home.md */
import { expect, test } from "@playwright/test";
import {
  catalogueSearch,
  categories,
  clickScrimOutsidePanel,
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
import { shortcutTools } from "../../src/tools/registry";

const pages = ["/", "/rotate-pdf", "/merge-pdf", "/privacy", "/does-not-exist"];

test("AC-23: every kind of page shows the same header: logo link to / and the All tools button", async ({ page }) => {
  for (const path of pages) {
    await page.goto(path);
    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "BerryPDF home" }), path).toHaveAttribute("href", "/");
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
    await clickScrimOutsidePanel(page);
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menu(page)).toHaveCount(0);
    await openMenu(page);
    await page.getByRole("button", { name: "Close all tools" }).click();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menuButton(page)).toBeFocused();
  });

  test("G-2: closing the panel by clicking the backdrop returns focus to the All tools button", async ({ page }) => {
    await openMenu(page);
    await expect(menuSearch(page)).toBeFocused();
    await clickScrimOutsidePanel(page);
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menuButton(page)).toBeFocused();
  });

  test("AC-28: the menu search is focused on open and filters like the catalogue", async ({ page }) => {
    await openMenu(page);
    await expect(menuSearch(page)).toBeFocused();
    await page.keyboard.type("split");
    const hrefs = await menuLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const s of ["split-pdf", "split-pdf-by-bookmarks", "split-pdf-by-size", "split-pdf-by-text", "split-pdf-in-half"]) expect(hrefs).toContain(`/${s}`);
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

  test("AC-31: at most 5 header shortcuts, none to a planned tool (today: Rotate, Delete pages, Merge, Split, Extract pages)", async ({ page }) => {
    const shortcuts = page.getByRole("navigation", { name: "Quick links" }).getByRole("link");
    const hrefs = await shortcuts.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs.length).toBeLessThanOrEqual(5);
    const planned = new Set(plannedTools.map((t) => `/${t.slug}`));
    expect(hrefs.filter((h) => planned.has(h!))).toEqual([]);
    // The first 5 usable tools in popular order (registry shortcutTools), so a new ready tool shows up here.
    expect(hrefs).toEqual(shortcutTools(5).map((t) => `/${t.slug}`));
    expect(hrefs).toEqual(["/rotate-pdf", "/delete-pdf-pages", "/merge-pdf", "/split-pdf", "/extract-pdf-pages"]);
  });

  test("AC-32: opening the menu keeps the scroll position", async ({ page }) => {
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(590);
    const before = await page.evaluate(() => window.scrollY);
    await openMenu(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("AC-30: keyboard only: open, search, arrow into results, Tab out closes, Escape returns focus", async ({ page }) => {
    // Reach the trigger with Tab alone, from the top of a freshly loaded page.
    for (let i = 0; i < 10 && !(await menuButton(page).evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(menuButton(page)).toBeFocused();

    // Enter opens with the search focused; typing filters.
    await page.keyboard.press("Enter");
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(menuSearch(page)).toBeFocused();
    await page.keyboard.type("split");
    await expect(menuLinks(page)).toHaveCount(5);

    // ArrowDown moves to the first visible entry; Shift+Tab from the search goes back to the trigger, panel stays open.
    await page.keyboard.press("ArrowDown");
    await expect(menuLinks(page).first()).toBeFocused();
    await menuSearch(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(menuButton(page)).toBeFocused();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");

    // Tab through every control in the panel; one more Tab leaves it and closes it.
    await menuSearch(page).focus();
    let left = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      if (!(await page.evaluate(() => !!document.activeElement?.closest("#tool-menu")))) {
        left = true;
        break;
      }
    }
    expect(left).toBe(true);
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menu(page)).toHaveCount(0);

    // Space reopens; Escape (even with text in the search) closes in one press and focus returns to the trigger.
    await menuButton(page).focus();
    await page.keyboard.press("Space");
    await expect(menuSearch(page)).toBeFocused();
    await expect(menuSearch(page)).toHaveValue(""); // the query does not survive a close
    await page.keyboard.type("rot");
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(menuButton(page)).toBeFocused();
  });

  test("AC-28: special characters in the menu search are literal and never break it", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openMenu(page);
    await menuSearch(page).fill("&");
    const hrefs = await menuLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual(expect.arrayContaining(["/sign-pdf", "/combine-reorder-pdf"]));
    for (const q of [".*", "(", "[", "\\", "<img src=x onerror=alert(1)>"]) {
      await menuSearch(page).fill(q);
      await expect(page.getByTestId("tool-menu-no-results"), q).toContainText(q);
      await expect(menu(page).locator("img")).toHaveCount(0);
    }
    await page.getByTestId("tool-menu-no-results").getByRole("button", { name: "Clear search" }).click();
    await expect(menuSearch(page)).toHaveValue("");
    await expect(menuSearch(page)).toBeFocused();
    await expect(menuLinks(page)).toHaveCount(tools.length);
    expect(errors).toEqual([]);
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

// One column per group (owner 2026-11-27) needs ~640 px of panel: from 1280x720 up it all fits one screen;
// shorter windows scroll the panel itself (its one registered scroller).
for (const [width, height] of [
  [1280, 720],
  [1366, 768],
  [1470, 830],
] as const) {
  test.describe(`full-width panel (owner 2026-11-24) at ${width}x${height}`, () => {
    test.use({ viewport: { width, height } });
    test("the bar spans the viewport, the panel hangs from it full width, groups spread across it, the page behind is blurred, and it all fits one screen", async ({ page }, info) => {
      test.skip(!isDesktop(info.project.name), "desktop menu");
      await openHydrated(page);
      const header = await page.locator("header").first().boundingBox();
      expect(header).toMatchObject({ x: 0, width, height: 72 });
      await openMenu(page);
      await menu(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const panel = await menu(page).boundingBox();
      expect(panel).toMatchObject({ x: 0, width, y: 72 });
      // Groups fill the content width evenly (the bar's 1280 px column): the leftmost and rightmost group start in its outer fifths.
      const nav = (await menu(page).locator("nav").boundingBox())!;
      const lefts = await menu(page).locator("nav section h2, nav section li").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
      expect(Math.min(...lefts)).toBeLessThan(nav.x + nav.width / 5);
      expect(Math.max(...lefts)).toBeGreaterThan(nav.x + (nav.width * 4) / 5 - 40);
      // Every entry visible without scrolling the panel.
      await expect(menu(page).locator("nav a").last()).toBeInViewport();
      expect(await menu(page).evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      const backdrop = await page.getByTestId("tool-menu-scrim").evaluate((el) => getComputedStyle(el).backdropFilter);
      expect(backdrop).toMatch(/blur\(/);
    });

    test("each group sits whole in its own column, on its own tinted card, its heading a step above its rows; no name wraps", async ({ page }, info) => {
      test.skip(!isDesktop(info.project.name), "desktop menu");
      await openHydrated(page);
      await openMenu(page);
      await menu(page).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
      const groups = await menu(page).getByTestId("tool-menu-group").evaluateAll((els) =>
        els.map((g) => {
          const box = g.getBoundingClientRect();
          const rows = [...g.querySelectorAll("li")].map((li) => li.getBoundingClientRect());
          const name = g.querySelector(".ip-menu-name")!;
          return {
            box: { l: box.left, r: box.right, t: box.top, b: box.bottom },
            inside: rows.every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5),
            bg: getComputedStyle(g).backgroundColor,
            head: parseFloat(getComputedStyle(g.querySelector("h2")!).fontSize),
            row: parseFloat(getComputedStyle(name).fontSize),
            line: parseFloat(getComputedStyle(name).lineHeight),
            tallest: Math.max(...[...g.querySelectorAll(".ip-menu-name")].map((n) => n.getBoundingClientRect().height)),
          };
        }),
      );
      expect(groups.length).toBeGreaterThan(1);
      for (const [i, g] of groups.entries()) {
        expect(g.inside, `group ${i}: every row inside its card (never continued in another column)`).toBe(true);
        expect(g.bg, `group ${i}: tinted card`).not.toBe("rgba(0, 0, 0, 0)");
        expect(g.head, `group ${i}: heading bigger than rows`).toBeGreaterThan(g.row);
        expect(g.tallest, `group ${i}: names on one line`).toBeLessThan(g.line * 1.5);
        // Cards never overlap.
        for (const o of groups.slice(i + 1)) expect(g.box.r <= o.box.l + 0.5 || o.box.r <= g.box.l + 0.5 || g.box.b <= o.box.t + 0.5 || o.box.b <= g.box.t + 0.5).toBe(true);
      }
      // Adjacent cards differ in colour (columns read apart by their category hue).
      expect(new Set(groups.map((g) => g.bg)).size).toBe(groups.length);
    });
  });
}

test.describe("the panel's top row shares one centre line (owner 2026-11-27)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test("search, Recently used, its chips, Clear and the close sit on one axis", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "desktop menu");
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("berrypdf:recent-tools", JSON.stringify(["organize-pdf", "delete-pdf-pages"])));
    await openHydrated(page);
    await openMenu(page);
    await menu(page).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    const mids = await menu(page).evaluate((m) => {
      const mid = (el: Element | null) => {
        const r = el!.getBoundingClientRect();
        return Math.round((r.top + r.height / 2) * 2) / 2;
      };
      const recent = m.querySelector("[data-testid=menu-recent]")!;
      return {
        search: mid(m.querySelector("input[type=search]")),
        title: mid(recent.querySelector("h2")),
        chips: [...recent.querySelectorAll("li a")].map(mid),
        clear: mid(recent.querySelector("button")),
        close: mid(m.querySelector("[data-testid=tool-menu-close]")),
      };
    });
    for (const v of [mids.title, ...mids.chips, mids.clear, mids.close]) expect(Math.abs(v - mids.search)).toBeLessThanOrEqual(1);
  });
});

test.describe("full-width panel in forced colours", () => {
  test.use({ viewport: { width: 1280, height: 720 }, colorScheme: "light" });
  test("the bar and the panel keep a visible edge", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "desktop menu");
    await page.emulateMedia({ forcedColors: "active" });
    await openHydrated(page);
    const bar = await page.locator("header").first().evaluate((el) => getComputedStyle(el, "::before").borderBottomWidth);
    expect(parseFloat(bar)).toBeGreaterThan(0);
    await openMenu(page);
    const sides = await menu(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.borderLeftWidth, cs.borderRightWidth, cs.borderBottomWidth].map(parseFloat);
    });
    for (const w of sides) expect(w).toBeGreaterThan(0);
  });
});

test.describe("mobile (375x812)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("AC-36: logo and menu button, no shortcuts, no horizontal scroll", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "BerryPDF home" })).toBeVisible();
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

  test("AC-38: Tab and Shift+Tab wrap inside the dialog; touch scroll and close leave the page where it was", async ({ page }) => {
    await openHydrated(page);
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);
    await menuButton(page).click();
    const dialog = page.getByRole("dialog", { name: "All tools" });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");

    const inDialog = () => page.evaluate(() => !!document.activeElement?.closest("dialog[open]"));
    // Strict trap: more presses than there are controls, in both directions; focus never leaves.
    for (let i = 0; i < tools.length + 10; i++) {
      await page.keyboard.press("Tab");
      expect(await inDialog(), `Tab #${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await inDialog(), `Shift+Tab #${i + 1}`).toBe(true);
    }
    // From the search field (first control), Shift+Tab wraps to the last control, still inside.
    await menuSearch(page).focus();
    await page.keyboard.press("Shift+Tab");
    expect(await inDialog()).toBe(true);
    await expect(menuSearch(page)).not.toBeFocused();

    // A touch swipe over the dialog scrolls the dialog, not the page behind it.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.synthesizeScrollGesture", { x: 180, y: 600, yDistance: -500, gestureSourceType: "touch", speed: 2000 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);

    // Closing restores page scrolling and the position.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menuButton(page)).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
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
});
