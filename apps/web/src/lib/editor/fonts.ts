/**
 * Editor fonts (U-E3 "Fonts", U-E7 type faces). The family list is fonts.json, shared with
 * scripts/copy-editor-fonts.mjs, which copies the files to /fonts/editor/ and writes a manifest
 * with each file's character ranges and each face's vertical metrics. Pure helpers here; the
 * browser loader is fonts-browser.ts.
 */
import config from "./fonts.json";

export type FontFileEntry = { file: string; ranges: [number, number][] };
export type FaceEntry = { files: FontFileEntry[]; ascent: number; descent: number };
/** id → style key ("400-normal", "700-italic"…) → face. */
export type EditorFontManifest = { faces: Record<string, Record<string, FaceEntry>> };

export type TextFamily = { id: string; label: string; standsFor: string; class: string };
export type SignFace = { id: string; label: string };

export const TEXT_FONTS: TextFamily[] = config.text;
export const SIGN_FACES: SignFace[] = config.sign;
export const DEFAULT_FONT = "arimo";
export const FONT_BASE = "/fonts/editor/";
/** File names with this prefix are font library files ("lib:roboto/latin-400-normal.<sha>.woff"). */
export const LIB_FILE = "lib:";
/** File names with this prefix are fonts the user added: bytes kept on this device, never fetched. */
export const USER_FILE = "user:";
/** Font ids with this prefix are the user's own fonts (uploaded, or from this device). */
export const USER_FONT = "user:";

/** Where a font file is fetched from (always our own address). */
export const fontUrl = (file: string) => (file.startsWith(LIB_FILE) ? `/fonts/lib/fonts/${file.slice(LIB_FILE.length)}` : `${FONT_BASE}${encodeURIComponent(file)}`);

export const styleKey = (bold: boolean, italic: boolean) => `${bold ? 700 : 400}-${italic ? "italic" : "normal"}`;

/** CSS family name the editor registers for a font id (one family; weight and style are descriptors). */
export const cssFamily = (id: string) => `bp-${id}`;

/**
 * The face for a font and style; falls back to the upright face of that weight, then regular,
 * then whatever the family has (a display family may only have one weight), then the default font.
 */
export function faceOf(m: EditorFontManifest, id: string, bold = false, italic = false): FaceEntry | undefined {
  const fam = m.faces[id] ?? m.faces[DEFAULT_FONT];
  return fam?.[styleKey(bold, italic)] ?? fam?.[styleKey(bold, false)] ?? fam?.["400-normal"] ?? (fam && Object.values(fam)[0]);
}

export const covers = (ranges: [number, number][], cp: number) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/** The face file whose ranges cover a character, or undefined. */
export function fileFor(face: FaceEntry, cp: number): FontFileEntry | undefined {
  return face.files.find((f) => covers(f.ranges, cp));
}

/** Files a text needs from a face (the browser loads only these). */
export function filesFor(face: FaceEntry, text: string): string[] {
  const out = new Set<string>();
  for (const ch of text) {
    const f = fileFor(face, ch.codePointAt(0)!);
    if (f) out.add(f.file);
  }
  if (!out.size && face.files[0]) out.add(face.files[0].file);
  return [...out];
}

/** Unicode-range descriptor for a file ("U+0-FF,U+131"). */
export function unicodeRange(ranges: [number, number][]): string {
  return ranges.map(([lo, hi]) => (lo === hi ? `U+${lo.toString(16)}` : `U+${lo.toString(16)}-${hi.toString(16)}`)).join(",");
}
