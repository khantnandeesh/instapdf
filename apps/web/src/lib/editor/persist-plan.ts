/**
 * What to write to the device store, worked out without touching IndexedDB. Pure, unit tested.
 *
 * A saved session is a small record (the last steps of history, version lengths, asset ids) plus
 * blobs (full byte copies of engine versions, images) under their own keys. Each autosave writes
 * the record and only the blobs it has not written yet, and deletes the ones nothing refers to,
 * so a long session never rewrites the whole file. The total is capped: older steps are left out
 * until it fits.
 */
import type { Asset } from "./build";
import { minEngine, tail, type History } from "./history";
import type { EditorObject, SigSource } from "./model";
import type { VersionEntry } from "./versions";

/** Steps of history kept on the device. */
export const SAVED_STEPS = 50;
/** Blobs kept for one file. */
export const SESSION_BYTE_CAP = 96 * 1024 * 1024;

/** Per version: the opened file itself, a length into the next copy, or a blob key. */
export type SavedVersion = null | { original: true } | { length: number } | { blob: string };

export type SessionRecord = {
  v: 2;
  hash: string;
  name: string;
  savedAt: number;
  history: History;
  versions: SavedVersion[];
  /** Blob key per asset id. */
  assets: Record<string, string>;
  /** Every blob key this record uses. */
  blobs: string[];
};

export type SessionPlan = { record: SessionRecord; put: [string, Uint8Array | Asset][]; drop: string[]; size: number };

/** Asset ids the objects of these states use. */
export function assetIds(h: History): Set<string> {
  const ids = new Set<string>();
  const add = (o: EditorObject) => {
    if (o.kind === "image") ids.add(o.asset);
    if (o.kind === "signature" && o.sig.type === "image") ids.add(o.sig.asset);
  };
  for (const s of h.states) s.objects.forEach(add);
  return ids;
}

/**
 * The record and blob writes for a session, or null when even the last step doesn't fit the cap.
 * `keyOf` names a byte array stably (the same copy always gets the same key).
 */
export function planSession(input: {
  hash: string;
  name: string;
  history: History;
  versions: readonly VersionEntry[];
  assets: Record<string, Asset>;
  written: ReadonlySet<string>;
  keyOf: (bytes: Uint8Array) => string;
  now?: number;
  cap?: number;
  steps?: number;
}): SessionPlan | null {
  const cap = input.cap ?? SESSION_BYTE_CAP;
  for (let steps = input.steps ?? SAVED_STEPS; steps >= 0; steps = steps > 8 ? Math.floor(steps / 2) : steps - 1) {
    const h = tail(input.history, steps);
    const plan = planFor(input, h);
    if (plan && plan.size <= cap) return plan;
  }
  return null;
}

function planFor(input: Parameters<typeof planSession>[0], h: History): SessionPlan | null {
  const lo = minEngine(h);
  const hi = h.states.reduce((m, s) => Math.max(m, s.engine), 0);
  const versions: SavedVersion[] = input.versions.map(() => null);
  const blobs = new Map<string, Uint8Array | Asset>();
  const need = new Set<number>();
  for (let i = lo; i <= hi; i++) {
    need.add(i);
    // A length entry reads from the next full copy.
    if (input.versions[i] && "length" in input.versions[i]!) {
      const j = input.versions.findIndex((e, k) => k > i && !!e && "bytes" in e);
      if (j < 0) return null;
      need.add(j);
    }
  }
  for (const i of need) {
    const e = input.versions[i];
    if (!e) return null;
    if ("length" in e) versions[i] = { length: e.length };
    else if (i === 0) versions[i] = { original: true };
    else {
      const key = `${input.hash}/v/${input.keyOf(e.bytes)}`;
      versions[i] = { blob: key };
      blobs.set(key, e.bytes);
    }
  }
  const assets: Record<string, string> = {};
  for (const id of assetIds(h)) {
    const a = input.assets[id];
    if (!a) continue;
    const key = `${input.hash}/a/${id}`;
    assets[id] = key;
    blobs.set(key, a);
  }
  let size = 0;
  for (const b of blobs.values()) size += b instanceof Uint8Array ? b.length : b.bytes.length;
  const record: SessionRecord = { v: 2, hash: input.hash, name: input.name, savedAt: input.now ?? Date.now(), history: h, versions, assets, blobs: [...blobs.keys()] };
  return {
    record,
    put: [...blobs].filter(([k]) => !input.written.has(k)),
    drop: [...input.written].filter((k) => !blobs.has(k)),
    size,
  };
}

/** Rebuilds the versions list from a record and its blobs (`original` is the reopened file). */
export function restoreVersions(rec: SessionRecord, original: Uint8Array, blobs: Map<string, Uint8Array>): VersionEntry[] | null {
  const out: VersionEntry[] = [];
  for (const v of rec.versions) {
    if (!v) out.push(null);
    else if ("original" in v) out.push({ bytes: original });
    else if ("length" in v) out.push({ length: v.length });
    else {
      const b = blobs.get(v.blob);
      if (!b) return null;
      out.push({ bytes: b });
    }
  }
  return out;
}

// ---- saved signatures (AC-32, AC-66) ----

export const SIGNATURES_PER_ROLE = 5;
export type SignatureLike = { id: string; role: "signature" | "initials"; sig: SigSource; color: string; at: number };

const same = (a: SignatureLike, b: SignatureLike) => a.role === b.role && a.color === b.color && JSON.stringify(a.sig) === JSON.stringify(b.sig);

/**
 * Saving `s` among `all`: an identical saved one is reused (only its time changes), and each role
 * keeps its newest 5. Returns what to write and which ids to delete.
 */
export function planSignature<T extends SignatureLike>(all: readonly T[], s: T): { put: T; drop: string[] } {
  const twin = all.find((x) => same(x, s));
  const put = twin ? { ...twin, at: s.at } : s;
  const rest = all.filter((x) => x.id !== put.id && x.role === s.role).sort((a, b) => b.at - a.at);
  return { put, drop: rest.slice(SIGNATURES_PER_ROLE - 1).map((x) => x.id) };
}
