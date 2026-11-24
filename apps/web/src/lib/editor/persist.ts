"use client";
/**
 * On-device storage for the editor (IndexedDB only; nothing is ever sent anywhere):
 * - sessions: the edit history of a file, keyed by the SHA-256 of its bytes (AC-45, AC-81)
 * - signatures: saved signatures and initials (AC-32, AC-87)
 * Every call fails soft: private modes without IndexedDB get `null`/`false`, and the editor says
 * "Not saved on device".
 */
import type { Asset } from "./build";
import type { History } from "./history";
import type { SigSource } from "./model";

const DB = "berrypdf-editor";
const VERSION = 1;

export type SavedSession = {
  hash: string;
  name: string;
  savedAt: number;
  history: History;
  assets: Record<string, Asset>;
  /** Engine byte versions after the original (index 0 is the original and is not stored). */
  engineVersions: Uint8Array[];
};

export type SavedSignature = { id: string; role: "signature" | "initials"; sig: SigSource; color: string; aspect: number; assets: Record<string, Asset>; at: number };

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("sessions")) d.createObjectStore("sessions", { keyPath: "hash" });
      if (!d.objectStoreNames.contains("signatures")) d.createObjectStore("signatures", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}

function run<T>(store: "sessions" | "signatures", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
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

export async function saveSession(s: SavedSession): Promise<boolean> {
  try {
    await run("sessions", "readwrite", (st) => st.put(s));
    return true;
  } catch {
    return false;
  }
}

export async function loadSession(hash: string): Promise<SavedSession | null> {
  try {
    return ((await run("sessions", "readonly", (st) => st.get(hash))) as SavedSession | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deleteSession(hash: string): Promise<void> {
  try {
    await run("sessions", "readwrite", (st) => st.delete(hash));
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

export async function saveSignature(s: SavedSignature): Promise<boolean> {
  try {
    await run("signatures", "readwrite", (st) => st.put(s));
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
  } catch {
    // nothing stored
  }
}
