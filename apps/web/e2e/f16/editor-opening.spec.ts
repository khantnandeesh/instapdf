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
  // Waiting for the password is not opening: nothing busy, no "Opening…" progressbar behind the dialog.
  await expect(page.getByTestId("editor-opening")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("opening-placeholders").getByRole("progressbar", { includeHidden: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: /skip|cancel/i }).first().click();
  await expect(page.getByTestId("editor-opening")).toHaveCount(0);
  await expect(page.getByTestId("editor-input")).toHaveCount(1);
  // And the right password opens it from the placeholders.
  await page.getByTestId("editor-input").setInputFiles(fx("aes-128.pdf"));
  await page.getByRole("textbox", { name: "Password" }).fill("test");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
});

for (const [width, height] of [
  [1280, 700],
  [390, 664],
] as const)
  test(`G-5 (eval run 2, R2-7) ${width}: the opening frame's title and file name sit where the editor's do`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    // Where the bar's h1 and the file name's text start (the name is a heading in both frames).
    const at = () =>
      page.evaluate(() => {
        const r = document.createRange();
        const name = document.querySelector(".ed-top .ed-file h2, .ed-top h2.ed-file")!;
        r.selectNodeContents(name);
        const t = document.querySelector(".ed-top .ed-title")!.getBoundingClientRect();
        return { title: [t.left, t.width], name: name.getBoundingClientRect().width > 1 ? r.getBoundingClientRect().left : null };
      });
    await page.goto("/edit-pdf");
    // A locked file holds the opening frame (behind its password dialog) for as long as the test needs.
    await page.getByTestId("editor-input").setInputFiles(fx("aes-128.pdf"));
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("editor-opening")).toBeVisible();
    const opening = await at();
    await page.getByRole("textbox", { name: "Password" }).fill("test");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
    const open = await at();
    expect(opening.title, "the h1 doesn't move or resize").toEqual(open.title);
    // A phone's bar shows a file icon in place of a short name, so the name is compared where it shows.
    if (open.name !== null) expect(Math.abs(opening.name! - open.name), "the file name doesn't move").toBeLessThanOrEqual(0.5);
  });

/** Holds pdf.js's renderer worker (the first page can't be drawn) until `release()`. */
async function holdRenderer(page: Page) {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  await page.route(/pdf\.renderer/, async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  return () => open();
}

test("G-5 (review S5): before the first paint Save as waits with Download, and a Ctrl+S is kept and runs on the paint", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard, Save as from 1024");
  const release = await holdRenderer(page);
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(fx("three-pages.pdf"));
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("download")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save as" })).toBeDisabled();
  await page.getByTestId("canvas").focus();
  const download = page.waitForEvent("download", { timeout: 20_000 });
  await page.keyboard.press("Control+s");
  await expect(page.getByTestId("live")).toContainText("Download starts in a moment");
  release();
  await expect(page.getByTestId("download")).toBeEnabled({ timeout: 15_000 });
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
});

test("G-5 (review S5): a first page that never draws gives Download back after a few seconds", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  await holdRenderer(page);
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(fx("three-pages.pdf"));
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("download")).toBeDisabled();
  await expect(page.getByTestId("download")).toBeEnabled({ timeout: 12_000 });
  await expect(page.getByRole("button", { name: "Save as" })).toBeEnabled();
});
