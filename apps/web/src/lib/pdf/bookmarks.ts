/**
 * Bookmarks (spec F10 §4), the worker's half: the edited outline replaces the file's. A bookmark
 * that was in the file keeps its colour, weight and open state, and its exact view when it still
 * points at the same page. The old outline's objects are deleted, so a removed bookmark's name is
 * no longer anywhere in the file.
 */
import { PDFDict, PDFName, PDFRef, type PDFDocument } from "@cantoo/pdf-lib";
import type { BookmarkNode, RowSource } from "./bookmark-edit";
import { readOutline, writeOutline, type OutBookmark, type SourceBookmark } from "./outline";
import { loadForEdit } from "./rotate";
import { USER_ERROR } from "./user-error";

const one = (s: string) => s.replace(/\s+/g, " ").trim();

const isItem = (node: unknown): node is PDFDict => {
  if (!(node instanceof PDFDict) || !node.has(PDFName.of("Title"))) return false;
  // A broken or hostile file can point /Next at anything: only a bookmark is ever deleted.
  const type = node.get(PDFName.of("Type"));
  return type === undefined || type === PDFName.of("Outline") || type === PDFName.of("OutlineItem");
};

/** Every object of the current outline (its root, its items and names stored on their own), each once. */
function outlineRefs(doc: PDFDocument): PDFRef[] {
  const out: PDFRef[] = [];
  const seen = new Set<string>();
  const walk = (ref: unknown, depth: number) => {
    let at = ref;
    while (at instanceof PDFRef && !seen.has(at.toString()) && seen.size < 200_000 && depth < 256) {
      seen.add(at.toString());
      const node = doc.context.lookup(at);
      if (!isItem(node)) break;
      out.push(at);
      const title = node.get(PDFName.of("Title"));
      if (title instanceof PDFRef) out.push(title);
      walk(node.get(PDFName.of("First")), depth + 1);
      at = node.get(PDFName.of("Next"));
    }
  };
  const rootRef = doc.catalog.get(PDFName.of("Outlines"));
  const root = doc.catalog.lookup(PDFName.of("Outlines"));
  if (root instanceof PDFDict && root !== doc.catalog && !root.has(PDFName.of("Title")) && root.get(PDFName.of("Type")) !== PDFName.of("Pages")) {
    if (rootRef instanceof PDFRef) out.push(rootRef);
    walk(root.get(PDFName.of("First")), 0);
  }
  return out;
}

export type BookmarksInput = { bytes: Uint8Array; password?: string; items: BookmarkNode[] };

export async function writeBookmarks({ bytes, password, items }: BookmarksInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; count: number }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const pages = doc.getPages();
  // The file's own bookmarks in outline order: an edited row names the place it came from.
  const flat: SourceBookmark[] = [];
  const collect = (list: SourceBookmark[]) => list.forEach((b) => (flat.push(b), collect(b.children)));
  collect(readOutline(doc));
  const used = new Set<SourceBookmark>();
  const find = (src: RowSource) => {
    const same = (b: SourceBookmark | undefined) => !!b && !used.has(b) && one(b.title) === one(src.title);
    // By place first; by name and page only if this reader and the editor's counted differently (a damaged outline).
    const hit = same(flat[src.index]) ? flat[src.index] : flat.find((b) => same(b) && (b.pageIndex ?? -1) === src.page);
    if (hit) used.add(hit);
    return hit;
  };
  let count = 0;
  const build = (list: BookmarkNode[]): OutBookmark[] =>
    list.map((n) => {
      if (!n.title) throw new Error(`${USER_ERROR}A bookmark has no name.`);
      count++;
      const from = n.src ? find(n.src) : undefined;
      const out: OutBookmark = { title: n.title, page: pages[0].ref, children: [] };
      if (n.page < 0) {
        // No page of this file: the bookmark keeps the target it had (a web link, another file) or stays a heading.
        if (!from?.raw) throw new Error(`${USER_ERROR}A bookmark points at a page that is not in the file.`);
        const action = from.raw.get(PDFName.of("A"));
        const dest = from.raw.get(PDFName.of("Dest"));
        out.target = action ? { key: "A", value: action } : dest ? { key: "Dest", value: dest } : null;
      } else {
        const page = pages[n.page];
        if (!page) throw new Error(`${USER_ERROR}A bookmark points at a page that is not in the file.`);
        out.page = page.ref;
        if (from?.view && from.pageIndex === n.page) out.view = from.view;
      }
      if (from?.color) out.color = from.color;
      if (from?.flags) out.flags = from.flags;
      if (from?.open === false) out.open = false;
      // The parent is matched before its children: that is the outline's order.
      out.children = build(n.children);
      return out;
    });
  const built = build(items);
  onProgress?.(0.4);
  const old = outlineRefs(doc);
  writeOutline(doc, built);
  for (const ref of old) doc.context.delete(ref);
  // A reader opens the bookmarks panel for a file that has them, unless the file asks for another view.
  const mode = PDFName.of("PageMode");
  if (built.length && !doc.catalog.has(mode)) doc.catalog.set(mode, PDFName.of("UseOutlines"));
  else if (!built.length && doc.catalog.get(mode) === PDFName.of("UseOutlines")) doc.catalog.delete(mode);
  onProgress?.(0.6);
  return { bytes: await doc.save(), pageCount: pages.length, wasEncrypted, count };
}
