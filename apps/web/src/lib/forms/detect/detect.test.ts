import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { PDFDocument, degrees, rgb } from "@cantoo/pdf-lib";
import { addFields } from "../model";
import { pagesOf, readForm } from "../read";
import { inkIn, qpdfCheck, renderPage } from "../test-helpers";
import type { FormPage, Proposal } from "../types";
import { applyForms } from "../write";
import { analyzePage } from "./analyze";
import { DETECT_MAX_PIXELS, detectFields, detectScale, type Canvas2D } from "./run";
import { frameToView, viewToFrame } from "./view";

const fixtures = new URL("../../../../tests/fixtures/forms/", import.meta.url);
const parity = new URL("../../../../../../tests/parity/editor/", import.meta.url);
const fromPdfjs = createRequire(new URL("../../../../node_modules/pdfjs-dist/package.json", import.meta.url));
const { createCanvas } = fromPdfjs("@napi-rs/canvas") as { createCanvas: (w: number, h: number) => Canvas2D };

async function detect(src: URL | Uint8Array) {
  const bytes = src instanceof URL ? new Uint8Array(await readFile(src)) : src;
  const doc = await PDFDocument.load(bytes);
  const pages = pagesOf(doc).map((p, i) => ({ ...p, src: i }));
  const form = readForm(doc);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const progress: [number, number][] = [];
  try {
    const t0 = performance.now();
    const res = await detectFields(pdf as never, { pages, form, analyze: analyzePage, makeCanvas: createCanvas, onProgress: (d, t) => progress.push([d, t]), locale: "en-GB" });
    return { ...res, ms: performance.now() - t0, progress, pages, bytes, doc, form };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

const brief = (ps: Proposal[]) => ps.map((p) => `${p.field.widgets[0].page}:${p.field.kind}:${p.field.name}`);

/** Dark share of a strip in frame points on a rendered page (scale 2). */
const strip = (px: Awaited<ReturnType<typeof renderPage>>, x: number, y: number, w: number, h: number) => inkIn(px, x * 2, y * 2, w * 2, h * 2);

describe("Detect fields on report-form-3p.pdf (AC-241)", () => {
  it("proposes exactly the 7 fields of page 2, named from their labels, sitting on their lines and boxes", async () => {
    const r = await detect(new URL("report-form-3p.pdf", parity));
    expect(brief(r.proposals)).toEqual([
      "p1:text:full_name",
      "p1:text:email_address",
      "p1:text:phone",
      "p1:text:date_of_birth",
      "p1:checkbox:i_agree_to_the_terms",
      "p1:checkbox:send_me_updates",
      "p1:signature:signature",
    ]);
    expect(r.proposals.map((p) => p.field.tooltip)).toEqual(["Full name", "Email address", "Phone", "Date of birth (DD/MM/YYYY)", "I agree to the terms", "Send me updates", "Signature"]);
    expect(r.pagesWithFields).toBe(1);
    const px = await renderPage(r.bytes, 2, 2, false);
    for (const p of r.proposals) {
      const w = p.field.widgets[0];
      if (p.field.kind === "checkbox") {
        // Over the box: all four edges of the field are drawn edges of the box.
        expect(strip(px, w.x, w.y, w.w, 1)).toBeGreaterThan(0.5);
        expect(strip(px, w.x, w.y + w.h - 1, w.w, 1)).toBeGreaterThan(0.5);
        expect(strip(px, w.x, w.y, 1, w.h)).toBeGreaterThan(0.5);
        expect(strip(px, w.x + w.w - 1, w.y, 1, w.h)).toBeGreaterThan(0.5);
      } else {
        // On the line: the line runs right under the field's bottom edge, along its whole width.
        expect(strip(px, w.x + 1, w.y + w.h - 0.5, w.w - 2, 2)).toBeGreaterThan(0.3);
        // And the field is clear of the label and the line above.
        expect(strip(px, w.x + 1, w.y + 1, w.w - 2, w.h - 3)).toBeLessThan(0.01);
        expect(w.h).toBeGreaterThanOrEqual(p.field.kind === "signature" ? 18 : 12);
      }
    }
  });
});

describe("Detect fields on detect-mix.pdf (AC-242, AC-243, AC-244)", () => {
  it("finds every kind of blank on page 1, nothing on page 2, and only the new field on page 3", async () => {
    const r = await detect(new URL("detect-mix.pdf", fixtures));
    expect(brief(r.proposals)).toEqual([
      "p0:text:full_name",
      "p0:text:address",
      "p0:text:city",
      "p0:text:date_of_birth",
      "p0:text:pin_code",
      "p0:text:comments",
      "p0:radio:member_type",
      "p0:checkbox:i_accept_the_rules",
      "p0:checkbox:email_me_news",
      "p0:signature:signature",
      "p0:text:date",
      "p2:text:mobile",
    ]);
    const by = Object.fromEntries(r.proposals.map((p) => [p.field.name, p]));
    expect(by.full_name.source).toBe("line");
    expect(by.address.source).toBe("underscores");
    expect(by.city.source).toBe("dots");
    expect(by.pin_code.field).toMatchObject({ comb: true, maxLen: 6 });
    expect(by.comments.field).toMatchObject({ multiline: true });
    expect(by.member_type.field.widgets.map((w) => w.on)).toEqual(["Student", "Staff", "Guest"]);
    expect(by.member_type.field.tooltip).toBe("Member type?");
    expect(by.i_accept_the_rules.source).toBe("glyph");
    expect(by.date_of_birth.field.tooltip).toBe("Date of birth (DD/MM/YYYY)");
    expect(by.date.field.tooltip).toBe("Date (DD/MM/YYYY)");
    // AC-243: page 2 (border, heading rule, underlined words, a table full of text) gives nothing.
    expect(r.proposals.filter((p) => p.field.widgets[0].page === "p1")).toEqual([]);
    // AC-244: page 3's Phone already has a field; only Mobile is proposed.
    expect(r.pagesWithFields).toBe(2);
  });

  it("proposals become real fields that pass qpdf and show in pdf.js (AC-246, AC-247)", async () => {
    const r = await detect(new URL("detect-mix.pdf", fixtures));
    const state = addFields(r.form, r.proposals.map((p) => p.field));
    await applyForms(r.doc, r.doc.getPages(), r.pages, state, r.form);
    const out = await r.doc.save();
    expect(qpdfCheck(out)).toEqual([]);
    const back = readForm(await PDFDocument.load(out));
    expect(back.fields.map((f) => f.name).sort()).toEqual([...r.proposals.map((p) => p.field.name), "phone"].sort());
    expect(back.fields.find((f) => f.name === "pin_code")).toMatchObject({ comb: true, maxLen: 6 });
    expect(back.fields.find((f) => f.name === "member_type")?.widgets).toHaveLength(3);
  });

  it("uses the locale's date order in the hint", async () => {
    const bytes = new Uint8Array(await readFile(new URL("report-form-3p.pdf", parity)));
    const doc = await PDFDocument.load(bytes);
    const pages = pagesOf(doc).map((p, i) => ({ ...p, src: i }));
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
    const res = await detectFields(pdf as never, { pages, form: readForm(doc), analyze: analyzePage, makeCanvas: createCanvas, locale: "en-US" });
    await pdf.loadingTask.destroy();
    expect(res.proposals.find((p) => p.field.name === "date_of_birth")?.field.tooltip).toBe("Date of birth (MM/DD/YYYY)");
  });
});

describe("Detect fields on a scanned page (AC-245)", () => {
  it("finds the lines, boxes, comb, circles and squares with no text layer, named by kind", async () => {
    const r = await detect(new URL("scan-form.pdf", fixtures));
    expect(r.pagesScanned).toBe(1);
    expect(brief(r.proposals)).toEqual([
      "p0:text:text",
      "p0:text:text_2",
      "p0:text:text_3",
      "p0:text:text_4",
      "p0:text:text_5",
      "p0:text:text_6",
      "p0:radio:choice",
      "p0:checkbox:checkbox",
      "p0:checkbox:checkbox_2",
      "p0:text:text_7",
      "p0:text:text_8",
    ]);
    expect(r.proposals[4].field).toMatchObject({ comb: true, maxLen: 6 });
    expect(r.proposals[5].field).toMatchObject({ multiline: true });
    expect(r.proposals[6].field.widgets).toHaveLength(3);
  });
});

describe("Detect fields: no false positives on ordinary documents (AC-243)", () => {
  for (const f of ["std14-reportlab.pdf", "libreoffice-memo.pdf", "chrome-justified-mixed.pdf", "shared-xobject.pdf", "rotated-90.pdf", "font-coverage-1p.pdf"])
    it(`proposes nothing on ${f}`, async () => {
      const r = await detect(new URL(f, parity));
      expect(brief(r.proposals)).toEqual([]);
    });
});

describe("Detect fields: every page, progress, speed (AC-240)", () => {
  it("reports progress page by page and stays well under the time budget", async () => {
    const r = await detect(new URL("detect-mix.pdf", fixtures));
    expect(r.progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    // AC-240: 0.5 s per page on a desktop. Shared CI runners are slower, so CI gets twice that.
    expect(r.ms / 3).toBeLessThan(process.env.CI ? 1000 : 500);
  });

  it("renders huge pages smaller so a page never needs more than a few megapixels", async () => {
    expect(detectScale(595, 842)).toBe(2);
    for (const [w, h] of [[2384, 3370], [14400, 14400], [14400, 200]]) expect(w * h * detectScale(w, h) ** 2).toBeLessThanOrEqual(DETECT_MAX_PIXELS + 1);
    // An A0 form is rendered just under full scale and its blank is still found; a 5 m × 5 m page
    // (the PDF maximum) is scanned without running out of memory.
    const d = await PDFDocument.create();
    const a0 = d.addPage([2384, 3370]);
    a0.drawText("Name", { x: 100, y: 3000, size: 12 });
    a0.drawLine({ start: { x: 140, y: 2998 }, end: { x: 400, y: 2998 }, thickness: 1 });
    d.addPage([14400, 14400]).drawLine({ start: { x: 100, y: 7000 }, end: { x: 9000, y: 7000 }, thickness: 1 });
    const r = await detect(await d.save());
    expect(r.progress.at(-1)).toEqual([2, 2]);
    expect(r.proposals.filter((x) => x.field.widgets[0].page === "p0").map((x) => x.field.name)).toEqual(["name"]);
  });

  // Pages that would make a naive hole search or leader search slow (code review).
  const page = (draw: (data: Uint8Array, W: number, H: number) => void) => {
    const W = 1190;
    const H = 1684;
    const data = new Uint8Array(W * H).fill(255);
    draw(data, W, H);
    const t0 = performance.now();
    const found = analyzePage({ gray: { width: W, height: H, data, scale: 2 }, text: [], existing: [], taken: [], scanned: true });
    return { ms: performance.now() - t0, found };
  };
  it("stays fast on hatched, speckled and gridded pages", () => {
    const budget = process.env.CI ? 1000 : 500;
    const hatched = page((d, W, H) => {
      for (let k = -H; k < W; k += 6) for (let y = 0; y < H; y++) if (k + y >= 0 && k + y < W) d[y * W + k + y] = 0;
    });
    expect(hatched.ms).toBeLessThan(budget);
    expect(hatched.found).toEqual([]);
    const speckled = page((d, W, H) => {
      for (let y = 1; y < H - 1; y += 3) for (let x = 1 + (y % 7); x < W - 1; x += 14) d[y * W + x] = d[y * W + x + 1] = 0;
    });
    expect(speckled.ms).toBeLessThan(budget);
    const grid = page((d, W, H) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y % 20 === 0 || x % 20 === 0) d[y * W + x] = 0;
    });
    expect(grid.ms).toBeLessThan(2 * budget);
  });

  it("can be cancelled", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      (async () => {
        const bytes = new Uint8Array(await readFile(new URL("detect-mix.pdf", fixtures)));
        const doc = await PDFDocument.load(bytes);
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
        try {
          return await detectFields(pdf as never, { pages: pagesOf(doc).map((p, i) => ({ ...p, src: i })), form: readForm(doc), analyze: analyzePage, makeCanvas: createCanvas, signal: ctrl.signal });
        } finally {
          await pdf.loadingTask.destroy();
        }
      })(),
    ).rejects.toThrow(/cancelled/);
  });
});

describe("Detect fields on a turned page (AC-238 with detection)", () => {
  it("finds a blank on a page shown turned 90° and writes the field upright where it belongs", async () => {
    // The reader sees an 842 × 595 page; content is drawn turned so it reads upright.
    const made = await PDFDocument.create();
    const page = made.addPage([595, 842]);
    page.setRotation(degrees(90));
    const font = await made.embedFont("Helvetica");
    // Reader point (u, v) is user space (v, u) on this page.
    page.drawText("Name:", { x: 100, y: 72, size: 12, font, rotate: degrees(90) });
    page.drawLine({ start: { x: 102, y: 120 }, end: { x: 102, y: 320 }, thickness: 0.75, color: rgb(0, 0, 0) });
    const bytes = await made.save();
    const r = await detect(bytes);
    expect(brief(r.proposals)).toEqual(["p0:text:name"]);
    const entry: FormPage = r.pages[0];
    const w = r.proposals[0].field.widgets[0];
    // In the reader's view the field runs along the line, just above it.
    const o = { w: 595, h: 842, turn: 90 };
    const [u0, v0] = frameToView(o, w.x, w.y);
    const [u1, v1] = frameToView(o, w.x + w.w, w.y + w.h);
    const view = { x: Math.min(u0, u1), y: Math.min(v0, v1), w: Math.abs(u1 - u0), h: Math.abs(v1 - v0) };
    expect(view.x).toBeCloseTo(120, 0);
    expect(view.w).toBeCloseTo(200, 0);
    // The line is at v = 102 in the reader's view (user x = 102).
    expect(Math.abs(view.y + view.h - 102)).toBeLessThan(1.5);
    expect(viewToFrame(o, ...frameToView(o, 10, 20))).toEqual([10, 20]);
    // Written out, its text turns with the page.
    const state = addFields(r.form, r.proposals.map((p) => p.field));
    await applyForms(r.doc, r.doc.getPages(), [entry], state, r.form);
    const out = await r.doc.save();
    expect(qpdfCheck(out)).toEqual([]);
    const widget = (await PDFDocument.load(out)).getForm().getField("name").acroField.getWidgets()[0];
    expect(widget.getAppearanceCharacteristics()?.getRotation()).toBe(90);
  });
});
