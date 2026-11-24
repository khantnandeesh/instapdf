import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { missingInForm } from "./coverage";
import { addField, createField, emptyForm, setValue } from "./model";
import { ensureNotoFonts } from "./test-helpers";

const fallback = (JSON.parse(readFileSync(new URL("manifest.json", ensureNotoFonts()), "utf8")) as { fonts: { file: string; ranges: [number, number][] }[] }).fonts;

function withValue(value: string) {
  const original = emptyForm();
  const f = createField(original, { kind: "text", page: "p0", box: { x: 0, y: 0, w: 100, h: 20 }, name: "a" });
  const s = addField(original, f);
  return { original, state: setValue(s, f.id, value).state };
}

describe("missingInForm (AC-232)", () => {
  it("is empty for values the forms font covers, mixed scripts included", () => {
    const { original, state } = withValue("Zoë Šťastná ₹ 5,000 Ирина Ελένη Việt");
    expect(missingInForm(state, original, fallback)).toEqual([]);
  });
  it("lists characters no single font for the field can draw", () => {
    const { original, state } = withValue("Ирина नम 😀");
    expect(missingInForm(state, original, fallback).sort()).toEqual(["न", "म", "😀"].sort());
  });
  it("ignores untouched forms", () => {
    const { state } = withValue("😀");
    expect(missingInForm(state, state, fallback)).toEqual([]);
  });
});
