import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commit, createHistory, current, MAX_STEPS, redo, revertEntries, undo, undoEntry } from "./history";
import { addField, createField, emptyForm, setValue } from "@/lib/forms/model";
import { addObjects, deletePage, initialPages, moveObject, removeObjects, rotatePage, updateObjects, type DocState, type ShapeObj } from "./model";

const base = (): DocState => ({ pages: initialPages([{ view: [0, 0, 600, 800], rotate: 0 }, { view: [0, 0, 600, 800], rotate: 0 }]), objects: [], engine: 0 });
const rect = (id: string): ShapeObj => ({ kind: "shape", id, page: "p0", shape: "rect", x: 0, y: 0, w: 10, h: 10, rot: 0, stroke: "#000000", fill: null, width: 1 });

describe("history (AC-43, AC-73)", () => {
  it("undoes and redoes, and a new change drops the redo branch", () => {
    let h = createHistory(base());
    h = commit(h, addObjects(current(h), [rect("a")]), { label: "Add rectangle", at: 1 });
    h = commit(h, updateObjects(current(h), ["a"], (o) => moveObject(o, 5, 0)), { label: "Move rectangle", at: 2 });
    expect(undoEntry(h)?.label).toBe("Move rectangle");
    h = undo(h);
    expect((current(h).objects[0] as ShapeObj).x).toBe(0);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect((current(h).objects[0] as ShapeObj).x).toBe(5);
    h = undo(h);
    h = commit(h, removeObjects(current(h), ["a"]), { label: "Delete", at: 3 });
    expect(canRedo(h)).toBe(false);
    expect(current(h).objects).toHaveLength(0);
  });

  it("keeps at least 100 steps", () => {
    let h = createHistory(base());
    for (let i = 0; i < 150; i++) h = commit(h, addObjects(current(h), [rect(`r${i}`)]), { label: "Add", at: i * 5000 });
    let n = 0;
    while (canUndo(h)) {
      h = undo(h);
      n++;
    }
    expect(n).toBe(150);
    expect(MAX_STEPS).toBeGreaterThanOrEqual(100);
  });

  it("merges a burst of nudges with the same key into one step (AC-88)", () => {
    let h = createHistory(addObjects(base(), [rect("a")]));
    for (let i = 0; i < 5; i++) h = commit(h, updateObjects(current(h), ["a"], (o) => moveObject(o, 1, 0)), { label: "Move", key: "nudge:a", at: 100 + i * 200 });
    expect(h.entries).toHaveLength(1);
    expect((current(h).objects[0] as ShapeObj).x).toBe(5);
    h = undo(h);
    expect((current(h).objects[0] as ShapeObj).x).toBe(0);
  });

  it("reverts a chosen set of changes as one undoable step", () => {
    let h = createHistory(base());
    h = commit(h, addObjects(current(h), [rect("a")]), { label: "Add a", at: 1 });
    h = commit(h, addObjects(current(h), [rect("b")]), { label: "Add b", at: 2 });
    h = commit(h, rotatePage(current(h), "p1", 90), { label: "Rotate page 2", at: 3 });
    h = revertEntries(h, [0, 2], 4);
    expect(current(h).objects.map((o) => o.id)).toEqual(["b"]);
    expect(current(h).pages[1].rotate).toBe(0);
    h = undo(h);
    expect(current(h).objects.map((o) => o.id)).toEqual(["a", "b"]);
    expect(current(h).pages[1].rotate).toBe(90);
  });

  it("keeps a later kept change to the same object when an earlier one is reverted", () => {
    let h = createHistory(base());
    h = commit(h, addObjects(current(h), [rect("a")]), { label: "Add a", at: 1 });
    h = commit(h, updateObjects(current(h), ["a"], (o) => moveObject(o, 5, 0)), { label: "Move a", at: 2 });
    h = revertEntries(h, [0], 3);
    expect((current(h).objects[0] as ShapeObj).x).toBe(5);
  });
  it("reverts form changes field by field and keeps later kept changes (F16 E3)", () => {
    const pages = initialPages([{ view: [0, 0, 600, 800], rotate: 0 }, { view: [0, 0, 600, 800], rotate: 0 }]);
    const f0 = emptyForm();
    let h = createHistory({ pages, objects: [], engine: 0, forms: f0 });
    const name = createField(f0, { kind: "text", page: "p1", box: { x: 10, y: 10, w: 100, h: 20 } });
    const f1 = addField(f0, name);
    h = commit(h, { ...current(h), forms: f1 }, { label: "Add text field", at: 1 });
    h = commit(h, addObjects(current(h), [rect("a")]), { label: "Add rectangle", at: 2 });
    // Revert only the field: the rectangle stays, the field goes.
    let r = revertEntries(h, [0], 3);
    expect(current(r).forms!.fields).toHaveLength(0);
    expect(current(r).objects).toHaveLength(1);
    // A second field filled later: reverting the first one leaves the second one's value.
    const other = createField(current(h).forms!, { kind: "text", page: "p0", box: { x: 10, y: 50, w: 100, h: 20 } });
    h = commit(h, { ...current(h), forms: addField(current(h).forms!, other) }, { label: "Add text field", at: 4 });
    h = commit(h, { ...current(h), forms: setValue(current(h).forms!, other.id, "Ada").state }, { label: "Fill in field", at: 5 });
    r = revertEntries(h, [0], 6);
    expect(current(r).forms!.fields.map((f) => [f.name, f.value])).toEqual([[other.name, "Ada"]]);
    // Deleting page 2 takes its field; a later fill of another field is kept. Reverting the
    // deletion brings the page back with its field.
    h = commit(h, deletePage(current(h), "p1"), { label: "Delete page 2", at: 7 });
    expect(current(h).forms!.fields.map((f) => f.id)).toEqual([other.id]);
    h = commit(h, { ...current(h), forms: setValue(current(h).forms!, other.id, "Grace").state }, { label: "Fill in field", at: 8 });
    r = revertEntries(h, [h.index - 2], 9);
    expect(current(r).pages.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(current(r).forms!.fields.map((f) => [f.id, f.value])).toEqual([
      [name.id, ""],
      [other.id, "Grace"],
    ]);
    expect(current(r).forms!.order).toEqual([...name.widgets.map((w) => w.id), ...other.widgets.map((w) => w.id)]);
  });
  it("reverts the first field on a file with no form without touching later fields (F16 E3)", () => {
    let h = createHistory(base()); // no form at all
    const a = createField(emptyForm(), { kind: "text", page: "p0", box: { x: 10, y: 10, w: 100, h: 20 } });
    h = commit(h, { ...current(h), forms: addField(emptyForm(), a) }, { label: "Add text field", at: 1 });
    const b = createField(current(h).forms!, { kind: "checkbox", page: "p0", box: { x: 10, y: 50, w: 14, h: 14 } });
    h = commit(h, { ...current(h), forms: addField(current(h).forms!, b) }, { label: "Add checkbox", at: 2 });
    h = commit(h, { ...current(h), forms: setValue(current(h).forms!, b.id, "Yes").state }, { label: "Fill in field", at: 3 });
    const r = revertEntries(h, [0], 4);
    expect(current(r).forms!.fields.map((f) => [f.id, f.value])).toEqual([[b.id, "Yes"]]);
  });
});
