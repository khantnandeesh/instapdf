/** Merge options (spec F3 §3f): types, defaults and the stored form. Pure, unit tested. */
import type { ImageLayout } from "./images";

export type BookmarkMode = "keep" | "remove" | "perFile" | "perFileNested";
export type TocMode = "none" | "names" | "titles";
export type FormMode = "rename" | "merge" | "flatten" | "remove";

export type MergeOptions = {
  toc: TocMode;
  cover: boolean;
  bookmarks: BookmarkMode;
  footer: boolean;
  sameWidth: boolean;
  doubleSided: boolean;
  forms: FormMode;
  /** Image to PDF (spec F12 §3): how each image sits on its page. Absent: Merge's fixed A4 layout. Not stored. */
  imageLayout?: ImageLayout;
};

export const MERGE_OPTIONS_KEY = "berrypdf:merge-options";

export const defaultMergeOptions: MergeOptions = {
  toc: "none",
  cover: false,
  bookmarks: "keep",
  footer: false,
  sameWidth: false,
  doubleSided: false,
  forms: "rename",
};

/** Organize's fixed options (spec F4/F5 §3e): bookmarks follow edits, nothing added, fields merged with renamed duplicates. */
export const ORGANIZE_OPTIONS: MergeOptions = { ...defaultMergeOptions, bookmarks: "keep", forms: "rename" };

/** Alternate & mix's fixed options (spec §3g): no bookmarks (they would be out of order), fields as in Organize. */
export const ALTERNATE_OPTIONS: MergeOptions = { ...defaultMergeOptions, bookmarks: "remove", forms: "rename" };

const allowed: { [K in keyof Omit<MergeOptions, "imageLayout">]: readonly MergeOptions[K][] } = {
  toc: ["none", "names", "titles"],
  cover: [true, false],
  bookmarks: ["keep", "remove", "perFile", "perFileNested"],
  footer: [true, false],
  sameWidth: [true, false],
  doubleSided: [true, false],
  forms: ["rename", "merge", "flatten", "remove"],
};

/** Reads stored options; anything missing or invalid falls back to its default. */
export function parseMergeOptions(raw: string | null | undefined): MergeOptions {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
  } catch {}
  const out = { ...defaultMergeOptions };
  for (const key of Object.keys(allowed) as (keyof typeof allowed)[]) {
    const v = stored[key];
    if ((allowed[key] as readonly unknown[]).includes(v)) (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

/** How many options differ from the defaults (the "2 changed" chip). */
export function changedCount(o: MergeOptions): number {
  return (Object.keys(defaultMergeOptions) as (keyof MergeOptions)[]).filter((k) => o[k] !== defaultMergeOptions[k]).length;
}
