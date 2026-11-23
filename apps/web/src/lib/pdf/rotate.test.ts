import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { rotatePdf } from "./rotate";
import { rotatePage, rotateScope } from "./rotation";

const fixture = async (name: string) => new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));

/** Reads the output with an independent library (upstream pdf-lib, which cannot decrypt). */
async function rotations(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => p.getRotation().angle);
}

async function pageTexts(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((it) => ("str" in it ? it.str : "")).join(""));
  }
  await task.destroy();
  return out;
}

describe("rotatePdf", () => {
  it("AC-30, AC-40: rotates every page right and keeps order and text", async () => {
    const input = await fixture("three-pages.pdf");
    const out = await rotatePdf({ bytes: input, deltas: rotateScope([], 3, "all", 90) });
    expect(out.pageCount).toBe(3);
    expect(out.wasEncrypted).toBe(false);
    expect(await rotations(out.bytes)).toEqual([90, 90, 90]);
    expect(await pageTexts(out.bytes)).toEqual(["Page 1", "Page 2", "Page 3"]);
    expect(out.bytes.length).toBeLessThanOrEqual(input.length * 1.1 + 10_240);
  });

  it("AC-31: rotates left to 270", async () => {
    const out = await rotatePdf({ bytes: await fixture("three-pages.pdf"), deltas: [-90, -90, -90] });
    expect(await rotations(out.bytes)).toEqual([270, 270, 270]);
  });

  it("AC-32: rotates a single page", async () => {
    const out = await rotatePdf({ bytes: await fixture("three-pages.pdf"), deltas: rotatePage([], 3, 1, 90) });
    expect(await rotations(out.bytes)).toEqual([0, 90, 0]);
  });

  it("AC-35: returns the input rotations when nothing is pending", async () => {
    const out = await rotatePdf({ bytes: await fixture("pre-rotated.pdf"), deltas: [360, 0, -360] });
    expect(await rotations(out.bytes)).toEqual([0, 90, 0]);
  });

  it("AC-36: adds to an existing rotation", async () => {
    const out = await rotatePdf({ bytes: await fixture("pre-rotated.pdf"), deltas: [90, 90, 90] });
    expect(await rotations(out.bytes)).toEqual([90, 180, 90]);
  });

  it("AC-53: rotates all 60 pages", async () => {
    const out = await rotatePdf({ bytes: await fixture("sixty-pages.pdf"), deltas: rotateScope([], 60, "all", 90) });
    const r = await rotations(out.bytes);
    expect(r).toHaveLength(60);
    expect(new Set(r)).toEqual(new Set([90]));
  });

  it("AC-23: decrypts a user-password file and saves it without a password", async () => {
    const out = await rotatePdf({ bytes: await fixture("user-pw.pdf"), deltas: [90, 90, 90], password: "test" });
    expect(out.wasEncrypted).toBe(true);
    // Upstream pdf-lib throws on encrypted input, so loading proves the output is unencrypted.
    expect(await rotations(out.bytes)).toEqual([90, 90, 90]);
    expect(await pageTexts(out.bytes)).toEqual(["Page 1", "Page 2", "Page 3"]);
  });

  it("fails on a wrong password", async () => {
    await expect(rotatePdf({ bytes: await fixture("user-pw.pdf"), deltas: [90], password: "nope" })).rejects.toThrow();
  });

  it("AC-28: opens an owner-restricted file without a password", async () => {
    const out = await rotatePdf({ bytes: await fixture("owner-restricted.pdf"), deltas: [90, 90, 90] });
    expect(out.wasEncrypted).toBe(true);
    expect(await rotations(out.bytes)).toEqual([90, 90, 90]);
  });

  it("AC-13: throws on a corrupt file", async () => {
    await expect(rotatePdf({ bytes: await fixture("corrupt.pdf"), deltas: [] })).rejects.toThrow();
    await expect(rotatePdf({ bytes: await fixture("empty.pdf"), deltas: [] })).rejects.toThrow();
  });
});
