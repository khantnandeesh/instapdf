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

/**
 * The name a field ends up with when renamed from `from` to `to`. A field keeps its parent when the
 * new name starts with the same parent ("address.town" → "address.city"); any other dotted name
 * would need a new parent, so its dots become "_" and the field moves to the top level.
 */
export function renamedTo(from: string, to: string): string {
  const prefix = (s: string) => (s.includes(".") ? s.slice(0, s.lastIndexOf(".")) : "");
  const p = prefix(from);
  const name = to.trim();
  if (p && name.startsWith(`${p}.`) && !name.slice(p.length + 1).includes(".")) return name;
  return name.replace(/\./g, "_");
}
