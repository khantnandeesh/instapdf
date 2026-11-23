import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecent,
  parseRecent,
  readRecent,
  LEGACY_RECENT_KEY,
  RECENT_KEY,
  recentPrepaintScript,
  recordVisit,
  subscribeRecent,
  visibleRecent,
  withVisit,
} from "./recent-tools";

const usable = (s: string) => s === "rotate-pdf" || s === "crop-pdf";

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe("pure rules", () => {
  it("parses only arrays of strings", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("{oops")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent('["a",1]')).toEqual([]);
    expect(parseRecent('["a","b"]')).toEqual(["a", "b"]);
    // AC-44: well-formed JSON of the wrong shape, and empty values.
    for (const bad of ["", "null", "42", "true", '"rotate-pdf"', '["rotate-pdf",null]', '[["rotate-pdf"]]', "[1,2]"]) expect(parseRecent(bad), bad).toEqual([]);
    expect(parseRecent("[]")).toEqual([]);
  });

  it("moves a revisited tool to the front and keeps at most 12 (AC-46)", () => {
    const twelve = [...Array.from({ length: 11 }, (_, i) => `t${i}`), "rotate-pdf"];
    const next = withVisit(twelve, "rotate-pdf");
    expect(next).toHaveLength(12);
    expect(next[0]).toBe("rotate-pdf");
    expect(next.filter((s) => s === "rotate-pdf")).toHaveLength(1);
    expect(withVisit(Array.from({ length: 12 }, (_, i) => `t${i}`), "new")).toHaveLength(12);
  });

  it("skips unknown and planned slugs, dedupes and shows at most 6 (AC-43)", () => {
    expect(visibleRecent(["no-such-tool", "split-pdf", "rotate-pdf"], usable)).toEqual(["rotate-pdf"]);
    expect(visibleRecent(["rotate-pdf", "rotate-pdf", "crop-pdf"], usable)).toEqual(["rotate-pdf", "crop-pdf"]);
    expect(visibleRecent(Array.from({ length: 10 }, () => "x"), () => true)).toEqual(["x"]);
    expect(visibleRecent(Array.from({ length: 10 }, (_, i) => `t${i}`), () => true)).toHaveLength(6);
  });
});

describe("storage", () => {
  let store: MemoryStorage;
  beforeEach(() => {
    store = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: store, addEventListener: () => {}, removeEventListener: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("records visits newest first and notifies subscribers", () => {
    const cb = vi.fn();
    const off = subscribeRecent(cb);
    recordVisit("crop-pdf");
    recordVisit("rotate-pdf");
    expect(JSON.parse(store.getItem(RECENT_KEY)!)).toEqual(["rotate-pdf", "crop-pdf"]);
    expect(readRecent()).toEqual(["rotate-pdf", "crop-pdf"]);
    expect(readRecent()).toBe(readRecent()); // stable snapshot
    expect(cb).toHaveBeenCalledTimes(2);
    off();
  });

  it("overwrites a corrupt value on the next visit (AC-44)", () => {
    store.setItem(RECENT_KEY, "{oops");
    expect(readRecent()).toEqual([]);
    recordVisit("rotate-pdf");
    expect(JSON.parse(store.getItem(RECENT_KEY)!)).toEqual(["rotate-pdf"]);
  });

  it("moves a list saved under the old product key to the new key, transparently", () => {
    store.setItem(LEGACY_RECENT_KEY, '["crop-pdf","rotate-pdf"]');
    expect(readRecent()).toEqual(["crop-pdf", "rotate-pdf"]);
    expect(store.getItem(RECENT_KEY)).toBe('["crop-pdf","rotate-pdf"]');
    expect(store.getItem(LEGACY_RECENT_KEY)).toBeNull();
    recordVisit("merge-pdf");
    expect(JSON.parse(store.getItem(RECENT_KEY)!)).toEqual(["merge-pdf", "crop-pdf", "rotate-pdf"]);
    expect(store.getItem(LEGACY_RECENT_KEY)).toBeNull();
  });

  it("keeps the new key when both keys exist, and drops the old one", () => {
    store.setItem(RECENT_KEY, '["rotate-pdf"]');
    store.setItem(LEGACY_RECENT_KEY, '["crop-pdf"]');
    expect(readRecent()).toEqual(["rotate-pdf"]);
    expect(store.getItem(LEGACY_RECENT_KEY)).toBeNull();
  });

  it("still reads the old key when storage writes are blocked", () => {
    store.setItem(LEGACY_RECENT_KEY, '["rotate-pdf"]');
    store.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    store.removeItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(readRecent()).toEqual(["rotate-pdf"]);
  });

  it("clears the list (AC-47)", () => {
    recordVisit("rotate-pdf");
    clearRecent();
    expect(store.getItem(RECENT_KEY)).toBeNull();
    expect(readRecent()).toEqual([]);
  });

  it("clears both keys when a full storage stopped the migration (old key never comes back)", () => {
    store.setItem(LEGACY_RECENT_KEY, '["rotate-pdf"]');
    const realSet = store.setItem.bind(store);
    store.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(readRecent()).toEqual(["rotate-pdf"]); // migration failed, old key still read
    expect(store.getItem(LEGACY_RECENT_KEY)).toBe('["rotate-pdf"]');
    clearRecent();
    expect(store.getItem(RECENT_KEY)).toBeNull();
    expect(store.getItem(LEGACY_RECENT_KEY)).toBeNull();
    expect(readRecent()).toEqual([]);
    store.setItem = realSet;
    expect(readRecent()).toEqual([]);
  });

  it("survives writes that throw, e.g. quota exceeded (AC-45)", () => {
    store.setItem(RECENT_KEY, '["rotate-pdf"]');
    store.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    store.removeItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => recordVisit("crop-pdf")).not.toThrow();
    expect(() => clearRecent()).not.toThrow();
    expect(readRecent()).toEqual(["rotate-pdf"]);
  });

  it("survives a throwing localStorage (AC-45)", () => {
    const w = {};
    Object.defineProperty(w, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
    vi.stubGlobal("window", w);
    expect(readRecent()).toEqual([]);
    expect(() => recordVisit("rotate-pdf")).not.toThrow();
    expect(() => clearRecent()).not.toThrow();
  });
});

describe("pre-paint script (H-10)", () => {
  /** Runs the inline script against a fake document and storage; returns whether data-recent was set. */
  function run(stored: string | null, throwing = false) {
    let marked = false;
    const localStorage = throwing
      ? {
          getItem() {
            throw new Error("blocked");
          },
        }
      : { getItem: () => stored };
    const document = { documentElement: { setAttribute: () => (marked = true) } };
    new Function("localStorage", "document", recentPrepaintScript(["rotate-pdf"]))(localStorage, document);
    return marked;
  }

  it("agrees with visibleRecent on the AC-43/44/45 fixtures", () => {
    const cases: [string | null, boolean][] = [
      [null, false],
      ["{oops", false],
      ['["no-such-tool","split-pdf","rotate-pdf"]', true],
      ['["split-pdf"]', false],
      ['["rotate-pdf",1]', false],
    ];
    for (const [stored, expected] of cases) {
      expect(run(stored), String(stored)).toBe(expected);
      expect(visibleRecent(parseRecent(stored), (s) => s === "rotate-pdf").length > 0, String(stored)).toBe(expected);
    }
    expect(run(null, true)).toBe(false);
  });

  it("also reads a list still saved under the old product key", () => {
    let marked = false;
    const localStorage = { getItem: (k: string) => (k === LEGACY_RECENT_KEY ? '["rotate-pdf"]' : null) };
    const document = { documentElement: { setAttribute: () => (marked = true) } };
    new Function("localStorage", "document", recentPrepaintScript(["rotate-pdf"]))(localStorage, document);
    expect(marked).toBe(true);
  });
});
