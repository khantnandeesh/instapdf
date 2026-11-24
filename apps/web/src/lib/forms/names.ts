/**
 * Field names (AC-235, AC-241): readable, from the label, with no random suffix. A name that is
 * taken gets `_2`, `_3`… A dot would make a new name part of a field hierarchy, so it is replaced.
 */

/** Words that are not worth keeping at the end of a label ("Name (please print)" → "name"). */
const LABEL_NOISE = /\s*(\(.*?\)|\[.*?\]|[:：*?？.…_]+)\s*$/u;

/** Turns a label into a field name: lower case, letters and digits of any script, joined by "_". */
export function slugify(label: string, max = 40): string {
  let s = label.normalize("NFKC").trim();
  for (let i = 0; i < 3; i++) s = s.replace(LABEL_NOISE, "");
  const words = s
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
  let out = "";
  for (const w of words) {
    const next = out ? `${out}_${w}` : w;
    if (next.length > max && out) break;
    out = next.slice(0, max);
  }
  return out;
}

/** `base`, or `base_2`, `base_3`… whichever is not in `taken`. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const clean = base.replace(/\./g, "_") || "field";
  if (!set.has(clean)) return clean;
  for (let n = 2; ; n++) {
    const name = `${clean}_${n}`;
    if (!set.has(name)) return name;
  }
}

export type NameCheck = { ok: true } | { ok: false; reason: "empty" | "duplicate" | "dot"; suggestion: string };

/**
 * Checks a name the user typed for one field (AC-235). `others` are the names of every other field.
 * A dot is allowed only when the field already had it (fields read from the file keep their name).
 */
export function checkName(name: string, others: Iterable<string>, opts: { allowDot?: boolean } = {}): NameCheck {
  const list = [...others];
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "empty", suggestion: uniqueName("field", list) };
  if (trimmed.includes(".") && !opts.allowDot) return { ok: false, reason: "dot", suggestion: uniqueName(trimmed.replace(/\./g, "_"), list) };
  if (list.includes(trimmed)) return { ok: false, reason: "duplicate", suggestion: uniqueName(trimmed, list) };
  return { ok: true };
}
