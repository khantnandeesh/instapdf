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
 * The newest version is always a full copy.
 */
export type VersionEntry = { bytes: Uint8Array } | { length: number } | null;

/** Full copies kept for undo, besides the newest version. */
export const VERSION_COPY_BUDGET = 192 * 1024 * 1024;

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

export const initialVersions = (bytes: Uint8Array): VersionEntry[] => [{ bytes }];

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

/**
 * Adds the result of an edit made on version `shown`. Versions after `shown` (a redo branch) are
 * dropped. `appended` is the engine's own check that the old bytes are a prefix of the new ones.
 * Returns the list, the new version's index, and `floor`: versions below it were released to
 * stay within `budget`.
 */
export function pushVersion(v: readonly VersionEntry[], shown: number, after: Uint8Array, appended: boolean, budget = VERSION_COPY_BUDGET): { versions: VersionEntry[]; index: number; floor: number } {
  const prev = versionBytes(v, shown);
  if (!prev) throw new Error(`version ${shown} was released`);
  const next = v.slice(0, shown + 1);
  // The copy that held `shown` may be in the dropped branch: keep `shown` as its own copy (earlier
  // length entries are prefixes of it, so they stay valid).
  if (!(next[shown] && "bytes" in next[shown]!)) next[shown] = { bytes: prev.slice() };
  if (appended && after.length >= prev.length) next[shown] = { length: prev.length };
  next.push({ bytes: after });
  let floor = next.findIndex((e) => e !== null);
  let total = versionsSize(next) - after.length;
  while (total > budget) {
    const k = next.findIndex((e, i) => i < next.length - 1 && !!e && "bytes" in e);
    if (k < 0) break;
    total -= (next[k] as { bytes: Uint8Array }).bytes.length;
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
