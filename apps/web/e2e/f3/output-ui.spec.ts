/**
 * F3 Merge: options driven through the UI, asserted on the DOWNLOADED merged PDF.
 * These ACs were covered only at engine level (src/lib/pdf/merge.test.ts); here each one goes
 * through the real options panel (inline dock on desktop, bottom sheet on mobile), the real
 * worker and the real download, then the file is read with upstream pdf-lib and pdf.js.
 * Spec: docs/specs/f3-merge.md §7.
 */
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import {
  card,
  chooseMenu,
  firstWord,
  fx,
  linkTargets,
  loadPlain,
  occurrences,
  openMerge,
  outlineOf,
  pickBuffers,
  pickMerge,
  runAndDownload,
  setMergeOptions,
  showPages,
  textPlacement,
  textsOf,
  tile,
  tileLabels,
  widgetsOf,
} from "./support";

const FOOTER = "Add file name to the footer";
const DOUBLE = "Pad for double-sided printing";
const SAME_WIDTH = "Make all pages the same width";
const COVER = "First file is a cover";

const sizesOf = async (bytes: Uint8Array) => (await loadPlain(bytes)).getPages().map((p) => [p.getWidth(), p.getHeight()]);
const mediaBoxesOf = async (bytes: Uint8Array) =>
  (await loadPlain(bytes)).getPages().map((p) => {
    const b = p.getMediaBox();
    return [b.x, b.y, b.width, b.height];
  });

test.beforeEach(async ({ page }) => {
  await openMerge(page);
});

// ---------------------------------------------------------------- bookmarks

test("AC-43: Keep all keeps both files' outlines, nested, on the right pages", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await setMergeOptions(page, { bookmarks: "keep" });
  const out = await runAndDownload(page);
  expect(await outlineOf(out.bytes)).toEqual([
    { title: "Alpha intro", page: 1, children: [{ title: "Alpha detail", page: 2, children: [] }] },
    { title: "Alpha end", page: 3, children: [] },
    { title: "Bravo start", page: 4, children: [] },
  ]);
});

test("AC-44: Remove all leaves no outline items", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await setMergeOptions(page, { bookmarks: "remove" });
  const out = await runAndDownload(page);
  expect(await outlineOf(out.bytes)).toEqual([]);
});

test("AC-45: One per file gives exactly alpha -> 1 and bravo -> 4, no children", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await setMergeOptions(page, { bookmarks: "perFile" });
  const out = await runAndDownload(page);
  expect(await outlineOf(out.bytes)).toEqual([
    { title: "alpha", page: 1, children: [] },
    { title: "bravo", page: 4, children: [] },
  ]);
});

test("AC-46: One per file, keep existing inside nests each file's outline", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await setMergeOptions(page, { bookmarks: "perFileNested" });
  const out = await runAndDownload(page);
  expect(await outlineOf(out.bytes)).toEqual([
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

test("AC-47: bookmarks follow page edits made in the pages view", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tile(page, "A3").hover();
  await page.getByRole("button", { name: "Remove A3" }).click();
  await tile(page, "B1").getByTestId("tile-main").focus();
  await page.keyboard.press("Alt+Home");
  expect(await tileLabels(page)).toEqual(["B1", "A1", "A2", "B2"]);
  const out = await runAndDownload(page);
  const marks = await outlineOf(out.bytes);
  // The AC fixes the items and their targets, not their order (the app lists them in page order).
  expect(marks).toHaveLength(2);
  expect(marks).toContainEqual({ title: "Alpha intro", page: 2, children: [{ title: "Alpha detail", page: 3, children: [] }] });
  expect(marks).toContainEqual({ title: "Bravo start", page: 1, children: [] });
  expect(JSON.stringify(marks)).not.toContain("Alpha end");
});

// ---------------------------------------------------------------- contents page

test("AC-49: the contents page links each file name to its first page (2 and 5)", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await setMergeOptions(page, { toc: "File names" });
  const out = await runAndDownload(page);
  expect(await linkTargets(out.bytes, 1)).toEqual([2, 5]);
  const t = (await textsOf(out.bytes)).map(firstWord);
  expect(t.slice(1)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2"]);
});

test("AC-50: Document titles lists the Title of each file, or its name when it has none", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf", "echo.pdf");
  await setMergeOptions(page, { toc: "Document titles" });
  const out = await runAndDownload(page);
  const t = await textsOf(out.bytes);
  expect(t).toHaveLength(7);
  expect(t[0]).toMatch(/Alpha Report.*Bravo Brief.*echo\.pdf/);
  expect(t[0]).not.toContain("alpha.pdf");
  expect(await linkTargets(out.bytes, 1)).toEqual([2, 5, 7]);
});

test("AC-51: with a cover, the contents page follows the first file and does not list it", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf", "echo.pdf");
  await setMergeOptions(page, { toc: "File names", switches: [COVER] });
  const out = await runAndDownload(page);
  const t = await textsOf(out.bytes);
  expect(t).toHaveLength(7);
  expect([0, 1, 2, 4, 5, 6].map((i) => firstWord(t[i]))).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "Bravo 1", "Bravo 2", "Echo 1"]);
  expect(t[3]).toMatch(/bravo\.pdf\s*5.*echo\.pdf\s*7/);
  expect(t[3]).not.toContain("alpha.pdf");
  expect(await linkTargets(out.bytes, 4)).toEqual([5, 7]);
});

test("AC-52: 50 one-page files: every entry on the contents pages, every link right", { tag: "@serial" }, async ({ page }) => {
  test.setTimeout(120_000);
  const echo = await readFile(fx("echo.pdf"));
  const names = Array.from({ length: 50 }, (_, i) => `f${String(i + 1).padStart(2, "0")}.pdf`);
  await pickBuffers(page, names.map((name) => ({ name, buffer: echo })));
  await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(page.getByTestId("file-card")).toHaveCount(50);
  await setMergeOptions(page, { toc: "File names" });
  const out = await runAndDownload(page);
  const t = await textsOf(out.bytes);
  const toc = t.length - 50;
  expect(toc, "the 50 entries need more than one contents page").toBeGreaterThan(1);
  const targets: number[] = [];
  for (let i = 1; i <= toc; i++) targets.push(...(await linkTargets(out.bytes, i)));
  expect(targets).toEqual(names.map((_, i) => toc + 1 + i));
  const tocText = t.slice(0, toc).join("\n");
  for (const n of names) expect(occurrences(tocText, n), n).toBe(1);
  expect(t.slice(toc).every((x) => x.includes("Echo 1"))).toBe(true);
});

test("AC-53: the contents page has the same MediaBox as the first content page", async ({ page }) => {
  // bravo first (landscape 792x612) proves the size is copied, not a fixed A4.
  await pickMerge(page, "bravo.pdf");
  await pickMerge(page, "alpha.pdf");
  await setMergeOptions(page, { toc: "File names" });
  const out = await runAndDownload(page);
  const boxes = await mediaBoxesOf(out.bytes);
  expect(boxes[0]).toEqual(boxes[1]);
  expect(boxes[1]).toEqual([0, 0, 792, 612]);
});

// ---------------------------------------------------------------- footer

test("AC-55: footer + contents + double-sided + an inserted blank: only content pages carry a file name", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await showPages(page);
  await tile(page, "A3").hover();
  await page.getByRole("button", { name: "Insert here, after A3" }).click();
  await page.getByRole("menuitem", { name: "Blank page here" }).click();
  expect(await tileLabels(page)).toEqual(["A1", "A2", "A3", "Blank", "B1", "B2"]);
  await setMergeOptions(page, { toc: "File names", switches: [FOOTER, DOUBLE] });
  const out = await runAndDownload(page);
  const t = await textsOf(out.bytes);
  expect(t.length % 2).toBe(0);
  // The contents page lists each name once (as an entry), with no footer added.
  expect(occurrences(t[0], "alpha.pdf")).toBe(1);
  expect(occurrences(t[0], "bravo.pdf")).toBe(1);
  let generated = 0;
  for (const [i, text] of t.entries()) {
    if (i === 0) continue;
    if (/Alpha \d/.test(text)) expect(text, `page ${i + 1}`).toContain("alpha.pdf");
    else if (/Bravo \d/.test(text)) expect(text, `page ${i + 1}`).toContain("bravo.pdf");
    else {
      generated++;
      expect(text.trim(), `padding/blank page ${i + 1} must have no text`).toBe("");
    }
  }
  expect(generated, "the inserted blank and at least one padding page").toBeGreaterThanOrEqual(2);
  // The inserted blank sits right after Alpha 3.
  const a3 = t.findIndex((x) => x.includes("Alpha 3"));
  expect(t[a3 + 1].trim()).toBe("");
});

test("AC-56: on a pre-rotated page the footer reads upright in the bottom 15% of the rendered page", async ({ page }) => {
  await pickMerge(page, "pre-rotated.pdf");
  await setMergeOptions(page, { switches: [FOOTER] });
  const out = await runAndDownload(page);
  const doc = await loadPlain(out.bytes);
  expect(doc.getPage(1).getRotation().angle).toBe(90);
  const at = await textPlacement(out.bytes, 2, "pre-rotated.pdf");
  expect(at, "footer text on page 2").not.toBeNull();
  expect(at!.angle).toBe(0);
  expect(at!.y).toBeGreaterThan(0.85);
  expect(at!.y).toBeLessThanOrEqual(1);
  expect(at!.x).toBeGreaterThanOrEqual(0);
  expect(at!.x).toBeLessThan(1);
});

// ---------------------------------------------------------------- double-sided

test("AC-58: double-sided pads alpha and echo with a blank of the previous page's size", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf", "echo.pdf");
  await setMergeOptions(page, { switches: [DOUBLE] });
  const out = await runAndDownload(page);
  expect((await textsOf(out.bytes)).map(firstWord)).toEqual(["Alpha 1", "Alpha 2", "Alpha 3", "blank", "Bravo 1", "Bravo 2", "Echo 1", "blank"]);
  const boxes = await mediaBoxesOf(out.bytes);
  expect(boxes[3]).toEqual(boxes[2]);
  expect(boxes[7]).toEqual(boxes[6]);
});

test("AC-59: double-sided + contents: every file starts on an odd page and the total is even", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf", "echo.pdf");
  await setMergeOptions(page, { toc: "File names", switches: [DOUBLE] });
  const out = await runAndDownload(page);
  const t = await textsOf(out.bytes);
  expect(t.length % 2).toBe(0);
  for (const start of ["Alpha 1", "Bravo 1", "Echo 1"]) {
    const idx = t.findIndex((x) => x.includes(start));
    expect(idx, start).toBeGreaterThan(0);
    expect((idx + 1) % 2, `${start} on page ${idx + 1}`).toBe(1);
  }
  // The contents page's page numbers agree with where the files landed.
  const links = await linkTargets(out.bytes, 1);
  expect(links).toEqual(["Alpha 1", "Bravo 1", "Echo 1"].map((s) => t.findIndex((x) => x.includes(s)) + 1));
});

// ---------------------------------------------------------------- same width

test("AC-60: same width scales bravo to 595 wide, about 459 tall, text kept", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await setMergeOptions(page, { switches: [SAME_WIDTH] });
  const out = await runAndDownload(page);
  const s = await sizesOf(out.bytes);
  expect(s).toHaveLength(5);
  for (const [w] of s) expect(Math.abs(w - 595)).toBeLessThanOrEqual(0.5);
  for (const [, h] of s.slice(3)) expect(Math.abs(h - (612 * 595) / 792)).toBeLessThanOrEqual(1);
  expect((await textsOf(out.bytes)).map(firstWord).slice(3)).toEqual(["Bravo 1", "Bravo 2"]);
});

test("AC-61: same width with bravo first makes the alpha pages 792 x 1120.7", async ({ page }) => {
  await pickMerge(page, "alpha.pdf", "bravo.pdf");
  await chooseMenu(page, "Sort", "Name Z to A");
  await expect(card(page, "bravo.pdf")).toBeVisible();
  await setMergeOptions(page, { switches: [SAME_WIDTH] });
  const out = await runAndDownload(page);
  const s = await sizesOf(out.bytes);
  expect((await textsOf(out.bytes)).map(firstWord)).toEqual(["Bravo 1", "Bravo 2", "Alpha 1", "Alpha 2", "Alpha 3"]);
  for (const [w] of s) expect(Math.abs(w - 792)).toBeLessThanOrEqual(0.5);
  for (const [, h] of s.slice(2)) expect(Math.abs(h - 1120.7)).toBeLessThanOrEqual(1);
});

// ---------------------------------------------------------------- form fields

test("AC-63: Form fields = Merge shares one name field (two widgets, value Ann) plus agree", async ({ page }) => {
  await pickMerge(page, "form-a.pdf", "form-b.pdf");
  await setMergeOptions(page, { forms: "merge" });
  const out = await runAndDownload(page);
  const { byName } = await widgetsOf(out.bytes);
  expect(Object.keys(byName).sort()).toEqual(["agree", "name"]);
  expect(byName.name.map((w) => w.page).sort()).toEqual([0, 1]);
  expect(byName.name.every((w) => w.value === "Ann")).toBe(true);
  const form = (await loadPlain(out.bytes)).getForm();
  expect(form.getFields().map((f) => f.getName()).sort()).toEqual(["agree", "name"]);
  expect(form.getTextField("name").getText()).toBe("Ann");
});

test("AC-64: Form fields = Remove leaves no fields and no widget annotations", async ({ page }) => {
  await pickMerge(page, "form-a.pdf", "form-b.pdf");
  await setMergeOptions(page, { forms: "remove" });
  const out = await runAndDownload(page);
  const { byName, perPage } = await widgetsOf(out.bytes);
  expect(Object.keys(byName)).toEqual([]);
  expect(perPage).toEqual([0, 0]);
  expect((await loadPlain(out.bytes)).getForm().getFields()).toHaveLength(0);
});

test("AC-62: the default (merge, rename duplicates) gives name, agree and name_2, each widget on its own page", async ({ page }) => {
  await pickMerge(page, "form-a.pdf", "form-b.pdf");
  const out = await runAndDownload(page);
  const { byName, perPage } = await widgetsOf(out.bytes);
  expect(Object.keys(byName).sort()).toEqual(["agree", "name", "name_2"]);
  expect(byName.name).toEqual([{ value: "Ann", page: 0 }]);
  expect(byName.name_2).toEqual([{ value: "Ben", page: 1 }]);
  expect(perPage).toEqual([2, 1]);
  expect((await loadPlain(out.bytes)).getForm().getCheckBox("agree").isChecked()).toBe(true);
});

test("AC-65: Flatten leaves no fields or widgets, and Ann / Ben are page text", async ({ page }) => {
  await pickMerge(page, "form-a.pdf", "form-b.pdf");
  await setMergeOptions(page, { forms: "flatten" });
  const out = await runAndDownload(page);
  const { byName, perPage } = await widgetsOf(out.bytes);
  expect(Object.keys(byName)).toEqual([]);
  expect(perPage).toEqual([0, 0]);
  const t = await textsOf(out.bytes);
  expect(t[0]).toContain("Ann");
  expect(t[1]).toContain("Ben");
});

// ---------------------------------------------------------------- images and size

test("AC-67: image pages: PNG on landscape A4, JPEG on portrait A4, one centered image each, JPEG kept as DCT", async ({ page }) => {
  await pickMerge(page, "charlie.png", "delta.jpg");
  const out = await runAndDownload(page);
  const doc = await loadPlain(out.bytes);
  expect(doc.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
    [842, 595],
    [595, 842],
  ]);
  const filters: string[] = [];
  for (const [i, p] of doc.getPages().entries()) {
    const xobjects = p.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    const images = (xobjects?.keys() ?? [])
      .map((k) => doc.context.lookup(xobjects!.get(k)))
      .filter((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype"))?.toString() === "/Image");
    expect(images, `page ${i + 1} draws exactly one image`).toHaveLength(1);
    filters.push(String(images[0].dict.get(PDFName.of("Filter"))));
  }
  expect(filters[1]).toBe("/DCTDecode");
  // Centered inside the 36 pt margin: read the image's placement from pdf.js's operator list.
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: out.bytes.slice(), verbosity: 0 }).promise;
  try {
    for (let n = 1; n <= 2; n++) {
      const pg = await pdf.getPage(n);
      const ops = await pg.getOperatorList();
      // Track the CTM through q/Q/cm up to the image paint.
      const mul = (a: number[], b: number[]) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
      let ctm = [1, 0, 0, 1, 0, 0];
      const stack: number[][] = [];
      let m: number[] | null = null;
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
        else if (fn === OPS.transform) ctm = mul(ops.argsArray[i] as number[], ctm);
        else if (fn === OPS.paintImageXObject) {
          m = ctm;
          break;
        }
      }
      expect(m, `page ${n} transform before the image`).not.toBeNull();
      const [w, , , h, x, y] = m!;
      const [W, H] = n === 1 ? [842, 595] : [595, 842];
      expect(Math.abs(x + w / 2 - W / 2), `page ${n} centered horizontally`).toBeLessThanOrEqual(1);
      expect(Math.abs(y + h / 2 - H / 2), `page ${n} centered vertically`).toBeLessThanOrEqual(1);
      expect(x).toBeGreaterThanOrEqual(36 - 0.5);
      expect(y).toBeGreaterThanOrEqual(36 - 0.5);
    }
  } finally {
    await pdf.loadingTask.destroy();
  }
});

test("AC-69: sixty-pages.pdf + alpha.pdf with defaults stays within inputs x 1.1 + 50 KB", async ({ page }) => {
  await pickMerge(page, "sixty-pages.pdf", "alpha.pdf");
  const out = await runAndDownload(page);
  const inputs = (await readFile(fx("sixty-pages.pdf"))).length + (await readFile(fx("alpha.pdf"))).length;
  expect(out.bytes.length).toBeLessThanOrEqual(inputs * 1.1 + 50 * 1024);
  expect((await loadPlain(out.bytes)).getPageCount()).toBe(63);
});
