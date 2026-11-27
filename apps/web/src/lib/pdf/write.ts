/**
 * The compact writer for every page-tool and Merge output (spec F4/F5 §6, M8; eval G-2).
 *
 * pdf-lib's own save() writes the catalog, the page tree and every page dictionary as plain
 * objects (only other dictionaries go into object streams), keeps objects nothing points to, and
 * writes a font or image once per source file even when two files carry the very same one. On
 * small documents that is most of the file. This writer does what save() does to get the document
 * ready (default page, field appearances, embedded fonts and images), then, on the output only:
 *
 * 1. drops every object that the trailer cannot reach (nothing unused is written);
 * 2. merges objects that are byte-for-byte the same: any stream (fonts, images, forms, content)
 *    and font, font descriptor, encoding and graphics-state dictionaries, across pages and across
 *    source files, repeated until nothing more merges (a shared font file makes its descriptors
 *    equal, which makes the fonts equal);
 * 3. leaves out entries that say nothing: an empty /Annots, empty resource categories and
 *    /Rotate 0 where no parent sets a rotation;
 * 4. stores small Flate streams that deflate cannot shrink as they are, and compresses streams
 *    that came in uncompressed when that makes them smaller;
 * 5. writes every non-stream object, the page dictionaries included, into compressed object
 *    streams, with a cross-reference stream.
 *
 * Nothing here changes what a page shows or how the document behaves: identity only matters for
 * objects that are never merged (pages, annotations, fields, bookmarks, optional content).
 */
import {
  PDFArray,
  PDFCatalog,
  PDFDict,
  PDFHeader,
  PDFName,
  PDFNumber,
  PDFPageLeaf,
  PDFPageTree,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFStreamWriter,
  decodePDFRawStream,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
} from "@cantoo/pdf-lib";
import { zlibSync } from "fflate";

const N = (s: string) => PDFName.of(s);
const TYPE = N("Type");
const FILTER = N("Filter");
const LENGTH = N("Length");
const DECODE_PARMS = N("DecodeParms");
const FLATE = N("FlateDecode");

/** Objects in one object stream: more objects compress better together (one deflate window). */
const OBJECTS_PER_STREAM = 200;
/** Streams up to this size are re-encoded (tiny streams gain from it; big ones are left as they are). */
const RECODE_MAX = 64 * 1024;
/** Dictionary types that may be shared: merging two equal ones never changes what anything means. */
const SHAREABLE = new Set(["Font", "FontDescriptor", "Encoding", "ExtGState"]);
/** Stream types that are never merged (their identity is structural). */
const NO_MERGE_STREAM = new Set(["XRef", "ObjStm", "Metadata", "EmbeddedFile"]);

type Prepared = { prepareForSave(options: { addDefaultPage?: boolean; updateFieldAppearances?: boolean }): Promise<void> };

/** save() with the compact writer. Same preparation, smaller file, same meaning. */
export async function saveCompact(doc: PDFDocument): Promise<Uint8Array> {
  // save()'s own preparation (pdf-lib's prepareForSave: a default page when there is none,
  // field appearances, embedded fonts and images flushed into the context).
  await (doc as unknown as Prepared).prepareForSave({ addDefaultPage: true, updateFieldAppearances: true });
  const context = doc.context;
  const [major, minor] = context.header.getVersionString().split(".").map(Number);
  if (major < 1 || (major === 1 && minor < 5)) context.header = PDFHeader.forVersion(1, 7); // object streams need 1.5
  compact(context);
  // pdf-lib keeps these three kinds out of object streams; written as plain dictionaries they go in.
  const swapped: [PDFRef, PDFObject][] = [];
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (obj instanceof PDFCatalog || obj instanceof PDFPageTree || obj instanceof PDFPageLeaf) {
      swapped.push([ref, obj]);
      context.assign(ref, PDFDict.fromMapWithContext(new Map(obj.entries()), context));
    }
  }
  try {
    return await PDFStreamWriter.forContext(context, 50, true, OBJECTS_PER_STREAM).serializeToBuffer();
  } finally {
    for (const [ref, obj] of swapped) context.assign(ref, obj);
  }
}

/** Steps 1 to 4 on a context (exported for the unit tests). */
export function compact(context: PDFContext): void {
  prune(context);
  tidyPages(context);
  dedupe(context);
  recode(context);
  prune(context); // merged-away objects
}

function refsIn(obj: PDFObject | undefined, out: PDFRef[]): void {
  if (!obj) return;
  if (obj instanceof PDFRef) out.push(obj);
  else if (obj instanceof PDFDict) for (const [, v] of obj.entries()) refsIn(v, out);
  else if (obj instanceof PDFArray) for (let i = 0; i < obj.size(); i++) refsIn(obj.get(i), out);
  else if (obj instanceof PDFStream) refsIn(obj.dict, out);
}

/** Deletes every indirect object the trailer (Root, Info) cannot reach. */
function prune(context: PDFContext): void {
  const seen = new Set<PDFRef>();
  const todo: PDFRef[] = [];
  const t = context.trailerInfo;
  for (const r of [t.Root, t.Info, t.Encrypt, t.ID]) refsIn(r as PDFObject | undefined, todo);
  while (todo.length) {
    const ref = todo.pop()!;
    if (seen.has(ref)) continue;
    seen.add(ref);
    refsIn(context.lookup(ref), todo);
  }
  for (const [ref] of context.enumerateIndirectObjects()) if (!seen.has(ref)) context.delete(ref);
}

const isEmpty = (o: PDFObject | undefined) => (o instanceof PDFArray && o.size() === 0) || (o instanceof PDFDict && o.entries().length === 0);

/** Leaves out page entries that say nothing (step 3). */
function tidyPages(context: PDFContext): void {
  for (const [, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(TYPE) !== N("Page")) continue;
    if (isEmpty(obj.lookup(N("Annots")))) obj.delete(N("Annots"));
    const rotate = obj.lookup(N("Rotate"));
    if (rotate instanceof PDFNumber && rotate.asNumber() === 0 && !inheritsRotate(obj)) obj.delete(N("Rotate"));
    const res = obj.lookup(N("Resources"));
    if (res instanceof PDFDict) for (const [k, v] of res.entries()) if (k !== N("ProcSet") && v instanceof PDFDict && isEmpty(v)) res.delete(k);
  }
}

function inheritsRotate(page: PDFDict): boolean {
  let node = page.lookup(N("Parent"));
  for (let depth = 0; node instanceof PDFDict && depth < 64; depth++) {
    if (node.has(N("Rotate"))) return true;
    node = node.lookup(N("Parent"));
  }
  return false;
}

/** A merge key for an object that may be shared, or null. Refs are written as "n R", so keys only match when targets match. */
function keyOf(obj: PDFObject): string | null {
  if (obj instanceof PDFRawStream) {
    const type = obj.dict.lookup(TYPE);
    if (type instanceof PDFName && NO_MERGE_STREAM.has(type.decodeText())) return null;
    return `S${obj.dict.toString()}\u0000${bytesKey(obj.getContents())}`;
  }
  if (obj instanceof PDFStream) return null; // streams pdf-lib builds at save time (content written by us)
  if (obj instanceof PDFDict) {
    const type = obj.lookup(TYPE);
    if (!(type instanceof PDFName) || !SHAREABLE.has(type.decodeText())) return null;
    return `D${obj.toString()}`;
  }
  return null;
}

/** The bytes as a string key (a latin-1 view: exact, and Map hashes strings well). */
function bytesKey(b: Uint8Array): string {
  let s = `${b.length}:`;
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192) as unknown as number[]);
  return s;
}

/** Points every reference to a merged object at the one kept (step 2), until nothing more merges. */
function dedupe(context: PDFContext): void {
  for (let round = 0; round < 8; round++) {
    const keep = new Map<string, PDFRef>();
    const alias = new Map<PDFRef, PDFRef>();
    for (const [ref, obj] of context.enumerateIndirectObjects()) {
      const key = keyOf(obj);
      if (key === null) continue;
      const first = keep.get(key);
      if (first) alias.set(ref, first);
      else keep.set(key, ref);
    }
    if (!alias.size) return;
    for (const [, obj] of context.enumerateIndirectObjects()) rewrite(obj, alias);
    const t = context.trailerInfo as { Root?: PDFObject; Info?: PDFObject };
    if (t.Root instanceof PDFRef) t.Root = alias.get(t.Root) ?? t.Root;
    if (t.Info instanceof PDFRef) t.Info = alias.get(t.Info) ?? t.Info;
    for (const ref of alias.keys()) context.delete(ref);
  }
}

function rewrite(obj: PDFObject, alias: Map<PDFRef, PDFRef>): void {
  if (obj instanceof PDFStream) return rewrite(obj.dict, alias);
  if (obj instanceof PDFDict) {
    for (const [k, v] of obj.entries()) {
      if (v instanceof PDFRef) {
        const to = alias.get(v);
        if (to) obj.set(k, to);
      } else rewrite(v, alias);
    }
  } else if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i++) {
      const v = obj.get(i);
      if (v instanceof PDFRef) {
        const to = alias.get(v);
        if (to) obj.set(i, to);
      } else rewrite(v, alias);
    }
  }
}

/** Step 4: the smaller of the stream as it is, deflated, or plain (small streams only). */
function recode(context: PDFContext): void {
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    const type = dict.lookup(TYPE);
    if (type instanceof PDFName && NO_MERGE_STREAM.has(type.decodeText())) continue;
    if (dict.has(DECODE_PARMS) || dict.has(N("F")) || dict.has(N("DL"))) continue;
    const filter = dict.lookup(FILTER);
    const flate = filter === FLATE || (filter instanceof PDFArray && filter.size() === 1 && filter.lookup(0) === FLATE);
    if (filter !== undefined && !flate) continue; // other filters (images, fonts in their own codecs) stay
    const contents = obj.getContents();
    if (contents.length > RECODE_MAX) {
      if (filter === undefined) replace(context, ref, dict, zlibSync(contents, { level: 9 }), true, contents.length);
      continue;
    }
    let plain: Uint8Array;
    try {
      plain = filter === undefined ? contents : decodePDFRawStream(obj).decode();
    } catch {
      continue; // not decodable as it claims: leave it exactly as it came
    }
    const deflated = zlibSync(plain, { level: 9 });
    // "/Filter /FlateDecode" costs about 20 bytes in the stream's dictionary.
    const useFlate = deflated.length + 20 < plain.length;
    const best = useFlate ? deflated : plain;
    const current = contents.length + (filter === undefined ? 0 : 20);
    if (best.length + (useFlate ? 20 : 0) < current) replace(context, ref, dict, best, useFlate, current);
  }
}

function replace(context: PDFContext, ref: PDFRef, dict: PDFDict, bytes: Uint8Array, flate: boolean, current: number): void {
  if (flate && bytes.length + 20 >= current) return;
  const next = dict.clone(context);
  if (flate) next.set(FILTER, FLATE);
  else next.delete(FILTER);
  next.set(LENGTH, PDFNumber.of(bytes.length));
  context.assign(ref, PDFRawStream.of(next, bytes));
}
