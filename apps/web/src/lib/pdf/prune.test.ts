import { deflateSync } from "node:zlib";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, StandardFonts } from "@cantoo/pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { buildDocuments } from "./build";
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
    const used = new Set<string>();
    collectNames(new TextEncoder().encode("q /Im1 Do /F1 12 Tf/GS0 gs[/P0]scn /Im#202 Do (/InString) Tj % /InComment\n"), used);
    for (const n of ["Im1", "F1", "GS0", "P0", "Im 2", "InString", "InComment"]) expect(used.has(n), n).toBe(true);
  });
  it("review 7: adds plain strings and never touches pdf-lib's global name pool", () => {
    const spy = vi.spyOn(PDFName, "of");
    try {
      const used = new Set<string>();
      collectNames(new TextEncoder().encode("/Unique9f3a1 Do /Other#20Name Do"), used);
      expect(used.has("Unique9f3a1")).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
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

  it("review 1: a Flate content stream with a PNG predictor is not decodable by pdf-lib, so the page keeps everything", async () => {
    const text = Buffer.from("q 100 0 0 100 0 0 cm /Im2 Do Q\n");
    const cols = 8;
    const rows: number[] = [];
    let prev = new Uint8Array(cols);
    for (let r = 0; r * cols < text.length; r++) {
      const row = new Uint8Array(cols);
      row.set(text.subarray(r * cols, r * cols + cols));
      rows.push(2, ...row.map((b, i) => (b - prev[i]) & 255)); // PNG "Up"
      prev = row;
    }
    const { doc } = await sharedDoc(["", "/Im1 Do"]);
    const ctx = doc.context;
    doc.getPage(0).node.set(N("Contents"), ctx.register(PDFRawStream.of(ctx.obj({ Filter: "FlateDecode", DecodeParms: { Predictor: 12, Columns: cols } } as never) as unknown as PDFDict, deflateSync(Buffer.from(rows)))));
    // A predictor inside a filter array counts too.
    doc.getPage(1).node.set(N("Contents"), ctx.register(PDFRawStream.of(ctx.obj({ Filter: ["FlateDecode"], DecodeParms: [{ Predictor: 2, Columns: cols }] } as never) as unknown as PDFDict, deflateSync(Buffer.from("/Im1 Do")))));
    const loaded = await reload(doc);
    const pruner = createPruner(loaded.context, loaded.getPages());
    expect(pruner.forPage(0)).toBeUndefined();
    expect(pruner.forPage(1)).toBeUndefined();
  });

  it("review 2: a chain of 70 resource-less forms (in reverse dictionary order) is followed to the end", async () => {
    const { doc } = await sharedDoc(["/F0 Do", "/Im1 Do"], (d) => {
      const o: Record<string, PDFRef> = {};
      for (let i = 69; i >= 0; i--) o[`F${i}`] = form(d, i === 69 ? "/Im2 Do" : `/F${i + 1} Do`);
      return o;
    });
    const loaded = await reload(doc);
    const kept = keysOf(createPruner(loaded.context, loaded.getPages()).forPage(0), "XObject");
    expect(kept).toContain("Im2");
    expect(kept).toHaveLength(71); // F0..F69 and Im2
  });

  it("review 6: follows a soft mask group (ExtGState /SMask /G) that has no /Resources", async () => {
    const { doc } = await sharedDoc(["/GS0 gs /Im1 Do", "/Im1 Do"]);
    const ctx = doc.context;
    const res = ctx.lookup(doc.getPage(0).node.get(N("Resources"))) as PDFDict;
    res.set(N("ExtGState"), ctx.obj({ GS0: ctx.obj({ Type: "ExtGState", SMask: ctx.obj({ S: "Luminosity", G: form(doc, "/Im3 Do", { Group: { S: "Transparency" } }) }) }) } as never));
    const loaded = await reload(doc);
    expect(keysOf(createPruner(loaded.context, loaded.getPages()).forPage(0), "XObject")).toEqual(["Im1", "Im3"]);
  });

  it("review 6: a form or appearance whose /Resources is a dangling reference draws with the page's", async () => {
    const { doc } = await sharedDoc(["/Fm Do", "/Im1 Do"], (d) => ({ Fm: form(d, "/Im3 Do", { Resources: PDFRef.of(9999) }) }));
    const ctx = doc.context;
    const ap = ctx.register(ctx.stream("/Im2 Do", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 10, 10], Resources: PDFRef.of(9998) } as never));
    doc.getPage(0).node.set(N("Annots"), ctx.obj([ctx.register(ctx.obj({ Type: "Annot", Subtype: "Square", Rect: [0, 0, 10, 10], AP: ctx.obj({ N: ap }) }))]));
    const loaded = await reload(doc);
    expect(keysOf(createPruner(loaded.context, loaded.getPages()).forPage(0), "XObject")).toEqual(["Fm", "Im2", "Im3"]);
  });

  it("review 4: malformed resources never fail the job; the page keeps what it has", async () => {
    const make = async (mut: (d: PDFDocument) => void) => {
      const d = await PDFDocument.create();
      d.addPage().drawText("one");
      d.addPage().drawText("two");
      mut(d);
      return d.save({ useObjectStreams: false });
    };
    const cases: ((d: PDFDocument) => void)[] = [
      (d) => d.getPage(0).node.set(N("Resources"), d.context.register(d.context.obj([1, 2]))),
      (d) => d.getPage(0).node.set(N("Resources"), PDFRef.of(9999)),
      (d) => d.getPage(0).node.Resources()!.set(N("XObject"), d.context.register(d.context.obj(5))),
      (d) => {
        const p = d.getPage(0).node;
        p.set(N("Contents"), d.context.obj([p.get(N("Contents"))!, 7]));
      },
    ];
    for (const mut of cases) {
      const bytes = await make(mut);
      const loaded = await PDFDocument.load(bytes);
      expect(() => createPruner(loaded.context, loaded.getPages()).forPage(0)).not.toThrow();
      const r = await buildDocuments({ sources: [{ id: "x", name: "x.pdf", kind: "pdf", source: new Blob([bytes]) }], documents: [{ name: "a.pdf", pages: [{ sourceId: "x", sourceIndex: 0, rotation: 0 }] }] }, {}, () => {});
      expect(r.documents[0].pageCount).toBe(1);
    }
  });

  it("review 12: a stream shared by several pages is scanned once", async () => {
    const { doc } = await sharedDoc(["/Fm Do", "/Fm Do /Im1 Do", "/Fm Do /Im2 Do"], (d) => ({ Fm: form(d, "/Im3 Do") }));
    const loaded = await reload(doc);
    const fm = loaded.context.lookup((loaded.context.lookup(loaded.getPage(0).node.get(N("Resources"))) as PDFDict).lookup(N("XObject"), PDFDict).get(N("Fm"))) as PDFRawStream;
    let reads = 0;
    const contents = fm.contents;
    Object.defineProperty(fm, "contents", { get: () => (reads++, contents) });
    const pruner = createPruner(loaded.context, loaded.getPages());
    for (const i of [0, 1, 2]) expect(keysOf(pruner.forPage(i), "XObject")).toContain("Im3");
    expect(reads).toBe(1);
  });
});
