import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFString, StandardFonts } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { appearanceMatrix, countAnnotations, kindOf, removeAnnotations } from "./annotations";
import { flattenPdf } from "./flatten";
import { fieldNameError, fieldsOf, readMetadata, writeMetadata } from "./metadata";

const N = PDFName.of;

/** Two pages. Page 1: a highlight with a drawn form, a note with its pop-up and a reply, a link. Page 2: a drawing with no drawn form. */
async function annotated() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const [one, two] = [doc.addPage([600, 800]), doc.addPage([600, 800])];
  one.drawText("Body one", { x: 50, y: 700, size: 20, font });
  two.drawText("Body two", { x: 50, y: 700, size: 20, font });
  const ctx = doc.context;
  const ap = ctx.register(ctx.stream("1 1 0 rg 0 0 100 20 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 20] }));
  const highlight = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Highlight", Rect: [50, 690, 250, 730], AP: { N: ap } }));
  const note = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Text", Rect: [300, 700, 320, 720] }));
  const popup = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Popup", Rect: [330, 600, 500, 700], Parent: note }));
  (ctx.lookup(note) as PDFDict).set(N("Popup"), popup);
  const reply = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Text", Rect: [300, 700, 320, 720], IRT: note }));
  const link = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [50, 600, 150, 620], A: { S: "URI", URI: "https://example.com" } }));
  one.node.set(N("Annots"), ctx.obj([highlight, note, popup, reply, link]));
  const ink = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Ink", Rect: [50, 50, 150, 150] }));
  two.node.set(N("Annots"), ctx.obj([ink]));
  return doc.save();
}
const subtypes = (doc: PDFDocument, page: number) => {
  const a = doc.getPage(page).node.lookupMaybe(N("Annots"), PDFArray);
  return a ? Array.from({ length: a.size() }, (_, i) => (a.lookup(i, PDFDict).lookup(N("Subtype")) as PDFName).decodeText()) : [];
};

describe("annotations (F10 AC-1200 to AC-1206)", () => {
  it("AC-1200: kinds group the subtypes; form fields are never a kind", () => {
    expect(kindOf("Squiggly")).toBe("underline");
    expect(kindOf("Redact")).toBe("other");
    expect(kindOf("Widget")).toBeNull();
    expect(kindOf(undefined)).toBeNull();
  });
  it("AC-1201: counts by kind, a pop-up counted with its note", async () => {
    expect(countAnnotations(await PDFDocument.load(await annotated()))).toEqual({ highlight: 1, note: 2, link: 1, drawing: 1 });
  });
  it("AC-1202: only the chosen kinds go, only from the chosen pages", async () => {
    const r = await removeAnnotations({ bytes: await annotated(), pages: [0], kinds: ["highlight", "drawing"] });
    expect(r.removed).toBe(1);
    const doc = await PDFDocument.load(r.bytes);
    expect(subtypes(doc, 0)).toEqual(["Text", "Popup", "Text", "Link"]);
    expect(subtypes(doc, 1)).toEqual(["Ink"]);
  });
  it("AC-1203: a note takes its pop-up and its replies with it", async () => {
    const r = await removeAnnotations({ bytes: await annotated(), pages: [0, 1], kinds: ["note"] });
    expect(r.removed).toBe(3);
    expect(subtypes(await PDFDocument.load(r.bytes), 0)).toEqual(["Highlight", "Link"]);
  });
  it("AC-1204: everything gone leaves no empty list, and the page's text stays", async () => {
    const r = await removeAnnotations({ bytes: await annotated(), pages: [0, 1], kinds: ["highlight", "note", "link", "drawing"] });
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPage(0).node.has(N("Annots"))).toBe(false);
    expect(doc.getPage(1).node.has(N("Annots"))).toBe(false);
    expect(doc.getPageCount()).toBe(2);
  });
  it("AC-1205: nothing to remove gives the file back unchanged", async () => {
    const bytes = await annotated();
    const r = await removeAnnotations({ bytes, pages: [1], kinds: ["highlight"] });
    expect(r.removed).toBe(0);
    expect(r.bytes).toBe(bytes);
  });
  it("AC-1206: an appearance is fitted to its rectangle, through its own matrix", () => {
    expect(appearanceMatrix([50, 690, 250, 730], [0, 0, 100, 20], [1, 0, 0, 1, 0, 0])).toEqual([2, 0, 0, 2, 50, 690]);
    // A quarter-turned appearance: its box becomes 20 × 100 before fitting.
    const m = appearanceMatrix([0, 0, 20, 100], [0, 0, 100, 20], [0, 1, -1, 0, 20, 0])!;
    expect(m.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(appearanceMatrix([0, 0, 10, 10], [0, 0, 0, 20], [1, 0, 0, 1, 0, 0])).toBeNull();
  });
});

describe("flatten (F10 AC-1210 to AC-1213)", () => {
  it("AC-1210: annotations with a drawn form become page content; links stay; what cannot be drawn stays, with a note", async () => {
    const r = await flattenPdf({ bytes: await annotated(), annotations: true });
    const doc = await PDFDocument.load(r.bytes);
    expect(subtypes(doc, 0)).toEqual(["Text", "Text", "Link"]);
    expect(subtypes(doc, 1)).toEqual(["Ink"]);
    expect(r.drawn).toBe(1);
    expect(r.warnings?.[0]).toContain("3 annotations have no drawn form");
    const names = doc.getPage(0).node.Resources()!.lookup(N("XObject"), PDFDict).keys().map((k) => k.decodeText());
    expect(names.some((n) => n.startsWith("Flat"))).toBe(true);
  });
  it("AC-1211: form fields are drawn with their values and stop being fields", async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([600, 800]);
    const field = src.getForm().createTextField("name");
    field.setText("Asha Rao");
    field.addToPage(page, { x: 50, y: 700, width: 200, height: 24 });
    const r = await flattenPdf({ bytes: await src.save(), annotations: false });
    const doc = await PDFDocument.load(r.bytes);
    expect(r.fields).toBe(1);
    expect(doc.catalog.has(N("AcroForm"))).toBe(false);
    expect(subtypes(doc, 0)).toEqual([]);
    expect(r.warnings).toBeUndefined();
  });
  it("AC-1212: fields only leaves annotations alone", async () => {
    const r = await flattenPdf({ bytes: await annotated(), annotations: false });
    expect(subtypes(await PDFDocument.load(r.bytes), 0)).toEqual(["Highlight", "Text", "Popup", "Text", "Link"]);
    expect(r.warnings?.[0]).toContain("Nothing to flatten");
  });
});

describe("metadata (F10 AC-1220 to AC-1225)", () => {
  async function described() {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    doc.setTitle("Old title");
    doc.setAuthor("Old author");
    doc.setCreationDate(new Date("2020-01-02T03:04:05Z"));
    const info = doc.context.lookup(doc.context.trailerInfo.Info as PDFRef, PDFDict);
    info.set(N("Department"), PDFString.of("Sales"));
    doc.catalog.set(N("Metadata"), doc.context.register(doc.context.stream("<x:xmpmeta/>", { Type: "Metadata", Subtype: "XML" })));
    return doc.save();
  }
  it("AC-1220: fields are read, standard ones first, dates left out", async () => {
    const fields = await readMetadata(await described());
    expect(fields.map((f) => f.name)).toEqual(["Title", "Author", "Creator", "Producer", "Department"].filter((n) => fields.some((f) => f.name === n)));
    expect(fields.find((f) => f.name === "Title")?.value).toBe("Old title");
    expect(fields.find((f) => f.name === "Department")?.value).toBe("Sales");
    expect(fields.some((f) => f.name === "CreationDate")).toBe(false);
  });
  it("AC-1221: an update writes the listed fields, drops the rest, keeps the creation date and stamps the change", async () => {
    const now = new Date("2026-11-28T10:00:00Z");
    const r = await writeMetadata({ bytes: await described(), mode: "update", fields: [{ name: "Title", value: "  New title  " }, { name: "Keywords", value: "invoice, 2026" }, { name: "Project", value: "Ünïcode ✓" }, { name: "Author", value: "" }] }, now);
    const doc = await PDFDocument.load(r.bytes, { updateMetadata: false });
    expect(fieldsOf(doc)).toEqual([{ name: "Title", value: "New title" }, { name: "Keywords", value: "invoice, 2026" }, { name: "Project", value: "Ünïcode ✓" }]);
    expect(doc.getCreationDate()?.toISOString()).toBe("2020-01-02T03:04:05.000Z");
    expect(doc.getModificationDate()?.toISOString()).toBe(now.toISOString());
    expect(doc.catalog.has(N("Metadata"))).toBe(false);
  });
  it("AC-1222: remove all leaves no field, no date and no XML copy", async () => {
    const r = await writeMetadata({ bytes: await described(), mode: "remove" });
    const doc = await PDFDocument.load(r.bytes, { updateMetadata: false });
    expect(doc.context.trailerInfo.Info).toBeUndefined();
    expect(doc.catalog.has(N("Metadata"))).toBe(false);
    const raw = new TextDecoder("latin1").decode(r.bytes);
    expect(raw).not.toContain("Old title");
    expect(raw).not.toContain("xmpmeta");
    expect(doc.getPageCount()).toBe(1);
  });
  it("AC-1223: a file with no information at all gets one on update", async () => {
    const bare = await writeMetadata({ bytes: await described(), mode: "remove" });
    const r = await writeMetadata({ bytes: bare.bytes, mode: "update", fields: [{ name: "Title", value: "Fresh" }] });
    expect(await readMetadata(r.bytes)).toEqual([{ name: "Title", value: "Fresh" }]);
  });
  it("AC-1224: field names are checked", () => {
    expect(fieldNameError("", [])).toBe("empty");
    expect(fieldNameError("a/b", [])).toBe("characters");
    expect(fieldNameError("ModDate", [])).toBe("reserved");
    expect(fieldNameError("title", ["Title"])).toBe("taken");
    expect(fieldNameError("Project code", ["Title"])).toBeNull();
  });
});
