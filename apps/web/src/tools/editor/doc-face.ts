/**
 * The open PDF's own fonts as browser fonts, for the line-edit box: while a line is edited it is
 * drawn in the font it has on the page, so nothing appears to change when the box opens or
 * closes. Built from the embedded program (lib/font-library/embedded-face.ts); when a program
 * can't be used (not embedded, Type 1, Type 3, refused by the browser) the closest library font
 * stands in. Everything stays in the page's memory and goes when another file is opened.
 */
import type { FontInfo } from "@/lib/editor/berry-engine";
import { callEngine } from "@/lib/editor/engine-client";
import { TEXT_FONTS, cssFamily, faceOf, fileFor } from "@/lib/editor/fonts";
import { ensureFace, knownManifest, widenFor } from "@/lib/editor/fonts-browser";
import { coveredBy, verticalOf, webFontFromProgram } from "@/lib/font-library/embedded-face";
import { needsShaping } from "@/lib/editor/shaping";
import { isClose } from "@/lib/font-library/match";
import { matchFont } from "@/lib/font-library/match-client";
import { twinOf } from "@/lib/font-library/twins";

export type DocFace = {
  /** CSS family to draw with. */
  family: string;
  /** "own": the PDF's embedded font. "close": the closest library font, drawn in its own weight and style. */
  kind: "own" | "close";
  /** With "close": whether the library face asked for is bold or italic (so the box asks for the same). */
  bold: boolean;
  italic: boolean;
  /** Ascent and descent of the face as fractions of the em (both positive): where its baseline sits. */
  ascent: number;
  descent: number;
  /** Characters the PDF's font can draw; null when that isn't known (nothing is marked then). */
  covered: Set<number> | null;
  /** Every character that was asked about (a typed character outside it needs another look). */
  asked: Set<number>;
};

/** Letters, digits and marks of Western and Central European text: asked about up front. */
const BASE = (() => {
  let s = "";
  for (let cp = 0x20; cp <= 0x17f; cp++) if (cp < 0x7f || cp > 0x9f) s += String.fromCodePoint(cp);
  return s + "‐‑–—‘’‚“”„†‡•…‰‹›€™−";
})();

let generation = 0;
let serial = 0;
const faces = new Map<string, Promise<DocFace | null>>();
const added = new Set<FontFace>();
/** The loaded font behind each family made here, so a remade one replaces it. */
const byFamily = new Map<string, FontFace>();

/** Another file: its fonts are removed from the page. */
export function resetDocFaces(): void {
  generation++;
  faces.clear();
  deferred.clear();
  for (const f of added) document.fonts.delete(f);
  added.clear();
  byFamily.clear();
}

/** CSS family of a stand-in → its library id. */
const STAND_IN = new Map<string, string>();
const standInFamily = (id: string) => {
  const family = cssFamily(id);
  STAND_IN.set(family, id);
  return family;
};

const codePoints = (text: string) => new Set([...text].map((c) => c.codePointAt(0)!));

/** Fonts whose making was put off while warming up (it needs the font library): made when a line asks. */
const deferred = new Set<string>();

/**
 * What a library face can draw of `asked`: the record for a font the PDF only names, whose text
 * the stand-in draws on screen and in the saved file. `widen` also looks at the library's other
 * files of the family (Greek, Cyrillic…); the warm-up never does (AC-290). Null when unknown.
 */
async function standInCovers(id: string, bold: boolean, italic: boolean, asked: Set<number>, widen: boolean): Promise<Set<number> | null> {
  if (widen) await widenFor([id], [...asked].map((cp) => String.fromCodePoint(cp)).join("")).catch(() => undefined);
  const m = knownManifest();
  const face = m?.faces[id] && faceOf(m, id, bold, italic);
  if (!face) return null;
  return new Set([...asked].filter((cp) => fileFor(face, cp)));
}

/** `defer`: called instead of loading anything of the font library (the warm-up never does, AC-290). */
async function build(info: FontInfo, text: string, gen: number, prev: DocFace | null, defer?: () => void): Promise<DocFace | null> {
  if (info.object == null || gen !== generation) return null;
  const chars = [...new Set([...BASE, ...(prev ? [...prev.asked].map((cp) => String.fromCodePoint(cp)) : []), ...text])].join("");
  const { program } = await callEngine({ op: "program", font: info.object, chars });
  if (gen !== generation) return null;
  const asked = codePoints(chars);
  // Hindi, Arabic and other scripts whose letters join: the embedded program has the glyphs but
  // not the rules that join them, so the browser can't set such text with it. A library font
  // that has the rules stands in, and nothing is marked as missing (the engine decides on save).
  const joined = needsShaping(text);
  const covered = program.format === "none" || joined ? null : coveredBy(program);
  // Asked again for new characters and the font has none of them: the font already made stays
  // (nothing new to draw), it only knows more about what it lacks.
  if (prev && !info.embedded && program.format === "none" && !joined && prev.kind === "close") {
    // Only named: the stand-in already made is asked about the new characters, and its files
    // for them are loaded, so what the record says it draws is what the box shows.
    const id = STAND_IN.get(prev.family);
    if (id) await ensureFace(id, prev.bold, prev.italic, text || "A").catch(() => undefined);
    const drawn = id ? await standInCovers(id, prev.bold, prev.italic, asked, true) : null;
    if (gen !== generation) return null;
    return { ...prev, covered: drawn, asked };
  }
  if (prev && [...asked].every((cp) => prev.asked.has(cp) || !covered?.has(cp))) return { ...prev, covered, asked };
  const file = joined ? null : webFontFromProgram(program, info.family || "Embedded");
  if (file) {
    const family = `bp-doc-${info.object}-${++serial}`;
    try {
      const face = new FontFace(family, file.buffer as ArrayBuffer);
      await face.load();
      if (gen !== generation) return null;
      document.fonts.add(face);
      added.add(face);
      byFamily.set(family, face);
      // The one it replaces goes once the box has had time to switch to this one.
      const old = prev && byFamily.get(prev.family);
      if (old)
        setTimeout(() => {
          document.fonts.delete(old);
          added.delete(old);
          byFamily.delete(prev.family);
        }, 2000);
      const v = verticalOf(file) ?? { ascent: 0.8, descent: 0.2 };
      return { family, kind: "own", bold: false, italic: false, ...v, covered, asked };
    } catch {
      // The browser refused the file: the closest library font below.
    }
  }
  // A font the PDF only names (Helvetica, Times, Courier, Arial…): its metric twin, with no
  // shapes to compare and nothing to wait for but the font itself (AC-283).
  const twin = info.embedded ? undefined : twinOf(info.family || info.name);
  if (defer && !(twin && TEXT_FONTS.some((f) => f.id === twin))) {
    defer();
    return null;
  }
  if (twin) {
    try {
      const entry = await ensureFace(twin, info.bold, info.italic, text || "A");
      if (gen !== generation) return null;
      // Nothing of the font is in the file: what the twin draws is what there is (AC-300).
      const drawn = program.format === "none" && !joined ? await standInCovers(twin, info.bold, info.italic, asked, !defer) : covered;
      if (gen !== generation) return null;
      return { family: standInFamily(twin), kind: "close", bold: info.bold, italic: info.italic, ascent: entry.ascent, descent: entry.descent, covered: drawn, asked };
    } catch {
      // The library hasn't got it: the closest by shape below.
    }
  }
  if (defer) {
    defer();
    return null;
  }
  try {
    const [best] = await matchFont(program, 1);
    if (gen !== generation || !best || !isClose(best)) return null;
    const entry = await ensureFace(best.family, best.weight >= 600, best.italic, text || "A");
    // An embedded Type 1 or Type 3 font (no program the browser can use) keeps "not known".
    const drawn = !info.embedded && program.format === "none" && !joined ? await standInCovers(best.family, best.weight >= 600, best.italic, asked, true) : covered;
    return { family: standInFamily(best.family), kind: "close", bold: best.weight >= 600, italic: best.italic, ascent: entry.ascent, descent: entry.descent, covered: drawn, asked };
  } catch {
    return null;
  }
}

/**
 * The face for a document font, able to say whether it draws each character of `text`. Built
 * once per font; built again only when `text` has a character that was never asked about.
 */
export function docFace(info: FontInfo, text: string, known?: DocFace | null, warm = false): Promise<DocFace | null> {
  if (info.object == null) return Promise.resolve(null);
  // Joined scripts get a face of their own (a stand-in that can join letters): a font's Latin
  // text keeps the document's own font and its record of what is missing.
  const key = `${info.object}${needsShaping(text) ? "|joined" : ""}`;
  if (known && [...codePoints(text)].every((cp) => known.asked.has(cp))) return Promise.resolve(known);
  const gen = generation;
  const have = faces.get(key);
  // A font that couldn't be made (null) is not tried again for this file; a remake that fails
  // keeps the font there was.
  const again = () => {
    deferred.delete(key);
    return build(info, text, gen, null);
  };
  const fresh = have
    ? have.then((f) => (!f && deferred.has(key) && !warm ? again() : !f || [...codePoints(text)].every((cp) => f.asked.has(cp)) ? f : build(info, text, gen, f).catch(() => f)))
    : build(info, text, gen, null, warm ? () => deferred.add(key) : undefined);
  // A warm-up that failed (the engine was restarting) is no verdict on the font: a line asks again.
  faces.set(key, fresh.catch(() => (warm && deferred.add(key), null)));
  return faces.get(key)!;
}

/** How many of a page's fonts are made ready ahead of the first click. */
const WARM = 8;

/**
 * Makes a page's fonts ready while nothing else is happening, so the first line opened is drawn
 * in its font at once (a font that needs the closest library font takes a second or two the
 * first time). One font at a time; stops when another file is opened.
 */
export function warmDocFaces(fonts: readonly FontInfo[]): void {
  const gen = generation;
  const todo = fonts.filter((f) => f.object != null && f.kind !== "type3" && !faces.has(String(f.object))).slice(0, WARM);
  if (!todo.length) return;
  const idle = (run: () => void) => (typeof requestIdleCallback === "function" ? requestIdleCallback(run, { timeout: 2000 }) : setTimeout(run, 300));
  const next = () => {
    const info = todo.shift();
    if (!info || gen !== generation) return;
    void docFace(info, "", undefined, true).then(() => idle(next), () => idle(next));
  };
  idle(next);
}
