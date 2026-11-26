/**
 * F4 output fidelity through the real UI (spec docs/specs/f4-f5-page-tools.md, "Improvement
 * acceptance criteria", I-1 to I-5): pruning (AC-536, AC-537), links (AC-538, AC-539), bookmarks
 * (AC-540), Info and page layout (AC-541) and form fields (AC-542) on Split, Extract and Delete.
 * Every output also goes through qpdf's check, PDFium and pdf.js (e2e/support/pdf-oracle.ts).
 * The engine's unit tests (src/lib/pdf/build.test.ts) check the same rules without the browser.
 */
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";
import { outlineOf } from "../../src/lib/pdf/page-tool-fixtures";
import { oracle, renderDiff, requireOracle } from "../support/pdf-oracle";
import { fx, isDesktop, openReady, runDownload, splitMode, stepper, textsOf, typeRange, type F4Slug } from "./support";

const input = async (name: string) => new Uint8Array(await readFile(fx(name)));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Every output of one run: the ZIP's entries, or the single PDF. */
const outputs = (out: Awaited<ReturnType<typeof runDownload>>): [string, Uint8Array][] => out.entries ?? [[out.name, out.bytes]];

async function runTool(page: import("@playwright/test").Page, slug: F4Slug, file: string, setup: () => Promise<void>) {
  await openReady(page, slug, file);
  await setup();
  return runDownload(page);
}

async function expectClean(files: [string, Uint8Array][], opts?: { ink?: boolean }) {
  expect(await oracle(Object.fromEntries(files), opts), "qpdf --check, PDFium and pdf.js").toEqual({});
}

/** Link annotations of a page as pdf.js resolves them, top to bottom, keyed by the fixture's link rows (y of the rect). */
async function linksByRow(bytes: Uint8Array, pageNumber: number) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  try {
    const annots = (await (await doc.getPage(pageNumber)).getAnnotations()) as { subtype: string; rect: number[]; dest?: unknown; url?: string }[];
    const out: { y: number; page: number | null; url?: string }[] = [];
    for (const a of annots.filter((x) => x.subtype === "Link")) {
      if (a.url) {
        out.push({ y: Math.round(a.rect[1]), page: null, url: a.url });
        continue;
      }
      const dest = (typeof a.dest === "string" ? await doc.getDestination(a.dest) : a.dest) as unknown[] | null;
      let target: number | null = null;
      if (dest) target = 1 + (await doc.getPageIndex(dest[0] as never).catch(() => -2));
      out.push({ y: Math.round(a.rect[1]), page: target });
    }
    return out.sort((p, q) => q.y - p.y);
  } finally {
    await task.destroy();
  }
}

/** /Link annotations in the page's /Annots, as written (before any viewer resolves them). */
async function rawLinkCount(bytes: Uint8Array, pageNumber: number) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const annots = doc.getPage(pageNumber - 1).node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (!annots) return 0;
  return annots.asArray().filter((r) => doc.context.lookup(r, PDFDict).get(PDFName.of("Subtype")) === PDFName.of("Link")).length;
}

/** Page objects (/Type /Page) anywhere in the file, reachable or not. */
async function pageObjects(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFDict && o.get(PDFName.of("Type")) === PDFName.of("Page")).length;
}

async function info(bytes: Uint8Array) {
  const d = await PDFDocument.load(bytes, { updateMetadata: false });
  return {
    title: d.getTitle(),
    author: d.getAuthor(),
    subject: d.getSubject(),
    keywords: d.getKeywords(),
    created: d.getCreationDate()?.toISOString(),
    producer: d.getProducer(),
    modified: d.getModificationDate()?.getTime(),
    layout: String(d.catalog.get(PDFName.of("PageLayout"))),
  };
}

test.beforeEach(async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "output checks run once, on the desktop project");
  requireOracle();
  await page.addInitScript(() => {
    for (const slug of ["split-pdf", "extract-pdf-pages", "delete-pdf-pages"]) localStorage.removeItem(`berrypdf:${slug}-options`);
  });
});

for (const name of ["shared-res.pdf", "inherited-res.pdf"]) {
  test(`AC-536, AC-537: Every page on ${name}: each part under 15% of the input, all together at most 1.25×, same PDFium render and text`, async ({ page }) => {
    test.slow();
    const src = await input(name);
    const out = await runTool(page, "split-pdf", name, async () => {});
    const parts = outputs(out);
    expect(parts).toHaveLength(12);
    let total = 0;
    for (const [i, [entry, bytes]] of parts.entries()) {
      expect(bytes.length, `${entry} size`).toBeLessThan(src.length * 0.15);
      total += bytes.length;
      expect(await textsOf(bytes), entry).toEqual([`Shared ${i + 1}`]);
      expect(renderDiff(src, i + 1, bytes, 1), `${entry}: pixels differing from source page ${i + 1}`).toBe(0);
    }
    expect(total).toBeLessThanOrEqual(src.length * 1.25);
    await expectClean(parts);
  });
}

test("AC-537: Extract page 1 and Delete pages 2-12 of shared-res.pdf each give one file under 15% of the input", async ({ page }) => {
  const src = await input("shared-res.pdf");
  const extracted = await runTool(page, "extract-pdf-pages", "shared-res.pdf", () => typeRange(page, "1"));
  const kept = await runTool(page, "delete-pdf-pages", "shared-res.pdf", () => typeRange(page, "2-12"));
  for (const [label, out] of [["extract", extracted], ["delete", kept]] as const) {
    expect(out.entries, label).toBeNull();
    expect(out.bytes.length, label).toBeLessThan(src.length * 0.15);
    expect(await textsOf(out.bytes), label).toEqual(["Shared 1"]);
    expect(renderDiff(src, 1, out.bytes, 1), label).toBe(0);
  }
  await expectClean([["extract", extracted.bytes], ["delete", kept.bytes]]);
});

test("AC-538: Extract 1-5 of links.pdf keeps four links on page 1, each to its new page; nothing is left of L2", async ({ page }) => {
  const out = await runTool(page, "extract-pdf-pages", "links.pdf", () => typeRange(page, "1-5"));
  expect(await textsOf(out.bytes)).toEqual(range(1, 5).map((n) => `Link ${n}`));
  expect(await rawLinkCount(out.bytes, 1)).toBe(4);
  // Rows in links.pdf: L1 y=700 → p3, L2 y=660 → p10, L3 y=620 "chap2" → p5, L4 y=580 GoTo → p4, L5 y=540 URI.
  expect(await linksByRow(out.bytes, 1)).toEqual([
    { y: 700, page: 3 },
    { y: 620, page: 5 },
    { y: 580, page: 4 },
    { y: 540, page: null, url: "https://example.org/" },
  ]);
  await expectClean([[out.name, out.bytes]]);
});

test("AC-539: Every page on links.pdf: one page object per part, part 1 keeps only the URI link; Delete page 10 drops only L2", async ({ page }) => {
  const split = await runTool(page, "split-pdf", "links.pdf", async () => {});
  const parts = outputs(split);
  expect(parts).toHaveLength(12);
  for (const [entry, bytes] of parts) expect(await pageObjects(bytes), entry).toBe(1);
  expect(await linksByRow(parts[0][1], 1)).toEqual([{ y: 540, page: null, url: "https://example.org/" }]);
  expect(await rawLinkCount(parts[0][1], 1)).toBe(1);
  await expectClean(parts);

  const del = await runTool(page, "delete-pdf-pages", "links.pdf", () => typeRange(page, "10"));
  expect(await textsOf(del.bytes)).toEqual([...range(1, 9), 11, 12].map((n) => `Link ${n}`));
  expect(await linksByRow(del.bytes, 1)).toEqual([
    { y: 700, page: 3 },
    { y: 620, page: 5 },
    { y: 580, page: 4 },
    { y: 540, page: null, url: "https://example.org/" },
  ]);
  await expectClean([[del.name, del.bytes]]);
});

test("AC-540: Extract 5-10 of links.pdf keeps the bookmarks' views, colour, bold and closed state", async ({ page }) => {
  const out = await runTool(page, "extract-pdf-pages", "links.pdf", () => typeRange(page, "5-10"));
  const marks = await outlineOf(out.bytes);
  expect(marks.map((m) => m.title)).toEqual(["Middle", "End"]);
  const [middle, end] = marks;
  expect(middle).toMatchObject({ page: 1, view: ["XYZ", 0, 421, null], color: [255, 0, 0], bold: true, italic: false });
  expect(middle.count, "Middle stays closed").toBeLessThan(0);
  expect(middle.children).toHaveLength(1);
  expect(middle.children[0]).toMatchObject({ title: "Detail", page: 2, view: ["XYZ", 0, 300, null] });
  expect(end).toMatchObject({ page: 6, view: ["FitH", 300] });
  await expectClean([[out.name, out.bytes]]);
});

test("AC-541: Split (each mode), Extract and Delete on links.pdf carry Info and /PageLayout; Producer and ModDate are ours", async ({ page }) => {
  test.slow();
  const src = await info(await input("links.pdf"));
  const t0 = Date.now() - 2000;
  const runs: [string, Awaited<ReturnType<typeof runDownload>>][] = [
    ["every page", await runTool(page, "split-pdf", "links.pdf", async () => {})],
    [
      "every 5",
      await runTool(page, "split-pdf", "links.pdf", async () => {
        await splitMode(page, "Every N pages");
        await stepper(page).fill("5");
      }),
    ],
    ["spreads", await runTool(page, "split-pdf", "links.pdf", () => splitMode(page, "Spreads"))],
    [
      "custom",
      await runTool(page, "split-pdf", "links.pdf", async () => {
        await splitMode(page, "Custom");
        await typeRange(page, "2-3, 7-12");
      }),
    ],
    ["extract", await runTool(page, "extract-pdf-pages", "links.pdf", () => typeRange(page, "3"))],
    ["delete", await runTool(page, "delete-pdf-pages", "links.pdf", () => typeRange(page, "1"))],
  ];
  const counts = runs.map(([label, out]) => [label, outputs(out).length]);
  expect(counts).toEqual([["every page", 12], ["every 5", 3], ["spreads", 7], ["custom", 2], ["extract", 1], ["delete", 1]]);
  const all: [string, Uint8Array][] = [];
  for (const [label, out] of runs)
    for (const [entry, bytes] of outputs(out)) {
      const o = await info(bytes);
      expect(o, `${label}: ${entry}`).toMatchObject({ title: "Links fixture", author: "QA", subject: "Fixture", keywords: src.keywords, created: src.created, producer: "BerryPDF", layout: "/TwoColumnRight" });
      expect(o.modified, `${label}: ${entry} ModDate`).toBeGreaterThanOrEqual(t0);
      all.push([`${label}: ${entry}`, bytes]);
    }
  await expectClean(all);
});

test("AC-542: Extract page 3 keeps the field 'name' = 'Ada' on page 1, fillable; Split 1-2, 3-12 puts it only in part 2", async ({ page }) => {
  const out = await runTool(page, "extract-pdf-pages", "links.pdf", () => typeRange(page, "3"));
  const doc = await PDFDocument.load(out.bytes);
  const form = doc.getForm();
  expect(form.getFields().map((f) => f.getName())).toEqual(["name"]);
  const field = form.getTextField("name");
  expect(field.getText()).toBe("Ada");
  const widgets = field.acroField.getWidgets();
  expect(widgets).toHaveLength(1);
  const widgetRef = doc.context.getObjectRef(widgets[0].dict) as PDFRef;
  const annots = doc.getPage(0).node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  expect(annots?.asArray().some((r) => r === widgetRef || String(r) === String(widgetRef)), "the widget sits on page 1").toBe(true);
  field.setText("Bo");
  const again = await PDFDocument.load(await doc.save());
  expect(again.getForm().getTextField("name").getText()).toBe("Bo");
  await expectClean([[out.name, out.bytes]]);

  const split = await runTool(page, "split-pdf", "links.pdf", async () => {
    await splitMode(page, "Custom");
    await typeRange(page, "1-2, 3-12");
  });
  const [first, second] = outputs(split);
  expect((await PDFDocument.load(first[1])).getForm().getFields()).toHaveLength(0);
  expect((await PDFDocument.load(second[1])).getForm().getFields().map((f) => f.getName())).toEqual(["name"]);
  await expectClean([first, second]);
});
