/** Shared helpers for the F2 e2e suite (home, catalogue, header menu). Spec: docs/specs/f2-home.md */
import { expect, type Page } from "@playwright/test";
import { categories, tools } from "../../src/tools/registry";

export { categories, tools };
export const usableTools = tools.filter((t) => t.status !== "planned");
export const plannedTools = tools.filter((t) => t.status === "planned");
export const RECENT_KEY = "instapdf:recent-tools";

export const isDesktop = (projectName: string) => projectName === "desktop";

/** Links inside the eight category sections of the home catalogue (not Popular or Recent). */
export const categoryLinks = (page: Page) => page.locator("[data-testid=catalogue] [data-testid=category] a[href]");
export const catalogueSearch = (page: Page) => page.locator("#catalogue-search");
export const menuButton = (page: Page) => page.getByTestId("all-tools-button");
export const menu = (page: Page) => page.getByTestId("tool-menu");
export const menuSearch = (page: Page) => page.locator("#tool-menu-search");
export const menuLinks = (page: Page) => menu(page).locator("nav a[href]");

/** Opens a page and waits until client islands are hydrated (the menu button reacts). */
export async function openHydrated(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => {
    const b = document.querySelector("[data-testid=all-tools-button]");
    return !!b && Object.keys(b).some((k) => k.startsWith("__reactProps"));
  });
}

export async function openMenu(page: Page) {
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(menu(page)).toBeVisible();
}

export const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

export const storedRecent = (page: Page) => page.evaluate((k) => localStorage.getItem(k), RECENT_KEY);

/** Sets the recent-tools store, then reloads so the page reads it fresh. */
export async function seedRecent(page: Page, value: string) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [RECENT_KEY, value]);
  await page.reload();
}

/**
 * Clicks the desktop menu's backdrop at a point that is not covered by the panel: the middle of
 * the strip between the panel's bottom edge and the scrim's bottom edge. The scrim's centre is
 * under the panel, so a plain `scrim.click()` never passes Playwright's hit-target check (G-3).
 */
export async function clickScrimOutsidePanel(page: Page) {
  const scrim = page.getByTestId("tool-menu-scrim");
  const s = await scrim.boundingBox();
  const p = await menu(page).boundingBox();
  if (!s || !p) throw new Error("menu panel or scrim is not rendered");
  const strip = s.y + s.height - (p.y + p.height);
  expect(strip, "visible backdrop strip below the panel").toBeGreaterThan(4);
  // The position is relative to the scrim; Playwright still checks the scrim is the hit target there.
  await scrim.click({ position: { x: s.width / 2, y: p.y + p.height - s.y + strip / 2 } });
}
