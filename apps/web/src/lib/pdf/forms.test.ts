import { PDFDict, PDFDocument, PDFName } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { flattenFields } from "./forms";

/** One page with text fields "good", "badrect", "stale" (all filled in) and a checkbox "dictap". */
async function formDoc() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const form = doc.getForm();
  for (const [i, name] of ["good", "badrect", "stale"].entries()) {
    const f = form.createTextField(name);
    f.addToPage(page, { x: 20, y: 20 + i * 60, width: 200, height: 30 });
    f.setText(`value-${name}`);
  }
  form.updateFieldAppearances();
  const widget = (name: string) => form.getTextField(name).acroField.getWidgets()[0];
  // /Rect with three numbers: getRectangle() throws, before anything could be drawn.
  widget("badrect").dict.set(PDFName.of("Rect"), doc.context.obj([20, 80, 220]));
  // A ticked checkbox whose appearance states point at plain dictionaries, not streams
  // (pdf-lib does not regenerate these: the pre-check must catch them).
  const cb = form.createCheckBox("dictap");
  cb.addToPage(page, { x: 300, y: 20, width: 20, height: 20 });
  cb.check();
  form.updateFieldAppearances();
  const states = cb.acroField.getWidgets()[0].dict.lookup(PDFName.of("AP"), PDFDict).lookup(PDFName.of("N"), PDFDict);
  for (const k of states.keys()) states.set(k, doc.context.register(doc.context.obj({ Foo: 1 })));
  // A changed field whose appearance update fails (malformed /Rect): what it shows is stale.
  widget("stale").dict.set(PDFName.of("Rect"), doc.context.obj([20, 200]));
  form.getTextField("stale").setText("value-stale");
  return { doc, page, form };
}

const flatCount = (doc: PDFDocument) => {
  const xobjects = doc.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"));
  return xobjects instanceof PDFDict ? xobjects.keys().filter((k) => k.asString().startsWith("/FlatWidget")).length : 0;
};

describe("flattenFields (safe flatten, PR #7 review)", () => {
  it("flattens a field whose every widget can be drawn, keeps the others fillable with their values", async () => {
    const { doc, form } = await formDoc();
    const kept = flattenFields(doc);
    expect(kept.sort()).toEqual(["badrect", "dictap", "stale"]);
    expect(form.getFields().map((f) => f.getName()).sort()).toEqual(["badrect", "dictap", "stale"]);
    for (const name of ["badrect", "stale"]) expect(form.getTextField(name).getText()).toBe(`value-${name}`);
    expect(form.getCheckBox("dictap").isChecked()).toBe(true);
    expect(flatCount(doc)).toBe(1); // only "good" was drawn into the page
    // The output still saves and reloads.
    const again = await PDFDocument.load(await doc.save({ updateFieldAppearances: false }));
    expect(again.getForm().getFields().length).toBe(3);
  });
  it("draws an up-to-date appearance (a failing field does not leave later fields stale)", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    const form = doc.getForm();
    const bad = form.createTextField("a-bad");
    bad.addToPage(page, { x: 20, y: 20, width: 200, height: 30 });
    const good = form.createTextField("b-good");
    good.addToPage(page, { x: 20, y: 100, width: 200, height: 30 });
    bad.acroField.getWidgets()[0].dict.set(PDFName.of("Rect"), doc.context.obj([1]));
    bad.setText("x"); // dirty, and its update throws
    good.setText("fresh text"); // dirty: its appearance is only written by the update
    expect(flattenFields(doc)).toEqual(["a-bad"]);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: await doc.save({ updateFieldAppearances: false }), verbosity: 0 }).promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
    expect(text).toContain("fresh text");
    await pdf.loadingTask.destroy();
  });
});
