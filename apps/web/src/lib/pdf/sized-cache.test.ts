import { describe, expect, it } from "vitest";
import { createSizedCache } from "./sized-cache";

describe("size-bounded LRU cache (TIFF worker, PR #7 review)", () => {
  it("drops the least recently used entries once the total size is over the limit", () => {
    const c = createSizedCache<string>(100);
    c.set("a", 40, "A");
    c.set("b", 40, "B");
    expect(c.get("a")).toBe("A"); // a is now the most recent
    c.set("c", 40, "C");
    expect(c.keys()).toEqual(["a", "c"]);
    expect(c.bytes).toBe(80);
  });
  it("keeps one entry even when it alone is over the limit", () => {
    const c = createSizedCache<number>(10);
    c.set("small", 5, 1);
    c.set("huge", 500, 2);
    expect(c.keys()).toEqual(["huge"]);
    expect(c.get("huge")).toBe(2);
  });
  it("replacing or deleting a key keeps the byte count right", () => {
    const c = createSizedCache<number>(100);
    c.set("a", 30, 1);
    c.set("a", 50, 2);
    expect(c.bytes).toBe(50);
    c.delete("a");
    c.delete("missing");
    expect(c.bytes).toBe(0);
    expect(c.size).toBe(0);
  });
  it("is not bounded by entry count: many small files fit", () => {
    const c = createSizedCache<number>(1000);
    for (let i = 0; i < 50; i++) c.set(`f${i}`, 10, i);
    expect(c.size).toBe(50);
  });
});
