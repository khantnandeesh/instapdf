import { expect, test } from "@playwright/test";
import { PDFDocument } from "@cantoo/pdf-lib";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { downloadResult, fx, primary, run } from "../support/flow";

test.describe("Repair", () => {
  test("AC-1460: a file whose end is missing comes back whole, with a sound index", async ({ page }) => {
    await page.goto("/repair-pdf");
    await page.getByTestId("file-input").setInputFiles(fx("cut-short.pdf"));
    await expect(primary(page)).toBeEnabled();
    await expectNoSeriousAxeViolations(page, "Repair, loaded");
    await run(page);
    const out = await downloadResult(page);
    expect(out.name).toBe("cut-short.pdf");
    expect(new TextDecoder("latin1").decode(out.bytes.subarray(out.bytes.length - 40))).toMatch(/startxref\s+\d+\s+%%EOF\s*$/);
    expect((await PDFDocument.load(out.bytes, { updateMetadata: false })).getPageCount()).toBe(12);
  });

  test("AC-1461: a file nothing can open is still taken, shown as damaged, and told plainly when nothing is left in it", async ({ page }) => {
    await page.goto("/repair-pdf");
    await page.getByTestId("file-input").setInputFiles(fx("no-pages.pdf"));
    await expect(page.getByText("no-pages.pdf is damaged. It can still be repaired.")).toBeVisible();
    await expect(primary(page)).toBeEnabled();
    await primary(page).click();
    await expect(page.getByText("no-pages.pdf has too little left to repair: no page could be read from it.")).toBeVisible();
    // Every other tool still turns the file away.
    await page.goto("/flatten-pdf");
    await page.getByTestId("file-input").setInputFiles(fx("no-pages.pdf"));
    await expect(page.getByText("no-pages.pdf couldn't be opened. It may be damaged or not really a PDF.")).toBeVisible();
  });
});
