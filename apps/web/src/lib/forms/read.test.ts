import { readFile } from "node:fs/promises";
import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { readForm } from "./read";

const fixture = (name: string) => readFile(new URL(`../../../tests/fixtures/forms/${name}`, import.meta.url));

describe("readForm (AC-230)", () => {
  it("reads every field kind of form-basic.pdf", async () => {
    const doc = await PDFDocument.load(await fixture("form-basic.pdf"));
    const form = readForm(doc);
    const by = Object.fromEntries(form.fields.map((f) => [f.name, f]));
    expect(Object.keys(by).sort()).toEqual(["address.street", "address.town", "agree", "code", "colour", "days", "email", "name", "notes", "pin", "signature", "size"].sort());
    expect(by.name).toMatchObject({ kind: "text", tooltip: "Your name", maxLen: 40, multiline: false, value: "" });
    expect(by.notes).toMatchObject({ kind: "text", multiline: true });
    expect(by.pin).toMatchObject({ kind: "text", comb: true, maxLen: 6 });
    expect(by.agree).toMatchObject({ kind: "checkbox", value: "" });
    expect(by.agree.widgets[0].on).toBeTruthy();
    expect(by.size).toMatchObject({ kind: "radio", value: "medium", options: ["small", "medium", "large"] });
    expect(by.size.widgets.map((w) => w.on)).toEqual(["small", "medium", "large"]);
    expect(by.colour).toMatchObject({ kind: "dropdown", value: "Green", options: ["Red", "Green", "Blue"] });
    expect(by.days).toMatchObject({ kind: "list", value: ["Tue"], multiSelect: true });
    expect(by.code).toMatchObject({ readOnly: true, value: "A-17" });
    expect(by.email).toMatchObject({ required: true });
    expect(by.signature).toMatchObject({ kind: "signature" });
    expect(by["address.street"].widgets[0]).toMatchObject({ page: "p0", w: 240, h: 18 });
    // Boxes are in the frame: top-left origin, y down.
    const name = by.name.widgets[0];
    expect(name.x).toBeCloseTo(160);
    expect(name.y).toBeGreaterThan(60);
    expect(name.y).toBeLessThan(100);
    expect(form.order.length).toBe(form.fields.reduce((n, f) => n + f.widgets.length, 0));
  });
});
