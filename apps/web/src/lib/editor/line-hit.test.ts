import { describe, expect, it } from "vitest";
import { lineAt, textAt } from "./line-hit";

const item = (str: string, x: number, y: number, w: number, size = 12) => ({ str, transform: [size, 0, 0, size, x, y], width: w, height: size });
const line = (text: string, x0: number, y0: number, x1: number, y1: number, editable = true) => ({ text, editable, bbox: { x0, y0, x1, y1 } });

describe("textAt", () => {
  it("finds text under the point and ignores blank space", () => {
    const items = [item("Hello world", 72, 700, 80), item("   ", 72, 600, 80)];
    expect(textAt(items, 100, 705)).toBe(true);
    expect(textAt(items, 100, 650)).toBe(false);
    expect(textAt(items, 100, 605)).toBe(false);
    expect(textAt(items, 300, 705)).toBe(false);
  });
});

describe("lineAt", () => {
  it("picks the editable line under the point, nearest centre first", () => {
    const lines = [line("Title", 72, 695, 200, 715), line("Body", 72, 680, 200, 698), line("Locked", 72, 600, 200, 615, false)];
    expect(lineAt(lines, 100, 706)).toBe(0);
    expect(lineAt(lines, 100, 688)).toBe(1);
    expect(lineAt(lines, 100, 607)).toBe(-1);
    expect(lineAt(lines, 400, 706)).toBe(-1);
  });
});
