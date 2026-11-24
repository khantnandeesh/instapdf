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
import { missingInForm } from "@/lib/forms/coverage";
import type { FormState } from "@/lib/forms/types";

let ready: Promise<{ m: EditorFontManifest; fallback: FontFileEntry[] }> | null = null;
let known: { m: EditorFontManifest; fallback: FontFileEntry[] } | null = null;
let formsRanges: Promise<[number, number][]> | null = null;

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
  if (!state || state === original) return [];
  formsRanges ??= fetch("/fonts/forms/noto-sans-forms.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ ranges: [number, number][] }>) : { ranges: [] }))
    .then((j) => j.ranges);
  formsRanges.catch(() => (formsRanges = null));
  const [ranges] = await Promise.all([formsRanges.catch(() => [] as [number, number][]), loadCoverage().catch(() => null)]);
  return known ? missingInForm(state, original, ranges, known.fallback) : [];
}

export function useMissing(o: TextObj): string[] {
  const [, setLoaded] = useState(!!known);
  useEffect(() => {
    if (!known) void loadCoverage().then(() => setLoaded(true), () => undefined);
  }, []);
  return missingIn(o);
}
