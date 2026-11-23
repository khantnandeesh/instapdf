import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip } from "./zip";

describe("buildZip", () => {
  it("stores entries under unique names (AC-42)", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const zip = buildZip([
      { name: "three-pages.pdf", bytes: a },
      { name: "three-pages.pdf", bytes: b },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual(["three-pages.pdf", "three-pages (2).pdf"]);
    expect(Array.from(files["three-pages.pdf"])).toEqual([1, 2, 3]);
    expect(Array.from(files["three-pages (2).pdf"])).toEqual([4, 5]);
  });
});
