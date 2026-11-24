import { describe, expect, it } from "vitest";
import { isPrefix, pushUndo, trimToBudget, undoBytes, type UndoEntry } from "./undo";

const bytes = (...n: number[]) => new Uint8Array(n);

describe("editor undo history", () => {
  it("stores only a length when the save appended", () => {
    const a = bytes(1, 2, 3);
    const b = bytes(1, 2, 3, 4, 5);
    const c = bytes(1, 2, 3, 4, 5, 6);
    let h = pushUndo([], a, b, 0, true);
    h = pushUndo(h, b, c, 1, true);
    expect(h).toEqual([
      { page: 0, length: 3 },
      { page: 1, length: 5 },
    ]);
    expect([...undoBytes(h[1], c)]).toEqual([...b]);
    expect([...undoBytes(h[0], c)]).toEqual([...a]);
  });

  it("detects a broken prefix and falls back to copies", () => {
    expect(isPrefix(bytes(1, 2), bytes(1, 2, 3))).toBe(true);
    expect(isPrefix(bytes(1, 9), bytes(1, 2, 3))).toBe(false);
    expect(isPrefix(bytes(1, 2, 3), bytes(1, 2))).toBe(false);
    const a = bytes(1, 2);
    const b = bytes(1, 2, 3);
    const rewritten = bytes(7, 7, 7, 7);
    const h = pushUndo(pushUndo([], a, b, 0, true), b, rewritten, 0, false);
    expect(h.map((e) => ("bytes" in e ? [...e.bytes] : e.length))).toEqual([[1, 2], [1, 2, 3]]);
    expect([...undoBytes(h[0], rewritten)]).toEqual([1, 2]);
  });

  it("refuses an appended claim the bytes contradict (debug check)", () => {
    expect(() => pushUndo([], bytes(1, 2), bytes(9, 2, 3), 0, true)).toThrow(/appended/);
  });

  it("keeps copies within the byte budget, oldest dropped first, newest always kept", () => {
    const e = (n: number): UndoEntry => ({ page: 0, bytes: new Uint8Array(n) });
    expect(trimToBudget([e(40), e(40), e(40)], 100).length).toBe(2);
    expect(trimToBudget([e(40), { page: 0, length: 9 }, e(500)], 100)).toHaveLength(1);
  });
});
