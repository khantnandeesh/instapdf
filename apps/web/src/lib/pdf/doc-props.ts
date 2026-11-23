/**
 * Document-level properties a merge can carry over (spec F3, PR #7 expert
 * review): the document language and page labels. Runs in the worker.
 */
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFString, type PDFDocument, type PDFObject, type PDFPage } from "@cantoo/pdf-lib";

export type PageLabel = { S?: string; P?: string; St: number };

const textOf = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined);

/** BCP 47-shaped language tags only ("de", "de-DE", "zh-Hant-TW"); anything else is ignored. */
const LANG_TAG = /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/;

/** The document's /Lang, if it is a well-formed language tag. */
export function readLang(doc: PDFDocument): string | undefined {
  const lang = textOf(doc.catalog.lookup(PDFName.of("Lang")))?.trim();
  return lang && LANG_TAG.test(lang) ? lang : undefined;
}

/** Writes /Lang as a hex text string (never a raw literal: no escaping issues). */
export function writeLang(out: PDFDocument, lang: string): void {
  if (LANG_TAG.test(lang)) out.catalog.set(PDFName.of("Lang"), PDFHexString.fromText(lang));
}

/** Each page's label in the source (null where no range covers it), or null when the file has no labels. */
export function readPageLabels(doc: PDFDocument): (PageLabel | null)[] | null {
  const root = doc.catalog.lookup(PDFName.of("PageLabels"));
  if (!(root instanceof PDFDict)) return null;
  const ranges: { start: number; dict: PDFDict }[] = [];
  const pageCount = doc.getPageCount();
  const maxRanges = pageCount + 64; // more ranges than pages cannot all matter
  const seen = new Set<PDFDict>();
  const walk = (node: PDFDict, depth: number) => {
    if (seen.has(node) || depth > 32) return;
    seen.add(node);
    const nums = node.lookup(PDFName.of("Nums"));
    if (nums instanceof PDFArray) {
      for (let i = 0; i + 1 < nums.size() && ranges.length < maxRanges; i += 2) {
        const k = nums.lookup(i);
        const v = nums.lookup(i + 1);
        // Ranges that start past the last page cannot apply: skipped without being kept.
        if (k instanceof PDFNumber && v instanceof PDFDict && k.asNumber() >= 0 && k.asNumber() < pageCount) ranges.push({ start: k.asNumber(), dict: v });
      }
    }
    const kids = node.lookup(PDFName.of("Kids"));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (kid instanceof PDFDict) walk(kid, depth + 1);
    }
  };
  walk(root, 0);
  // Ranges starting past the last page cannot apply; a hostile tree cannot make this pages x ranges.
  const usable = ranges.filter((r) => r.start >= 0 && r.start < pageCount).sort((a, b) => a.start - b.start);
  if (!usable.length) return null;
  let at = -1; // index of the range covering the current page (moving pointer)
  return Array.from({ length: pageCount }, (_, i) => {
    while (at + 1 < usable.length && usable[at + 1].start <= i) at++;
    const r = at >= 0 ? usable[at] : undefined;
    if (!r) return null;
    const s = r.dict.lookup(PDFName.of("S"));
    const st = r.dict.lookup(PDFName.of("St"));
    return { S: s instanceof PDFName ? s.decodeText() : undefined, P: textOf(r.dict.lookup(PDFName.of("P"))), St: (st instanceof PDFNumber ? st.asNumber() : 1) + i - r.start };
  });
}

/**
 * Writes /PageLabels for the output: `labels[i]` is page i's label, or null
 * for a page that had none (contents, padding, blank, image pages and pages
 * of unlabelled files), which is then numbered with its output page number.
 */
export function writePageLabels(out: PDFDocument, labels: (PageLabel | null)[]): void {
  const ctx = out.context;
  const nums: PDFObject[] = [];
  let prev: PageLabel | null = null;
  labels.forEach((given, i) => {
    const label = given ?? { S: "D", St: i + 1 };
    const continues = prev && prev.S === label.S && prev.P === label.P && prev.St + 1 === label.St;
    if (!continues) {
      const d = ctx.obj({}) as PDFDict;
      if (label.S) d.set(PDFName.of("S"), PDFName.of(label.S));
      if (label.P) d.set(PDFName.of("P"), PDFHexString.fromText(label.P));
      if (label.St !== 1) d.set(PDFName.of("St"), PDFNumber.of(label.St));
      nums.push(PDFNumber.of(i), d);
    }
    prev = label;
  });
  out.catalog.set(PDFName.of("PageLabels"), ctx.obj({ Nums: nums }));
}

/**
 * A copied page keeps /StructParents (and annotations /StructParent) that
 * point into a structure tree the output does not have: drop them.
 */
export function dropStructureLinks(page: PDFPage): void {
  page.node.delete(PDFName.of("StructParents"));
  const annots = page.node.lookup(PDFName.of("Annots"));
  if (annots instanceof PDFArray) for (let i = 0; i < annots.size(); i++) {
    const a = annots.lookup(i);
    if (a instanceof PDFDict) a.delete(PDFName.of("StructParent"));
  }
}
