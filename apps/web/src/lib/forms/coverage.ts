/**
 * Characters of form values that won't print (AC-232, AC-75: never silently). Pure, unit tested.
 * It makes the same choice as the writer (lib/forms/write.ts `Fonts.pick`), from the same data:
 * Helvetica when WinAnsi has every character, else the forms font (scripts/forms-font/merge.py,
 * its real character list in noto-sans-forms.json) when it has every one, else whichever of
 * Helvetica, the forms font and the Noto slice covering the most distinct characters draws the most.
 */
import { covers, type FontFileEntry } from "@/lib/editor/fonts";
import type { FormField, FormState } from "./types";

/** Characters a field's text may hold that need no glyph. Everything else must be drawn. */
export const needsNoGlyph = (ch: string) => ch === "\n" || ch === "\r" || ch === "\t";

/** WinAnsi (Helvetica in a PDF): ASCII, Latin-1 and the 27 extra characters of 0x80 to 0x9F. */
const WIN_ANSI = new Set<number>([
  ...Array.from({ length: 0x7f - 0x20 }, (_, i) => 0x20 + i),
  ...Array.from({ length: 0x100 - 0xa0 }, (_, i) => 0xa0 + i),
  ...[..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"].map((c) => c.codePointAt(0)!),
]);
export const winAnsiHas = (cp: number) => WIN_ANSI.has(cp);

type Has = (cp: number) => boolean;

/** How many of the characters (repeats counted) a font draws. */
export function drawnCount(text: string, has: Has): number {
  let n = 0;
  for (const ch of text) if (needsNoGlyph(ch) || has(ch.codePointAt(0)!)) n++;
  return n;
}

/** The Noto slice whose ranges hold the most distinct characters of `text` (the writer's pick). */
export function bestSlice<T extends { ranges: [number, number][] }>(text: string, slices: readonly T[]): T | null {
  const cps = [...new Set([...text].map((c) => c.codePointAt(0)!))].filter((cp) => cp > 0x20);
  let best: T | null = null;
  let bestN = 0;
  for (const f of slices) {
    const n = cps.filter((cp) => covers(f.ranges, cp)).length;
    if (n > bestN) {
      best = f;
      bestN = n;
    }
    if (n === cps.length) break;
  }
  return best;
}

const textOf = (f: FormField) => [...(Array.isArray(f.value) ? f.value : [f.value]), ...(f.kind === "dropdown" || f.kind === "list" ? f.options : [])].join("");

/** Unique characters of one text that its field's font can't draw. */
export function missingInText(text: string, formsRanges: [number, number][], slices: readonly FontFileEntry[]): string[] {
  const forms: Has = (cp) => covers(formsRanges, cp);
  const total = [...text].length;
  let has: Has = winAnsiHas;
  if (drawnCount(text, winAnsiHas) === total) return [];
  if (drawnCount(text, forms) === total) return [];
  let most = drawnCount(text, winAnsiHas);
  const slice = bestSlice(text, slices);
  // A slice's ranges, plus the spaces every slice file carries beyond them.
  const candidates: Has[] = [forms, ...(slice ? [(cp: number) => cp === 0x20 || cp === 0xa0 || covers(slice.ranges, cp)] : [])];
  for (const c of candidates) {
    const n = drawnCount(text, c);
    if (n > most) {
      has = c;
      most = n;
    }
  }
  return [...new Set([...text].filter((ch) => !needsNoGlyph(ch) && !has(ch.codePointAt(0)!)))];
}

/** Unique characters of changed or new fields' text that the field's font can't draw. */
export function missingInForm(state: FormState | undefined, original: FormState | null | undefined, formsRanges: [number, number][], slices: readonly FontFileEntry[]): string[] {
  if (!state || state === original) return [];
  const before = new Map((original?.fields ?? []).map((f) => [f.id, f]));
  const out = new Set<string>();
  for (const f of state.fields) {
    if (f.kind !== "text" && f.kind !== "dropdown" && f.kind !== "list") continue;
    const o = before.get(f.id);
    if (o && JSON.stringify([o.value, o.options]) === JSON.stringify([f.value, f.options])) continue;
    missingInText(textOf(f), formsRanges, slices).forEach((c) => out.add(c));
  }
  return [...out];
}
