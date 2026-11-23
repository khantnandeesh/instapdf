/** Forced colors (Windows High Contrast): focus and selection stay visible. Design system: docs/design/berrypdf.md */
import { expect, test, type Locator } from "@playwright/test";
import { catalogueSearch, openHydrated } from "../f2/support";
import { dialog, openRotate, passwordField, pick, pickReady, scope, tabTo } from "../support/flow";

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

const border = (el: Locator) =>
  el.evaluate((e) => {
    const s = getComputedStyle(e);
    // Resolve the Highlight system color the same way the page does, for comparison.
    const probe = document.createElement("span");
    probe.style.color = "Highlight";
    document.body.append(probe);
    const highlight = getComputedStyle(probe).color;
    probe.remove();
    return { style: s.borderTopStyle, width: parseFloat(s.borderTopWidth), color: s.borderTopColor, highlight };
  });

test("forced colors: the selected segment has a Highlight border (not told apart by weight alone) and shadow-edged controls get a real border", async ({ page }) => {
  await openRotate(page);
  const checked = scope(page, "All");
  const unchecked = scope(page, "Odd");
  await expect(checked).toHaveAttribute("aria-checked", "true");
  const b = await border(checked);
  expect(b.style).toBe("solid");
  expect(b.width).toBe(2);
  expect(b.color).toBe(b.highlight);
  // Preflight gives every element `border: 0 solid`, so "no border" means zero width.
  expect((await border(unchecked)).width).toBe(0);
  // Secondary buttons draw their edge with a shadow ring, which forced colors removes.
  expect(await borderStyle(page.getByRole("button", { name: "Rotate right", exact: true }))).toBe("solid");
});

test("forced colors: Tab focus on the checked segment still shows the focus ring", async ({ page }) => {
  await openRotate(page);
  // Options are enabled once a file is loaded; the checked radio is the group's only tab stop.
  await pickReady(page, "three-pages.pdf");
  const checked = scope(page, "All");
  await expect(checked).toHaveAttribute("aria-checked", "true");
  await tabTo(page, checked);
  await expect(checked).toBeFocused();
  const o = await checked.evaluate((e) => {
    const s = getComputedStyle(e);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset) };
  });
  expect(o.style).toBe("solid");
  expect(o.width).toBeGreaterThanOrEqual(2);
  // BerryPDF: buttons and choice tiles show the 3px blueberry ring 3px away.
  expect(o.offset).toBe(3);
});

test("forced colors: the password dialog's apply-to-all checkbox shows its checked state", async ({ page }) => {
  await openRotate(page);
  await pick(page, "user-pw.pdf", "user-pw-2.pdf");
  await expect(dialog(page)).toBeVisible();
  const box = dialog(page).getByRole("checkbox");
  await expect(box).not.toBeChecked();
  // The system checkbox (not our drawn one) is used, so the system draws the tick.
  expect(await box.evaluate((e) => getComputedStyle(e).appearance)).toBe("auto");
  const before = await box.screenshot({ animations: "disabled" });
  await box.check();
  await expect(box).toBeChecked();
  const after = await box.screenshot({ animations: "disabled" });
  expect(after.equals(before), "checked and unchecked must look different").toBe(false);
});
