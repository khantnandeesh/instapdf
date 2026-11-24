/**
 * The order in which fonts are tried for characters a document font lacks (F24, AC-281, AC-282,
 * AC-301). Pure: the caller brings the matches, the names and the family list.
 */
import type { FamilyRow } from "./client";
import { isClose, type FontMatch } from "./match";
import { scriptFamilies } from "./scripts";

/** Character sets whose fonts must be asked for by set: [first, last, the library's name for it]. */
const SETS: [number, number, string][] = [
  [0x370, 0x3ff, "greek"],
  [0x400, 0x4ff, "cyrillic"],
  [0x530, 0x58f, "armenian"],
  [0x590, 0x5ff, "hebrew"],
  [0x600, 0x6ff, "arabic"],
  [0x700, 0x74f, "syriac"],
  [0x900, 0x97f, "devanagari"],
  [0x980, 0x9ff, "bengali"],
  [0xa00, 0xa7f, "gurmukhi"],
  [0xa80, 0xaff, "gujarati"],
  [0xb00, 0xb7f, "oriya"],
  [0xb80, 0xbff, "tamil"],
  [0xc00, 0xc7f, "telugu"],
  [0xc80, 0xcff, "kannada"],
  [0xd00, 0xd7f, "malayalam"],
  [0xd80, 0xdff, "sinhala"],
  [0xe00, 0xe7f, "thai"],
  [0xe80, 0xeff, "lao"],
  [0x10a0, 0x10ff, "georgian"],
  [0x1200, 0x137f, "ethiopic"],
  [0x13a0, 0x13ff, "cherokee"],
  [0x1400, 0x167f, "canadian-aboriginal"],
  [0x1680, 0x169f, "ogham"],
  [0x16a0, 0x16ff, "runic"],
  [0x1780, 0x17ff, "khmer"],
  [0x2800, 0x28ff, "braille"],
  [0x2d30, 0x2d7f, "tifinagh"],
];
/** The library's name for the character set a character belongs to, where a font must have that set to draw it. */
function setOf(cp: number): string | null {
  return SETS.find(([lo, hi]) => cp >= lo && cp <= hi)?.[2] ?? null;
}
/** Sets a general text font has; a family with any other set is made for that script. */
const GENERAL = new Set(["latin", "latin-ext", "vietnamese", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "math", "symbols", "symbols2"]);

/** How many library families are added for a character set the closer fonts may not have. */
const SET_FONTS = 4;

/** The library's names of the sets `chars` need beyond what a general text font has. */
export function setsOf(chars: string): string[] {
  return [...new Set([...chars].map((c) => setOf(c.codePointAt(0)!)).filter((x): x is string => !!x))];
}

export type CandidateInput = {
  /** The person's own choice for this document family. */
  choice?: string;
  /** The library fonts closest by shape, best first (empty: nothing was compared). */
  matches: readonly FontMatch[];
  /** Library families that carry the names the document font goes by. */
  named: readonly (string | undefined)[];
  /** Our defaults for the font's kind. */
  fallbacks: readonly (string | undefined)[];
  families: readonly FamilyRow[];
  kind: "serif" | "sans-serif" | "monospace";
  /** The document font's name: tells an Arabic font's style (Naskh, Kufi, Nastaliq). */
  name?: string;
  chars: string;
};

/**
 * Best first: the person's choice, the closest by shape, the family of the same name (when the
 * shapes don't say otherwise), for another writing system the faces made for it in the font's
 * own style (AC-288), the other families named, the next closest by shape, our defaults,
 * families of the same kind that have the alphabet asked for, and last a same-named family the
 * shapes disagreed with.
 */
export function orderCandidates({ choice, matches, named, fallbacks, families, kind, name = "", chars }: CandidateInput): string[] {
  const out: string[] = [];
  const add = (id?: string) => id && !out.includes(id) && out.push(id);
  add(choice);
  if (isClose(matches[0])) add(matches[0].family);
  // A name is only a claim: where the shapes were compared and say otherwise (a font called
  // Inter that is drawn as a serif), the family of that name waits until after the fonts that
  // look like it.
  const agrees = (id?: string) => !matches.length || matches.some((m) => m.family === id && isClose(m));
  if (agrees(named[0])) add(named[0]);
  const sets = setsOf(chars);
  // Letters of a script the shapes can't be compared in: a face made for it, serif for a serif
  // and sans for a sans, and for Arabic in the hand the font's name tells.
  for (const set of sets) if (!GENERAL.has(set)) for (const id of scriptFamilies(set, { kind, name }, families)) add(id);
  for (const id of named) if (agrees(id)) add(id);
  // Then the next closest by shape, so a character the closest lacks goes to the next closest.
  // A family made for another script (Noto Serif Telugu has Latin letters too) is not offered
  // for text that isn't in that script.
  const rows = new Map(families.map((f) => [f.i, f]));
  const forOtherScript = (id: string) => rows.get(id)?.s.some((x) => !GENERAL.has(x) && !sets.includes(x)) ?? false;
  for (const m of matches) if (!forOtherScript(m.family)) add(m.family);
  for (const id of fallbacks) add(id);
  if (sets.length) {
    const having = families.filter((f) => sets.every((x) => f.s.includes(x)));
    for (const f of [...having.filter((f) => f.c === kind), ...having.filter((f) => f.c !== kind && f.c !== "display" && f.c !== "handwriting")].slice(0, SET_FONTS)) add(f.i);
  }
  for (const id of named) add(id);
  return out;
}
