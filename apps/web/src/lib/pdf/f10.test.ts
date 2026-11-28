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
    // The note has no drawn form: it stays, with its window and its reply.
    expect(subtypes(doc, 0)).toEqual(["Text", "Popup", "Text", "Link"]);
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

describe("review cases (F10 AC-1207 to AC-1209, AC-1213 to AC-1216)", () => {
  /** A page with the given annotations (plain objects), a second page when `share` lists the first one's again. */
  async function withAnnots(make: (ctx: PDFDocument["context"]) => PDFRef[], share = false) {
    const doc = await PDFDocument.create();
    const pages = [doc.addPage([600, 800]), ...(share ? [doc.addPage([600, 800])] : [])];
    const refs = make(doc.context);
    for (const page of pages) page.node.set(N("Annots"), doc.context.obj(refs));
    return doc.save();
  }
  const drawnForm = (ctx: PDFDocument["context"]) => ctx.register(ctx.stream("1 1 0 rg 0 0 100 20 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 20] }));
  const flatCount = (doc: PDFDocument, page: number) => (doc.getPage(page).node.Resources()?.lookupMaybe(N("XObject"), PDFDict)?.keys() ?? []).filter((k) => k.decodeText().startsWith("Flat")).length;

  it("AC-1207: an annotation two pages share is taken off one page and still works on the other", async () => {
    const bytes = await withAnnots((ctx) => [ctx.register(ctx.obj({ Type: "Annot", Subtype: "Highlight", Rect: [50, 690, 250, 730], AP: { N: drawnForm(ctx) } }))], true);
    const r = await removeAnnotations({ bytes, pages: [0], kinds: ["highlight"] });
    const doc = await PDFDocument.load(r.bytes);
    expect(subtypes(doc, 0)).toEqual([]);
    expect(subtypes(doc, 1)).toEqual(["Highlight"]);
    const flat = await PDFDocument.load((await flattenPdf({ bytes, annotations: true })).bytes);
    expect([flatCount(flat, 0), flatCount(flat, 1)]).toEqual([1, 1]);
    expect([subtypes(flat, 0), subtypes(flat, 1)]).toEqual([[], []]);
  });
  it("AC-1208: a pop-up is never picked by kind: it goes only with the annotation it belongs to", async () => {
    const bytes = await withAnnots((ctx) => {
      const highlight = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Highlight", Rect: [50, 690, 250, 730] }));
      const popup = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Popup", Rect: [300, 600, 500, 700], Parent: highlight }));
      ctx.lookup(highlight, PDFDict).set(N("Popup"), popup);
      return [highlight, popup];
    });
    const r = await removeAnnotations({ bytes, pages: [0], kinds: ["note"] });
    expect(r.removed).toBe(0);
    expect(r.bytes).toBe(bytes);
  });
  it("AC-1213: flatten leaves attached files and redaction marks as they are", async () => {
    const bytes = await withAnnots((ctx) => [
      ctx.register(ctx.obj({ Type: "Annot", Subtype: "FileAttachment", Rect: [50, 690, 70, 710], AP: { N: drawnForm(ctx) } })),
      ctx.register(ctx.obj({ Type: "Annot", Subtype: "Redact", Rect: [50, 600, 250, 620], AP: { N: drawnForm(ctx) } })),
    ]);
    const r = await flattenPdf({ bytes, annotations: true });
    const doc = await PDFDocument.load(r.bytes);
    expect(subtypes(doc, 0)).toEqual(["FileAttachment", "Redact"]);
    expect(flatCount(doc, 0)).toBe(0);
  });
  it("AC-1214: what goes without being drawn is said: a reply to a drawn highlight, a hidden note; a print-only stamp is drawn", async () => {
    const bytes = await withAnnots((ctx) => {
      const highlight = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Highlight", Rect: [50, 690, 250, 730], AP: { N: drawnForm(ctx) } }));
      const reply = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Text", Rect: [300, 700, 320, 720], IRT: highlight }));
      const hidden = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Text", Rect: [300, 600, 320, 620], F: 2 }));
      const printOnly = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Stamp", Rect: [50, 500, 250, 540], F: 36, AP: { N: drawnForm(ctx) } }));
      return [highlight, reply, hidden, printOnly];
    });
    const r = await flattenPdf({ bytes, annotations: true });
    const doc = await PDFDocument.load(r.bytes);
    expect(subtypes(doc, 0)).toEqual([]);
    expect(r.drawn).toBe(2);
    expect(flatCount(doc, 0)).toBe(2);
    expect(r.warnings).toEqual(["2 hidden notes or replies were removed without being drawn."]);
  });
  it("AC-1215: a file whose only annotation is hidden is not told nothing was found", async () => {
    const bytes = await withAnnots((ctx) => [ctx.register(ctx.obj({ Type: "Annot", Subtype: "Text", Rect: [300, 600, 320, 620], F: 2 }))]);
    expect((await flattenPdf({ bytes, annotations: true })).warnings).toEqual(["One hidden note or reply was removed without being drawn."]);
  });
  it("AC-1216: flattening a signed file says the signature can no longer be verified", async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([600, 800]);
    const field = src.getForm().createTextField("sig");
    field.addToPage(page, { x: 50, y: 700, width: 200, height: 24 });
    field.acroField.dict.set(N("FT"), N("Sig"));
    field.acroField.dict.set(N("V"), src.context.obj({ Type: "Sig" }));
    const r = await flattenPdf({ bytes: await src.save(), annotations: false });
    expect(r.warnings?.some((w) => w.includes("can no longer be verified"))).toBe(true);
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
  it("AC-1221: an update writes the listed fields, takes out the named ones, leaves the rest, keeps the creation date and stamps the change", async () => {
    const now = new Date("2026-11-28T10:00:00Z");
    const r = await writeMetadata({ bytes: await described(), mode: "update", fields: [{ name: "Title", value: "  New title  " }, { name: "Keywords", value: "invoice, 2026" }, { name: "Project", value: "Ünïcode ✓" }], remove: ["Author", "CreationDate"] }, now);
    const doc = await PDFDocument.load(r.bytes, { updateMetadata: false });
    const fields = fieldsOf(doc);
    expect(fields.filter((f) => !["Creator", "Producer"].includes(f.name))).toEqual([{ name: "Title", value: "New title" }, { name: "Keywords", value: "invoice, 2026" }, { name: "Department", value: "Sales" }, { name: "Project", value: "Ünïcode ✓" }]);
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
  it("AC-1225: fields the form never showed, odd names and long values come through an update untouched", async () => {
    const src = await PDFDocument.load(await described(), { updateMetadata: false });
    const info = src.context.lookup(src.context.trailerInfo.Info as PDFRef, PDFDict);
    const long = "k".repeat(3000);
    info.set(N("Company:Name"), PDFString.of("Berry"));
    info.set(N("Société"), PDFString.of("SARL"));
    info.set(N("Keywords"), PDFString.of(long));
    const bytes = await src.save();
    expect(fieldNameError("Company:Name", [])).toBeNull();
    const shown = await readMetadata(bytes);
    const r = await writeMetadata({ bytes, mode: "update", fields: shown.filter((f) => f.name !== "Société"), remove: [] });
    const after = await readMetadata(r.bytes);
    expect(after.find((f) => f.name === "Company:Name")?.value).toBe("Berry");
    expect(after.find((f) => f.name === "Société")?.value).toBe("SARL");
    expect(after.find((f) => f.name === "Keywords")?.value).toBe(long);
  });
  it("AC-1226: remove all also clears the pages' own XML details, programs' private notes and the file identifier; a PDF/A mark is called out", async () => {
    const src = await PDFDocument.load(await described(), { updateMetadata: false });
    const ctx = src.context;
    src.getPage(0).node.set(N("Metadata"), ctx.register(ctx.stream("<x:xmpmeta>page-secret</x:xmpmeta>", { Type: "Metadata", Subtype: "XML" })));
    src.getPage(0).node.set(N("PieceInfo"), ctx.obj({ Maker: { Private: PDFString.of("piece-secret") } }));
    src.catalog.set(N("Metadata"), ctx.register(ctx.stream("<x:xmpmeta><pdfaid:part>1</pdfaid:part></x:xmpmeta>", { Type: "Metadata", Subtype: "XML" })));
    const r = await writeMetadata({ bytes: await src.save({ useObjectStreams: false }), mode: "remove" });
    const raw = new TextDecoder("latin1").decode(r.bytes);
    for (const gone of ["page-secret", "piece-secret", "pdfaid", "/PieceInfo", "/ID"]) expect(raw).not.toContain(gone);
    expect(r.warnings?.[0]).toContain("PDF/A");
  });
  it("AC-1223: a file with no information at all gets one on update", async () => {
    const bare = await writeMetadata({ bytes: await described(), mode: "remove" });
    const r = await writeMetadata({ bytes: bare.bytes, mode: "update", fields: [{ name: "Title", value: "Fresh" }] });
    expect(await readMetadata(r.bytes)).toEqual([{ name: "Title", value: "Fresh" }]);
  });
  it("AC-1224: field names are checked", () => {
    expect(fieldNameError("", [])).toBe("empty");
    expect(fieldNameError("a\u0007b", [])).toBe("characters");
    expect(fieldNameError("n".repeat(121), [])).toBe("characters");
    expect(fieldNameError("ModDate", [])).toBe("reserved");
    expect(fieldNameError("title", ["Title"])).toBe("taken");
    expect(fieldNameError("Project code", ["Title"])).toBeNull();
  });
});
