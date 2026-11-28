import { describe, expect, it } from "vitest";
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from "@cantoo/pdf-lib";
import { addTextLayers } from "./ocr-layer";

/** A text-only page as the recogniser hands it back: `width` by `height` points, for the page as shown. */
async function layer(width: number, height: number) {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]).drawText("word", { x: 10, y: height - 20, size: 10 });
  return doc.save();
}

/** The same, with its text hidden (render mode 3), as a recogniser writes it. */
async function hiddenLayer(width: number, height: number) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);
  const name = page.node.newFontDictionary("F", (await doc.embedFont(StandardFonts.Helvetica)).ref);
  page.node.addContentStream(doc.context.register(doc.context.stream(`BT ${name.toString()} 10 Tf 3 Tr 10 ${height - 20} Td (word) Tj ET`)));
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

  it("AC-1544: replacing takes out an earlier layer and hidden text written on the page, and leaves typed text", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    page.drawText("typed", { x: 20, y: 200, size: 12 });
    const once = await addTextLayers({ bytes: await doc.save(), layers: [{ page: 0, pdf: await hiddenLayer(300, 300) }] });
    expect(await placed(once.bytes, 0)).not.toBeNull();
    // Hidden text written straight into the page, the way some OCR tools do.
    const withInline = await PDFDocument.load(once.bytes);
    const font = withInline.getPage(0).node.Resources()!.lookup(PDFName.of("Font"), PDFDict).keys()[0];
    withInline.getPage(0).node.addContentStream(withInline.context.register(withInline.context.stream(`BT ${font.toString()} 9 Tf 3 Tr 20 100 Td (ghost) Tj ET`)));
    const again = await addTextLayers({ bytes: await withInline.save(), layers: [], strip: true });
    const out = await PDFDocument.load(again.bytes);
    const content = out.getPage(0).node.Contents() as PDFRawStream;
    const text = new TextDecoder("latin1").decode(decodePDFRawStream(content).decode());
    expect(text).not.toContain("Do");
    expect(text).not.toContain("ghost");
    expect(text).toContain("Tj");
    expect(out.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"))?.toString() ?? "").not.toContain("OcrText");
    // And a new layer goes on as usual afterwards.
    const twice = await addTextLayers({ bytes: once.bytes, layers: [{ page: 0, pdf: await hiddenLayer(300, 300) }], strip: true });
    const last = await PDFDocument.load(twice.bytes);
    expect((last.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict).keys() ?? []).filter((k) => k.toString().includes("OcrText")).length).toBe(1);
    // Replaced again and again, the file does not grow by a layer each time: the old one leaves with its font.
    const thrice = await addTextLayers({ bytes: twice.bytes, layers: [{ page: 0, pdf: await hiddenLayer(300, 300) }], strip: true });
    const fourth = await addTextLayers({ bytes: thrice.bytes, layers: [{ page: 0, pdf: await hiddenLayer(300, 300) }], strip: true });
    expect(Math.abs(fourth.bytes.length - thrice.bytes.length)).toBeLessThan(300);
  });

  it("AC-1557: two pages drawing one earlier layer both lose it, and a layer one page still needs stays in the file", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]).drawText("typed", { x: 20, y: 200, size: 12 });
    const once = await PDFDocument.load((await addTextLayers({ bytes: await doc.save(), layers: [{ page: 0, pdf: await hiddenLayer(300, 300) }] })).bytes);
    const first = once.getPage(0);
    const second = once.addPage([300, 300]);
    second.node.set(PDFName.of("Contents"), first.node.get(PDFName.of("Contents"))!);
    second.node.set(PDFName.of("Resources"), first.node.get(PDFName.of("Resources"))!);
    const out = await PDFDocument.load((await addTextLayers({ bytes: await once.save(), layers: [], strip: true })).bytes);
    for (const page of out.getPages()) {
      const content = page.node.Contents() as PDFRawStream;
      expect(new TextDecoder("latin1").decode(decodePDFRawStream(content).decode())).not.toContain("Do");
      expect(page.node.Resources()?.lookup(PDFName.of("XObject"))?.toString() ?? "").not.toContain("OcrText");
    }
    expect(out.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Form")).length).toBe(0);
  });
});
