import { PDFArray, type PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, StandardFonts } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { compressiblePictures, compressPdf, MIN_PICTURE_BYTES } from "./compress";
import { drawnSizes, savedText, scaledPixels, scaleFor } from "./compress-run";
import { encodeColourJpeg } from "./jpeg";
import { RGB_24BPP } from "./pdfjs-images";

const N = PDFName.of;
/** Pixels no packing shrinks much: a picture that weighs something. */
function noise(count: number, seed = 7) {
  const out = new Uint8Array(count);
  let s = seed;
  for (let i = 0; i < count; i++) out[i] = (s = (s * 1103515245 + 12345) >>> 0) >>> 24;
  return out;
}
type Extra = Record<string, unknown>;
/** One page with text and one raw picture of `width` × `height`, drawn 144 pt wide. */
async function sample(width = 80, height = 60, extra: Extra = {}, space: unknown = "DeviceRGB", perPixel = 3) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  page.drawText("Sharp words", { x: 20, y: 260, size: 18, font: await doc.embedFont(StandardFonts.Helvetica) });
  const ctx = doc.context;
  const image = ctx.register(PDFRawStream.of(ctx.obj({ Type: "XObject", Subtype: "Image", Width: width, Height: height, BitsPerComponent: 8, ColorSpace: space, ...extra } as never) as unknown as PDFDict, noise(width * height * perPixel)));
  page.node.Resources()!.set(N("XObject"), ctx.obj({ Im0: image }));
  const draw = ctx.register(ctx.stream("q 144 0 0 108 20 100 cm /Im0 Do Q"));
  const first = page.node.get(N("Contents"))!;
  page.node.set(N("Contents"), ctx.obj([...(first instanceof PDFArray ? first.asArray() : [first]), draw]));
  return { bytes: await doc.save({ useObjectStreams: false }), ref: `${image.objectNumber}R`, doc, image };
}
const small = (w: number, h: number) => encodeColourJpeg(new Uint8Array(w * h * 3).fill(120), w, h, 60);
async function pictureOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  for (const [ref, o] of doc.context.enumerateIndirectObjects()) if (o instanceof PDFRawStream && o.dict.get(N("Subtype")) === N("Image") && !o.dict.has(N("Matte")) && o.dict.get(N("ColorSpace")) !== N("DeviceGray")) return { doc, ref, dict: o.dict, data: o.contents };
  throw new Error("no picture");
}

describe("compressiblePictures (F6)", () => {
  it("AC-1610: lists a plain colour picture with its size and weight", async () => {
    const { bytes, ref } = await sample();
    const { pictures, pageCount } = await compressiblePictures({ bytes });
    expect(pageCount).toBe(1);
    expect(pictures).toEqual([{ ref, width: 80, height: 60, gray: false, bytes: 80 * 60 * 3 }]);
  });
  it("AC-1611: leaves print colours, stencils, one-bit pictures, colour-keyed and tiny pictures alone", async () => {
    expect((await compressiblePictures({ bytes: (await sample(80, 60, {}, "DeviceCMYK", 4)).bytes })).pictures).toEqual([]);
    expect((await compressiblePictures({ bytes: (await sample(80, 60, { ImageMask: true })).bytes })).pictures).toEqual([]);
    expect((await compressiblePictures({ bytes: (await sample(80, 60, { BitsPerComponent: 1 })).bytes })).pictures).toEqual([]);
    expect((await compressiblePictures({ bytes: (await sample(80, 60, { Mask: [0, 0, 0, 0, 0, 0] })).bytes })).pictures).toEqual([]);
    const tiny = await sample(20, 20);
    expect(20 * 20 * 3).toBeLessThan(MIN_PICTURE_BYTES);
    expect((await compressiblePictures({ bytes: tiny.bytes })).pictures).toEqual([]);
  });
  it("AC-1612: a picture that is another's mask is never listed; grey is told from colour", async () => {
    const { doc, image } = await sample();
    const ctx = doc.context;
    const mask = ctx.register(PDFRawStream.of(ctx.obj({ Type: "XObject", Subtype: "Image", Width: 80, Height: 60, BitsPerComponent: 8, ColorSpace: "DeviceGray" } as never) as unknown as PDFDict, noise(80 * 60, 3)));
    (ctx.lookup(image) as PDFRawStream).dict.set(N("SMask"), mask);
    const found = (await compressiblePictures({ bytes: await doc.save() })).pictures;
    expect(found.map((p) => p.ref)).toEqual([`${image.objectNumber}R`]);
    const grey = await sample(80, 60, {}, "DeviceGray", 1);
    expect((await compressiblePictures({ bytes: grey.bytes })).pictures[0].gray).toBe(true);
  });
});

describe("compressPdf (F6)", () => {
  it("AC-1613: swaps in the smaller picture, keeps the text, and the file is smaller", async () => {
    const { bytes, ref } = await sample();
    const out = await compressPdf({ bytes, images: [{ ref, width: 40, height: 30, gray: false, data: small(40, 30) }] });
    expect(out).toMatchObject({ swapped: 1, unchanged: false, pageCount: 1, wasEncrypted: false });
    expect(out.bytes.length).toBeLessThan(bytes.length / 2);
    const { dict, data } = await pictureOf(out.bytes);
    expect(dict.get(N("Filter"))).toBe(N("DCTDecode"));
    expect(dict.get(N("ColorSpace"))).toBe(N("DeviceRGB"));
    expect([dict.get(N("Width"))!.toString(), dict.get(N("Height"))!.toString()]).toEqual(["40", "30"]);
    expect([data[0], data[1]]).toEqual([0xff, 0xd8]);
    // The page still draws its words as words.
    const { doc } = await pictureOf(out.bytes);
    expect(doc.getPage(0).node.Resources()!.has(N("Font"))).toBe(true);
  });
  it("AC-1614: a new picture that is not clearly smaller, larger in pixels, or for something else is refused", async () => {
    const { bytes, ref } = await sample();
    const heavy = noise(80 * 60 * 3 - 100);
    expect((await compressPdf({ bytes, images: [{ ref, width: 80, height: 60, gray: false, data: heavy }] })).swapped).toBe(0);
    expect((await compressPdf({ bytes, images: [{ ref, width: 160, height: 120, gray: false, data: small(160, 120) }] })).swapped).toBe(0);
    expect((await compressPdf({ bytes, images: [{ ref: "1R", width: 8, height: 8, gray: false, data: small(8, 8) }] })).swapped).toBe(0);
  });
  it("AC-1615: a file with nothing to give comes back byte for byte", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]).drawText("Hello", { x: 20, y: 100, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
    const once = (await compressPdf({ bytes: await doc.save(), images: [] })).bytes;
    const again = await compressPdf({ bytes: once, images: [] });
    expect(again.unchanged).toBe(true);
    expect(again.swapped).toBe(0);
    expect(again.bytes).toBe(once);
  });
  it("AC-1616: a mask that asks for its matte colour to be taken out gets a copy that does not; the shared mask is untouched", async () => {
    const { doc, image } = await sample();
    const ctx = doc.context;
    const mask = ctx.register(PDFRawStream.of(ctx.obj({ Type: "XObject", Subtype: "Image", Width: 80, Height: 60, BitsPerComponent: 8, ColorSpace: "DeviceGray", Matte: [1, 1, 1] } as never) as unknown as PDFDict, noise(80 * 60, 3)));
    (ctx.lookup(image) as PDFRawStream).dict.set(N("SMask"), mask);
    const out = await compressPdf({ bytes: await doc.save(), images: [{ ref: `${image.objectNumber}R`, width: 40, height: 30, gray: false, data: small(40, 30) }] });
    expect(out.swapped).toBe(1);
    const { doc: after, dict } = await pictureOf(out.bytes);
    const smask = after.context.lookup(dict.get(N("SMask")) as PDFRef) as PDFRawStream;
    expect(smask.dict.has(N("Matte"))).toBe(false);
    expect(smask.contents.length).toBeGreaterThan(0);
  });
  it("AC-1617: page thumbnails kept by old programs are dropped", async () => {
    const { doc, image } = await sample();
    doc.getPage(0).node.set(N("Thumb"), image);
    const out = await compressPdf({ bytes: await doc.save({ useObjectStreams: false }), images: [] });
    expect((await PDFDocument.load(out.bytes)).getPage(0).node.has(N("Thumb"))).toBe(false);
  });
});

describe("review fixes (F6)", () => {
  it("AC-1618: a profiled picture keeps its profile, a palette picture its base; a grey copy of a colour one is plain grey", async () => {
    const base = await sample();
    const ctx = base.doc.context;
    const profile = ctx.register(PDFRawStream.of(ctx.obj({ N: 3 } as never) as unknown as PDFDict, noise(64)));
    const space = ctx.register(ctx.obj(["ICCBased", profile]));
    (ctx.lookup(base.image) as PDFRawStream).dict.set(N("ColorSpace"), space);
    const bytes = await base.doc.save({ useObjectStreams: false });
    const ref = `${base.image.objectNumber}R`;
    const kept = await pictureOf((await compressPdf({ bytes, images: [{ ref, width: 40, height: 30, gray: false, data: small(40, 30) }] })).bytes);
    const cs = kept.doc.context.lookup(kept.dict.get(N("ColorSpace"))) as PDFArray;
    expect(cs.get(0)).toBe(N("ICCBased"));
    const grey = await compressPdf({ bytes, images: [{ ref, width: 40, height: 30, gray: true, data: small(40, 30) }] });
    const doc = await PDFDocument.load(grey.bytes);
    const spaces = doc.context.enumerateIndirectObjects().flatMap(([, o]) => (o instanceof PDFRawStream && o.dict.get(N("Subtype")) === N("Image") ? [o.dict.get(N("ColorSpace"))] : []));
    expect(spaces).toEqual([N("DeviceGray")]);
  });
  it("AC-1619: a JPEG 2000 picture that states no colour space is left alone", async () => {
    const { doc, image } = await sample();
    const dict = (doc.context.lookup(image) as PDFRawStream).dict;
    dict.delete(N("ColorSpace"));
    dict.set(N("Filter"), N("JPXDecode"));
    expect((await compressiblePictures({ bytes: await doc.save() })).pictures).toEqual([]);
  });
  it("AC-1625: a picture in an annotation gets no size, so it is never scaled", () => {
    const OPS = { save: 1, restore: 2, transform: 3, paintImageXObject: 4, beginAnnotation: 12, endAnnotation: 13 };
    const ops = [[OPS.beginAnnotation, ["a", [0, 0, 360, 180], [360, 0, 0, 180, 0, 0], [1, 0, 0, 1, 0, 0], false]], [OPS.paintImageXObject, ["stamp"]], [OPS.endAnnotation, null], [OPS.transform, [50, 0, 0, 50, 0, 0]], [OPS.paintImageXObject, ["page"]]] as [number, unknown[] | null][];
    const sizes = drawnSizes({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) }, OPS);
    expect(sizes.get("stamp")).toBeNull();
    expect(sizes.get("page")).toEqual({ width: 50, height: 50 });
    expect(scaleFor({ width: 400, height: 200 }, sizes.get("stamp")!, 72)).toBe(1);
  });
  it("AC-1626: what a mask hides never tints an edge: pixels count for as much as they show", () => {
    // White that shows beside black that is fully hidden.
    const rgba = Uint8Array.of(255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0);
    expect([...scaledPixels({ width: 2, height: 2, kind: 3, data: rgba } as never, 1, 1, false)!]).toEqual([255, 255, 255]);
    // Fully hidden: a plain average, nothing divided by zero.
    expect([...scaledPixels({ width: 2, height: 1, kind: 3, data: Uint8Array.of(100, 0, 0, 0, 200, 0, 0, 0) } as never, 1, 1, false)!]).toEqual([150, 0, 0]);
  });
  it("AC-1627: the JPEG writer refuses a side it cannot state", () => {
    expect(() => encodeColourJpeg(new Uint8Array(3), 70000, 1, 60)).toThrow(RangeError);
  });
});

describe("picture sizes (F6)", () => {
  const OPS = { save: 1, restore: 2, transform: 3, paintImageXObject: 4, paintImageXObjectRepeat: 5, paintFormXObjectBegin: 6, paintFormXObjectEnd: 7, setFillColorN: 8, setStrokeColorN: 9, beginGroup: 10, endGroup: 11 };
  const list = (...ops: [number, unknown[] | null][]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
  it("AC-1620: a picture's drawn size follows every transform above it, and a restore undoes them", () => {
    const sizes = drawnSizes(
      list([OPS.save, null], [OPS.transform, [2, 0, 0, 2, 0, 0]], [OPS.save, null], [OPS.transform, [72, 0, 0, 36, 10, 10]], [OPS.paintImageXObject, ["a"]], [OPS.restore, null], [OPS.restore, null], [OPS.transform, Float32Array.of(0, 50, -20, 0, 0, 0) as unknown as number[]], [OPS.paintImageXObject, ["b"]]),
      OPS,
    );
    expect(sizes.get("a")).toEqual({ width: 144, height: 72 });
    // Turned a quarter: the size is that of its sides, not of its box.
    expect(sizes.get("b")).toEqual({ width: 50, height: 20 });
  });
  it("AC-1621: drawn twice it keeps the larger size; inside a form the form's matrix counts; a pattern or a repeat gives no size", () => {
    const sizes = drawnSizes(
      list(
        [OPS.save, null],
        [OPS.transform, [10, 0, 0, 10, 0, 0]],
        [OPS.paintImageXObject, ["a"]],
        [OPS.restore, null],
        [OPS.paintFormXObjectBegin, [[3, 0, 0, 3, 0, 0], null]],
        [OPS.transform, [30, 0, 0, 5, 0, 0]],
        [OPS.paintImageXObject, ["a"]],
        [OPS.paintFormXObjectEnd, null],
        [OPS.paintImageXObjectRepeat, ["r", 1, 1, []]],
        [OPS.setFillColorN, ["TilingPattern", null, list([OPS.transform, [9, 0, 0, 9, 0, 0]], [OPS.paintImageXObject, ["t"]])]],
        [OPS.transform, [7, 0, 0, 7, 0, 0]],
        [OPS.paintImageXObject, ["c"]],
      ),
      OPS,
    );
    expect(sizes.get("a")).toEqual({ width: 90, height: 15 });
    expect(sizes.get("r")).toBeNull();
    expect(sizes.get("t")).toBeNull();
    expect(sizes.get("c")).toEqual({ width: 7, height: 7 });
  });
  it("AC-1622: the scale keeps the stated pixels an inch on the side that needs most; small gains and unknown sizes keep every pixel", () => {
    // 1440 px across 2 inches is 720 ppi: a tenth each way gives 72.
    expect(scaleFor({ width: 1440, height: 720 }, { width: 144, height: 72 }, 72)).toBeCloseTo(0.1);
    // Stretched: the side that needs more pixels decides.
    expect(scaleFor({ width: 1000, height: 1000 }, { width: 72, height: 360 }, 100)).toBeCloseTo(0.5);
    expect(scaleFor({ width: 85, height: 85 }, { width: 72, height: 72 }, 72)).toBe(1);
    expect(scaleFor({ width: 1000, height: 1000 }, null, 72)).toBe(1);
    expect(scaleFor({ width: 1000, height: 1000 }, { width: 72, height: 72 }, null)).toBe(1);
    // Never under 8 pixels on the short side.
    expect(scaleFor({ width: 4000, height: 40 }, { width: 7.2, height: 0.072 }, 72)).toBeCloseTo(0.2);
  });
  it("AC-1623: scaling averages the pixels it covers, in colour or in grey", () => {
    const data = Uint8Array.of(255, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 0);
    const img = { width: 2, height: 2, kind: RGB_24BPP, data } as never;
    expect([...scaledPixels(img, 1, 1, false)!]).toEqual([64, 128, 64]);
    expect([...scaledPixels(img, 1, 1, true)!]).toEqual([Math.round((255 * 77 + 510 * 150 + 255 * 29) / 1024)]);
    expect([...scaledPixels(img, 2, 2, false)!]).toEqual([...data]);
    expect(scaledPixels({ width: 2, height: 2, kind: RGB_24BPP } as never, 1, 1, false)).toBeNull();
  });
  it("AC-1624: savings never promise more than was saved", () => {
    expect(savedText(1000, 381)).toBe("61% smaller");
    expect(savedText(1000, 999)).toBe("1% smaller");
  });
});
