/** Split by size: the limit as the page holds it. Pure and tiny, so the page does not load the PDF engine for it. */
export const SIZE_UNITS = { KB: 1024, MB: 1024 * 1024 } as const;
export type SizeUnit = keyof typeof SIZE_UNITS;
/** The smallest limit the tool takes: under it almost any page is too big on its own. */
export const MIN_LIMIT = 20 * 1024;

/** The limit in bytes for the field's text and unit, or null while it is not a whole number that makes a usable limit. */
export function sizeLimit(text: string, unit: SizeUnit): number | null {
  if (!/^\d{1,4}$/.test(text.trim())) return null;
  const bytes = Number(text.trim()) * SIZE_UNITS[unit];
  return bytes >= MIN_LIMIT ? bytes : null;
}
