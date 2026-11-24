/**
 * Added-text layout shared by the screen and the output (AC-23, AC-91). Pure, unit tested.
 *
 * The editor measures with the same font file it embeds, breaks lines here, and stores the lines
 * on the object, so the PDF gets exactly the lines the user saw. Each line's baseline sits where
 * CSS would put it in a line box of LINE_HEIGHT × size (half-leading above and below).
 */
import { LINE_HEIGHT } from "./model";

export type Measure = (text: string) => number;
export type FaceMetrics = { ascent: number; descent: number };

/** Breaks `text` into lines: on "\n", and (with a wrap width) greedily between words; a word longer than the width breaks between characters. */
export function layoutText(text: string, wrap: number | null, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (wrap == null || measure(para) <= wrap) {
      out.push(para);
      continue;
    }
    let line = "";
    for (const word of para.split(/(?<=\s)/)) {
      const tryLine = line + word;
      if (measure(tryLine.trimEnd()) <= wrap || !line) {
        if (measure(tryLine.trimEnd()) <= wrap) {
          line = tryLine;
          continue;
        }
        // A single word wider than the box: break it between characters.
        let piece = line;
        for (const ch of Array.from(word)) {
          if (piece && measure((piece + ch).trimEnd()) > wrap) {
            out.push(piece.trimEnd());
            piece = "";
          }
          piece += ch;
        }
        line = piece;
        continue;
      }
      out.push(line.trimEnd());
      line = word;
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Box a laid-out text needs: the widest line (or the wrap width) by the line count. */
export function textBoxSize(lines: string[], wrap: number | null, size: number, measure: Measure): { w: number; h: number } {
  const widest = Math.max(0, ...lines.map((l) => measure(l)));
  return { w: Math.max(wrap ?? Math.ceil(widest + 1), size * 0.6), h: Math.max(1, lines.length) * size * LINE_HEIGHT };
}

/** Distance from the top of line `i`'s box to its baseline, in points. */
export function baselineOffset(m: FaceMetrics, size: number, i = 0): number {
  return ((LINE_HEIGHT - (m.ascent + m.descent)) * size) / 2 + m.ascent * size + i * LINE_HEIGHT * size;
}

/** Left edge of a line in its box for an alignment. */
export function alignOffset(align: "left" | "center" | "right", boxWidth: number, lineWidth: number): number {
  if (align === "center") return (boxWidth - lineWidth) / 2;
  if (align === "right") return boxWidth - lineWidth;
  return 0;
}
