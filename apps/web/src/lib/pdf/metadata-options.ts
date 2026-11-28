/** Metadata (spec F10 §3): what the form and the engine agree on. Pure, with no PDF library: the option panel uses it. */

/** The fields every PDF reader shows, in the order people expect. */
export const STANDARD_FIELDS = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"] as const;
/** Keys that are not text fields a person edits (dates are shown, not typed; Trapped is a print flag). */
export const NOT_FIELDS = new Set(["CreationDate", "ModDate", "Trapped"]);
export const FIELD_LIMITS = { name: 60, value: 2000, custom: 20 };

export type MetadataField = { name: string; value: string };

/** A name that can be a key of the Info dictionary: letters, digits and a few signs, not one of the dates. */
export function fieldNameError(name: string, taken: readonly string[]): "empty" | "characters" | "reserved" | "taken" | null {
  const n = name.trim();
  if (!n) return "empty";
  if (n.length > FIELD_LIMITS.name || !/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(n)) return "characters";
  if (NOT_FIELDS.has(n)) return "reserved";
  if (taken.some((t) => t.toLowerCase() === n.toLowerCase())) return "taken";
  return null;
}
