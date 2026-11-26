/**
 * Document-level properties a merge can carry over (spec F3, PR #7 expert
 * review): the document language and page labels; and, when every output
 * page comes from one source PDF, its document info and opening layout
 * (spec F4/F5 I-4, AC-541). Runs in the worker.
 */
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, type PDFDocument, type PDFObject, type PDFPage } from "@cantoo/pdf-lib";

export type PageLabel = { S?: string; P?: string; St: number };

const textOf = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined);

/** BCP 47-shaped language tags only ("de", "de-DE", "zh-Hant-TW"); anything else is ignored. */
const LANG_TAG = /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/;

/** The document's /Lang, if it is a well-formed language tag ("en_US" is read as "en-US"). */
export function readLang(doc: PDFDocument): string | undefined {
  const lang = textOf(doc.catalog.lookup(PDFName.of("Lang")))?.trim().replace(/_/g, "-");
  return lang && LANG_TAG.test(lang) ? lang : undefined;
}

/** Writes /Lang as a hex text string (never a raw literal: no escaping issues). */
export function writeLang(out: PDFDocument, lang: string): void {
  if (LANG_TAG.test(lang)) out.catalog.set(PDFName.of("Lang"), PDFHexString.fromText(lang));
}

/** The numbering styles the PDF spec defines (decimal, Roman, letters); any other /S means "prefix only". */
const LABEL_STYLES = new Set(["D", "R", "r", "A", "a"]);
const MAX_LABEL_START = 1_000_000_000;

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
        // Only whole page indexes in the file count: ranges past the last page cannot apply and are not kept.
        const start = k instanceof PDFNumber ? k.asNumber() : NaN;
        if (v instanceof PDFDict && Number.isInteger(start) && start >= 0 && start < pageCount) ranges.push({ start, dict: v });
      }
    }
    const kids = node.lookup(PDFName.of("Kids"));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (kid instanceof PDFDict) walk(kid, depth + 1);
    }
  };
  walk(root, 0);
  // Sorted once, then one moving pointer: a hostile tree cannot make this pages x ranges.
  const usable = ranges.sort((a, b) => a.start - b.start);
  if (!usable.length) return null;
  let at = -1; // index of the range covering the current page (moving pointer)
  return Array.from({ length: pageCount }, (_, i) => {
    while (at + 1 < usable.length && usable[at + 1].start <= i) at++;
    const r = at >= 0 ? usable[at] : undefined;
    if (!r) return null;
    const s = r.dict.lookup(PDFName.of("S"));
    const st = r.dict.lookup(PDFName.of("St"));
    const style = s instanceof PDFName ? s.decodeText() : undefined;
    // /St must be a whole number >= 1; anything else (or too large to number pages) starts at 1.
    const first = st instanceof PDFNumber && Number.isInteger(st.asNumber()) && st.asNumber() >= 1 && st.asNumber() <= MAX_LABEL_START ? st.asNumber() : 1;
    return { S: style && LABEL_STYLES.has(style) ? style : undefined, P: textOf(r.dict.lookup(PDFName.of("P"))), St: first + i - r.start };
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

/** Info entries carried from a single source (Producer and ModDate are always ours). */
export const CARRIED_INFO = ["Title", "Author", "Subject", "Keywords", "Creator", "CreationDate"] as const;
/** Opening page layouts and page modes the output may keep (modes for parts we do not copy are left out). */
const LAYOUTS = new Set(["SinglePage", "OneColumn", "TwoColumnLeft", "TwoColumnRight", "TwoPageLeft", "TwoPageRight"]);
const MODES = new Set(["UseNone", "UseOutlines", "UseThumbs", "FullScreen"]);

/** What a source says about itself and how it opens: plain values, safe to keep after the source is released. */
export type DocInfo = {
  /** Text strings from the Info dictionary, by key (only CARRIED_INFO keys). */
  info: { key: (typeof CARRIED_INFO)[number]; value: PDFString | PDFHexString }[];
  pageLayout?: string;
  pageMode?: string;
};

export function readDocInfo(doc: PDFDocument): DocInfo {
  const out: DocInfo = { info: [] };
  const infoRef = doc.context.trailerInfo.Info;
  const info = infoRef ? doc.context.lookup(infoRef) : undefined;
  if (info instanceof PDFDict) {
    for (const key of CARRIED_INFO) {
      const v = info.lookup(PDFName.of(key));
      if (v instanceof PDFString || v instanceof PDFHexString) out.info.push({ key, value: v });
    }
  }
  const layout = doc.catalog.lookup(PDFName.of("PageLayout"));
  if (layout instanceof PDFName && LAYOUTS.has(layout.decodeText())) out.pageLayout = layout.decodeText();
  const mode = doc.catalog.lookup(PDFName.of("PageMode"));
  if (mode instanceof PDFName && MODES.has(mode.decodeText())) out.pageMode = mode.decodeText();
  return out;
}

/**
 * Writes a single source's info and layout onto the output, with ModDate set
 * to `now`. `viewerPreferences` is the source's /ViewerPreferences already
 * copied into the output. A /PageMode asking for the outline is dropped when
 * the output has none.
 */
export function writeDocInfo(out: PDFDocument, from: DocInfo, now: Date, viewerPreferences?: PDFObject): void {
  out.setModificationDate(now);
  const infoRef = out.context.trailerInfo.Info;
  const info = infoRef ? out.context.lookup(infoRef) : undefined;
  if (info instanceof PDFDict) for (const { key, value } of from.info) info.set(PDFName.of(key), value);
  if (from.pageLayout) out.catalog.set(PDFName.of("PageLayout"), PDFName.of(from.pageLayout));
  if (from.pageMode && (from.pageMode !== "UseOutlines" || out.catalog.get(PDFName.of("Outlines")))) out.catalog.set(PDFName.of("PageMode"), PDFName.of(from.pageMode));
  if (viewerPreferences instanceof PDFDict || viewerPreferences instanceof PDFRef) out.catalog.set(PDFName.of("ViewerPreferences"), viewerPreferences);
}
