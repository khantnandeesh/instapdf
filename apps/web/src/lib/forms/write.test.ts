import { readFile } from "node:fs/promises";
import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { toPdfRect } from "./frame";
import { addField, addRadioButton, createField, deleteField, emptyForm, repeatOnAllPages, setValue, updateField } from "./model";
import { pagesOf, readForm } from "./read";
import { sortByColumns, sortByRows } from "./taborder";
import { annotationsOf, inkIn, qpdfCheck, renderPage } from "./test-helpers";
import type { FormState } from "./types";
import { applyForms } from "./write";

const fixture = async (name: string) => new Uint8Array(await readFile(new URL(`../../../tests/fixtures/forms/${name}`, import.meta.url)));

async function blankDoc(n = 1, setup?: (doc: PDFDocument) => void) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([595, 842]);
  setup?.(doc);
  return PDFDocument.load(await doc.save());
}

/** Loads, reads, applies a change to the model, writes, and returns the saved bytes. */
async function roundTrip(bytes: Uint8Array, change: (s: FormState, pages: ReturnType<typeof pagesOf>) => FormState) {
  const doc = await PDFDocument.load(bytes);
  const pages = pagesOf(doc);
  const original = readForm(doc, pages);
  const next = change(original, pages);
  const report = await applyForms(doc, doc.getPages(), pages, next, original);
  return { bytes: await doc.save(), report };
}

describe("applyForms: fill (AC-231, AC-233)", () => {
  it("writes values with appearance streams that pdf.js draws, and the output passes qpdf", async () => {
    const src = await fixture("form-basic.pdf");
    const { bytes } = await roundTrip(src, (s) => {
      const id = (n: string) => s.fields.find((f) => f.name === n)!.id;
      s = setValue(s, id("name"), "Asha Verma").state;
      s = setValue(s, id("agree"), "Yes").state;
      s = setValue(s, id("size"), "large").state;
      s = setValue(s, id("colour"), "Blue").state;
      s = setValue(s, id("days"), ["Mon", "Wed"]).state;
      s = setValue(s, id("address.town"), "Pune").state;
      return s;
    });
    expect(qpdfCheck(bytes)).toEqual([]);
    const back = readForm(await PDFDocument.load(bytes));
    const v = Object.fromEntries(back.fields.map((f) => [f.name, f.value]));
    expect(v).toMatchObject({ name: "Asha Verma", agree: back.fields.find((f) => f.name === "agree")!.widgets[0].on, size: "large", colour: "Blue", days: ["Mon", "Wed"], "address.town": "Pune" });
    // pdf.js draws the value from the appearance stream: ink inside the name box.
    const name = back.fields.find((f) => f.name === "name")!.widgets[0];
    const px = await renderPage(bytes, 1, 2);
    expect(inkIn(px, name.x * 2, name.y * 2, name.w * 2, name.h * 2)).toBeGreaterThan(0.02);
  });

  it("leaves fields the user did not touch byte for byte (AC-231)", async () => {
    const src = await fixture("form-basic.pdf");
    const before = await PDFDocument.load(src);
    const apOf = (doc: PDFDocument, name: string) => {
      const ap = doc.getForm().getField(name).acroField.getWidgets()[0].getAppearances()?.normal;
      if (!ap || !("contents" in ap)) return String(ap);
      return Buffer.from((ap as unknown as { contents: Uint8Array }).contents).toString("latin1");
    };
    const { bytes } = await roundTrip(src, (s) => setValue(s, s.fields.find((f) => f.name === "name")!.id, "x").state);
    const after = await PDFDocument.load(bytes);
    for (const n of ["notes", "pin", "colour", "days", "code"]) expect(apOf(after, n)).toBe(apOf(before, n));
  });

  it("refuses values on read-only fields and over max length (AC-233)", async () => {
    const s = readForm(await PDFDocument.load(await fixture("form-basic.pdf")));
    const code = s.fields.find((f) => f.name === "code")!;
    expect(setValue(s, code.id, "B").error).toBe("read-only");
    const pin = s.fields.find((f) => f.name === "pin")!;
    expect(setValue(s, pin.id, "1234567").error).toBe("too-long");
    expect(setValue(s, pin.id, "123456").error).toBeUndefined();
  });
});

describe("applyForms: text outside WinAnsi (AC-232)", () => {
  it("embeds an open font that covers the value", async () => {
    const fontkit = (await import("@cantoo/fontkit")).default;
    const fonts = {
      manifest: async () => ({
        fonts: [
          { file: "noto-sans-latin-ext-400-normal.woff", ranges: [[0x0100, 0x024f], [0x20a0, 0x20c0]] as [number, number][] },
          { file: "noto-sans-latin-400-normal.woff", ranges: [[0x0000, 0x00ff], [0x2000, 0x206f]] as [number, number][] },
          { file: "noto-sans-cyrillic-400-normal.woff", ranges: [[0x0400, 0x045f]] as [number, number][] },
        ],
      }),
      load: async (file: string) => new Uint8Array(await readFile(new URL(`../../../node_modules/@fontsource/noto-sans/files/${file}`, import.meta.url))),
    };
    for (const value of ["Zoë Šťastná ₹ 5,000", "Ирина"]) {
      const doc = await blankDoc();
      const pages = pagesOf(doc);
      const original = readForm(doc, pages);
      let s = addField(original, createField(original, { kind: "text", page: "p0", box: { x: 72, y: 72, w: 260, h: 24 }, name: "who" }));
      s = setValue(s, s.fields[0].id, value).state;
      const report = await applyForms(doc, doc.getPages(), pages, s, original, { fonts, fontkit });
      expect(report.missingGlyphs).toEqual([]);
      const bytes = await doc.save();
      expect(qpdfCheck(bytes)).toEqual([]);
      const back = readForm(await PDFDocument.load(bytes));
      expect(back.fields[0].value).toBe(value);
      const px = await renderPage(bytes, 1, 2);
      expect(inkIn(px, 72 * 2, 72 * 2, 260 * 2, 24 * 2)).toBeGreaterThan(0.02);
    }
  });
});

describe("applyForms: create (AC-234, AC-235, AC-237)", () => {
  it("creates every kind with its AcroForm structure and properties", async () => {
    const doc = await blankDoc(2);
    const pages = pagesOf(doc);
    const original = readForm(doc, pages);
    let s = original;
    const add = (init: Parameters<typeof createField>[1]) => {
      const f = createField(s, init);
      s = addField(s, f);
      return f;
    };
    const t = add({ kind: "text", page: "p0", box: { x: 72, y: 72, w: 200, h: 20 }, name: "full_name", tooltip: "Full name" });
    s = updateField(s, t.id, { required: true, maxLen: 30, style: { ...t.style, fontSize: 11, align: "center", color: "#1a4fd6", border: "#000000", background: "#eef3ff" }, defaultValue: "N/A" });
    const ml = add({ kind: "text", page: "p0", box: { x: 72, y: 110, w: 200, h: 60 }, name: "notes", multiline: true });
    const comb = add({ kind: "text", page: "p0", box: { x: 72, y: 190, w: 120, h: 20 }, name: "pin" });
    s = updateField(s, comb.id, { comb: true, maxLen: 6 });
    const dd = add({ kind: "dropdown", page: "p0", box: { x: 72, y: 230, w: 120, h: 20 }, name: "colour", options: ["Red", "Green"] });
    const ls = add({ kind: "list", page: "p0", box: { x: 72, y: 270, w: 120, h: 50 }, name: "days", options: ["Mon", "Tue", "Wed"] });
    s = updateField(s, ls.id, { multiSelect: true });
    const rg = add({ kind: "radio", page: "p0", box: { x: 72, y: 340, w: 14, h: 14 }, name: "size", options: ["small"] });
    s = addRadioButton(s, rg.id, { x: 120, y: 340, w: 14, h: 14 });
    const cb = add({ kind: "checkbox", page: "p0", box: { x: 72, y: 380, w: 14, h: 14 }, name: "agree" });
    const sig = add({ kind: "signature", page: "p0", box: { x: 72, y: 420, w: 200, h: 40 }, name: "signature" });
    s = repeatOnAllPages(s, sig.id, pages);
    s = setValue(s, dd.id, "Green").state;
    s = setValue(s, ls.id, ["Mon", "Wed"]).state;
    s = setValue(s, rg.id, s.fields.find((f) => f.id === rg.id)!.widgets[1].on!).state;
    s = setValue(s, cb.id, "Yes").state;
    void ml;

    await applyForms(doc, doc.getPages(), pages, s, original);
    const bytes = await doc.save();
    expect(qpdfCheck(bytes)).toEqual([]);
    const back = readForm(await PDFDocument.load(bytes));
    const by = Object.fromEntries(back.fields.map((f) => [f.name, f]));
    expect(by.full_name).toMatchObject({ kind: "text", tooltip: "Full name", required: true, maxLen: 30, defaultValue: "N/A", style: { fontSize: 11, align: "center", color: "#1a4fd6", border: "#000000", background: "#eef3ff" } });
    expect(by.notes).toMatchObject({ kind: "text", multiline: true });
    expect(by.pin).toMatchObject({ comb: true, maxLen: 6 });
    expect(by.colour).toMatchObject({ kind: "dropdown", options: ["Red", "Green"], value: "Green" });
    expect(by.days).toMatchObject({ kind: "list", multiSelect: true, value: ["Mon", "Wed"] });
    expect(by.size).toMatchObject({ kind: "radio", value: "Choice2" });
    expect(by.size.widgets.map((w) => w.on)).toEqual(["small", "Choice2"]);
    expect(by.agree).toMatchObject({ kind: "checkbox", value: "Yes" });
    // Repeat on all pages: one field, one widget per page.
    expect(by.signature.kind).toBe("signature");
    expect(by.signature.widgets.map((w) => w.page)).toEqual(["p0", "p1"]);
    // Boxes land where they were drawn.
    expect(by.full_name.widgets[0]).toMatchObject({ x: 72, y: 72, w: 200, h: 20 });

    // AC-237: the signature field draws a visible border and label in pdf.js.
    const ann = await annotationsOf(bytes, 2);
    expect(ann.some((a) => a.fieldType === "Sig" && a.hasAppearance)).toBe(true);
    const px = await renderPage(bytes, 2, 2);
    expect(inkIn(px, 72 * 2, 420 * 2, 200 * 2, 40 * 2)).toBeGreaterThan(0.01);
  });

  it("makes names unique and refuses dots (AC-235)", async () => {
    let s = emptyForm();
    s = addField(s, createField(s, { kind: "text", page: "p0", box: { x: 0, y: 0, w: 10, h: 10 }, name: "full_name" }));
    s = addField(s, createField(s, { kind: "text", page: "p0", box: { x: 0, y: 0, w: 10, h: 10 }, name: "full_name" }));
    s = addField(s, createField(s, { kind: "text", page: "p0", box: { x: 0, y: 0, w: 10, h: 10 }, name: "a.b" }));
    expect(s.fields.map((f) => f.name)).toEqual(["full_name", "full_name_2", "a_b"]);
  });
});

describe("applyForms: edit and delete existing fields (AC-236)", () => {
  it("renames, moves and changes options while keeping the value; delete removes every widget", async () => {
    const src = await fixture("form-basic.pdf");
    const { bytes } = await roundTrip(src, (s) => {
      const colour = s.fields.find((f) => f.name === "colour")!;
      s = updateField(s, colour.id, { name: "favourite_colour", options: ["Red", "Green", "Blue", "Black"], widgets: colour.widgets.map((w) => ({ ...w, x: w.x + 100, y: w.y + 5 })) });
      s = deleteField(s, s.fields.find((f) => f.name === "size")!.id);
      return s;
    });
    expect(qpdfCheck(bytes)).toEqual([]);
    const doc = await PDFDocument.load(bytes);
    const back = readForm(doc);
    const colour = back.fields.find((f) => f.name === "favourite_colour")!;
    expect(colour).toMatchObject({ value: "Green", options: ["Red", "Green", "Blue", "Black"] });
    const orig = readForm(await PDFDocument.load(src)).fields.find((f) => f.name === "colour")!;
    expect(colour.widgets[0].x).toBeCloseTo(orig.widgets[0].x + 100);
    expect(colour.widgets[0].y).toBeCloseTo(orig.widgets[0].y + 5);
    expect(back.fields.find((f) => f.name === "size")).toBeUndefined();
    const ann = await annotationsOf(bytes, 1);
    expect(ann.filter((a) => a.fieldName === "size")).toEqual([]);
  });
});

describe("applyForms: turned pages and crop boxes (AC-238)", () => {
  for (const turn of [90, 180, 270]) {
    it(`a field on a page turned ${turn}° with a crop box away from 0,0 lands where drawn and reads upright`, async () => {
      const doc = await blankDoc(1, (d) => {
        const p = d.getPage(0);
        p.setMediaBox(0, 0, 700, 900);
        p.setCropBox(50, 30, 595, 842);
        p.setRotation(degrees(turn));
      });
      const pages = pagesOf(doc);
      expect(pages[0].view).toEqual([50, 30, 645, 872]);
      const original = readForm(doc, pages);
      let s = addField(original, createField(original, { kind: "text", page: "p0", box: { x: 100, y: 200, w: 30, h: 160 }, name: "t" }));
      s = setValue(s, s.fields[0].id, "WWWW").state;
      await applyForms(doc, doc.getPages(), pages, s, original);
      const bytes = await doc.save();
      expect(qpdfCheck(bytes)).toEqual([]);
      const back = await PDFDocument.load(bytes);
      const w = back.getForm().getField("t").acroField.getWidgets()[0];
      const r = w.getRectangle();
      expect([r.x, r.y, r.x + r.width, r.y + r.height]).toEqual(toPdfRect(pages[0], { x: 100, y: 200, w: 30, h: 160 }));
      expect(w.getAppearanceCharacteristics()?.getRotation()).toBe(turn);
      const ann = await annotationsOf(bytes, 1);
      expect(ann.find((a) => a.fieldName === "t")?.rotation).toBe(turn);
      expect(readForm(back).fields[0].widgets[0]).toMatchObject({ x: 100, y: 200, w: 30, h: 160 });
    });
  }
});

describe("applyForms: tab order (AC-239)", () => {
  it("orders /Annots, /Tabs and /Fields by rows or columns", async () => {
    const doc = await blankDoc();
    const pages = pagesOf(doc);
    const original = readForm(doc, pages);
    let s = original;
    // Added in a scrambled order: c (row 2, left), a (row 1, left), d (row 2, right), b (row 1, right).
    for (const [name, x, y] of [["c", 72, 200], ["a", 72, 100], ["d", 300, 205], ["b", 300, 98]] as const)
      s = addField(s, createField(s, { kind: "text", page: "p0", box: { x, y, w: 150, h: 20 }, name }));
    const names = async (st: FormState) => {
      const d = await PDFDocument.load(await doc.save());
      const pg = pagesOf(d);
      const orig = readForm(d, pg);
      void orig;
      await applyForms(d, d.getPages(), pg, st, original);
      const bytes = await d.save();
      expect(qpdfCheck(bytes)).toEqual([]);
      const out = await PDFDocument.load(bytes);
      const annots = (await annotationsOf(bytes, 1)).map((a) => a.fieldName);
      const fields = out.getForm().getFields().map((f) => f.getName());
      const tabs = out.getPage(0).node.get(out.getPage(0).node.keys().find((k) => k.decodeText() === "Tabs")!)?.toString();
      return { annots, fields, tabs };
    };
    expect(await names(sortByRows(s, pages))).toEqual({ annots: ["a", "b", "c", "d"], fields: ["a", "b", "c", "d"], tabs: "/R" });
    expect(await names(sortByColumns(s, pages))).toEqual({ annots: ["a", "c", "b", "d"], fields: ["a", "c", "b", "d"], tabs: "/C" });
  });
});
