/**
 * Sticky search bar (docs/design/berrypdf.md "Sticky search and filter bars"): on the home catalogue the
 * search scrolls with the page until it reaches the header, stays pinned under it while the list scrolls,
 * and returns to its place on the way up. Only the search pins (owner, 2026-11-24): the ready-only filter
 * and the jump chips scroll away; pinned, the search grows a little and stays centred.
 */
import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("catalogue-bar");
const headerBottom = (page: Page) => page.evaluate(() => document.querySelector("header")!.getBoundingClientRect().bottom);

test("the catalogue search bar pins under the header while scrolling and returns on the way up", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox");
  const restTop = (await bar(page).boundingBox())!.y;
  await expect(bar(page)).not.toHaveAttribute("data-stuck");

  // Deep into the list: the bar sits right under the header, stuck, search still usable.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.6));
  const hb = await headerBottom(page);
  await expect.poll(async () => Math.round((await bar(page).boundingBox())!.y)).toBe(Math.round(hb));
  await expect(bar(page)).toHaveAttribute("data-stuck", "");
  await expect(search).toBeInViewport();
  const hit = await search.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!h && (h === el || el.contains(h) || h.contains(el));
  });
  expect(hit, "nothing covers the pinned search field").toBe(true);

  // Typing while pinned works and the results show below it.
  await search.fill("rotate");
  await expect(page.getByRole("link", { name: /Rotate/ }).first()).toBeVisible();
  await search.fill("");

  // Back to the top: the bar is back in its place, not stuck.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => Math.round((await bar(page).boundingBox())!.y)).toBe(Math.round(restTop));
  await expect(bar(page)).not.toHaveAttribute("data-stuck");
});

test("a category jump lands below the pinned bar, not under it", async ({ page }) => {
  await page.goto("/");
  const chip = page
    .getByRole("navigation", { name: /categor|jump/i })
    .getByRole("link")
    .nth(3);
  const target = (await chip.getAttribute("href"))!;
  await chip.click();
  const heading = page.locator(`${target} h2, ${target} h3`).first();
  await expect
    .poll(async () => {
      const h = (await heading.boundingBox())!.y;
      const b = (await bar(page).boundingBox())!;
      return h >= b.y + b.height - 1;
    })
    .toBe(true);
});

test("the bar is marked stuck exactly when it pins, not while it is still moving", async ({ page }) => {
  await page.goto("/");
  const hb = await headerBottom(page);
  const restTop = (await bar(page).boundingBox())!.y + (await page.evaluate(() => window.scrollY));
  // 8px before the bar reaches the header: not stuck yet.
  await page.evaluate((y) => window.scrollTo(0, y), restTop - hb - 8);
  await expect.poll(async () => Math.round((await bar(page).boundingBox())!.y)).toBe(Math.round(hb + 8));
  await page.waitForTimeout(150);
  await expect(bar(page)).not.toHaveAttribute("data-stuck");
  // 8px past it: pinned and stuck.
  await page.evaluate((y) => window.scrollTo(0, y), restTop - hb + 8);
  await expect(bar(page)).toHaveAttribute("data-stuck", "");
  expect(Math.round((await bar(page).boundingBox())!.y)).toBe(Math.round(hb));
});

test("F2 H-7 focus order is kept: search, then the ready-only filter, then the category chips", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard order is checked once");
  await page.goto("/");
  await page.getByRole("searchbox").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("switch", { name: "Only ready tools" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("navigation", { name: "Jump to a category" }).getByRole("link").first()).toBeFocused();
});

test("the ready-only switch's visible text is part of its accessible name on every width (WCAG 2.5.3)", async ({ page }) => {
  await page.goto("/");
  const sw = page.getByRole("switch", { name: "Only ready tools" });
  await expect(sw).toBeVisible();
  const visible = (await sw.locator("xpath=..").innerText()).trim();
  expect(visible.length).toBeGreaterThan(0);
  expect("Only ready tools".toLowerCase()).toContain(visible.toLowerCase());
});

test("only the search pins: the filter and the jump chips scroll away, and the pinned search is centred and a bit wider", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox");
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const rest = (await search.boundingBox())!;
  expect(Math.abs(rest.x + rest.width / 2 - vw / 2), "the search is centred at rest").toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight * 0.5, behavior: "instant" }));
  await expect(bar(page)).toHaveAttribute("data-stuck", "");
  const hb = await headerBottom(page);
  // The filter and the chips are above the header now (scrolled away), not pinned below it.
  for (const el of [page.getByRole("switch", { name: "Only ready tools" }), page.getByRole("navigation", { name: "Jump to a category" })]) {
    const box = (await el.boundingBox())!;
    expect(box.y + box.height, "scrolled away under the header").toBeLessThanOrEqual(hb);
  }
  // Pinned: centred, and slightly wider where there is room (it is already full width on phones).
  await expect
    .poll(async () => {
      const b = (await search.boundingBox())!;
      return Math.abs(b.x + b.width / 2 - vw / 2) <= 1 && (vw < 768 || (b.width > rest.width && b.width <= rest.width * 1.2));
    })
    .toBe(true);
});

test("the strip beside the pinned search lets clicks through to the cards", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "needs room beside the field");
  await page.goto("/");
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight * 0.5, behavior: "instant" }));
  await expect(bar(page)).toHaveAttribute("data-stuck", "");
  const b = (await bar(page).boundingBox())!;
  const s = (await page.getByRole("searchbox").boundingBox())!;
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid=catalogue-bar]") === null, [Math.max(b.x + 4, s.x - 60), b.y + b.height / 2]);
  expect(hit, "a point beside the field is not taken by the bar").toBe(true);
});

for (const forced of [false, true]) {
  test(`the ready-only switch is visible and takes clicks at rest${forced ? " (forced colours)" : ""}`, async ({ page }) => {
    if (forced) await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    const sw = page.getByRole("switch", { name: "Only ready tools" });
    await sw.scrollIntoViewIfNeeded();
    // Nothing (the transparent search strip, or its Canvas ground in forced colours) is painted over it.
    const onTop = await sw.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!h && (h === el || !!h.closest("label")?.contains(el));
    });
    expect(onTop, "the switch is the topmost thing at its centre").toBe(true);
    const box = (await sw.locator("xpath=..").boundingBox())!;
    expect(box.height, "the filter pill stays on one line").toBeLessThan(56);
  });
}
