/**
 * Sticky search and filter bar (docs/design/berrypdf.md "Sticky search and filter bars"): on the home
 * catalogue the search, the ready-only filter and the jump chips scroll with the page until they reach
 * the header, stay pinned under it while the list scrolls, and return to their place on the way up.
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

test("the stuck shadow appears exactly when the bar pins, not while it is still moving", async ({ page }) => {
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
