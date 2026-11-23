/**
 * Recently used tools, kept on this device only (spec F2 §3f).
 * localStorage["berrypdf:recent-tools"] = JSON array of slugs, newest first.
 * Lists saved under the product's old key ("instapdf:recent-tools") are moved to the new
 * key on first read, transparently, and the old key is removed.
 * Every storage access is wrapped: a corrupt value or a blocked/throwing
 * localStorage reads as an empty list and never raises.
 */

export const RECENT_KEY = "berrypdf:recent-tools";
/** The key used before the product was renamed; read once and migrated. */
export const LEGACY_RECENT_KEY = "instapdf:recent-tools";
export const RECENT_STORED_MAX = 12;
export const RECENT_SHOWN_MAX = 6;

/** Parses a stored value. Anything but an array of strings is treated as empty. */
export function parseRecent(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || !value.every((s) => typeof s === "string")) return [];
    return value as string[];
  } catch {
    return [];
  }
}

/** The list after a visit: the slug moves to the front, duplicates go, at most 12 are kept. */
export function withVisit(list: readonly string[], slug: string): string[] {
  return [slug, ...list.filter((s) => s !== slug)].slice(0, RECENT_STORED_MAX);
}

/** What the UI shows: known usable slugs only (unknown and planned are skipped), first 6. */
export function visibleRecent(list: readonly string[], isUsable: (slug: string) => boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    if (seen.has(s) || !isUsable(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length === RECENT_SHOWN_MAX) break;
  }
  return out;
}

// ---- storage -----------------------------------------------------------------

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Moves a list stored under the old key to the new one (the new key wins if both exist). */
export function migrateRecent(s: Storage) {
  const legacy = s.getItem(LEGACY_RECENT_KEY);
  if (legacy === null) return;
  if (s.getItem(RECENT_KEY) === null) s.setItem(RECENT_KEY, legacy);
  s.removeItem(LEGACY_RECENT_KEY);
}

function readRaw(): string | null {
  try {
    const s = storage();
    if (!s) return null;
    try {
      migrateRecent(s);
    } catch {
      // Blocked or full storage: fall back to whichever key is readable.
      return s.getItem(RECENT_KEY) ?? s.getItem(LEGACY_RECENT_KEY);
    }
    return s.getItem(RECENT_KEY);
  } catch {
    return null;
  }
}

function write(list: string[] | null) {
  const s = storage();
  if (s) {
    if (list === null) {
      // Clear removes both keys, each on its own: when the migration could not run (storage
      // full), the old key is still there and must not bring the list back after Clear.
      for (const key of [RECENT_KEY, LEGACY_RECENT_KEY]) {
        try {
          s.removeItem(key);
        } catch {
          // Blocked: nothing more we can do.
        }
      }
    } else {
      try {
        s.setItem(RECENT_KEY, JSON.stringify(list));
      } catch {
        // Storage full or blocked: recent tools are a convenience, so stay silent.
      }
    }
  }
  emit();
}

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

/** Subscribes to changes from this tab and (through the `storage` event) other tabs. */
export function subscribeRecent(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECENT_KEY || e.key === LEGACY_RECENT_KEY || e.key === null) cb();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

let cache: { raw: string | null; list: string[] } = { raw: null, list: [] };

/** The stored list. Returns the same array while the stored value is unchanged (useSyncExternalStore). */
export function readRecent(): string[] {
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, list: parseRecent(raw) };
  return cache.list;
}

const EMPTY: string[] = [];
export const serverRecent = () => EMPTY;

/** Records a visit to a usable tool page. Rewrites a corrupt stored value. */
export function recordVisit(slug: string) {
  write(withVisit(readRecent(), slug));
}

export function clearRecent() {
  write(null);
}

/**
 * Inline script for <head> (spec H-10): before first paint, marks <html data-recent>
 * when the store holds at least one usable slug, so the home page reserves the
 * Recent row's space and nothing shifts after hydration. Same rules as above.
 */
export function recentPrepaintScript(usableSlugs: readonly string[]): string {
  return `(function(){try{var u=${JSON.stringify(usableSlugs)};var v=JSON.parse(localStorage.getItem(${JSON.stringify(RECENT_KEY)})||localStorage.getItem(${JSON.stringify(
    LEGACY_RECENT_KEY,
  )})||"[]");if(Array.isArray(v)&&v.some(function(s){return typeof s==="string"&&u.indexOf(s)>=0})&&v.every(function(s){return typeof s==="string"}))document.documentElement.setAttribute("data-recent","")}catch(e){}})();`;
}
