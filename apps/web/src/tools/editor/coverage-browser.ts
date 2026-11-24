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
import { loadFontManifest } from "@/lib/editor/fonts-browser";
import type { EditorObject, TextObj } from "@/lib/editor/model";
import { needsShaping, SHAPING_MANIFEST, type ShapingManifest } from "@/lib/editor/shaping";

let ready: Promise<{ m: EditorFontManifest; fallback: FontFileEntry[] }> | null = null;
let known: { m: EditorFontManifest; fallback: FontFileEntry[] } | null = null;

export function loadCoverage() {
  ready ??= Promise.all([
    loadFontManifest(),
    fetch("/fonts/noto/manifest.json")
      .then((r) => (r.ok ? (r.json() as Promise<{ fonts: FontFileEntry[] }>) : { fonts: [] }))
      .then((j) => j.fonts),
  ]).then(([m, fallback]) => (known = { m, fallback }));
  ready.catch(() => (ready = null));
  return ready;
}

let shapingReady: Promise<FontFileEntry[]> | null = null;
let shaping: FontFileEntry[] | null = null;
function loadShapingCoverage() {
  shapingReady ??= fetch(SHAPING_MANIFEST)
    .then((r) => (r.ok ? (r.json() as Promise<ShapingManifest>) : { fonts: [] }))
    .then((j) => (shaping = j.fonts.map((f) => ({ file: f.url, ranges: f.ranges }))));
  shapingReady.catch(() => (shapingReady = null));
  return shapingReady;
}

/** Characters of a text object that won't print, or [] while the lists load. */
export function missingIn(o: Pick<TextObj, "text" | "font" | "bold" | "italic">): string[] {
  if (!known) return [];
  const face = faceOf(known.m, o.font, o.bold, o.italic);
  // Lines with complex scripts print through the shaping engine, with the face and the script fonts.
  const shaped = o.text.split("\n").filter(needsShaping);
  if (!shaped.length) return missingChars(o.text, face?.files ?? [], known.fallback);
  if (!shaping) return [];
  const plain = o.text.split("\n").filter((l) => !needsShaping(l)).join("\n");
  const out = missingChars(plain, face?.files ?? [], known.fallback);
  for (const c of missingChars(shaped.join("\n"), face?.files ?? [], shaping)) if (!out.includes(c)) out.push(c);
  return out;
}

/** Loads what missingIn needs (the shaping list only for text that needs shaping). */
function loadFor(withShaping: boolean) {
  return Promise.all([loadCoverage(), withShaping ? loadShapingCoverage() : null]);
}

/** Every character of the added text in `objects` that won't print. */
export async function missingInObjects(objects: readonly EditorObject[]): Promise<string[]> {
  if (!objects.some((o) => o.kind === "text")) return [];
  await Promise.all(objects.map((o) => (o.kind === "text" ? loadFor(needsShaping(o.text)).catch(() => null) : null)));
  const all = new Set<string>();
  for (const o of objects) if (o.kind === "text") missingIn(o).forEach((c) => all.add(c));
  return [...all];
}

export function useMissing(o: TextObj): string[] {
  const [, setLoaded] = useState(0);
  const wantShaping = needsShaping(o.text);
  useEffect(() => {
    if (!known || (wantShaping && !shaping)) void loadFor(wantShaping).then(() => setLoaded((n) => n + 1), () => undefined);
  }, [wantShaping]);
  return missingIn(o);
}
