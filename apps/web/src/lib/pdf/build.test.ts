/**
 * The page tools' output engine (spec F4/F5 §6, I-1 to I-5): buildDocuments
 * driven by the planners, plus the same fidelity on Merge's path (Organize,
 * Alternate). Fixtures are generated in memory (page-tool-fixtures.ts).
 */
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, PDFString, StandardFonts } from "@cantoo/pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { parsePageRanges } from "../page-ranges";
import { pagesPerFile, planAlternate, planDelete, planExtract, planSplit, type OutputPlan, type PlanFile } from "../page-plans";
import { qpdfCheck, renderPage } from "../forms/test-helpers";
import { buildDocuments, type BuiltDocument } from "./build";
import { documentsJob, runJob } from "./jobs";
import { mergePdf, widgetsOf, type MergePageInput, type MergeSourceInput } from "./merge";
import { ALTERNATE_OPTIONS, ORGANIZE_OPTIONS } from "./merge-options";
import { bigFont, linksOf, linksPdf, mixedSizesPdf, outlineOf, pageObjectCount, pageTexts, sharedResPdf, threePagesPdf, twelvePdf } from "./page-tool-fixtures";

const fx: Record<string, Uint8Array> = {};
beforeAll(async () => {
  fx["twelve.pdf"] = await twelvePdf();
  fx["three-pages.pdf"] = await threePagesPdf();
  fx["mixed-sizes.pdf"] = await mixedSizesPdf();
  fx["shared-res.pdf"] = await sharedResPdf("shared");
  fx["inherited-res.pdf"] = await sharedResPdf("inherited");
  fx["shared-res-form.pdf"] = await sharedResPdf("shared", { form: true });
  fx["links.pdf"] = await linksPdf();
  const repo = new URL("../../../tests/fixtures/", import.meta.url);
  for (const name of ["sixty-pages.pdf", "owner-restricted.pdf"]) fx[name] = new Uint8Array(await readFile(new URL(name, repo)));
});

const count = async (name: string) => (await PDFDocument.load(fx[name], { ignoreEncryption: true })).getPageCount();
const file = async (name: string): Promise<PlanFile> => ({ id: name, name, pageCount: await count(name) });
const source = (name: string): MergeSourceInput => ({ id: name, name, kind: "pdf", source: new Blob([fx[name] as Uint8Array<ArrayBuffer>]) });
const items = (text: string) => {
  const r = parsePageRanges(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.items;
};

async function run(plan: OutputPlan, removeBookmarks = false): Promise<BuiltDocument[]> {
  const ids = [...new Set(plan.documents.flatMap((d) => d.pages.map((p) => p.sourceId)))];
  const r = await buildDocuments({ sources: ids.map(source), documents: plan.documents, options: { bookmarks: removeBookmarks ? "remove" : "keep" } }, {}, () => {});
  return r.documents;
}
const split = async (names: string[], mode: Parameters<typeof planSplit>[1]["mode"], removeBookmarks = false) => run(planSplit(await Promise.all(names.map(file)), { mode }), removeBookmarks);
const extract = async (name: string, text: string, removeBookmarks = false) => {
  const f = await file(name);
  return (await run(planExtract([f], pagesPerFile(items(text), [f])), removeBookmarks))[0];
};
const del = async (name: string, text: string, removeBookmarks = false) => {
  const f = await file(name);
  return (await run(planDelete([f], pagesPerFile(items(text), [f])), removeBookmarks))[0];
};
const merge = async (names: string[], pages: MergePageInput[], options = ORGANIZE_OPTIONS) => mergePdf({ sources: [...new Set(names)].map(source), pages, options }, {}, () => {});
const all = (name: string, n: number): MergePageInput[] => Array.from({ length: n }, (_, i) => ({ sourceId: name, sourceIndex: i, rotation: 0 }));

const plain = (bytes: Uint8Array) => PDFDocument.load(bytes, { updateMetadata: false });
const boxes = async (bytes: Uint8Array) => (await plain(bytes)).getPages().map((p) => [p.getMediaBox().width, p.getMediaBox().height, p.getRotation().angle]);
/** Bookmarks as "title→page" trees, for compact comparisons. */
const marks = async (bytes: Uint8Array): Promise<unknown[]> => {
  const walk = (list: Awaited<ReturnType<typeof outlineOf>>): unknown[] => list.map((m) => (m.children.length ? [`${m.title}→${m.page}`, walk(m.children)] : `${m.title}→${m.page}`));
  return walk(await outlineOf(bytes));
};

describe("page order, boxes and text (§6)", () => {
  it("AC-420: every page gives 12 entries 'Twelve n'", async () => {
    const docs = await split(["twelve.pdf"], { kind: "every" });
    expect(docs.map((d) => d.name)).toEqual(Array.from({ length: 12 }, (_, i) => `twelve-${i + 1}.pdf`));
    for (const [i, d] of docs.entries()) expect(await pageTexts(d.bytes)).toEqual([`Twelve ${i + 1}`]);
  });

  it("AC-421, AC-423: every N = 5 and spreads keep page order", async () => {
    const five = await split(["twelve.pdf"], { kind: "everyN", n: 5 });
    expect(await Promise.all(five.map((d) => pageTexts(d.bytes)))).toEqual([
      ["Twelve 1", "Twelve 2", "Twelve 3", "Twelve 4", "Twelve 5"],
      ["Twelve 6", "Twelve 7", "Twelve 8", "Twelve 9", "Twelve 10"],
      ["Twelve 11", "Twelve 12"],
    ]);
    const spreads = await split(["twelve.pdf"], { kind: "spreads" });
    expect(spreads.map((d) => d.pageCount)).toEqual([1, 2, 2, 2, 2, 2, 1]);
    expect(await Promise.all(spreads.map(async (d) => (await pageTexts(d.bytes))[0]))).toEqual(["Twelve 1", "Twelve 2", "Twelve 4", "Twelve 6", "Twelve 8", "Twelve 10", "Twelve 12"]);
  });

  it("AC-426, AC-427: typed ranges, pages outside left out, overlaps allowed", async () => {
    const docs = await split(["twelve.pdf"], { kind: "ranges", items: items("1-3, 8-9, 12") });
    expect(await Promise.all(docs.map((d) => pageTexts(d.bytes)))).toEqual([["Twelve 1", "Twelve 2", "Twelve 3"], ["Twelve 8", "Twelve 9"], ["Twelve 12"]]);
    const overlap = await split(["twelve.pdf"], { kind: "ranges", items: items("1-4, 3-6") });
    expect((await pageTexts(overlap[1].bytes))[0]).toBe("Twelve 3");
  });

  it("AC-435: every page on mixed sizes keeps boxes, rotation and text", async () => {
    const docs = await split(["mixed-sizes.pdf"], { kind: "every" });
    expect(await Promise.all(docs.map(async (d) => (await boxes(d.bytes))[0]))).toEqual([[595, 842, 0], [792, 612, 0], [420, 595, 0], [595, 842, 90]]);
    expect(await Promise.all(docs.map(async (d) => (await pageTexts(d.bytes))[0]))).toEqual(["Mixed 1", "Mixed 2", "Mixed 3", "Mixed 4"]);
  });

  it("AC-451, AC-459: extract keeps document order, boxes and rotation", async () => {
    expect(await pageTexts((await extract("twelve.pdf", "9, 2-5")).bytes)).toEqual(["Twelve 2", "Twelve 3", "Twelve 4", "Twelve 5", "Twelve 9"]);
    const two = await extract("mixed-sizes.pdf", "2, 4");
    expect(await boxes(two.bytes)).toEqual([[792, 612, 0], [595, 842, 90]]);
    expect(await pageTexts(two.bytes)).toEqual(["Mixed 2", "Mixed 4"]);
  });

  it("AC-465, AC-467, AC-473: delete keeps the rest in order", async () => {
    const d = await del("twelve.pdf", "1-3, 10-");
    expect(await pageTexts(d.bytes)).toEqual(["Twelve 4", "Twelve 5", "Twelve 6", "Twelve 7", "Twelve 8", "Twelve 9"]);
    const m = await del("mixed-sizes.pdf", "1");
    expect(await boxes(m.bytes)).toEqual([[792, 612, 0], [420, 595, 0], [595, 842, 90]]);
  });

  it("AC-411: an owner-restricted file splits, extracts and deletes into unencrypted files", async () => {
    const f = await file("owner-restricted.pdf");
    const outs = [
      ...(await run(planExtract([f], { [f.id]: [0] }))),
      ...(await run(planDelete([f], { [f.id]: [0] }))),
      ...(await run(planSplit([f], { mode: { kind: "every" } }))),
    ];
    expect(outs.map((d) => d.pageCount)).toEqual([1, 2, 1, 1, 1]);
    for (const d of outs) expect((await PDFDocument.load(d.bytes)).isEncrypted).toBe(false);
  });

  it("Producer is BerryPDF and the output is never encrypted", async () => {
    const d = await extract("twelve.pdf", "1");
    const doc = await plain(d.bytes);
    expect(doc.getProducer()).toBe("BerryPDF");
    expect(doc.isEncrypted).toBe(false);
  });
});

describe("bookmarks per output (§3a, I-3)", () => {
  it("AC-433: each Split part keeps the bookmarks that point into it", async () => {
    const docs = await split(["twelve.pdf"], { kind: "ranges", items: items("1-4, 5-10, 11-12") });
    expect(await marks(docs[0].bytes)).toEqual(["Intro→1"]);
    expect(await marks(docs[1].bytes)).toEqual([["Middle→1", ["Detail→2"]], "End→6"]);
    expect(await marks(docs[2].bytes)).toEqual([]);
  });
  it("AC-434, AC-458, AC-472: Remove bookmarks leaves no outline", async () => {
    for (const d of await split(["twelve.pdf"], { kind: "ranges", items: items("1-4, 5-10") }, true)) expect(await marks(d.bytes)).toEqual([]);
    expect(await marks((await extract("twelve.pdf", "5-6", true)).bytes)).toEqual([]);
    expect(await marks((await del("twelve.pdf", "5", true)).bytes)).toEqual([]);
  });
  it("AC-457: extract 5-6, 10", async () => {
    expect(await marks((await extract("twelve.pdf", "5-6, 10")).bytes)).toEqual([["Middle→1", ["Detail→2"]], "End→3"]);
  });
  it("AC-471: deleting page 5 lifts Detail one level", async () => {
    expect(await marks((await del("twelve.pdf", "5")).bytes)).toEqual(["Intro→1", "Detail→5", "End→9"]);
  });
  it("AC-540: extract 5-10 of links.pdf keeps views, colour, bold and the closed state", async () => {
    const out = await outlineOf((await extract("links.pdf", "5-10")).bytes);
    expect(out.map((m) => m.title)).toEqual(["Middle", "End"]);
    const [middle, end] = out;
    expect(middle).toMatchObject({ page: 1, view: ["XYZ", 0, 421, null], color: [255, 0, 0], bold: true, italic: false });
    expect(middle.count).toBeLessThan(0); // still closed
    expect(middle.children[0]).toMatchObject({ title: "Detail", page: 2, view: ["XYZ", 0, 300, null] });
    expect(end).toMatchObject({ page: 6, view: ["FitH", 300] });
  });
  it("AC-540: Organize with links.pdf, page 12 moved to the front: End → page 11 with /FitH 300", async () => {
    const pages = all("links.pdf", 12);
    const r = await merge(["links.pdf"], [pages[11], ...pages.slice(0, 11)]);
    const end = (await outlineOf(r.bytes)).find((m) => m.title === "End");
    expect(end).toMatchObject({ page: 11, view: ["FitH", 300] });
  });
  it("same width scales a bookmark's position with its page", async () => {
    const r = await merge(["mixed-sizes.pdf", "links.pdf"], [{ sourceId: "mixed-sizes.pdf", sourceIndex: 1, rotation: 0 }, ...all("links.pdf", 12)], { ...ORGANIZE_OPTIONS, sameWidth: true });
    const end = (await outlineOf(r.bytes)).find((m) => m.title === "End")!;
    expect(end.page).toBe(11);
    expect(end.view[0]).toBe("FitH");
    expect(end.view[1] as number).toBeCloseTo(300 * (792 / 595), 3);
  });
});

describe("links (I-2)", () => {
  it("AC-538: extract 1-5 keeps four links, each to its output page; L2 is gone", async () => {
    const d = await extract("links.pdf", "1-5");
    const links = await linksOf(d.bytes, 1);
    expect(links).toHaveLength(4);
    expect(links).toEqual([
      { page: 3, view: ["XYZ", 0, 400, 0] }, // L1
      { page: 5, view: ["XYZ", 0, 500, null] }, // L3 (named → explicit)
      { page: 4, view: ["Fit"] }, // L4 (GoTo)
      { page: null, view: [], url: "https://example.org/" }, // L5
    ]);
  });
  it("AC-538: links follow their target to its new position (extract 1, 4, 5)", async () => {
    const d = await extract("links.pdf", "1, 4, 5");
    expect(await linksOf(d.bytes, 1)).toEqual([
      { page: 3, view: ["XYZ", 0, 500, null] },
      { page: 2, view: ["Fit"] },
      { page: null, view: [], url: "https://example.org/" },
    ]);
  });
  it("AC-539: every page alone holds exactly one page object; entry 1 has only the URI link", async () => {
    const docs = await split(["links.pdf"], { kind: "every" });
    for (const d of docs) {
      expect(await pageObjectCount(d.bytes), d.name).toBe(1);
      expect(qpdfCheck(d.bytes), d.name).toEqual([]);
    }
    expect(await linksOf(docs[0].bytes, 1)).toEqual([{ page: null, view: [], url: "https://example.org/" }]);
  });
  it("AC-539: deleting page 10 keeps L1, L3, L4 and the URI link, and drops L2", async () => {
    const d = await del("links.pdf", "10");
    expect((await linksOf(d.bytes, 1)).map((l) => l.page ?? l.url)).toEqual([3, 5, 4, "https://example.org/"]);
  });
  it("the named-destination link does not depend on the source's name tree", async () => {
    const doc = await plain((await extract("links.pdf", "1-5")).bytes);
    expect(doc.catalog.get(PDFName.of("Names"))).toBeUndefined();
  });
  it("review 3: a /Dests name tree whose /Kids point back at itself does not hang", async () => {
    const d = await PDFDocument.create();
    const p1 = d.addPage();
    d.addPage();
    const ctx = d.context;
    const rootRef = ctx.nextRef();
    ctx.assign(rootRef, ctx.obj({ Kids: [rootRef, rootRef] }));
    d.catalog.set(PDFName.of("Names"), ctx.obj({ Dests: rootRef }));
    p1.node.set(PDFName.of("Annots"), ctx.obj([ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 10, 10], Dest: PDFName.of("nowhere") }))]));
    const outlineRef = ctx.nextRef();
    const item = ctx.register(ctx.obj({ Title: PDFString.of("Loop"), Parent: outlineRef, Dest: PDFString.of("nowhere") }));
    ctx.assign(outlineRef, ctx.obj({ Type: "Outlines", First: item, Last: item, Count: 1 }));
    d.catalog.set(PDFName.of("Outlines"), outlineRef);
    const bytes = await d.save();
    const src: MergeSourceInput = { id: "x", name: "x.pdf", kind: "pdf", source: new Blob([bytes as Uint8Array<ArrayBuffer>]) };
    const r = await buildDocuments({ sources: [src], documents: [{ name: "a.pdf", pages: [{ sourceId: "x", sourceIndex: 0, rotation: 0 }] }] }, {}, () => {});
    expect(r.documents[0].pageCount).toBe(1);
    const m = await mergePdf({ sources: [src], pages: all("x", 2), options: ORGANIZE_OPTIONS }, {}, () => {});
    expect(m.pageCount).toBe(2);
  });
  it("review 8: named links resolve through one lookup table per source (10,000 named links in a flat tree)", async () => {
    const d = await PDFDocument.create();
    const ctx = d.context;
    const P = 200;
    const L = 50;
    const pages = Array.from({ length: P }, () => d.addPage([200, 200]));
    const names: unknown[] = [];
    for (let i = 0; i < P * L; i++) names.push(PDFString.of(`dest${String(i).padStart(6, "0")}`), ctx.obj([pages[i % P].ref, PDFName.of("Fit")]));
    d.catalog.set(PDFName.of("Names"), ctx.obj({ Dests: ctx.obj({ Names: ctx.obj(names as never) }) }));
    pages.forEach((p, pi) =>
      p.node.set(PDFName.of("Annots"), ctx.obj(Array.from({ length: L }, (_, k) => ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 5, 5], Dest: PDFString.of(`dest${String(pi * L + k).padStart(6, "0")}`) }))))),
    );
    const bytes = await d.save();
    const t0 = performance.now();
    const r = await buildDocuments({ sources: [{ id: "x", name: "x.pdf", kind: "pdf", source: new Blob([bytes as Uint8Array<ArrayBuffer>]) }], documents: pages.map((_, i) => ({ name: `p${i}.pdf`, pages: [{ sourceId: "x", sourceIndex: i, rotation: 0 }] })) }, {}, () => {});
    expect(performance.now() - t0).toBeLessThan(10_000); // quadratic lookups took about 30 s
    // Page 1's link k points at page (k mod 200) + 1: only the one to page 1 itself stays.
    expect(await linksOf(r.documents[0].bytes, 1)).toEqual([{ page: 1, view: ["Fit"] }]);
  }, 60_000);
  it("Merge (Organize) gets the same link fixes", async () => {
    const r = await merge(["links.pdf"], all("links.pdf", 5));
    expect((await linksOf(r.bytes, 1)).map((l) => l.page ?? l.url)).toEqual([3, 5, 4, "https://example.org/"]);
  });
});

describe("document info and layout (I-4)", () => {
  const info = async (bytes: Uint8Array) => {
    const d = await plain(bytes);
    return { title: d.getTitle(), author: d.getAuthor(), subject: d.getSubject(), keywords: d.getKeywords(), created: d.getCreationDate()?.toISOString(), producer: d.getProducer(), modified: d.getModificationDate(), layout: d.catalog.get(PDFName.of("PageLayout")) };
  };
  it("AC-541: Split (each mode), Extract, Delete and Organize with links.pdf alone carry Title, Author, Subject, Keywords, CreationDate and /PageLayout", async () => {
    const src = await info(fx["links.pdf"]);
    const t0 = Date.now() - 1000;
    const outs = [
      ...(await split(["links.pdf"], { kind: "every" })).slice(0, 1),
      ...(await split(["links.pdf"], { kind: "everyN", n: 5 })).slice(0, 1),
      ...(await split(["links.pdf"], { kind: "spreads" })).slice(0, 1),
      ...(await split(["links.pdf"], { kind: "ranges", items: items("2-3") })),
      await extract("links.pdf", "3"),
      await del("links.pdf", "1"),
    ].map((d) => d.bytes);
    outs.push((await merge(["links.pdf"], all("links.pdf", 12))).bytes);
    for (const bytes of outs) {
      const o = await info(bytes);
      expect(o).toMatchObject({ title: "Links fixture", author: "QA", subject: "Fixture", keywords: src.keywords, created: src.created, producer: "BerryPDF" });
      expect(o.layout).toBe(PDFName.of("TwoColumnRight"));
      expect(o.modified!.getTime()).toBeGreaterThanOrEqual(t0);
    }
  });
  it("AC-541: Organize with two files, and Alternate, copy no Title or Author", async () => {
    const two = await info((await merge(["links.pdf", "three-pages.pdf"], [...all("links.pdf", 2), ...all("three-pages.pdf", 1)])).bytes);
    expect(two.title).toBeUndefined();
    expect(two.author).toBeUndefined();
    expect(two.layout).toBeUndefined();
    const mix = planAlternate([{ sourceId: "links.pdf", name: "links.pdf", pageCount: 12 }, { sourceId: "three-pages.pdf", name: "three-pages.pdf", pageCount: 3 }]);
    const alt = await merge(["links.pdf", "three-pages.pdf"], mix.pages, ALTERNATE_OPTIONS);
    expect((await info(alt.bytes)).title).toBeUndefined();
    expect(await marks(alt.bytes)).toEqual([]);
  });
});

describe("form fields follow their page (I-5)", () => {
  it("review 5: the form's /DR is copied only into outputs that keep a field", async () => {
    const d = await PDFDocument.create();
    const font = await d.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 4; i++) d.addPage().drawText(`p${i + 1}`, { font, x: 50, y: 700 });
    const f = d.getForm().createTextField("name");
    f.setText("Ada");
    f.addToPage(d.getPage(2), { x: 50, y: 500 });
    const acro = d.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
    acro.set(PDFName.of("DR"), d.context.obj({ Font: d.context.obj({ BigF: bigFont(d, 300_000) }) }));
    const bytes = await d.save();
    const r = await buildDocuments({ sources: [{ id: "x", name: "x.pdf", kind: "pdf", source: new Blob([bytes as Uint8Array<ArrayBuffer>]) }], documents: [0, 1, 2, 3].map((i) => ({ name: `p${i}.pdf`, pages: [{ sourceId: "x", sourceIndex: i, rotation: 0 }] })) }, {}, () => {});
    for (const [i, doc] of r.documents.entries()) {
      const out = await PDFDocument.load(doc.bytes);
      if (i === 2) {
        expect(out.getForm().getTextField("name").getText()).toBe("Ada");
        expect(out.catalog.lookup(PDFName.of("AcroForm"), PDFDict).lookup(PDFName.of("DR"), PDFDict).lookup(PDFName.of("Font"), PDFDict).get(PDFName.of("BigF"))).toBeDefined();
      } else {
        expect(out.catalog.get(PDFName.of("AcroForm")), doc.name).toBeUndefined();
        expect(doc.bytes.length, doc.name).toBeLessThan(20_000);
      }
    }
  });
  it("review 5: widgets of pages not in the output are not copied through their field", async () => {
    const d = await PDFDocument.create();
    const ctx = d.context;
    for (let i = 0; i < 3; i++) d.addPage([300, 300]);
    const fieldRef = ctx.nextRef();
    const widgets = [0, 2].map((pi, k) => {
      const ap = ctx.register(ctx.stream(new Uint8Array(60_000).map((_, j) => (j * 31 + k) % 251), { Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 20], Resources: ctx.obj({}) }));
      const w = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Widget", Rect: [10, 10, 110, 30], P: d.getPage(pi).ref, Parent: fieldRef, AP: ctx.obj({ N: ap }) }));
      d.getPage(pi).node.set(PDFName.of("Annots"), ctx.obj([w]));
      return w;
    });
    ctx.assign(fieldRef, ctx.obj({ FT: "Tx", T: PDFString.of("shared"), V: PDFString.of("x"), Kids: widgets }));
    d.catalog.set(PDFName.of("AcroForm"), ctx.obj({ Fields: [fieldRef] }));
    const bytes = await d.save({ useObjectStreams: false });
    const r = await buildDocuments({ sources: [{ id: "x", name: "x.pdf", kind: "pdf", source: new Blob([bytes as Uint8Array<ArrayBuffer>]) }], documents: [{ name: "a.pdf", pages: [{ sourceId: "x", sourceIndex: 0, rotation: 0 }] }] }, {}, () => {});
    const out = await PDFDocument.load(r.documents[0].bytes);
    const widgetObjects = out.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFDict && o.get(PDFName.of("Subtype")) === PDFName.of("Widget"));
    expect(widgetObjects).toHaveLength(1);
    expect(r.documents[0].bytes.length).toBeLessThan(bytes.length * 0.7);
    const field = out.getForm().getTextField("shared");
    expect(field.acroField.getWidgets()).toHaveLength(1);
    expect(out.catalog.lookup(PDFName.of("AcroForm"), PDFDict).lookup(PDFName.of("Fields"), PDFArray).size()).toBe(1);
  });
  it("AC-542: extract page 3 keeps 'name' = 'Ada' on page 1, fillable", async () => {
    const d = await extract("links.pdf", "3");
    const doc = await PDFDocument.load(d.bytes);
    const field = doc.getForm().getTextField("name");
    expect(field.getText()).toBe("Ada");
    const widget = field.acroField.getWidgets()[0];
    expect(widget.P()).toBe(doc.getPage(0).ref);
    field.setText("Bo");
    const again = await PDFDocument.load(await doc.save());
    expect(again.getForm().getTextField("name").getText()).toBe("Bo");
  });
  it("AC-542: Split 1-2, 3-12: entry 1 has no fields, entry 2 has 'name'", async () => {
    const [a, b] = await split(["links.pdf"], { kind: "ranges", items: items("1-2, 3-12") });
    expect(qpdfCheck(b.bytes)).toEqual([]);
    expect((await PDFDocument.load(a.bytes)).getForm().getFields()).toHaveLength(0);
    expect((await PDFDocument.load(a.bytes)).catalog.get(PDFName.of("AcroForm"))).toBeUndefined();
    expect((await PDFDocument.load(b.bytes)).getForm().getFields().map((f) => f.getName())).toEqual(["name"]);
  });
});

describe("resource pruning (I-1)", () => {
  const sizeOf = (name: string) => fx[name].length;
  /** Differing RGBA bytes between two renders at 72 dpi. */
  const diff = async (a: Uint8Array, pa: number, b: Uint8Array, pb: number) => {
    const [x, y] = await Promise.all([renderPage(a, pa, 1, false), renderPage(b, pb, 1, false)]);
    expect([x.width, x.height]).toEqual([y.width, y.height]);
    let n = 0;
    for (let i = 0; i < x.data.length; i++) if (x.data[i] !== y.data[i]) n++;
    return n;
  };

  for (const name of ["shared-res.pdf", "inherited-res.pdf", "shared-res-form.pdf"]) {
    it(`AC-536/AC-537: every page of ${name}: each entry under 15%, all together at most 1.25×, same render and text`, async () => {
      const docs = await split([name], { kind: "every" });
      const input = sizeOf(name);
      // With a form, the part holding the field (page 3) also carries the form's /DR, 100 KB of font, kept whole.
      for (const [i, d] of docs.entries()) expect((d.bytes.length - (name.includes("form") && i === 2 ? 100_000 : 0)) / input, d.name).toBeLessThan(0.15);
      if (name.includes("form")) expect((await PDFDocument.load(docs[2].bytes)).getForm().getTextField("name").getText()).toBe("Ada");
      expect(docs.reduce((a, d) => a + d.bytes.length, 0)).toBeLessThanOrEqual(input * 1.25);
      for (const [i, d] of docs.entries()) {
        expect(await pageTexts(d.bytes)).toEqual([`Shared ${i + 1}`]);
        expect(await diff(fx[name], i + 1, d.bytes, 1), `page ${i + 1}`).toBe(0);
        expect(qpdfCheck(d.bytes), d.name).toEqual([]);
      }
    }, 60_000);
  }

  it("AC-537: Extract page 1, Delete 2-12 and Organize with 2-12 removed each give one file under 15%", async () => {
    const input = sizeOf("shared-res.pdf");
    const outs = [(await extract("shared-res.pdf", "1")).bytes, (await del("shared-res.pdf", "2-12")).bytes, (await merge(["shared-res.pdf"], all("shared-res.pdf", 1))).bytes];
    for (const bytes of outs) {
      expect(bytes.length / input).toBeLessThan(0.15);
      expect(await diff(fx["shared-res.pdf"], 1, bytes, 1)).toBe(0);
    }
  });

  it("a part holds only its own images", async () => {
    const [part] = await split(["shared-res.pdf"], { kind: "ranges", items: items("3-4") });
    const doc = await PDFDocument.load(part.bytes);
    const images = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
    expect(images).toHaveLength(2);
    const xo = doc.getPage(0).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
    expect(xo.keys().map((k) => k.decodeText())).toEqual(["Im3"]);
  });

  it("a merge of every page of a file is not pruned (no change for whole-file merges)", async () => {
    const r = await merge(["shared-res.pdf"], all("shared-res.pdf", 12));
    const doc = await PDFDocument.load(r.bytes);
    const res = doc.getPages().map((p) => p.node.get(PDFName.of("Resources")));
    expect(new Set(res.map(String)).size).toBe(1); // still one shared dict
    expect(r.bytes.length).toBeLessThanOrEqual(sizeOf("shared-res.pdf") * 1.05);
  });

  it("AC-438, AC-461, AC-475: sixty-pages.pdf one-page outputs are small", async () => {
    const input = sizeOf("sixty-pages.pdf");
    const docs = await split(["sixty-pages.pdf"], { kind: "every" });
    expect(docs).toHaveLength(60);
    for (const d of docs) expect(d.bytes.length / input).toBeLessThan(0.25);
    expect(docs.reduce((a, d) => a + d.bytes.length, 0)).toBeLessThanOrEqual(input * 3);
    expect((await extract("sixty-pages.pdf", "1")).bytes.length / input).toBeLessThan(0.25);
    expect((await del("sixty-pages.pdf", "2-60")).bytes.length / input).toBeLessThan(0.25);
  }, 60_000);
});

describe("buildDocuments and the documents job (§0a.4)", () => {
  it("parses each source once across outputs and reports progress from 0 to 1", async () => {
    const progress: number[] = [];
    const plan = planSplit([await file("twelve.pdf"), await file("three-pages.pdf")], { mode: { kind: "everyN", n: 2 } });
    let blobReads = 0;
    const counting = (name: string): MergeSourceInput => {
      const s = source(name);
      const real = s.source;
      return { ...s, source: { arrayBuffer: () => (blobReads++, real.arrayBuffer()) } as Blob };
    };
    const seen: string[] = [];
    const r = await buildDocuments({ sources: [counting("twelve.pdf"), counting("three-pages.pdf")], documents: plan.documents }, {}, (f) => progress.push(f), (d) => void seen.push(d.name));
    expect(blobReads).toBe(2);
    expect(r.documents).toEqual([]);
    expect(seen).toEqual(plan.documents.map((d) => d.name));
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("AC-437: two inputs give one flat ZIP with the planned names", async () => {
    const files = [await file("twelve.pdf"), await file("three-pages.pdf")];
    const plan = planSplit(files, { mode: { kind: "everyN", n: 2 } });
    const job = documentsJob("split", plan, files.map((f) => ({ id: f.id, name: f.name, source: source(f.id).source })));
    const out = await runJob(job, () => {});
    expect(out.name).toBe("berrypdf-split.zip");
    expect(out.type).toBe("application/zip");
    expect(out.entries?.map((e) => e.name)).toEqual(plan.documents.map((d) => d.name));
    const zip = unzipSync(new Uint8Array(await out.blob.arrayBuffer()));
    expect(Object.keys(zip)).toEqual(plan.documents.map((d) => d.name));
    expect(await pageTexts(zip["three-pages-3.pdf"])).toEqual(["Page 3"]);
  });

  it("AC-436: one document comes back as that PDF; Remove bookmarks reaches the engine", async () => {
    const f = await file("twelve.pdf");
    const plan = planSplit([f], { mode: { kind: "ranges", items: items("2-5") } });
    const out = await runJob(documentsJob("split", plan, [{ id: f.id, name: f.name, source: source(f.id).source }], { removeBookmarks: true }), () => {});
    expect(out).toMatchObject({ name: "twelve-2-5.pdf", type: "application/pdf", pageCount: 4 });
    const bytes = new Uint8Array(await out.blob.arrayBuffer());
    expect(await pageTexts(bytes)).toEqual(["Twelve 2", "Twelve 3", "Twelve 4", "Twelve 5"]);
    expect(await marks(bytes)).toEqual([]);
  });

  it("only the sources a plan uses are sent to the worker", async () => {
    const files = [await file("twelve.pdf"), await file("three-pages.pdf")];
    const plan = planExtract(files, { "twelve.pdf": [0] });
    const job = documentsJob("extract", plan, files.map((f) => ({ id: f.id, name: f.name, source: source(f.id).source })));
    expect(job.sources.map((s) => s.id)).toEqual(["twelve.pdf"]);
    expect(job.zipName).toBe("twelve.pdf");
  });

  it("rejects a plan with no pages", async () => {
    await expect(buildDocuments({ sources: [], documents: [] }, {}, () => {})).rejects.toThrow();
  });

  it("outlines are written with a positive /Count for open items", async () => {
    const d = await extract("twelve.pdf", "5-6");
    const doc = await plain(d.bytes);
    const root = doc.catalog.lookup(PDFName.of("Outlines"), PDFDict);
    expect((root.lookup(PDFName.of("Count")) as PDFNumber).asNumber()).toBe(2);
  });
});

describe("review nits", () => {
  it("/PrintPageRange is not copied into an output (its page numbers no longer match); other viewer preferences are", async () => {
    const doc = await PDFDocument.load(fx["links.pdf"]);
    doc.catalog.set(PDFName.of("ViewerPreferences"), doc.context.obj({ HideToolbar: true, NumCopies: 2, PrintPageRange: [0, 1, 3, 4] }));
    fx["prefs.pdf"] = await doc.save();
    const f = await file("prefs.pdf");
    const out = (await run(planExtract([f], pagesPerFile(items("2"), [f]))))[0];
    const organized = await merge(["prefs.pdf"], all("prefs.pdf", f.pageCount));
    for (const bytes of [out.bytes, organized.bytes]) {
      const prefs = (await plain(bytes)).catalog.lookup(PDFName.of("ViewerPreferences"), PDFDict);
      expect(prefs.get(PDFName.of("HideToolbar"))?.toString()).toBe("true");
      expect(prefs.get(PDFName.of("NumCopies"))?.toString()).toBe("2");
      expect(prefs.has(PDFName.of("PrintPageRange"))).toBe(false);
    }
  });

  it("PDF or ZIP is decided by the documents actually written (an empty one does not count)", async () => {
    const out = await runJob(
      { kind: "extract", sources: [source("twelve.pdf")], zipName: "berrypdf-extract.zip", documents: [{ name: "empty.pdf", pages: [] }, { name: "two.pdf", pages: [{ sourceId: "twelve.pdf", sourceIndex: 1, rotation: 0 }] }] },
      () => {},
    );
    expect(out.type).toBe("application/pdf");
    expect(out.name).toBe("two.pdf");
    expect(await pageTexts(new Uint8Array(await out.blob.arrayBuffer()))).toEqual(["Twelve 2"]);
  });

  it("AC-541: an encrypted source's Title and Info are carried (qpdf-made AES-256 file)", async () => {
    const name = "encryption/titled-aes256.pdf";
    fx[name] = new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));
    const f = await file(name);
    const extracted = await run(planExtract([f], pagesPerFile(items("2"), [f])));
    const split1 = await split([name], { kind: "every" });
    const organized = await merge([name], all(name, 3));
    for (const bytes of [extracted[0].bytes, split1[1].bytes, organized.bytes]) {
      const doc = await plain(bytes);
      expect(doc.isEncrypted).toBe(false);
      expect(doc.getTitle()).toBe("Encrypted Title é");
      expect(doc.getAuthor()).toBe("Ada Lovelace");
      expect(doc.getSubject()).toBe("Locked subject");
      expect(doc.getKeywords()).toBe("alpha, beta");
      expect(doc.getCreationDate()?.toISOString()).toBe("2025-01-02T03:04:05.000Z");
    }
  });

  it("Merge's Contents = Titles reads an encrypted source's Title", async () => {
    const name = "encryption/titled-aes256.pdf";
    fx[name] ??= new Uint8Array(await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));
    const r = await mergePdf({ sources: [source(name), source("three-pages.pdf")], pages: [...all(name, 3), ...all("three-pages.pdf", 3)], options: { ...ORGANIZE_OPTIONS, toc: "titles" } }, {}, () => {});
    expect((await pageTexts(r.bytes))[0]).toMatch(/^ContentsEncrypted T.*three-pages/);
  });

  it("an Info date that does not parse is left out; the other entries are kept", async () => {
    const doc = await PDFDocument.load(fx["links.pdf"], { updateMetadata: false });
    const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict);
    info.set(PDFName.of("CreationDate"), PDFString.of("yesterday"));
    fx["bad-date.pdf"] = await doc.save();
    const f = await file("bad-date.pdf");
    const out = await plain((await run(planExtract([f], pagesPerFile(items("1"), [f]))))[0].bytes);
    const outInfo = out.context.lookup(out.context.trailerInfo.Info, PDFDict);
    expect(outInfo.has(PDFName.of("CreationDate"))).toBe(false);
    expect(out.getTitle()).toBe(doc.getTitle());
  });

  it("a widget listed on a kept page stays, even when a dropped page lists it too", async () => {
    const e = await PDFDocument.create();
    e.addPage();
    e.addPage();
    const g = e.getForm().createTextField("shared");
    g.setText("w");
    g.addToPage(e.getPage(0), { x: 50, y: 500 });
    const w = e.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray).get(0);
    e.getPage(1).node.set(PDFName.of("Annots"), e.context.obj([w]));
    fx["shared-widget.pdf"] = await e.save();
    for (const keep of ["1", "2"]) {
      const f = await file("shared-widget.pdf");
      const out = (await run(planExtract([f], pagesPerFile(items(keep), [f]))))[0].bytes;
      const doc = await plain(out);
      const annots = doc.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray);
      expect(annots.asArray().map(String), keep).not.toContain("null");
      expect(doc.getForm().getTextField("shared").getText(), keep).toBe("w");
      expect(qpdfCheck(out), keep).toEqual([]);
    }
  });

  it("widgets written directly in /Annots count as widgets (so the form's /DR is copied)", async () => {
    const e = await PDFDocument.create();
    e.addPage();
    const g = e.getForm().createTextField("direct");
    g.addToPage(e.getPage(0), { x: 50, y: 500 });
    const annots = e.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray);
    const ref = annots.get(0) as PDFRef;
    annots.set(0, e.context.lookup(ref, PDFDict)); // the widget dict itself, not a ref
    expect(widgetsOf(e.getPage(0))).toEqual({ refs: [], count: 1 });
    e.getPage(0).node.set(PDFName.of("Annots"), e.context.obj([ref, e.context.obj({ Subtype: "Link", Rect: [0, 0, 1, 1] })]));
    expect(widgetsOf(e.getPage(0))).toEqual({ refs: [ref], count: 1 });
  });

  it("a page whose only widget is direct does not pull the form's /DR fonts into the part", async () => {
    const d = await PDFDocument.create();
    d.addPage();
    d.addPage();
    const f = d.getForm().createTextField("direct");
    f.setText("x");
    f.addToPage(d.getPage(0), { x: 50, y: 500 });
    const annots = d.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray);
    annots.set(0, d.context.lookup(annots.get(0) as PDFRef, PDFDict));
    const big = d.context.register(PDFRawStream.of(d.context.obj({}) as PDFDict, new Uint8Array(300_000).map((_, i) => (i * 7919) % 251)));
    const font = d.context.register(d.context.obj({ Type: "Font", Subtype: "TrueType", FontDescriptor: d.context.obj({ FontFile2: big }) }));
    d.catalog.lookup(PDFName.of("AcroForm"), PDFDict).set(PDFName.of("DR"), d.context.obj({ Font: d.context.obj({ BigF: font }) }));
    const bytes = await d.save();
    const r = await buildDocuments(
      { sources: [{ id: "x", name: "x.pdf", kind: "pdf", source: new Blob([bytes]) }], documents: [{ name: "a.pdf", pages: [{ sourceId: "x", sourceIndex: 0, rotation: 0 }] }] },
      {},
      () => {},
    );
    expect(bytes.length).toBeGreaterThan(300_000);
    expect(r.documents[0].bytes.length).toBeLessThan(50_000);
  });
});
