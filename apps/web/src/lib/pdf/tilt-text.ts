/** Words for the small turns Deskew makes (spec F15 §1). */

/** A small turn to straighten a page: "+2.3°" clockwise, "−0.5°" the other way, "" for none. */
export function formatTilt(degrees: number): string {
  const v = Math.round(degrees * 10) / 10;
  if (!v) return "";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}°`;
}

/** The same turn in words, e.g. "2.3° clockwise"; "no turn" for none. */
export function describeTilt(degrees: number): string {
  const v = Math.round(degrees * 10) / 10;
  if (!v) return "no turn";
  return `${Math.abs(v).toFixed(1)}° ${v > 0 ? "clockwise" : "anticlockwise"}`;
}
