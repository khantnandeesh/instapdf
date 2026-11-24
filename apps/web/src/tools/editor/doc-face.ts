/**
 * The open PDF's own fonts as browser fonts, for the line-edit box: while a line is edited it is
 * drawn in the font it has on the page, so nothing appears to change when the box opens or
 * closes. Built from the embedded program (lib/font-library/embedded-face.ts); when a program
 * can't be used (not embedded, Type 1, Type 3, refused by the browser) the closest library font
 * stands in. Everything stays in the page's memory and goes when another file is opened.
 */
import type { FontInfo } from "@/lib/editor/berry-engine";
import { callEngine } from "@/lib/editor/engine-client";
import { cssFamily } from "@/lib/editor/fonts";
import { ensureFace } from "@/lib/editor/fonts-browser";
import { coveredBy, verticalOf, webFontFromProgram } from "@/lib/font-library/embedded-face";
import { isClose } from "@/lib/font-library/match";
import { matchFont } from "@/lib/font-library/match-client";

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
  for (const f of added) document.fonts.delete(f);
  added.clear();
  byFamily.clear();
}

const codePoints = (text: string) => new Set([...text].map((c) => c.codePointAt(0)!));

async function build(info: FontInfo, text: string, gen: number, prev: DocFace | null): Promise<DocFace | null> {
  if (info.object == null || gen !== generation) return null;
  const chars = [...new Set([...BASE, ...(prev ? [...prev.asked].map((cp) => String.fromCodePoint(cp)) : []), ...text])].join("");
  const { program } = await callEngine({ op: "program", font: info.object, chars });
  if (gen !== generation) return null;
  const asked = codePoints(chars);
  const covered = program.format === "none" ? null : coveredBy(program);
  // Asked again for new characters and the font has none of them: the font already made stays
  // (nothing new to draw), it only knows more about what it lacks.
  if (prev && [...asked].every((cp) => prev.asked.has(cp) || !covered?.has(cp))) return { ...prev, covered, asked };
  const file = webFontFromProgram(program, info.family || "Embedded");
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
  try {
    const [best] = await matchFont(program, 1);
    if (gen !== generation || !best || !isClose(best)) return null;
    const entry = await ensureFace(best.family, best.weight >= 600, best.italic, text || "A");
    return { family: cssFamily(best.family), kind: "close", bold: best.weight >= 600, italic: best.italic, ascent: entry.ascent, descent: entry.descent, covered, asked };
  } catch {
    return null;
  }
}

/**
 * The face for a document font, able to say whether it draws each character of `text`. Built
 * once per font; built again only when `text` has a character that was never asked about.
 */
export function docFace(info: FontInfo, text: string, known?: DocFace | null): Promise<DocFace | null> {
  if (info.object == null) return Promise.resolve(null);
  const key = String(info.object);
  if (known && [...codePoints(text)].every((cp) => known.asked.has(cp))) return Promise.resolve(known);
  const gen = generation;
  const have = faces.get(key);
  // A font that couldn't be made (null) is not tried again for this file.
  const fresh = have
    ? have.then((f) => (!f || [...codePoints(text)].every((cp) => f.asked.has(cp)) ? f : build(info, text, gen, f)))
    : build(info, text, gen, null);
  faces.set(key, fresh.catch(() => null));
  return faces.get(key)!;
}
