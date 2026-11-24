/**
 * Undo history for the editor. Pure, unit tested.
 *
 * The engine's save only appends (the bytes before an edit are a prefix of the bytes after it),
 * so an undo state is just a length into the current bytes: history costs almost nothing. If a
 * save ever breaks that property, the states become copies, kept within a byte budget.
 */
export type UndoEntry = { page: number } & ({ length: number } | { bytes: Uint8Array });

export const UNDO_COPY_BUDGET = 256 * 1024 * 1024;

/** True when `before` is a prefix of `after`. Checks the length, then a spread sample of bytes. */
export function isPrefix(before: Uint8Array, after: Uint8Array, samples = 4096): boolean {
  if (after.length < before.length) return false;
  const n = before.length;
  if (!n) return true;
  const step = Math.max(1, Math.floor(n / samples));
  for (let i = 0; i < n; i += step) if (before[i] !== after[i]) return false;
  for (let i = Math.max(0, n - 1024); i < n; i++) if (before[i] !== after[i]) return false;
  return true;
}

/**
 * History after an edit that turned `before` into `after` on `page`. `appended` is the engine's
 * own full check that `before` is a prefix of `after` (SaveReport.original_preserved); the
 * sampled `isPrefix` only double-checks it outside production. Earlier length entries are turned
 * into copies when the prefix property breaks (they are prefixes of `before`).
 */
export function pushUndo(history: UndoEntry[], before: Uint8Array, after: Uint8Array, page: number, appended: boolean, budget = UNDO_COPY_BUDGET): UndoEntry[] {
  if (appended && process.env.NODE_ENV !== "production" && !isPrefix(before, after)) {
    throw new Error("Engine reported an appended save that does not start with the previous bytes");
  }
  if (appended) return [...history, { page, length: before.length }];
  const copies: UndoEntry[] = history.map((e) => ("length" in e ? { page: e.page, bytes: before.slice(0, e.length) } : e));
  copies.push({ page, bytes: before });
  return trimToBudget(copies, budget);
}

/** Drops the oldest copies until copies fit the budget, always keeping the newest entry. */
export function trimToBudget(history: UndoEntry[], budget = UNDO_COPY_BUDGET): UndoEntry[] {
  const size = (e: UndoEntry) => ("bytes" in e ? e.bytes.length : 0);
  let total = history.reduce((n, e) => n + size(e), 0);
  let start = 0;
  while (total > budget && start < history.length - 1) total -= size(history[start++]);
  return history.slice(start);
}

/** The bytes an entry restores, given the current bytes. */
export function undoBytes(entry: UndoEntry, current: Uint8Array): Uint8Array {
  return "length" in entry ? current.subarray(0, entry.length) : entry.bytes;
}
