import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, rgb, StandardFonts } from "@cantoo/pdf-lib";
import { unzlibSync, zlibSync } from "fflate";
import { JpegImage } from "pdfjs-dist/image_decoders/pdf.image_decoders.mjs";
import { describe, expect, it } from "vitest";
import { CMYK, evalFn, GRAY, parsePs, RGB, runPs, toGray, type Space } from "./gray-color";
import { grayContent, type ContentEnv } from "./gray-content";
import { encodeGrayFlate, encodeGrayJpeg } from "./gray-encode";
import { colourImages, grayscalePdf } from "./grayscale";

const N = PDFName.of;
const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const env = (spaces: Record<string, Space> = {}): ContentEnv => ({ space: (n) => spaces[n] ?? ({ DeviceRGB: RGB, DeviceCMYK: CMYK, DeviceGray: GRAY } as Record<string, Space>)[n] ?? null, grayPattern: () => "GP" });
const convert = (s: string, spaces?: Record<string, Space>) => text(grayContent(bytes(s), env(spaces)).bytes);

describe("black text (spec F13 §1, the Make text black option)", () => {
  const black = (s: string, how: "objects" | "all" = "objects", inherits = false) => text(grayContent(bytes(s), { ...env(), blackText: how, inherits }).bytes);

  it("AC-1437: dark text becomes black, and what is drawn after it keeps its own grey", () => {
    // A colour set before the text object: black inside it, its grey again after it.
    expect(black("0 0 1 rg 0 0 5 5 re f BT (a) Tj ET 0 0 9 9 re f")).toBe("0.114 g 0 0 5 5 re f BT 0 g (a) Tj ET 0.114 g 0 0 9 9 re f");
    // Colours set inside it: black there, the last one restored after it.
    expect(black("BT 1 0 0 rg (a) Tj 0.2 g (b) Tj ET")).toBe("BT 0 g (a) Tj 0 g (b) Tj ET 0.2 g");
    // Stroked text too.
    expect(black("0 0 1 RG BT (a) Tj ET")).toBe("0.114 G BT 0 G (a) Tj ET 0.114 G");
    // Text that is black already is left byte for byte.
    expect(black("BT 0 g (a) Tj ET")).toBe("BT 0 g (a) Tj ET");
  });

  it("AC-1438: light text stays light, drawings are never blackened, and an unknown colour is left alone", () => {
    expect(black("BT 1 1 1 rg (white on dark) Tj ET")).toBe("BT 1 g (white on dark) Tj ET");
    expect(black("1 0 0 rg 0 0 5 5 re f")).toBe("0.299 g 0 0 5 5 re f");
    // A form's text in the colour of whoever draws the form: that colour cannot be put back, so it stays.
    expect(black("BT (a) Tj ET", "objects", true)).toBe("BT (a) Tj ET");
    // The graphics state is followed through q and Q.
    expect(black("0.3 g q 1 g Q BT (a) Tj ET")).toBe("0.3 g q 1 g Q BT 0 g (a) Tj ET 0.3 g");
    // A form field's default appearance is all text.
    expect(black("0 0 1 rg /Helv 12 Tf", "all")).toBe("0 g /Helv 12 Tf");
  });

  it("AC-1439: the option reaches a real file, and photos can be packed smaller", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([200, 200]).drawText("Blue", { x: 20, y: 100, size: 20, font, color: rgb(0, 0, 1) });
    const src = await doc.save({ useObjectStreams: false });
    const page = async (blackText: boolean) => {
      const out = await grayscalePdf({ bytes: src, vector: true, blackText });
      const made = await PDFDocument.load(out.bytes);
      const contents = made.getPage(0).node.Contents()!;
      const first = contents instanceof PDFArray ? made.context.lookup(contents.get(0)) : contents;
      return text(decodePDFRawStream(first as PDFRawStream).decode());
    };
    expect(await page(false)).toMatch(/BT\s+0\.114 g/);
    // Black inside the text object; the file's own grey is set again once it ends.
    expect(await page(true)).toMatch(/BT\s+0 g[\s\S]*ET 0\.114 g/);
    const px = new Uint8Array(64 * 64).map((_, i) => (i * 37) % 256);
    expect(encodeGrayJpeg(px, 64, 64, 60).length).toBeLessThan(encodeGrayJpeg(px, 64, 64).length);
  });
});

describe("grey levels (spec F13 §1)", () => {
  it("AC-1400: a colour of any space becomes its luminance", () => {
    expect(toGray(RGB, [1, 0, 0])).toBeCloseTo(0.299);
    expect(toGray(RGB, [1, 1, 1])).toBeCloseTo(1);
    expect(toGray(CMYK, [0, 0, 0, 1])).toBe(0);
    expect(toGray(CMYK, [0, 1, 1, 0])).toBeCloseTo(0.299);
    expect(toGray({ kind: "lab", range: [-100, 100, -100, 100] }, [100, 0, 0])).toBeCloseTo(1);
    expect(toGray({ kind: "lab", range: [-100, 100, -100, 100] }, [0, 0, 0])).toBeCloseTo(0);
    const palette: Space = { kind: "indexed", base: RGB, hival: 1, lookup: Uint8Array.of(255, 0, 0, 0, 0, 255) };
    expect(toGray(palette, [0])).toBeCloseTo(0.299);
    expect(toGray(palette, [1])).toBeCloseTo(0.114);
    // A spot colour: its tint function gives the colour to print it with.
    const spot: Space = { kind: "tint", n: 1, alt: CMYK, fns: [{ type: 2, domain: [0, 1], c0: [0, 0, 0, 0], c1: [0, 1, 1, 0], n: 1 }] };
    expect(toGray(spot, [1])).toBeCloseTo(0.299);
    expect(toGray(spot, [0])).toBeCloseTo(1);
  });

  it("AC-1401: the four kinds of PDF function are worked out", () => {
    expect(evalFn({ type: 2, domain: [0, 1], c0: [0, 0], c1: [1, 0.5], n: 2 }, [0.5])).toEqual([0.25, 0.125]);
    const stitched = { type: 3 as const, domain: [0, 1], bounds: [0.5], encode: [0, 1, 0, 1], fns: [{ type: 2 as const, domain: [0, 1], c0: [0], c1: [1], n: 1 }, { type: 2 as const, domain: [0, 1], c0: [1], c1: [0], n: 1 }] };
    expect(evalFn(stitched, [0.25])![0]).toBeCloseTo(0.5);
    expect(evalFn(stitched, [0.75])![0]).toBeCloseTo(0.5);
    expect(evalFn(stitched, [1])![0]).toBeCloseTo(0);
    const sampled = { type: 0 as const, domain: [0, 1], range: [0, 1], size: [3], bits: 8, encode: [0, 2], decode: [0, 1], data: Uint8Array.of(0, 255, 0) };
    expect(evalFn(sampled, [0.25])![0]).toBeCloseTo(0.5);
    const code = parsePs("{ dup 0.5 gt { 1 exch sub } { 2 mul } ifelse 2 1 roll pop 1 }")!;
    expect(runPs(code, [9, 0.25])).toEqual([0.5, 1]);
    expect(runPs(parsePs("{ 360 mul sin 2 div 0.5 add }")!, [0.25])![0]).toBeCloseTo(1);
    expect(runPs(parsePs("{ pop pop }")!, [1])).toBeNull();
    expect(parsePs("{ 1 { 2 ")).toBeNull();
  });
});

describe("content streams (spec F13 §1)", () => {
  it("AC-1410: colour operators become grey ones; everything else is byte for byte the same", () => {
    expect(convert("q 1 0 0 rg 0 0 1 RG 10 10 50 50 re B Q")).toBe("q 0.299 g 0.114 G 10 10 50 50 re B Q");
    expect(convert("0 0 0 1 k 0 0 0 0 K")).toBe("0 g 1 G");
    expect(convert("BT /F1 12 Tf (1 0 0 rg \\) text) Tj [(a) 120 (b)] TJ ET")).toBe("BT /F1 12 Tf (1 0 0 rg \\) text) Tj [(a) 120 (b)] TJ ET");
    expect(convert("0.5 g 0.2 G")).toBe("0.5 g 0.2 G");
    expect(grayContent(bytes("0.5 g"), env()).changed).toBe(false);
  });

  it("AC-1411: named colour spaces are followed through q and Q", () => {
    const spot: Space = { kind: "tint", n: 1, alt: RGB, fns: [{ type: 2, domain: [0, 1], c0: [1, 1, 1], c1: [1, 0, 0], n: 1 }] };
    // Choosing a space sets its first colour too: black for RGB, full ink for a spot colour.
    expect(convert("/Cs1 cs 0 1 0 sc", { Cs1: RGB })).toBe("0 g 0.587 g");
    expect(convert("/Spot CS q /Cs1 CS 1 1 1 SCN Q 1 SCN", { Cs1: RGB, Spot: spot })).toBe("0.299 G q 0 G 1 G Q 0.299 G");
    expect(convert("/Spot cs 0 0 10 10 re f", { Spot: spot })).toBe("0.299 g 0 0 10 10 re f");
    // "None" paints nothing, and still must not.
    const none: Space = { ...spot, none: true };
    expect(convert("/Off cs 1 scn 0 0 10 10 re f", { Off: none })).toBe("/Off cs 1 scn 0 0 10 10 re f");
    // No `cs` in this stream: the number of values says what they are.
    expect(convert("0 0 1 sc 0 0 0 1 SC")).toBe("0.114 g 0 G");
    // One value in a space that cannot be read, or handed down by an unknown caller, is counted, not guessed.
    expect(grayContent(bytes("/X cs 0.7 scn"), env()).unknownKept).toBe(1);
    expect(grayContent(bytes("1 scn"), { ...env(), inherits: true }).unknownKept).toBe(1);
    expect(grayContent(bytes("1 sc"), env()).unknownKept).toBe(0);
  });

  it("AC-1412: an uncoloured pattern is painted in grey; a coloured one is left to its own definition", () => {
    const spaces: Record<string, Space> = { P0: { kind: "pattern", base: RGB }, P1: { kind: "pattern", base: null } };
    expect(convert("/P0 cs 1 0 0 /Dots scn", spaces)).toBe("/GP cs 0.299 /Dots scn");
    expect(convert("/P1 cs /Tile scn", spaces)).toBe("/P1 cs /Tile scn");
  });

  it("AC-1413: a small picture inside the content becomes grey", () => {
    const src = Uint8Array.from([...bytes("q BI /W 2 /H 1 /BPC 8 /CS /RGB ID "), 255, 0, 0, 0, 0, 255, ...bytes("\nEI Q 1 0 0 rg")]);
    const out = grayContent(src, env());
    const s = text(out.bytes);
    expect(s.startsWith("q BI /W 2 /H 1 /BPC 8 /CS /G ID\n")).toBe(true);
    const at = s.indexOf("ID\n") + 3;
    expect([...out.bytes.subarray(at, at + 2)]).toEqual([76, 29]);
    expect(s.endsWith("\nEI Q 0.299 g")).toBe(true);
    // A packed one is counted, not guessed at; a stencil has no colour of its own.
    expect(grayContent(bytes("BI /W 1 /H 1 /BPC 8 /CS /RGB /F /AHx ID ff0000> EI"), env()).inlineKept).toBe(1);
    expect(grayContent(bytes("BI /W 8 /H 1 /IM true ID \xff\nEI 1 0 0 rg"), env()).inlineKept).toBe(0);
  });
});

/** A page with coloured text and a box, a form, a gradient, a pattern, an annotation and a field default. */
async function colourful() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 400]);
  page.drawText("Blue words", { x: 20, y: 350, size: 18, font, color: rgb(0, 0, 1) });
  page.drawRectangle({ x: 20, y: 250, width: 80, height: 60, color: rgb(1, 0, 0) });
  const ctx = doc.context;
  const form = ctx.register(ctx.stream("0 1 0 rg 0 0 50 50 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 50, 50], Group: { S: "Transparency", CS: "DeviceRGB" } }));
  const fn = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [1, 0, 0], C1: [0, 0, 1], N: 1 }));
  const shading = ctx.register(ctx.obj({ ShadingType: 2, ColorSpace: "DeviceRGB", Coords: [0, 0, 100, 0], Function: fn, Background: [1, 1, 0] }));
  const tile = ctx.register(ctx.stream("1 0 1 rg 0 0 4 4 re f", { Type: "Pattern", PatternType: 1, PaintType: 1, TilingType: 1, BBox: [0, 0, 8, 8], XStep: 8, YStep: 8, Resources: {} }));
  const res = page.node.Resources()!;
  res.set(N("XObject"), ctx.obj({ Fm0: form }));
  res.set(N("Shading"), ctx.obj({ Sh0: shading }));
  res.set(N("Pattern"), ctx.obj({ Pt0: tile }));
  const extra = ctx.register(ctx.stream("q /Fm0 Do Q q 150 150 100 50 re W n /Sh0 sh Q /Pattern cs /Pt0 scn 300 300 50 50 re f"));
  page.node.set(N("Contents"), ctx.obj([page.node.get(N("Contents")), extra].flatMap((c) => (c instanceof PDFArray ? c.asArray() : [c]))));
  const look = ctx.register(ctx.stream("1 1 0 rg 0 0 100 20 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 20] }));
  const note = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Square", Rect: [50, 50, 150, 70], C: [1, 0, 0], IC: [0, 0, 1], AP: { N: look }, DA: ctx.obj("x") }));
  (ctx.lookup(note) as PDFDict).set(N("DA"), (await import("@cantoo/pdf-lib")).PDFString.of("/Helv 12 Tf 0 0 1 rg"));
  page.node.set(N("Annots"), ctx.obj([note]));
  return { bytes: await doc.save(), refs: { form, shading, tile, look, note } };
}
const streamText = (doc: PDFDocument, ref: PDFRef) => text(decodePDFRawStream(doc.context.lookup(ref) as PDFRawStream).decode());
const pageText = (doc: PDFDocument) => {
  const c = doc.getPage(0).node.Contents();
  const refs = c instanceof PDFArray ? c.asArray() : [doc.getPage(0).node.get(N("Contents"))!];
  return refs.map((r) => streamText(doc, r as PDFRef)).join("\n");
};
const COLOUR_OPS = /(?:^|\s)(rg|RG|k|K)(?=\s|$)/;

describe("the whole file (spec F13 §1)", () => {
  it("AC-1420: page content, forms, patterns and annotation looks hold no colour operator", async () => {
    const { bytes: file, refs } = await colourful();
    const out = await grayscalePdf({ bytes: file, vector: true });
    expect(out.warnings).toBeUndefined();
    const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
    const content = pageText(doc);
    expect(content).not.toMatch(COLOUR_OPS);
    expect(content).toContain("0.114 g");
    expect(content).toContain("<426C756520776F726473> Tj"); // the text is still text
    for (const ref of [refs.form, refs.tile, refs.look]) expect(streamText(doc, ref)).not.toMatch(COLOUR_OPS);
    expect(streamText(doc, refs.form)).toContain("0.587 g");
    const group = (doc.context.lookup(refs.form) as PDFRawStream).dict.lookup(N("Group"), PDFDict);
    expect(group.get(N("CS"))).toBe(N("DeviceGray"));
  });

  it("AC-1421: a gradient keeps its shape with a grey colour function", async () => {
    const { bytes: file, refs } = await colourful();
    const doc = await PDFDocument.load((await grayscalePdf({ bytes: file, vector: true })).bytes, { updateMetadata: false });
    const shading = doc.context.lookup(refs.shading, PDFDict);
    expect(shading.get(N("ColorSpace"))).toBe(N("DeviceGray"));
    expect(shading.lookup(N("Coords"), PDFArray).size()).toBe(4);
    expect(shading.lookup(N("Background"), PDFArray).asArray().map((v) => (v as PDFNumber).asNumber())).toEqual([expect.closeTo(0.886, 3)]);
    const fn = shading.lookup(N("Function")) as PDFRawStream;
    expect((fn.dict.lookup(N("FunctionType")) as PDFNumber).asNumber()).toBe(0);
    const samples = decodePDFRawStream(fn).decode();
    expect(samples.length).toBe(256);
    expect(samples[0]).toBe(76); // red
    expect(samples[255]).toBe(29); // blue
  });

  it("AC-1422: annotation colours and field text colours turn grey", async () => {
    const { bytes: file, refs } = await colourful();
    const doc = await PDFDocument.load((await grayscalePdf({ bytes: file, vector: true })).bytes, { updateMetadata: false });
    const note = doc.context.lookup(refs.note, PDFDict);
    const nums = (key: string) => note.lookup(N(key), PDFArray).asArray().map((v) => (v as PDFNumber).asNumber());
    expect(nums("C")).toEqual([expect.closeTo(0.299, 3)]);
    expect(nums("IC")).toEqual([expect.closeTo(0.114, 3)]);
    expect(text((note.lookup(N("DA")) as unknown as { asBytes(): Uint8Array }).asBytes())).toBe("/Helv 12 Tf 0.114 g");
  });

  it("AC-1423: pictures only leaves text and drawings as they are", async () => {
    const { bytes: file } = await colourful();
    const doc = await PDFDocument.load((await grayscalePdf({ bytes: file, vector: false, images: [] })).bytes, { updateMetadata: false });
    expect(pageText(doc)).toMatch(COLOUR_OPS);
  });
});

/** One page drawing a 2 × 2 RGB picture (red, green / blue, white) and a grey one. */
async function withPictures() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const ctx = doc.context;
  const colour = ctx.register(ctx.flateStream(Uint8Array.of(255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255), { Type: "XObject", Subtype: "Image", Width: 2, Height: 2, BitsPerComponent: 8, ColorSpace: "DeviceRGB", Decode: [0, 1, 0, 1, 0, 1] }));
  const grey = ctx.register(ctx.flateStream(Uint8Array.of(0, 255), { Type: "XObject", Subtype: "Image", Width: 2, Height: 1, BitsPerComponent: 8, ColorSpace: "DeviceGray" }));
  const unused = ctx.register(ctx.flateStream(Uint8Array.of(9, 9, 9), { Type: "XObject", Subtype: "Image", Width: 1, Height: 1, BitsPerComponent: 8, ColorSpace: "DeviceRGB" }));
  page.node.Resources()!.set(N("XObject"), ctx.obj({ Im0: colour, Im1: grey }));
  page.node.set(N("Contents"), ctx.register(ctx.stream("q 100 0 0 100 0 0 cm /Im0 Do Q q 50 0 0 25 0 120 cm /Im1 Do Q")));
  doc.catalog.set(N("Spare"), unused);
  return { bytes: await doc.save(), colour, unused };
}
const key = (ref: PDFRef) => `${ref.objectNumber}R`;
/** Undoes the PNG row filters (none, left, up, Paeth). */
function unfilter(data: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const kind = data[y * (width + 1)];
    for (let x = 0; x < width; x++) {
      const a = x ? out[y * width + x - 1] : 0;
      const b = y ? out[(y - 1) * width + x] : 0;
      const c = x && y ? out[(y - 1) * width + x - 1] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      out[y * width + x] = (data[y * (width + 1) + 1 + x] + [0, a, b, 0, paeth][kind]) & 255;
    }
  }
  return out;
}

describe("mesh gradients and real files (spec F13 §1)", () => {
  it("AC-1424: a mesh gradient keeps its points and gets one grey value per corner", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const ctx = doc.context;
    // A triangle (flag, x, y, r, g, b a byte each), then a patch mesh row would follow the same way.
    const data = Uint8Array.of(0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0, 128, 255, 0, 0, 255);
    const mesh = ctx.register(ctx.stream(data, { ShadingType: 4, ColorSpace: "DeviceRGB", BitsPerCoordinate: 8, BitsPerComponent: 8, BitsPerFlag: 8, Decode: [0, 200, 0, 200, 0, 1, 0, 1, 0, 1] }));
    page.node.Resources()!.set(N("Shading"), ctx.obj({ Sh0: mesh }));
    page.node.set(N("Contents"), ctx.register(ctx.stream("/Sh0 sh")));
    const out = await grayscalePdf({ bytes: await doc.save(), vector: true });
    expect(out.warnings).toBeUndefined();
    const after = (await PDFDocument.load(out.bytes, { updateMetadata: false })).context.lookup(mesh) as PDFRawStream;
    expect(after.dict.get(N("ColorSpace"))).toBe(N("DeviceGray"));
    expect(after.dict.lookup(N("Decode"), PDFArray).asArray().map((v) => (v as PDFNumber).asNumber())).toEqual([0, 200, 0, 200, 0, 1]);
    expect([...decodePDFRawStream(after).decode()]).toEqual([0, 0, 0, 76, 0, 255, 0, 150, 0, 128, 255, 29]);
  });

  it("AC-1425: every fixture file converts and keeps its pages", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = "tests/fixtures";
    const passwords: Record<string, string> = { "user-pw.pdf": "secret", "user-pw-2.pdf": "secret", "aes-128.pdf": "secret", "rc4-128.pdf": "secret" };
    let converted = 0;
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".pdf") && !/corrupt|empty|too-many|big-250/.test(f))) {
      const file = new Uint8Array(readFileSync(`${dir}/${name}`));
      let before: number;
      try {
        before = (await PDFDocument.load(file, { updateMetadata: false, password: passwords[name] })).getPageCount();
      } catch {
        continue; // needs a password this list does not have
      }
      const out = await grayscalePdf({ bytes: file, password: passwords[name], vector: true });
      const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
      expect(doc.getPageCount(), name).toBe(before);
      for (const page of doc.getPages().slice(0, 3)) {
        const c = page.node.Contents();
        const refs = c instanceof PDFArray ? c.asArray() : page.node.get(N("Contents")) ? [page.node.get(N("Contents"))!] : [];
        for (const r of refs) expect(streamText(doc, r as PDFRef), name).not.toMatch(COLOUR_OPS);
      }
      converted++;
    }
    expect(converted).toBeGreaterThan(20);
  }, 60_000);
});

describe("pictures (spec F13 §1)", () => {
  it("AC-1430: the pictures that hold colour are found; grey ones are not", async () => {
    const { bytes: file, colour, unused } = await withPictures();
    const found = await colourImages({ bytes: file });
    expect(found.pageCount).toBe(1);
    expect(found.images.map((i) => i.ref).sort()).toEqual([key(colour), key(unused)].sort());
    expect(found.images.find((i) => i.ref === key(colour))).toMatchObject({ width: 2, height: 2 });
    expect(found.images.every((i) => !i.lossy)).toBe(true);
  });

  it("AC-1431: a grey picture takes the colour one's place, under the same reference", async () => {
    const { bytes: file, colour } = await withPictures();
    const pixels = Uint8Array.of(76, 150, 29, 255);
    const out = await grayscalePdf({ bytes: file, vector: true, images: [{ ref: key(colour), width: 2, height: 2, jpeg: false, predictor: true, data: encodeGrayFlate(pixels, 2, 2) }] });
    // The picture no page draws is not counted as left over.
    expect(out.warnings).toBeUndefined();
    const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
    const image = doc.getPage(0).node.Resources()!.lookup(N("XObject"), PDFDict).lookup(N("Im0")) as PDFRawStream;
    expect(image.dict.get(N("ColorSpace"))).toBe(N("DeviceGray"));
    expect(image.dict.has(N("Decode"))).toBe(false);
    expect((image.dict.lookup(N("DecodeParms"), PDFDict).lookup(N("Predictor")) as PDFNumber).asNumber()).toBe(15);
    expect([...unfilter(unzlibSync(image.contents), 2, 2)]).toEqual([...pixels]);
  });

  it("AC-1435: a soft mask that asked for its matte colour to be taken out no longer does", async () => {
    const { bytes: file, colour } = await withPictures();
    const before = await PDFDocument.load(file, { updateMetadata: false });
    const ctx = before.context;
    const mask = ctx.register(ctx.flateStream(Uint8Array.of(255, 128, 0, 255), { Type: "XObject", Subtype: "Image", Width: 2, Height: 2, BitsPerComponent: 8, ColorSpace: "DeviceGray", Matte: [1, 1, 1] }));
    (ctx.lookup(colour) as PDFRawStream).dict.set(N("SMask"), mask);
    const out = await grayscalePdf({ bytes: await before.save(), vector: true, images: [{ ref: key(colour), width: 2, height: 2, jpeg: false, predictor: true, data: encodeGrayFlate(Uint8Array.of(1, 2, 3, 4), 2, 2) }] });
    const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
    const image = doc.getPage(0).node.Resources()!.lookup(N("XObject"), PDFDict).lookup(N("Im0")) as PDFRawStream;
    const soft = image.dict.lookup(N("SMask")) as PDFRawStream;
    expect(soft.dict.has(N("Matte"))).toBe(false);
    expect([...decodePDFRawStream(soft).decode()]).toEqual([255, 128, 0, 255]);
  });

  it("AC-1436: a picture decoded larger than its own size is brought back to it", async () => {
    const { shrinkGray } = await import("./grayscale-run");
    expect([...shrinkGray(Uint8Array.of(0, 100, 200, 255, 0, 100, 200, 255, 10, 10, 20, 20, 10, 10, 20, 20), 4, 4, 2, 2)]).toEqual([50, 228, 10, 20]);
  });

  it("AC-1432: a picture that was not handed over is named in the result", async () => {
    const { bytes: file } = await withPictures();
    const out = await grayscalePdf({ bytes: file, vector: true, images: [] });
    expect(out.warnings).toEqual(["One picture could not be converted, so it keeps its colour."]);
  });

  it("AC-1433: lossless packing gives back every pixel", () => {
    const w = 37;
    const h = 23;
    const px = new Uint8Array(w * h);
    for (let i = 0; i < px.length; i++) px[i] = (i * 7 + (i % w) * 3 + ((i / w) | 0) * 11) & 255;
    expect([...unfilter(unzlibSync(encodeGrayFlate(px, w, h)), w, h)]).toEqual([...px]);
    expect(zlibSync(px).length).toBeGreaterThan(0);
  });

  it("AC-1434: a photo becomes a one-channel JPEG any reader can decode", () => {
    const w = 50;
    const h = 35;
    const px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = Math.round(127 + 100 * Math.sin(x / 9) * Math.cos(y / 7));
    const jpeg = encodeGrayJpeg(px, w, h);
    expect([jpeg[0], jpeg[1], jpeg[jpeg.length - 2], jpeg[jpeg.length - 1]]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    const image = new JpegImage();
    image.parse(jpeg);
    expect([image.width, image.height, image.numComponents]).toEqual([w, h, 1]);
    const back = image.getData({ width: w, height: h, forceRGB: false, isSourcePDF: true });
    let worst = 0;
    for (let i = 0; i < px.length; i++) worst = Math.max(worst, Math.abs(back[i] - px[i]));
    expect(worst).toBeLessThan(12);
    // Flat white stays white: no grey haze on paper-white areas.
    const white = new JpegImage();
    white.parse(encodeGrayJpeg(new Uint8Array(64 * 3).fill(255), 24, 8));
    expect([...white.getData({ width: 24, height: 8, forceRGB: false, isSourcePDF: true })].every((v) => v === 255)).toBe(true);
  });
});
