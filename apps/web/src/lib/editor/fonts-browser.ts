"use client";
/**
 * Loads the editor fonts in the page (FontFace, from our own origin) so added text is previewed
 * and measured with the very file the download embeds (AC-91). Each family loads on first use.
 */
import { cssFamily, FONT_BASE, faceOf, filesFor, styleKey, unicodeRange, type EditorFontManifest, type FaceEntry } from "./fonts";

let manifest: Promise<EditorFontManifest> | null = null;
export function loadFontManifest(): Promise<EditorFontManifest> {
  manifest ??= fetch(`${FONT_BASE}manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`fonts ${r.status}`);
    return r.json() as Promise<EditorFontManifest>;
  });
  manifest.catch(() => (manifest = null));
  return manifest;
}

/** Last manifest loaded (sync access for measuring once fonts are in). */
let known: EditorFontManifest | null = null;
export const knownManifest = () => known;

const registered = new Map<string, Promise<void>>();

/** Registers and loads the files of a face that `text` needs. Resolves with its metrics. */
export async function ensureFace(id: string, bold: boolean, italic: boolean, text = "A"): Promise<FaceEntry> {
  const m = await loadFontManifest();
  known = m;
  const face = faceOf(m, id, bold, italic);
  if (!face) throw new Error(`No font ${id}`);
  const key = styleKey(bold, italic);
  const [weight, style] = key.split("-");
  await Promise.all(
    filesFor(face, text).map((file) => {
      let p = registered.get(file);
      if (!p) {
        const entry = face.files.find((f) => f.file === file)!;
        const ff = new FontFace(cssFamily(m.faces[id] ? id : "arimo"), `url(${FONT_BASE}${encodeURIComponent(file)})`, { weight, style, unicodeRange: unicodeRange(entry.ranges) });
        document.fonts.add(ff);
        p = ff.load().then(() => undefined);
        p.catch(() => registered.delete(file));
        registered.set(file, p);
      }
      return p;
    }),
  );
  return face;
}

/** CSS font shorthand for a face. */
export function cssFont(id: string, size: number, bold = false, italic = false): string {
  return `${italic ? "italic " : ""}${bold ? 700 : 400} ${size}px "${cssFamily(id)}", Arial, sans-serif`;
}

let ctx: CanvasRenderingContext2D | null = null;
/** A measure function (points) for a loaded face. */
export function measurer(id: string, size: number, bold = false, italic = false): (s: string) => number {
  ctx ??= document.createElement("canvas").getContext("2d");
  const font = cssFont(id, size, bold, italic);
  return (s: string) => {
    if (!ctx) return s.length * size * 0.5;
    ctx.font = font;
    return ctx.measureText(s).width;
  };
}
