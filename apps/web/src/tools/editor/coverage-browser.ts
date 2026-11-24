"use client";
/**
 * Which characters of added text won't print (lib/editor/coverage), in the page: the editor
 * font manifest plus the Noto fallback list, each fetched once from our own origin. Text that needs
 * shaping (Hindi, Arabic and similar) prints with the shaping fonts instead (AC-224); their list
 * is fetched only once such text is typed.
 */
import { useEffect, useState } from "react";
import { missingChars } from "@/lib/editor/coverage";
import { faceOf, type EditorFontManifest, type FontFileEntry } from "@/lib/editor/fonts";
import { knownManifest, loadFontManifest } from "@/lib/editor/fonts-browser";
import type { EditorObject, TextObj } from "@/lib/editor/model";
import { changedTexts, drawnWithoutSlice, missingInForm, type SliceCmaps } from "@/lib/forms/coverage";
import type { FormState } from "@/lib/forms/types";
import { needsShaping, SHAPING_MANIFEST, type ShapingManifest } from "@/lib/editor/shaping";

let ready: Promise<{ m: EditorFontManifest; fallback: FontFileEntry[] }> | null = null;
let known: { m: EditorFontManifest; fallback: FontFileEntry[] } | null = null;

async function fontList<T>(url: string): Promise<T> {
  const r = await fetch(url);
  // A missing list would read as "no font prints this": a failed load, not an answer.
  if (!r.ok) throw new Error(`font list ${r.status}`);
  return (await r.json()) as T;
}

/** A JSON file of our own, fetched once; a failed or refused fetch is tried again next time. */
function once<T>(url: string, pick: (j: unknown) => T, cache: { p: Promise<T> | null }): Promise<T> {
  cache.p ??= fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return pick(await r.json());
  });
  cache.p.catch(() => (cache.p = null));
  return cache.p;
}
const formsCache: { p: Promise<[number, number][]> | null } = { p: null };
const cmapCache: { p: Promise<SliceCmaps> | null } = { p: null };

export function loadCoverage() {
  ready ??= Promise.all([loadFontManifest(), fontList<{ fonts: FontFileEntry[] }>("/fonts/noto/manifest.json").then((j) => j.fonts)]).then(
    ([m, fallback]) => (known = { m, fallback }),
  );
  ready.catch(() => (ready = null));
  return ready;
}

let shapingReady: Promise<FontFileEntry[]> | null = null;
let shaping: FontFileEntry[] | null = null;
function loadShapingCoverage() {
  shapingReady ??= fontList<ShapingManifest>(SHAPING_MANIFEST).then((j) => (shaping = j.fonts.map((f) => ({ file: f.url, ranges: f.ranges }))));
  shapingReady.catch(() => (shapingReady = null));
  return shapingReady;
}

type Coverable = Pick<TextObj, "text" | "lines" | "font" | "bold" | "italic">;

/** The lines as the build draws them: wrapped (`lines`), each shaped or not on its own (build.ts). */
function linesOf(o: Coverable): string[] {
  return o.lines?.length ? o.lines : o.text.split("\n");
}

/** Characters of a text object that won't print, or null while (or if) the font lists aren't loaded. */
export function missingIn(o: Coverable): string[] | null {
  if (!known) return null;
  const face = faceOf(knownManifest() ?? known.m, o.font, o.bold, o.italic)?.files ?? [];
  // Lines with complex scripts print through the shaping engine, with the face and the script fonts.
  const lines = linesOf(o);
  const shaped = lines.filter(needsShaping);
  const out = missingChars(lines.filter((l) => !needsShaping(l)).join("\n"), face, known.fallback);
  if (!shaped.length) return out;
  if (!shaping) return null;
  for (const c of missingChars(shaped.join("\n"), face, shaping)) if (!out.includes(c)) out.push(c);
  return out;
}

/** Loads what missingIn needs (the shaping list only for text that needs shaping). */
function loadFor(withShaping: boolean) {
  return Promise.all([loadCoverage(), withShaping ? loadShapingCoverage() : null]);
}

/**
 * Every character of the added text in `objects` that won't print. `unchecked` is true when a
 * font list couldn't be fetched, so the caller warns that printing wasn't checked rather than
 * saying nothing.
 */
export async function missingInObjects(objects: readonly EditorObject[]): Promise<{ chars: string[]; unchecked: boolean }> {
  const texts = objects.filter((o): o is TextObj => o.kind === "text");
  if (!texts.length) return { chars: [], unchecked: false };
  await Promise.all(texts.map((o) => loadFor(linesOf(o).some(needsShaping)).catch(() => null)));
  const all = new Set<string>();
  let unchecked = false;
  for (const o of texts) {
    const m = missingIn(o);
    if (m) m.forEach((c) => all.add(c));
    else unchecked = true;
  }
  return { chars: [...all], unchecked };
}

/** Every character of changed form values that won't print (AC-232); `unchecked` as for missingInObjects. */
export async function missingInFormValues(state: FormState | undefined, original: FormState | null | undefined): Promise<{ chars: string[]; unchecked: boolean }> {
  const texts = changedTexts(state, original);
  if (!texts.length) return { chars: [], unchecked: false };
  const [ranges] = await Promise.all([
    once("/fonts/forms/noto-sans-forms.json", (j) => (j as { ranges: [number, number][] }).ranges, formsCache).catch(() => null),
    loadCoverage().catch(() => null),
  ]);
  if (!known || !ranges) return { chars: [], unchecked: true };
  // The slices' real character lists are only needed for text Helvetica and the forms font can't draw.
  const cmaps = texts.every((t) => drawnWithoutSlice(t, ranges)) ? {} : await once("/fonts/noto/cmap.json", (j) => j as SliceCmaps, cmapCache).catch(() => null);
  if (!cmaps) return { chars: [], unchecked: true };
  return { chars: missingInForm(state, original, ranges, known.fallback, cmaps), unchecked: false };
}

export function useMissing(o: TextObj): string[] {
  const [, setLoaded] = useState(0);
  const wantShaping = linesOf(o).some(needsShaping);
  useEffect(() => {
    if (!known || (wantShaping && !shaping)) void loadFor(wantShaping).then(() => setLoaded((n) => n + 1), () => undefined);
  }, [wantShaping]);
  return missingIn(o) ?? [];
}
