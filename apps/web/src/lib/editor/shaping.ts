/**
 * Added text that needs the shaping engine to print (AC-224): Hindi and the other Indic scripts,
 * Arabic, Hebrew, Thai and similar. pdf-lib draws one glyph per character, which breaks these
 * (no conjuncts, no reph, no joining, wrong order), so the download leaves such lines to the
 * engine's addText. Pure, unit tested.
 */
import { covers, type FaceEntry } from "./fonts";

/** Where the shaping fonts are listed (written by scripts/copy-fonts.mjs). */
export const SHAPING_MANIFEST = "/fonts/shaping/manifest.json";

/** One font the engine can shape with, under the family name the engine asks for. */
export type ShapingFont = { family: string; url: string; ranges: [number, number][] };
export type ShapingManifest = { fonts: ShapingFont[] };

/**
 * Ranges whose characters change shape with their neighbours or with bidi: a superset of the
 * engine's `script::is_complex` (crates/berry-engine/src/script.rs). Erring wide is safe: the
 * shaping engine also draws plain text correctly.
 */
const COMPLEX: [number, number][] = [
  [0x0590, 0x08ff], // Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, Mandaic, Arabic extended
  [0x0900, 0x0dff], // Devanagari … Sinhala
  [0x0e00, 0x0fff], // Thai, Lao, Tibetan
  [0x1000, 0x109f], // Myanmar
  [0x1780, 0x17ff], // Khmer
  [0x200f, 0x200f], // right-to-left mark
  [0xa8e0, 0xa8ff], // Devanagari extended
  [0xfb1d, 0xfeff], // Hebrew and Arabic presentation forms
  [0x10800, 0x10fff], // historic right-to-left scripts
  [0x1e800, 0x1eeff], // Mende Kikakui, Adlam, Arabic mathematical
];

export function isComplex(cp: number): boolean {
  return covers(COMPLEX, cp);
}

/** True when some line of this text needs the shaper. */
export function needsShaping(text: string): boolean {
  for (const ch of text) if (isComplex(ch.codePointAt(0)!)) return true;
  return false;
}

/** The shaping fonts a text needs: the ones covering one of its characters, in manifest order. */
export function shapingFontsFor(m: ShapingManifest, text: string): ShapingFont[] {
  const cps = [...text].map((c) => c.codePointAt(0)!);
  return m.fonts.filter((f) => cps.some((cp) => covers(f.ranges, cp)));
}

/**
 * The text the engine is asked to draw: characters that neither the box's face nor a shaping
 * font covers become "?" (the download asked first, AC-75), as pdf-lib's path does.
 */
export function printable(text: string, face: Pick<FaceEntry, "files">, m: ShapingManifest): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const ok = cp < 0x21 || /\s/u.test(ch) || (cp >= 0x7f && cp < 0xa0) || cp === 0x200c || cp === 0x200d || face.files.some((f) => covers(f.ranges, cp)) || m.fonts.some((f) => covers(f.ranges, cp));
    out += ok ? ch : "?";
  }
  return out;
}

/** One line for the engine's addText, in the built file's coordinates. */
export type ShapedLine = {
  /** Output page index. */
  page: number;
  text: string;
  /** The box's face id (fonts.json). */
  font: string;
  /** Families best first: the box's face, then Noto Sans for punctuation (the engine adds the script's family). */
  families: string[];
  bold: boolean;
  italic: boolean;
  size: number;
  /** Baseline left end, PDF user space. */
  x: number;
  y: number;
  /** Degrees counter-clockwise. */
  angle: number;
  /** sRGB 0–255. */
  color: [number, number, number];
};

/** Colour as the engine takes it, from 0–1 components. */
export const color255 = (c: readonly [number, number, number]): [number, number, number] => c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as [number, number, number];
