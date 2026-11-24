"use client";
/**
 * On-device storage for the editor (IndexedDB only; nothing is ever sent anywhere):
 * - sessions: the edit history of a file, keyed by the SHA-256 of its bytes (AC-45, AC-81)
 * - signatures: saved signatures and initials (AC-32, AC-87)
 * Every call fails soft: private modes without IndexedDB get `null`/`false`, and the editor says
 * "Not saved on device".
 */
import type { Asset } from "./build";
import { planSignature, type SessionPlan, type SessionRecord } from "./persist-plan";
import type { SigSource } from "./model";

const DB = "berrypdf-editor";
/** 2: sessions are a small record plus blobs (lib/editor/persist-plan). Version 1 records are dropped. */
const VERSION = 2;

export type SavedSignature = { id: string; role: "signature" | "initials"; sig: SigSource; color: string; aspect: number; assets: Record<string, Asset>; at: number };

type StoreName = "sessions" | "signatures" | "blobs";

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = (e) => {
      const d = req.result;
      if (e.oldVersion < 2 && d.objectStoreNames.contains("sessions")) d.deleteObjectStore("sessions");
      if (!d.objectStoreNames.contains("sessions")) d.createObjectStore("sessions", { keyPath: "hash" });
      if (!d.objectStoreNames.contains("signatures")) d.createObjectStore("signatures", { keyPath: "id" });
      if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

/** Writes a session plan in one transaction: new blobs, the record, and drops unused blobs. */
export async function writeSession(plan: SessionPlan): Promise<boolean> {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(["sessions", "blobs"], "readwrite");
      const blobs = tx.objectStore("blobs");
      for (const [k, v] of plan.put) blobs.put(v, k);
      for (const k of plan.drop) blobs.delete(k);
      tx.objectStore("sessions").put(plan.record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
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

/** Deletes a session and its blobs. */
export async function deleteSession(hash: string): Promise<void> {
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
  } catch {
    // nothing stored
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

/** Clear from this device: every saved session and signature. */
export async function clearDevice(): Promise<void> {
  try {
    await run("sessions", "readwrite", (st) => st.clear());
    await run("signatures", "readwrite", (st) => st.clear());
    await run("blobs", "readwrite", (st) => st.clear());
  } catch {
    // nothing stored
  }
}
