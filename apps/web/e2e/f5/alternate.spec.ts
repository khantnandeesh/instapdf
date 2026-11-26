/** F5 Alternate & mix (`/alternate-mix-pdf`). Spec: docs/specs/f4-f5-page-tools.md §3g, §7 (AC-520 to AC-535), I-9, P-5. */
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { outlineOf } from "../../src/lib/pdf/page-tool-fixtures";
import { dragTo, downloadResult, f5fx, flow, label, live, open, pickF5, primary, run, showFiles, showPages, textsOf, tileLabels } from "./support";

const cardOf = (page: Page, name: string) => page.getByTestId("file-card").filter({ has: page.getByTestId("file-name").getByText(name, { exact: true }) });
const perTurn = (page: Page, name: string) => page.getByRole("textbox", { name: `Pages per turn from ${name}` });
const repeat = (page: Page, name: string) => page.getByRole("switch", { name: `Repeat ${name}` });
const words = async (bytes: Uint8Array) => (await textsOf(bytes)).map(label);
const range = (prefix: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix} ${from + i}`);
async function setPerTurn(page: Page, name: string, value: string) {
  await perTurn(page, name).fill(value);
  await perTurn(page, name).blur();
}
async function runWords(page: Page) {
  await run(page);
  const out = await downloadResult(page);
  return { out, words: await words(out.bytes) };
}

test.beforeEach(async ({ page }) => {
  await open(page, "alternate-mix-pdf");
});

test("AC-520: odd then even give two cards with name, 5 pages, Normal and 1 per turn, no Repeat", async ({ page }) => {
  await pickF5(page, "odd.pdf", "even.pdf");
  await expect(page.getByTestId("file-name")).toHaveText(["odd.pdf", "even.pdf"]);
  await expect(page.getByTestId("file-meta")).toHaveText(["5 pages", "5 pages"]);
  for (const name of ["odd.pdf", "even.pdf"]) {
    const card = cardOf(page, name);
    await expect(card.locator("[data-card-box] canvas, [data-card-box] img").first()).toBeVisible();
    await expect(card.getByRole("radio", { name: "Normal" })).toHaveAttribute("aria-checked", "true");
    await expect(perTurn(page, name)).toHaveValue("1");
  }
  await expect(page.getByRole("switch", { name: /^Repeat/ })).toHaveCount(0);
  await expect(primary(page)).toHaveText("Mix PDFs");
  await expect(page.getByTestId("dock-status")).toHaveText("10 pages · 2 files");
});

test("AC-521: defaults give odd_mixed.pdf, Page 1 … Page 10", async ({ page }) => {
  await pickF5(page, "odd.pdf", "even.pdf");
  const { out, words: w } = await runWords(page);
  expect(out.name).toBe("odd_mixed.pdf");
  expect(w).toEqual(range("Page", 1, 10));
});

test("AC-522: Reverse on the second card puts even-reversed back in order", async ({ page }) => {
  await pickF5(page, "odd.pdf", "even-reversed.pdf");
  await cardOf(page, "even-reversed.pdf").getByRole("radio", { name: "Reverse" }).click();
  await expect(live(page)).toHaveText("even-reversed.pdf: reverse order");
  expect((await runWords(page)).words).toEqual(range("Page", 1, 10));
});

test("AC-523: 3 per turn from twelve, 1 from three-pages", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "three-pages.pdf");
  await setPerTurn(page, "twelve.pdf", "3");
  expect((await runWords(page)).words).toEqual([...range("Twelve", 1, 3), "Page 1", ...range("Twelve", 4, 6), "Page 2", ...range("Twelve", 7, 9), "Page 3", ...range("Twelve", 10, 12)]);
});

test("AC-524: a shorter file runs out and the rest follows", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "short.pdf");
  expect((await runWords(page)).words).toEqual(["Twelve 1", "Short 1", "Twelve 2", "Short 2", ...range("Twelve", 3, 12)]);
});

test("AC-525, AC-526: a one-page file repeats between turns (on by default); off, it goes in once", async ({ page }) => {
  await pickF5(page, "twelve.pdf", "separator.pdf");
  await expect(repeat(page, "separator.pdf")).toBeChecked();
  await expect(repeat(page, "twelve.pdf")).toHaveCount(0);
  await setPerTurn(page, "twelve.pdf", "4");
  expect((await runWords(page)).words).toEqual([...range("Twelve", 1, 4), "Separator", ...range("Twelve", 5, 8), "Separator", ...range("Twelve", 9, 12)]);
  await page.getByRole("button", { name: "Back to options" }).click();
  await repeat(page, "separator.pdf").uncheck();
  expect((await runWords(page)).words).toEqual([...range("Twelve", 1, 4), "Separator", ...range("Twelve", 5, 12)]);
});

test("AC-527: the separator first leads every turn", async ({ page }) => {
  await pickF5(page, "separator.pdf", "twelve.pdf");
  await setPerTurn(page, "twelve.pdf", "4");
  expect((await runWords(page)).words).toEqual(["Separator", ...range("Twelve", 1, 4), "Separator", ...range("Twelve", 5, 8), "Separator", ...range("Twelve", 9, 12)]);
});

test("AC-528: moving even in front of odd (drag, or Alt+ArrowUp) swaps the turns", async ({ page }, info) => {
  await pickF5(page, "odd.pdf", "even.pdf");
  if (info.project.name === "desktop") {
    await dragTo(page, '[data-testid=file-card]:has-text("even.pdf") [data-card-box]', '[data-testid=file-card]:has-text("odd.pdf") [data-card-box]', "before");
  } else {
    await cardOf(page, "even.pdf").getByTestId("card-main").focus();
    await page.keyboard.press("Alt+ArrowUp");
  }
  await expect(page.getByTestId("file-name")).toHaveText(["even.pdf", "odd.pdf"]);
  expect((await runWords(page)).words).toEqual(["Page 2", "Page 1", "Page 4", "Page 3", "Page 6", "Page 5", "Page 8", "Page 7", "Page 10", "Page 9"]);
});

test("AC-528: Alt+ArrowUp on the focused even card moves it and says so", async ({ page }) => {
  await pickF5(page, "odd.pdf", "even.pdf");
  await cardOf(page, "even.pdf").getByTestId("card-main").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(page.getByTestId("file-name")).toHaveText(["even.pdf", "odd.pdf"]);
  await expect(live(page)).toContainText("even.pdf");
});

test("AC-529: Sort by name A to Z and Z to A", async ({ page }) => {
  await pickF5(page, "odd.pdf", "even.pdf");
  await page.getByTestId("sort-menu").click();
  await page.getByRole("menuitem", { name: "Name A to Z" }).click();
  await expect(page.getByTestId("file-name")).toHaveText(["even.pdf", "odd.pdf"]);
  await page.getByTestId("sort-menu").click();
  await page.getByRole("menuitem", { name: "Name Z to A" }).click();
  await expect(page.getByTestId("file-name")).toHaveText(["odd.pdf", "even.pdf"]);
});

test("AC-530: the Pages view shows the result order, read-only, and follows the settings", async ({ page }) => {
  await pickF5(page, "odd.pdf", "even.pdf");
  await showPages(page);
  expect(await tileLabels(page)).toEqual(["A1", "B1", "A2", "B2", "A3", "B3", "A4", "B4", "A5", "B5"]);
  await expect(page.getByTestId("page-grid").getByTestId("tile-more")).toHaveCount(0);
  await expect(page.getByTestId("page-grid").getByTestId("insert-point")).toHaveCount(0);
  await expect(page.getByTestId("page-grid").getByTestId("add-tile")).toHaveCount(0);
  await expect(page.getByTestId("page-grid").getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await expect(page.getByTestId("page-grid").locator("[draggable=true], [data-drag-handle]")).toHaveCount(0);
  await showFiles(page);
  await setPerTurn(page, "odd.pdf", "2");
  await showPages(page);
  expect(await tileLabels(page)).toEqual(["A1", "A2", "B1", "A3", "A4", "B2", "A5", "B3", "B4", "B5"]);
});

test("AC-531: one file disables the primary and asks for another; a second enables it", async ({ page }) => {
  await pickF5(page, "odd.pdf");
  await expect(primary(page)).toBeDisabled();
  await expect(page.getByTestId("dock-status")).toHaveText("Add one more file to mix");
  await page.getByTestId("file-input").setInputFiles([await f5fx("even.pdf")]);
  await expect(page.getByTestId("file-card")).toHaveCount(2);
  await expect(primary(page)).toBeEnabled();
});

test("P-11 #11: one file offers Organize, which opens with that file", async ({ page }) => {
  await pickF5(page, "duplex-scan.pdf");
  const notice = page.getByTestId("notice").filter({ hasText: "One file with all fronts, then all backs?" });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Open in Organize" }).click();
  await page.waitForURL(/\/organize-pdf$/);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("page-tile")).toHaveCount(6);
});

test("AC-532: 0, x, empty and 1.5 show an inline error and disable the primary; 99 is fine", async ({ page }) => {
  await pickF5(page, "odd.pdf", "even.pdf");
  for (const bad of ["0", "x", "", "1.5"]) {
    await setPerTurn(page, "odd.pdf", bad);
    await expect(cardOf(page, "odd.pdf").getByTestId("field-error")).toHaveText("Use a whole number from 1");
    await expect(perTurn(page, "odd.pdf")).toHaveAttribute("aria-invalid", "true");
    await expect(primary(page)).toBeDisabled();
  }
  await setPerTurn(page, "odd.pdf", "99");
  await expect(cardOf(page, "odd.pdf").getByTestId("field-error")).toHaveCount(0);
  await expect(primary(page)).toBeEnabled();
});

test("NumberStepper: arrows and −/+ change the count; − stops at 1", async ({ page }) => {
  await pickF5(page, "odd.pdf", "even.pdf");
  const field = perTurn(page, "odd.pdf");
  await field.focus();
  await page.keyboard.press("ArrowUp");
  await expect(field).toHaveValue("2");
  await page.getByRole("button", { name: "Fewer pages per turn from odd.pdf" }).click();
  await expect(field).toHaveValue("1");
  await expect(page.getByRole("button", { name: "Fewer pages per turn from odd.pdf" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "More pages per turn from odd.pdf" }).click();
  await expect(field).toHaveValue("2");
});

test("AC-533: three files, one each", async ({ page }) => {
  await pickF5(page, "odd.pdf", "even.pdf", "short.pdf");
  expect((await runWords(page)).words).toEqual(["Page 1", "Page 2", "Short 1", "Page 3", "Page 4", "Short 2", "Page 5", "Page 6", "Page 7", "Page 8", "Page 9", "Page 10"]);
});

test("AC-534: page sizes and rotation are kept; no outline", async ({ page }) => {
  await pickF5(page, "mixed-sizes-4.pdf", "short.pdf");
  await run(page);
  const out = await downloadResult(page);
  const doc = await PDFDocument.load(out.bytes);
  const box = (i: number) => {
    const p = doc.getPage(i);
    const { width, height } = p.getMediaBox();
    return [Math.round(width), Math.round(height), p.getRotation().angle];
  };
  expect([box(0), box(2), box(4), box(5)]).toEqual([
    [595, 842, 0],
    [792, 612, 0],
    [420, 595, 0],
    [595, 842, 90],
  ]);
  expect(await outlineOf(out.bytes)).toEqual([]);
});

test("AC-535: an image card repeats by default", async ({ page }) => {
  await pickF5(page, "charlie.png", "twelve.pdf");
  await expect(repeat(page, "charlie.png")).toBeChecked();
  await setPerTurn(page, "twelve.pdf", "4");
  const { out, words: w } = await runWords(page);
  expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(15);
  expect(w).toEqual(["blank", ...range("Twelve", 1, 4), "blank", ...range("Twelve", 5, 8), "blank", ...range("Twelve", 9, 12)]);
});

test("AC-481: owner-restricted + short give 5 pages that open without a password", async ({ page }) => {
  await pickF5(page, "owner-restricted.pdf", "short.pdf");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await run(page);
  const doc = await PDFDocument.load((await downloadResult(page)).bytes);
  expect(doc.isEncrypted).toBe(false);
  expect(doc.getPageCount()).toBe(5);
});

test("P-3: empty state is the drop card and the bar, no side panel; no options after files either", async ({ page }) => {
  await expect(page.locator("[data-ip-dock]")).toHaveAttribute("data-ip-dock", "bar");
  await pickF5(page, "odd.pdf", "even.pdf");
  await expect(page.getByTestId("options-button")).toHaveCount(0);
  await expect(page.getByTestId("history")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
