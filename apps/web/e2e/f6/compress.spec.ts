import { statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, PDFName, PDFRawStream } from "@cantoo/pdf-lib";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { downloadResult, flow, fx, primary, run, textsOf, unzip } from "../support/flow";

const N = PDFName.of;
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const BEFORE = statSync(fx("photo.pdf")).size;

async function open(page: Page, ...files: string[]) {
  await page.goto("/compress-pdf");
  await page.getByTestId("file-input").setInputFiles(files.map(fx));
  await expect(primary(page)).toBeEnabled();
}
/** Quality is on the bar at every width; sharpness and grey are in the side panel from 1024 px and behind More options below. */
async function choose(page: Page, o: { quality?: string; ppi?: string; gray?: boolean }) {
  if (o.quality) await page.locator(`#compress-quality-${wide(page) ? "side" : "bar"}`).selectOption(o.quality);
  if (o.ppi === undefined && o.gray === undefined) return;
  if (!wide(page)) await page.getByTestId("more-options").click();
  if (o.ppi) await page.locator(`#compress-ppi-${wide(page) ? "side" : "more"}`).selectOption(o.ppi);
  if (o.gray) await page.getByRole("switch", { name: "Pictures in grey" }).check({ force: true });
  if (!wide(page)) await page.keyboard.press("Escape");
}
/** Every picture of a file: its packing, colours and size in pixels, largest first. */
async function pictures(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const found: { filter: string; space: string; width: number; mask: boolean }[] = [];
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    if (!(o instanceof PDFRawStream) || o.dict.get(N("Subtype")) !== N("Image")) continue;
    found.push({ filter: String(o.dict.get(N("Filter"))), space: String(o.dict.get(N("ColorSpace"))), width: Number(String(o.dict.get(N("Width")))), mask: o.dict.has(N("SMask")) });
  }
  return { doc, found: found.sort((a, b) => b.width - a.width) };
}

test.describe("Compress", () => {
  test("AC-1630: pictures are scaled to how they are shown and packed again; text stays text; the result says what was saved", async ({ page }) => {
    await open(page, "photo.pdf");
    await expectNoSeriousAxeViolations(page, "Compress, loaded");
    await run(page);
    await expect(flow(page)).toContainText(/\d+ KB before, \d+% smaller\./);
    await expectNoSeriousAxeViolations(page, "Compress, result");
    const out = await downloadResult(page);
    expect(out.name).toBe("photo.pdf");
    // A 300 ppi lossless photo at 72 ppi as a JPEG: a small fraction of the file.
    expect(out.bytes.length).toBeLessThan(BEFORE / 10);
    const { doc, found } = await pictures(out.bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toBe("Photo");
    // The photo is shown 115 pt wide at most: 115 px at 72 ppi. The round picture keeps its soft edge; the icon is left alone.
    expect(found.find((p) => p.filter === "/DCTDecode" && !p.mask)).toMatchObject({ space: "/DeviceRGB", width: 115 });
    expect(found.find((p) => p.mask)).toMatchObject({ filter: "/DCTDecode", width: 38 });
    expect(found.find((p) => p.width === 8)?.filter).not.toBe("/DCTDecode");
    const texts = await textsOf(out.bytes);
    expect(texts[0]).toContain("These words stay words");
    expect(texts[1]).toContain("The same photo, shown smaller");
  });

  test("AC-1631: quality and sharpness decide the size; Keep every pixel keeps them; grey pictures are grey", async ({ page }) => {
    const sizes: Record<string, number> = {};
    for (const quality of ["low", "best"]) {
      await open(page, "photo.pdf");
      await choose(page, { quality });
      await run(page);
      sizes[quality] = (await downloadResult(page)).bytes.length;
    }
    expect(sizes.low).toBeLessThan(sizes.best);

    await open(page, "photo.pdf");
    await choose(page, { quality: "regular", ppi: "keep", gray: true });
    await run(page);
    const kept = await pictures((await downloadResult(page)).bytes);
    expect(kept.found[0]).toMatchObject({ filter: "/DCTDecode", space: "/DeviceGray", width: 480 });
    expect(kept.found.find((p) => p.mask)).toMatchObject({ space: "/DeviceGray", width: 160 });
  });

  test("AC-1632: a file with nothing to give comes back as it was, and the page says so", async ({ page }) => {
    await open(page, "photo.pdf");
    await run(page);
    const once = await downloadResult(page);
    await page.goto("/compress-pdf");
    await page.getByTestId("file-input").setInputFiles({ name: "small.pdf", mimeType: "application/pdf", buffer: Buffer.from(once.bytes) });
    await expect(primary(page)).toBeEnabled();
    await run(page);
    await expect(flow(page)).toContainText("already as small as this tool can make it");
    await expect(flow(page)).not.toContainText("% smaller");
    const again = await downloadResult(page);
    expect(Buffer.from(again.bytes).equals(Buffer.from(once.bytes))).toBe(true);
  });

  test("AC-1633: several files come back in one ZIP, each smaller or as it was", async ({ page }) => {
    await open(page, "photo.pdf", "three-pages.pdf");
    await run(page);
    const out = await downloadResult(page);
    const files = unzip(out.bytes);
    expect(Object.keys(files).sort()).toEqual(["photo.pdf", "three-pages.pdf"]);
    expect(files["photo.pdf"].length).toBeLessThan(BEFORE / 10);
    expect(files["three-pages.pdf"].length).toBeLessThanOrEqual(statSync(fx("three-pages.pdf")).size);
  });

  test("AC-1634: the choices are remembered for the next visit", async ({ page }) => {
    await open(page, "photo.pdf");
    await choose(page, { quality: "good", ppi: "150" });
    await page.reload();
    await page.getByTestId("file-input").setInputFiles(fx("photo.pdf"));
    await expect(page.locator(`#compress-quality-${wide(page) ? "side" : "bar"}`)).toHaveValue("good");
    if (!wide(page)) await page.getByTestId("more-options").click();
    await expect(page.locator(`#compress-ppi-${wide(page) ? "side" : "more"}`)).toHaveValue("150");
  });

  test("AC-1635: nothing is sent anywhere while a file is compressed", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") sent.push(`${r.method()} ${r.url()}`);
    });
    await open(page, "photo.pdf");
    await run(page);
    await downloadResult(page);
    expect(sent).toEqual([]);
  });
});
