import { describe, expect, it } from "vitest";
import { moveBlock, removePages, rotatePages, type PageRef } from "@/lib/page-list";
import { fullHistory } from "./full-history";
import { emptyHistory, HISTORY_LIMIT, materialize, record, referencedSources, undo, type History } from "./history";

const { redo, dropSources } = fullHistory;

const A4 = { width: 595, height: 842 };
const pg = (uid: string, sourceId: string | null = "a", sourceIndex = 0): PageRef => ({ uid, sourceId, sourceIndex, rotation: 0, size: A4 });
const uids = (list: readonly PageRef[]) => list.map((p) => p.uid);

describe("page history", () => {
  const start = [pg("a1", "a", 0), pg("a2", "a", 1), pg("a3", "a", 2)];

  it("undoes and redoes each step in order, naming it", () => {
    let h: History = emptyHistory;
    let cur: readonly PageRef[] = start;
    const apply = (next: PageRef[], step: Parameters<typeof record>[2]) => {
      h = record(h, cur, step);
      cur = next;
    };
    apply(moveBlock(cur, new Set(["a3"]), 0), "move");
    apply(rotatePages(cur, new Set(["a1"]), 90), "rotate");
    apply(removePages(cur, new Set(["a2"])), "remove");
    expect(uids(cur)).toEqual(["a3", "a1"]);

    const steps: string[] = [];
    const states: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const u = undo(h, cur)!;
      h = u.history;
      cur = u.pages;
      steps.push(u.step);
      states.push(uids(cur));
    }
    expect(steps).toEqual(["remove", "rotate", "move"]);
    expect(states).toEqual([
      ["a3", "a1", "a2"],
      ["a3", "a1", "a2"],
      ["a1", "a2", "a3"],
    ]);
    expect(cur.every((p) => p.rotation === 0)).toBe(true);
    expect(undo(h, cur)).toBeNull();

    const redone: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = redo(h, cur)!;
      h = r.history;
      cur = r.pages;
      redone.push(r.step);
    }
    expect(redone).toEqual(["move", "rotate", "remove"]);
    expect(uids(cur)).toEqual(["a3", "a1"]);
    expect(cur.find((p) => p.uid === "a1")!.rotation).toBe(90);
    expect(redo(h, cur)).toBeNull();
  });

  it("a new edit after an undo clears the redo steps", () => {
    let h = record(emptyHistory, start, "move");
    const u = undo(h, moveBlock(start, new Set(["a3"]), 0))!;
    h = u.history;
    expect(h.future).toHaveLength(1);
    h = record(h, u.pages, "rotate");
    expect(h.future).toHaveLength(0);
    expect(redo(h, start)).toBeNull();
  });

  it(`keeps at least 50 steps (the newest ${HISTORY_LIMIT})`, () => {
    let h: History = emptyHistory;
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = record(h, [pg(`p${i}`)], "move");
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(50);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].pages[0].uid).toBe("p20");
  });

  it("lists the files history can bring back, and forgets steps to release some", () => {
    let h = record(emptyHistory, [pg("a1", "a"), pg("b1", "b")], "remove");
    h = record(h, [pg("a1", "a")], "rotate");
    expect([...referencedSources(h)].sort()).toEqual(["a", "b"]);
    const dropped = dropSources(h, new Set(["b"]));
    expect(dropped.past.map((s) => s.step)).toEqual(["rotate"]);
    expect([...referencedSources(dropped)]).toEqual(["a"]);
  });

  it("materializes placeholders: ready files expand, loading ones stay, gone ones drop", () => {
    const placeholder = (uid: string, sourceId: string): PageRef => ({ ...pg(uid, sourceId, -1), pending: true });
    const list = [pg("a1"), placeholder("x", "ready"), placeholder("y", "loading"), placeholder("z", "gone")];
    const out = materialize(list, (p) => (p.sourceId === "ready" ? [pg("r1", "ready", 0), pg("r2", "ready", 1)] : p.sourceId === "loading" ? null : []));
    expect(uids(out)).toEqual(["a1", "r1", "r2", "y"]);
  });
});
