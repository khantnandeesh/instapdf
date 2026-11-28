/** Metadata (spec F10 §3): what the form and the engine agree on. Pure, with no PDF library: the option panel uses it. */

/** The fields every PDF reader shows, in the order people expect. */
export const STANDARD_FIELDS = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"] as const;
/** Keys that are not text fields a person edits (dates are shown, not typed; Trapped is a print flag). */
export const NOT_FIELDS = new Set(["CreationDate", "ModDate", "Trapped"]);
export const FIELD_LIMITS = { name: 120, value: 10000, custom: 20 };

export type MetadataField = { name: string; value: string };

/** A name that can be a field of its own: any printable text, not one of the dates, not twice. */
export function fieldNameError(name: string, taken: readonly string[]): "empty" | "characters" | "reserved" | "taken" | null {
  const n = name.trim();
  if (!n) return "empty";
  // Control characters cannot be told apart on screen; everything else a file may already use is fine.
  if (n.length > FIELD_LIMITS.name || /[\u0000-\u001f\u007f]/.test(n)) return "characters";
  if (NOT_FIELDS.has(n)) return "reserved";
  if (taken.some((t) => t.toLowerCase() === n.toLowerCase())) return "taken";
  return null;
}
