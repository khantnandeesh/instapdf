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
 * - recursively, the names in form XObjects, Type 3 glyphs, patterns, soft
 *   mask groups and annotation appearances that have no `/Resources` of their
 *   own (they draw with the page's);
 * - a used form XObject that has its own `/Resources` is pruned the same way
 *   (a clone with the smaller dictionary), so a shared dictionary reached
 *   through it is cut down too.
 *
 * It is conservative: any name that occurs anywhere in the scanned bytes is
 * kept (strings, comments and inline image data can only make it keep more).
 * Pruning is only an optimisation, so anything unexpected keeps everything:
 * a stream pdf-lib cannot decode exactly (an unknown filter, or a predictor,
 * which pdf-lib's decoder ignores), a malformed dictionary, or any error at
 * all leaves that page (or that form) with its resources as they are.
 *
 * Not pruned (copied whole when used): tiling patterns, Type 3 fonts and soft
 * mask groups that have their own `/Resources`.
 */
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFContext, type PDFObject, type PDFPage } from "@cantoo/pdf-lib";

/** Resource categories whose entries are looked up by name from content streams. */
const CATEGORIES = new Set(["XObject", "Font", "ExtGState", "ColorSpace", "Pattern", "Shading", "Properties"]);
const N = (s: string) => PDFName.of(s);
const RESOURCES = N("Resources");
const MAX_DEPTH = 24;

class Undecodable extends Error {}

/** True when any filter of the stream has /DecodeParms with a /Predictor above 1 (pdf-lib's decoder ignores it). */
function hasPredictor(dict: PDFDict): boolean {
  const parms = dict.lookup(N("DecodeParms"));
  const list = parms instanceof PDFArray ? Array.from({ length: parms.size() }, (_, i) => parms.lookup(i)) : [parms];
  return list.some((p) => {
    if (!(p instanceof PDFDict)) return false;
    const predictor = p.lookup(N("Predictor"));
    return predictor instanceof PDFNumber && predictor.asNumber() > 1;
  });
}

/** Decoded bytes of a stream; throws Undecodable when they cannot be had exactly. */
function streamBytes(s: PDFStream): Uint8Array {
  try {
    if (s instanceof PDFRawStream) {
      if (hasPredictor(s.dict)) throw new Undecodable();
      return decodePDFRawStream(s).decode();
    }
    const contents = (s as unknown as { getUnencodedContents?: () => Uint8Array }).getUnencodedContents?.();
    if (contents) return contents;
  } catch {
    // Unsupported or broken filter.
  }
  throw new Undecodable();
}

/** Name tokens: "/" then regular characters (PDF delimiters and white space end a name). */
const NAME_TOKEN = /\/([^\x00\t\n\f\r ()<>[\]{}/%]*)/g;
/** pdf-lib's parser decodes #xx escapes in either case, then PDFName.of decodes upper-case ones once more. */
const decodeAny = (raw: string) => raw.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
const decodeUpper = (raw: string) => raw.replace(/#([\dABCDEF]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/**
 * Adds every name that occurs in `bytes` to `into`, as the decoded strings
 * pdf-lib's parser gives resource keys (`PDFName.decodeText()`). Plain
 * strings: nothing is added to pdf-lib's global name pool.
 */
export function collectNames(bytes: Uint8Array, into: Set<string>): void {
  let text = "";
  // latin1 decode in chunks (String.fromCharCode has an argument limit).
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  for (const m of text.matchAll(NAME_TOKEN)) {
    const raw = m[1];
    if (!raw.includes("#")) {
      into.add(raw);
      continue;
    }
    // Over-keep rather than miss an oddly escaped key.
    const once = decodeAny(raw);
    into.add(once).add(decodeUpper(once)).add(raw);
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
/** A dictionary's own resources: only a real dictionary counts (null, a dangling ref or another type means none). */
const ownResources = (dict: PDFDict): PDFDict | undefined => {
  const r = dict.lookup(RESOURCES);
  return r instanceof PDFDict ? r : undefined;
};

export type Pruner = {
  /**
   * A smaller `/Resources` dictionary for page `index` (a direct dictionary in
   * the source's context, values shared with the source), or undefined when
   * the page keeps its own (nothing to drop, no resources, or something could
   * not be read). Cached per page. Never throws.
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
  /** Names found in each stream (a stream shared by many pages is decoded once). */
  const scanned = new WeakMap<PDFStream, Set<string> | null>();

  const namesOf = (s: PDFStream): Set<string> => {
    const have = scanned.get(s);
    if (have) return have;
    if (have === null) throw new Undecodable();
    try {
      const names = new Set<string>();
      collectNames(streamBytes(s), names);
      scanned.set(s, names);
      return names;
    } catch (e) {
      scanned.set(s, null);
      throw e;
    }
  };
  const addNames = (s: PDFStream, used: Set<string>) => {
    const before = used.size;
    for (const n of namesOf(s)) used.add(n);
    return used.size !== before;
  };

  /** Streams of a resource that are drawn with the caller's resources (it has no /Resources of its own). */
  const innerStreams = (cat: string, value: PDFObject): PDFStream[] => {
    const dict = value instanceof PDFStream ? value.dict : value instanceof PDFDict ? value : undefined;
    if (!dict) return [];
    if (cat === "ExtGState") {
      // A soft mask's transparency group (a form) without its own resources.
      const smask = dict.lookup(N("SMask"));
      const group = smask instanceof PDFDict ? smask.lookup(N("G")) : undefined;
      return isForm(group) && !ownResources(group.dict) ? [group] : [];
    }
    if (ownResources(dict)) return [];
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
   * Scans `streams` into `used`, then follows used entries of `res` that draw
   * with these same resources (resource-less forms, Type 3 glyphs, patterns,
   * soft mask groups) until nothing new turns up. Every pass either follows
   * a resource not followed before or stops, so this ends after at most one
   * pass per resource entry.
   */
  const scanInto = (streams: PDFStream[], res: PDFDict, used: Set<string>) => {
    for (const s of streams) addNames(s, used);
    const followed = new Set<PDFObject>();
    for (let changed = true; changed; ) {
      changed = false;
      for (const cat of ["XObject", "Font", "Pattern", "ExtGState"]) {
        const sub = res.lookup(N(cat));
        if (!(sub instanceof PDFDict)) continue;
        for (const [name, raw] of sub.entries()) {
          if (!used.has(name.decodeText())) continue;
          const value = ctx.lookup(raw);
          if (!value || followed.has(value)) continue;
          followed.add(value);
          for (const s of innerStreams(cat, value)) if (addNames(s, used)) changed = true;
        }
      }
    }
  };

  /**
   * Keeps only the `used` names of each category of `res`. Used form
   * XObjects with their own resources are swapped for pruned clones.
   * Returns undefined when nothing would change.
   */
  const filter = (res: PDFDict, used: Set<string>, depth: number): PDFDict | undefined => {
    const out = ctx.obj({}) as PDFDict;
    let changed = false;
    for (const [key, raw] of res.entries()) {
      const sub = ctx.lookup(raw);
      if (!CATEGORIES.has(key.decodeText()) || !(sub instanceof PDFDict)) {
        out.set(key, raw);
        continue;
      }
      const isXObject = key.decodeText() === "XObject";
      const kept = ctx.obj({}) as PDFDict;
      let dropped = false;
      let swapped = false;
      for (const [name, value] of sub.entries()) {
        if (!used.has(name.decodeText())) {
          dropped = true;
          continue;
        }
        let v: PDFObject = value;
        if (isXObject && value instanceof PDFRef) {
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
    if (depth > MAX_DEPTH) return ref;
    try {
      const form = ctx.lookup(ref);
      if (!isForm(form)) return ref;
      const res = ownResources(form.dict);
      if (!res) return ref;
      const used = new Set<string>();
      scanInto([form], res, used);
      const smaller = filter(res, used, depth);
      if (!smaller) return ref;
      const clone = form.clone(ctx);
      clone.dict.set(RESOURCES, smaller);
      const cloneRef = ctx.register(clone);
      formCache.set(ref, cloneRef);
      return cloneRef;
    } catch {
      return ref; // keep the form whole
    }
  };

  /** Appearance streams of the page's annotations that have no /Resources of their own. */
  const appearanceStreams = (page: PDFPage): PDFStream[] => {
    const annots = page.node.lookup(N("Annots"));
    if (!(annots instanceof PDFArray)) return [];
    const out: PDFStream[] = [];
    const visit = (o: PDFObject | undefined, depth: number) => {
      const v = o instanceof PDFRef ? ctx.lookup(o) : o;
      if (v instanceof PDFStream) {
        if (!ownResources(v.dict)) out.push(v);
      } else if (v instanceof PDFDict && depth < 2) for (const x of v.values()) visit(x, depth + 1);
    };
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookup(i);
      if (a instanceof PDFDict) visit(a.get(N("AP")), 0);
    }
    return out;
  };

  const prunePage = (page: PDFPage | undefined): PDFDict | undefined => {
    if (!page) return undefined;
    const res = ctx.lookup(page.node.getInheritableAttribute(RESOURCES));
    if (!(res instanceof PDFDict)) return undefined;
    const used = new Set<string>();
    scanInto([...contentStreams(ctx, page.node.get(N("Contents"))), ...appearanceStreams(page)], res, used);
    return filter(res, used, 0);
  };

  return {
    forPage(index) {
      if (pageCache.has(index)) return pageCache.get(index);
      let result: PDFDict | undefined;
      try {
        result = prunePage(pages[index]);
      } catch {
        result = undefined; // an optimisation only: keep everything for this page
      }
      pageCache.set(index, result);
      return result;
    },
  };
}
