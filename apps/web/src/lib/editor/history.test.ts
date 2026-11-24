import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commit, createHistory, current, MAX_STEPS, redo, revertEntries, undo, undoEntry } from "./history";
import { addField, createField, emptyForm, setValue } from "@/lib/forms/model";
import { addObjects, initialPages, moveObject, removeObjects, rotatePage, updateObjects, type DocState, type ShapeObj } from "./model";

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
  it("reverts form changes with their entries, and keeps the form when a later kept change edited it (F16 E3)", () => {
    const pages = initialPages([{ view: [0, 0, 600, 800], rotate: 0 }, { view: [0, 0, 600, 800], rotate: 0 }]);
    const f0 = emptyForm();
    let h = createHistory({ pages, objects: [], engine: 0, forms: f0 });
    const name = createField(f0, { kind: "text", page: "p1", box: { x: 10, y: 10, w: 100, h: 20 } });
    const f1 = addField(f0, name);
    h = commit(h, { ...current(h), forms: f1 }, { label: "Add text field", at: 1 });
    h = commit(h, addObjects(current(h), [rect("a")]), { label: "Add rectangle", at: 2 });
    // Revert only the field: the rectangle stays, the form goes back.
    const r = revertEntries(h, [0], 3);
    expect(current(r).forms).toBe(f0);
    expect(current(r).objects).toHaveLength(1);
    // A later form change that is kept: the form is left as it is now.
    const f2 = setValue(f1, name.id, "Ada").state;
    h = commit(h, { ...current(h), forms: f2 }, { label: "Fill in field", at: 4 });
    expect(current(revertEntries(h, [0], 5)).forms!.fields[0].value).toBe("Ada");
    // Deleting the page drops its widgets when the revert brings pages back without it.
    h = commit(h, { ...current(h), pages: current(h).pages.slice(0, 1) }, { label: "Delete page 2", at: 6 });
    expect(current(revertEntries(h, [1], 7)).forms!.fields).toHaveLength(0);
  });
});
