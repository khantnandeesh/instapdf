/**
 * F16: floating editor chrome never covers page content at rest. The top bar and the phone page
 * chip (grid icon + "1/1") float over the canvas; the canvas starts its pages below both, so a first
 * line that runs to the right edge stays uncovered (eval-fixes-3/4: "END" hid under the chip).
 */
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

type Box = { x: number; y: number; width: number; height: number };

/** One Letter page whose first line runs from the left margin to the right margin, ending in "END". */
async function fullWidthLine(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const size = 12;
  const [left, right] = [36, 612 - 36];
  let first = "Quarterly invoice summary for the whole region";
  while (font.widthOfTextAtSize(`${first} x END`, size) < right - left) first += " x";
  page.drawText(`${first} END`, { x: left, y: 792 - 44, size, font });
  for (let i = 1; i < 12; i++) page.drawText(`Line ${i + 1}: total due 450 on time`, { x: left, y: 792 - 44 - i * 26, size, font });
  return Buffer.from(await doc.save());
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function open(page: Page) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles({ name: "full-width-line.pdf", mimeType: "application/pdf", buffer: await fullWidthLine() });
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 20_000 });
  await expect(page.getByTestId("line").first()).toBeAttached({ timeout: 20_000 });
}

for (const width of [320, 390, 1280]) {
  test(`at ${width}px the page chip and the top bar leave the first line and the text layer clear`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await open(page);
    const chip = page.getByTestId("page-chip");
    // Phones and tablets show the chip; from 1024px the page number lives in the bottom view pill.
    if (width < 1024) await expect(chip).toBeVisible();
    else await expect(chip).toHaveCount(0);

    const first = page.getByTestId("line").first();
    await expect(first).toHaveAttribute("data-text", /END$/);
    const layer = (await page.getByTestId("page-1").locator(".ed-lines").boundingBox())!;
    const line = (await first.boundingBox())!;
    // The first line really runs to the right edge: it ends past where the chip would sit.
    expect(line.x + line.width).toBeGreaterThan(layer.x + layer.width * 0.85);

    const top = (await page.locator('[data-region="top"]').boundingBox())!;
    const floating: [string, Box][] = [["top bar", top]];
    if (width < 1024) floating.push(["page chip", (await chip.boundingBox())!]);
    for (const [name, b] of floating) {
      expect(overlaps(b, layer), `${name} ${JSON.stringify(b)} covers the text layer ${JSON.stringify(layer)}`).toBe(false);
      expect(overlaps(b, line), `${name} covers the first line`).toBe(false);
    }
    // No sideways scroll came with the reserved band.
    expect(await page.getByTestId("canvas").evaluate((c) => c.scrollWidth <= c.clientWidth + 1)).toBe(true);
  });
}
