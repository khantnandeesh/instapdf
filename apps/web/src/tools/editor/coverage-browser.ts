"use client";
/**
 * Which characters of added text won't print (lib/editor/coverage), in the page: the editor
 * font manifest plus the Noto fallback list, each fetched once from our own origin.
 */
import { useEffect, useState } from "react";
import { missingChars } from "@/lib/editor/coverage";
import { faceOf, type EditorFontManifest, type FontFileEntry } from "@/lib/editor/fonts";
import { knownManifest, loadFontManifest } from "@/lib/editor/fonts-browser";
import type { EditorObject, TextObj } from "@/lib/editor/model";
import { changedTexts, drawnWithoutSlice, missingInForm, type SliceCmaps } from "@/lib/forms/coverage";
import type { FormState } from "@/lib/forms/types";

let ready: Promise<{ m: EditorFontManifest; fallback: FontFileEntry[] }> | null = null;
let known: { m: EditorFontManifest; fallback: FontFileEntry[] } | null = null;

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
  ready ??= Promise.all([
    loadFontManifest(),
    fetch("/fonts/noto/manifest.json")
      .then((r) => (r.ok ? (r.json() as Promise<{ fonts: FontFileEntry[] }>) : { fonts: [] }))
      .then((j) => j.fonts),
  ]).then(([m, fallback]) => (known = { m, fallback }));
  ready.catch(() => (ready = null));
  return ready;
}

/** Characters of a text object that won't print, or [] while the lists load. */
export function missingIn(o: Pick<TextObj, "text" | "font" | "bold" | "italic">): string[] {
  if (!known) return [];
  const face = faceOf(knownManifest() ?? known.m, o.font, o.bold, o.italic);
  return missingChars(o.text, face?.files ?? [], known.fallback);
}

/** Every character of the added text in `objects` that won't print. */
export async function missingInObjects(objects: readonly EditorObject[]): Promise<string[]> {
  if (!objects.some((o) => o.kind === "text")) return [];
  await loadCoverage().catch(() => null);
  const all = new Set<string>();
  for (const o of objects) if (o.kind === "text") missingIn(o).forEach((c) => all.add(c));
  return [...all];
}

/** Every character of changed form values that won't print (AC-232). */
export async function missingInFormValues(state: FormState | undefined, original: FormState | null | undefined): Promise<string[]> {
  const texts = changedTexts(state, original);
  if (!texts.length) return [];
  const [ranges] = await Promise.all([
    once("/fonts/forms/noto-sans-forms.json", (j) => (j as { ranges: [number, number][] }).ranges, formsCache).catch(() => [] as [number, number][]),
    loadCoverage().catch(() => null),
  ]);
  if (!known) return [];
  // The slices' real character lists are only needed for text Helvetica and the forms font can't draw.
  const cmaps = texts.every((t) => drawnWithoutSlice(t, ranges)) ? {} : await once("/fonts/noto/cmap.json", (j) => j as SliceCmaps, cmapCache).catch(() => ({}));
  return missingInForm(state, original, ranges, known.fallback, cmaps);
}

export function useMissing(o: TextObj): string[] {
  const [, setLoaded] = useState(!!known);
  useEffect(() => {
    if (!known) void loadCoverage().then(() => setLoaded(true), () => undefined);
  }, []);
  return missingIn(o);
}
