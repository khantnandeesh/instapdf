import { describe, expect, it } from "vitest";
import { degrees, PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "@cantoo/pdf-lib";
import { addTextLayers } from "./ocr-layer";

/** A text-only page as the recogniser hands it back: `width` by `height` points, for the page as shown. */
async function layer(width: number, height: number) {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]).drawText("word", { x: 10, y: height - 20, size: 10 });
  return doc.save();
}

/** The matrix the layer is drawn through on a page of the result. */
async function placed(bytes: Uint8Array, index: number) {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(index).node.lookup(PDFName.of("Contents"), PDFArray);
  const last = contents.lookup(contents.size() - 1, PDFRawStream);
  const m = /([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) cm\s+\/(OcrText\S*) Do/.exec(new TextDecoder("latin1").decode(decodePDFRawStream(last).decode()));
  return m ? m.slice(1, 7).map(Number) : null;
}

describe("OCR text layer", () => {
  it("AC-1540: a layer is stretched over the whole page, whatever size the recogniser drew it at", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const out = await addTextLayers({ bytes: await doc.save(), layers: [{ page: 0, pdf: await layer(200, 300) }] });
    expect(await placed(out.bytes, 0)).toEqual([2, 0, 0, 2, 0, 0]);
    expect(out.pageCount).toBe(1);
  });

  it("AC-1541: on a page shown turned, the layer is turned with it", async () => {
    const doc = await PDFDocument.create();
    // Stored 600 wide and 400 high, shown turned a quarter clockwise: 400 wide and 600 high.
    doc.addPage([600, 400]).setRotation(degrees(90));
    doc.addPage([400, 600]).setRotation(degrees(180));
    doc.addPage([600, 400]).setRotation(degrees(270));
    const text = await layer(400, 600);
    const out = await addTextLayers({ bytes: await doc.save(), layers: [0, 1, 2].map((page) => ({ page, pdf: text })) });
    // The layer's bottom left corner lands on the corner of the stored page that is shown at the bottom left.
    expect(await placed(out.bytes, 0)).toEqual([0, 1, -1, 0, 600, 0]);
    expect(await placed(out.bytes, 1)).toEqual([-1, 0, 0, -1, 400, 600]);
    expect(await placed(out.bytes, 2)).toEqual([0, -1, 1, 0, 0, 400]);
  });

  it("AC-1542: a page box that does not start at the corner is followed, and pages with no layer are untouched", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 700]);
    page.setCropBox(50, 100, 400, 500);
    doc.addPage([300, 300]).drawText("typed", { x: 20, y: 20, size: 12 });
    const before = await PDFDocument.load(await doc.save());
    const out = await addTextLayers({ bytes: await doc.save(), layers: [{ page: 0, pdf: await layer(400, 500) }, { page: 9, pdf: await layer(10, 10) }] });
    expect(await placed(out.bytes, 0)).toEqual([1, 0, 0, 1, 50, 100]);
    const after = await PDFDocument.load(out.bytes);
    expect(after.getPage(1).node.Resources()?.lookup(PDFName.of("XObject"))?.toString() ?? "").not.toContain("OcrText");
    expect(after.getPageCount()).toBe(before.getPageCount());
  });

  it("AC-1543: two pages that share one list of content streams each get only their own layer", async () => {
    const doc = await PDFDocument.create();
    const first = doc.addPage([300, 300]);
    first.drawText("shared", { x: 20, y: 20, size: 12 });
    const second = doc.addPage([300, 300]);
    const shared = doc.context.register(doc.context.obj([(first.node.Contents() as PDFArray).get(0)]));
    first.node.set(PDFName.of("Contents"), shared);
    second.node.set(PDFName.of("Contents"), shared);
    second.node.set(PDFName.of("Resources"), first.node.get(PDFName.of("Resources"))!);
    const out = await addTextLayers({ bytes: await doc.save(), layers: [{ page: 0, pdf: await layer(300, 300) }] });
    const after = await PDFDocument.load(out.bytes);
    expect(await placed(out.bytes, 0)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(after.getPage(0).node.lookup(PDFName.of("Contents"), PDFArray).size()).toBeGreaterThan(1);
    expect(after.getPage(1).node.lookup(PDFName.of("Contents"), PDFArray).size()).toBe(1);
  });
});
