import { expect, test, type Page } from "@playwright/test";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from "@cantoo/pdf-lib";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { downloadResult, fx, primary, run } from "../support/flow";

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const N = PDFName.of;
const COLOUR_OPS = /(?:^|\s)(rg|RG|k|K)(?=\s|$)/;

async function open(page: Page, file: string) {
  await page.goto("/grayscale-pdf");
  await page.getByTestId("file-input").setInputFiles(fx(file));
  await expect(primary(page)).toBeEnabled();
}
const choose = (page: Page, value: string) => page.locator(`#gray-what-${wide(page) ? "side" : "bar"}`).selectOption(value);

/** What the first page draws: its content as text, and each picture's colour space and packing. */
async function inspect(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const node = doc.getPage(0).node;
  const contents = node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [node.get(N("Contents"))!];
  const content = refs.map((r) => new TextDecoder("latin1").decode(decodePDFRawStream(doc.context.lookup(r as PDFRef) as PDFRawStream).decode())).join("\n");
  const pictures: Record<string, string> = {};
  const xobjects = node.Resources()!.lookup(N("XObject"), PDFDict);
  for (const [key] of xobjects.entries()) {
    const image = xobjects.lookup(key) as PDFRawStream;
    pictures[image.dict.get(N("ColorSpace"))!.toString().startsWith("[") ? "palette" : `${image.dict.get(N("Filter"))!.toString()} ${image.dict.get(N("Width"))!.toString()}`] = image.dict.get(N("ColorSpace"))!.toString();
  }
  const shading = node.Resources()!.lookup(N("Shading"), PDFDict).lookup(N("Sh0"), PDFDict).get(N("ColorSpace"))!.toString();
  return { doc, content, pictures, shading };
}

test.describe("Grayscale", () => {
  test("AC-1440: everything turns grey; text stays text; pictures become grey pictures", async ({ page }) => {
    await open(page, "colours.pdf");
    await expectNoSeriousAxeViolations(page, "Grayscale, loaded");
    await run(page);
    const out = await downloadResult(page);
    expect(out.name).toBe("colours.pdf");
    const { content, pictures, shading, doc } = await inspect(out.bytes);
    expect(content).not.toMatch(COLOUR_OPS);
    expect(content).toContain("Tj");
    expect(shading).toBe("/DeviceGray");
    // The photo stays a JPEG (one channel now); the drawing and the palette picture stay lossless.
    expect(pictures).toEqual({ "/DCTDecode 300": "/DeviceGray", "/FlateDecode 400": "/DeviceGray", "/FlateDecode 4": "/DeviceGray" });
    expect(doc.getTitle()).toBe("Colours");
    // Grey pictures hold a third of the data: the file is smaller than it was.
    expect(out.bytes.length).toBeLessThan((await import("node:fs")).statSync(fx("colours.pdf")).size);
  });

  test("AC-1441: text and drawings only leaves the pictures; pictures only leaves the text", async ({ page }) => {
    await open(page, "colours.pdf");
    await choose(page, "vector");
    await run(page);
    let got = await inspect((await downloadResult(page)).bytes);
    expect(got.content).not.toMatch(COLOUR_OPS);
    expect(Object.values(got.pictures).filter((cs) => cs === "/DeviceGray")).toHaveLength(0);

    await open(page, "colours.pdf");
    await choose(page, "pictures");
    await run(page);
    got = await inspect((await downloadResult(page)).bytes);
    expect(got.content).toMatch(COLOUR_OPS);
    expect(got.shading).toBe("/DeviceRGB");
    expect(Object.values(got.pictures)).toEqual(["/DeviceGray", "/DeviceGray", "/DeviceGray"]);
  });
});
