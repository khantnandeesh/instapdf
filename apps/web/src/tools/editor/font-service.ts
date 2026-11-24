"use client";
/**
 * Fonts of the open document and the user's own fonts, for the font menu and for standing in
 * when a document font lacks a character (F24). The document's fonts are read by the engine
 * worker, matched against the library by the matching worker, and nothing leaves this device.
 */
import type { FontInfo, FontRequest } from "@/lib/editor/berry-engine";
import { callEngine } from "@/lib/editor/engine-client";
import { TEXT_FONTS, USER_FILE, USER_FONT, faceOf, filesFor, fontUrl } from "@/lib/editor/fonts";
import { ensureFace, knownManifest, registerUserFont, resolveFonts, userFontBytes } from "@/lib/editor/fonts-browser";
import { familyByName, foldName, loadLibrary, type Library } from "@/lib/font-library/client";
import { MATCH_CHARS, isClose, type FontMatch } from "@/lib/font-library/match";
import { matchFont } from "@/lib/font-library/match-client";
import { USER_FONT_ERROR, readLocalFamily, readUserFont, type AddedFont, type LocalFontData, type UserFontError } from "@/lib/font-library/user-fonts";

/** `matches` null: still being worked out. */
export type DocFont = { key: string; info: FontInfo; matches: FontMatch[] | null };
export type FontState = {
  /** "off": the engine can't open this file (password-protected), so its fonts aren't listed. */
  docStatus: "idle" | "loading" | "ready" | "off";
  doc: DocFont[];
  user: { id: string; label: string }[];
  library: Library | null;
};

let state: FontState = { docStatus: "idle", doc: [], user: [], library: null };
const listeners = new Set<() => void>();
function set(next: Partial<FontState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
export const getFontState = () => state;
export function subscribeFontState(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The person's choice of stand-in per document font family (folded name → font id). */
const choices = new Map<string, string>();
let generation = 0;

/** A new document: its fonts and the choices made for the last one are forgotten. */
export function resetDocFonts(): void {
  generation++;
  choices.clear();
  set({ docStatus: "idle", doc: [] });
}

/** Loads the family list (the font menu opened). */
export function loadFontList(): void {
  if (state.library) return;
  void loadLibrary().then(
    (library) => set({ library }),
    () => undefined,
  );
}

/** How many of a document's fonts are matched, in the order the file lists them (a file with more is rare; the rest are listed without a match). */
const MATCH_LIMIT = 100;

async function matchOf(info: FontInfo): Promise<FontMatch[]> {
  if (info.object == null) return [];
  const { program } = await callEngine({ op: "program", font: info.object, chars: MATCH_CHARS });
  return matchFont(program, 5);
}

/**
 * Lists the document's fonts, then finds the closest library fonts for each. `opened` resolves
 * once the engine has the document; `allowed` is false for files the engine never opens.
 */
export function loadDocFonts(opened: Promise<void>, allowed: boolean): void {
  if (state.docStatus !== "idle") return;
  if (!allowed) return set({ docStatus: "off" });
  set({ docStatus: "loading" });
  const gen = generation;
  void (async () => {
    try {
      await opened;
      const { fonts } = await callEngine({ op: "fonts" });
      if (gen !== generation) return;
      // One row a face name; fonts drawn as pictures (Type 3) have no outlines to match.
      const seen = new Set<string>();
      const doc: DocFont[] = [];
      for (const info of fonts) {
        if (info.kind === "type3" || !info.name || seen.has(info.name)) continue;
        seen.add(info.name);
        doc.push({ key: info.name, info, matches: null });
      }
      set({ doc, docStatus: "ready" });
      for (const [i, f] of doc.entries()) {
        const matches = i < MATCH_LIMIT ? await matchOf(f.info).catch(() => []) : [];
        if (gen !== generation) return;
        set({ doc: state.doc.map((d) => (d.key === f.key ? { ...d, matches } : d)) });
      }
    } catch {
      if (gen === generation) set({ docStatus: "idle", doc: [] });
    }
  })();
}

function keep(font: AddedFont): { id: string; label: string } {
  registerUserFont(font.id, font.faces, font.bytes);
  const entry = { id: font.id, label: font.label };
  set({ user: [...state.user.filter((u) => u.id !== font.id), entry].sort((a, b) => a.label.localeCompare(b.label)) });
  return entry;
}

/** Adds a font file the person picked. The message is ready to show. */
export async function addUserFontFile(file: Blob): Promise<{ id: string; label: string } | { error: string }> {
  const read = await readUserFont(new Uint8Array(await file.arrayBuffer()));
  return "error" in read ? { error: USER_FONT_ERROR[read.error as UserFontError] } : keep(read);
}

/** Adds a font installed on this device. */
export async function addLocalFamily(fonts: readonly LocalFontData[]): Promise<{ id: string; label: string } | { error: string }> {
  const read = await readLocalFamily(fonts);
  return "error" in read ? { error: USER_FONT_ERROR[read.error as UserFontError] } : keep(read);
}

/** The name shown for a font id. */
export function fontLabel(id: string): string {
  const builtin = TEXT_FONTS.find((f) => f.id === id);
  if (builtin) return builtin.label;
  if (id.startsWith(USER_FONT)) return state.user.find((u) => u.id === id)?.label ?? "Your font";
  return state.library?.byId.get(id)?.n ?? id.replace(/(^|-)([a-z])/g, (_, dash: string, c: string) => (dash ? " " : "") + c.toUpperCase());
}

/** Remembers (or with `id` undefined, forgets) the person's stand-in for a document family (folded name). */
export function chooseStandIn(key: string, id: string | undefined): void {
  if (id) choices.set(key, id);
  else choices.delete(key);
}
export const chosenStandIn = (key: string) => choices.get(key);

/** The library's name for the character set a character belongs to, where a font must have that set to draw it. */
function setOf(cp: number): string | null {
  if (cp >= 0x370 && cp <= 0x3ff) return "greek";
  if (cp >= 0x400 && cp <= 0x4ff) return "cyrillic";
  if (cp >= 0x590 && cp <= 0x5ff) return "hebrew";
  if (cp >= 0x600 && cp <= 0x6ff) return "arabic";
  if (cp >= 0x900 && cp <= 0x97f) return "devanagari";
  if (cp >= 0xe00 && cp <= 0xe7f) return "thai";
  return null;
}
/** How many library families are added for a character set the closer fonts may not have. */
const SET_FONTS = 4;

/**
 * Font ids to try for the characters a document font lacks, best first: the person's choice,
 * the closest library font by shape, the families the engine names, our default, then (for
 * `chars` of another alphabet) library families of the same kind that have that alphabet.
 */
export async function standInCandidates(info: FontInfo | undefined, request: FontRequest, chars = ""): Promise<string[]> {
  const out: string[] = [];
  const add = (id?: string) => id && !out.includes(id) && out.push(id);
  add(choices.get(foldName(request.families[0] ?? "")));
  const known = info && state.doc.find((d) => d.key === info.name)?.matches;
  const matches = known ?? (info ? await matchOf(info).catch(() => []) : []);
  if (isClose(matches[0])) add(matches[0].family);
  const lib = state.library ?? (await loadLibrary().catch(() => null));
  if (lib && !state.library) set({ library: lib });
  for (const name of request.families) add(lib ? familyByName(lib, name)?.i : TEXT_FONTS.find((f) => foldName(f.label) === foldName(name))?.id);
  add(TEXT_FONTS.find((f) => f.class === (info?.monospace ? "mono" : info?.serif ? "serif" : "sans"))?.id);
  add("arimo");
  const sets = [...new Set([...chars].map((c) => setOf(c.codePointAt(0)!)).filter((x): x is string => !!x))];
  if (lib && sets.length) {
    const kind = info?.monospace ? "monospace" : info?.serif ? "serif" : "sans-serif";
    const having = lib.families.filter((f) => sets.every((x) => f.s.includes(x)));
    for (const f of [...having.filter((f) => f.c === kind), ...having.filter((f) => f.c !== kind && f.c !== "display" && f.c !== "handwriting")].slice(0, SET_FONTS)) add(f.i);
  }
  return out;
}

/**
 * Registers a font with the engine for `chars`. False when the engine can't use it (it takes
 * TrueType outlines today) or a file didn't arrive.
 */
export async function registerWithEngine(id: string, bold: boolean, italic: boolean, chars: string): Promise<boolean> {
  try {
    await resolveFonts([id]);
    const m = knownManifest();
    if (!m?.faces[id]) return false;
    const face = faceOf(m, id, bold, italic);
    if (!face) return false;
    let any = false;
    for (const file of filesFor(face, chars)) {
      const bytes = file.startsWith(USER_FILE) ? userFontBytes(file)?.slice() : new Uint8Array(await (await fetch(fontUrl(file))).arrayBuffer());
      if (!bytes) return false;
      const { ok } = await callEngine({ op: "addFont", family: fontLabel(id), bold, italic, bytes }, [bytes.buffer as ArrayBuffer]);
      any ||= ok;
    }
    // Shown on screen too once pdf.js redraws; warming the face keeps the menu preview instant.
    void ensureFace(id, bold, italic, chars).catch(() => undefined);
    return any;
  } catch {
    return false;
  }
}
