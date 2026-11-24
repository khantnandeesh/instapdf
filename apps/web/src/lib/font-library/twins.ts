/**
 * Metric twins (F24, AC-283): open fonts drawn to the same widths as a font most PDFs name but
 * don't carry, so a line set in the twin is as long as it was. Pure.
 */
import { isClose, type FontMatch } from "./match";

/** Folded name starts → library family id, longest start first. */
const TWINS: [string, string][] = [
  // The Liberation fonts are the same drawings as these three under another name.
  ["liberationserif", "tinos"],
  ["liberationsans", "arimo"],
  ["liberationmono", "cousine"],
  ["timesnewroman", "tinos"],
  ["helvetica", "arimo"],
  ["couriernew", "cousine"],
  ["segoeui", "selawik"],
  ["calibri", "carlito"],
  ["cambria", "caladea"],
  ["georgia", "gelasio"],
  ["courier", "cousine"],
  ["arial", "arimo"],
  ["times", "tinos"],
];
/** Cuts of those families that are drawn to other widths. */
const OTHER_WIDTHS = /narrow|condensed|compressed|black|rounded|math/;

/** The library family with the same widths as the font called `name` ("ABCDEF+Arial-BoldMT", "Times New Roman"). */
export function twinOf(name: string): string | undefined {
  const n = name.replace(/^[A-Z]{6}\+/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const hit = TWINS.find(([start]) => n.startsWith(start));
  return hit && !OTHER_WIDTHS.test(n.slice(hit[0].length)) ? hit[1] : undefined;
}

/**
 * Puts a font's twin first among its matches. A font the PDF doesn't carry has only its name to
 * go by, so the twin stands. One it does carry keeps the order its shapes gave unless they agree
 * with the name: a font called Arial that is drawn as a serif is not given Arimo (AC-282).
 * `has`: whether the library has a family (the twin of Segoe UI isn't in every copy).
 */
export function withTwin(font: { name: string; family: string; embedded: boolean; bold: boolean; italic: boolean }, matches: readonly FontMatch[], has: (id: string) => boolean): FontMatch[] {
  const twin = twinOf(font.family || font.name) ?? twinOf(font.name);
  if (!twin || !has(twin)) return [...matches];
  const found = matches.find((m) => m.family === twin);
  if (font.embedded && !isClose(found)) return [...matches];
  const weight = font.bold ? 700 : 400;
  const first: FontMatch = found
    ? // Shapes that were compared keep their own word ("Exact"); a name alone gets "Same widths".
      { ...found, grade: font.embedded ? found.grade : "twin" }
    : { face: `${twin}_${weight}_${font.italic ? "italic" : "normal"}`, family: twin, weight, italic: font.italic, grade: "twin", distance: 0, letters: 0 };
  return [first, ...matches.filter((m) => m.family !== twin)];
}
