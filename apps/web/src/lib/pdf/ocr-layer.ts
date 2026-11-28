/**
 * OCR (spec F15 §2), the part that writes the file. The recogniser hands back, for each page it
 * read, a one-page PDF that holds nothing but invisible text placed where the words are in the
 * picture it was shown. Each of those is laid over its page here, so the page looks the same and its
 * text can be searched, selected and copied. Nothing on the page is redrawn or re-compressed.
 * Worker-only: this module pulls in the PDF library.
 */
import { concatTransformationMatrix, drawObject, PDFDocument, popGraphicsState, pushGraphicsState } from "@cantoo/pdf-lib";
import { shownBox, shownToPage } from "./page-geometry";
import { loadForEdit } from "./rotate";

/** `page` is 0-based; `pdf` is the text-only page, drawn for the page as the reader sees it (its own quarter turns applied). */
export type TextLayer = { page: number; pdf: Uint8Array };
export type OcrLayerInput = { bytes: Uint8Array; password?: string; layers: readonly TextLayer[] };

export async function addTextLayers({ bytes, password, layers }: OcrLayerInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const pages = doc.getPages();
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
