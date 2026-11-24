import { describe, expect, it } from "vitest";
import {
  addField,
  addRadioButton,
  clipToMaxLen,
  createField,
  deleteWidget,
  emptyForm,
  missingRequired,
  setMaxLen,
  setRadioValue,
  setValue,
  updateField,
} from "./model";
import { checkName, renamedTo } from "./names";
import { moveInOrder, nextTabStop, pageOrder, restoreOriginal, sortByColumns, sortByRows } from "./taborder";
import type { FormPage, FormState } from "./types";

const page = (id: string, turn = 0): FormPage => ({ id, view: [0, 0, 595, 842], baseRotate: 0, rotate: turn });

function form(...specs: { kind: "text" | "checkbox" | "radio" | "signature"; name: string; x: number; y: number; page?: string }[]): FormState {
  let s = emptyForm();
  for (const sp of specs) s = addField(s, createField(s, { kind: sp.kind, page: sp.page ?? "p0", box: { x: sp.x, y: sp.y, w: 100, h: 20 }, name: sp.name }));
  return s;
}
const idOf = (s: FormState, name: string) => s.fields.find((f) => f.name === name)!.id;
const widgetOf = (s: FormState, name: string) => s.fields.find((f) => f.name === name)!.widgets[0].id;
const names = (s: FormState, order: string[]) => order.map((w) => s.fields.find((f) => f.widgets.some((x) => x.id === w))!.name);

describe("names (AC-235)", () => {
  it("checkName refuses empty, duplicate and dotted names with a free suggestion", () => {
    expect(checkName("email", ["name"])).toEqual({ ok: true });
    expect(checkName("  ", ["field"])).toEqual({ ok: false, reason: "empty", suggestion: "field_2" });
    expect(checkName("name", ["name", "name_2"])).toEqual({ ok: false, reason: "duplicate", suggestion: "name_3" });
    expect(checkName("a.b", [])).toEqual({ ok: false, reason: "dot", suggestion: "a_b" });
    expect(checkName("address.city", [], { allowDot: true })).toEqual({ ok: true });
  });

  it("renamedTo keeps a child in its parent only when the parent part is unchanged", () => {
    expect(renamedTo("address.town", "address.city")).toBe("address.city");
    expect(renamedTo("address.town", "city")).toBe("city");
    expect(renamedTo("address.town", "home.town")).toBe("home_town");
    expect(renamedTo("name", "full.name")).toBe("full_name");
    expect(renamedTo("name", "full_name")).toBe("full_name");
  });
});

describe("values and limits (AC-233)", () => {
  it("counts max length in UTF-16 units, like viewers and pdf-lib", () => {
    let s = form({ kind: "text", name: "t", x: 0, y: 0 });
    s = updateField(s, idOf(s, "t"), { maxLen: 2 });
    expect(setValue(s, idOf(s, "t"), "\u{1F600}\u{1F600}").error).toBe("too-long");
    expect(setValue(s, idOf(s, "t"), "\u{1F600}").error).toBeUndefined();
    expect(clipToMaxLen("ab\u{1F600}c", 3)).toBe("ab");
    expect(clipToMaxLen("abc", 5)).toBe("abc");
  });

  it("setMaxLen cuts a longer value and drops comb when the limit goes", () => {
    let s = form({ kind: "text", name: "t", x: 0, y: 0 });
    s = setValue(s, idOf(s, "t"), "abcdef").state;
    s = setMaxLen(s, idOf(s, "t"), 3);
    expect(s.fields[0]).toMatchObject({ maxLen: 3, value: "abc" });
    s = updateField(s, idOf(s, "t"), { comb: true });
    s = setMaxLen(s, idOf(s, "t"), null);
    expect(s.fields[0]).toMatchObject({ maxLen: null, comb: false, value: "abc" });
  });

  it("missingRequired lists empty required fields in tab order, never signatures", () => {
    let s = form({ kind: "text", name: "b", x: 0, y: 300 }, { kind: "text", name: "a", x: 0, y: 100 }, { kind: "checkbox", name: "c", x: 0, y: 200 }, { kind: "signature", name: "sig", x: 0, y: 400 });
    for (const n of ["a", "b", "c", "sig"]) s = updateField(s, idOf(s, n), { required: true });
    s = sortByRows(s, [page("p0")]);
    expect(missingRequired(s).map((f) => f.name)).toEqual(["a", "c", "b"]);
    s = setValue(s, idOf(s, "c"), "Yes").state;
    s = setValue(s, idOf(s, "a"), "x").state;
    expect(missingRequired(s).map((f) => f.name)).toEqual(["b"]);
  });
});

describe("radio buttons (AC-234, AC-236)", () => {
  it("setRadioValue renames one button and the selection follows it", () => {
    let s = form({ kind: "radio", name: "size", x: 0, y: 0 });
    s = addRadioButton(s, idOf(s, "size"));
    const [w1, w2] = s.fields[0].widgets;
    s = setValue(s, idOf(s, "size"), w2.on!).state;
    s = setRadioValue(s, w2.id, "Large");
    expect(s.fields[0].options).toEqual([w1.on, "Large"]);
    expect(s.fields[0].value).toBe("Large");
  });

  it("deleteWidget keeps the other buttons' values and clears a selection that is gone", () => {
    let s = form({ kind: "radio", name: "size", x: 0, y: 0 });
    s = addRadioButton(s, idOf(s, "size"));
    s = addRadioButton(s, idOf(s, "size"));
    const [w1, w2, w3] = s.fields[0].widgets;
    s = setValue(s, idOf(s, "size"), w2.on!).state;
    s = deleteWidget(s, w2.id);
    expect(s.fields[0].widgets.map((w) => w.on)).toEqual([w1.on, w3.on]);
    expect(s.fields[0].value).toBe("");
    expect(s.order).not.toContain(w2.id);
    // The last widget of a field takes the field with it.
    s = deleteWidget(deleteWidget(s, w1.id), w3.id);
    expect(s.fields).toHaveLength(0);
  });
});

describe("tab order (AC-239)", () => {
  it("restoreOriginal brings back the file's order with new fields after it", () => {
    let s = form({ kind: "text", name: "a", x: 0, y: 0 }, { kind: "text", name: "b", x: 0, y: 50 });
    s = { ...s, originalOrder: [...s.order].reverse() };
    s = addField(s, createField(s, { kind: "text", page: "p0", box: { x: 0, y: 500, w: 50, h: 20 }, name: "c" }));
    s = sortByRows(s, [page("p0")]);
    const back = restoreOriginal(s);
    expect(back.orderMode).toBe("original");
    expect(names(back, back.order)).toEqual(["b", "a", "c"]);
  });

  it("moveInOrder counts positions among listed widgets; hidden ones keep their places", () => {
    const st = (ids: string[], hiddenIds: string[]): FormState => ({
      fields: ids.map((id) => ({ ...createField(emptyForm(), { kind: "text", page: "p0", box: { x: 0, y: 0, w: 10, h: 10 }, name: id }), id: `f${id}`, widgets: [{ id, page: "p0", x: 0, y: 0, w: 10, h: 10, hidden: hiddenIds.includes(id) || undefined }] })),
      order: ids,
      orderMode: "original",
      originalOrder: ids,
    });
    const pages = [{ id: "p0", view: [0, 0, 600, 800] as [number, number, number, number], rotate: 0, baseRotate: 0, src: 0 }];
    const s0 = st(["H", "A", "B", "C"], ["H"]);
    expect(pageOrder(s0, "p0")).toEqual(["A", "B", "C"]);
    expect(moveInOrder(s0, "A", 1, pages).order).toEqual(["H", "B", "A", "C"]);
    expect(moveInOrder(s0, "C", 1, pages).order).toEqual(["H", "A", "C", "B"]);
    expect(moveInOrder(s0, "C", 0, pages).order).toEqual(["H", "C", "A", "B"]);
    expect(moveInOrder(s0, "A", 2, pages).order).toEqual(["H", "B", "C", "A"]);
    const s1 = st(["A", "H", "B"], ["H"]);
    expect(moveInOrder(s1, "B", 0, pages).order).toEqual(["B", "A", "H"]);
    expect(moveInOrder(s1, "A", 1, pages).order).toEqual(["H", "B", "A"]);
  });

  it("moveInOrder moves a widget within its page and keeps pages in page order", () => {
    let s = form({ kind: "text", name: "a", x: 0, y: 0 }, { kind: "text", name: "b", x: 0, y: 50 }, { kind: "text", name: "c", x: 0, y: 100 }, { kind: "text", name: "z", x: 0, y: 0, page: "p1" });
    const pages = [page("p0"), page("p1")];
    s = moveInOrder(s, widgetOf(s, "c"), 0, pages);
    expect(s.orderMode).toBe("custom");
    expect(names(s, s.order)).toEqual(["c", "a", "b", "z"]);
    s = moveInOrder(s, widgetOf(s, "c"), 99, pages);
    expect(names(s, pageOrder(s, "p0"))).toEqual(["a", "b", "c"]);
  });

  it("sorts rows and columns as the reader sees a turned page", () => {
    // Frame (unturned) positions; on a page turned 90° clockwise, frame x runs down the screen.
    let s = form({ kind: "text", name: "topLeft", x: 50, y: 500 }, { kind: "text", name: "topRight", x: 50, y: 100 }, { kind: "text", name: "below", x: 300, y: 500 });
    const turned = [page("p0", 90)];
    s = sortByRows(s, turned);
    expect(names(s, s.order)).toEqual(["topLeft", "topRight", "below"]);
    s = sortByColumns(s, turned);
    expect(names(s, s.order)).toEqual(["topLeft", "below", "topRight"]);
  });

  it("nextTabStop follows the custom order across pages in their current order (AC-248)", () => {
    let s = form({ kind: "text", name: "a", x: 0, y: 0 }, { kind: "text", name: "b", x: 0, y: 50 }, { kind: "text", name: "c", x: 0, y: 100 }, { kind: "text", name: "z", x: 0, y: 0, page: "p1" });
    s = moveInOrder(s, widgetOf(s, "c"), 0, [page("p0"), page("p1")]);
    const go = (from: string, pages: string[], back = false, can?: (w: string) => boolean) => {
      const w = nextTabStop(s, pages, widgetOf(s, from), back, can);
      return w ? names(s, [w])[0] : null;
    };
    expect(go("c", ["p0", "p1"])).toBe("a");
    expect(go("b", ["p0", "p1"])).toBe("z");
    expect(go("z", ["p0", "p1"])).toBeNull();
    expect(go("z", ["p0", "p1"], true)).toBe("b");
    // Pages moved: p1 now comes first.
    expect(go("z", ["p1", "p0"])).toBe("c");
    // Fields that can't take focus are passed over.
    expect(go("c", ["p0", "p1"], false, (w) => w !== widgetOf(s, "a"))).toBe("b");
  });

  it("nextTabStop treats a radio group as one stop, entered at its checked button", () => {
    let s = form({ kind: "text", name: "t", x: 0, y: 0 }, { kind: "radio", name: "r", x: 0, y: 50 }, { kind: "text", name: "u", x: 0, y: 200 });
    s = addRadioButton(s, idOf(s, "r"), { x: 150, y: 50, w: 20, h: 20 });
    const r = s.fields.find((f) => f.name === "r")!;
    s = setValue(s, r.id, r.widgets[1].on!).state;
    const [r1, r2] = s.fields.find((f) => f.name === "r")!.widgets;
    expect(nextTabStop(s, ["p0"], widgetOf(s, "t"))).toBe(r2.id);
    expect(nextTabStop(s, ["p0"], r1.id)).toBe(widgetOf(s, "u"));
    expect(nextTabStop(s, ["p0"], r2.id, true)).toBe(widgetOf(s, "t"));
  });
});
