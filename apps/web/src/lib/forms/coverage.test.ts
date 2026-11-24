import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { missingInForm, missingInText } from "./coverage";
import { addField, createField, emptyForm, setValue } from "./model";
import { ensureNotoFonts } from "./test-helpers";

const fallback = (JSON.parse(readFileSync(new URL("manifest.json", ensureNotoFonts()), "utf8")) as { fonts: { file: string; ranges: [number, number][] }[] }).fonts;
const forms = (JSON.parse(readFileSync(new URL("../../../public/fonts/forms/noto-sans-forms.json", import.meta.url), "utf8")) as { ranges: [number, number][] }).ranges;

function withValue(value: string) {
  const original = emptyForm();
  const f = createField(original, { kind: "text", page: "p0", box: { x: 0, y: 0, w: 100, h: 20 }, name: "a" });
  const s = addField(original, f);
  return { original, state: setValue(s, f.id, value).state };
}

describe("missingInForm (AC-232)", () => {
  it("is empty for values the forms font covers, mixed scripts included", () => {
    const { original, state } = withValue("Zoë Šťastná ₹ 5,000 Ирина Ελένη Việt");
    expect(missingInForm(state, original, forms, fallback)).toEqual([]);
  });
  it("lists characters no single font for the field can draw", () => {
    const { original, state } = withValue("Ирина नम 😀");
    expect(missingInForm(state, original, forms, fallback).sort()).toEqual(["न", "म", "😀"].sort());
  });
  it("ignores untouched forms", () => {
    const { state } = withValue("😀");
    expect(missingInForm(state, state, forms, fallback)).toEqual([]);
  });
  it("uses the font's real characters and counts unusual spaces (review)", () => {
    // U+2011 (non-breaking hyphen) is inside the slices' ranges but not in the font; U+202F is a space.
    expect(missingInText("Šťastná‑Nováková", forms, fallback)).toEqual(["‑"]);
    expect(missingInText("Zoë 5 000 ₹", forms, fallback)).toEqual([" "]);
    // WinAnsi alone: Helvetica draws it, the per mille sign included.
    expect(missingInText("5 ‰ … €", forms, fallback)).toEqual([]);
  });
});
