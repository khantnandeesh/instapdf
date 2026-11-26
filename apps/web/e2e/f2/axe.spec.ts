/** F2 AC-56 (and gap G-1): axe across the home page, the header menu and the shared pages. Spec: docs/specs/f2-home.md */
import { expect, test } from "@playwright/test";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { catalogueSearch, isDesktop, menu, menuButton, menuLinks, menuSearch, openHydrated, openMenu, tools } from "./support";

test.describe("AC-56 at 1366x900", () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test("AC-56: axe (default ruleset + WCAG 2.0/2.1/2.2 A and AA) finds no serious or critical violations on home, desktop menu, menu search with no results, coming-soon, 404 and /rotate-pdf", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "desktop states");

    await openHydrated(page);
    await expectNoSeriousAxeViolations(page, "home, menu closed");

    await catalogueSearch(page).fill("zzqx");
    await expect(page.getByTestId("no-results")).toBeVisible();
    await expectNoSeriousAxeViolations(page, "home, catalogue search with no results");
    await catalogueSearch(page).fill("");

    await openMenu(page);
    await expect(menuLinks(page)).toHaveCount(tools.length);
    await expectNoSeriousAxeViolations(page, "desktop menu open");

    await menuSearch(page).fill("zzqx");
    await expect(page.getByTestId("tool-menu-no-results")).toBeVisible();
    await expectNoSeriousAxeViolations(page, "desktop menu search with no results");
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);

    await openHydrated(page, "/split-pdf-by-bookmarks");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSeriousAxeViolations(page, "coming-soon page /split-pdf-by-bookmarks");

    const notFound = await page.goto("/does-not-exist");
    expect(notFound?.status()).toBe(404);
    await expectNoSeriousAxeViolations(page, "404 page");

    await openHydrated(page, "/rotate-pdf");
    await expectNoSeriousAxeViolations(page, "/rotate-pdf, empty");
  });
});

test.describe("AC-56 at 375x812", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("AC-56: axe (default ruleset + WCAG 2.0/2.1/2.2 A and AA) finds no serious or critical violations on home and with the mobile menu open at 375 px", async ({ page }) => {
    await openHydrated(page);
    await expectNoSeriousAxeViolations(page, "375 px home");

    await menuButton(page).click();
    await expect(page.getByRole("dialog", { name: "All tools" })).toBeVisible();
    await expectNoSeriousAxeViolations(page, "375 px menu open");
  });
});

test.describe("AC-56 with the OS in dark mode at 1366x900 (light only until BerryPDF defines dark)", () => {
  test.use({ viewport: { width: 1366, height: 900 }, colorScheme: "dark" });

  test("AC-56: with the OS in dark mode the page stays on the light palette and axe finds no serious or critical violations on home, catalogue and menu no-results, desktop menu, coming-soon, 404 and /rotate-pdf", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "desktop states");

    await openHydrated(page);
    // Dark mode is pending the designer's definition: an OS dark preference keeps the light palette.
    // BerryPDF grid paper: the light ground (#fffdfb) stays.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 253, 251)");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
    await expectNoSeriousAxeViolations(page, "dark, home, menu closed");

    await catalogueSearch(page).fill("zzqx");
    await expect(page.getByTestId("no-results")).toBeVisible();
    await expectNoSeriousAxeViolations(page, "dark, home, catalogue search with no results");
    await catalogueSearch(page).fill("");

    await openMenu(page);
    await expect(menuLinks(page)).toHaveCount(tools.length);
    await expectNoSeriousAxeViolations(page, "dark, desktop menu open");

    await menuSearch(page).fill("zzqx");
    await expect(page.getByTestId("tool-menu-no-results")).toBeVisible();
    await expectNoSeriousAxeViolations(page, "dark, desktop menu search with no results");
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);

    await openHydrated(page, "/split-pdf-by-bookmarks");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSeriousAxeViolations(page, "dark, coming-soon page /split-pdf-by-bookmarks");

    const notFound = await page.goto("/does-not-exist");
    expect(notFound?.status()).toBe(404);
    await expectNoSeriousAxeViolations(page, "dark, 404 page");

    await openHydrated(page, "/rotate-pdf");
    await expectNoSeriousAxeViolations(page, "dark, /rotate-pdf, empty");
  });
});

test.describe("AC-56 with the OS in dark mode at 375x812 (light only until BerryPDF defines dark)", () => {
  test.use({ viewport: { width: 375, height: 812 }, colorScheme: "dark" });

  test("AC-56: with the OS in dark mode axe finds no serious or critical violations on home and with the mobile menu open at 375 px", async ({ page }) => {
    await openHydrated(page);
    await expectNoSeriousAxeViolations(page, "dark, 375 px home");

    await menuButton(page).click();
    await expect(page.getByRole("dialog", { name: "All tools" })).toBeVisible();
    await expectNoSeriousAxeViolations(page, "dark, 375 px menu open");
  });
});
