/**
 * F16: floating editor chrome never covers page content at rest (and on a phone, "go to page" and the
 * owner and restore notices stay clear of the top bar and the page chip). The top bar and the phone page
 * chip (grid icon + "1/1") float over the canvas; the canvas starts its pages below both, so a first
 * line that runs to the right edge stays uncovered (eval-fixes-3/4: "END" hid under the chip).
 */
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

type Box = { x: number; y: number; width: number; height: number };

/** Built once per page count: the same bytes each time, so reopening is the same file (its saved session). */
const built = new Map<number, Promise<Buffer>>();
const fullWidthLine = (pages = 1) => built.get(pages) ?? (built.set(pages, makeFullWidthLine(pages)), built.get(pages)!);

/** Letter pages whose first line runs from the left margin to the right margin, ending in "END". */
async function makeFullWidthLine(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 12;
  const [left, right] = [36, 612 - 36];
  let first = "Quarterly invoice summary for the whole region";
  while (font.widthOfTextAtSize(`${first} x END`, size) < right - left) first += " x";
  for (let n = 1; n <= pages; n++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${first} END`, { x: left, y: 792 - 44, size, font });
    for (let i = 1; i < 12; i++) page.drawText(`Page ${n} line ${i + 1}: total due 450 on time`, { x: left, y: 792 - 44 - i * 26, size, font });
  }
  return Buffer.from(await doc.save());
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function open(page: Page, pages = 1) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles({ name: `full-width-line-${pages}p.pdf`, mimeType: "application/pdf", buffer: await fullWidthLine(pages) });
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

/** The lowest edge of the chrome that floats at the top on a phone: the top bar and the page chip. */
async function topChromeBottom(page: Page) {
  const top = (await page.locator('[data-region="top"]').boundingBox())!;
  const chip = (await page.getByTestId("page-chip").boundingBox())!;
  return { top, chip, bottom: Math.max(top.y + top.height, chip.y + chip.height) };
}

for (const width of [320, 390]) {
  test.describe(`phone ${width}px`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize({ width, height: 720 }));

    test("go to page 3 from the pages sheet lands its top below the top bar and the chip", async ({ page }) => {
      await open(page, 3);
      await page.getByTestId("page-chip").click();
      await page.getByRole("button", { name: "Page 3 of 3" }).click();
      await expect(page.getByTestId("page-chip")).toContainText("3/3");
      const p3 = page.getByTestId("page-3");
      // Wait for the (smooth) scroll to settle.
      let last = NaN;
      await expect
        .poll(async () => {
          const y = (await p3.boundingBox())!.y;
          const still = Math.abs(y - last) < 0.5;
          last = y;
          return still;
        }, { intervals: [150] })
        .toBe(true);
      const { bottom } = await topChromeBottom(page);
      const box = (await p3.boundingBox())!;
      expect(box.y, `page 3 top ${box.y} is below the top chrome (${bottom})`).toBeGreaterThanOrEqual(bottom - 0.5);
      expect(box.y, "page 3 top is on screen").toBeLessThan(720 / 2);
    });

    test("an owner-restricted file's notice sits below the chip band and never covers the chip", async ({ page }) => {
      await page.goto("/edit-pdf");
      await page.getByTestId("editor-input").setInputFiles("tests/fixtures/owner-restricted.pdf");
      const lock = page.getByTestId("owner-lock");
      await expect(lock).toBeVisible({ timeout: 15_000 });
      const { top, chip, bottom } = await topChromeBottom(page);
      const box = (await lock.boundingBox())!;
      expect(box.y, `owner notice top ${box.y} below the chip band (${bottom})`).toBeGreaterThanOrEqual(bottom - 0.5);
      expect(overlaps(box, chip)).toBe(false);
      expect(overlaps(box, top)).toBe(false);
    });

    test("the restore notice sits below the chip band and never covers the chip", async ({ page }) => {
      await open(page);
      await page.getByTestId("canvas").focus();
      await page.keyboard.press("t");
      const p = (await page.getByTestId("page-1").boundingBox())!;
      await page.mouse.click(p.x + p.width * 0.3, p.y + p.height * 0.6);
      await expect(page.getByTestId("text-input")).toBeFocused();
      await page.keyboard.type("Keep this");
      await page.getByTestId("text-input").press("Escape");
      // Phones show no save chip: wait for the autosave.
      await page.waitForTimeout(1200);
      await open(page);
      const notice = page.getByTestId("recovery");
      await expect(notice).toBeVisible();
      const { top, chip, bottom } = await topChromeBottom(page);
      const box = (await notice.boundingBox())!;
      expect(box.y, `restore notice top ${box.y} below the chip band (${bottom})`).toBeGreaterThanOrEqual(bottom - 0.5);
      expect(overlaps(box, chip)).toBe(false);
      expect(overlaps(box, top)).toBe(false);
    });
  });
}
