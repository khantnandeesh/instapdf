"use client";
/**
 * On-device storage for the editor (IndexedDB only; nothing is ever sent anywhere):
 * - sessions: the edit history of a file, keyed by the SHA-256 of its bytes (AC-45, AC-81)
 * - signatures: saved signatures and initials (AC-32, AC-87)
 * - images: the last 5 images used, for the Image tool's recent list (AC-66)
 * Every call fails soft: private modes without IndexedDB get `null`/`false`, and the editor says
 * "Not saved on device".
 */
import type { Asset } from "./build";
import { planRecentImage, planSignature, RECENT_IMAGES, type SessionPlan, type SessionRecord } from "./persist-plan";
import type { SigSource } from "./model";

const DB = "berrypdf-editor";
/** 2: sessions are a small record plus blobs (lib/editor/persist-plan). Version 1 records are dropped. 3: recent images. */
const VERSION = 3;

export type SavedSignature = { id: string; role: "signature" | "initials"; sig: SigSource; color: string; aspect: number; assets: Record<string, Asset>; at: number };

/** An image used on this device (the asset as placed: PNG or JPEG), keyed by the SHA-256 of its bytes. */
export type RecentImage = { id: string; bytes: Uint8Array; mime: Asset["mime"]; at: number };

type StoreName = "sessions" | "signatures" | "blobs" | "images";

let dbp: Promise<IDBDatabase> | null = null;
/** An open that never settles (another tab holds an older version open and won't let go) gives up after this. */
const OPEN_TIMEOUT_MS = 5000;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, VERSION);
    const timer = setTimeout(() => reject(new Error("indexedDB open timed out")), OPEN_TIMEOUT_MS);
    req.onupgradeneeded = (e) => {
      const d = req.result;
      if (e.oldVersion < 2 && d.objectStoreNames.contains("sessions")) d.deleteObjectStore("sessions");
      if (!d.objectStoreNames.contains("sessions")) d.createObjectStore("sessions", { keyPath: "hash" });
      if (!d.objectStoreNames.contains("signatures")) d.createObjectStore("signatures", { keyPath: "id" });
      if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs");
      if (!d.objectStoreNames.contains("images")) d.createObjectStore("images", { keyPath: "id" });
    };
    // Another tab has the store open at an older version: say so at once rather than wait (the
    // editor shows "Not saved on device"); the next call tries again.
    req.onblocked = () => {
      clearTimeout(timer);
      reject(new Error("indexedDB open blocked by another tab"));
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const d = req.result;
      // A newer version opening in another tab (this code, updated): close, so it can upgrade, and open again next time.
      d.onversionchange = () => {
        d.close();
        dbp = null;
      };
      resolve(d);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True if this device can keep sessions. */
export async function storageAvailable(): Promise<boolean> {
  try {
    await db();
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes a session plan in one transaction: new blobs, the record, and drops unused blobs. A failed
 * write changes nothing, so the last good record stays.
 *
 * "stale": a blob the record needs and this page thinks is stored isn't there any more. Another
 * tab with the same file swept it (its first write drops the file's blobs it doesn't know). The
 * write is abandoned before anything changes; the caller forgets what it wrote and writes in full.
 */
export async function writeSession(plan: SessionPlan): Promise<"ok" | "stale" | "failed"> {
  try {
    const d = await db();
    const putting = new Set(plan.put.map(([k]) => k));
    const needed = [...plan.record.blobs, ...Object.values(plan.record.assets)].filter((k) => !putting.has(k));
    let stale = false;
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(["sessions", "blobs"], "readwrite");
      const blobs = tx.objectStore("blobs");
      const write = () => {
        for (const [k, v] of plan.put) blobs.put(v, k);
        if (plan.sweep) {
          // Every blob of this file the record doesn't use goes (left by an earlier page).
          const keep = new Set(plan.record.blobs);
          const cur = blobs.openKeyCursor(IDBKeyRange.bound(`${plan.record.hash}/`, `${plan.record.hash}/\uffff`));
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c) return;
            if (!keep.has(String(c.key))) blobs.delete(c.key);
            c.continue();
          };
        }
        for (const k of plan.drop) blobs.delete(k);
        tx.objectStore("sessions").put(plan.record);
      };
      // Checked in the same transaction as the write, so no other tab can sweep in between.
      let left = needed.length;
      if (!left) write();
      for (const k of needed) {
        const req = blobs.getKey(k);
        req.onsuccess = () => {
          if (stale) return;
          if (req.result === undefined) {
            stale = true;
            tx.abort();
            return;
          }
          if (--left === 0) write();
        };
      }
      tx.oncomplete = () => resolve();
      // After our own abort, the requests still pending fail too: that is the stale case, not an error.
      tx.onerror = (e) => {
        if (stale) e.preventDefault();
        else reject(tx.error);
      };
      tx.onabort = () => (stale ? resolve() : reject(tx.error));
    });
    return stale ? "stale" : "ok";
  } catch {
    return "failed";
  }
}

export type LoadedSession = { record: SessionRecord; blobs: Map<string, Uint8Array>; assets: Record<string, Asset> };

export async function loadSession(hash: string): Promise<LoadedSession | null> {
  try {
    const record = (await run("sessions", "readonly", (st) => st.get(hash))) as SessionRecord | undefined;
    if (!record || record.v !== 2) return null;
    const blobs = new Map<string, Uint8Array>();
    const assets: Record<string, Asset> = {};
    for (const key of record.blobs) {
      const v = (await run("blobs", "readonly", (st) => st.get(key))) as Uint8Array | Asset | undefined;
      if (!v) return null;
      if (v instanceof Uint8Array) blobs.set(key, v);
    }
    for (const [id, key] of Object.entries(record.assets)) {
      const v = (await run("blobs", "readonly", (st) => st.get(key))) as Asset | undefined;
      if (!v) return null;
      assets[id] = v;
    }
    return { record, blobs, assets };
  } catch {
    return null;
  }
}

/** Deletes a session and its blobs. True when the device is known to hold nothing for it. */
export async function deleteSession(hash: string): Promise<boolean> {
  try {
    const record = (await run("sessions", "readonly", (st) => st.get(hash))) as SessionRecord | undefined;
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(["sessions", "blobs"], "readwrite");
      tx.objectStore("sessions").delete(hash);
      const blobs = tx.objectStore("blobs");
      blobs.delete(IDBKeyRange.bound(`${hash}/`, `${hash}/\uffff`));
      for (const k of record?.blobs ?? []) blobs.delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function listSignatures(): Promise<SavedSignature[]> {
  try {
    const all = (await run("signatures", "readonly", (st) => st.getAll())) as SavedSignature[];
    return all.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** Saves a signature: an identical saved one is reused, and each role keeps its newest 5 (AC-66). */
export async function saveSignature(s: SavedSignature): Promise<boolean> {
  try {
    const { put, drop } = planSignature(await listSignatures(), s);
    await run("signatures", "readwrite", (st) => st.put(put));
    for (const id of drop) await deleteSignature(id);
    return true;
  } catch {
    return false;
  }
}

export async function deleteSignature(id: string): Promise<void> {
  try {
    await run("signatures", "readwrite", (st) => st.delete(id));
  } catch {
    // nothing stored
  }
}

/** The recent images, newest first (AC-66). */
export async function listRecentImages(): Promise<RecentImage[]> {
  try {
    const all = (await run("images", "readonly", (st) => st.getAll())) as RecentImage[];
    return all.sort((a, b) => b.at - a.at).slice(0, RECENT_IMAGES);
  } catch {
    return [];
  }
}

/**
 * Puts an image first among the recent ones and drops the oldest beyond 5, in one transaction (a
 * reload or a second tab never leaves six). Returns the list as it now is.
 */
export async function rememberImage(asset: Asset): Promise<RecentImage[]> {
  try {
    const img: RecentImage = { id: await sha256(asset.bytes), bytes: asset.bytes, mime: asset.mime, at: Date.now() };
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction("images", "readwrite");
      const st = tx.objectStore("images");
      const req = st.getAll();
      req.onsuccess = () => {
        const { put, drop } = planRecentImage(req.result as RecentImage[], img);
        st.put(put);
        for (const id of drop) st.delete(id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // not kept: the image is still placed
  }
  return listRecentImages();
}

export async function forgetImage(id: string): Promise<void> {
  try {
    await run("images", "readwrite", (st) => st.delete(id));
  } catch {
    // nothing stored
  }
}

/** Clear from this device: every saved session, signature and recent image. */
export async function clearDevice(): Promise<void> {
  try {
    await run("sessions", "readwrite", (st) => st.clear());
    await run("signatures", "readwrite", (st) => st.clear());
    await run("images", "readwrite", (st) => st.clear());
    await run("blobs", "readwrite", (st) => st.clear());
  } catch {
    // nothing stored
  }
}
