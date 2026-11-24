/**
 * Characters of form values that won't print (AC-232, AC-75: never silently). Pure, unit tested.
 * A field has one font: the forms font (Noto Sans with the slices below merged, see
 * scripts/forms-font/merge.py) when it covers the text, else the one Noto slice that covers the
 * most of it. This mirrors the writer's choice (lib/forms/write.ts `Fonts.pick`).
 */
import { missingChars } from "@/lib/editor/coverage";
import type { FontFileEntry } from "@/lib/editor/fonts";
import type { FormField, FormState } from "./types";

/** The Noto slices merged into the forms font. */
export const FORMS_FONT_SLICES = ["latin", "latin-ext", "greek", "greek-ext", "cyrillic", "cyrillic-ext", "vietnamese"].map((s) => `noto-sans-${s}-400-normal.woff`);

const textOf = (f: FormField) => [...(Array.isArray(f.value) ? f.value : [f.value]), ...(f.kind === "dropdown" || f.kind === "list" ? f.options : [])].join(" ");

/** Unique characters of changed or new fields' text that the field's font can't draw. */
export function missingInForm(state: FormState | undefined, original: FormState | null | undefined, fallback: readonly FontFileEntry[]): string[] {
  if (!state || state === original) return [];
  const before = new Map((original?.fields ?? []).map((f) => [f.id, f]));
  const formsFont = fallback.filter((f) => FORMS_FONT_SLICES.includes(f.file));
  const out = new Set<string>();
  for (const f of state.fields) {
    if (f.kind !== "text" && f.kind !== "dropdown" && f.kind !== "list") continue;
    const o = before.get(f.id);
    if (o && JSON.stringify([o.value, o.options]) === JSON.stringify([f.value, f.options])) continue;
    const text = textOf(f);
    let best = missingChars(text, formsFont, []);
    if (best.length) {
      for (const slice of fallback) {
        const m = missingChars(text, [slice], []);
        if (m.length < best.length) best = m;
      }
    }
    best.forEach((c) => out.add(c));
  }
  return [...out];
}
