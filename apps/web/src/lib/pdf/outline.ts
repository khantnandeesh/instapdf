/**
 * Reading a source's outline (bookmarks) and writing the merged one
 * (spec F3 §3f "Bookmark modes"). Runs in the processing worker.
 */
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRef, PDFString, type PDFDocument, type PDFObject } from "@cantoo/pdf-lib";

export type SourceBookmark = {
  title: string;
  /** Target page index in the source, or null when it cannot be resolved. */
  pageIndex: number | null;
  children: SourceBookmark[];
};

export type OutBookmark = { title: string; page: PDFRef; children: OutBookmark[] };

const MAX_ITEMS = 10_000;

const textOf = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : "");

/** Looks a name up in a name tree (/Kids, /Names). */
function lookupNameTree(doc: PDFDocument, node: PDFDict | undefined, name: string, depth = 0): PDFObject | undefined {
  if (!node || depth > 32) return undefined;
  const names = node.lookup(PDFName.of("Names"));
  if (names instanceof PDFArray) {
    for (let i = 0; i + 1 < names.size(); i += 2) if (textOf(names.lookup(i)) === name) return names.lookup(i + 1);
  }
  const kids = node.lookup(PDFName.of("Kids"));
  if (kids instanceof PDFArray) {
    for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (!(kid instanceof PDFDict)) continue;
      const limits = kid.lookup(PDFName.of("Limits"));
      if (limits instanceof PDFArray && limits.size() === 2) {
        const lo = textOf(limits.lookup(0));
        const hi = textOf(limits.lookup(1));
        if (name < lo || name > hi) continue;
      }
      const found = lookupNameTree(doc, kid, name, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** Resolves an outline item's destination to a page ref. */
function destinationPage(doc: PDFDocument, item: PDFDict): PDFRef | null {
  let dest: PDFObject | undefined = item.get(PDFName.of("Dest"));
  if (!dest) {
    const action = item.lookup(PDFName.of("A"));
    if (action instanceof PDFDict && action.lookup(PDFName.of("S")) === PDFName.of("GoTo")) dest = action.get(PDFName.of("D"));
  }
  for (let hop = 0; hop < 4 && dest; hop++) {
    const resolved = dest instanceof PDFRef ? doc.context.lookup(dest) : dest;
    if (resolved instanceof PDFArray) {
      const first = resolved.get(0);
      return first instanceof PDFRef ? first : null;
    }
    if (resolved instanceof PDFDict) {
      dest = resolved.get(PDFName.of("D")); // a named destination stored as << /D [...] >>
      continue;
    }
    if (resolved instanceof PDFName || resolved instanceof PDFString || resolved instanceof PDFHexString) {
      const key = resolved instanceof PDFName ? resolved.decodeText() : resolved.decodeText();
      const dests = doc.catalog.lookup(PDFName.of("Dests"));
      let found: PDFObject | undefined = dests instanceof PDFDict ? dests.get(PDFName.of(key)) : undefined;
      if (!found) {
        const names = doc.catalog.lookup(PDFName.of("Names"));
        const tree = names instanceof PDFDict ? names.lookup(PDFName.of("Dests")) : undefined;
        found = lookupNameTree(doc, tree instanceof PDFDict ? tree : undefined, key);
      }
      dest = found;
      continue;
    }
    return null;
  }
  return null;
}

/** The source's outline as a tree, with targets as page indexes. */
export function readOutline(doc: PDFDocument): SourceBookmark[] {
  const root = doc.catalog.lookup(PDFName.of("Outlines"));
  if (!(root instanceof PDFDict)) return [];
  const pageIndex = new Map<string, number>();
  doc.getPages().forEach((p, i) => pageIndex.set(p.ref.toString(), i));
  const seen = new Set<PDFDict>();
  let budget = MAX_ITEMS;
  const walk = (first: PDFObject | undefined, depth: number): SourceBookmark[] => {
    const out: SourceBookmark[] = [];
    let node = first instanceof PDFRef ? doc.context.lookup(first) : first;
    while (node instanceof PDFDict && !seen.has(node) && budget-- > 0 && depth < 64) {
      seen.add(node);
      const ref = destinationPage(doc, node);
      out.push({
        title: textOf(node.lookup(PDFName.of("Title"))),
        pageIndex: ref ? (pageIndex.get(ref.toString()) ?? null) : null,
        children: walk(node.get(PDFName.of("First")), depth + 1),
      });
      const next = node.get(PDFName.of("Next"));
      node = next instanceof PDFRef ? doc.context.lookup(next) : undefined;
    }
    return out;
  };
  return walk(root.get(PDFName.of("First")), 0);
}

/**
 * Maps a source outline onto output pages. Items whose page is gone are
 * dropped and their children move up one level (spec §3f).
 */
export function mapBookmarks(items: SourceBookmark[], pageFor: (index: number) => PDFRef | undefined): OutBookmark[] {
  const out: OutBookmark[] = [];
  for (const item of items) {
    const children = mapBookmarks(item.children, pageFor);
    const page = item.pageIndex === null ? undefined : pageFor(item.pageIndex);
    if (page) out.push({ title: item.title, page, children });
    else out.push(...children);
  }
  return out;
}

/** Writes `items` as the document's outline (replacing any). Nothing is written for an empty list. */
export function writeOutline(doc: PDFDocument, items: OutBookmark[]): void {
  doc.catalog.delete(PDFName.of("Outlines"));
  if (!items.length) return;
  const ctx = doc.context;
  const rootRef = ctx.nextRef();
  const build = (list: OutBookmark[], parent: PDFRef): { refs: PDFRef[]; count: number } => {
    const refs = list.map(() => ctx.nextRef());
    let count = 0;
    list.forEach((item, i) => {
      const dict = ctx.obj({}) as PDFDict;
      dict.set(PDFName.of("Title"), PDFHexString.fromText(item.title));
      dict.set(PDFName.of("Parent"), parent);
      dict.set(PDFName.of("Dest"), ctx.obj([item.page, PDFName.of("XYZ"), PDFNull, PDFNull, PDFNull]));
      if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1]);
      if (i < refs.length - 1) dict.set(PDFName.of("Next"), refs[i + 1]);
      if (item.children.length) {
        const kids = build(item.children, refs[i]);
        dict.set(PDFName.of("First"), kids.refs[0]);
        dict.set(PDFName.of("Last"), kids.refs[kids.refs.length - 1]);
        dict.set(PDFName.of("Count"), PDFNumber.of(kids.count));
        count += kids.count;
      }
      ctx.assign(refs[i], dict);
      count++;
    });
    return { refs, count };
  };
  const top = build(items, rootRef);
  const root = ctx.obj({}) as PDFDict;
  root.set(PDFName.of("Type"), PDFName.of("Outlines"));
  root.set(PDFName.of("First"), top.refs[0]);
  root.set(PDFName.of("Last"), top.refs[top.refs.length - 1]);
  root.set(PDFName.of("Count"), PDFNumber.of(top.count));
  ctx.assign(rootRef, root);
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
}
