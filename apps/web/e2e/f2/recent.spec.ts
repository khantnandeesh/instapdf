/** F2 recent tools (device-only): AC-40 to AC-47. Spec: docs/specs/f2-home.md §3f */
import { expect, test } from "@playwright/test";
import { isDesktop, menu, menuButton, openHydrated, openMenu, RECENT_KEY, seedRecent, storedRecent } from "./support";

const homeRecent = (page: import("@playwright/test").Page) => page.getByTestId("home-recent");
const menuRecent = (page: import("@playwright/test").Page) => page.getByTestId("menu-recent");

test.beforeEach(async ({}, info) => {
  test.skip(!isDesktop(info.project.name), "storage rules are viewport-independent; checked on desktop");
});

test("AC-40: a fresh profile shows no Recent group on the home page or in the menu", async ({ page }) => {
  await openHydrated(page);
  await expect(homeRecent(page)).toHaveCount(0);
  await openMenu(page);
  await expect(menuRecent(page)).toHaveCount(0);
});

test("AC-41: after opening /rotate-pdf, Rotate is first in Recent on the home page and in the menu", async ({ page }) => {
  await openHydrated(page, "/rotate-pdf");
  await expect.poll(() => storedRecent(page)).not.toBeNull();
  await openHydrated(page, "/");
  await expect(homeRecent(page).getByRole("link").first()).toHaveAttribute("href", "/rotate-pdf");
  await openMenu(page);
  await expect(menuRecent(page).getByRole("link").first()).toHaveAttribute("href", "/rotate-pdf");
  expect(JSON.parse((await storedRecent(page))!)[0]).toBe("rotate-pdf");
});

test("AC-41: client-side navigation back to / shows the new entry at once", async ({ page }) => {
  await openHydrated(page, "/rotate-pdf");
  await page.getByRole("link", { name: "BerryPDF home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(homeRecent(page).getByRole("link").first()).toHaveAttribute("href", "/rotate-pdf");
});

test("AC-42: coming-soon, placeholder and unknown pages do not change the stored list", async ({ page }) => {
  for (const path of ["/split-pdf", "/about", "/no-such-page"]) {
    await page.goto(path);
    await page.waitForTimeout(200);
    expect(await storedRecent(page), path).toBeNull();
  }
});

test("AC-43: unknown and planned slugs are skipped", async ({ page }) => {
  await page.goto("/");
  await seedRecent(page, JSON.stringify(["no-such-tool", "split-pdf", "rotate-pdf"]));
  await expect(homeRecent(page).getByRole("link")).toHaveCount(1);
  await expect(homeRecent(page).getByRole("link")).toHaveAttribute("href", "/rotate-pdf");
});

test("AC-44: a corrupt value gives a working page without Recent, and the next visit rewrites it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await seedRecent(page, "{oops");
  await expect(page.locator("[data-testid=category]").first()).toBeVisible();
  await expect(homeRecent(page)).toHaveCount(0);
  await openHydrated(page, "/rotate-pdf");
  // Until the visit is recorded the stored value is still the corrupt one, so parse failures retry.
  await expect
    .poll(async () => {
      try {
        return JSON.parse((await storedRecent(page)) ?? "null")?.[0];
      } catch {
        return undefined;
      }
    })
    .toBe("rotate-pdf");
  expect(errors).toEqual([]);
});

test("AC-45: with localStorage throwing, the page, menu and search work and no Recent shows", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  await openHydrated(page);
  await expect(homeRecent(page)).toHaveCount(0);
  await page.locator("#catalogue-search").fill("split");
  await expect(page.locator('[data-testid=category] a[href="/merge-pdf"]')).toHaveCount(0);
  await page.locator("#catalogue-search").fill("");
  await openMenu(page);
  await expect(menuRecent(page)).toHaveCount(0);
  await page.locator("#tool-menu-search").fill("split");
  await expect(menu(page).locator('nav a[href="/merge-pdf"]')).toHaveCount(0);
  await expect(menu(page).locator('nav a[href="/split-pdf"]')).toBeVisible();
  await openHydrated(page, "/rotate-pdf");
  await expect(page.locator('input[type=file][accept*=".pdf"]')).toBeAttached();
  expect(errors).toEqual([]);
});

test("AC-45: with writes failing (quota exceeded), visiting a tool and clearing raise nothing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const fail = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    Storage.prototype.setItem = fail;
    Storage.prototype.removeItem = fail;
  });
  await openHydrated(page, "/rotate-pdf");
  await expect(page.locator('input[type=file][accept*=".pdf"]')).toBeAttached();
  await openHydrated(page, "/");
  await expect(homeRecent(page)).toHaveCount(0);
  await expect(page.locator("[data-testid=category]").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("AC-44: well-formed JSON of the wrong shape is treated as empty and rewritten on the next visit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  for (const bad of ['{"a":1}', '"rotate-pdf"', "null", "42", "[1,2]", '["rotate-pdf",null]', "[]", ""]) {
    await seedRecent(page, bad);
    await expect(page.locator("[data-testid=category]").first(), bad).toBeVisible();
    await expect(homeRecent(page), bad).toHaveCount(0);
    // The pre-paint script agrees: no space is reserved.
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-recent")), bad).toBe(false);
  }
  await seedRecent(page, '{"a":1}');
  await openHydrated(page, "/rotate-pdf");
  await expect.poll(() => storedRecent(page)).toBe('["rotate-pdf"]');
  expect(errors).toEqual([]);
});

test("AC-41: a visit recorded in another tab shows up here without a reload", async ({ page, context }) => {
  await openHydrated(page);
  await expect(homeRecent(page)).toHaveCount(0);
  const other = await context.newPage();
  await other.goto("/rotate-pdf");
  await expect.poll(() => storedRecent(other)).toBe('["rotate-pdf"]');
  await expect(homeRecent(page).getByRole("link").first()).toHaveAttribute("href", "/rotate-pdf");
});

test("AC-46: at most 12 stored, and a revisited tool moves to the front", async ({ page }) => {
  await page.goto("/");
  const twelve = [...Array.from({ length: 11 }, (_, i) => `old-${i}`), "rotate-pdf"];
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [RECENT_KEY, JSON.stringify(twelve)]);
  await openHydrated(page, "/rotate-pdf");
  await expect.poll(async () => JSON.parse((await storedRecent(page))!)[0]).toBe("rotate-pdf");
  expect(JSON.parse((await storedRecent(page))!)).toHaveLength(12);
});

test("AC-46: a new visit to a full list drops the oldest entry", async ({ page }) => {
  await page.goto("/");
  const full = Array.from({ length: 12 }, (_, i) => `old-${i}`);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [RECENT_KEY, JSON.stringify(full)]);
  await openHydrated(page, "/rotate-pdf");
  await expect.poll(async () => JSON.parse((await storedRecent(page))!)).toEqual(["rotate-pdf", ...full.slice(0, 11)]);
});

test("AC-47: Clear empties the list and hides Recent on the home page and in the menu", async ({ page }) => {
  await page.goto("/");
  await seedRecent(page, JSON.stringify(["rotate-pdf"]));
  await expect(homeRecent(page)).toBeVisible();
  await homeRecent(page).getByRole("button", { name: "Clear recently used tools" }).click();
  await expect(homeRecent(page)).toHaveCount(0);
  expect(await storedRecent(page)).toBeNull();
  await openMenu(page);
  await expect(menuRecent(page)).toHaveCount(0);
  await menuButton(page).click();

  // And from the menu side.
  await seedRecent(page, JSON.stringify(["rotate-pdf"]));
  await openMenu(page);
  await menu(page).getByRole("button", { name: "Clear recently used tools" }).click();
  await expect(menuRecent(page)).toHaveCount(0);
  await expect(homeRecent(page)).toHaveCount(0);
  expect(await storedRecent(page)).toBeNull();
});

test("H-10: with history, the Recent row's box is reserved before hydration", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(([k]) => localStorage.setItem(k, JSON.stringify(["rotate-pdf"])), [RECENT_KEY]);
  await page.route("**/_next/static/chunks/**", (route) => route.abort()); // no hydration
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-recent"))).toBe(true);
  const h = await page.locator(".ip-recent-slot").evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(92);
});
