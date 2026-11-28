/**
 * Resize (spec F8 §2): add margins around pages, or put pages on another paper size. Margins only
 * grow the page's box; a new size scales the content to fit and centres it. Nothing is redrawn.
 */
import { hidesContent, setPageBox, shownBox, sidesToPage, transformAnnotations, transformContent, type Matrix, type Sides } from "./page-geometry";
import { loadForEdit } from "./rotate";

export type ResizeOptions =
  | { mode: "margins"; /** Points to add on each side, as the reader sees the page. */ margins: Sides }
  | { mode: "size"; /** The paper, in points, upright. A page shown wider than tall gets it on its side. */ width: number; height: number };

export type ResizeInput = { bytes: Uint8Array; password?: string; /** 0-based pages to change. */ pages: readonly number[]; options: ResizeOptions };

/** The largest margin or page side we write (200 inches, the PDF limit). */
export const MAX_POINTS = 14400;

/** The matrix that fits a `w` × `h` box at (x, y) into a `tw` × `th` page at the origin, centred. */
export function fitMatrix(box: { x: number; y: number; width: number; height: number }, tw: number, th: number): Matrix {
  const s = Math.min(tw / box.width, th / box.height);
  return [s, 0, 0, s, (tw - s * box.width) / 2 - s * box.x, (th - s * box.height) / 2 - s * box.y];
}

export async function resizePdf({ bytes, password, pages, options }: ResizeInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  const all = doc.getPages();
  const picked = new Set(pages);
  all.forEach((page, i) => {
    if (picked.has(i)) {
      const { box, rotate } = shownBox(page);
      if (options.mode === "margins") {
        const clamp = (n: number) => Math.min(MAX_POINTS, Math.max(0, Number.isFinite(n) ? n : 0));
        const m = sidesToPage({ top: clamp(options.margins.top), right: clamp(options.margins.right), bottom: clamp(options.margins.bottom), left: clamp(options.margins.left) }, rotate);
        // What the old page box hid must not show up in the new margins.
        if (hidesContent(page, box)) transformContent(doc, page, [1, 0, 0, 1, 0, 0], box);
        setPageBox(page, { x: box.x - m.x0, y: box.y - m.y0, width: box.width + m.x0 + m.x1, height: box.height + m.y0 + m.y1 });
      } else if ([options.width, options.height].every((n) => Number.isFinite(n) && n > 0 && n <= MAX_POINTS) && box.width > 0 && box.height > 0) {
        const shownWide = (rotate % 180 === 0 ? box.width : box.height) > (rotate % 180 === 0 ? box.height : box.width);
        const [long, short] = [Math.max(options.width, options.height), Math.min(options.width, options.height)];
        // The paper as the reader will see it, then in the page's own axes.
        const [sw, sh] = shownWide ? [long, short] : [short, long];
        const [tw, th] = rotate % 180 === 0 ? [sw, sh] : [sh, sw];
        const m = fitMatrix(box, tw, th);
        transformContent(doc, page, m, hidesContent(page, box) ? box : undefined);
        transformAnnotations(doc, page, m);
        setPageBox(page, { x: 0, y: 0, width: tw, height: th });
      }
    }
    onProgress?.((0.6 * (i + 1)) / all.length);
  });
  return { bytes: await doc.save(), pageCount: all.length, wasEncrypted };
}
