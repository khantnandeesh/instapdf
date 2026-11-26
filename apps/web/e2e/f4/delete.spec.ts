/** F4 Delete pages (`/delete-pdf-pages`): spec docs/specs/f4-f5-page-tools.md §3d, §6c, AC-465 to AC-475, AC-543; AC-404, AC-406 and AC-409 on Delete. */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  closeMore,
  field,
  fieldError,
  fx,
  isDesktop,
  loadPlain,
  openMore,
  openReady,
  outlineOf,
  pageCountOf,
  pressedPages,
  primary,
  runDownload,
  status,
  textsOf,
  tileButton,
  typeRange,
} from "./support";

const twelve = (n: number) => `Twelve ${n}`;
const remove = (page: Page, n: number, file?: string) => tileButton(page, `Remove page ${n}`, file);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("f4-keep")) localStorage.removeItem("berrypdf:delete-pdf-pages-options");
  });
});

test("AC-401, AC-465, AC-466: Remove page 2 marks it in place; the run drops it; a second press brings it back", async ({ page }) => {
  await openReady(page, "delete-pdf-pages", "twelve.pdf");
  await expect(page.getByTestId("page-tile")).toHaveCount(12);
  for (let n = 1; n <= 12; n++) await expect(remove(page, n)).toHaveAttribute("aria-pressed", "false");
  await expect(primary(page)).toBeDisabled();
  await expect(status(page)).toHaveText("Pick pages to delete");
  await remove(page, 2).click();
  await expect(remove(page, 2)).toHaveAttribute("aria-pressed", "true");
  await expect(remove(page, 2)).toBeVisible();
  await expect(page.locator('[data-page-index="1"] [data-testid=marked-badge]')).toBeVisible();
  await expect(status(page)).toHaveText("11 of 12 pages kept");
  await expect(primary(page)).toHaveText("Delete 1 page");
  // AC-466
  await remove(page, 2).click();
  await expect(remove(page, 2)).toHaveAttribute("aria-pressed", "false");
  await expect(primary(page)).toBeDisabled();
  await remove(page, 2).click();
  const out = await runDownload(page);
  expect(out.name).toBe("twelve.pdf");
  const texts = await textsOf(out.bytes);
  expect(texts).toHaveLength(11);
  expect(texts).not.toContain(twelve(2));
});

test("AC-467, AC-468: 1-3, 10- marks six pages and keeps 4-9; marking 2, 4, 6 writes 2, 4, 6", async ({ page }) => {
  await openReady(page, "delete-pdf-pages", "twelve.pdf");
  await remove(page, 2).click();
  await remove(page, 4).click();
  await remove(page, 6).click();
  await expect(field(page)).toHaveValue("2, 4, 6");
  await expect(primary(page)).toHaveText("Delete 3 pages");
  await expect(status(page)).toHaveText("9 of 12 pages kept");
  await typeRange(page, "1-3, 10-");
  await expect.poll(() => pressedPages(page)).toEqual([1, 2, 3, 10, 11, 12]);
  const out = await runDownload(page);
  expect(await textsOf(out.bytes)).toEqual([4, 5, 6, 7, 8, 9].map(twelve));
});

test("AC-469, AC-403 (Delete): 1- marks everything and says keep one page; bad items name themselves", async ({ page }) => {
  await openReady(page, "delete-pdf-pages", "twelve.pdf");
  await typeRange(page, "1-");
  await expect.poll(() => pressedPages(page)).toHaveLength(12);
  await expect(primary(page)).toBeDisabled();
  await expect(fieldError(page)).toHaveText("Keep at least one page");
  for (const [text, message] of [
    ["abc", "“abc”: not a page number"],
    ["0", "“0”: pages start at 1"],
    ["13", "“13”: this file has 12 pages"],
    ["5-3", "“5-3”: start is after end"],
    ["2-x", "“2-x”: not a page number"],
  ]) {
    await typeRange(page, text);
    await expect(fieldError(page), text).toHaveText(message);
    await expect(field(page)).toHaveAttribute("aria-invalid", "true");
    await expect(primary(page)).toBeDisabled();
  }
  await typeRange(page, "2");
  await expect(fieldError(page)).toHaveCount(0);
  await expect(primary(page)).toBeEnabled();
});

test("AC-470: Shift+click extends the marks; Delete and Backspace toggle; the live region says so", async ({ page }) => {
  await openReady(page, "delete-pdf-pages", "twelve.pdf");
  await remove(page, 6).click();
  await remove(page, 9).click({ modifiers: ["Shift"] });
  expect(await pressedPages(page)).toEqual([6, 7, 8, 9]);
  await remove(page, 11).focus();
  await page.keyboard.press("Delete");
  await expect(remove(page, 11)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[aria-live=polite]").filter({ hasText: "Page 11 marked. 7 of 12 pages kept" })).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(remove(page, 11)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[aria-live=polite]").filter({ hasText: "Page 11 kept" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  expect(await pressedPages(page)).toEqual([]);
});

test("AC-404, AC-406 (Delete): clicks on the tile mark and unmark, Shift+click adds a run, Ctrl/Cmd+click and Space toggle; Clear empties all", async ({ page }) => {
  await openReady(page, "delete-pdf-pages", "twelve.pdf");
  // The toggle covers the whole tile (§3d: a click anywhere on it marks the page).
  await remove(page, 2).click();
  await remove(page, 4).click();
  expect(await pressedPages(page)).toEqual([2, 4]);
  await remove(page, 4).click();
  expect(await pressedPages(page)).toEqual([2]);
  await remove(page, 6).click();
  await remove(page, 9).click({ modifiers: ["Shift"] });
  expect(await pressedPages(page)).toEqual([2, 6, 7, 8, 9]);
  await remove(page, 11).click({ modifiers: ["ControlOrMeta"] });
  expect(await pressedPages(page)).toEqual([2, 6, 7, 8, 9, 11]);
  await remove(page, 11).focus();
  await page.keyboard.press("Space");
  expect(await pressedPages(page)).toEqual([2, 6, 7, 8, 9]);
  await expect(field(page)).toHaveValue("2, 6-9");
  // AC-406
  await page.getByRole("button", { name: "Clear selection" }).click();
  expect(await pressedPages(page)).toEqual([]);
  await expect(field(page)).toHaveValue("");
  await expect(primary(page)).toBeDisabled();
});

test("AC-409 (Delete): Remove bookmarks is under More options, off on a first visit, and remembered", async ({ page }) => {
  await openReady(page, "delete-pdf-pages", "twelve.pdf");
  await openMore(page);
  const toggle = page.getByRole("switch", { name: "Remove bookmarks" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await closeMore(page);
  await page.evaluate(() => sessionStorage.setItem("f4-keep", "1"));
  await openReady(page, "delete-pdf-pages", "twelve.pdf");
  await openMore(page);
  await expect(page.getByRole("switch", { name: "Remove bookmarks" })).toBeChecked();
});

test("AC-471, AC-472: deleting page 5 moves Detail up; Remove bookmarks drops the outline", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "delete-pdf-pages", "twelve.pdf");
  await typeRange(page, "5");
  let out = await runDownload(page);
  expect(await outlineOf(out.bytes)).toEqual([
    { title: "Intro", page: 1, children: [] },
    { title: "Detail", page: 5, children: [] },
    { title: "End", page: 9, children: [] },
  ]);
  await page.getByRole("button", { name: "Back to options" }).click();
  await openMore(page);
  await page.getByRole("switch", { name: "Remove bookmarks" }).check();
  await closeMore(page);
  out = await runDownload(page);
  expect(await outlineOf(out.bytes)).toEqual([]);
});

test("AC-473: deleting page 1 of the mixed-sizes file keeps the others' boxes and /Rotate", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "delete-pdf-pages", "mixed-sizes-f4.pdf");
  await remove(page, 1).click();
  const out = await runDownload(page);
  const doc = await loadPlain(out.bytes);
  expect(doc.getPages().map((p) => [p.getMediaBox().width, p.getMediaBox().height, p.getRotation().angle])).toEqual([
    [792, 612, 0],
    [420, 595, 0],
    [595, 842, 90],
  ]);
  expect(await textsOf(out.bytes)).toEqual(["Mixed 2", "Mixed 3", "Mixed 4"]);
});

test("AC-474, AC-543: two files: 1 gives berrypdf-delete.zip; 1-3 names three-pages.pdf; last takes each file's last page", async ({ page }) => {
  await openReady(page, "delete-pdf-pages", "twelve.pdf", "three-pages.pdf");
  await typeRange(page, "1-3");
  await expect(primary(page)).toBeDisabled();
  await expect(fieldError(page)).toHaveText("Keep at least one page of three-pages.pdf");
  // AC-543
  await typeRange(page, "last", { blur: true });
  await expect.poll(() => pressedPages(page, "twelve.pdf")).toEqual([12]);
  await expect.poll(() => pressedPages(page, "three-pages.pdf")).toEqual([3]);
  await expect(field(page)).toHaveValue("last");
  if (!isDesktop(test.info().project.name)) return;
  let out = await runDownload(page);
  expect(out.entries!.map(([n]) => n)).toEqual(["twelve.pdf", "three-pages.pdf"]);
  expect(await textsOf(out.entries![0][1])).not.toContain(twelve(12));
  expect(await pageCountOf(out.entries![0][1])).toBe(11);
  expect(await textsOf(out.entries![1][1])).toEqual(["Page 1", "Page 2"]);
  await page.getByRole("button", { name: "Back to options" }).click();
  await typeRange(page, "1");
  out = await runDownload(page);
  expect(out.name).toBe("berrypdf-delete.zip");
  expect(await pageCountOf(out.entries![0][1])).toBe(11);
  expect(await pageCountOf(out.entries![1][1])).toBe(2);
});

test("AC-410: big-250.pdf loads with no limit message; removing page 1 gives 249 pages from Big 2", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "delete-pdf-pages", "big-250.pdf");
  await expect(page.getByTestId("page-tile")).toHaveCount(250);
  await expect(page.getByTestId("tool-flow").getByText(/limit|upgrade/i)).toHaveCount(0);
  await remove(page, 1).click();
  const out = await runDownload(page);
  const texts = await textsOf(out.bytes);
  expect(texts).toHaveLength(249);
  expect(texts[0]).toBe("Big 2");
});

test("AC-475: deleting pages 2-60 of sixty-pages.pdf leaves a fraction of the input", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  const input = (await readFile(fx("sixty-pages.pdf"))).length;
  await openReady(page, "delete-pdf-pages", "sixty-pages.pdf");
  await typeRange(page, "2-60");
  const out = await runDownload(page);
  expect(out.bytes.length).toBeLessThan(input * 0.25);
});
