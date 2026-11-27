/**
 * F25 eval G-5 (AC-605, motion.md E1): opening a file shows the editor's layout with paper-tinted
 * placeholders (no spinner), Download stays disabled until the first page is painted, and a locked
 * file's password is asked for over those placeholders, not over the picker.
 */
import { expect, test, type Page } from "@playwright/test";
import { fx } from "../support/flow";

/** Records, as it happens, whether Download ever showed enabled before a page had its raster. */
async function watch(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __early: number; __enabledAt: number; __placeholders: boolean; __spinner: boolean };
    w.__early = 0;
    w.__enabledAt = 0;
    w.__placeholders = false;
    w.__spinner = false;
    const check = () => {
      if (document.querySelector("[data-testid=opening-placeholders] .ed-opening__page")) w.__placeholders = true;
      if (document.querySelector(".ed-loader")) w.__spinner = true;
      const dl = document.querySelector<HTMLButtonElement>("[data-testid=download]");
      if (dl && !dl.disabled) {
        if (!document.querySelector("[data-testid^=page-] canvas.ed-raster")) w.__early++;
        if (!w.__enabledAt) w.__enabledAt = performance.now();
      }
    };
    new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled", "data-drawn", "class"] });
  });
}

for (const file of ["three-pages.pdf", "big-250.pdf"])
  test(`G-5 ${file}: placeholders while opening, Download enabled only with the first page painted`, async ({ page }) => {
    await watch(page);
    await page.goto("/edit-pdf");
    await page.getByTestId("editor-input").setInputFiles(fx(file));
    await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
    await expect(page.getByTestId("download")).toBeEnabled({ timeout: 20_000 });
    await expect(page.locator("[data-drawn]").first()).toBeAttached();
    const r = await page.evaluate(() => {
      const w = window as unknown as { __early: number; __placeholders: boolean; __spinner: boolean };
      return { __early: w.__early, __placeholders: w.__placeholders, __spinner: w.__spinner };
    });
    expect(r.__early, "Download enabled over the placeholders").toBe(0);
    expect(r.__placeholders, "paper placeholders shown while opening").toBe(true);
    expect(r.__spinner, "no spinner").toBe(false);
  });

test("G-5: a locked file asks for its password over the editor's placeholders; Skip goes back to the picker", async ({ page }) => {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(fx("aes-128.pdf"));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Behind it: the editor's layout (bar with the file name, placeholders), not the picker card.
  await expect(page.getByTestId("editor-opening")).toBeVisible();
  await expect(page.getByTestId("editor-opening")).toContainText("aes-128.pdf");
  await expect(page.getByTestId("opening-placeholders")).toBeVisible();
  await expect(page.getByTestId("editor-input")).toHaveCount(0);
  await dialog.getByRole("button", { name: /skip|cancel/i }).first().click();
  await expect(page.getByTestId("editor-opening")).toHaveCount(0);
  await expect(page.getByTestId("editor-input")).toHaveCount(1);
  // And the right password opens it from the placeholders.
  await page.getByTestId("editor-input").setInputFiles(fx("aes-128.pdf"));
  await page.getByRole("textbox", { name: "Password" }).fill("test");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
});
