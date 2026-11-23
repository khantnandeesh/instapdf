import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { runJob } from "./jobs";

const buf = async (name: string) => {
  const b = await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const rotations = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);

describe("runJob rotate", () => {
  it("returns one PDF that keeps the input name for one file (AC-41)", async () => {
    const progress: number[] = [];
    const out = await runJob(
      { kind: "rotate", zipName: "instapdf-rotate.zip", files: [{ name: "three-pages.pdf", buffer: await buf("three-pages.pdf"), deltas: [90, 90, 90] }] },
      (v) => progress.push(v),
    );
    expect(out.name).toBe("three-pages.pdf");
    expect(out.type).toBe("application/pdf");
    expect(out.pageCount).toBe(3);
    expect(await rotations(out.bytes)).toEqual([90, 90, 90]);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
  });

  it("returns a ZIP with one PDF per input for two files (AC-42)", async () => {
    const out = await runJob(
      {
        kind: "rotate",
        zipName: "instapdf-rotate.zip",
        files: [
          { name: "three-pages.pdf", buffer: await buf("three-pages.pdf"), deltas: [90, 90, 90] },
          { name: "sixty-pages.pdf", buffer: await buf("sixty-pages.pdf"), deltas: Array(60).fill(180) },
        ],
      },
      () => {},
    );
    expect(out.name).toBe("instapdf-rotate.zip");
    expect(out.type).toBe("application/zip");
    expect(out.entries).toEqual([
      { name: "three-pages.pdf", pageCount: 3 },
      { name: "sixty-pages.pdf", pageCount: 60 },
    ]);
    const files = unzipSync(out.bytes);
    expect(Object.keys(files)).toEqual(["three-pages.pdf", "sixty-pages.pdf"]);
    expect(await rotations(files["three-pages.pdf"])).toEqual([90, 90, 90]);
    expect(new Set(await rotations(files["sixty-pages.pdf"]))).toEqual(new Set([180]));
  });

  it("deduplicates entry names and flags encrypted inputs", async () => {
    const out = await runJob(
      {
        kind: "rotate",
        zipName: "instapdf-rotate.zip",
        files: [
          { name: "doc.pdf", buffer: await buf("user-pw.pdf"), password: "test", deltas: [90] },
          { name: "doc.pdf", buffer: await buf("three-pages.pdf"), deltas: [] },
        ],
      },
      () => {},
    );
    expect(out.wasEncrypted).toBe(true);
    expect(out.entries?.map((e) => e.name)).toEqual(["doc.pdf", "doc (2).pdf"]);
    expect(Object.keys(unzipSync(out.bytes))).toEqual(["doc.pdf", "doc (2).pdf"]);
  });
});
