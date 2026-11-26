import { describe, expect, it } from "vitest";
import { Zip, ZipDeflate } from "fflate";
import { createZipWriter } from "./zip";
import { entryBlob, storedZipEntries } from "./zip-entries";

const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 0xff);

describe("storedZipEntries", () => {
  it("slices every entry of our ZIPs back out, byte for byte", async () => {
    const zip = createZipWriter();
    const files = [
      { name: "twelve-1-4.pdf", data: bytes(5000, 1) },
      { name: "résumé 日本.pdf", data: bytes(17, 2) },
      { name: "empty.pdf", data: new Uint8Array(0) },
    ];
    for (const f of files) zip.add(f.name, f.data);
    const blob = zip.finish();
    const entries = await storedZipEntries(blob);
    expect(entries?.map((e) => e.name)).toEqual(files.map((f) => f.name));
    for (const [i, e] of entries!.entries()) {
      const part = entryBlob(blob, e);
      expect(part.type).toBe("application/pdf");
      expect(new Uint8Array(await part.arrayBuffer())).toEqual(files[i].data);
    }
  });
  it("gives up on what it can't slice", async () => {
    expect(await storedZipEntries(new Blob([bytes(100, 3)]))).toBeNull();
    const chunks: Uint8Array[] = [];
    const z = new Zip((_, c) => chunks.push(c));
    const d = new ZipDeflate("a.pdf");
    z.add(d);
    d.push(bytes(400, 4), true);
    z.end();
    expect(await storedZipEntries(new Blob(chunks as BlobPart[]))).toBeNull();
  });
});
