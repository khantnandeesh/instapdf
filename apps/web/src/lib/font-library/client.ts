/**
 * The font library as the browser reads it (F24): everything comes from our own address,
 * /fonts/lib/ (the in-app copy, or the fonts bucket passed through by next.config.ts). Only
 * manifest.json is fetched by a fixed name; it names the content-addressed files. Nothing here
 * runs until the font menu opens or a match is asked for. Works in the page and in workers.
 */
import type { FaceEntry } from "../editor/fonts";

export const LIB_BASE = "/fonts/lib/";

export type LibraryManifest = { families: string; faces: string; features: string; counts: { families: number; faces: number; files: number } };

/** One family of the list (scripts/font-library/lib.mjs familyRow). */
export type FamilyRow = {
  /** Id, e.g. "open-sans". */
  i: string;
  /** Name, e.g. "Open Sans". */
  n: string;
  /** "sans-serif" | "serif" | "monospace" | "display" | "handwriting"… */
  c: string;
  /** Licence, e.g. "OFL-1.1". */
  l: string;
  /** Character sets ("latin", "cyrillic"…). */
  s: string[];
  /** Weights. */
  w: number[];
  /** 1 when the family has italics. */
  t: 0 | 1;
  /** Hash in the name of the family's manifest. */
  m: string;
};

export type FamilyManifest = { id: string; family: string; licence: string; faces: Record<string, FaceEntry> };

export type Library = { manifest: LibraryManifest; families: FamilyRow[]; byId: Map<string, FamilyRow> };

async function get(path: string): Promise<Response> {
  const res = await fetch(LIB_BASE + path);
  if (!res.ok) throw new Error(`font library ${res.status}`);
  return res;
}

/** A promise kept until it fails, so a failed fetch is tried again on the next call. */
function once<T>(make: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => {
    p ??= make();
    p.catch(() => (p = null));
    return p;
  };
}

/** The family list (one small file for the whole library). */
export const loadLibrary = once<Library>(async () => {
  const manifest = (await (await get("manifest.json")).json()) as LibraryManifest;
  const families = (await (await get(manifest.families)).json()) as FamilyRow[];
  return { manifest, families, byId: new Map(families.map((f) => [f.i, f])) };
});

const familyCache = new Map<string, Promise<FamilyManifest | null>>();
/** A family's faces and files, or null when the library has no such family. */
export function loadFamily(id: string): Promise<FamilyManifest | null> {
  let p = familyCache.get(id);
  if (!p) {
    p = loadLibrary().then(async (lib) => {
      const row = lib.byId.get(id);
      return row ? ((await (await get(`families/${id}.${row.m}.json`)).json()) as FamilyManifest) : null;
    });
    p.catch(() => familyCache.delete(id));
    familyCache.set(id, p);
  }
  return p;
}

/** The matching index: 64 bytes a face, in the order of `faces` ([face id, signature hash]). */
export const loadIndex = once(async () => {
  const { manifest } = await loadLibrary();
  const [faces, features] = await Promise.all([
    get(manifest.faces).then((r) => r.json() as Promise<[string, string][]>),
    get(manifest.features).then(async (r) => new Uint8Array(await r.arrayBuffer())),
  ]);
  return { faces, features };
});

/** The glyph signatures of one indexed face. */
export async function loadSignature(face: string, sig: string): Promise<Uint8Array> {
  return new Uint8Array(await (await get(`index/sig/${face}.${sig}.bin`)).arrayBuffer());
}

/** "<family>_<weight>_<style>" → its parts. Family ids never contain "_". */
export function parseFaceId(face: string): { family: string; weight: number; italic: boolean } {
  const [family, weight, style] = face.split("_");
  return { family, weight: Number(weight), italic: style === "italic" };
}

/** Folds a name for comparing: "TimesNewRomanPS-BoldMT" and "times new roman" share a start. */
export const foldName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Families whose name contains every word typed, names that start with the query first. */
export function searchFamilies(families: readonly FamilyRow[], query: string): FamilyRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...families];
  const q = foldName(query);
  return families
    .filter((f) => {
      const n = f.n.toLowerCase();
      return words.every((w) => n.includes(w)) || foldName(f.n).includes(q);
    })
    .sort((a, b) => Number(foldName(b.n).startsWith(q)) - Number(foldName(a.n).startsWith(q)) || a.n.localeCompare(b.n));
}

/** The library family with this name ("Open Sans", "OpenSans", "open-sans"), if any. */
export function familyByName(lib: Library, name: string): FamilyRow | undefined {
  const q = foldName(name);
  return q ? lib.families.find((f) => foldName(f.n) === q || foldName(f.i) === q) : undefined;
}
