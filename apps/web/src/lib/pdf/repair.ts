/**
 * Repair (spec F13 §2): what can be read of a damaged file, written out as a sound one.
 *
 * The reader does not trust the file's index (cross-reference table, trailer, stream lengths): it
 * reads the objects where they lie, so a file cut short, shifted, or with a broken index still gives
 * up every object that is whole. From those the page list is rebuilt: pages the tree still reaches,
 * or, when the tree is gone, every page object found. What a page inherited from a lost parent
 * (its size, its fonts and pictures) is copied onto it, and references to missing parts are dropped
 * so every reader opens the result. Worker-only: this module pulls in the PDF library.
 */
import { PDFArray, PDFCatalog, PDFDict, PDFDocument, PDFName, PDFNumber, PDFPageLeaf, PDFPageTree, PDFRawStream, PDFRef, PDFWriter, type PDFContext, type PDFObject } from "@cantoo/pdf-lib";
import { loadForEdit } from "./rotate";
import { USER_ERROR } from "./user-error";
import { saveCompact } from "./write";

export type RepairInput = { bytes: Uint8Array; password?: string; name?: string };
export type RepairResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; warnings?: string[] };

const N = (s: string) => PDFName.of(s);
const HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const INHERITED = ["Resources", "MediaBox", "CropBox", "Rotate"];
/** US Letter, the size a reader assumes for a page that has lost its own. */
const DEFAULT_BOX = [0, 0, 612, 792];

/** The file from its "%PDF-" on (mail and download wrappers put text before it); with a header put on when it has none. */
export function fromHeader(bytes: Uint8Array): Uint8Array {
  const limit = bytes.length - HEADER.length;
  for (let i = 0; i <= limit; i++) {
    if (bytes[i] === 0x25 && HEADER.every((b, k) => bytes[i + k] === b)) return i ? bytes.subarray(i) : bytes;
  }
  const head = new TextEncoder().encode("%PDF-1.7\n");
  const out = new Uint8Array(head.length + bytes.length);
  out.set(head);
  out.set(bytes, head.length);
  return out;
}

const cannot = (name?: string) => new Error(`${USER_ERROR}${name ?? "This file"} has too little left to repair: no page could be read from it.`);

export async function repairPdf({ bytes, password, name }: RepairInput, onProgress?: (fraction: number) => void): Promise<RepairResult> {
  let ctx: PDFContext;
  let wasEncrypted: boolean;
  try {
    const loaded = await loadForEdit(fromHeader(bytes), password);
    ctx = loaded.doc.context;
    wasEncrypted = loaded.wasEncrypted;
  } catch {
    throw cannot(name);
  }
  onProgress?.(0.4);
  const look = (o: PDFObject | undefined) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const dict = (o: PDFObject | undefined) => {
    const v = look(o);
    return v instanceof PDFDict ? v : undefined;
  };
  const isPage = (d: PDFDict) => d.get(N("Type")) === N("Page") || (d.get(N("Type")) === undefined && (d.has(N("Contents")) || d.has(N("MediaBox"))) && !d.has(N("Kids")));

  // 1. The pages the tree still reaches, in reading order.
  const oldCatalog = dict(ctx.trailerInfo.Root);
  const oldRoot = oldCatalog?.get(N("Pages"));
  const pages: PDFRef[] = [];
  const visited = new Set<string>();
  const walk = (raw: PDFObject | undefined, depth: number) => {
    if (!(raw instanceof PDFRef) || visited.has(raw.tag) || depth > 64) return;
    visited.add(raw.tag);
    const node = dict(raw);
    if (!node || node instanceof PDFRawStream) return;
    const kids = look(node.get(N("Kids")));
    if (kids instanceof PDFArray) for (const kid of kids.asArray()) walk(kid, depth + 1);
    else if (isPage(node)) pages.push(raw);
  };
  walk(oldRoot, 0);
  const declared = (() => {
    const count = look(dict(oldRoot)?.get(N("Count")));
    return count instanceof PDFNumber ? count.asNumber() : 0;
  })();
  // 2. No tree, or an empty one: every page object in the file, in the order it was written.
  if (!pages.length) {
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict && !(obj instanceof PDFRawStream) && obj.get(N("Type")) === N("Page")) pages.push(ref);
    }
  }
  if (!pages.length) throw cannot(name);
  onProgress?.(0.5);

  // 3. Each page gets what it took from its parents, and loses what points at nothing.
  let emptied = 0;
  for (const ref of pages) {
    const page = ctx.lookup(ref) as PDFDict;
    for (const key of INHERITED) {
      if (page.has(N(key))) continue;
      const up = new Set<PDFDict>([page]);
      for (let parent = dict(page.get(N("Parent"))); parent && !up.has(parent); parent = dict(parent.get(N("Parent")))) {
        up.add(parent);
        const value = parent.get(N(key));
        if (value) {
          page.set(N(key), value);
          break;
        }
      }
    }
    const box = look(page.get(N("MediaBox")));
    if (!(box instanceof PDFArray) || box.size() !== 4) page.set(N("MediaBox"), ctx.obj(DEFAULT_BOX));
    if (!dict(page.get(N("Resources")))) page.set(N("Resources"), ctx.obj({}));
    const contents = page.get(N("Contents"));
    const list = look(contents);
    const streams = (list instanceof PDFArray ? list.asArray() : contents ? [contents] : []).filter((c) => look(c) instanceof PDFRawStream);
    if (!streams.length) {
      if (contents) emptied++;
      page.delete(N("Contents"));
    } else if (list instanceof PDFArray && streams.length !== list.size()) page.set(N("Contents"), ctx.obj(streams));
    const annots = look(page.get(N("Annots")));
    if (annots instanceof PDFArray) {
      const kept = annots.asArray().filter((a) => dict(a));
      if (kept.length !== annots.size()) page.set(N("Annots"), ctx.obj(kept));
    } else if (page.has(N("Annots"))) page.delete(N("Annots"));
  }

  // 4. One flat page tree under the catalog (the old one, with whatever else it still holds).
  const tree = PDFPageTree.withContext(ctx);
  const treeRef = ctx.register(tree);
  for (const ref of pages) {
    const page = ctx.lookup(ref) as PDFDict;
    page.set(N("Type"), N("Page"));
    page.set(N("Parent"), treeRef);
    if (!(page instanceof PDFPageLeaf)) ctx.assign(ref, PDFPageLeaf.fromMapWithContext(new Map(page.entries()), ctx, false));
    tree.pushLeafNode(ref);
  }
  if (oldCatalog && !(oldCatalog instanceof PDFRawStream)) {
    oldCatalog.set(N("Type"), N("Catalog"));
    oldCatalog.set(N("Pages"), treeRef);
    // What the catalog points at but the file no longer holds would stop some readers.
    for (const [key, value] of oldCatalog.entries()) if (value instanceof PDFRef && !ctx.lookup(value)) oldCatalog.delete(key);
    if (!(oldCatalog instanceof PDFCatalog) && ctx.trailerInfo.Root instanceof PDFRef) ctx.assign(ctx.trailerInfo.Root, PDFCatalog.fromMapWithContext(new Map(oldCatalog.entries()), ctx));
  } else ctx.trailerInfo.Root = ctx.register(PDFCatalog.withContextAndPages(ctx, treeRef));
  if (ctx.trailerInfo.Info && !dict(ctx.trailerInfo.Info)) delete ctx.trailerInfo.Info;
  delete ctx.trailerInfo.Encrypt;
  onProgress?.(0.6);

  // 5. Written once plainly and read back, so the compact writer starts from a sound document.
  const plain = await PDFWriter.forContext(ctx, 50).serializeToBuffer();
  const doc = await PDFDocument.load(plain, { updateMetadata: false });
  onProgress?.(0.8);
  const out = await saveCompact(doc);
  onProgress?.(1);

  const warnings: string[] = [];
  if (declared > pages.length) warnings.push(`${pages.length} of ${declared} pages were recovered. The rest of the file is missing or cannot be read.`);
  if (emptied) warnings.push(emptied === 1 ? "One page lost its content and is blank." : `${emptied} pages lost their content and are blank.`);
  return { bytes: out, pageCount: pages.length, wasEncrypted, ...(warnings.length ? { warnings } : {}) };
}
