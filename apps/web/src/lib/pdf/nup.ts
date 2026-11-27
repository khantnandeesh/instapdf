/**
 * N-up (spec F8 §4): several pages on each sheet. Every page is placed as a reusable picture of
 * itself (a form XObject), so text stays text and nothing is rasterised.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString, degrees, type PDFPage } from "@cantoo/pdf-lib";
import { applyMatrix, shownBox, shownSize, type Box, type Matrix } from "./page-geometry";
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
  // All pages are taken over in one go, so a font or picture they share is stored once. A page with nothing on it has nothing to place.
  const drawn = pages.filter((p) => p.node.Contents());
  const pictures = await out.embedPages(drawn, drawn.map((p) => { const { box } = shownBox(p); return { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height }; }));
  const pictureOf = new Map(drawn.map((p, i) => [p, pictures[i]]));
  for (let start = 0; start < pages.length; start += perSheet) {
    const target = out.addPage([sheet.width, sheet.height]);
    for (let k = 0; k < perSheet && start + k < pages.length; k++) {
      const page = pages[start + k];
      const { box, rotate } = shownBox(page);
      const embedded = pictureOf.get(page);
      const shown = shownSize(box, rotate);
      const s = Math.min(cw / shown.width, ch / shown.height);
      const { col, row } = nupCell(k, cols, rows, options.order, options.rightToLeft);
      const ox = col * cw + (cw - s * shown.width) / 2;
      const oy = sheet.height - (row + 1) * ch + (ch - s * shown.height) / 2;
      // The page's own turn is drawn in: the origin moves to the corner that ends up bottom left.
      const at = { 0: [ox, oy], 90: [ox, oy + s * box.width], 180: [ox + s * box.width, oy + s * box.height], 270: [ox + s * box.height, oy] }[rotate as 0 | 90 | 180 | 270] ?? [ox, oy];
      if (embedded) target.drawPage(embedded, { x: at[0], y: at[1], xScale: s, yScale: s, rotate: degrees(-rotate) });
      const [cos, sin] = ({ 0: [1, 0], 90: [0, -1], 180: [-1, 0], 270: [0, 1] } as Record<number, [number, number]>)[rotate] ?? [1, 0];
      copyWebLinks(page, target, out, box, [s * cos, s * sin, -s * sin, s * cos, at[0], at[1]]);
      onProgress?.((0.7 * (start + k + 1)) / pages.length);
    }
  }
  return { bytes: await out.save(), pageCount: out.getPageCount(), wasEncrypted };
}

/**
 * Web links come along to the sheet, moved with their page. Links to other pages and form fields
 * do not: the pages they pointed at are not pages any more (spec F8 §4).
 */
function copyWebLinks(page: PDFPage, target: PDFPage, out: PDFDocument, box: Box, m: Matrix) {
  const annots = page.node.Annots();
  for (let k = 0; annots && k < annots.size(); k++) {
    const dict = annots.lookupMaybe(k, PDFDict);
    const action = dict?.lookupMaybe(PDFName.of("A"), PDFDict);
    const rect = dict?.lookupMaybe(PDFName.of("Rect"), PDFArray);
    const uri = action?.get(PDFName.of("S")) === PDFName.of("URI") ? action.lookup(PDFName.of("URI")) : undefined;
    if (dict?.get(PDFName.of("Subtype")) !== PDFName.of("Link") || !rect || rect.size() !== 4 || !(uri instanceof PDFString || uri instanceof PDFHexString)) continue;
    const n = [0, 1, 2, 3].map((i) => rect.lookupMaybe(i, PDFNumber)?.asNumber() ?? 0);
    const [ax, ay] = applyMatrix(m, n[0] - box.x, n[1] - box.y);
    const [bx, by] = applyMatrix(m, n[2] - box.x, n[3] - box.y);
    const link = out.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(uri.decodeText().replace(/[\\()]/g, "\\$&")) },
    });
    target.node.addAnnot(out.context.register(link));
  }
}
