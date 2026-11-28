/**
 * Split by text (spec F7 §5): reads where each piece of text sits on every page with pdf.js, then
 * starts a new part wherever the text inside one area of the page changes. `readPagePoints`
 * touches the file; the rest is pure and unit tested.
 */
import { openPdf } from "./pdfjs";
import type { Area } from "./area";
import type { OutlineParts } from "./split-outline";

/** A piece of text and its middle, as fractions of the page as shown (0,0 = top left). */
export type TextPoint = { str: string; x: number; y: number };


/** The parts of a pdf.js page and text item the reader needs. */
export type TextItem = { str: string; transform: number[]; width: number; height: number };
export type Viewport = { width: number; height: number; convertToViewportPoint(x: number, y: number): number[] };

/** Where each piece's middle lands on the page as shown (its rotation included). */
export function pointsOf(items: readonly TextItem[], viewport: Viewport): TextPoint[] {
  const out: TextPoint[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const [a, b, , , e, f] = it.transform;
    const len = Math.hypot(a, b) || 1;
    // Along the baseline to the middle, then up a third of the height: the middle of the letters.
    const mx = e + (a / len) * (it.width / 2) - (b / len) * (it.height * 0.35);
    const my = f + (b / len) * (it.width / 2) + (a / len) * (it.height * 0.35);
    const [vx, vy] = viewport.convertToViewportPoint(mx, my);
    out.push({ str: it.str, x: vx / viewport.width, y: vy / viewport.height });
  }
  return out;
}

/** Every page's text points ([] when the file cannot be opened: the tool then says no text was found). */
export async function readPagePoints(source: Blob, password?: string): Promise<TextPoint[][]> {
  const opened = await openPdf(new Uint8Array(await source.arrayBuffer()), password);
  if (!opened.ok) return [];
  const { doc, task } = opened.pdf;
  try {
    const pages: TextPoint[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      try {
        const content = await page.getTextContent();
        pages.push(pointsOf(content.items as unknown as TextItem[], page.getViewport({ scale: 1 })));
      } finally {
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** The text whose middle is inside the area, in reading order, with single spaces. */
export function textIn(points: readonly TextPoint[], area: Area): string {
  return points
    .filter((p) => p.x >= area.x && p.x <= area.x + area.w && p.y >= area.y && p.y <= area.y + area.h)
    .map((p) => p.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A new part starts on each page whose text differs from the last text seen. A page with no text
 * in the area stays with the part before it (a continuation page). Each part is named after its text.
 */
export function partsFromTexts(texts: readonly string[], pageCount: number): OutlineParts {
  const parts: number[][] = [];
  const titles: (string | undefined)[] = [];
  let last: string | undefined;
  for (let i = 0; i < pageCount; i++) {
    const text = texts[i] ?? "";
    if (i === 0 || (text && text !== last)) {
      parts.push([]);
      titles.push(text || undefined);
    }
    if (text) last = text;
    parts[parts.length - 1].push(i);
  }
  return { parts, titles };
}
