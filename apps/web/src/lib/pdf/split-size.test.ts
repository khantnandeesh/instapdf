import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { measureWith, partsBySize, type Measure } from "./split-size";

/** Pages of the given sizes; a file costs 10 plus its pages. */
const sizes = (pages: number[]): Measure & { calls: number } => {
  const m = (async (s: number, e: number) => {
    m.calls++;
    return 10 + pages.slice(s, e).reduce((a, b) => a + b, 0);
  }) as Measure & { calls: number };
  m.calls = 0;
  return m;
};

describe("partsBySize", () => {
  it("fills each part as far as the limit allows", async () => {
    const r = await partsBySize(6, 110, sizes([40, 40, 40, 40, 40, 40]));
    expect(r.parts).toEqual([[0, 1], [2, 3], [4, 5]]);
    expect(r.oversize).toEqual([]);
  });
  it("is one part when everything fits", async () => {
    expect((await partsBySize(5, 1000, sizes([1, 2, 3, 4, 5]))).parts).toEqual([[0, 1, 2, 3, 4]]);
  });
  it("gives a page that is too big a part of its own and says which", async () => {
    const r = await partsBySize(4, 100, sizes([30, 500, 30, 30]));
    expect(r.parts).toEqual([[0], [1], [2, 3]]);
    expect(r.oversize).toEqual([1]);
  });
  it("handles uneven pages and exact fits", async () => {
    const r = await partsBySize(7, 100, sizes([90, 10, 80, 5, 5, 60, 30]));
    expect(r.parts).toEqual([[0], [1, 2], [3, 4, 5], [6]]);
  });
  it("finds a long part in few measurements, whatever the guess", async () => {
    const pages = Array.from({ length: 1000 }, () => 1);
    for (const guess of [1, 300, 5000]) {
      const m = sizes(pages);
      const r = await partsBySize(1000, 510, m, guess);
      expect(r.parts.map((p) => p.length)).toEqual([500, 500]);
      expect(m.calls).toBeLessThan(60);
    }
  });
  it("reports progress up to 1", async () => {
    const seen: number[] = [];
    await partsBySize(4, 60, sizes([40, 40, 40, 40]), 1, (f) => seen.push(f));
    expect(seen).toEqual([0.25, 0.5, 0.75, 1]);
  });
});

describe("measureWith", () => {
  it("gives the saved size of a run of pages, and more pages are bigger", async () => {
    const doc = await PDFDocument.load(await readFile(new URL("../../../tests/fixtures/twelve.pdf", import.meta.url)));
    const measure = measureWith(doc);
    const one = await measure(0, 1);
    const all = await measure(0, 12);
    expect(one).toBeGreaterThan(300);
    expect(all).toBeGreaterThan(one);
    const out = await PDFDocument.create();
    (await out.copyPages(doc, [0])).forEach((p) => out.addPage(p));
    expect(Math.abs((await out.save()).length - one)).toBeLessThan(200);
  });
});

describe("split by size job", () => {
  const file = async (name: string) => {
    const bytes = await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url));
    const pageCount = (await PDFDocument.load(bytes)).getPageCount();
    return { id: "a", name, source: new Blob([bytes], { type: "application/pdf" }), pageCount };
  };
  it("AC-914: pages too big on their own are named in the result", async () => {
    const { runJob } = await import("./jobs");
    const out = await runJob({ kind: "splitSize", limit: 300, files: [await file("three-pages.pdf")] }, () => {});
    expect(out.type).toBe("application/zip");
    expect(out.entries).toHaveLength(3);
    expect(out.warnings?.[0]).toBe("Pages 1, 2, 3 of three-pages.pdf are each over the limit alone, so their files are too.");
  });
  it("AC-912: a file under the limit stays one file with its own name", async () => {
    const { runJob } = await import("./jobs");
    const out = await runJob({ kind: "splitSize", limit: 5_000_000, files: [await file("twelve.pdf")] }, () => {});
    expect(out).toMatchObject({ name: "twelve.pdf", type: "application/pdf", pageCount: 12 });
    expect(out.warnings).toEqual(["twelve.pdf is already under the limit, so it stays one file."]);
  });

  it("AC-910: parts stay under the limit even when the written files carry shared form resources", async () => {
    const { runJob } = await import("./jobs");
    const { unzipSync } = await import("fflate");
    // 40 pages of 20 KB each, a text field on each, and a 150 KB resource every written part must carry.
    const doc = await PDFDocument.create();
    const noise = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (Math.imul(i + seed, 2654435761) >>> 13) & 255);
    const form = doc.getForm();
    for (let i = 0; i < 40; i++) {
      const page = doc.addPage([300, 200]);
      const image = doc.context.register(doc.context.stream(noise(100 * 67 * 3, i * 7919), { Type: "XObject", Subtype: "Image", Width: 100, Height: 67, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }));
      page.node.set(PDFName.of("Resources"), doc.context.obj({ XObject: { Im: image } }));
      page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("q 100 0 0 67 10 10 cm /Im Do Q")));
      form.createTextField(`f${i}`).addToPage(page, { x: 150, y: 100, width: 100, height: 20 });
    }
    const big = doc.context.register(doc.context.stream(noise(150_000, 1), { Type: "Font" }));
    form.acroForm.dict.set(PDFName.of("DR"), doc.context.obj({ Font: { Big: big } }));
    const bytes = await doc.save();
    const limit = 400_000;
    const out = await runJob({ kind: "splitSize", limit, files: [{ id: "a", name: "form.pdf", source: new Blob([bytes as Uint8Array<ArrayBuffer>]), pageCount: 40 }] }, () => {});
    const parts = Object.values(unzipSync(new Uint8Array(await out.blob.arrayBuffer())));
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(limit);
    expect(out.entries?.reduce((n, e) => n + e.pageCount, 0)).toBe(40);
    expect(out.warnings ?? []).toEqual([]);
  }, 60_000);
});
