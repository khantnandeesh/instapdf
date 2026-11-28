/**
 * Rename by content (spec F10 §5): a file's new name is made from text found on its first page.
 * Pure: the tool reads the text, this fills the pattern and keeps every name safe and different.
 */
import { baseName, customName, uniqueNames } from "./naming";

export const RENAME_PATTERN = "{text}";
/** The most of the found text a name takes: a whole paragraph caught by a wide box is not a name. */
export const MAX_TEXT = 100;

const TOKEN = /\{(text|name|n)\}/gi;

/** The found text as it goes into a name: one line, cut at a word where it is too long. */
export function nameText(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= MAX_TEXT) return one;
  const cut = one.slice(0, MAX_TEXT);
  const space = cut.lastIndexOf(" ");
  return (space > MAX_TEXT / 2 ? cut.slice(0, space) : cut).trim();
}

/** The new name of one file, or null when it keeps its old one (the pattern needs text and none was found, or nothing usable is left). */
export function renamedName(pattern: string, file: { name: string; text: string }, n: number): string | null {
  const text = nameText(file.text);
  const asked = pattern.trim() || RENAME_PATTERN;
  if (!text && /\{text\}/i.test(asked)) return null;
  const values: Record<string, string> = { text, name: baseName(file.name), n: String(n) };
  return customName(asked.replace(TOKEN, (_, key: string) => values[key.toLowerCase()]));
}

/** Every file's name after the rename (each different from the others), and which files kept their old name. */
export function renameAll(files: readonly { name: string; text: string }[], pattern: string): { names: string[]; kept: number[] } {
  const kept: number[] = [];
  const names = files.map((f, i) => {
    const next = renamedName(pattern, f, i + 1);
    if (next === null) kept.push(i);
    return next ?? f.name;
  });
  return { names: uniqueNames(names), kept };
}
