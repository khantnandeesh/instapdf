/**
 * The user's own fonts (F24): a font file they pick, or a font installed on this device (Local
 * Font Access, Chromium on desktop). The bytes stay in this page's memory: they are handed to the
 * browser's FontFace and to the download worker directly, and never fetched, stored or uploaded.
 * A font whose own embedding flag forbids embedding is refused.
 */
import type { FaceEntry } from "../editor/fonts";
import { USER_FILE, USER_FONT, styleKey } from "../editor/fonts";
import { foldName } from "./client";

export const USER_FONT_ACCEPT = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";
/** Larger files are refused (a typical font is under 1 MB; CJK fonts reach about 20 MB). */
export const USER_FONT_MAX_BYTES = 30 * 1024 * 1024;

export type UserFontError = "not-a-font" | "collection" | "no-embedding" | "too-large";
export const USER_FONT_ERROR: Record<UserFontError, string> = {
  "not-a-font": "That file isn’t a font we can read. Use a TTF, OTF, WOFF or WOFF2 file.",
  collection: "That file holds several fonts in one. Pick a single-font file.",
  "no-embedding": "This font’s licence settings don’t allow putting it in a PDF.",
  "too-large": "That font file is too large.",
};

/** The fields read from a parsed font (what @cantoo/fontkit's `create` returns). */
export type ParsedFont = {
  familyName?: string | null;
  postscriptName?: string | null;
  subfamilyName?: string | null;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  italicAngle?: number;
  characterSet: number[];
  "OS/2"?: { fsType?: { noEmbedding?: boolean; bitmapOnly?: boolean }; usWeightClass?: number; fsSelection?: { italic?: boolean; oblique?: boolean; bold?: boolean } };
  fonts?: unknown[];
};

export type UserFace = { family: string; bold: boolean; italic: boolean; face: Omit<FaceEntry, "files">; ranges: [number, number][] };

/** Sorted code points → inclusive ranges. */
export function toRanges(cps: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const cp of [...cps].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && cp <= last[1] + 1) last[1] = Math.max(last[1], cp);
    else out.push([cp, cp]);
  }
  return out;
}

/** What a parsed font is and whether it may be used, or why not. */
export function describeFont(font: ParsedFont | null | undefined): UserFace | { error: UserFontError } {
  if (!font) return { error: "not-a-font" };
  if (font.fonts) return { error: "collection" };
  if (!font.unitsPerEm || !font.characterSet?.length) return { error: "not-a-font" };
  const os2 = font["OS/2"];
  if (os2?.fsType?.noEmbedding || os2?.fsType?.bitmapOnly) return { error: "no-embedding" };
  const sub = (font.subfamilyName ?? "").toLowerCase();
  const bold = os2?.fsSelection?.bold || (os2?.usWeightClass ?? 400) >= 600 || /bold|black|heavy/.test(sub);
  const italic = !!(os2?.fsSelection?.italic || os2?.fsSelection?.oblique || font.italicAngle || /italic|oblique/.test(sub));
  const family = (font.familyName || font.postscriptName || "").trim();
  if (!family) return { error: "not-a-font" };
  return {
    family,
    bold: !!bold,
    italic,
    face: { ascent: font.ascent / font.unitsPerEm, descent: -font.descent / font.unitsPerEm },
    ranges: toRanges(font.characterSet),
  };
}

export const userFontId = (family: string) => `${USER_FONT}${foldName(family) || "font"}`;

export type AddedFont = { id: string; label: string; faces: Record<string, FaceEntry>; bytes: Record<string, Uint8Array> };

/** Reads one font file into the shape fonts-browser's registerUserFont takes. */
export async function readUserFont(bytes: Uint8Array): Promise<AddedFont | { error: UserFontError }> {
  if (bytes.length > USER_FONT_MAX_BYTES) return { error: "too-large" };
  let parsed: ParsedFont | null = null;
  try {
    const fontkit = (await import("@cantoo/fontkit")).default;
    parsed = fontkit.create(bytes) as unknown as ParsedFont;
  } catch {
    return { error: "not-a-font" };
  }
  const d = describeFont(parsed);
  if ("error" in d) return d;
  const id = userFontId(d.family);
  const key = styleKey(d.bold, d.italic);
  // The name carries a hash of the bytes, so a second file of the same family and style is a
  // new file to the preview as well as to the download.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  const hash = Array.from(digest.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
  const file = `${USER_FILE}${id.slice(USER_FONT.length)}/${key}.${hash}`;
  return { id, label: d.family, faces: { [key]: { files: [{ file, ranges: d.ranges }], ...d.face } }, bytes: { [file]: bytes } };
}

/** A font installed on this device, as Local Font Access lists it. */
export type LocalFontData = { family: string; fullName: string; postscriptName: string; style: string; blob: () => Promise<Blob> };
type LocalFontWindow = { queryLocalFonts?: () => Promise<LocalFontData[]> };

/** True where the browser can list installed fonts (it asks the person first). */
export const canListLocalFonts = () => typeof window !== "undefined" && typeof (window as unknown as LocalFontWindow).queryLocalFonts === "function";

/** Installed fonts grouped by family, or null when the person said no or the browser can't. */
export async function listLocalFonts(): Promise<Map<string, LocalFontData[]> | null> {
  try {
    const all = await (window as unknown as LocalFontWindow).queryLocalFonts!();
    const out = new Map<string, LocalFontData[]>();
    for (const f of all) out.set(f.family, [...(out.get(f.family) ?? []), f]);
    return new Map([...out].sort((a, b) => a[0].localeCompare(b[0])));
  } catch {
    return null;
  }
}

/** The four basic styles of an installed family, each read and checked like an uploaded file. */
export async function readLocalFamily(fonts: readonly LocalFontData[]): Promise<AddedFont | { error: UserFontError }> {
  const basic = fonts.filter((f) => /^(regular|normal|book|roman|bold|italic|oblique|bold italic|bold oblique)$/i.test(f.style.trim()));
  const read: AddedFont[] = [];
  let firstError: UserFontError = "not-a-font";
  for (const f of basic.length ? basic : fonts.slice(0, 1)) {
    const one = await readUserFont(new Uint8Array(await (await f.blob()).arrayBuffer()));
    if ("error" in one) firstError = one.error;
    else read.push(one);
  }
  if (!read.length) return { error: firstError };
  // The first file read of a style wins.
  return read.reduce((all, one) => ({ ...all, faces: { ...one.faces, ...all.faces }, bytes: { ...one.bytes, ...all.bytes } }));
}
