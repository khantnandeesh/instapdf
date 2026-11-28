/**
 * Bookmarks (spec F10 §4), the worker's half: the edited outline replaces the file's. A bookmark
 * that was in the file keeps its colour, weight and open state, and its exact view when it still
 * points at the same page. The old outline's objects are deleted, so a removed bookmark's name is
 * no longer anywhere in the file.
 */
import { PDFDict, PDFName, PDFRef, type PDFDocument } from "@cantoo/pdf-lib";
import type { BookmarkNode } from "./bookmark-edit";
import { readOutline, writeOutline, type OutBookmark, type SourceBookmark } from "./outline";
import { loadForEdit } from "./rotate";
import { USER_ERROR } from "./user-error";

const one = (s: string) => s.replace(/\s+/g, " ").trim();

/** Every object of the current outline (items and root), each once. */
function outlineRefs(doc: PDFDocument): PDFRef[] {
  const out: PDFRef[] = [];
  const seen = new Set<string>();
  const root = doc.catalog.get(PDFName.of("Outlines"));
  const walk = (ref: unknown, depth: number) => {
    let at = ref;
    while (at instanceof PDFRef && !seen.has(at.toString()) && seen.size < 20_000 && depth < 64) {
      seen.add(at.toString());
      out.push(at);
      const node = doc.context.lookup(at);
      if (!(node instanceof PDFDict)) break;
      walk(node.get(PDFName.of("First")), depth + 1);
      at = node.get(PDFName.of("Next"));
    }
  };
  if (root instanceof PDFRef) {
    seen.add(root.toString());
    out.push(root);
    const dict = doc.context.lookup(root);
    if (dict instanceof PDFDict) walk(dict.get(PDFName.of("First")), 0);
  }
  return out;
}

export type BookmarksInput = { bytes: Uint8Array; password?: string; items: BookmarkNode[] };

export async function writeBookmarks({ bytes, password, items }: BookmarksInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; count: number }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const pages = doc.getPages();
  // The file's own bookmarks in outline order: an edited row finds the one it came from by name and page, going forward.
  const flat: SourceBookmark[] = [];
  const collect = (list: SourceBookmark[]) => list.forEach((b) => (flat.push(b), collect(b.children)));
  collect(readOutline(doc));
  const used = new Set<SourceBookmark>();
  const find = (src: { title: string; page: number }) => {
    const hit = flat.find((b) => !used.has(b) && b.pageIndex === src.page && one(b.title) === one(src.title));
    if (hit) used.add(hit);
    return hit;
  };
  let count = 0;
  const build = (list: BookmarkNode[]): OutBookmark[] =>
    list.map((n) => {
      const page = pages[n.page];
      if (!page || !n.title) throw new Error(`${USER_ERROR}A bookmark has no name or points at a page that is not in the file.`);
      count++;
      const from = n.src ? find(n.src) : undefined;
      // Children first would match in the wrong order: the outline order is parent, then its children.
      const out: OutBookmark = { title: n.title, page: page.ref, children: [] };
      if (from?.color) out.color = from.color;
      if (from?.flags) out.flags = from.flags;
      if (from?.open === false) out.open = false;
      if (from?.view && from.pageIndex === n.page) out.view = from.view;
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
