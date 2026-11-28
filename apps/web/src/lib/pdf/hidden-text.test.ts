import { describe, expect, it } from "vitest";
import { stripHiddenText } from "./hidden-text";

const enc = new TextEncoder();
const run = (s: string) => {
  const r = stripHiddenText(enc.encode(s));
  return { ...r, text: new TextDecoder().decode(r.bytes) };
};

describe("hidden text (F15 OCR)", () => {
  it("AC-1550: text drawn in render mode 3 is taken out; text that shows stays as written", () => {
    const r = run("BT /F1 12 Tf 3 Tr 10 20 Td (hidden) Tj [(a) -20 (b)] TJ ET\nBT 0 Tr (seen) Tj ET");
    expect(r.removed).toBe(2);
    expect(r.text).not.toContain("hidden");
    expect(r.text).not.toContain("[(a)");
    expect(r.text).toContain("(seen) Tj");
    expect(r.paints).toBe(true);
  });
  it("AC-1551: the mode is saved and restored with the graphics state, and strings may hold brackets and operators", () => {
    const r = run("q 3 Tr BT (in \\) Tj (nested) here) Tj ET Q BT (after Q) Tj ET");
    expect(r.removed).toBe(1);
    expect(r.text).toContain("(after Q) Tj");
    expect(r.text).not.toContain("nested");
  });
  it("AC-1552: a stream with nothing hidden comes back as it was; forms drawn are listed with their place", () => {
    const src = enc.encode("q 1 0 0 1 0 0 cm /Im0 Do Q 0 0 10 10 re f");
    const r = stripHiddenText(src);
    expect(r.bytes).toBe(src);
    expect(r.draws).toEqual([{ name: "Im0", start: 17, end: 24 }]);
    expect(r.paints).toBe(true);
  });
  it("AC-1553: a stream of hidden text only paints nothing; an inline picture's data is not read as operators", () => {
    expect(run("BT 3 Tr /F1 8 Tf (word) Tj ET").paints).toBe(false);
    const r = run("BI /W 1 /H 1 ID (Tj) 3 Tr EI BT (kept) Tj ET");
    expect(r.removed).toBe(0);
    expect(r.paints).toBe(true);
  });
  it("AC-1554: the quote operators leave their line break behind", () => {
    expect(run("BT 3 Tr (a) ' ET").text).toBe("BT 3 Tr T* ET");
  });
});
