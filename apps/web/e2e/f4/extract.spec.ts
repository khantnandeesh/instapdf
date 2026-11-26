/** F4 Extract pages (`/extract-pdf-pages`): spec docs/specs/f4-f5-page-tools.md §3c, §6b, AC-450 to AC-462, AC-544. */
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
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
  pressedPages,
  primary,
  runDownload,
  status,
  textsOf,
  tileButton,
  typeRange,
} from "./support";

const twelve = (n: number) => `Twelve ${n}`;
const tile = (page: import("@playwright/test").Page, n: number, file?: string, total = 12) => tileButton(page, `Page ${n} of ${total}`, file);
const pick = (page: import("@playwright/test").Page, label: "Odd" | "Even" | "Custom") => page.getByRole("radiogroup", { name: "Pick" }).getByRole("radio", { name: label });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("f4-keep")) localStorage.removeItem("berrypdf:extract-pdf-pages-options");
  });
});

test("AC-401, AC-450: twelve.pdf is ready with nothing picked, Custom chosen, the run disabled", async ({ page }) => {
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await expect(page.getByTestId("page-tile")).toHaveCount(12);
  expect(await pressedPages(page)).toEqual([]);
  await expect(pick(page, "Custom")).toHaveAttribute("aria-checked", "true");
  await expect(primary(page)).toBeDisabled();
  await expect(primary(page)).toHaveText("Extract pages");
  await expect(status(page)).toHaveText("Pick the pages to keep");
});

test("AC-402: typed ranges pick tiles (aria-pressed); blur writes the canonical list", async ({ page }) => {
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await typeRange(page, "1-3, 5, 10-");
  await expect.poll(() => pressedPages(page)).toEqual([1, 2, 3, 5, 10, 11, 12]);
  await field(page).blur();
  await expect(field(page)).toHaveValue("1-3, 5, 10-12");
  await typeRange(page, "-2");
  await expect.poll(() => pressedPages(page)).toEqual([1, 2]);
  await expect(primary(page)).toHaveText("Extract 2 pages");
  await expect(status(page)).toHaveText("2 of 12 pages");
});

test("AC-403 (Extract), AC-544: bad items show the error naming them and disable the run; keywords work", async ({ page }) => {
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  const cases: [string, string][] = [
    ["abc", "“abc”: not a page number"],
    ["0", "“0”: pages start at 1"],
    ["13", "“13”: this file has 12 pages"],
    ["5-3", "“5-3”: start is after end"],
    ["2-x", "“2-x”: not a page number"],
    ["lst", "“lst”: not a page number"],
  ];
  for (const [text, message] of cases) {
    await typeRange(page, text);
    await expect(fieldError(page), text).toHaveText(message);
    await expect(field(page)).toHaveAttribute("aria-invalid", "true");
    await expect(primary(page)).toBeDisabled();
  }
  await typeRange(page, "2");
  await expect(fieldError(page)).toHaveCount(0);
  await expect(primary(page)).toBeEnabled();
  // AC-544
  const evens = [2, 4, 6, 8, 10, 12];
  await typeRange(page, "even");
  await expect.poll(() => pressedPages(page)).toEqual(evens);
  await typeRange(page, "EVEN");
  await expect.poll(() => pressedPages(page)).toEqual(evens);
  await typeRange(page, "odd, 12");
  await expect.poll(() => pressedPages(page)).toEqual([1, 3, 5, 7, 9, 11, 12]);
  await typeRange(page, "10-last");
  await expect.poll(() => pressedPages(page)).toEqual([10, 11, 12]);
});

test("AC-404, AC-405, AC-451: clicks, Shift+click and Space pick pages; 2-5, 9 gives twelve.pdf with those 5", async ({ page }) => {
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await tile(page, 2).click();
  await tile(page, 4).click();
  expect(await pressedPages(page)).toEqual([2, 4]);
  await tile(page, 4).click();
  expect(await pressedPages(page)).toEqual([2]);
  await tile(page, 6).click();
  await tile(page, 9).click({ modifiers: ["Shift"] });
  expect(await pressedPages(page)).toEqual([2, 6, 7, 8, 9]);
  await tile(page, 11).click({ modifiers: ["ControlOrMeta"] });
  expect(await pressedPages(page)).toEqual([2, 6, 7, 8, 9, 11]);
  await tile(page, 11).focus();
  await page.keyboard.press("Space");
  expect(await pressedPages(page)).toEqual([2, 6, 7, 8, 9]);
  // AC-405: 2, Shift+5, 9.
  await page.getByRole("button", { name: "Clear selection" }).click();
  await tile(page, 2).click();
  await tile(page, 5).click({ modifiers: ["Shift"] });
  await tile(page, 9).click();
  await expect(field(page)).toHaveValue("2-5, 9");
  await expect(primary(page)).toHaveText("Extract 5 pages");
  await expect(status(page)).toHaveText("5 of 12 pages");
  const out = await runDownload(page);
  expect(out.name).toBe("twelve.pdf");
  expect(await textsOf(out.bytes)).toEqual([2, 3, 4, 5, 9].map(twelve));
});

test("AC-406: Clear selection and Escape in the grid unpick everything and empty the field", async ({ page }) => {
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await typeRange(page, "1-4");
  await expect.poll(() => pressedPages(page)).toEqual([1, 2, 3, 4]);
  await page.getByRole("button", { name: "Clear selection" }).click();
  expect(await pressedPages(page)).toEqual([]);
  await expect(field(page)).toHaveValue("");
  await expect(field(page)).toBeFocused();
  await tile(page, 3).click();
  await tile(page, 3).press("Escape");
  expect(await pressedPages(page)).toEqual([]);
  await expect(field(page)).toHaveValue("");
});

test("AC-452, AC-453, AC-454: Odd and Even pick and fill the field; a click then returns to Custom", async ({ page }) => {
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await pick(page, "Odd").click();
  expect(await pressedPages(page)).toEqual([1, 3, 5, 7, 9, 11]);
  await expect(field(page)).toHaveValue("1, 3, 5, 7, 9, 11");
  let out = await runDownload(page);
  expect(await textsOf(out.bytes)).toEqual([1, 3, 5, 7, 9, 11].map(twelve));
  await page.getByRole("button", { name: "Back to options" }).click();
  await pick(page, "Even").click();
  out = await runDownload(page);
  expect(await textsOf(out.bytes)).toEqual([2, 4, 6, 8, 10, 12].map(twelve));
  await page.getByRole("button", { name: "Back to options" }).click();
  await pick(page, "Odd").click();
  await tile(page, 2).click();
  expect(await pressedPages(page)).toEqual([1, 2, 3, 5, 7, 9, 11]);
  await expect(pick(page, "Custom")).toHaveAttribute("aria-checked", "true");
});

test("AC-455, AC-456: 9, 2-3 runs in document order and reads 2-3, 9 after blur; all 12 by Ctrl/Cmd+A", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await typeRange(page, "9, 2-3", { blur: true });
  await expect(field(page)).toHaveValue("2-3, 9");
  let out = await runDownload(page);
  expect(await textsOf(out.bytes)).toEqual([2, 3, 9].map(twelve));
  await page.getByRole("button", { name: "Back to options" }).click();
  await tile(page, 1).focus();
  await page.keyboard.press("ControlOrMeta+a");
  await expect.poll(() => pressedPages(page)).toHaveLength(12);
  out = await runDownload(page);
  expect(await textsOf(out.bytes)).toHaveLength(12);
});

test("AC-457, AC-458: 5-6, 10 keeps Middle (Detail) and End, not Intro; Remove bookmarks drops them", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await typeRange(page, "5-6, 10");
  let out = await runDownload(page);
  expect(await outlineOf(out.bytes)).toEqual([
    { title: "Middle", page: 1, children: [{ title: "Detail", page: 2, children: [] }] },
    { title: "End", page: 3, children: [] },
  ]);
  await page.getByRole("button", { name: "Back to options" }).click();
  await openMore(page);
  await page.getByRole("switch", { name: "Remove bookmarks" }).check();
  await closeMore(page);
  out = await runDownload(page);
  expect(await outlineOf(out.bytes)).toEqual([]);
});

test("AC-459: pages 2 and 4 of the mixed-sizes file keep their boxes and /Rotate", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "extract-pdf-pages", "mixed-sizes-f4.pdf");
  await typeRange(page, "2, 4");
  const out = await runDownload(page);
  const doc = await loadPlain(out.bytes);
  expect(doc.getPages().map((p) => [p.getMediaBox().width, p.getMediaBox().height, p.getRotation().angle])).toEqual([
    [792, 612, 0],
    [595, 842, 90],
  ]);
  expect(await textsOf(out.bytes)).toEqual(["Mixed 2", "Mixed 4"]);
});

test("AC-407, AC-408, AC-460: two files share the field; a click changes one file; a file with no match is skipped", async ({ page }) => {
  await openReady(page, "extract-pdf-pages", "twelve.pdf", "three-pages.pdf");
  await expect(page.getByRole("radiogroup", { name: "View" }).or(page.getByRole("radio", { name: "Pages", exact: true }))).not.toHaveCount(0);
  await typeRange(page, "1-2");
  await expect.poll(() => pressedPages(page, "twelve.pdf")).toEqual([1, 2]);
  await expect.poll(() => pressedPages(page, "three-pages.pdf")).toEqual([1, 2]);
  // AC-408
  await tile(page, 3, "three-pages.pdf", 3).click();
  expect(await pressedPages(page, "twelve.pdf")).toEqual([1, 2]);
  expect(await pressedPages(page, "three-pages.pdf")).toEqual([1, 2, 3]);
  await expect(field(page)).toHaveValue("");
  await expect(field(page)).toHaveAttribute("placeholder", "Differs per file");
  await typeRange(page, "1");
  await expect.poll(() => pressedPages(page, "twelve.pdf")).toEqual([1]);
  await expect.poll(() => pressedPages(page, "three-pages.pdf")).toEqual([1]);
  if (!isDesktop(test.info().project.name)) return;
  // AC-460
  await typeRange(page, "1-2");
  let out = await runDownload(page);
  expect(out.name).toBe("berrypdf-extract.zip");
  expect(out.entries!.map(([n]) => n)).toEqual(["twelve.pdf", "three-pages.pdf"]);
  expect(await textsOf(out.entries![1][1])).toEqual(["Page 1", "Page 2"]);
  await page.getByRole("button", { name: "Back to options" }).click();
  await typeRange(page, "3-5");
  out = await runDownload(page);
  expect(await textsOf(out.entries![0][1])).toEqual([3, 4, 5].map(twelve));
  expect(await textsOf(out.entries![1][1])).toEqual(["Page 3"]);
  await page.getByRole("button", { name: "Back to options" }).click();
  await typeRange(page, "10-12");
  await expect(page.getByText("three-pages.pdf has none of these pages, so it's skipped.")).toBeVisible();
  out = await runDownload(page);
  expect(out.name).toBe("twelve.pdf");
  expect(await textsOf(out.bytes)).toEqual([10, 11, 12].map(twelve));
});

test("AC-402: with two files, open ranges and keywords stay as typed after blur and each file reads them against its own length", async ({ page }) => {
  await openReady(page, "extract-pdf-pages", "twelve.pdf", "three-pages.pdf");
  await typeRange(page, "2-", { blur: true });
  await expect(field(page)).toHaveValue("2-");
  await expect.poll(() => pressedPages(page, "twelve.pdf")).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  await expect.poll(() => pressedPages(page, "three-pages.pdf")).toEqual([2, 3]);
  await typeRange(page, "1, last", { blur: true });
  await expect(field(page)).toHaveValue("1, last");
  await expect.poll(() => pressedPages(page, "twelve.pdf")).toEqual([1, 12]);
  await expect.poll(() => pressedPages(page, "three-pages.pdf")).toEqual([1, 3]);
  await typeRange(page, "even", { blur: true });
  await expect(field(page)).toHaveValue("even");
  await expect.poll(() => pressedPages(page, "three-pages.pdf")).toEqual([2]);
});

test("AC-461: page 1 of sixty-pages.pdf is a fraction of the input", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  const input = (await readFile(fx("sixty-pages.pdf"))).length;
  await openReady(page, "extract-pdf-pages", "sixty-pages.pdf");
  await typeRange(page, "1");
  const out = await runDownload(page);
  expect(out.bytes.length).toBeLessThan(input * 0.25);
});

test("AC-462, AC-409 (Extract): the pattern {name}-extract names the output and is remembered", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output check, desktop");
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await openMore(page);
  await expect(page.getByRole("switch", { name: "Remove bookmarks" })).not.toBeChecked();
  await page.getByRole("textbox", { name: "Name pattern" }).fill("{name}-extract");
  await closeMore(page);
  await typeRange(page, "1");
  const out = await runDownload(page);
  expect(out.name).toBe("twelve-extract.pdf");
  await page.evaluate(() => sessionStorage.setItem("f4-keep", "1"));
  await openReady(page, "extract-pdf-pages", "twelve.pdf");
  await openMore(page);
  await expect(page.getByRole("textbox", { name: "Name pattern" })).toHaveValue("{name}-extract");
});
