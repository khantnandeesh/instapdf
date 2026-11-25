"use client";
/**
 * Fonts of the open document and the user's own fonts, for the font menu and for standing in
 * when a document font lacks a character (F24). The document's fonts are read by the engine
 * worker, matched against the library by the matching worker, and nothing leaves this device.
 */
import type { FontInfo, FontRequest } from "@/lib/editor/berry-engine";
import { callEngine } from "@/lib/editor/engine-client";
import { TEXT_FONTS, USER_FILE, USER_FONT, faceOf, filesFor, fontUrl } from "@/lib/editor/fonts";
import { ensureFace, knownManifest, registerUserFont, resolveFonts, userFontBytes, widenFor } from "@/lib/editor/fonts-browser";
import { familyByName, foldName, loadLibrary, type Library } from "@/lib/font-library/client";
import { orderCandidates } from "@/lib/font-library/candidates";
import { MATCH_CHARS, type FontMatch } from "@/lib/font-library/match";
import { LATIN_PROBE, SCRIPT_PROBE, scriptOf, scriptOrder } from "@/lib/font-library/scripts";
import { withTwin } from "@/lib/font-library/twins";
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

const kindOf = (info: FontInfo | undefined) => (info?.monospace ? "monospace" : info?.serif ? "serif" : "sans-serif");

async function byShape(info: FontInfo): Promise<FontMatch[]> {
  if (info.object == null) return [];
  const { program } = await callEngine({ op: "program", font: info.object, chars: MATCH_CHARS });
  return matchFont(program, 5);
}

/** How many faces of its script a font the shapes can't place is given. */
const SCRIPT_FACES = 3;

/**
 * The library fonts closest to a document font: by shape, its metric twin first where it has
 * one (AC-283), and for a font of another writing system (no Latin letters to compare) faces
 * made for that script in the font's own style (AC-288).
 */
async function matchOf(info: FontInfo): Promise<FontMatch[]> {
  const lib = state.library ?? (await loadLibrary().catch(() => null));
  const shaped = await byShape(info).catch(() => [] as FontMatch[]);
  const matches = withTwin(info, shaped, (id) => !lib || lib.byId.has(id));
  if (!lib) return matches;
  const weight = info.bold ? 700 : 400;
  const named = (family: string, grade: FontMatch["grade"], distance = 0): FontMatch => ({ face: `${family}_${weight}_${info.italic ? "italic" : "normal"}`, family, weight, italic: info.italic, grade, distance, letters: 0 });
  const sameName = familyByName(lib, info.family || info.name);
  // A font made for another writing system: faces of that script, whatever its few Latin letters look like.
  const set = info.object == null ? null : scriptOf((await callEngine({ op: "coverage", font: info.object, text: LATIN_PROBE + SCRIPT_PROBE.map(([, letters]) => letters).join("") }).catch(() => ({ covered: "" }))).covered);
  if (set && set !== "greek" && set !== "cyrillic") {
    const ids = scriptOrder(set, { kind: kindOf(info), name: info.name }, sameName?.i, matches.map((m) => m.family), lib.families);
    return ids.slice(0, Math.max(SCRIPT_FACES, 1)).map((id, i) => matches.find((m) => m.family === id) ?? named(id, id === sameName?.i ? "close" : "loose", i));
  }
  if (matches.length) return matches;
  // Too few letters to compare (a font we put there ourselves for a few characters): a library
  // family of exactly this name is the one to offer.
  if (sameName) return [named(sameName.i, "close")];
  // Greek or Cyrillic only: our own font of its kind, which has both.
  const fallback = set && TEXT_FONTS.find((f) => f.class === (info.monospace ? "mono" : info.serif ? "serif" : "sans"))?.id;
  return fallback && lib.byId.get(fallback)?.s.includes(set!) ? [named(fallback, "loose")] : [];
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

/**
 * Font ids to try for the characters a document font lacks, best first: the person's choice,
 * the closest library font by shape, the families the engine names (when the shapes don't say
 * otherwise), the next closest by shape, our default, then (for `chars` of another alphabet)
 * library families of the same kind that have that alphabet.
 */
export async function standInCandidates(info: FontInfo | undefined, request: FontRequest, chars = ""): Promise<string[]> {
  const known = info && state.doc.find((d) => d.key === info.name)?.matches;
  const matches = known ?? (info ? await matchOf(info).catch(() => []) : []);
  const lib = state.library ?? (await loadLibrary().catch(() => null));
  if (lib && !state.library) set({ library: lib });
  const kind = info?.monospace ? "mono" : info?.serif ? "serif" : "sans";
  return orderCandidates({
    choice: choices.get(foldName(request.families[0] ?? "")),
    matches,
    named: request.families.map((name) => (lib ? familyByName(lib, name)?.i : TEXT_FONTS.find((f) => foldName(f.label) === foldName(name))?.id)),
    fallbacks: [TEXT_FONTS.find((f) => f.class === kind)?.id, "arimo"],
    families: lib?.families ?? [],
    kind: kindOf(info),
    name: info?.name,
    chars,
  });
}

/**
 * Registers a font with the engine for `chars`. False when the engine can't use it (it takes
 * TrueType outlines today) or a file didn't arrive.
 */
export async function registerWithEngine(id: string, bold: boolean, italic: boolean, chars: string): Promise<boolean> {
  try {
    await resolveFonts([id]);
    await widenFor([id], chars);
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
