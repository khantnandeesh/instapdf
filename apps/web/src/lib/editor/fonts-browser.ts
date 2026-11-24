"use client";
/**
 * Loads the editor fonts in the page (FontFace) so added text is previewed and measured with the
 * very file the download embeds (AC-91). Each family loads on first use. Three sources, all on
 * this device or our own address: the built-in faces (/fonts/editor/), the font library
 * (/fonts/lib/, F24) and the user's own fonts (bytes that never leave the page).
 */
import { loadFamily } from "../font-library/client";
import { cssFamily, FONT_BASE, LIB_FILE, USER_FILE, USER_FONT, faceOf, filesFor, fontUrl, styleKey, unicodeRange, type EditorFontManifest, type FaceEntry } from "./fonts";

let manifest: Promise<EditorFontManifest> | null = null;
/** The built-in faces. */
export function loadFontManifest(): Promise<EditorFontManifest> {
  manifest ??= fetch(`${FONT_BASE}manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`fonts ${r.status}`);
    return r.json() as Promise<EditorFontManifest>;
  });
  manifest.catch(() => (manifest = null));
  return manifest;
}

type Faces = EditorFontManifest["faces"];
let base: Faces | null = null;
/** Library families and the user's fonts registered so far. */
const extra: Faces = {};
/** Bytes of the user's fonts, by file name (`user:…`). */
const userBytes = new Map<string, Uint8Array>();
/** Every face known so far (sync access for measuring once fonts are in). The built-in ones win. */
let known: EditorFontManifest | null = null;
export const knownManifest = () => known;
const listeners = new Set<() => void>();
/** Called when a family is added to the known faces. */
export function subscribeFonts(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
function publish() {
  known = { faces: { ...extra, ...(base ?? {}) } };
  listeners.forEach((l) => l());
}

/** Adds one of the user's own fonts: `faces` name files that are keys of `bytes`. */
export function registerUserFont(id: string, faces: Record<string, FaceEntry>, bytes: Record<string, Uint8Array>): void {
  if (!id.startsWith(USER_FONT)) throw new Error("Not a user font id");
  for (const [file, b] of Object.entries(bytes)) userBytes.set(file, b);
  extra[id] = { ...(extra[id] ?? {}), ...faces };
  publish();
}

/** The bytes of one of the user's font files, or undefined. */
export const userFontBytes = (file: string) => userBytes.get(file);

const families = new Map<string, Promise<void>>();
/** Makes a font id's faces known: built-in, registered, or fetched from the library. */
async function resolveFamily(id: string): Promise<void> {
  base ??= (await loadFontManifest()).faces;
  if (!known) publish();
  if (base[id] || extra[id] || id.startsWith(USER_FONT)) return;
  let p = families.get(id);
  if (!p) {
    p = loadFamily(id).then((fam) => {
      if (!fam) return;
      extra[id] = Object.fromEntries(
        Object.entries(fam.faces).map(([key, face]) => [key, { ...face, files: face.files.map((f) => ({ ...f, file: LIB_FILE + f.file })) }]),
      );
      publish();
    });
    p.catch(() => families.delete(id));
    families.set(id, p);
  }
  await p;
}

/** The weight and style a face entry really is (bold of a one-weight family is that weight). */
function keyOf(fam: Record<string, FaceEntry>, face: FaceEntry, fallback: string): string {
  return Object.keys(fam).find((k) => fam[k] === face) ?? fallback;
}

const registered = new Map<string, Promise<void>>();

/** Registers and loads the files of a face that `text` needs. Resolves with its metrics. */
export async function ensureFace(id: string, bold: boolean, italic: boolean, text = "A"): Promise<FaceEntry> {
  await resolveFamily(id);
  const m = known!;
  const face = faceOf(m, id, bold, italic);
  if (!face) throw new Error(`No font ${id}`);
  const famId = m.faces[id] ? id : "arimo";
  // Registered under the style asked for, so the browser never fakes a bold over a real one.
  const [weight, style] = (m.faces[id] ? styleKey(bold, italic) : keyOf(m.faces[famId], face, "400-normal")).split("-");
  await Promise.all(
    filesFor(face, text).map((file) => {
      const key = `${famId}|${weight}|${style}|${file}`;
      let p = registered.get(key);
      if (!p) {
        const entry = face.files.find((f) => f.file === file)!;
        const local = file.startsWith(USER_FILE) ? userBytes.get(file) : undefined;
        if (file.startsWith(USER_FILE) && !local) return Promise.reject(new Error(`No font ${id}`));
        // The user's own bytes are handed over directly: nothing is fetched for them.
        const source = local ? (local.buffer.slice(local.byteOffset, local.byteOffset + local.byteLength) as ArrayBuffer) : `url(${fontUrl(file)})`;
        const ff = new FontFace(cssFamily(famId), source, { weight, style, unicodeRange: unicodeRange(entry.ranges) });
        document.fonts.add(ff);
        p = ff.load().then(() => undefined);
        p.catch(() => {
          registered.delete(key);
          document.fonts.delete(ff);
        });
        registered.set(key, p);
      }
      return p;
    }),
  );
  return face;
}

/**
 * What the download worker needs besides the built-in faces: the library and user faces these
 * font ids use, and the user's own font bytes (the worker cannot see this page's memory).
 */
export function fontsForBuild(ids: Iterable<string>): { faces: Faces; bytes: Record<string, Uint8Array> } {
  const faces: Faces = {};
  const bytes: Record<string, Uint8Array> = {};
  for (const id of new Set(ids)) {
    const fam = extra[id];
    if (!fam || base?.[id]) continue;
    faces[id] = fam;
    for (const face of Object.values(fam)) for (const f of face.files) if (userBytes.has(f.file)) bytes[f.file] = userBytes.get(f.file)!;
  }
  return { faces, bytes };
}

/** Resolves once every font id is known (a file reopened with library fonts in it). */
export async function resolveFonts(ids: Iterable<string>): Promise<void> {
  await Promise.all([...new Set(ids)].map((id) => resolveFamily(id).catch(() => undefined)));
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
