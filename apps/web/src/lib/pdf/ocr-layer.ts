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

/**
 * Takes hidden text out of a page: in its own content, and any form it draws that holds nothing but
 * hidden text (how OCR tools, ours too, add their layer). Forms are not rewritten, only no longer drawn
 * by this page, so a form another page shares is safe. True when something was taken out.
 */
export function removeHiddenText(doc: PDFDocument, page: PDFPage): boolean {
  const contents = page.node.get(PDFName.of("Contents"));
  const held = contents && doc.context.lookup(contents);
  const streams = held instanceof PDFArray ? held.asArray().map((r) => doc.context.lookup(r)) : held ? [held] : [];
  const parts: Uint8Array[] = [];
  for (const st of streams) {
    const bytes = st instanceof PDFStream ? bytesOf(st) : null;
    // A stream that cannot be read: the page is left exactly as it is.
    if (!bytes) return false;
    parts.push(bytes, NEWLINE);
  }
  const whole = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    whole.set(p, o);
    o += p.length;
  }
  const own = stripHiddenText(whole);
  const forms = page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  const dropped = own.draws.filter((d) => {
    const form = forms?.lookup(PDFName.of(d.name));
    if (!(form instanceof PDFStream) || form.dict.lookup(PDFName.of("Subtype")) !== PDFName.of("Form")) return false;
    const inside = bytesOf(form);
    if (!inside) return false;
    const r = stripHiddenText(inside);
    return r.removed > 0 && !r.paints && r.draws.length === 0;
  });
  if (!own.removed && !dropped.length) return false;
  // Our own layers have a name no other page draws: the form goes with its entry, so reading a file again does not pile them up.
  for (const d of dropped) {
    if (!d.name.startsWith("OcrText")) continue;
    const ref = forms?.get(PDFName.of(d.name));
    forms?.delete(PDFName.of(d.name));
    if (ref instanceof PDFRef) doc.context.delete(ref);
  }
  // Cut the forms from the input first (their places are the input's), then the page's own hidden text.
  const kept = stripHiddenText(cut(whole, dropped)).bytes;
  page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.flateStream(kept)));
  return true;
}
const NEWLINE = new Uint8Array([10]);


export async function addTextLayers({ bytes, password, layers, strip }: OcrLayerInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const pages = doc.getPages();
  if (strip) for (const page of pages) removeHiddenText(doc, page);
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
