/** F1 shared flow, section "Intake" (AC-1 to AC-19) plus intake edge cases. Spec: docs/specs/f1-shared-flow.md */
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  dropFixtures,
  fileInput,
  flow,
  fx,
  isDesktop,
  openRotate,
  pageCountOf,
  pick,
  pickReady,
  primary,
  rotateRight,
  run,
  downloadResult,
  tiles,
  backToOptions,
} from "../support/flow";
import { makeLargePdf, makeSparseFile } from "../support/large-pdf";

test.beforeEach(async ({ page }) => {
  await openRotate(page);
});

test("AC-1: empty state has one multi-file PDF picker, no thumbnails and a disabled primary", async ({ page }) => {
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(fileInput(page)).toHaveCount(1);
  await expect(fileInput(page)).toHaveAttribute("accept", /\.pdf/);
  await expect(fileInput(page)).toHaveAttribute("multiple", "");
  await expect(page.getByRole("button", { name: "Choose PDF files" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Choose PDF files" })).toBeVisible();
  await expect(tiles(page)).toHaveCount(0);
  await expect(primary(page)).toBeDisabled();
});

test("AC-2: picking three-pages.pdf reaches ready with 3 thumbnails labeled 1, 2, 3", async ({ page }) => {
  await pickReady(page, "three-pages.pdf");
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.locator("[data-page-index] > span[aria-hidden=true]")).toHaveText(["1", "2", "3"]);
  for (const n of [1, 2, 3]) await expect(page.getByRole("button", { name: new RegExp(`^Page ${n} of 3`) })).toHaveCount(1);
  await expect(primary(page)).toBeEnabled();
});

test("AC-3: dropping three-pages.pdf anywhere on the page reaches the same ready state", async ({ page }) => {
  await dropFixtures(page, ["three-pages.pdf"]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.locator("[data-page-index] > span[aria-hidden=true]")).toHaveText(["1", "2", "3"]);
});

test("AC-4: a drop overlay shows while dragging and hides on dragleave and on drop", async ({ page }) => {
  const overlay = page.getByTestId("drop-overlay");
  await expect(overlay).not.toHaveAttribute("data-active", /.*/);
  await dropFixtures(page, ["three-pages.pdf"], ["dragenter", "dragover"]);
  await expect(overlay).toHaveAttribute("data-active", "true");
  await expect(overlay).toBeVisible();
  await dropFixtures(page, ["three-pages.pdf"], ["dragleave"]);
  await expect(overlay).toBeHidden();
  await dropFixtures(page, ["three-pages.pdf"], ["dragenter", "dragover"]);
  await expect(overlay).toBeVisible();
  await dropFixtures(page, ["three-pages.pdf"], ["drop"]);
  await expect(overlay).toBeHidden();
  await expect(tiles(page)).toHaveCount(3);
});

test("AC-5: no request carries file bytes from pick to download", async ({ page }) => {
  const offending: string[] = [];
  page.context().on("request", (req) => {
    const size = req.postDataBuffer()?.length ?? 0;
    if (size > 10 * 1024 || /upload/i.test(req.url())) offending.push(`${req.method()} ${req.url()} (${size} bytes)`);
  });
  await pickReady(page, "sixty-pages.pdf"); // 26 KB: any upload would exceed the 10 KB bound
  await rotateRight(page).click();
  await run(page);
  const out = await downloadResult(page);
  expect(await pageCountOf(out.bytes)).toBe(60);
  expect(offending).toEqual([]);
});

test("AC-6: a per-file loading indicator shows, with the primary disabled, before the first thumbnail", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as unknown as { __ac6?: { canvases: number; primaryEnabled: boolean } };
    const obs = new MutationObserver(() => {
      if (w.__ac6) return;
      const spinner = Array.from(document.querySelectorAll("[role=status]")).find((el) => el.textContent?.includes("Reading sixty-pages.pdf"));
      if (!spinner) return;
      const btn = document.querySelector<HTMLButtonElement>("[data-testid=primary-action]");
      w.__ac6 = { canvases: document.querySelectorAll("[data-testid=page-tile] canvas").length, primaryEnabled: !!btn && !btn.disabled };
      obs.disconnect();
    });
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await pickReady(page, "sixty-pages.pdf");
  const seen = await page.evaluate(() => (window as unknown as { __ac6?: { canvases: number; primaryEnabled: boolean } }).__ac6);
  expect(seen, "the loading indicator never appeared").toBeTruthy();
  expect(seen!.canvases).toBe(0);
  expect(seen!.primaryEnabled).toBe(false);
});

test("AC-7: two files load; the files view shows 2 cards with thumbnail, name and page count", async ({ page }) => {
  await pickReady(page, "three-pages.pdf", "sixty-pages.pdf");
  await expect(page.getByRole("radiogroup", { name: "View" })).toBeVisible();
  await page.getByRole("radio", { name: "Files" }).click();
  const cards = page.getByTestId("file-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("three-pages.pdf");
  await expect(cards.nth(1)).toContainText("sixty-pages.pdf");
  await expect(page.getByTestId("file-meta").nth(0)).toContainText("3 pages");
  await expect(page.getByTestId("file-meta").nth(1)).toContainText("60 pages");
  await expect(cards.nth(0).locator("canvas")).toHaveCount(1);
  await expect(cards.nth(1).locator("canvas")).toHaveCount(1);
});

test("AC-8: add more files by picker and by drop without removing the first", async ({ page }) => {
  await pickReady(page, "three-pages.pdf");
  await expect(page.getByRole("button", { name: "Add files" })).toBeVisible();
  await pick(page, "pre-rotated.pdf");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await dropFixtures(page, ["sixty-pages.pdf"]);
  await expect(tiles(page)).toHaveCount(66);
  await page.getByRole("radio", { name: "Files" }).click();
  await expect(page.getByTestId("file-card")).toHaveCount(3);
  await expect(page.getByTestId("file-card").nth(0)).toContainText("three-pages.pdf");
});

test("AC-9: removing one of two files leaves the other and the output is a single PDF", async ({ page }) => {
  await pickReady(page, "three-pages.pdf", "sixty-pages.pdf");
  await page.getByRole("button", { name: "Remove sixty-pages.pdf" }).click();
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await run(page);
  const out = await downloadResult(page);
  expect(out.name).toBe("three-pages.pdf");
  expect(Array.from(out.bytes.slice(0, 5))).toEqual(Array.from(Buffer.from("%PDF-")));
  expect(await pageCountOf(out.bytes)).toBe(3);
});

test("AC-10: the thumbnail-size slider changes the tile width", async ({ page }) => {
  test.skip(!isDesktop(test.info().project.name), "the slider is hidden below 640 px by design (spec U-3); checked on desktop");
  await pickReady(page, "three-pages.pdf");
  const before = (await tiles(page).first().boundingBox())!.width;
  await page.getByRole("slider", { name: "Thumbnail size" }).fill("320");
  await expect.poll(async () => (await tiles(page).first().boundingBox())!.width).toBeGreaterThan(before + 100);
  await page.getByRole("button", { name: "Smaller thumbnail size" }).click();
  await expect.poll(async () => Math.round((await tiles(page).first().boundingBox())!.width)).toBe(312);
});

test("AC-11: the sources slot shows no cloud or URL entries", async ({ page }) => {
  const cloud = /dropbox|google drive|onedrive|\bbox\b|url|web address|link/i;
  for (const role of ["button", "menuitem", "option", "link"] as const) {
    const items = page.locator("[data-testid=tool-flow]").getByRole(role, { name: cloud });
    const n = await items.count();
    for (let i = 0; i < n; i++) await expect(items.nth(i)).toBeDisabled();
  }
  await expect(page.locator("[data-testid=tool-flow]")).not.toContainText(/dropbox|google drive|onedrive/i);
});

test("AC-12: notes.txt is rejected with an error naming it; the page stays empty", async ({ page }) => {
  await pick(page, "notes.txt");
  await expect(page.getByRole("alert").filter({ hasText: "notes.txt" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(tiles(page)).toHaveCount(0);
});

test("AC-13: corrupt.pdf shows an error naming it, returns to empty, primary stays disabled", async ({ page }) => {
  await pick(page, "corrupt.pdf");
  await expect(page.getByRole("alert").filter({ hasText: "corrupt.pdf" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(primary(page)).toBeDisabled();
  await expect(tiles(page)).toHaveCount(0);
});

test("AC-14: empty.pdf (0 bytes) behaves like a corrupt file", async ({ page }) => {
  await pick(page, "empty.pdf");
  await expect(page.getByRole("alert").filter({ hasText: "empty.pdf" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(primary(page)).toBeDisabled();
});

test("AC-15: a wrong type next to a PDF shows the error and still loads the PDF", async ({ page }) => {
  await pick(page, "notes.txt", "three-pages.pdf");
  await expect(page.getByRole("alert").filter({ hasText: "notes.txt" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
});

test("AC-16: a file over 100 MB is rejected with the cap, within 2 s, without freezing", async ({ page }, info) => {
  const huge = info.outputPath("huge.pdf");
  await makeSparseFile(huge, 100 * 1024 * 1024 + 1);
  const started = Date.now();
  await fileInput(page).setInputFiles(huge);
  await expect(page.getByRole("alert").filter({ hasText: "huge.pdf is larger than 100 MB" })).toBeVisible({ timeout: 2000 });
  expect(Date.now() - started).toBeLessThan(2000);
  // The tab still answers at once.
  const t0 = Date.now();
  await page.evaluate(() => 1);
  expect(Date.now() - t0).toBeLessThan(500);
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
});

test("AC-17: a 1,001-page file is rejected with the 1,000-page cap", async ({ page }) => {
  await pick(page, "too-many-pages.pdf");
  await expect(page.getByRole("alert").filter({ hasText: "1,000 pages" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "too-many-pages.pdf" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
});

test("AC-18: 21 files load 20 and show the 20-file cap", async ({ page }) => {
  await pick(page, ...Array(21).fill("three-pages.pdf"));
  await expect(page.getByRole("alert").filter({ hasText: "up to 20 files" })).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await page.getByRole("radio", { name: "Files" }).click();
  await expect(page.getByTestId("file-card")).toHaveCount(20);
});

test("AC-19: 60 pages and 4 tasks in a row work with no limit or upgrade message", async ({ page }) => {
  const gate = /upgrade|premium|subscribe|limit reached|tasks? per hour|free (plan|tier)/i;
  await pickReady(page, "sixty-pages.pdf");
  await expect(page.locator("body")).not.toContainText(gate);
  for (let task = 1; task <= 4; task++) {
    await rotateRight(page).click();
    await run(page);
    await expect(page.locator("body")).not.toContainText(gate);
    const out = await downloadResult(page);
    expect(await pageCountOf(out.bytes)).toBe(60);
    if (task < 4) await backToOptions(page);
  }
});

// ---- edge cases (QA role) -----------------------------------------------------

test("Edge: an empty selection (chooser closed with no file) changes nothing", async ({ page }) => {
  await fileInput(page).setInputFiles([]);
  await page.waitForTimeout(200);
  await expect(flow(page)).toHaveAttribute("data-state", "empty");
  await expect(page.locator("[data-testid=tool-flow] [role=alert]")).toHaveCount(0);
  await expect(primary(page)).toBeDisabled();
});

test("Edge: cancel mid-way by removing a file while it is still loading", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "uses the generated 40 MB file; desktop only to keep the run short");
  const large = info.outputPath("large.pdf");
  await makeLargePdf(large);
  await pick(page, "three-pages.pdf", large);
  await page.getByRole("button", { name: "Remove large.pdf" }).click();
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(tiles(page)).toHaveCount(3);
  await page.waitForTimeout(500); // a late parse result for the removed file must not bring it back
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.locator("[data-testid=tool-flow] [role=alert]")).toHaveCount(0);
});

test("Edge: a wrong type renamed to .pdf, mixed with a valid file, is skipped as corrupt", async ({ page }) => {
  const text = await readFile(fx("notes.txt"));
  await fileInput(page).setInputFiles([
    { name: "renamed.pdf", mimeType: "application/pdf", buffer: text },
    { name: "three-pages.pdf", mimeType: "application/pdf", buffer: await readFile(fx("three-pages.pdf")) },
  ]);
  await expect(page.getByRole("alert").filter({ hasText: "renamed.pdf" })).toBeVisible();
  await expect(tiles(page)).toHaveCount(3);
});
