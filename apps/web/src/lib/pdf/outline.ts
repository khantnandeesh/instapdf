/**
 * Reading a source's outline (bookmarks) and writing the output's (spec F3
 * §3f "Bookmark modes", F4/F5 I-3). Runs in the processing worker.
 *
 * A bookmark keeps its destination view (`/XYZ left top zoom`, `/FitH top`,
 * …), its colour, its bold/italic flags and its open/closed state. Named
 * destinations are resolved to the page they point at; the output always
 * gets explicit destinations.
 */
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRef, PDFString, type PDFDocument, type PDFObject } from "@cantoo/pdf-lib";

/** A destination's view, as plain data: `/XYZ 0 421 null` is `{ kind: "XYZ", args: [0, 421, null] }`. */
export type DestView = { kind: string; args: (number | null)[] };

export type BookmarkStyle = {
  /** Destination view; absent means "the page, view unchanged" (`/XYZ null null null`). */
  view?: DestView;
  /** `/C`: RGB colour, components 0..1. */
  color?: [number, number, number];
  /** `/F`: 1 italic, 2 bold. */
  flags?: number;
  /** Shown expanded (a positive `/Count`). Absent means open. */
  open?: boolean;
};

export type SourceBookmark = BookmarkStyle & {
  title: string;
  /** Target page index in the source, or null when it cannot be resolved. */
  pageIndex: number | null;
  children: SourceBookmark[];
};

export type OutBookmark = BookmarkStyle & { title: string; page: PDFRef; children: OutBookmark[] };

const MAX_ITEMS = 10_000;

/** Number of arguments each explicit destination kind takes (PDF 32000-1 §12.3.2.2). */
const VIEW_ARGS: Record<string, number> = { XYZ: 3, Fit: 0, FitH: 1, FitV: 1, FitR: 4, FitB: 0, FitBH: 1, FitBV: 1 };

const textOf = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : "");

/** Looks a name up in a name tree (/Kids, /Names). */
export function lookupNameTree(node: PDFDict | undefined, name: string, depth = 0): PDFObject | undefined {
  if (!node || depth > 32) return undefined;
  const names = node.lookup(PDFName.of("Names"));
  if (names instanceof PDFArray) {
    for (let i = 0; i + 1 < names.size(); i += 2) if (textOf(names.lookup(i)) === name) return names.get(i + 1);
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
      const found = lookupNameTree(kid, name, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

export type ResolvedDest = {
  /** The target page (a ref into the document's page tree). */
  page: PDFRef;
  /** What follows the page in the explicit destination: `/XYZ 0 421 null` → [/XYZ, 0, 421, null]. */
  tail: PDFObject[];
  /** True when the destination was given by name (it must be rewritten as an explicit one). */
  named: boolean;
};

/**
 * Resolves a destination (explicit array, name, string, or a `<< /D [...] >>`
 * wrapper, possibly indirect) to its page and view. null when it does not
 * lead to a page of this document (remote, malformed, unknown name).
 */
export function resolveDest(doc: PDFDocument, dest: PDFObject | undefined): ResolvedDest | null {
  let named = false;
  for (let hop = 0; hop < 6 && dest; hop++) {
    const resolved = dest instanceof PDFRef ? doc.context.lookup(dest) : dest;
    if (resolved instanceof PDFArray) {
      const first = resolved.get(0);
      if (!(first instanceof PDFRef)) return null;
      const tail: PDFObject[] = [];
      for (let i = 1; i < resolved.size(); i++) tail.push(resolved.lookup(i) ?? PDFNull);
      return { page: first, tail, named };
    }
    if (resolved instanceof PDFDict) {
      dest = resolved.get(PDFName.of("D")); // a named destination stored as << /D [...] >>
      continue;
    }
    if (resolved instanceof PDFName || resolved instanceof PDFString || resolved instanceof PDFHexString) {
      named = true;
      const key = resolved.decodeText();
      const dests = doc.catalog.lookup(PDFName.of("Dests"));
      let found: PDFObject | undefined = dests instanceof PDFDict ? dests.get(PDFName.of(key)) : undefined;
      if (!found) {
        const names = doc.catalog.lookup(PDFName.of("Names"));
        const tree = names instanceof PDFDict ? names.lookup(PDFName.of("Dests")) : undefined;
        found = lookupNameTree(tree instanceof PDFDict ? tree : undefined, key);
      }
      dest = found;
      continue;
    }
    return null;
  }
  return null;
}

/** The destination of an outline item or a link annotation: `/Dest`, or the `/D` of a GoTo action. */
export function destinationOf(item: PDFDict): PDFObject | undefined {
  const dest = item.get(PDFName.of("Dest"));
  if (dest) return dest;
  const action = item.lookup(PDFName.of("A"));
  if (action instanceof PDFDict && action.lookup(PDFName.of("S")) === PDFName.of("GoTo")) return action.get(PDFName.of("D"));
  return undefined;
}

/** A destination tail as plain data, or undefined when it is not a well-formed view. */
export function viewOf(tail: PDFObject[]): DestView | undefined {
  const kind = tail[0];
  if (!(kind instanceof PDFName)) return undefined;
  const name = kind.decodeText();
  const want = VIEW_ARGS[name];
  if (want === undefined) return undefined;
  const args: (number | null)[] = [];
  for (let i = 1; i <= want; i++) {
    const a = tail[i];
    if (a instanceof PDFNumber && Number.isFinite(a.asNumber())) args.push(a.asNumber());
    else if (a === undefined || a === PDFNull) args.push(null);
    else return undefined;
  }
  return { kind: name, args };
}

/** Scales a view's coordinates by `s` (a page scaled by Merge's same-width option). Zoom is left alone. */
export function scaleView(view: DestView, s: number): DestView {
  const coords = view.kind === "XYZ" ? [0, 1] : ["FitH", "FitV", "FitBH", "FitBV", "FitR"].includes(view.kind) ? view.args.map((_, i) => i) : [];
  return { kind: view.kind, args: view.args.map((a, i) => (a !== null && coords.includes(i) ? a * s : a)) };
}

function styleOf(node: PDFDict): BookmarkStyle {
  const style: BookmarkStyle = {};
  const c = node.lookup(PDFName.of("C"));
  if (c instanceof PDFArray && c.size() === 3) {
    const rgb = [0, 1, 2].map((i) => c.lookup(i));
    if (rgb.every((n) => n instanceof PDFNumber)) {
      const v = rgb.map((n) => Math.min(1, Math.max(0, (n as PDFNumber).asNumber())));
      if (v.some((x) => x !== 0)) style.color = v as [number, number, number];
    }
  }
  const f = node.lookup(PDFName.of("F"));
  if (f instanceof PDFNumber && Number.isInteger(f.asNumber()) && f.asNumber() & 3) style.flags = f.asNumber() & 3;
  const count = node.lookup(PDFName.of("Count"));
  if (count instanceof PDFNumber && count.asNumber() < 0) style.open = false;
  return style;
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
      const dest = resolveDest(doc, destinationOf(node));
      const view = dest ? viewOf(dest.tail) : undefined;
      const item: SourceBookmark = {
        title: textOf(node.lookup(PDFName.of("Title"))),
        pageIndex: dest ? (pageIndex.get(dest.page.toString()) ?? null) : null,
        children: walk(node.get(PDFName.of("First")), depth + 1),
        ...styleOf(node),
      };
      if (view) item.view = view;
      out.push(item);
      const next = node.get(PDFName.of("Next"));
      node = next instanceof PDFRef ? doc.context.lookup(next) : undefined;
    }
    return out;
  };
  return walk(root.get(PDFName.of("First")), 0);
}

/**
 * Maps a source outline onto output pages. Items whose page is gone are
 * dropped and their children move up one level (spec §3f). Views, colours,
 * flags and open state are carried.
 */
export function mapBookmarks(items: SourceBookmark[], pageFor: (index: number) => PDFRef | undefined): OutBookmark[] {
  const out: OutBookmark[] = [];
  for (const item of items) {
    const children = mapBookmarks(item.children, pageFor);
    const page = item.pageIndex === null ? undefined : pageFor(item.pageIndex);
    if (!page) {
      out.push(...children);
      continue;
    }
    const mapped: OutBookmark = { title: item.title, page, children };
    if (item.view) mapped.view = item.view;
    if (item.color) mapped.color = item.color;
    if (item.flags) mapped.flags = item.flags;
    if (item.open === false) mapped.open = false;
    out.push(mapped);
  }
  return out;
}

/** Items shown when the tree is displayed: each item, plus the visible items under every open one. */
function visibleCount(list: OutBookmark[]): number {
  return list.reduce((n, item) => n + 1 + (item.open === false ? 0 : visibleCount(item.children)), 0);
}

/** Writes `items` as the document's outline (replacing any). Nothing is written for an empty list. */
export function writeOutline(doc: PDFDocument, items: OutBookmark[]): void {
  doc.catalog.delete(PDFName.of("Outlines"));
  if (!items.length) return;
  const ctx = doc.context;
  const rootRef = ctx.nextRef();
  const build = (list: OutBookmark[], parent: PDFRef): PDFRef[] => {
    const refs = list.map(() => ctx.nextRef());
    list.forEach((item, i) => {
      const dict = ctx.obj({}) as PDFDict;
      dict.set(PDFName.of("Title"), PDFHexString.fromText(item.title));
      dict.set(PDFName.of("Parent"), parent);
      const view = item.view ? [PDFName.of(item.view.kind), ...item.view.args.map((a) => (a === null ? PDFNull : PDFNumber.of(a)))] : [PDFName.of("XYZ"), PDFNull, PDFNull, PDFNull];
      dict.set(PDFName.of("Dest"), ctx.obj([item.page, ...view]));
      if (item.color) dict.set(PDFName.of("C"), ctx.obj(item.color));
      if (item.flags) dict.set(PDFName.of("F"), PDFNumber.of(item.flags));
      if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1]);
      if (i < refs.length - 1) dict.set(PDFName.of("Next"), refs[i + 1]);
      if (item.children.length) {
        const kids = build(item.children, refs[i]);
        dict.set(PDFName.of("First"), kids[0]);
        dict.set(PDFName.of("Last"), kids[kids.length - 1]);
        const shown = visibleCount(item.children);
        dict.set(PDFName.of("Count"), PDFNumber.of(item.open === false ? -shown : shown));
      }
      ctx.assign(refs[i], dict);
    });
    return refs;
  };
  const top = build(items, rootRef);
  const root = ctx.obj({}) as PDFDict;
  root.set(PDFName.of("Type"), PDFName.of("Outlines"));
  root.set(PDFName.of("First"), top[0]);
  root.set(PDFName.of("Last"), top[top.length - 1]);
  root.set(PDFName.of("Count"), PDFNumber.of(visibleCount(items)));
  ctx.assign(rootRef, root);
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
}
