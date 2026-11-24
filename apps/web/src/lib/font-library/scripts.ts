/**
 * Fonts for writing systems the matcher can't compare by shape (its index holds Latin letters
 * and digits): a face made for the script, in the style of the document's font (F24, AC-288).
 * Pure.
 */
import type { FamilyRow } from "./client";

export type Look = { kind: "serif" | "sans-serif" | "monospace"; name: string };

/** Arabic is written in styles a serif or sans label doesn't tell apart. */
const ARABIC: Record<"nastaliq" | "kufi" | "naskh" | "sans", string[]> = {
  nastaliq: ["noto-nastaliq-urdu", "gulzar"],
  kufi: ["noto-kufi-arabic", "reem-kufi"],
  naskh: ["noto-naskh-arabic", "amiri", "scheherazade-new"],
  sans: ["noto-sans-arabic", "ibm-plex-sans-arabic", "cairo"],
};
const ARABIC_ORDER: Record<keyof typeof ARABIC, (keyof typeof ARABIC)[]> = {
  nastaliq: ["nastaliq", "naskh", "sans", "kufi"],
  kufi: ["kufi", "sans", "naskh", "nastaliq"],
  naskh: ["naskh", "sans", "kufi", "nastaliq"],
  sans: ["sans", "kufi", "naskh", "nastaliq"],
};
const NASKH = /naskh|times|traditionalarabic|simplifiedarabic|arabictypesetting|amiri|scheherazade|lotus|badr|lateef/;

/** The Arabic style of a font, by its name, else by its look. */
export function arabicStyle(look: Look): keyof typeof ARABIC {
  const n = look.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/nastaliq|nastaleeq|nasta|urdu|jameel|nafees|gulzar/.test(n)) return "nastaliq";
  if (/kufi|kufic/.test(n)) return "kufi";
  return look.kind === "serif" || NASKH.test(n) ? "naskh" : "sans";
}

/** Well-drawn families of a script beyond the Noto pair, in the style named. */
const MORE: Record<string, { serif: string[]; sans: string[] }> = {
  devanagari: { serif: ["tiro-devanagari-hindi", "martel"], sans: ["hind", "mukta", "poppins"] },
  hebrew: { serif: ["frank-ruhl-libre", "david-libre"], sans: ["heebo", "rubik", "assistant"] },
  bengali: { serif: ["tiro-bangla"], sans: ["hind-siliguri"] },
  tamil: { serif: ["tiro-tamil"], sans: ["hind-madurai"] },
  thai: { serif: ["trirong"], sans: ["sarabun", "prompt"] },
};

/**
 * Library families made for `set` ("arabic", "devanagari"…), best first for a font that looks
 * like `look`: the same style first, then the script's other styles. Only families the library
 * has, when its list is known.
 */
export function scriptFamilies(set: string, look: Look, families: readonly FamilyRow[]): string[] {
  const serif = look.kind === "serif";
  const pair = (s: boolean) => [`noto-${s ? "serif" : "sans"}-${set}`, ...(MORE[set]?.[s ? "serif" : "sans"] ?? [])];
  const ids = set === "arabic" ? ARABIC_ORDER[arabicStyle(look)].flatMap((k) => ARABIC[k]) : [...pair(serif), ...pair(!serif)];
  const known = new Map(families.map((f) => [f.i, f]));
  return [...new Set(ids)].filter((id) => !families.length || known.get(id)?.s.includes(set));
}

/** A few of the commonest letters of each script: which one a font is made for is read off the ones it has. */
export const SCRIPT_PROBE: [set: string, letters: string][] = [
  ["devanagari", "कखगतनपमरलसहािीेो"],
  ["arabic", "ابتدرسعفقكلمنهوي"],
  ["hebrew", "אבגדהוילמנרשת"],
  ["bengali", "কখগতনপমরলসহািে"],
  ["gurmukhi", "ਕਖਗਤਨਪਮਰਲਸਹਾਿ"],
  ["gujarati", "કખગતનપમરલસહાિ"],
  ["tamil", "கசடதநபமரலவாி"],
  ["telugu", "కగచతనపమరలసాి"],
  ["kannada", "ಕಗಚತನಪಮರಲಸಾಿ"],
  ["malayalam", "കഗചതനപമരലസാി"],
  ["thai", "กขคงจดตนบปมยรลวสอาเ"],
  ["greek", "αβγδεικλμνοπρστ"],
  ["cyrillic", "абвгдеиклмнопрст"],
];

/** Latin letters asked about alongside: a font with more of these than of any script is a Latin font that also has others. */
export const LATIN_PROBE = "aeinorstlcdumphgbfyw";

/**
 * The script a font is made for: the one most of whose probe letters are in `covered` (at least
 * three), unless the font has a larger share of the Latin probe (Arial has Arabic and Hebrew
 * too, and is not an Arabic font).
 */
export function scriptOf(covered: string): string | null {
  const have = new Set(covered);
  const share = (letters: string) => [...letters].filter((c) => have.has(c)).length / [...letters].length;
  let best: [string | null, number] = [null, 0];
  for (const [set, letters] of SCRIPT_PROBE) {
    const n = [...letters].filter((c) => have.has(c)).length;
    if (n >= 3 && share(letters) > best[1]) best = [set, share(letters)];
  }
  return best[0] && best[1] > share(LATIN_PROBE) ? best[0] : null;
}

/**
 * The fonts for a document font made for the script `set`, best first: the library family of its
 * own name, the shape matches that are made for the script (a Devanagari font's Latin letters
 * also match Noto Sans Sharada, which is no use for Hindi), then the script's faces in its style.
 */
export function scriptOrder(set: string, look: Look, own: string | undefined, shaped: readonly string[], families: readonly FamilyRow[]): string[] {
  const known = new Map(families.map((f) => [f.i, f]));
  const has = (id?: string): id is string => !!id && !!known.get(id)?.s.includes(set);
  return [...new Set([own, ...shaped, ...scriptFamilies(set, look, families)].filter(has))];
}
