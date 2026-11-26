import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream, StandardFonts } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { renderPage } from "../forms/test-helpers";
import { defaultMergeOptions } from "./merge-options";
import { mergePdf } from "./merge";
import { collectNames, createPruner } from "./prune";

const N = PDFName.of;
const keysOf = (d: PDFDict | undefined, cat: string) => {
  const sub = d?.lookup(N(cat));
  return sub instanceof PDFDict ? sub.keys().map((k) => k.decodeText()).sort() : [];
};
const image = (doc: PDFDocument, shade: number) =>
  doc.context.register(doc.context.stream(new Uint8Array(4 * 4 * 3).fill(shade), { Type: "XObject", Subtype: "Image", Width: 4, Height: 4, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }));
const form = (doc: PDFDocument, content: string, extra: Record<string, unknown> = {}) =>
  doc.context.register(doc.context.stream(content, { Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 100], ...extra } as never));

/** A 3-page document whose pages share one resource dict with images Im1-Im3 (+ any extra XObjects); page n draws `draws[n]`. */
async function sharedDoc(draws: string[], extraX: (doc: PDFDocument) => Record<string, PDFRef> = () => ({})) {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const x: Record<string, PDFRef> = { Im1: image(doc, 40), Im2: image(doc, 120), Im3: image(doc, 200), ...extraX(doc) };
  const shared = ctx.register(ctx.obj({ XObject: ctx.obj(x), ProcSet: ["PDF", "ImageC"] }));
  draws.forEach((d) => {
    const p = doc.addPage([200, 200]);
    p.node.set(N("Resources"), shared);
    p.node.set(N("Contents"), ctx.register(ctx.stream(d)));
  });
  return { doc, shared, x };
}

/** Round trip through bytes so streams are raw (as in a loaded file). */
const reload = async (doc: PDFDocument) => PDFDocument.load(await doc.save({ useObjectStreams: false }));

describe("collectNames", () => {
  it("finds every name token, with #-escapes decoded", () => {
    const used = new Set<PDFName>();
    collectNames(new TextEncoder().encode("q /Im1 Do /F1 12 Tf/GS0 gs[/P0]scn /Im#202 Do (/InString) Tj % /InComment\n"), used);
    for (const n of ["Im1", "F1", "GS0", "P0", "Im 2", "InString", "InComment"]) expect(used.has(N(n)), n).toBe(true);
  });
});

describe("createPruner (I-1)", () => {
  it("keeps only the names a page uses; non-category entries stay", async () => {
    const { doc } = await sharedDoc(["q 100 0 0 100 0 0 cm /Im1 Do Q", "q 100 0 0 100 0 0 cm /Im2 Do Q", "q 100 0 0 100 0 0 cm /Im3 Do Q"]);
    const loaded = await reload(doc);
    const pruner = createPruner(loaded.context, loaded.getPages());
    const res = pruner.forPage(1);
    expect(keysOf(res, "XObject")).toEqual(["Im2"]);
    expect(res?.lookup(N("ProcSet"))).toBeInstanceOf(PDFArray);
    expect(pruner.forPage(1)).toBe(res); // cached
  });

  it("returns undefined when nothing can be dropped", async () => {
    const { doc } = await sharedDoc(["/Im1 Do /Im2 Do /Im3 Do"]);
    const loaded = await reload(doc);
    expect(createPruner(loaded.context, loaded.getPages()).forPage(0)).toBeUndefined();
  });

  it("follows a form without /Resources (it draws with the page's)", async () => {
    const { doc } = await sharedDoc(["/Fm1 Do", "/Im2 Do"], (d) => ({ Fm1: form(d, "q 100 0 0 100 0 0 cm /Im3 Do Q") }));
    const loaded = await reload(doc);
    expect(keysOf(createPruner(loaded.context, loaded.getPages()).forPage(0), "XObject")).toEqual(["Fm1", "Im3"]);
  });

  it("prunes a form that has its own /Resources pointing at the shared dict (a pruned clone)", async () => {
    const doc = await PDFDocument.create();
    const ctx = doc.context;
    const imgs = { Im1: image(doc, 40), Im2: image(doc, 120), Im3: image(doc, 200) };
    const shared = ctx.register(ctx.obj({ XObject: ctx.obj(imgs) }));
    const fm = form(doc, "q 100 0 0 100 0 0 cm /Im3 Do Q", { Resources: shared });
    (ctx.lookup(shared) as PDFDict).lookup(N("XObject"), PDFDict).set(N("Fm1"), fm);
    for (const c of ["/Fm1 Do", "/Im1 Do"]) {
      const p = doc.addPage([200, 200]);
      p.node.set(N("Resources"), shared);
      p.node.set(N("Contents"), ctx.register(ctx.stream(c)));
    }
    const bytes = await doc.save({ useObjectStreams: false });
    const loaded = await PDFDocument.load(bytes);
    const res = createPruner(loaded.context, loaded.getPages()).forPage(0);
    expect(keysOf(res, "XObject")).toEqual(["Fm1"]);
    const clone = loaded.context.lookup(res!.lookup(N("XObject"), PDFDict).get(N("Fm1")));
    expect(clone).toBeInstanceOf(PDFStream);
    expect(keysOf((clone as PDFStream).dict.lookup(N("Resources"), PDFDict), "XObject")).toEqual(["Im3"]);

    // The copy renders the same and holds one image, not three.
    const r = await mergePdf({ sources: [{ id: "a", name: "f.pdf", kind: "pdf", source: new Blob([bytes]) }], pages: [{ sourceId: "a", sourceIndex: 0, rotation: 0 }], options: defaultMergeOptions }, {}, () => {});
    const out = await PDFDocument.load(r.bytes);
    const images = out.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFStream && o.dict.get(N("Subtype")) === N("Image"));
    expect(images).toHaveLength(1);
    const [a, b] = await Promise.all([renderPage(bytes, 1, 1, false), renderPage(r.bytes, 1, 1, false)]);
    expect(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data))).toBe(0);
  });

  it("keeps names written with #-escapes", async () => {
    const { doc } = await sharedDoc(["/Im#31 Do"]); // "Im1"
    const loaded = await reload(doc);
    expect(keysOf(createPruner(loaded.context, loaded.getPages()).forPage(0), "XObject")).toEqual(["Im1"]);
  });

  it("follows Type 3 glyphs without /Resources", async () => {
    const doc = await PDFDocument.create();
    const ctx = doc.context;
    const glyph = ctx.register(ctx.stream("0 0 d0 /Im2 Do"));
    const t3 = ctx.register(ctx.obj({ Type: "Font", Subtype: "Type3", FontBBox: [0, 0, 1, 1], FontMatrix: [1, 0, 0, 1, 0, 0], CharProcs: ctx.obj({ a: glyph }), Encoding: ctx.obj({ Differences: [97, "a"] }), FirstChar: 97, LastChar: 97, Widths: [1] }));
    const shared = ctx.register(ctx.obj({ Font: ctx.obj({ T3: t3 }), XObject: ctx.obj({ Im1: image(doc, 1), Im2: image(doc, 2) }) }));
    const p = doc.addPage([100, 100]);
    p.node.set(N("Resources"), shared);
    p.node.set(N("Contents"), ctx.register(ctx.stream("BT /T3 10 Tf (a) Tj ET")));
    doc.addPage([100, 100]).node.set(N("Resources"), shared);
    const loaded = await reload(doc);
    const res = createPruner(loaded.context, loaded.getPages()).forPage(0);
    expect(keysOf(res, "Font")).toEqual(["T3"]);
    expect(keysOf(res, "XObject")).toEqual(["Im2"]);
  });

  it("keeps names used by annotation appearances without /Resources", async () => {
    const { doc } = await sharedDoc(["/Im1 Do"]);
    const ctx = doc.context;
    const ap = ctx.register(ctx.stream("/Im3 Do", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 10, 10] }));
    doc.getPage(0).node.set(N("Annots"), ctx.obj([ctx.register(ctx.obj({ Type: "Annot", Subtype: "Square", Rect: [0, 0, 10, 10], AP: ctx.obj({ N: ap }) }))]));
    const loaded = await reload(doc);
    expect(keysOf(createPruner(loaded.context, loaded.getPages()).forPage(0), "XObject")).toEqual(["Im1", "Im3"]);
  });

  it("keeps everything for a page whose content cannot be decoded", async () => {
    const { doc } = await sharedDoc(["/Im1 Do"]);
    const ctx = doc.context;
    doc.getPage(0).node.set(N("Contents"), ctx.register(ctx.stream("garbage", { Filter: "NoSuchDecode" })));
    const loaded = await reload(doc);
    expect(createPruner(loaded.context, loaded.getPages()).forPage(0)).toBeUndefined();
  });

  it("keeps a form whole when its content cannot be decoded, and still prunes the page", async () => {
    const { doc } = await sharedDoc(["/Fm1 Do"], (d) => ({ Fm1: form(d, "garbage", { Filter: "NoSuchDecode", Resources: d.context.obj({ XObject: d.context.obj({ Im9: image(d, 9) }) }) }) }));
    const loaded = await reload(doc);
    const res = createPruner(loaded.context, loaded.getPages()).forPage(0);
    expect(keysOf(res, "XObject")).toEqual(["Fm1"]);
    const fm = loaded.context.lookup(res!.lookup(N("XObject"), PDFDict).get(N("Fm1")));
    expect(keysOf((fm as PDFStream).dict.lookup(N("Resources"), PDFDict), "XObject")).toEqual(["Im9"]);
  });

  it("works on inherited resources, fonts included", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const ctx = doc.context;
    const p1 = doc.addPage([200, 200]);
    p1.drawText("Hi", { font, size: 12, x: 10, y: 10 });
    const fonts = p1.node.Resources()!.lookup(N("Font"), PDFDict);
    const shared = ctx.register(ctx.obj({ Font: fonts, XObject: ctx.obj({ Im1: image(doc, 1), Im2: image(doc, 2) }) }));
    doc.addPage([200, 200]);
    for (const p of doc.getPages()) p.node.delete(N("Resources"));
    doc.catalog.Pages().set(N("Resources"), shared);
    const loaded = await reload(doc);
    const pruner = createPruner(loaded.context, loaded.getPages());
    expect(keysOf(pruner.forPage(0), "Font")).toHaveLength(1);
    expect(keysOf(pruner.forPage(0), "XObject")).toEqual([]);
    expect(pruner.forPage(0)?.get(N("XObject"))).toBeUndefined();
  });
});
