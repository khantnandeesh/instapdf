/**
 * Byte versions of the document made by existing-text edits (the engine). Pure, unit tested.
 *
 * The engine's save appends (the bytes before an edit are a prefix of the bytes after it), so an
 * older version is usually just a length into a newer one: a long edit session costs one copy of
 * the file. When a save rewrites instead, the older version stays a full copy; copies beyond a
 * byte budget are released oldest first, and history states that need them are dropped
 * (`floor`). Versions no history state refers to any more are released too (`releaseBelow`).
 *
 * Indexes are stable (DocState.engine points into this list); a released version is `null`.
 * The newest version is always a full copy, and so is the shown one until a newer edit is made.
 * The original file (`held`) is kept by the page anyway, so it costs nothing against the budget.
 */
export type VersionEntry = { bytes: Uint8Array; held?: true } | { length: number } | null;

/** Full copies kept for undo, besides the newest version. */
export const VERSION_COPY_BUDGET = 192 * 1024 * 1024;

/** The original file: the page holds these bytes anyway, so releasing them frees nothing. */
export const initialVersions = (bytes: Uint8Array): VersionEntry[] => [{ bytes, held: true }];

/** The bytes of version `i` (a view into a newer copy for a length entry), or null if released. */
export function versionBytes(v: readonly VersionEntry[], i: number): Uint8Array | null {
  const e = v[i];
  if (!e) return null;
  if ("bytes" in e) return e.bytes;
  for (let j = i + 1; j < v.length; j++) {
    const f = v[j];
    if (f && "bytes" in f) return f.bytes.subarray(0, e.length);
  }
  return null;
}

/** Bytes held in full copies. */
export const versionsSize = (v: readonly VersionEntry[]) => v.reduce((n, e) => n + (e && "bytes" in e ? e.bytes.length : 0), 0);

/** What a version costs against the budget: copies only this list holds. */
const cost = (e: VersionEntry) => (e && "bytes" in e && !e.held ? e.bytes.length : 0);

/**
 * Adds the result of an edit made on version `shown`. Versions after `shown` (a redo branch) are
 * dropped. `appended` is the engine's own check that the old bytes are a prefix of the new ones.
 * Returns the list, the new version's index, and `floor`: versions below it were released to
 * stay within `budget`. `shown` itself is never released, so the edit can always be undone once,
 * even when that copy alone is over the budget.
 */
export function pushVersion(v: readonly VersionEntry[], shown: number, after: Uint8Array, appended: boolean, budget = VERSION_COPY_BUDGET): { versions: VersionEntry[]; index: number; floor: number } {
  const prev = versionBytes(v, shown);
  if (!prev) throw new Error(`version ${shown} was released`);
  const next = v.slice(0, shown + 1);
  // The copy that held `shown` may be in the dropped branch: keep `shown` as its own copy (earlier
  // length entries are prefixes of it, so they stay valid).
  const kept = next[shown];
  if (!(kept && "bytes" in kept)) next[shown] = { bytes: prev.slice() };
  if (appended && after.length >= prev.length) next[shown] = { length: prev.length };
  next.push({ bytes: after });
  let floor = next.findIndex((e) => e !== null);
  let total = next.reduce((n, e, i) => n + (i < next.length - 1 ? cost(e) : 0), 0);
  while (total > budget) {
    const k = next.findIndex((e, i) => i < shown && !!e && "bytes" in e);
    if (k < 0) break;
    total -= cost(next[k]);
    for (let i = 0; i <= k; i++) next[i] = null;
    floor = k + 1;
  }
  return { versions: next, index: next.length - 1, floor: Math.max(0, floor) };
}

/** Releases versions below `min` (no history state uses them any more). */
export function releaseBelow(v: readonly VersionEntry[], min: number): VersionEntry[] {
  if (!v.slice(0, min).some((e) => e !== null)) return v as VersionEntry[];
  // A length entry at or above `min` may point into a copy below it only if the copy came later,
  // which can't happen (copies are always newer than the entries that use them).
  return v.map((e, i) => (i < min ? null : e));
}
