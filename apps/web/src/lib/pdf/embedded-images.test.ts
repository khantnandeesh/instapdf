import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFRawStream, PDFRef } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { jpegPassthrough, parseRef, toRgba } from "./embedded-images";
import { embeddedImageName } from "./naming";
import { imagesPdf } from "./page-tool-fixtures";

const fx = async (name: string) => new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));

describe("parseRef", () => {
  it("reads pdf.js references", () => {
    expect(parseRef("12R")).toBe(PDFRef.of(12, 0));
    expect(parseRef("12R3")).toBe(PDFRef.of(12, 3));
    expect(parseRef("img_p0_1")).toBeNull();
    expect(parseRef(undefined)).toBeNull();
  });
});

describe("jpegPassthrough (F12 AC-731)", () => {
  const load = async () => {
    const jpg = await fx("delta.jpg");
    const doc = await PDFDocument.load(await imagesPdf(jpg, await fx("charlie.png")));
    const images = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) as [PDFRef, PDFRawStream][];
    const dct = images.find(([, o]) => o.dict.get(PDFName.of("Filter")) === PDFName.of("DCTDecode"))!;
    return { jpg, doc, images, dct };
  };

  it("hands out the stored JPEG byte for byte", async () => {
    const { jpg, doc, dct } = await load();
    expect(Buffer.from(jpegPassthrough(doc, dct[0])!).equals(Buffer.from(jpg))).toBe(true);
  });

  it("leaves Flate images, and anything that is not an image, to the decoder", async () => {
    const { doc, images, dct } = await load();
    const others = images.filter(([ref]) => ref !== dct[0]);
    expect(others.length).toBeGreaterThanOrEqual(2);
    for (const [ref] of others) expect(jpegPassthrough(doc, ref)).toBeNull();
    expect(jpegPassthrough(doc, doc.catalog.get(PDFName.of("Pages")) as PDFRef)).toBeNull();
  });

  it("refuses a JPEG with a soft mask, a /Decode remap or CMYK colours", async () => {
    for (const change of [
      (s: PDFRawStream) => s.dict.set(PDFName.of("SMask"), PDFRef.of(1, 0)),
      (s: PDFRawStream, d: PDFDocument) => s.dict.set(PDFName.of("Decode"), d.context.obj([1, 0, 1, 0, 1, 0])),
      (s: PDFRawStream) => s.dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceCMYK")),
    ]) {
      const { doc, dct } = await load();
      change(dct[1], doc);
      expect(jpegPassthrough(doc, dct[0])).toBeNull();
    }
  });
});

describe("toRgba", () => {
  it("expands 1-bit rows (padded to a byte), RGB and RGBA", () => {
    expect([...toRgba({ width: 3, height: 2, kind: 1, data: new Uint8Array([0b10100000, 0b01000000]) })]).toEqual([
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    ]);
    expect([...toRgba({ width: 1, height: 1, kind: 2, data: new Uint8Array([1, 2, 3]) })]).toEqual([1, 2, 3, 255]);
    expect([...toRgba({ width: 1, height: 1, kind: 3, data: new Uint8Array([1, 2, 3, 4]) })]).toEqual([1, 2, 3, 4]);
  });
});

describe("embeddedImageName (F12 AC-730)", () => {
  it("names an image by its page and its place on it", () => {
    expect(embeddedImageName("report.pdf", 2, 1, "jpg")).toBe("report-p2-1.jpg");
  });
});
