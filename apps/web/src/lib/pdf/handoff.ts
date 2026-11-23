"use client";
/**
 * In-memory hand-off for "Keep going with this file": the result screen puts
 * the output here and the target tool takes it on mount. Module-level state
 * survives client-side navigation; nothing is written to storage.
 */
type Handoff = { toolSlug: string; files: File[] };

let pending: Handoff | null = null;

export function setHandoff(toolSlug: string, files: File[]): void {
  pending = { toolSlug, files };
}

/** Returns and clears the files waiting for this tool, if any. */
export function takeHandoff(toolSlug: string): File[] | null {
  if (!pending || pending.toolSlug !== toolSlug) return null;
  const { files } = pending;
  pending = null;
  return files;
}
