/** F12 PDF to image, Image to PDF and PDF to text: spec docs/specs/f12-image-text-tools.md, AC-700 to AC-722. */
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { downloadResult, flow, pageCountOf, pick, primary, run, unzip } from "../support/flow";

const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isTiff = (b: Uint8Array) => b[0] === 0x49 && b[1] === 0x49 && b[2] === 42;

async function openReady(page: Page, slug: string, ...names: string[]) {
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem("f12-keep")) localStorage.removeItem(key);
  }, `berrypdf:${slug}-options`);
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pick(page, ...names);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
}
const tile = (page: Page, n: number, total: number) => page.getByRole("button", { name: `Page ${n} of ${total}`, exact: true });
const tab = (page: Page, name: string) => page.locator("[data-ip-dock]").getByRole("radio", { name, exact: true });

test.describe("PDF to image", () => {
  test("AC-700, AC-701: with no page picked every page becomes a JPG, zipped and named in page order", async ({ page }) => {
    await openReady(page, "pdf-to-jpg", "three-pages.pdf");
    await expect(primary(page)).toHaveText("Convert 3 pages");
    await run(page);
    await expect(page.getByTestId("result")).toContainText("3 images");
    const out = await downloadResult(page);
    expect(out.name).toBe("three-pages-images.zip");
    const entries = Object.entries(unzip(out.bytes));
    expect(entries.map(([name]) => name)).toEqual(["three-pages-1.jpg", "three-pages-2.jpg", "three-pages-3.jpg"]);
    for (const [, bytes] of entries) expect(isJpeg(bytes)).toBe(true);
  });

  test("AC-702, AC-703: one picked page downloads as a single image; PNG is chosen with the format tabs", async ({ page }) => {
    await openReady(page, "pdf-to-jpg", "three-pages.pdf");
    await tile(page, 2, 3).click();
    await expect(tile(page, 2, 3)).toHaveAttribute("aria-pressed", "true");
    await expect(primary(page)).toHaveText("Convert 1 page");
    await tab(page, "PNG").click();
    await run(page);
    const out = await downloadResult(page);
    expect(out.name).toBe("three-pages-2.png");
    expect(isPng(out.bytes)).toBe(true);
  });

  test("AC-704: a bigger resolution gives a bigger image", async ({ page }) => {
    const widthAt = async (label: string) => {
      await openReady(page, "pdf-to-jpg", "alpha.pdf");
      await tile(page, 1, 3).click();
      await tab(page, "PNG").click();
      await tab(page, label).click();
      await run(page);
      const { bytes } = await downloadResult(page);
      return new DataView(bytes.buffer, bytes.byteOffset).getUint32(16);
    };
    const small = await widthAt("Small");
    const print = await widthAt("Print");
    expect(print / small).toBeCloseTo(4, 1);
  });

  test("AC-705: TIFF downloads as TIFF files", async ({ page }) => {
    await openReady(page, "pdf-to-jpg", "three-pages.pdf");
    await tab(page, "TIFF").click();
    await run(page);
    const out = await downloadResult(page);
    const entries = Object.entries(unzip(out.bytes));
    expect(entries.map(([name]) => name)).toEqual(["three-pages-1.tiff", "three-pages-2.tiff", "three-pages-3.tiff"]);
    for (const [, bytes] of entries) expect(isTiff(bytes)).toBe(true);
  });

  test("AC-706: picking a page never moves the options row; Escape goes back to all pages", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "the row is the desktop layout");
    await openReady(page, "pdf-to-jpg", "three-pages.pdf");
    const right = async () => {
      const b = (await primary(page).boundingBox())!;
      return [Math.round(b.x + b.width), Math.round(b.y)];
    };
    const tabs = async () => (await tab(page, "JPG").boundingBox())!.x;
    const before = [await right(), await tabs()];
    await tile(page, 1, 3).click();
    await expect(primary(page)).toHaveText("Convert 1 page");
    expect([await right(), await tabs()]).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(primary(page)).toHaveText("Convert 3 pages");
  });
});

test.describe("Image to PDF", () => {
  test("AC-710, AC-711: each image is a page, in order, on A4 by default", async ({ page }) => {
    await openReady(page, "jpg-to-pdf", "delta.jpg", "charlie.png");
    await expect(primary(page)).toHaveText("Convert to PDF");
    await run(page);
    const out = await downloadResult(page);
    expect(out.name).toBe("delta.pdf");
    const doc = await PDFDocument.load(out.bytes);
    expect(doc.getPageCount()).toBe(2);
    for (const p of doc.getPages()) {
      const { width, height } = p.getSize();
      expect([Math.round(Math.min(width, height)), Math.round(Math.max(width, height))]).toEqual([595, 842]);
    }
  });

  test("AC-712: Fit to image makes each page the size of its picture", async ({ page }, info) => {
    await openReady(page, "jpg-to-pdf", "delta.jpg", "charlie.png");
    // Below 1280 px the three fields sit behind Options.
    if (info.project.name !== "desktop") await page.getByTestId("options-button").click();
    await page.getByLabel("Page size").locator("visible=true").selectOption("fit");
    if (info.project.name !== "desktop") await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    await run(page);
    const out = await downloadResult(page);
    const doc = await PDFDocument.load(out.bytes);
    const [a, b] = doc.getPages().map((p) => p.getSize());
    expect(a.width / a.height).not.toBeCloseTo(b.width / b.height, 1);
    expect(Math.round(a.width)).not.toBe(595);
  });

  test("AC-713: a PDF is refused with a plain message", async ({ page }) => {
    await page.goto("/jpg-to-pdf");
    await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
    await pick(page, "alpha.pdf");
    await expect(page.getByText("alpha.pdf isn't an image we can read")).toBeVisible();
  });
});

test.describe("PDF to text", () => {
  test("AC-720, AC-721: the text downloads as a .txt and can be copied", async ({ page }) => {
    await openReady(page, "pdf-to-text", "alpha.pdf");
    await expect(primary(page)).toHaveText("Extract text");
    await run(page);
    await expect(page.getByTestId("result")).toContainText("6 words");
    await expect(page.getByRole("button", { name: "Copy text" })).toBeVisible();
    const out = await downloadResult(page);
    expect(out.name).toBe("alpha.txt");
    const text = new TextDecoder().decode(out.bytes);
    expect(text).toContain("Alpha 1");
    expect(text.indexOf("Alpha 1")).toBeLessThan(text.indexOf("Alpha 3"));
  });

  test("AC-722: a scanned PDF says it has no text and needs OCR", async ({ page }) => {
    await openReady(page, "pdf-to-text", "scanned.pdf");
    await primary(page).click();
    await expect(page.getByText("This PDF has no text to copy out")).toBeVisible();
  });
});

test("AC-707: a finished Image to PDF result can go on to another tool", async ({ page }) => {
  await openReady(page, "jpg-to-pdf", "delta.jpg");
  await run(page);
  expect(await pageCountOf((await downloadResult(page)).bytes)).toBe(1);
  await expect(page.getByTestId("result").getByRole("link", { name: "Merge", exact: true }).or(page.getByTestId("result").getByRole("button", { name: "Merge", exact: true }))).toBeVisible();
});
