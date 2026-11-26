/**
 * Resource pruning for copied pages (spec F4/F5 I-1, AC-536, AC-537).
 *
 * Many producers give every page one shared `/Resources` dictionary (or put
 * it on the page tree, where every page inherits it). Copying one page then
 * drags in every image and font of the whole file. Before a page is copied,
 * this builds a resource dictionary holding only the names the page can use:
 *
 * - every name token in its content streams (`/Im1 Do`, `/F1 12 Tf`, `/GS0 gs`,
 *   `/CS0 cs`, `/P0 scn`, `/Sh0 sh`, `/MC0 BDC`, inline image colour spaces);
 * - recursively, the names in form XObjects, Type 3 glyphs, patterns and
 *   annotation appearances that have no `/Resources` of their own (they draw
 *   with the page's);
 * - a used form XObject that has its own `/Resources` is pruned the same way
 *   (a clone with the smaller dictionary), so a shared dictionary reached
 *   through it is cut down too.
 *
 * It is conservative: any name that occurs anywhere in the scanned bytes is
 * kept (strings, comments and inline image data can only make it keep more).
 * If a stream cannot be decoded, nothing is pruned for that page (or that
 * form). Only the categories that hold named resources are filtered;
 * anything else in the dictionary is kept as it is.
 */
import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFContext, type PDFObject, type PDFPage } from "@cantoo/pdf-lib";

/** Resource categories whose entries are looked up by name from content streams. */
const CATEGORIES = ["XObject", "Font", "ExtGState", "ColorSpace", "Pattern", "Shading", "Properties"] as const;
const N = (s: string) => PDFName.of(s);
const MAX_DEPTH = 24;

class Undecodable extends Error {}

/** Decoded bytes of a stream; throws Undecodable when a filter is not supported. */
function streamBytes(s: PDFStream): Uint8Array {
  try {
    if (s instanceof PDFRawStream) return decodePDFRawStream(s).decode();
    const contents = (s as unknown as { getUnencodedContents?: () => Uint8Array }).getUnencodedContents?.();
    if (contents) return contents;
  } catch {
    // Unsupported or broken filter.
  }
  throw new Undecodable();
}

/** Name tokens: "/" then regular characters (PDF delimiters and white space end a name). */
const NAME_TOKEN = /\/([^\x00\t\n\f\r ()<>[\]{}/%]*)/g;
const decodeEscapes = (raw: string) => raw.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/** Adds every name that occurs in `bytes` to `into` (as pdf-lib's parser would read it). */
export function collectNames(bytes: Uint8Array, into: Set<PDFName>): void {
  let text = "";
  // latin1 decode in chunks (String.fromCharCode has an argument limit).
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  for (const m of text.matchAll(NAME_TOKEN)) {
    into.add(N(decodeEscapes(m[1])));
    if (m[1].includes("#")) into.add(N(m[1])); // over-keep rather than miss an oddly escaped key
  }
}

function contentStreams(ctx: PDFContext, contents: PDFObject | undefined): PDFStream[] {
  const value = contents instanceof PDFRef ? ctx.lookup(contents) : contents;
  if (value instanceof PDFStream) return [value];
  if (value instanceof PDFArray) {
    const out: PDFStream[] = [];
    for (let i = 0; i < value.size(); i++) {
      const s = value.lookup(i);
      if (s instanceof PDFStream) out.push(s);
    }
    return out;
  }
  return [];
}

const isForm = (s: PDFObject | undefined): s is PDFStream => s instanceof PDFStream && s.dict.lookup(N("Subtype")) === N("Form");

export type Pruner = {
  /**
   * A smaller `/Resources` dictionary for page `index` (a direct dictionary in
   * the source's context, values shared with the source), or undefined when
   * the page keeps its own (nothing to drop, no resources, or something could
   * not be read). Cached per page.
   */
  forPage(index: number): PDFDict | undefined;
};

/**
 * A pruner for the pages of one source document. Clones of form XObjects
 * with pruned resources are registered in the source's context once and
 * reused by every output.
 */
export function createPruner(ctx: PDFContext, pages: readonly PDFPage[]): Pruner {
  const pageCache = new Map<number, PDFDict | undefined>();
  /** Form XObject ref -> its replacement (a pruned clone), or itself. */
  const formCache = new Map<PDFRef, PDFRef>();

  /**
   * Scans `streams` into `used`, then follows used entries of `res` that draw
   * with these same resources (resource-less forms, Type 3 glyphs, patterns),
   * until nothing new turns up.
   */
  const scanInto = (streams: PDFStream[], res: PDFDict, used: Set<PDFName>) => {
    for (const s of streams) collectNames(streamBytes(s), used);
    const followed = new Set<PDFObject>();
    for (let changed = true, rounds = 0; changed && rounds < 64; rounds++) {
      changed = false;
      for (const cat of ["XObject", "Font", "Pattern"]) {
        const sub = res.lookup(N(cat));
        if (!(sub instanceof PDFDict)) continue;
        for (const [name, raw] of sub.entries()) {
          if (!used.has(name)) continue;
          const value = ctx.lookup(raw);
          if (!value || followed.has(value)) continue;
          followed.add(value);
          const inner = innerStreams(cat, value);
          if (!inner.length) continue;
          const before = used.size;
          for (const s of inner) collectNames(streamBytes(s), used);
          if (used.size !== before) changed = true;
        }
      }
    }
  };

  /** Streams of a resource that are drawn with the caller's resources (it has no /Resources of its own). */
  const innerStreams = (cat: string, value: PDFObject): PDFStream[] => {
    const dict = value instanceof PDFStream ? value.dict : value instanceof PDFDict ? value : undefined;
    if (!dict || dict.get(N("Resources"))) return [];
    if (cat === "XObject") return isForm(value) ? [value] : [];
    if (cat === "Pattern") return value instanceof PDFStream ? [value] : [];
    if (cat === "Font" && dict.lookup(N("Subtype")) === N("Type3")) {
      const procs = dict.lookup(N("CharProcs"));
      if (!(procs instanceof PDFDict)) return [];
      return procs.values().map((v) => ctx.lookup(v)).filter((s): s is PDFStream => s instanceof PDFStream);
    }
    return [];
  };

  /**
   * Keeps only the `used` names of each category of `res`. Used form
   * XObjects with their own resources are swapped for pruned clones.
   * Returns undefined when nothing would change.
   */
  const filter = (res: PDFDict, used: Set<PDFName>, depth: number): PDFDict | undefined => {
    const out = ctx.obj({}) as PDFDict;
    let changed = false;
    for (const [key, raw] of res.entries()) {
      const cat = key.decodeText();
      const sub = ctx.lookup(raw);
      if (!(CATEGORIES as readonly string[]).includes(cat) || !(sub instanceof PDFDict)) {
        out.set(key, raw);
        continue;
      }
      const kept = ctx.obj({}) as PDFDict;
      let dropped = false;
      let swapped = false;
      for (const [name, value] of sub.entries()) {
        if (!used.has(name)) {
          dropped = true;
          continue;
        }
        let v: PDFObject = value;
        if (cat === "XObject" && value instanceof PDFRef) {
          const replacement = prunedForm(value, depth + 1);
          if (replacement !== value) swapped = true;
          v = replacement;
        }
        kept.set(name, v);
      }
      if (!dropped && !swapped) out.set(key, raw);
      else {
        changed = true;
        if (kept.entries().length) out.set(key, kept);
      }
    }
    return changed ? out : undefined;
  };

  /** A form XObject with its own resources, pruned to what its content uses (a registered clone), or the original ref. */
  const prunedForm = (ref: PDFRef, depth: number): PDFRef => {
    const cached = formCache.get(ref);
    if (cached) return cached;
    formCache.set(ref, ref); // guards against cycles while this one is worked on
    const form = ctx.lookup(ref);
    if (!isForm(form) || depth > MAX_DEPTH) return ref;
    const res = form.dict.lookup(N("Resources"));
    if (!(res instanceof PDFDict)) return ref;
    let smaller: PDFDict | undefined;
    try {
      const used = new Set<PDFName>();
      scanInto([form], res, used);
      smaller = filter(res, used, depth);
    } catch (e) {
      if (!(e instanceof Undecodable)) throw e;
      return ref; // keep the form whole
    }
    if (!smaller) return ref;
    const clone = form.clone(ctx);
    clone.dict.set(N("Resources"), smaller);
    const cloneRef = ctx.register(clone);
    formCache.set(ref, cloneRef);
    return cloneRef;
  };

  /** Appearance streams of the page's annotations that have no /Resources of their own. */
  const appearanceStreams = (page: PDFPage): PDFStream[] => {
    const annots = page.node.lookup(N("Annots"));
    if (!(annots instanceof PDFArray)) return [];
    const out: PDFStream[] = [];
    const visit = (o: PDFObject | undefined, depth: number) => {
      const v = o instanceof PDFRef ? ctx.lookup(o) : o;
      if (v instanceof PDFStream) {
        if (!v.dict.get(N("Resources"))) out.push(v);
      } else if (v instanceof PDFDict && depth < 2) for (const x of v.values()) visit(x, depth + 1);
    };
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookup(i);
      if (a instanceof PDFDict) visit(a.get(N("AP")), 0);
    }
    return out;
  };

  return {
    forPage(index) {
      if (pageCache.has(index)) return pageCache.get(index);
      const page = pages[index];
      let result: PDFDict | undefined;
      const res = page?.node.Resources();
      if (res) {
        try {
          const used = new Set<PDFName>();
          scanInto([...contentStreams(ctx, page.node.get(N("Contents"))), ...appearanceStreams(page)], res, used);
          result = filter(res, used, 0);
        } catch (e) {
          if (!(e instanceof Undecodable)) throw e;
          result = undefined; // keep everything for this page
        }
      }
      pageCache.set(index, result);
      return result;
    },
  };
}
