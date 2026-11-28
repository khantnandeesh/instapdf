import { expect, test } from "@playwright/test";
import { PDFArray, PDFDocument, decodePDFRawStream, type PDFRawStream } from "@cantoo/pdf-lib";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { downloadResult, fx, primary, run } from "../support/flow";

/** The matrix the page's content is drawn through, when it was turned. */
async function turnOf(bytes: Uint8Array, index: number) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const contents = doc.getPage(index).node.Contents();
  const first = contents instanceof PDFArray ? doc.context.lookup(contents.get(0)) : contents;
  const text = new TextDecoder("latin1").decode(decodePDFRawStream(first as PDFRawStream).decode());
  const m = /^q ([-\d.]+) ([-\d.]+) [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ cm/.exec(text);
  // Degrees clockwise as seen: the matrix holds the same angle the other way.
  return m ? (-Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI : 0;
}

test.describe("Deskew", () => {
  test("AC-1520: tilted pages are found, shown straightened, and turned in the file; the straight page is left alone", async ({ page }) => {
    await page.goto("/deskew-pdf");
    await page.getByTestId("file-input").setInputFiles(fx("tilted.pdf"));
    await expect(page.getByText("3 pages to straighten")).toBeVisible();
    const tiles = page.locator("[data-page-index]");
    await expect(tiles.nth(0)).toContainText(/−(2\.9|3\.0|3\.1)°/);
    await expect(tiles.nth(1)).toContainText(/\+1\.[456]°/);
    await expectNoSeriousAxeViolations(page, "Deskew, loaded");
    await run(page);
    const out = await downloadResult(page);
    expect(out.name).toBe("tilted.pdf");
    expect(Math.abs((await turnOf(out.bytes, 0)) + 3)).toBeLessThanOrEqual(0.15);
    expect(Math.abs((await turnOf(out.bytes, 1)) - 1.5)).toBeLessThanOrEqual(0.15);
    expect(await turnOf(out.bytes, 2)).toBe(0);
    expect(Math.abs((await turnOf(out.bytes, 3)) + 0.6)).toBeLessThanOrEqual(0.15);
  });

  test("AC-1521: a page is set by hand in the dialog, a tenth of a degree at a time, and can go back to the detected turn", async ({ page }) => {
    await page.goto("/deskew-pdf");
    await page.getByTestId("file-input").setInputFiles(fx("tilted.pdf"));
    await expect(page.getByText("3 pages to straighten")).toBeVisible();
    await page.locator("[data-page-index='2'] [data-tile-button]").click();
    const dialog = page.getByRole("dialog", { name: "Straighten this page" });
    await expect(dialog.getByTestId("turn-value")).toHaveText("0.0°");
    await dialog.getByRole("button", { name: "Larger turn" }).click();
    await dialog.getByRole("button", { name: "Larger turn" }).click();
    await expect(dialog.getByTestId("turn-value")).toHaveText("+0.2°");
    await expect(dialog.getByTestId("straighten-frame")).toHaveAttribute("data-turn", "0.2");
    await expectNoSeriousAxeViolations(page, "Deskew, dialog");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("4 pages to straighten")).toBeVisible();
    await page.locator("[data-page-index='2'] [data-tile-button]").click();
    await dialog.getByTestId("use-detected").click();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("3 pages to straighten")).toBeVisible();
  });

  test("AC-1522: slight tilts can be skipped; a file with nothing to straighten says so", async ({ page }) => {
    await page.goto("/deskew-pdf");
    await page.getByTestId("file-input").setInputFiles(fx("tilted.pdf"));
    await expect(page.getByText("3 pages to straighten")).toBeVisible();
    // Page 4 is tilted by 0.6°: a slight tilt, left alone once the option is on.
    await page.getByRole("switch", { name: /Skip slight tilts/ }).check({ force: true });
    await expect(page.getByText("2 pages to straighten")).toBeVisible();
    await expect(page.locator("[data-page-index='3']")).not.toContainText("°");
    await page.goto("/deskew-pdf");
    await page.getByTestId("file-input").setInputFiles(fx("twelve.pdf"));
    await expect(page.getByText("Every page is straight").first()).toBeVisible();
    await expect(primary(page)).toBeDisabled();
  });
});
