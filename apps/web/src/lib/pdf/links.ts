/**
 * Internal links on copied pages (spec F4/F5 I-2, AC-538, AC-539).
 *
 * - A link annotation whose target page is not in the output is removed (no
 *   dead clickable area).
 * - A link given by a named destination, or a GoTo action with a name, is
 *   rewritten as an explicit destination to its page, so it keeps working
 *   without the source's name tree.
 * - Explicit destinations to kept pages are left alone (the object copier
 *   maps the page reference to its output copy).
 * - Everything else (URI and other actions, links whose target cannot be
 *   resolved, other annotation types) is kept as it is.
 *
 * Works in the source document's space, before the page is copied. The
 * rewritten annotation (the same for every output) is registered once in
 * the source's context; which links survive depends on the output.
 */
import { PDFArray, PDFDict, PDFName, PDFRef, type PDFDocument, type PDFObject, type PDFPage } from "@cantoo/pdf-lib";
import { destinationOf, resolveDest } from "./outline";

const N = (s: string) => PDFName.of(s);

type Entry = {
  /** What goes into the output's /Annots (the original, or the rewritten link). */
  value: PDFObject;
  /** Target page of an internal link; null for anything that is not one. */
  target: PDFRef | null;
};

export type LinkFilter = {
  /**
   * The /Annots array for a copy of page `index` in an output that holds the
   * source pages for which `kept(ref)` is true, or undefined when the page's
   * own array can be used unchanged.
   */
  annotsFor(index: number, kept: (page: PDFRef) => boolean): PDFArray | undefined;
};

export function createLinkFilter(doc: PDFDocument, pages: readonly PDFPage[]): LinkFilter {
  const ctx = doc.context;
  const cache = new Map<number, { entries: Entry[]; rewritten: boolean } | null>();

  const entriesOf = (index: number) => {
    if (cache.has(index)) return cache.get(index)!;
    const annots = pages[index]?.node.lookup(N("Annots"));
    let result: { entries: Entry[]; rewritten: boolean } | null = null;
    if (annots instanceof PDFArray) {
      const entries: Entry[] = [];
      let rewritten = false;
      let links = 0;
      for (let i = 0; i < annots.size(); i++) {
        const raw = annots.get(i);
        const dict = annots.lookup(i);
        if (!(dict instanceof PDFDict) || dict.lookup(N("Subtype")) !== N("Link")) {
          entries.push({ value: raw, target: null });
          continue;
        }
        const given = destinationOf(dict);
        const dest = given ? resolveDest(doc, given) : null;
        if (!dest) {
          entries.push({ value: raw, target: null });
          continue;
        }
        links++;
        if (!dest.named) {
          entries.push({ value: raw, target: dest.page });
          continue;
        }
        // Named: an explicit destination to the same page and view.
        const explicit = ctx.obj([dest.page, ...dest.tail]);
        const clone = dict.clone(ctx);
        if (clone.get(N("Dest"))) clone.set(N("Dest"), explicit);
        else {
          const action = (dict.lookup(N("A")) as PDFDict).clone(ctx);
          action.set(N("D"), explicit);
          clone.set(N("A"), action);
        }
        entries.push({ value: ctx.register(clone), target: dest.page });
        rewritten = true;
      }
      if (links) result = { entries, rewritten };
    }
    cache.set(index, result);
    return result;
  };

  return {
    annotsFor(index, kept) {
      const found = entriesOf(index);
      if (!found) return undefined;
      const keep = found.entries.filter((e) => e.target === null || kept(e.target));
      if (keep.length === found.entries.length && !found.rewritten) return undefined;
      return ctx.obj(keep.map((e) => e.value));
    },
  };
}
