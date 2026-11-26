/**
 * F5 output fidelity through the real UI (spec docs/specs/f4-f5-page-tools.md, "Improvement
 * acceptance criteria", I-1 to I-4): pruning on Organize (AC-537), bookmarks that follow a move and
 * keep their style (AC-540), links that follow their pages, Info and page layout (AC-541). Every
 * output of Organize, Combine & reorder and Alternate & mix also goes through qpdf's check, PDFium
 * and pdf.js (e2e/support/pdf-oracle.ts).
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, PDFName } from "pdf-lib";
import { outlineOf } from "../../src/lib/pdf/page-tool-fixtures";
import { oracle, renderDiff, requireOracle } from "../support/pdf-oracle";
import { downloadResult, fx, label, open, organizeMenu, pickF5, run, textsOf, tileAction, tileLabels, tileMain, tile } from "./support";

const input = async (name: string) => new Uint8Array(await readFile(fx(name)));
const words = async (bytes: Uint8Array) => (await textsOf(bytes)).map(label);
const linkWords = async (bytes: Uint8Array) => (await textsOf(bytes)).map((t) => t.match(/Link \d+|Page \d+/)?.[0] ?? t);

async function runAndDownload(page: Page) {
  await run(page);
  return downloadResult(page);
}

async function expectClean(files: Record<string, Uint8Array>, opts?: { ink?: boolean }) {
  expect(await oracle(files, opts), "qpdf --check, PDFium and pdf.js").toEqual({});
}

async function moveToFront(page: Page, tileLabel: string) {
  await tileAction(page, tileLabel, "Move to position…");
  await page.getByRole("dialog").getByRole("spinbutton").or(page.getByRole("dialog").getByRole("textbox")).first().fill("1");
  await page.getByRole("dialog").getByRole("button", { name: "Move", exact: true }).click();
  expect((await tileLabels(page))[0]).toBe(tileLabel);
}

/** Link annotations of a page as pdf.js resolves them, top to bottom (by the rect's y). */
async function linkTargets(bytes: Uint8Array, pageNumber: number) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  try {
    const annots = (await (await doc.getPage(pageNumber)).getAnnotations()) as { subtype: string; rect: number[]; dest?: unknown; url?: string }[];
    const out: { y: number; to: number | string | null }[] = [];
    for (const a of annots.filter((x) => x.subtype === "Link")) {
      if (a.url) out.push({ y: Math.round(a.rect[1]), to: a.url });
      else {
        const dest = (typeof a.dest === "string" ? await doc.getDestination(a.dest) : a.dest) as unknown[] | null;
        out.push({ y: Math.round(a.rect[1]), to: dest ? 1 + (await doc.getPageIndex(dest[0] as never).catch(() => -2)) : null });
      }
    }
    return out.sort((p, q) => q.y - p.y);
  } finally {
    await task.destroy();
  }
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
    layout: d.catalog.get(PDFName.of("PageLayout"))?.toString(),
  };
}

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "output checks run once, on the desktop project");
  requireOracle();
});

test("AC-537: Organize with shared-res.pdf after removing pages 2-12 gives one page under 15% of the input, rendered the same", async ({ page }) => {
  const src = await input("shared-res.pdf");
  await open(page, "organize-pdf");
  await pickF5(page, "shared-res.pdf");
  await tileMain(page, "A2").click();
  await tileMain(page, "A12").click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("selection-count")).toHaveText("11 selected");
  await organizeMenu(page, "Remove", "Remove selected");
  expect(await tileLabels(page)).toEqual(["A1"]);
  const out = await runAndDownload(page);
  expect(out.bytes.length).toBeLessThan(src.length * 0.15);
  expect(await textsOf(out.bytes)).toEqual(["Shared 1"]);
  expect(renderDiff(src, 1, out.bytes, 1), "pixels differing from source page 1").toBe(0);
  await expectClean({ [out.name]: out.bytes });
});

test("AC-540, AC-541: Organize with links.pdf, A12 moved to the front: bookmarks and links follow with their views and style; Info and layout carry over", async ({ page }) => {
  const src = await info(await input("links.pdf"));
  const t0 = Date.now() - 2000;
  await open(page, "organize-pdf");
  await pickF5(page, "links.pdf");
  await moveToFront(page, "A12");
  const out = await runAndDownload(page);
  expect(await linkWords(out.bytes)).toEqual([12, ...Array.from({ length: 11 }, (_, i) => i + 1)].map((n) => `Link ${n}`));
  // Bookmarks (AC-540): every target moved one page down; views, colour, bold and the closed state kept.
  const marks = await outlineOf(out.bytes);
  expect(marks.map((m) => m.title)).toEqual(["Intro", "Middle", "End"]);
  const [intro, middle, end] = marks;
  expect(intro).toMatchObject({ page: 2 });
  expect(middle).toMatchObject({ page: 6, view: ["XYZ", 0, 421, null], color: [255, 0, 0], bold: true, italic: false });
  expect(middle.count, "Middle stays closed").toBeLessThan(0);
  expect(middle.children[0]).toMatchObject({ title: "Detail", page: 7, view: ["XYZ", 0, 300, null] });
  expect(end).toMatchObject({ page: 11, view: ["FitH", 300] });
  // Links on the old page 1 (now page 2) follow their targets: L1 p3 → 4, L2 p10 → 11, L3 p5 → 6, L4 p4 → 5, URI unchanged.
  expect(await linkTargets(out.bytes, 2)).toEqual([
    { y: 700, to: 4 },
    { y: 660, to: 11 },
    { y: 620, to: 6 },
    { y: 580, to: 5 },
    { y: 540, to: "https://example.org/" },
  ]);
  // Info and layout (AC-541, Organize with links.pdf alone).
  const o = await info(out.bytes);
  expect(o).toMatchObject({ title: "Links fixture", author: "QA", subject: "Fixture", keywords: src.keywords, created: src.created, producer: "BerryPDF", layout: "/TwoColumnRight" });
  expect(o.modified).toBeGreaterThanOrEqual(t0);
  // The form field stays on its page (now page 4) and fillable.
  const doc = await PDFDocument.load(out.bytes);
  expect(doc.getForm().getTextField("name").getText()).toBe("Ada");
  await expectClean({ [out.name]: out.bytes });
});

test("AC-541: Organize with links.pdf + three-pages.pdf, and Alternate with the same two, copy no Title or Author", async ({ page }) => {
  await open(page, "organize-pdf");
  await pickF5(page, "links.pdf", "three-pages.pdf");
  const organized = await runAndDownload(page);
  expect(await textsOf(organized.bytes)).toHaveLength(15);
  const o = await info(organized.bytes);
  expect(o.title).toBeUndefined();
  expect(o.author).toBeUndefined();
  expect(o.producer).toBe("BerryPDF");

  await open(page, "alternate-mix-pdf");
  await pickF5(page, "links.pdf", "three-pages.pdf");
  const mixed = await runAndDownload(page);
  expect(await linkWords(mixed.bytes)).toEqual(["Link 1", "Page 1", "Link 2", "Page 2", "Link 3", "Page 3", ...Array.from({ length: 9 }, (_, i) => `Link ${i + 4}`)]);
  const a = await info(mixed.bytes);
  expect(a.title).toBeUndefined();
  expect(a.author).toBeUndefined();
  expect(await outlineOf(mixed.bytes)).toEqual([]);
  // Links follow their pages into the mixed order: L1 Link 3 → 5, L2 Link 10 → 13, L3 Link 5 → 8, L4 Link 4 → 7.
  expect(await linkTargets(mixed.bytes, 1)).toEqual([
    { y: 700, to: 5 },
    { y: 660, to: 13 },
    { y: 620, to: 8 },
    { y: 580, to: 7 },
    { y: 540, to: "https://example.org/" },
  ]);
  await expectClean({ organized: organized.bytes, mixed: mixed.bytes });
});

test("Output oracle: Organize with edits (rotate, duplicate, blank page, remove, reverse) passes qpdf's check, PDFium and pdf.js", async ({ page }) => {
  await open(page, "organize-pdf");
  await pickF5(page, "twelve.pdf", "mixed-sizes-4.pdf", "charlie.png");
  await tile(page, "A1").hover();
  await page.getByRole("button", { name: "Rotate A1 right" }).click();
  await tileAction(page, "A2", "Duplicate");
  await tileAction(page, "A3", "Blank page after");
  await tileMain(page, "A5").focus();
  await page.keyboard.press("Delete");
  await organizeMenu(page, "Sort", "Reverse order");
  const out = await runAndDownload(page);
  const doc = await PDFDocument.load(out.bytes);
  // 12 + 4 + 1 pages, one duplicate, one blank, one removed.
  expect(doc.getPageCount()).toBe(18);
  const texts = await words(out.bytes);
  expect(texts.filter((t) => t === "blank")).toHaveLength(2); // the blank page and the image page (no text)
  expect(texts).not.toContain("Twelve 5");
  expect(texts.at(-1)).toBe("Twelve 1");
  expect(doc.getPage(17).getRotation().angle).toBe(90);
  await expectClean({ [out.name]: out.bytes }, { ink: false });
});

test("Output oracle: Combine & reorder (Merge's engine) and Alternate & mix pass qpdf's check, PDFium and pdf.js", async ({ page }) => {
  await open(page, "combine-reorder-pdf");
  await pickF5(page, "bravo.pdf", "alpha.pdf", "mixed-sizes-4.pdf");
  await tileMain(page, "B1").focus();
  await page.keyboard.press("Alt+Home");
  const combined = await runAndDownload(page);
  expect(await textsOf(combined.bytes)).toHaveLength(9);

  await open(page, "alternate-mix-pdf");
  await pickF5(page, "odd.pdf", "even.pdf", "separator.pdf");
  const mixed = await runAndDownload(page);
  expect(await words(mixed.bytes)).toEqual(["Page 1", "Page 2", "Separator", "Page 3", "Page 4", "Separator", "Page 5", "Page 6", "Separator", "Page 7", "Page 8", "Separator", "Page 9", "Page 10"]);
  await expectClean({ combined: combined.bytes, mixed: mixed.bytes });
});
