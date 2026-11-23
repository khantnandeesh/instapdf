/** Page rotation math for the Rotate tool. Pure functions, unit tested. */

export type RotateScope = "all" | "odd" | "even";

/** Normalizes any multiple of 90 (negative or above 360) to 0, 90, 180 or 270. */
export function normalizeRotation(degrees: number): number {
  const r = Math.round(degrees / 90) * 90;
  return ((r % 360) + 360) % 360;
}

/** Odd/even use 1-based page numbers inside each file. `index` is 0-based. */
export function isInScope(scope: RotateScope, index: number): boolean {
  if (scope === "all") return true;
  const pageNumber = index + 1;
  return scope === "odd" ? pageNumber % 2 === 1 : pageNumber % 2 === 0;
}

/**
 * Adds `step` degrees to every page in scope. `deltas` keeps unbounded values
 * (so a display transition from 270 to 360 keeps turning forward).
 */
export function rotateScope(deltas: readonly number[], pageCount: number, scope: RotateScope, step: number): number[] {
  const out = Array.from({ length: pageCount }, (_, i) => deltas[i] ?? 0);
  for (let i = 0; i < pageCount; i++) if (isInScope(scope, i)) out[i] += step;
  return out;
}

/** Adds `step` degrees to one page. */
export function rotatePage(deltas: readonly number[], pageCount: number, index: number, step: number): number[] {
  const out = Array.from({ length: pageCount }, (_, i) => deltas[i] ?? 0);
  if (index >= 0 && index < pageCount) out[index] += step;
  return out;
}

/** The `/Rotate` value saved for a page: (original + delta) mod 360. */
export function finalRotation(original: number, delta: number): number {
  return normalizeRotation(original + delta);
}

export function hasPendingRotation(deltas: readonly number[] | undefined): boolean {
  return !!deltas && deltas.some((d) => normalizeRotation(d) !== 0);
}

/** "+90°", "−90°" (for 270), "180°" or "" when nothing changes. */
export function formatDelta(delta: number): string {
  const n = normalizeRotation(delta);
  if (n === 0) return "";
  if (n === 90) return "+90°";
  if (n === 270) return "−90°";
  return "180°";
}

/** Accessible description of a pending change, e.g. "will rotate 90° clockwise". */
export function describeDelta(delta: number): string {
  const n = normalizeRotation(delta);
  if (n === 0) return "no change";
  if (n === 90) return "will rotate 90° clockwise";
  if (n === 270) return "will rotate 90° counterclockwise";
  return "will rotate 180°";
}
