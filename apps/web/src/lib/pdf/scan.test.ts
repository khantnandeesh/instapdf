import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createScanner, SCAN_OVERLAP, scanMarkers } from "./scan";

const fx = async (name: string) => new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));

describe("raw-byte markers for properties a merge cannot keep (PR #7 addendum C; one pass, chunked, in a worker)", () => {
  it("finds signatures, PDF/A output intents and structure trees", async () => {
    expect(scanMarkers(await fx("tagged-features.pdf"))).toEqual({ signed: true, outputIntents: false, structTree: true });
    expect(scanMarkers(await fx("alpha.pdf"))).toEqual({ signed: false, outputIntents: false, structTree: false });
  });
  it("matches whole names only", () => {
    const b = new TextEncoder().encode("xx/ByteRangX /ByteRange ");
    expect(scanMarkers(b).signed).toBe(true);
    expect(scanMarkers(b.subarray(0, 14)).signed).toBe(false);
  });
  it("finds a name split across chunks when chunks overlap", () => {
    const b = new TextEncoder().encode(`${"x".repeat(100)}/StructTreeRoot ${"y".repeat(100)}`);
    const s = createScanner();
    const chunk = 105; // the name straddles the first boundary
    for (let start = 0; start < b.length; start += chunk) s.feed(b.subarray(Math.max(0, start - SCAN_OVERLAP), start + chunk));
    expect(s.found.structTree).toBe(true);
  });
  it("is one fast pass over a large buffer", () => {
    const big = new Uint8Array(20 * 1024 * 1024).fill(0x2f); // worst case: every byte is a slash
    const t = performance.now();
    scanMarkers(big);
    expect(performance.now() - t).toBeLessThan(5000);
  });
});
