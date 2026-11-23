import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { hasBytes, scanMarkers } from "./inspect";

const fx = async (name: string) => new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));

describe("raw-byte markers for properties a merge cannot keep (PR #7 addendum C)", () => {
  it("finds signatures, PDF/A output intents and structure trees", async () => {
    expect(scanMarkers(await fx("tagged-features.pdf"))).toEqual({ signed: true, outputIntents: false, structTree: true });
    expect(scanMarkers(await fx("alpha.pdf"))).toEqual({ signed: false, outputIntents: false, structTree: false });
  });
  it("matches whole needles only", () => {
    const b = new TextEncoder().encode("xx/ByteRangX /ByteRange");
    expect(hasBytes(b, "/ByteRange")).toBe(true);
    expect(hasBytes(b.subarray(0, 14), "/ByteRange")).toBe(false);
  });
});
