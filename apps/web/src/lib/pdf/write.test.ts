/**
 * The compact writer (eval G-2, M8): page-tool outputs at or below the reference sizes on the eval's
 * tasks, nothing unused written, no font, image or other stream written twice (across pages and across
 * files), every object but the streams in object streams, and the pages unchanged.
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream, type PDFContext, type PDFObject } from "@cantoo/pdf-lib";
import { zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { interleave } from "@/lib/mix-plan";
import { parsePageRanges } from "@/lib/page-ranges";
import { pagesPerFile, planDelete, planExtract, type OutputPlan, type PlanFile } from "@/lib/page-plans";
import { buildDocuments } from "./build";
import { mergePdf, type MergePageInput, type MergeSourceInput } from "./merge";
import { ALTERNATE_OPTIONS, ORGANIZE_OPTIONS, defaultMergeOptions } from "./merge-options";
import { bucketOf, compact, saveCompact } from "./write";

const dir = new URL("../../../tests/fixtures/", import.meta.url);
const fx: Record<string, Uint8Array> = {};
const load = async (n: string) => (fx[n] ??= new Uint8Array(await readFile(new URL(n, dir))));
const file = async (n: string): Promise<PlanFile> => ({ id: n, name: n, pageCount: (await PDFDocument.load(await load(n))).getPageCount() });
const source = (n: string): MergeSourceInput => ({ id: n, name: n, kind: "pdf", source: new Blob([fx[n] as Uint8Array<ArrayBuffer>]) });
const all = (n: string, k: number): MergePageInput[] => Array.from({ length: k }, (_, i) => ({ sourceId: n, sourceIndex: i, rotation: 0 }));
function items(text: string) {
  const r = parsePageRanges(text);
  if (!r.ok) throw new Error(text);
  return r.items;
}
async function build(plan: OutputPlan) {
  const ids = [...new Set(plan.documents.flatMap((d) => d.pages.map((p) => p.sourceId)))];
  return (await buildDocuments({ sources: ids.map(source), documents: plan.documents, options: { bookmarks: "keep" } }, {}, () => {})).documents;
}
async function merge(names: string[], pages: MergePageInput[], options = defaultMergeOptions) {
  return (await mergePdf({ sources: [...new Set(names)].map(source), pages, options }, {}, () => {})).bytes;
}

function refsIn(obj: PDFObject | undefined, out: PDFRef[]) {
  if (obj instanceof PDFRef) out.push(obj);
  else if (obj instanceof PDFRawStream) refsIn(obj.dict, out);
  else if (obj instanceof PDFDict) for (const [, v] of obj.entries()) refsIn(v, out);
  else if (obj instanceof PDFArray) for (let i = 0; i < obj.size(); i++) refsIn(obj.get(i), out);
}
/** Objects the trailer cannot reach, and streams written more than once. */
function waste(context: PDFContext) {
  const seen = new Set<PDFRef>();
  const todo: PDFRef[] = [];
  refsIn(context.trailerInfo.Root as PDFObject, todo);
  refsIn(context.trailerInfo.Info as PDFObject | undefined, todo);
  while (todo.length) {
    const r = todo.pop()!;
    if (seen.has(r)) continue;
    seen.add(r);
    refsIn(context.lookup(r), todo);
  }
  const streams = new Map<string, number>();
  let unreachable = 0;
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    // The file's own cross-reference and object streams, which pdf-lib keeps as objects when it reads one.
    const type = obj instanceof PDFRawStream ? obj.dict.get(PDFName.of("Type")) : undefined;
    if (type === PDFName.of("XRef") || type === PDFName.of("ObjStm")) continue;
    if (!seen.has(ref)) unreachable++;
    if (obj instanceof PDFRawStream) {
      const key = `${obj.dict.toString()}|${Buffer.from(obj.getContents()).toString("base64")}`;
      streams.set(key, (streams.get(key) ?? 0) + 1);
    }
  }
  return { unreachable, twice: [...streams.values()].filter((n) => n > 1).length };
}
/** Plain (not in an object stream) objects written in the file, besides streams. */
const plainDicts = (bytes: Uint8Array) => (Buffer.from(bytes).toString("latin1").match(/\d+ 0 obj\s*<<(?![^]*?>>\s*stream)/g) ?? []).length;

/**
 * What an object means, as plain data: references followed (back links such as /Parent, /Prev, /Last
 * and an annotation's /P left out, so shared objects and cycles read the same either way), streams
 * decoded (their /Length and /Filter are how they are stored, not what they say), entries that say
 * nothing (an empty array or dictionary) left out, as the writer leaves them out.
 */
const BACK = new Set(["Parent", "Prev", "Last", "P"]);
const STORAGE = new Set(["Length", "Filter", "DecodeParms"]);
function meaning(obj: PDFObject | undefined, ctx: PDFContext, depth = 0): unknown {
  if (depth > 60) return "…";
  if (obj instanceof PDFRef) return meaning(ctx.lookup(obj), ctx, depth + 1);
  if (obj instanceof PDFRawStream) {
    let data: Uint8Array;
    let filter: unknown = null;
    try {
      data = decodePDFRawStream(obj).decode();
    } catch {
      data = obj.getContents(); // an image codec pdf-lib does not decode: the writer never touches those
      filter = meaning(obj.dict.get(PDFName.of("Filter")), ctx, depth + 1);
    }
    return { dict: meaning(obj.dict, ctx, depth + 1), filter, data: createHash("sha256").update(data).digest("hex") };
  }
  if (obj instanceof PDFDict) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of obj.entries()) {
      const key = k.decodeText();
      if (BACK.has(key) || STORAGE.has(key)) continue;
      const m = meaning(v, ctx, depth + 1);
      if ((Array.isArray(m) && !m.length) || (m && typeof m === "object" && !Array.isArray(m) && !Object.keys(m).length)) continue;
      out[key] = m;
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  if (obj instanceof PDFArray) return obj.asArray().map((v) => meaning(v, ctx, depth + 1));
  return obj?.toString();
}
const BOXES = ["MediaBox", "CropBox", "BleedBox", "TrimBox", "ArtBox"] as const;
async function meaningOfFile(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;
  const pages = doc.getPages().map((p) => ({
    contents: meaning(p.node.get(PDFName.of("Contents")), ctx),
    resources: meaning(p.node.Resources(), ctx),
    annots: meaning(p.node.Annots(), ctx) ?? [],
    boxes: BOXES.map((b) => meaning(p.node.lookup(PDFName.of(b)) ?? (b === "MediaBox" ? p.node.MediaBox() : undefined), ctx)),
    rotate: p.getRotation().angle,
  }));
  const cat = doc.catalog;
  const part = (k: string) => meaning(cat.get(PDFName.of(k)), ctx);
  return { pages, outlines: part("Outlines"), acroForm: part("AcroForm"), names: part("Names"), pageLabels: part("PageLabels") };
}

describe("saveCompact (eval G-2)", () => {
  it.each(["twelve.pdf", "links.pdf", "form.pdf", "lang-labels.pdf", "tagged-features.pdf", "inherited-res.pdf", "pre-rotated.pdf", "indirect-box.pdf", "shared-res.pdf", "scanned.pdf"])(
    "means what save() writes: %s (page contents, resources, annotations, boxes, rotation; outline, form, names, labels)",
    async (name) => {
      const bytes = await load(name);
      const plain = await (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).save();
      const small = await saveCompact(await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }));
      expect(await meaningOfFile(small)).toEqual(await meaningOfFile(plain));
    },
    30_000,
  );


  it("writes the eval's outputs at or below the reference sizes", async () => {
    const twelve = await file("twelve.pdf");
    const extract = (await build(planExtract([twelve], pagesPerFile(items("9,2-3"), [twelve]))))[0].bytes;
    const del = (await build(planDelete([twelve], pagesPerFile(items("5"), [twelve]))))[0].bytes;
    const short = await file("short.pdf");
    const sep = await file("separator.pdf");
    const mix = interleave([twelve, short, sep].map((f) => ({ sourceId: f.id, name: f.name, pageCount: f.pageCount })));
    const alternate = await merge(["twelve.pdf", "short.pdf", "separator.pdf"], mix.map((p) => ({ sourceId: p.sourceId, sourceIndex: p.sourceIndex, rotation: 0 })), ALTERNATE_OPTIONS);
    const three = await file("three-pages.pdf");
    const org = [...all("twelve.pdf", 12), ...all("three-pages.pdf", three.pageCount)];
    org[1] = { ...org[1], rotation: 90 };
    const organize = await merge(["twelve.pdf", "three-pages.pdf"], org, ORGANIZE_OPTIONS);

    const sizes = { extract: extract.length, delete: del.length, alternate: alternate.length, organize: organize.length };
    expect(sizes.extract).toBeLessThanOrEqual(1592);
    expect(sizes.delete).toBeLessThanOrEqual(3626);
    expect(sizes.alternate).toBeLessThanOrEqual(4400);
    expect(sizes.organize).toBeLessThanOrEqual(4478);

    // Same pages as asked: counts, and Organize's turned A2.
    expect((await PDFDocument.load(extract)).getPageCount()).toBe(3);
    expect((await PDFDocument.load(del)).getPageCount()).toBe(11);
    expect((await PDFDocument.load(alternate)).getPageCount()).toBe(mix.length);
    const o = await PDFDocument.load(organize);
    expect(o.getPages().map((p) => p.getRotation().angle)).toEqual(org.map((p) => p.rotation));
    for (const bytes of [extract, del, alternate, organize]) {
      expect(waste((await PDFDocument.load(bytes)).context)).toEqual({ unreachable: 0, twice: 0 });
      expect(Buffer.from(bytes).toString("latin1")).toContain("/ObjStm");
      expect(plainDicts(bytes)).toBe(0);
    }
  }, 60_000);

  it("writes a font or image two files share once (the same file twice, odd + even)", async () => {
    for (const names of [["shared-res.pdf", "shared-res.pdf"], ["odd.pdf", "even.pdf"], ["alpha.pdf", "bravo.pdf"]]) {
      const files = await Promise.all(names.map(file));
      const bytes = await merge(names, files.flatMap((f) => all(f.id, f.pageCount)));
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(files.reduce((n, f) => n + f.pageCount, 0));
      expect(waste(doc.context), names.join(" + ")).toEqual({ unreachable: 0, twice: 0 });
    }
    // The same file twice costs about one copy plus the page dictionaries.
    const one = await merge(["shared-res.pdf"], all("shared-res.pdf", (await file("shared-res.pdf")).pageCount));
    const two = await merge(["shared-res.pdf", "shared-res.pdf"], [...all("shared-res.pdf", (await file("shared-res.pdf")).pageCount), ...all("shared-res.pdf", (await file("shared-res.pdf")).pageCount)]);
    expect(two.length).toBeLessThan(one.length * 1.05);
  }, 60_000);

  it("drops objects nothing points to, and keeps what the pages use", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    page.drawText("kept");
    doc.context.register(doc.context.obj({ Orphan: PDFNumber.of(1) }));
    const bytes = await saveCompact(doc);
    const out = await PDFDocument.load(bytes);
    expect(waste(out.context)).toEqual({ unreachable: 0, twice: 0 });
    expect(out.context.enumerateIndirectObjects().some(([, o]) => o instanceof PDFDict && o.has(PDFName.of("Orphan")))).toBe(false);
    expect(out.getPageCount()).toBe(1);
    expect(out.getPage(0).node.Contents()).toBeDefined();
  });

  /** A document whose pages each draw one of `streams` (as an XObject), so nothing is pruned. */
  async function withStreams(streams: { dict: Record<string, unknown>; bytes: Uint8Array }[]) {
    const doc = await PDFDocument.create();
    streams.forEach(({ dict, bytes }, n) => {
      const ref = doc.context.register(PDFRawStream.of(doc.context.obj({ ...dict, Length: bytes.length } as never) as unknown as PDFDict, bytes));
      doc.addPage([100, 100]).node.setXObject(PDFName.of(`X${n}`), ref);
    });
    return doc;
  }
  const rawStreams = (ctx: PDFContext) => ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream).length;
  const IMAGE = { Type: "XObject", Subtype: "Image", Width: 1024, Height: 1024, BitsPerComponent: 8, ColorSpace: "DeviceGray", Filter: "DCTDecode" };
  function noise(n: number, seed: number) {
    const b = new Uint8Array(n);
    let x = seed;
    for (let i = 0; i < n; i++) b[i] = (x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 24;
    return b;
  }

  it("keeps the merge key small whatever the stream's size (no copy of its bytes)", async () => {
    const doc = await withStreams([{ dict: IMAGE, bytes: noise(4 * 1024 * 1024, 7) }]);
    const [, stream] = doc.context.enumerateIndirectObjects().find(([, o]) => o instanceof PDFRawStream)!;
    const key = bucketOf(stream)!;
    expect(key.length).toBeLessThan(300);
  });

  it("merges equal streams only: a stream that differs where the hash does not look stays", async () => {
    const big = noise(1024 * 1024, 3);
    const twin = big.slice();
    const near = big.slice();
    near[1] ^= 0xff; // between two sampled bytes: same bucket, different bytes
    const doc = await withStreams([big, twin, near].map((bytes) => ({ dict: IMAGE, bytes })));
    expect(bucketOf(doc.context.lookup(doc.getPage(2).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).get(PDFName.of("X2")) as PDFRef)!)).toBe(
      bucketOf(doc.context.lookup(doc.getPage(0).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).get(PDFName.of("X0")) as PDFRef)!),
    );
    compact(doc.context);
    expect(rawStreams(doc.context)).toBe(2);
  });

  it("merges one stream saved at two deflate levels", async () => {
    const plain = new TextEncoder().encode("0 0 m 10 10 l S\n".repeat(600));
    const form = { Type: "XObject", Subtype: "Form", BBox: [0, 0, 10, 10], Filter: "FlateDecode" };
    const doc = await withStreams([1, 9].map((level) => ({ dict: form, bytes: zlibSync(plain, { level: level as 1 | 9 }) })));
    compact(doc.context);
    const left = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream) as [PDFRef, PDFRawStream][];
    expect(left).toHaveLength(1);
    expect(new TextDecoder().decode(decodePDFRawStream(left[0][1]).decode())).toBe(new TextDecoder().decode(plain));
  });
});
