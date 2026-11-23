import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createZipWriter } from "./zip";

describe("createZipWriter", () => {
  it("streams stored entries into a ZIP Blob in order (AC-42)", async () => {
    const zip = createZipWriter();
    zip.add("three-pages.pdf", new Uint8Array([1, 2, 3]));
    zip.add("three-pages (2).pdf", new Uint8Array([4, 5]));
    const blob = zip.finish();
    expect(blob.type).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual(["three-pages.pdf", "three-pages (2).pdf"]);
    expect(Array.from(files["three-pages.pdf"])).toEqual([1, 2, 3]);
    expect(Array.from(files["three-pages (2).pdf"])).toEqual([4, 5]);
  });

  it("writes an empty but valid archive when nothing is added", async () => {
    const blob = createZipWriter().finish();
    expect(unzipSync(new Uint8Array(await blob.arrayBuffer()))).toEqual({});
  });
});
