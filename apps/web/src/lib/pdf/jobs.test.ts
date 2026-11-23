import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { runJob } from "./jobs";

const blob = async (name: string) => new Blob([new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)))]);
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const rotations = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);

describe("runJob rotate", () => {
  it("AC-41: returns one PDF that keeps the input name for one file", async () => {
    const progress: number[] = [];
    const out = await runJob(
      { kind: "rotate", zipName: "berrypdf-rotate.zip", files: [{ name: "three-pages.pdf", source: await blob("three-pages.pdf"), deltas: [90, 90, 90] }] },
      (v) => progress.push(v),
    );
    expect(out.name).toBe("three-pages.pdf");
    expect(out.type).toBe("application/pdf");
    expect(out.pageCount).toBe(3);
    expect(await rotations(await bytesOf(out.blob))).toEqual([90, 90, 90]);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
  });

  it("F1 G-2: progress advances per stage and page before a single file is done", async () => {
    const progress: number[] = [];
    await runJob(
      { kind: "rotate", zipName: "berrypdf-rotate.zip", files: [{ name: "sixty-pages.pdf", source: await blob("sixty-pages.pdf"), deltas: Array(60).fill(90) }] },
      (v) => progress.push(v),
    );
    const between = progress.filter((v) => v > 0 && v < 1);
    expect(between.length).toBeGreaterThanOrEqual(60); // at least one step per page
    expect(progress).toEqual([...progress].sort((a, b) => a - b)); // never goes back
    expect(Math.max(...between)).toBeLessThan(1);
    expect(progress.at(-1)).toBe(1);
  });

  it("F1 G-2: progress moves inside each file of a batch", async () => {
    const progress: number[] = [];
    await runJob(
      {
        kind: "rotate",
        zipName: "berrypdf-rotate.zip",
        files: [
          { name: "a.pdf", source: await blob("three-pages.pdf"), deltas: [90, 90, 90] },
          { name: "b.pdf", source: await blob("sixty-pages.pdf"), deltas: Array(60).fill(90) },
        ],
      },
      (v) => progress.push(v),
    );
    const firstFileShare = 3 / 63;
    expect(progress.some((v) => v > 0 && v < firstFileShare)).toBe(true);
    expect(progress.some((v) => v > firstFileShare && v < 1)).toBe(true);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("AC-42: returns a ZIP with one PDF per input for two files", async () => {
    const out = await runJob(
      {
        kind: "rotate",
        zipName: "berrypdf-rotate.zip",
        files: [
          { name: "three-pages.pdf", source: await blob("three-pages.pdf"), deltas: [90, 90, 90] },
          { name: "sixty-pages.pdf", source: await blob("sixty-pages.pdf"), deltas: Array(60).fill(180) },
        ],
      },
      () => {},
    );
    expect(out.name).toBe("berrypdf-rotate.zip");
    expect(out.type).toBe("application/zip");
    expect(out.entries).toEqual([
      { name: "three-pages.pdf", pageCount: 3 },
      { name: "sixty-pages.pdf", pageCount: 60 },
    ]);
    const files = unzipSync(await bytesOf(out.blob));
    expect(Object.keys(files)).toEqual(["three-pages.pdf", "sixty-pages.pdf"]);
    expect(await rotations(files["three-pages.pdf"])).toEqual([90, 90, 90]);
    expect(new Set(await rotations(files["sixty-pages.pdf"]))).toEqual(new Set([180]));
  });

  it("deduplicates entry names and flags encrypted inputs", async () => {
    const out = await runJob(
      {
        kind: "rotate",
        zipName: "berrypdf-rotate.zip",
        files: [
          { name: "doc.pdf", source: await blob("user-pw.pdf"), password: "test", deltas: [90] },
          { name: "doc.pdf", source: await blob("three-pages.pdf"), deltas: [] },
        ],
      },
      () => {},
    );
    expect(out.wasEncrypted).toBe(true);
    expect(out.entries?.map((e) => e.name)).toEqual(["doc.pdf", "doc (2).pdf"]);
    expect(Object.keys(unzipSync(await bytesOf(out.blob)))).toEqual(["doc.pdf", "doc (2).pdf"]);
  });
});
