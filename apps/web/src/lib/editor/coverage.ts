/**
 * Characters of added text that no font we ship can print (AC-75: never silently). Pure, unit
 * tested. The download still writes a "?" for them; the editor marks the box and asks first.
 * Coverage comes from the font manifests' character ranges (the face's own files, then the Noto
 * fallbacks), the same lists the download worker picks fonts from.
 */
import { covers, type FontFileEntry } from "./fonts";

/** Unique characters of `text` that no file covers, in order (spaces and controls never count). */
export function missingChars(text: string, face: readonly FontFileEntry[], fallback: readonly FontFileEntry[]): string[] {
  const out: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x21 || /\s/u.test(ch) || (cp >= 0x7f && cp < 0xa0) || out.includes(ch)) continue;
    if (face.some((f) => covers(f.ranges, cp)) || fallback.some((f) => covers(f.ranges, cp))) continue;
    out.push(ch);
  }
  return out;
}

/** For a note: the characters joined with spaces, at most `max` of them. */
export function listChars(chars: readonly string[], max = 8): string {
  return chars.length > max ? `${chars.slice(0, max).join(" ")} …` : chars.join(" ");
}
