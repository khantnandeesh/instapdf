/** F2 AC-56 (and gap G-1): axe across the home page, the header menu and the shared pages. Spec: docs/specs/f2-home.md */
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { catalogueSearch, isDesktop, menu, menuButton, menuLinks, menuSearch, openHydrated, openMenu, tools } from "./support";

/** Waits until entry animations (menu drop-in, scrim fade) are done, so contrast is measured on final colors. */
const settled = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || (a.effect?.getComputedTiming().iterations ?? 1) === Infinity));

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
    await settled(page);
    await expectNoSeriousAxeViolations(page, "desktop menu open");

    await menuSearch(page).fill("zzqx");
    await expect(page.getByTestId("tool-menu-no-results")).toBeVisible();
    await expectNoSeriousAxeViolations(page, "desktop menu search with no results");
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);

    await openHydrated(page, "/merge-pdf");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSeriousAxeViolations(page, "coming-soon page /merge-pdf");

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
    await settled(page);
    await expectNoSeriousAxeViolations(page, "375 px menu open");
  });
});
