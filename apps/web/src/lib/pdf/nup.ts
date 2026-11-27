/**
 * N-up (spec F8 §4): several pages on each sheet. Every page is placed as a reusable picture of
 * itself (a form XObject), so text stays text and nothing is rasterised.
 */
import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { shownBox, shownSize } from "./page-geometry";
import type { NupCount, NupOptions } from "./page-shape-options";
import { loadForEdit } from "./rotate";

export { NUP_COUNTS, NUP_DEFAULTS, type NupCount, type NupOptions } from "./page-shape-options";

/** Columns and rows for a sheet of pages shaped `width` × `height`: the grid that keeps the sheet closest to a page's shape, on its side for 2 and 8. */
export function nupGrid(perSheet: NupCount, width: number, height: number): { cols: number; rows: number } {
  const [a, b] = { 2: [2, 1], 4: [2, 2], 8: [4, 2], 16: [4, 4] }[perSheet];
  // Upright pages sit side by side; pages that are already wide stack instead.
  return width <= height ? { cols: a, rows: b } : { cols: b, rows: a };
}

/** Where the k-th page of a sheet goes: column and row, the row counted from the top. */
export function nupCell(k: number, cols: number, rows: number, order: NupOptions["order"], rightToLeft: boolean): { col: number; row: number } {
  const col = order === "rows" ? k % cols : Math.floor(k / rows);
  const row = order === "rows" ? Math.floor(k / cols) : k % rows;
  return { col: rightToLeft ? cols - 1 - col : col, row };
}

export type NupInput = { bytes: Uint8Array; password?: string; options: NupOptions };

export async function nupPdf({ bytes, password, options }: NupInput, onProgress?: (fraction: number) => void): Promise<{ bytes: Uint8Array; pageCount: number; wasEncrypted: boolean }> {
  const { doc: source, wasEncrypted } = await loadForEdit(bytes, password);
  const pages = source.getPages();
  const out = await PDFDocument.create();
  for (const [get, set] of [
    [() => source.getTitle(), (v: string) => out.setTitle(v)],
    [() => source.getAuthor(), (v: string) => out.setAuthor(v)],
    [() => source.getSubject(), (v: string) => out.setSubject(v)],
  ] as const) {
    const value = get();
    if (value) set(value);
  }
  if (!pages.length) return { bytes: await out.save(), pageCount: 0, wasEncrypted };
  const first = shownBox(pages[0]);
  const base = shownSize(first.box, first.rotate);
  const { cols, rows } = nupGrid(options.perSheet, base.width, base.height);
  // Growing: each cell is one full page. Keeping the size: the first page's paper, turned when the grid is wider than tall.
  const turned = options.keepSize && cols !== rows;
  const sheet = options.keepSize ? { width: turned ? base.height : base.width, height: turned ? base.width : base.height } : { width: cols * base.width, height: rows * base.height };
  const cw = sheet.width / cols;
  const ch = sheet.height / rows;
  const perSheet = cols * rows;
  for (let start = 0; start < pages.length; start += perSheet) {
    const target = out.addPage([sheet.width, sheet.height]);
    for (let k = 0; k < perSheet && start + k < pages.length; k++) {
      const page = pages[start + k];
      const { box, rotate } = shownBox(page);
      const embedded = await out.embedPage(page, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height });
      const shown = shownSize(box, rotate);
      const s = Math.min(cw / shown.width, ch / shown.height);
      const { col, row } = nupCell(k, cols, rows, options.order, options.rightToLeft);
      const ox = col * cw + (cw - s * shown.width) / 2;
      const oy = sheet.height - (row + 1) * ch + (ch - s * shown.height) / 2;
      // The page's own turn is drawn in: the origin moves to the corner that ends up bottom left.
      const at = { 0: [ox, oy], 90: [ox, oy + s * box.width], 180: [ox + s * box.width, oy + s * box.height], 270: [ox + s * box.height, oy] }[rotate as 0 | 90 | 180 | 270] ?? [ox, oy];
      target.drawPage(embedded, { x: at[0], y: at[1], xScale: s, yScale: s, rotate: degrees(-rotate) });
      onProgress?.((0.7 * (start + k + 1)) / pages.length);
    }
  }
  return { bytes: await out.save(), pageCount: out.getPageCount(), wasEncrypted };
}
