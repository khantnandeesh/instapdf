import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createScanner, SCAN_OVERLAP, scanBlob, scanMarkers } from "./scan";

const fx = async (name: string) => new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));
const enc = (t: string) => new TextEncoder().encode(t);

describe("raw-byte markers for properties a merge cannot keep (PR #7 addendum C; one pass, chunked, in a worker)", () => {
  it("finds signatures, PDF/A output intents and structure trees", async () => {
    expect(scanMarkers(await fx("tagged-features.pdf"))).toEqual({ signed: true, outputIntents: false, structTree: true });
    expect(scanMarkers(await fx("alpha.pdf"))).toEqual({ signed: false, outputIntents: false, structTree: false });
    expect(scanMarkers(enc("<< /OutputIntents [] /SigFlags 3 >>"))).toEqual({ signed: true, outputIntents: true, structTree: false });
  });
  it("matches whole names only", () => {
    const b = enc("xx/ByteRangX /ByteRange ");
    expect(scanMarkers(b).signed).toBe(true);
    expect(scanMarkers(b.subarray(0, 14)).signed).toBe(false);
    // A longer name that starts with a marker is a different key.
    expect(scanMarkers(enc("/StructTreeRootX 1 /ByteRanges 2 /OutputIntentsList")).structTree).toBe(false);
    expect(scanMarkers(enc("/StructTreeRootX 1 /ByteRanges 2 /OutputIntentsList"))).toEqual({ signed: false, outputIntents: false, structTree: false });
    // Any delimiter ends a name, and so does the end of the file.
    expect(scanMarkers(enc("/StructTreeRoot[")).structTree).toBe(true);
    expect(scanMarkers(enc("/StructTreeRoot/x")).structTree).toBe(true);
    expect(scanMarkers(enc("<</StructTreeRoot")).structTree).toBe(true);
  });
  it("finds a name split across chunks when chunks overlap", () => {
    const b = enc(`${"x".repeat(100)}/StructTreeRoot ${"y".repeat(100)}`);
    const s = createScanner();
    const chunk = 105; // the name straddles the first boundary
    for (let start = 0; start < b.length; start += chunk) s.feed(b.subarray(Math.max(0, start - SCAN_OVERLAP), start + chunk), start + chunk >= b.length);
    expect(s.found.structTree).toBe(true);
  });
  it("leaves a name that ends exactly at a chunk boundary to the next chunk (which sees the byte after it)", () => {
    const s = createScanner();
    s.feed(enc("aa/StructTreeRoot")); // not final: the next byte could extend the name
    expect(s.found.structTree).toBe(false);
    s.feed(enc("a/StructTreeRootX"), true);
    expect(s.found.structTree).toBe(false);
  });
  it("scanBlob reads a file chunk by chunk and finds names at every boundary position", async () => {
    for (let pad = 0; pad < 40; pad++) {
      const text = `${"x".repeat(pad)}/ByteRange [0 1]/OutputIntents ${"z".repeat(pad)}/StructTreeRoot`;
      expect(await scanBlob(new Blob([enc(text)]), 16), `pad ${pad}`).toEqual({ signed: true, outputIntents: true, structTree: true });
      expect(await scanBlob(new Blob([enc(`${"x".repeat(pad)}/StructTreeRootX`)]), 16), `pad ${pad}`).toEqual({ signed: false, outputIntents: false, structTree: false });
    }
    expect(await scanBlob(new Blob([await fx("tagged-features.pdf")]), 64)).toEqual({ signed: true, outputIntents: false, structTree: true });
    expect(await scanBlob(new Blob([]))).toEqual({ signed: false, outputIntents: false, structTree: false });
  });
  it("is one fast pass over a large buffer", () => {
    const big = new Uint8Array(20 * 1024 * 1024).fill(0x2f); // worst case: every byte is a slash
    const t = performance.now();
    scanMarkers(big);
    expect(performance.now() - t).toBeLessThan(5000);
  });
});
