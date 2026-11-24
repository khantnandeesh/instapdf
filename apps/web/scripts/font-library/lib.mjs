/**
 * Font library catalogue: pure helpers shared by the crawler (crawl.mjs) and its tests.
 *
 * The library holds only fonts whose licence lets us redistribute and embed them. Every entry
 * keeps its licence, source and version, and anything the gate cannot place is rejected with a
 * reason (docs/specs/f24-font-library.md, AC-270 to AC-274).
 */

/** SPDX ids a font may have to enter the library. Lower-case keys; value is the canonical id. */
export const FONT_LICENCES = new Map([
  ["ofl-1.1", "OFL-1.1"],
  ["apache-2.0", "Apache-2.0"],
  ["ufl-1.0", "UFL-1.0"],
  ["cc0-1.0", "CC0-1.0"],
  ["mit", "MIT"],
  ["unlicense", "Unlicense"],
]);

/** Canonical SPDX id for a catalogue's licence string, or null when it is not on the list. */
export function canonicalLicence(raw) {
  if (typeof raw !== "string") return null;
  return FONT_LICENCES.get(raw.trim().toLowerCase()) ?? null;
}

/** Family key for de-duplication: letters and digits only, lower case. */
export function familyKey(family) {
  return String(family ?? "")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

const CATEGORIES = new Set(["sans-serif", "serif", "monospace", "display", "handwriting"]);
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Checks one catalogue entry. Returns { ok: true, entry } with the normalised entry, or
 * { ok: false, reason }.
 *
 * @param {{ id?: string, family?: string, license?: string, category?: string, subsets?: string[],
 *   weights?: number[], styles?: string[], lastModified?: string, version?: string, type?: string }} raw
 * @param {string} source where the entry came from, e.g. "fontsource"
 */
export function gate(raw, source) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not-an-entry" };
  if (typeof raw.id !== "string" || !ID.test(raw.id)) return { ok: false, reason: "bad-id" };
  if (typeof raw.family !== "string" || !raw.family.trim()) return { ok: false, reason: "no-family" };
  const licence = canonicalLicence(raw.license);
  if (!licence) return { ok: false, reason: `licence:${raw.license ?? "missing"}` };
  // Icon fonts draw pictures, not text: they are no use for matching or typing.
  if (raw.category === "icons") return { ok: false, reason: "icon-font" };
  const weights = [...new Set((raw.weights ?? []).filter((w) => Number.isInteger(w) && w >= 1 && w <= 1000))].sort((a, b) => a - b);
  const styles = [...new Set((raw.styles ?? []).filter((s) => s === "normal" || s === "italic"))].sort().reverse();
  const subsets = [...new Set((raw.subsets ?? []).filter((s) => typeof s === "string" && ID.test(s)))].sort();
  if (!weights.length || !styles.length || !subsets.length) return { ok: false, reason: "no-faces" };
  return {
    ok: true,
    entry: {
      id: raw.id,
      family: raw.family.trim(),
      key: familyKey(raw.family),
      licence,
      category: CATEGORIES.has(raw.category) ? raw.category : "other",
      subsets,
      weights,
      styles,
      modified: typeof raw.lastModified === "string" ? raw.lastModified : "",
      version: typeof raw.version === "string" ? raw.version : "",
      source,
    },
  };
}

/**
 * Gates a whole listing and merges families that appear more than once (same family key): the
 * most recently modified wins, and earlier sources win a tie.
 * Returns { families, rejected } with families sorted by id.
 */
export function buildCatalogue(listings) {
  const byKey = new Map();
  const rejected = [];
  for (const { source, entries } of listings) {
    for (const raw of entries) {
      const r = gate(raw, source);
      if (!r.ok) {
        rejected.push({ id: typeof raw?.id === "string" ? raw.id : "", family: typeof raw?.family === "string" ? raw.family : "", source, reason: r.reason });
        continue;
      }
      const had = byKey.get(r.entry.key);
      if (!had || r.entry.modified > had.modified) byKey.set(r.entry.key, r.entry);
      if (had) rejected.push({ id: (r.entry.modified > had.modified ? had : r.entry).id, family: r.entry.family, source, reason: "duplicate" });
    }
  }
  const families = [...byKey.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { families, rejected };
}

/** Every face of a family as { weight, style }. */
export function faces(entry) {
  return entry.weights.flatMap((weight) => entry.styles.map((style) => ({ weight, style })));
}

/** Counts for the crawl report. */
export function summarise({ families, rejected }) {
  const count = (items, key) => {
    const out = {};
    for (const it of items) out[key(it)] = (out[key(it)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
  };
  return {
    families: families.length,
    faces: families.reduce((n, f) => n + faces(f).length, 0),
    licences: count(families, (f) => f.licence),
    categories: count(families, (f) => f.category),
    scripts: count(
      families.flatMap((f) => f.subsets),
      (s) => s,
    ),
    rejected: count(rejected, (r) => r.reason),
  };
}
