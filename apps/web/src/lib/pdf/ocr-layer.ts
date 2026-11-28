/**
 * OCR (spec F15 §2), the part that writes the file. The recogniser hands back, for each page it
 * read, a one-page PDF that holds nothing but invisible text placed where the words are in the
 * picture it was shown. Each of those is laid over its page here, so the page looks the same and its
 * text can be searched, selected and copied. Nothing on the page is redrawn or re-compressed.
 * Worker-only: this module pulls in the PDF library.
 */
import { concatTransformationMatrix, decodePDFRawStream, drawObject, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, popGraphicsState, pushGraphicsState, type PDFPage } from "@cantoo/pdf-lib";
import { cut, stripHiddenText } from "./hidden-text";
import { shownBox, shownToPage } from "./page-geometry";
import { loadForEdit } from "./rotate";

/** `page` is 0-based; `pdf` is the text-only page, drawn for the page as the reader sees it (its own quarter turns applied). */
export type TextLayer = { page: number; pdf: Uint8Array };
export type OcrLayerInput = { bytes: Uint8Array; password?: string; layers: readonly TextLayer[]; /** Take the text an earlier OCR left (hidden text) out of every page first. */ strip?: boolean };

const bytesOf = (stream: PDFStream): Uint8Array | null => {
  try {
    return stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : null;
  } catch {
    return null;
  }
};

const NEWLINE = new Uint8Array([10]);
const CONTENTS = PDFName.of("Contents");

/** A dictionary inside `from`, or nothing when it is missing or not a dictionary. */
const dictIn = (from: PDFDict | undefined, key: string): PDFDict | undefined => {
  try {
    return from?.lookupMaybe(PDFName.of(key), PDFDict);
  } catch {
    return undefined;
  }
};

/** The fonts whose glyphs are drawings (Type 3): they show whatever the text render mode. */
const solidFonts = (resources: PDFDict | undefined): Set<string> => {
  const names = new Set<string>();
  const fonts = dictIn(resources, "Font");
  for (const [key] of fonts?.entries() ?? []) {
    let font: unknown;
    try {
      font = fonts!.lookup(key);
    } catch {
      font = undefined;
    }
    // A font that cannot be read is taken to show, the safe side.
    if (!(font instanceof PDFDict) || font.get(PDFName.of("Subtype")) === PDFName.of("Type3")) names.add(key.decodeText());
  }
  return names;
};

/** The content streams a page points at, straight or through a list. */
const contentRefs = (doc: PDFDocument, page: PDFPage): PDFRef[] => {
  const contents = page.node.get(CONTENTS);
  const held = contents && doc.context.lookup(contents);
  return [contents, ...(held instanceof PDFArray ? held.asArray() : [])].filter((r): r is PDFRef => r instanceof PDFRef);
};

/**
 * Takes hidden text out of the pages: in a page's own content, and any form it draws that holds
 * nothing but hidden text (how OCR tools, ours too, add their layer). Forms are not rewritten, only no
 * longer drawn. What no page uses afterwards (our own earlier layers, the content streams replaced) is
 * taken out of the file, so reading a file again does not pile them up. A page whose content cannot be
 * read is left exactly as it is. Returns the pages (0-based) something was taken from.
 */
export function removeHiddenText(doc: PDFDocument, pages: readonly PDFPage[]): Set<number> {
  const changed = new Set<number>();
  const hiddenOnly = new Map<PDFStream, boolean>();
  const dropped = new Set<PDFRef>();
  const drawn = new Set<PDFRef>();
  const replaced: PDFRef[] = [];
  pages.forEach((page, index) => {
    const resources = page.node.Resources();
    const forms = dictIn(resources, "XObject");
    const allForms = () => {
      for (const [, v] of forms?.entries() ?? []) if (v instanceof PDFRef) drawn.add(v);
    };
    const contents = page.node.get(CONTENTS);
    const held = contents && doc.context.lookup(contents);
    const streams = held instanceof PDFArray ? held.asArray().map((r) => doc.context.lookup(r)) : held ? [held] : [];
    const parts: Uint8Array[] = [];
    for (const st of streams) {
      const bytes = st instanceof PDFStream ? bytesOf(st) : null;
      if (!bytes) return allForms();
      parts.push(bytes, NEWLINE);
    }
    const whole = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      whole.set(p, o);
      o += p.length;
    }
    const solid = solidFonts(resources);
    const own = stripHiddenText(whole, solid);
    const refOf = (name: string) => forms?.get(PDFName.of(name));
    const gone = own.draws.filter((d) => {
      let form: unknown;
      try {
        form = forms?.lookup(PDFName.of(d.name));
      } catch {
        return false;
      }
      if (!(form instanceof PDFStream) || form.dict.get(PDFName.of("Subtype")) !== PDFName.of("Form")) return false;
      let judged = hiddenOnly.get(form);
      if (judged === undefined) {
        const inside = bytesOf(form);
        // A form without fonts of its own uses the page's.
        const r = inside && stripHiddenText(inside, dictIn(form.dict, "Resources") ? solidFonts(dictIn(form.dict, "Resources")) : solid);
        judged = !!r && r.removed > 0 && !r.paints && r.draws.length === 0;
        hiddenOnly.set(form, judged);
      }
      return judged;
    });
    for (const d of own.draws) {
      const ref = refOf(d.name);
      if (!(ref instanceof PDFRef)) continue;
      // Only our own layers are taken out of the file: nothing else draws them.
      if (gone.includes(d) && d.name.startsWith("OcrText")) dropped.add(ref);
      else if (!gone.includes(d)) drawn.add(ref);
    }
    if (!own.removed && !gone.length) return;
    // Cut the forms from the input first (their places are the input's), then the page's own hidden text.
    const kept = stripHiddenText(cut(whole, gone), solid).bytes;
    replaced.push(...contentRefs(doc, page));
    page.node.set(CONTENTS, doc.context.register(doc.context.flateStream(kept)));
    changed.add(index);
  });
  // A layer still drawn by some page stays; the rest go, with their entries (pages may share one list of resources).
  for (const ref of dropped) {
    if (drawn.has(ref)) continue;
    for (const page of pages) {
      const forms = dictIn(page.node.Resources(), "XObject");
      for (const [key, v] of forms?.entries() ?? []) if (v === ref) forms!.delete(key);
    }
    doc.context.delete(ref);
  }
  const inUse = new Set(pages.flatMap((page) => contentRefs(doc, page)));
  for (const ref of new Set(replaced)) if (!inUse.has(ref)) doc.context.delete(ref);
  return changed;
}

export async function addTextLayers({ bytes, password, layers, strip }: OcrLayerInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const pages = doc.getPages();
  if (strip) removeHiddenText(doc, pages);
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const page = pages[layer.page];
    if (page) {
      const text = await PDFDocument.load(layer.pdf, { updateMetadata: false });
      const from = text.getPage(0);
      const { width, height } = from.getSize();
      if (width > 0 && height > 0) {
        const [embedded] = await doc.embedPages([from]);
        const { box, rotate } = shownBox(page);
        // The layer's bottom left, bottom right and top left corners, in the page's own coordinates.
        const [ox, oy] = shownToPage(0, 1, box, rotate);
        const [rx, ry] = shownToPage(1, 1, box, rotate);
        const [tx, ty] = shownToPage(0, 0, box, rotate);
        // Two pages may point at one list of content streams: this page gets its own list first, so the layer stays on it.
        const contents = page.node.get(PDFName.of("Contents"));
        const list = contents && doc.context.lookup(contents);
        if (list instanceof PDFArray) page.node.set(PDFName.of("Contents"), doc.context.obj(list.asArray()));
        // Closes any graphics state the page left open, so the layer is not drawn through a stray matrix or clip.
        page.node.normalize();
        const name = page.node.newXObject("OcrText", embedded.ref);
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix((rx - ox) / width, (ry - oy) / width, (tx - ox) / height, (ty - oy) / height, ox, oy), drawObject(name), popGraphicsState());
      }
    }
    onProgress?.((0.8 * (i + 1)) / layers.length);
  }
  return { bytes: await doc.save(), pageCount: pages.length, wasEncrypted };
}
