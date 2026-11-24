import { describe, expect, it } from "vitest";
import { checkFieldName, propsFor, renameField, setCheckboxOn, setDefaultValue, setOptions, suggestsMultiline } from "./edit";
import { addField, createField, emptyForm, setValue, updateField } from "./model";
import type { FormState } from "./types";

function form(): FormState {
  let s = emptyForm();
  for (const [kind, name] of [["text", "name"], ["checkbox", "agree"], ["dropdown", "colour"], ["list", "days"], ["radio", "size"]] as const)
    s = addField(s, createField(s, { kind, page: "p0", box: { x: 0, y: 0, w: 100, h: 20 }, name }));
  // A field read from the file, inside a parent.
  s = addField(s, { ...createField(s, { kind: "text", page: "p0", box: { x: 0, y: 40, w: 100, h: 20 }, name: "address.town" }), name: "address.town", origin: "file" });
  return s;
}
const id = (s: FormState, n: string) => s.fields.find((f) => f.name === n)!.id;
const get = (s: FormState, n: string) => s.fields.find((f) => f.name === n)!;

describe("field properties: names (AC-235)", () => {
  it("checks and renames, with a suggestion for a taken name", () => {
    const s = form();
    expect(checkFieldName(s, id(s, "name"), "agree")).toEqual({ ok: false, reason: "duplicate", suggestion: "agree_2" });
    expect(checkFieldName(s, id(s, "name"), "full.name")).toMatchObject({ ok: false, reason: "dot" });
    const r = renameField(s, id(s, "name"), "  full_name ");
    expect(r.check.ok).toBe(true);
    expect(get(r.state, "full_name").kind).toBe("text");
    expect(renameField(s, id(s, "name"), "agree").state).toBe(s);
  });

  it("a file field keeps its parent, or leaves it when the parent part changes", () => {
    const s = form();
    expect(renameField(s, id(s, "address.town"), "address.city").state.fields.map((f) => f.name)).toContain("address.city");
    expect(renameField(s, id(s, "address.town"), "home.city").state.fields.map((f) => f.name)).toContain("home_city");
    // Leaving the parent would clash with "name": refused with a suggestion.
    expect(checkFieldName(s, id(s, "address.town"), "name")).toEqual({ ok: false, reason: "duplicate", suggestion: "name_2" });
  });
});

describe("field properties: values and options (AC-234)", () => {
  it("a checkbox's export value follows into a checked value", () => {
    const s0 = form();
    let s = setValue(s0, id(s0, "agree"), "Yes").state;
    s = setCheckboxOn(s, id(s, "agree"), "Agreed");
    expect(get(s, "agree")).toMatchObject({ value: "Agreed", widgets: [{ on: "Agreed" }] });
    expect(setCheckboxOn(s, id(s, "agree"), "Off")).toBe(s);
  });

  it("options drop blanks and repeats, and clear a value that is gone", () => {
    let s = form();
    s = setOptions(s, id(s, "colour"), ["Red", "", " Green ", "Red", "Blue"]);
    expect(get(s, "colour").options).toEqual(["Red", "Green", "Blue"]);
    s = setValue(s, id(s, "colour"), "Blue").state;
    s = setOptions(s, id(s, "colour"), ["Red", "Green"]);
    expect(get(s, "colour").value).toBe("");
    s = updateField(s, id(s, "days"), { multiSelect: true });
    s = setOptions(s, id(s, "days"), ["Mon", "Tue", "Wed"]);
    s = setValue(s, id(s, "days"), ["Mon", "Wed"]).state;
    s = setOptions(s, id(s, "days"), ["Mon", "Tue"]);
    expect(get(s, "days").value).toEqual(["Mon"]);
  });

  it("a default follows the field's own rules, even on a read-only field", () => {
    const s0 = form();
    let s = updateField(s0, id(s0, "colour"), { readOnly: true });
    s = setDefaultValue(s, id(s, "colour"), "Option 2");
    expect(get(s, "colour").defaultValue).toBe("Option 2");
    expect(setDefaultValue(s, id(s, "colour"), "Purple")).toBe(s);
  });
});

describe("field properties: what shows (U-F4)", () => {
  it("offers multi-line for a tall one-line text field", () => {
    const s = form();
    const f = get(s, "name");
    expect(suggestsMultiline(f)).toBe(false);
    expect(suggestsMultiline({ ...f, widgets: [{ ...f.widgets[0], h: 60 }] })).toBe(true);
    expect(suggestsMultiline({ ...f, multiline: true, widgets: [{ ...f.widgets[0], h: 60 }] })).toBe(false);
  });

  it("lists the spec's controls per kind", () => {
    expect(propsFor("text").main).toEqual(["name", "required", "size", "color"]);
    expect(propsFor("radio").main).toEqual(["name", "buttonValue", "addButton"]);
    expect(propsFor("signature").more).toEqual(["tooltip", "repeat", "duplicate"]);
    expect(propsFor("list").more).toContain("multiSelect");
  });
});
