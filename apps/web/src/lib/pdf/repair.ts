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
import { PDFArray, PDFCatalog, PDFDict, PDFDocument, PDFName, PDFNumber, PDFPageLeaf, PDFPageTree, PDFRawStream, PDFRef, PDFWriter, decodePDFRawStream, type PDFContext, type PDFObject } from "@cantoo/pdf-lib";
import { dropOldSecurity } from "./rotate";
import { USER_ERROR } from "./user-error";
import { saveCompact } from "./write";

export type RepairInput = { bytes: Uint8Array; password?: string; name?: string };
export type RepairResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; warnings?: string[]; notes?: string[] };

const N = (s: string) => PDFName.of(s);
const HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const INHERITED = ["Resources", "MediaBox", "CropBox", "Rotate"];
/** US Letter, the size a reader assumes for a page that has lost its own. */
const DEFAULT_BOX = [0, 0, 612, 792];

/** The file from its "%PDF-" on (mail and download wrappers put text before it); with a header put on when it has none before its first object. */
export function fromHeader(bytes: Uint8Array): Uint8Array {
  const limit = bytes.length - HEADER.length;
  for (let i = 0; i <= limit; i++) {
    // " obj" before any header: the file's own header is lost, and a later one belongs to a file held inside it.
    if (bytes[i] === 0x20 && bytes[i + 1] === 0x6f && bytes[i + 2] === 0x62 && bytes[i + 3] === 0x6a) break;
    if (bytes[i] === 0x25 && HEADER.every((b, k) => bytes[i + k] === b)) return i ? bytes.subarray(i) : bytes;
  }
  const head = new TextEncoder().encode("%PDF-1.7\n");
  const out = new Uint8Array(head.length + bytes.length);
  out.set(head);
  out.set(bytes, head.length);
  return out;
}

/** True when the file ends in a pointer to an index that is really there: a reader that trusts the index can open it. */
export function indexSound(bytes: Uint8Array): boolean {
  const latin = (from: number, to: number) => String.fromCharCode(...bytes.subarray(Math.max(0, from), Math.min(bytes.length, to)));
  // The last pointer in the tail: a sound file may carry a few stray bytes after its end mark.
  const at = [...latin(bytes.length - 1024, bytes.length).matchAll(/startxref\s+(\d+)\s+%%EOF/g)].pop();
  if (!at) return false;
  return /^\s*(xref|\d+\s+\d+\s+obj)/.test(latin(Number(at[1]), Number(at[1]) + 24));
}

const cannot = (name?: string) => new Error(`${USER_ERROR}${name ?? "This file"} has too little left to repair: no page could be read from it.`);
const locked = (name: string | undefined, asked: boolean) =>
  new Error(`${USER_ERROR}${name ?? "This file"} is protected with a password${asked ? " and the one given did not open it" : ", and is too damaged for the password to be asked for"}. It cannot be repaired here.`);
const keyLost = (name?: string) => new Error(`${USER_ERROR}${name ?? "This file"} is protected with a password and the part that holds its key is missing, so its pages cannot be read.`);

/**
 * A file that lost its trailer lost the pointer to its encryption with it: it reads as an open file
 * whose every stream is noise. True when the file holds a password dictionary and none of the packed
 * streams sampled can be unpacked (an old dictionary left behind in an open file fails the second test).
 */
function stillEncrypted(ctx: PDFContext): boolean {
  let security = false;
  const packed: PDFRawStream[] = [];
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const d = obj instanceof PDFDict ? obj : obj instanceof PDFRawStream ? obj.dict : undefined;
    if (!d) continue;
    if (d.get(N("Filter")) === N("Standard") && ["O", "U", "P"].every((k) => d.has(N(k)))) security = true;
    else if (obj instanceof PDFRawStream && packed.length < 6 && d.get(N("Filter")) === N("FlateDecode") && d.get(N("Type")) !== N("XRef")) packed.push(obj);
  }
  if (!security || !packed.length) return false;
  return packed.every((stream) => {
    try {
      decodePDFRawStream(stream).decode();
      return false;
    } catch {
      return true;
    }
  });
}

export async function repairPdf({ bytes, password, name }: RepairInput, onProgress?: (fraction: number) => void): Promise<RepairResult> {
  const data = fromHeader(bytes);
  const damaged = data !== bytes || !indexSound(data);
  let ctx: PDFContext;
  let wasEncrypted: boolean;
  try {
    const probe = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
    wasEncrypted = probe.isEncrypted;
    ctx = probe.context;
  } catch {
    throw cannot(name);
  }
  if (wasEncrypted) {
    try {
      const doc = await PDFDocument.load(data, { password: password ?? "", updateMetadata: false });
      dropOldSecurity(doc);
      ctx = doc.context;
    } catch {
      throw locked(name, password !== undefined);
    }
  } else if (stillEncrypted(ctx)) throw keyLost(name);
  onProgress?.(0.4);
  const look = (o: PDFObject | undefined) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const dict = (o: PDFObject | undefined) => {
    const v = look(o);
    return v instanceof PDFDict ? v : undefined;
  };
  const isPage = (d: PDFDict) => d.get(N("Type")) === N("Page") || (d.get(N("Type")) === undefined && (d.has(N("Contents")) || d.has(N("MediaBox"))) && !d.has(N("Kids")));

  // A lost trailer takes the way to the catalog and to the document information with it: the last of each in the file stands in.
  if (!dict(ctx.trailerInfo.Root) || !dict(ctx.trailerInfo.Info)) {
    const INFO = ["Title", "Author", "Producer", "Creator", "CreationDate", "ModDate"];
    let catalog: PDFRef | undefined;
    let info: PDFRef | undefined;
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFDict) || obj instanceof PDFRawStream) continue;
      const type = obj.get(N("Type"));
      if (type === N("Catalog")) catalog = ref;
      else if (type === undefined && !obj.has(N("Kids")) && INFO.some((k) => obj.has(N(k))) && [...obj.keys()].every((k) => INFO.includes(k.decodeText()) || ["Subject", "Keywords", "Trapped"].includes(k.decodeText()))) info = ref;
    }
    if (!dict(ctx.trailerInfo.Root) && catalog) ctx.trailerInfo.Root = catalog;
    if (!dict(ctx.trailerInfo.Info) && info) ctx.trailerInfo.Info = info;
  }

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
  // The same when the tree reaches fewer pages than it counts: a lost branch does not lose its pages.
  if (pages.length < Math.max(declared, 1)) {
    const reached = new Set(pages.map((p) => p.tag));
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict && !(obj instanceof PDFRawStream) && obj.get(N("Type")) === N("Page") && !reached.has(ref.tag)) pages.push(ref);
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
  // A damaged file that lost nothing: say so, or the result looks like nothing was done.
  const notes = damaged && !warnings.length ? [pages.length === 1 ? "The file was damaged. Its page was recovered." : `The file was damaged. All ${pages.length} pages were recovered.`] : [];
  return { bytes: out, pageCount: pages.length, wasEncrypted, ...(warnings.length ? { warnings } : {}), ...(notes.length ? { notes } : {}) };
}
