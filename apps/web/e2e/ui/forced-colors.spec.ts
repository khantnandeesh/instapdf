/** Forced colors (Windows High Contrast): focus and selection stay visible. Design system: docs/design/universal-ui.md */
import { expect, test, type Locator } from "@playwright/test";
import { catalogueSearch, openHydrated } from "../f2/support";
import { dialog, openRotate, passwordField, pick, scope } from "../support/flow";

const outline = (el: Locator) =>
  el.evaluate((e) => {
    const s = getComputedStyle(e);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });

const borderStyle = (el: Locator) => el.evaluate((e) => getComputedStyle(e).borderTopStyle);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
});

test("forced colors: the focused catalogue search keeps a visible outline", async ({ page }) => {
  await openHydrated(page);
  await catalogueSearch(page).focus();
  const o = await outline(catalogueSearch(page));
  expect(o.style).not.toBe("none");
  expect(o.width).toBeGreaterThanOrEqual(2);
});

test("forced colors: the focused password field keeps a visible outline", async ({ page }) => {
  await openRotate(page);
  await pick(page, "user-pw.pdf");
  await expect(dialog(page)).toBeVisible();
  await passwordField(page).focus();
  const o = await outline(passwordField(page));
  expect(o.style).not.toBe("none");
  expect(o.width).toBeGreaterThanOrEqual(2);
});

test("forced colors: the selected segment is outlined (not told apart by weight alone) and shadow-edged controls get a real border", async ({ page }) => {
  await openRotate(page);
  const checked = scope(page, "All");
  const unchecked = scope(page, "Odd");
  await expect(checked).toHaveAttribute("aria-checked", "true");
  expect((await outline(checked)).style).toBe("solid");
  expect((await outline(unchecked)).style).toBe("none");
  // Secondary buttons draw their edge with a shadow ring, which forced colors removes.
  expect(await borderStyle(page.getByRole("button", { name: "Rotate right", exact: true }))).toBe("solid");
});
