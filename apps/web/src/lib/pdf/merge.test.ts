import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultMergeOptions, type MergeOptions } from "./merge-options";
import { mergePdf, type MergeInput, type MergePageInput, type MergeSourceInput } from "./merge";
import type { FontManifest, FontSource } from "./text";

const fixtures = new URL("../../../tests/fixtures/", import.meta.url);
const blob = async (name: string) => new Blob([new Uint8Array(await readFile(new URL(name, fixtures)))]);

const PAGES: Record<string, number> = { "alpha.pdf": 3, "bravo.pdf": 2, "echo.pdf": 1, "three-pages.pdf": 3, "form-a.pdf": 1, "form-b.pdf": 1, "pre-rotated.pdf": 3, "résumé-日本.pdf": 1, "sixty-pages.pdf": 60, "user-pw.pdf": 3, "charlie.png": 1, "delta.jpg": 1, "fox.tiff": 2, "sig-no-ap.pdf": 1, "indirect-box.pdf": 1, "lang-labels.pdf": 3, "tagged-features.pdf": 1, "lang-bad.pdf": 1 };

async function source(name: string, id = name, password?: string): Promise<MergeSourceInput> {
  return { id, name, kind: /\.(png|jpe?g|tiff?)$/.test(name) ? "image" : "pdf", source: await blob(name), password };
}

/** Every page of each file in order, like a fresh files view. */
const allPages = (...names: string[]): MergePageInput[] => names.flatMap((n) => Array.from({ length: PAGES[n] }, (_, i) => ({ sourceId: n, sourceIndex: i, rotation: 0 })));
const p = (sourceId: string, i: number, rotation = 0): MergePageInput => ({ sourceId, sourceIndex: i, rotation });

let fonts: FontSource;
beforeAll(() => {
  const dir = new URL("../../../public/fonts/noto/", import.meta.url);
  if (!existsSync(new URL("manifest.json", dir))) execFileSync("node", [new URL("../../../scripts/copy-fonts.mjs", import.meta.url).pathname]);
  fonts = {
    manifest: async () => JSON.parse(await readFile(new URL("manifest.json", dir), "utf8")) as FontManifest,
    load: async (file) => new Uint8Array(await readFile(new URL(file, dir))),
  };
});

async function merge(names: string[], opts: Partial<MergeOptions> = {}, pages?: MergePageInput[], extra: { passwords?: Record<string, string> } = {}) {
  const sources = await Promise.all([...new Set(names)].map((n) => source(n, n, extra.passwords?.[n])));
  const input: MergeInput = { sources, pages: pages ?? allPages(...names), options: { ...defaultMergeOptions, ...opts } };
  const progress: number[] = [];
  const r = await mergePdf(input, { fonts }, (f) => progress.push(f));
  return { ...r, progress };
}

async function pdfjs(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
}

async function texts(bytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjs(bytes);
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(c.items.map((it) => ("str" in it ? it.str : "")).join(""));
  }
  await doc.loadingTask.destroy();
  return out;
}

type Mark = { title: string; page: number; children: Mark[] };
async function outline(bytes: Uint8Array): Promise<Mark[]> {
  const doc = await pdfjs(bytes);
  const items = (await doc.getOutline()) ?? [];
  const map = async (list: typeof items): Promise<Mark[]> =>
    Promise.all(list.map(async (it) => ({ title: it.title, page: 1 + (await doc.getPageIndex((it.dest as unknown[])[0] as never)), children: await map(it.items) })));
  const out = await map(items);
  await doc.loadingTask.destroy();
  return out;
}

const plain = (bytes: Uint8Array) => PDFDocument.load(bytes, { updateMetadata: false });
const sizes = async (bytes: Uint8Array) => (await plain(bytes)).getPages().map((pg) => [Math.round(pg.getWidth() * 10) / 10, Math.round(pg.getHeight() * 10) / 10]);
const rotations = async (bytes: Uint8Array) => (await plain(bytes)).getPages().map((pg) => pg.getRotation().angle);
const first = (t: string) => t.match(/(Alpha|Bravo|Echo|Page|File) \d+/)?.[0] ?? (t.trim() ? t : "blank");

describe("page order and edits", () => {
  it("AC-41: defaults keep pages, sizes and rotation in file order", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf"]);
    expect(r.pageCount).toBe(5);
    expect((await texts(r.bytes)).map(first)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2"]);
    expect(await sizes(r.bytes)).toEqual([[595, 842], [595, 842], [595, 842], [792, 612], [792, 612]]);
    expect(await rotations(r.bytes)).toEqual([0, 0, 0, 0, 0]);
    expect(r.progress[0]).toBe(0);
    expect(r.progress.at(-1)).toBe(1);
    const doc = await plain(r.bytes);
    expect(doc.getProducer()).toBe("BerryPDF");
    expect(doc.getTitle()).toBeUndefined();
  });

  it("AC-68: follows the page list exactly (move, duplicate, rotate, blank, remove)", async () => {
    const pages: MergePageInput[] = [p("bravo.pdf", 0), p("alpha.pdf", 0), p("alpha.pdf", 0), p("alpha.pdf", 2), { sourceId: null, sourceIndex: -1, rotation: 0, size: { width: 595, height: 842 } }, p("bravo.pdf", 1, 90)];
    const r = await merge(["alpha.pdf", "bravo.pdf"], {}, pages);
    expect((await texts(r.bytes)).map(first)).toEqual(["Bravo 1", "Alpha 1", "Alpha 1", "Alpha 3", "blank", "Bravo 2"]);
    expect(await rotations(r.bytes)).toEqual([0, 0, 0, 0, 0, 90]);
  });

  it("AC-29: a blank page gets the size it was given and no text", async () => {
    const pages = [...allPages("alpha.pdf"), { sourceId: null, sourceIndex: -1, rotation: 0, size: { width: 595, height: 842 } }, ...allPages("bravo.pdf")];
    const r = await merge(["alpha.pdf", "bravo.pdf"], {}, pages);
    expect((await texts(r.bytes))[3]).toBe("");
    expect((await sizes(r.bytes))[3]).toEqual([595, 842]);
  });

  it("adds user rotation to the page's own rotation (pre-rotated input)", async () => {
    const r = await merge(["pre-rotated.pdf"], {}, [p("pre-rotated.pdf", 1, 90), p("pre-rotated.pdf", 0, -90)]);
    expect(await rotations(r.bytes)).toEqual([180, 270]);
  });

  it("AC-69: shared resources are written once (size bound)", async () => {
    const r = await merge(["sixty-pages.pdf", "alpha.pdf"]);
    const inputs = (await readFile(new URL("sixty-pages.pdf", fixtures))).length + (await readFile(new URL("alpha.pdf", fixtures))).length;
    expect(r.bytes.length).toBeLessThanOrEqual(inputs * 1.1 + 50 * 1024);
  });

  it("AC-71 / F1 AC-28: encrypted inputs merge into an unencrypted file", async () => {
    const r = await merge(["user-pw.pdf", "alpha.pdf"], {}, undefined, { passwords: { "user-pw.pdf": "test" } });
    expect(r.wasEncrypted).toBe(true);
    const doc = await plain(r.bytes); // upstream pdf-lib cannot open encrypted files
    expect(doc.getPageCount()).toBe(6);
    expect((await texts(r.bytes)).map(first)).toEqual(["Page 1", "Page 2", "Page 3", "Alpha 1", "Alpha 2", "Alpha 3"]);
  });
});

describe("duplicated pages (review fix)", () => {
  async function items(bytes: Uint8Array) {
    const doc = await pdfjs(bytes);
    const out: { str: string; scale: number }[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      out.push(c.items.flatMap((it) => ("str" in it && it.str.trim() ? [{ str: it.str, scale: Math.abs(it.transform[0]) }] : [])));
    }
    await doc.loadingTask.destroy();
    return out;
  }
  it("a duplicated page carries the footer once, like the original", async () => {
    const r = await merge(["alpha.pdf"], { footer: true }, [p("alpha.pdf", 0), p("alpha.pdf", 0)]);
    for (const page of await items(r.bytes)) {
      expect(page.filter((i) => i.str.includes("alpha.pdf"))).toHaveLength(1);
      expect(page.some((i) => i.str === "Alpha 1")).toBe(true);
    }
  });
  it("a duplicated page is scaled once with same width (text present, right scale)", async () => {
    const r = await merge(["bravo.pdf", "alpha.pdf"], { sameWidth: true }, [p("bravo.pdf", 0), p("alpha.pdf", 0), p("alpha.pdf", 0)]);
    const s = await sizes(r.bytes);
    for (const [w] of s) expect(Math.abs(w - 792)).toBeLessThanOrEqual(0.5);
    const pages = await items(r.bytes);
    const alpha = pages.slice(1).map((pg) => pg.find((i) => i.str === "Alpha 1"));
    expect(alpha.every(Boolean)).toBe(true);
    // 36 pt text scaled by 792/595 on both copies.
    for (const a of alpha) expect(a!.scale).toBeCloseTo(36 * (792 / 595), 0);
  });
  it("duplicating a page that is also rotated keeps each copy's own rotation", async () => {
    const r = await merge(["alpha.pdf"], { footer: true, sameWidth: true }, [p("alpha.pdf", 0, 90), p("alpha.pdf", 0)]);
    expect(await rotations(r.bytes)).toEqual([90, 0]);
    for (const page of await items(r.bytes)) expect(page.filter((i) => i.str.includes("alpha.pdf"))).toHaveLength(1);
  });
});

describe("bookmarks", () => {
  it("AC-43: keep all", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf"]);
    expect(await outline(r.bytes)).toEqual([
      { title: "Alpha intro", page: 1, children: [{ title: "Alpha detail", page: 2, children: [] }] },
      { title: "Alpha end", page: 3, children: [] },
      { title: "Bravo start", page: 4, children: [] },
    ]);
  });
  it("AC-44: remove all", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf"], { bookmarks: "remove" });
    expect(await outline(r.bytes)).toEqual([]);
    expect((await plain(r.bytes)).catalog.get(PDFName.of("Outlines"))).toBeUndefined();
  });
  it("AC-45: one per file", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf"], { bookmarks: "perFile" });
    expect(await outline(r.bytes)).toEqual([
      { title: "alpha", page: 1, children: [] },
      { title: "bravo", page: 4, children: [] },
    ]);
  });
  it("AC-46: one per file, keep existing inside", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf"], { bookmarks: "perFileNested" });
    expect(await outline(r.bytes)).toEqual([
      {
        title: "alpha",
        page: 1,
        children: [
          { title: "Alpha intro", page: 1, children: [{ title: "Alpha detail", page: 2, children: [] }] },
          { title: "Alpha end", page: 3, children: [] },
        ],
      },
      { title: "bravo", page: 4, children: [{ title: "Bravo start", page: 4, children: [] }] },
    ]);
  });
  it("AC-47: bookmarks follow edits; a removed page drops its bookmark", async () => {
    const pages = [p("bravo.pdf", 0), p("alpha.pdf", 0), p("alpha.pdf", 1), p("bravo.pdf", 1)];
    const r = await merge(["alpha.pdf", "bravo.pdf"], {}, pages);
    const marks = await outline(r.bytes);
    expect(marks).toContainEqual({ title: "Alpha intro", page: 2, children: [{ title: "Alpha detail", page: 3, children: [] }] });
    expect(marks).toContainEqual({ title: "Bravo start", page: 1, children: [] });
    expect(JSON.stringify(marks)).not.toContain("Alpha end");
  });
  it("lifts children of a bookmark whose page was removed", async () => {
    const r = await merge(["alpha.pdf"], {}, [p("alpha.pdf", 1), p("alpha.pdf", 2)]);
    expect(await outline(r.bytes)).toEqual([
      { title: "Alpha detail", page: 1, children: [] },
      { title: "Alpha end", page: 2, children: [] },
    ]);
  });
});

async function links(bytes: Uint8Array, pageNumber: number) {
  const doc = await pdfjs(bytes);
  const annots = await (await doc.getPage(pageNumber)).getAnnotations();
  const out = await Promise.all(annots.filter((a) => a.subtype === "Link").map(async (a) => 1 + (await doc.getPageIndex((a.dest as unknown[])[0] as never))));
  await doc.loadingTask.destroy();
  return out;
}

describe("contents page", () => {
  it("AC-48, AC-49, AC-53: file names, page numbers and links", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf"], { toc: "names" });
    expect(r.pageCount).toBe(6);
    const t = await texts(r.bytes);
    expect(t[0]).toMatch(/alpha\.pdf\s*2.*bravo\.pdf\s*5/);
    expect(t.slice(1).map(first)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2"]);
    expect(await links(r.bytes, 1)).toEqual([2, 5]);
    const s = await sizes(r.bytes);
    expect(s[0]).toEqual(s[1]);
  });
  it("AC-50: document titles, falling back to the file name", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf", "echo.pdf"], { toc: "titles" });
    expect((await texts(r.bytes))[0]).toMatch(/Alpha Report.*Bravo Brief.*echo\.pdf/);
  });
  it("AC-51: a cover goes first and is not listed", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf", "echo.pdf"], { toc: "names", cover: true });
    expect(r.pageCount).toBe(7);
    const t = await texts(r.bytes);
    expect(t[3]).toMatch(/bravo\.pdf\s*5.*echo\.pdf\s*7/);
    expect(t[3]).not.toContain("alpha.pdf");
    expect([0, 1, 2, 4, 5, 6].map((i) => first(t[i]))).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2", "Echo 1"]);
  });
  it("AC-52: 50 files continue on further contents pages, every link right", async () => {
    const names = Array.from({ length: 50 }, (_, i) => `f${String(i + 1).padStart(2, "0")}.pdf`);
    const echo = await blob("echo.pdf");
    const sources = names.map((n) => ({ id: n, name: n, kind: "pdf" as const, source: echo }));
    const r = await mergePdf({ sources, pages: names.map((n) => p(n, 0)), options: { ...defaultMergeOptions, toc: "names" } }, {}, () => {});
    const toc = r.pageCount - 50;
    expect(toc).toBeGreaterThan(1);
    const all: number[] = [];
    for (let i = 1; i <= toc; i++) all.push(...(await links(r.bytes, i)));
    expect(all).toEqual(names.map((_, i) => toc + i + 1));
    const t = (await texts(r.bytes)).slice(0, toc).join(" ");
    for (const n of names) expect(t).toContain(n);
  });
});

describe("footer", () => {
  it("AC-54: each page carries its file's name", async () => {
    const t = await texts((await merge(["alpha.pdf", "bravo.pdf"], { footer: true })).bytes);
    expect(t.slice(0, 3).every((x) => x.includes("alpha.pdf") && x.includes("Alpha"))).toBe(true);
    expect(t.slice(3).every((x) => x.includes("bravo.pdf") && x.includes("Bravo"))).toBe(true);
  });
  it("AC-55: no name on contents, padding or inserted blank pages", async () => {
    const pages = [...allPages("alpha.pdf"), { sourceId: null, sourceIndex: -1, rotation: 0, size: { width: 595, height: 842 } }, ...allPages("bravo.pdf")];
    const r = await merge(["alpha.pdf", "bravo.pdf"], { footer: true, toc: "names", doubleSided: true }, pages);
    const t = await texts(r.bytes);
    // TOC (1) + pad, alpha 3 + blank (4, even), bravo 2
    expect(t.length).toBe(8);
    expect(t[1]).toBe("");
    expect(t[5]).toBe("");
    expect(t.slice(2, 5).every((x) => x.includes("alpha.pdf"))).toBe(true);
  });
  it("AC-56: the footer reads upright at the bottom of a rotated page", async () => {
    const r = await merge(["pre-rotated.pdf"], { footer: true });
    const doc = await pdfjs(r.bytes);
    const page = await doc.getPage(2);
    const vp = page.getViewport({ scale: 1 });
    const item = (await page.getTextContent()).items.find((it) => "str" in it && it.str.includes("pre-rotated")) as { transform: number[] };
    const [a, b, , , e, f] = item.transform;
    const [x, y] = vp.convertToViewportPoint(e, f);
    const angle = (Math.round((Math.atan2(b, a) * 180) / Math.PI - page.rotate) + 720) % 360;
    expect(angle).toBe(0);
    expect(y / vp.height).toBeGreaterThan(0.85);
    expect(x).toBeGreaterThanOrEqual(0);
    await doc.loadingTask.destroy();
  });
  it("AC-57: non-Latin names come out exactly (Unicode font)", async () => {
    const phases: string[] = [];
    const sources = [await source("résumé-日本.pdf")];
    const r = await mergePdf({ sources, pages: allPages("résumé-日本.pdf"), options: { ...defaultMergeOptions, footer: true } }, { fonts, onPhase: (ph) => phases.push(ph) }, () => {});
    expect((await texts(r.bytes))[0]).toContain("résumé-日本.pdf");
    expect(phases).toEqual(["fonts", "pages"]);
  });
  it("draws Korean, Chinese, Hebrew and Thai names; Arabic is a known limitation (shown as ?)", async () => {
    const names = ["보고서.pdf", "报告书.pdf", "דוח שנתי.pdf", "รายงาน.pdf", "تقرير.pdf"];
    const echo = await blob("echo.pdf");
    const sources = names.map((n) => ({ id: n, name: n, kind: "pdf" as const, source: echo }));
    const r = await mergePdf({ sources, pages: names.map((n) => p(n, 0)), options: { ...defaultMergeOptions, footer: true } }, { fonts }, () => {});
    const t = await texts(r.bytes);
    expect(t[0]).toContain("보고서.pdf");
    expect(t[1]).toContain("报告书.pdf");
    // Drawn right to left: pdf.js reports glyphs in visual order, the reverse of "דוח שנתי".
    expect(t[2]).toContain("יתנש חוד.pdf");
    expect(t[3]).toContain(".pdf");
    expect(t[3]).not.toContain("?");
    expect(t[4]).toContain("?????.pdf");
  });
    it("fetches no font for names Helvetica can show", async () => {
    let loads = 0;
    const counting: FontSource = { manifest: fonts.manifest, load: async (f) => (loads++, fonts.load(f)) };
    const sources = [await source("alpha.pdf")];
    await mergePdf({ sources, pages: allPages("alpha.pdf"), options: { ...defaultMergeOptions, footer: true, toc: "names" } }, { fonts: counting }, () => {});
    expect(loads).toBe(0);
  });
});

describe("double-sided and same width", () => {
  it("AC-58: pads every odd file, the last one too", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf", "echo.pdf"], { doubleSided: true });
    expect((await texts(r.bytes)).map(first)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "blank", "Bravo 1", "Bravo 2", "Echo 1", "blank"]);
    const s = await sizes(r.bytes);
    expect(s[3]).toEqual(s[2]);
    expect(s[7]).toEqual(s[6]);
  });
  it("AC-59: with contents, every file starts on an odd page and the total is even", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf", "echo.pdf"], { doubleSided: true, toc: "names" });
    const t = await texts(r.bytes);
    expect(t.length % 2).toBe(0);
    for (const start of ["Alpha 1", "Bravo 1", "Echo 1"]) expect(t.findIndex((x) => x.includes(start)) % 2).toBe(0);
  });
  it("AC-60: scales to the first page's width, text kept", async () => {
    const r = await merge(["alpha.pdf", "bravo.pdf"], { sameWidth: true });
    const s = await sizes(r.bytes);
    for (const [w] of s) expect(Math.abs(w - 595)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(s[3][1] - 459.75)).toBeLessThanOrEqual(1);
    expect((await texts(r.bytes)).slice(3).map(first)).toEqual(["Bravo 1", "Bravo 2"]);
  });
  it("AC-61: bravo first makes alpha pages 792 wide", async () => {
    const r = await merge(["bravo.pdf", "alpha.pdf"], { sameWidth: true });
    const s = await sizes(r.bytes);
    expect(Math.abs(s[2][0] - 792)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(s[2][1] - 1120.7)).toBeLessThanOrEqual(1);
  });
});

/** Fields by name from the widget annotations: [{ value, page (0-based) }]. */
async function fields(bytes: Uint8Array) {
  const doc = await pdfjs(bytes);
  const objs: Record<string, { value: unknown; page: number }[]> = {};
  const widgets: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const ws = (await (await doc.getPage(i)).getAnnotations()).filter((a) => a.subtype === "Widget");
    widgets.push(ws.length);
    for (const w of ws) (objs[w.fieldName] ??= []).push({ value: w.fieldValue, page: i - 1 });
  }
  await doc.loadingTask.destroy();
  return { objs, widgets };
}

describe("form fields", () => {
  it("AC-62: merge, rename duplicates (default)", async () => {
    const r = await merge(["form-a.pdf", "form-b.pdf"]);
    const { objs, widgets } = await fields(r.bytes);
    expect(Object.keys(objs).sort()).toEqual(["agree", "name", "name_2"]);
    expect(objs.name[0].value).toBe("Ann");
    expect(objs.name_2[0].value).toBe("Ben");
    const form = (await plain(r.bytes)).getForm();
    expect(form.getCheckBox("agree").isChecked()).toBe(true);
    expect(objs.name[0].page).toBe(0);
    expect(objs.name_2[0].page).toBe(1);
    expect(widgets).toEqual([2, 1]);
  });
  it("AC-63: merge shares one field with two widgets", async () => {
    const { objs } = await fields((await merge(["form-a.pdf", "form-b.pdf"], { forms: "merge" })).bytes);
    expect(Object.keys(objs).sort()).toEqual(["agree", "name"]);
    const name = objs.name.filter((w) => "page" in w && w.page >= 0);
    expect(name.map((w) => w.page).sort()).toEqual([0, 1]);
    expect(name.every((w) => w.value === "Ann")).toBe(true);
  });
  it("AC-64: remove", async () => {
    const r = await merge(["form-a.pdf", "form-b.pdf"], { forms: "remove" });
    const { objs, widgets } = await fields(r.bytes);
    expect(Object.keys(objs)).toEqual([]);
    expect(widgets).toEqual([0, 0]);
  });
  it("AC-65: flatten keeps the values as page content", async () => {
    const r = await merge(["form-a.pdf", "form-b.pdf"], { forms: "flatten" });
    const { objs, widgets } = await fields(r.bytes);
    expect(Object.keys(objs)).toEqual([]);
    expect(widgets).toEqual([0, 0]);
    const t = await texts(r.bytes);
    expect(t[0]).toContain("Ann");
    expect(t[1]).toContain("Ben");
  });
  it("gives a duplicated page its own renamed fields", async () => {
    const { objs, widgets } = await fields((await merge(["form-b.pdf"], {}, [p("form-b.pdf", 0), p("form-b.pdf", 0)])).bytes);
    expect(Object.keys(objs).sort()).toEqual(["name", "name_2"]);
    expect(widgets).toEqual([1, 1]);
  });
});

describe("form fields: types, nesting and pruning (review fix)", () => {
  async function formPdf(build: (doc: import("@cantoo/pdf-lib").PDFDocument) => void, pages = 1) {
    const { PDFDocument: Doc } = await import("@cantoo/pdf-lib");
    const doc = await Doc.create();
    for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
    build(doc);
    return new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>]);
  }
  const run = async (blobs: Blob[], pages: MergePageInput[], forms: MergeOptions["forms"]) =>
    mergePdf({ sources: blobs.map((b, i) => ({ id: `s${i}`, name: `s${i}.pdf`, kind: "pdf" as const, source: b })), pages, options: { ...defaultMergeOptions, forms } }, {}, () => {});
  const fieldNames = async (bytes: Uint8Array) => (await plain(bytes)).getForm().getFields().map((f) => f.getName()).sort();

  it("merge joins same-named fields only when their types match; otherwise the later one is renamed", async () => {
    const a = await formPdf((d) => d.getForm().createTextField("x").addToPage(d.getPage(0), { x: 50, y: 50 }));
    const b = await formPdf((d) => d.getForm().createCheckBox("x").addToPage(d.getPage(0), { x: 50, y: 50 }));
    const r = await run([a, b], [p("s0", 0), p("s1", 0)], "merge");
    expect(await fieldNames(r.bytes)).toEqual(["x", "x_2"]);
  });
  it("merge joins child fields by partial name, recursively", async () => {
    const a = await formPdf((d) => d.getForm().createTextField("person.name").addToPage(d.getPage(0), { x: 50, y: 50 }));
    const b = await formPdf((d) => {
      const f = d.getForm();
      f.createTextField("person.name").addToPage(d.getPage(0), { x: 50, y: 50 });
      f.createTextField("person.age").addToPage(d.getPage(0), { x: 50, y: 120 });
    });
    const r = await run([a, b], [p("s0", 0), p("s1", 0)], "merge");
    const form = (await plain(r.bytes)).getForm();
    expect(form.getFields().map((f) => f.getName()).sort()).toEqual(["person.age", "person.name"]);
    expect(form.getTextField("person.name").acroField.getWidgets()).toHaveLength(2);
  });
  it("drops widgets of pages that are not in the output", async () => {
    const a = await formPdf((d) => {
      const field = d.getForm().createTextField("multi");
      field.addToPage(d.getPage(0), { x: 50, y: 50 });
      field.addToPage(d.getPage(1), { x: 50, y: 50 });
    }, 2);
    for (const mode of ["rename", "merge"] as const) {
      const r = await run([a], [p("s0", 0)], mode);
      const form = (await plain(r.bytes)).getForm();
      expect(form.getTextField("multi").acroField.getWidgets(), mode).toHaveLength(1);
    }
  });
});

describe("expert review (PR #7 addendum)", () => {
  it("A: a field that cannot be flattened stays fillable, with a warning naming the file; the rest is flattened", async () => {
    const r = await merge(["sig-no-ap.pdf"], { forms: "flatten" });
    const form = (await plain(r.bytes)).getForm();
    expect(form.getFields().map((f) => f.getName())).toEqual(["approval"]);
    expect((await texts(r.bytes))[0]).toContain("Ann"); // the text field was flattened
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/sig-no-ap\.pdf.*approval/);
    const clean = await merge(["form-a.pdf"], { forms: "flatten" });
    expect(clean.warnings).toEqual([]);
  });
  it("B: same width resolves an indirect MediaBox instead of collapsing it", async () => {
    const r = await merge(["alpha.pdf", "indirect-box.pdf"], { sameWidth: true }, [p("alpha.pdf", 0), p("indirect-box.pdf", 0)]);
    const s = await sizes(r.bytes);
    expect(s[1][0]).toBeCloseTo(595, 0);
    expect(s[1][1]).toBeCloseTo(612 * (595 / 792), 0);
    expect((await texts(r.bytes))[1]).toContain("Indirect 1");
  });
  it("C: carries /Lang and /PageLabels; drops dangling /StructParents", async () => {
    const r = await merge(["alpha.pdf", "lang-labels.pdf", "tagged-features.pdf"]);
    const doc = await plain(r.bytes);
    expect((doc.catalog.lookup(PDFName.of("Lang")) as unknown as { decodeText: () => string }).decodeText()).toBe("de-DE");
    for (const page of doc.getPages()) expect(page.node.get(PDFName.of("StructParents"))).toBeUndefined();
    expect(doc.catalog.get(PDFName.of("StructTreeRoot"))).toBeUndefined();
    const pdf = await pdfjs(r.bytes);
    // alpha 1-3, then lang-labels i, ii, A-1, then the tagged file's page 7.
    expect(await pdf.getPageLabels()).toEqual(["1", "2", "3", "i", "ii", "A-1", "7"]);
    await pdf.loadingTask.destroy();
    const plainMerge = await plain((await merge(["alpha.pdf", "bravo.pdf"])).bytes);
    expect(plainMerge.catalog.get(PDFName.of("PageLabels"))).toBeUndefined();
    expect(plainMerge.catalog.get(PDFName.of("Lang"))).toBeUndefined();
  });
  it("C: a /Lang that is not a language tag is not copied, and the output still opens", async () => {
    const r = await merge(["lang-bad.pdf", "lang-labels.pdf"]);
    const doc = await plain(r.bytes);
    expect((doc.catalog.lookup(PDFName.of("Lang")) as unknown as { decodeText: () => string }).decodeText()).toBe("de-DE");
    const alone = await merge(["lang-bad.pdf"]);
    expect((await plain(alone.bytes)).catalog.get(PDFName.of("Lang"))).toBeUndefined();
    const pdf = await pdfjs(alone.bytes);
    expect(pdf.numPages).toBe(1);
    await pdf.loadingTask.destroy();
  });
  it("C: page labels use a capped, sorted range walk", async () => {
    const { PDFDocument: Doc, PDFNumber: Num, PDFName: Name } = await import("@cantoo/pdf-lib");
    const { readPageLabels } = await import("./doc-props");
    const doc = await Doc.create();
    for (let i = 0; i < 3; i++) doc.addPage();
    const nums: unknown[] = [];
    for (let k = 0; k < 50_000; k++) nums.push(Num.of(100_000 - k), doc.context.obj({ S: "D" })); // far past the last page
    nums.push(Num.of(1), doc.context.obj({ S: "r" }));
    doc.catalog.set(Name.of("PageLabels"), doc.context.obj({ Nums: nums as never }));
    const t = performance.now();
    expect(readPageLabels(doc)).toEqual([null, { S: "r", P: undefined, St: 1 }, { S: "r", P: undefined, St: 2 }]);
    expect(performance.now() - t).toBeLessThan(3000);
  });
  it("D: canary - pdf-lib's object copier still exposes traversedObjects and honours seeded refs", async () => {
    const { PDFDocument: Doc, PDFObjectCopier, PDFNull: Null } = await import("@cantoo/pdf-lib");
    const src = await Doc.create();
    const dst = await Doc.create();
    const page = src.addPage();
    const copier = PDFObjectCopier.for(src.context, dst.context);
    const traversed = (copier as unknown as { traversedObjects?: unknown }).traversedObjects;
    expect(traversed, "PDFObjectCopier.traversedObjects is gone: merge.ts reserves page refs through it").toBeInstanceOf(Map);
    (traversed as Map<unknown, unknown>).set(page.ref, Null);
    const copied = copier.copy(src.context.obj([page.ref])) as unknown as { get: (i: number) => unknown };
    expect(copied.get(0), "a seeded ref must be used as is (links to dropped pages)").toBe(Null);
  });
  it("D: canary - the private PDFForm methods the safe flatten uses still exist", async () => {
    const { PDFDocument: Doc } = await import("@cantoo/pdf-lib");
    const { FORM_INTERNALS } = await import("./forms");
    const form = (await Doc.create()).getForm() as unknown as Record<string, unknown>;
    for (const name of FORM_INTERNALS) expect(typeof form[name], `PDFForm.${name} is gone: forms.ts flattenFields uses it`).toBe("function");
  });
  it("F: NeedAppearances only when a widget has no appearance", async () => {
    const renamed = await plain((await merge(["form-a.pdf", "form-b.pdf"])).bytes);
    expect(renamed.catalog.lookup(PDFName.of("AcroForm"), PDFDict).get(PDFName.of("NeedAppearances"))).toBeUndefined();
    const merged = await plain((await merge(["form-a.pdf", "form-b.pdf"], { forms: "merge" })).bytes);
    expect(String(merged.catalog.lookup(PDFName.of("AcroForm"), PDFDict).get(PDFName.of("NeedAppearances")))).toBe("true");
  });
});

describe("image pages", () => {
  it("AC-5, AC-67: PNG on landscape A4, JPEG on portrait A4, centered, JPEG kept as DCT", async () => {
    const r = await merge(["alpha.pdf", "charlie.png", "delta.jpg"]);
    expect(r.pageCount).toBe(5);
    const doc = await plain(r.bytes);
    const s = await sizes(r.bytes);
    expect(s[3]).toEqual([842, 595]);
    expect(s[4]).toEqual([595, 842]);
    const filters: string[] = [];
    for (const page of doc.getPages().slice(3)) {
      const xobjects = page.node.Resources()!.lookup(PDFName.of("XObject")) as unknown as { entries: () => [unknown, unknown][]; lookup: (k: unknown) => PDFRawStream };
      const entries = xobjects.entries();
      expect(entries).toHaveLength(1);
      filters.push(String(xobjects.lookup(entries[0][0]).dict.get(PDFName.of("Filter"))));
    }
    expect(filters[1]).toBe("/DCTDecode");
    const ops = await pdfjs(r.bytes);
    const list = await (await ops.getPage(4)).getOperatorList();
    const { OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // pdf-lib draws an image as: translate(x, y), rotate(0), scale(w, h), skew(0), Do.
    let m = [1, 0, 0, 1, 0, 0];
    const paint = list.fnArray.indexOf(OPS.paintImageXObject);
    list.fnArray.slice(0, paint).forEach((fn, i) => {
      if (fn !== OPS.transform) return;
      const [a, b, c, d, e, f] = list.argsArray[i] as number[];
      m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
    });
    const [w, , , h, x, y] = m;
    expect(Math.abs(x + w / 2 - 421)).toBeLessThanOrEqual(1);
    expect(Math.abs(y + h / 2 - 297.5)).toBeLessThanOrEqual(1);
    expect(x).toBeGreaterThanOrEqual(36);
    await ops.loadingTask.destroy();
  });
  it("AC-8: a 2-frame TIFF gives 2 pages with one image each", async () => {
    const r = await merge(["fox.tiff"]);
    expect(r.pageCount).toBe(2);
    const doc = await plain(r.bytes);
    for (const page of doc.getPages()) expect((page.node.Resources()!.lookup(PDFName.of("XObject")) as unknown as { entries: () => unknown[] }).entries()).toHaveLength(1);
  });
  it("embeds an image once when it is used twice", async () => {
    const r = await merge(["delta.jpg"], {}, [p("delta.jpg", 0), p("delta.jpg", 0, 90)]);
    expect(await rotations(r.bytes)).toEqual([0, 90]);
    expect(r.bytes.length).toBeLessThan(2934 * 1.5 + 4000);
  });
  it("embeds decoded GIF/BMP/WebP pixels directly, with a soft mask only when needed", async () => {
    const tiny = await source("tiny.gif");
    const rgba = new Uint8Array(4 * 3 * 4).fill(200);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    const opaque = await mergePdf({ sources: [{ ...tiny, kind: "image" }], pages: [p("tiny.gif", 0)], options: defaultMergeOptions }, { decodeImage: async () => ({ rgba, width: 4, height: 3 }) }, () => {});
    const xobj = async (bytes: Uint8Array) => {
      const doc = await plain(bytes);
      const x = doc.getPage(0).node.Resources()!.lookup(PDFName.of("XObject")) as unknown as { entries: () => [unknown, unknown][]; lookup: (k: unknown) => PDFRawStream };
      return x.lookup(x.entries()[0][0]).dict;
    };
    let d = await xobj(opaque.bytes);
    expect(String(d.get(PDFName.of("ColorSpace")))).toBe("/DeviceRGB");
    expect(String(d.get(PDFName.of("Filter")))).toBe("/FlateDecode");
    expect(d.get(PDFName.of("SMask"))).toBeUndefined();
    rgba[3] = 0;
    const masked = await mergePdf({ sources: [{ ...tiny, kind: "image" }], pages: [p("tiny.gif", 0)], options: defaultMergeOptions }, { decodeImage: async () => ({ rgba, width: 4, height: 3 }) }, () => {});
    d = await xobj(masked.bytes);
    expect(d.get(PDFName.of("SMask"))).toBeDefined();
  });
});
