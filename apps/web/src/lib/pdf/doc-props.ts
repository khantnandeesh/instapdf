/**
 * Document-level properties a merge can carry over (spec F3, PR #7 expert
 * review): the document language and page labels. Runs in the worker.
 */
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFString, type PDFDocument, type PDFObject, type PDFPage } from "@cantoo/pdf-lib";

export type PageLabel = { S?: string; P?: string; St: number };

const textOf = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined);

/** The document's /Lang, if any. */
export function readLang(doc: PDFDocument): string | undefined {
  return textOf(doc.catalog.lookup(PDFName.of("Lang")))?.trim() || undefined;
}

/** Each page's label in the source (null where no range covers it), or null when the file has no labels. */
export function readPageLabels(doc: PDFDocument): (PageLabel | null)[] | null {
  const root = doc.catalog.lookup(PDFName.of("PageLabels"));
  if (!(root instanceof PDFDict)) return null;
  const ranges: { start: number; dict: PDFDict }[] = [];
  const seen = new Set<PDFDict>();
  const walk = (node: PDFDict, depth: number) => {
    if (seen.has(node) || depth > 32) return;
    seen.add(node);
    const nums = node.lookup(PDFName.of("Nums"));
    if (nums instanceof PDFArray) {
      for (let i = 0; i + 1 < nums.size(); i += 2) {
        const k = nums.lookup(i);
        const v = nums.lookup(i + 1);
        if (k instanceof PDFNumber && v instanceof PDFDict) ranges.push({ start: k.asNumber(), dict: v });
      }
    }
    const kids = node.lookup(PDFName.of("Kids"));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (kid instanceof PDFDict) walk(kid, depth + 1);
    }
  };
  walk(root, 0);
  if (!ranges.length) return null;
  ranges.sort((a, b) => a.start - b.start);
  return Array.from({ length: doc.getPageCount() }, (_, i) => {
    let r: (typeof ranges)[number] | undefined;
    for (const x of ranges) if (x.start <= i) r = x;
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
