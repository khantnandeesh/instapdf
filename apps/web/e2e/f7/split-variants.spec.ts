/** F7 Split variants: spec docs/specs/f7-split-variants.md, AC-900 onwards. */
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { downloadResult, flow, pick, primary, run, textsOf, unzip } from "../support/flow";

async function open(page: Page, slug: string, ...names: string[]) {
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  if (names.length) await pick(page, ...names);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
}
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 640;

test.describe("Split by bookmarks", () => {
  test("AC-900, AC-901: a file starts at each top-level bookmark and is named after it", async ({ page }) => {
    await open(page, "split-pdf-by-bookmarks", "twelve.pdf");
    await expect(primary(page)).toHaveText("Split into 3 files");
    await expect(page.getByTestId("cut-line")).toHaveCount(2);
    await run(page);
    const files = unzip((await downloadResult(page)).bytes);
    expect(Object.keys(files)).toEqual(["Intro.pdf", "Middle.pdf", "End.pdf"]);
    expect(await textsOf(files["Middle.pdf"])).toEqual(["Twelve 5", "Twelve 6", "Twelve 7", "Twelve 8", "Twelve 9"]);
  });

  test("AC-902: a deeper level splits at its bookmarks and keeps the pages before the first one", async ({ page }) => {
    await open(page, "split-pdf-by-bookmarks", "twelve.pdf");
    await page.getByLabel("Bookmark level").selectOption("2");
    await expect(primary(page)).toHaveText("Split into 2 files");
    await run(page);
    const files = unzip((await downloadResult(page)).bytes);
    expect(Object.keys(files)).toEqual(["twelve-1-5.pdf", "Detail.pdf"]);
  });

  test("AC-903: the title filter keeps only matching bookmarks", async ({ page }) => {
    await open(page, "split-pdf-by-bookmarks", "twelve.pdf");
    if (isPhone(page)) await page.getByRole("button", { name: /More options/ }).click();
    await page.getByLabel("Title contains").locator("visible=true").fill("end");
    if (isPhone(page)) await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    await expect(primary(page)).toHaveText("Split into 2 files");
    await expect(page.getByTestId("cut-line")).toHaveCount(1);
  });

  test("AC-904: a mark can still be moved by hand", async ({ page }) => {
    await open(page, "split-pdf-by-bookmarks", "twelve.pdf");
    await page.getByRole("button", { name: "Split after page 2", exact: true }).click();
    await expect(primary(page)).toHaveText("Split into 4 files");
    // Adding a file keeps the mark that was moved by hand.
    await pick(page, "alpha.pdf");
    await expect(primary(page)).toHaveText("Split into 6 files");
    await expect(page.getByRole("button", { name: "Split after page 2", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  });

  test("AC-905: a file with no bookmarks says so and the button waits", async ({ page }) => {
    await open(page, "split-pdf-by-bookmarks", "three-pages.pdf");
    await expect(page.getByTestId("dock-status")).toHaveText("This PDF has no bookmarks");
    await expect(primary(page)).toBeDisabled();
  });
});

test.describe("Split by size", () => {
  test("AC-910, AC-911: every part stays under the limit, pages in order, none lost", async ({ page }) => {
    await open(page, "split-pdf-by-size", "sixty-pages.pdf");
    await page.getByRole("radio", { name: "KB" }).click();
    await page.getByLabel("Largest file size").fill("20");
    await expect(page.getByTestId("dock-status")).toContainText("files up to 20 KB");
    await run(page);
    const files = Object.entries(unzip((await downloadResult(page)).bytes));
    expect(files.length).toBeGreaterThan(1);
    let pages = 0;
    for (const [name, bytes] of files) {
      expect(bytes.length, name).toBeLessThanOrEqual(20 * 1024);
      pages += (await textsOf(bytes)).length;
    }
    expect(pages).toBe(60);
    // Greedy: each part but the last could not have taken one more page; so at most one part is under half.
    expect(files.filter(([, b]) => b.length < 10 * 1024).length).toBeLessThanOrEqual(1);
  });

  test("AC-912: a file already under the limit stays one file and the result says so", async ({ page }) => {
    await open(page, "split-pdf-by-size", "three-pages.pdf");
    await run(page);
    await expect(page.getByText("three-pages.pdf is already under the limit, so it stays one file.")).toBeVisible();
    expect((await downloadResult(page)).name).toBe("three-pages.pdf");
  });

  test("AC-913: a limit that is not a usable number keeps the button waiting", async ({ page }) => {
    await open(page, "split-pdf-by-size", "three-pages.pdf");
    await page.getByRole("radio", { name: "KB" }).click();
    await page.getByLabel("Largest file size").fill("5");
    await expect(primary(page)).toBeDisabled();
    await expect(page.getByTestId("dock-status")).toHaveText("Enter a size");
  });
});

test.describe("Split in half", () => {
  /** Landscape sheets with a word in each half. */
  async function sheets(labels: [string, string][]) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const [l, r] of labels) {
      const p = doc.addPage([842, 595]);
      p.drawText(l, { x: 100, y: 300, size: 30, font });
      p.drawText(r, { x: 521, y: 300, size: 30, font });
    }
    return { name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
  }
  async function openWith(page: Page, labels: [string, string][]) {
    await page.goto("/split-pdf-in-half");
    await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
    await page.getByTestId("file-input").setInputFiles(await sheets(labels));
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
  }
  const sizes = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => [Math.round(p.getCropBox().width), Math.round(p.getCropBox().height)]);

  test("AC-920: every sheet becomes two pages of half the width", async ({ page }) => {
    await openWith(page, [["L1", "R1"], ["L2", "R2"]]);
    await expect(primary(page)).toHaveText("Split 2 pages in half");
    await run(page);
    const out = await downloadResult(page);
    expect(out.name).toBe("scan.pdf");
    expect(await sizes(out.bytes)).toEqual([[421, 595], [421, 595], [421, 595], [421, 595]]);
  });

  test("AC-922: only the picked pages are cut; the others stay whole", async ({ page }) => {
    await openWith(page, [["Cover", "page"], ["L2", "R2"]]);
    await page.getByRole("button", { name: "Page 2 of 2" }).click();
    await expect(primary(page)).toHaveText("Split 1 page in half");
    await run(page);
    expect(await sizes((await downloadResult(page)).bytes)).toEqual([[842, 595], [421, 595], [421, 595]]);
  });

  test("AC-925: Top / bottom cuts the other way", async ({ page }) => {
    await openWith(page, [["L1", "R1"]]);
    if ((page.viewportSize()?.width ?? 0) < 1024 && !(await page.getByRole("radio", { name: "Top / bottom" }).isVisible())) await page.getByRole("button", { name: /Options/ }).click();
    await page.getByRole("radio", { name: "Top / bottom" }).click();
    await page.keyboard.press("Escape");
    await run(page);
    expect(await sizes((await downloadResult(page)).bytes)).toEqual([[842, 298], [842, 298]]);
  });
});
