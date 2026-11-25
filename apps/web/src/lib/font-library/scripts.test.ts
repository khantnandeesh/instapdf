import { describe, expect, it } from "vitest";
import { orderCandidates } from "./candidates";
import type { FamilyRow } from "./client";
import { arabicStyle, lookKind, scriptFamilies, scriptOf, scriptOrder } from "./scripts";

const row = (i: string, c: string, s: string[]): FamilyRow => ({ i, n: i, c, l: "OFL-1.1", s, w: [400], t: 0, m: "0" });
const families = [
  row("amiri", "serif", ["arabic", "latin"]),
  row("cairo", "sans-serif", ["arabic", "latin"]),
  row("hind", "sans-serif", ["devanagari", "latin"]),
  row("noto-kufi-arabic", "sans-serif", ["arabic", "latin"]),
  row("noto-naskh-arabic", "serif", ["arabic", "latin"]),
  row("noto-nastaliq-urdu", "serif", ["arabic", "latin"]),
  row("noto-sans-arabic", "sans-serif", ["arabic", "latin"]),
  row("noto-sans-devanagari", "sans-serif", ["devanagari", "latin"]),
  row("noto-sans-hebrew", "sans-serif", ["hebrew", "latin"]),
  row("noto-serif-devanagari", "serif", ["devanagari", "latin"]),
  row("noto-serif-hebrew", "serif", ["hebrew", "latin"]),
  row("tinos", "serif", ["latin", "greek", "cyrillic", "hebrew"]),
  row("tiro-devanagari-hindi", "serif", ["devanagari", "latin"]),
];

describe("faces for other writing systems (F24, AC-288)", () => {
  it("a serif font gets the script's serif face first, a sans font its sans face", () => {
    expect(scriptFamilies("devanagari", { kind: "serif", name: "Kokila" }, families).slice(0, 2)).toEqual(["noto-serif-devanagari", "tiro-devanagari-hindi"]);
    expect(scriptFamilies("devanagari", { kind: "sans-serif", name: "Mangal" }, families).slice(0, 2)).toEqual(["noto-sans-devanagari", "hind"]);
    expect(scriptFamilies("hebrew", { kind: "serif", name: "David" }, families)[0]).toBe("noto-serif-hebrew");
    expect(scriptFamilies("hebrew", { kind: "sans-serif", name: "Arial" }, families)[0]).toBe("noto-sans-hebrew");
  });

  it("tells an Arabic font's hand by its name, else by its look", () => {
    expect(arabicStyle({ kind: "sans-serif", name: "Jameel Noori Nastaleeq" })).toBe("nastaliq");
    expect(arabicStyle({ kind: "serif", name: "DecoType Kufi" })).toBe("kufi");
    expect(arabicStyle({ kind: "sans-serif", name: "Traditional Arabic" })).toBe("naskh");
    expect(arabicStyle({ kind: "serif", name: "ABCDEF+Unnamed" })).toBe("naskh");
    expect(arabicStyle({ kind: "sans-serif", name: "Dubai" })).toBe("sans");
  });

  it("Naskh, Kufi and Nastaliq fonts each get a face in their own hand first", () => {
    expect(scriptFamilies("arabic", { kind: "serif", name: "Traditional Arabic" }, families)[0]).toBe("noto-naskh-arabic");
    expect(scriptFamilies("arabic", { kind: "sans-serif", name: "Noto Kufi Arabic" }, families)[0]).toBe("noto-kufi-arabic");
    expect(scriptFamilies("arabic", { kind: "serif", name: "Jameel Noori Nastaleeq" }, families)[0]).toBe("noto-nastaliq-urdu");
    expect(scriptFamilies("arabic", { kind: "sans-serif", name: "Dubai" }, families).slice(0, 2)).toEqual(["noto-sans-arabic", "cairo"]);
  });

  it("names only families the library has, with the script", () => {
    const few = [row("noto-sans-devanagari", "sans-serif", ["devanagari"]), row("poppins", "sans-serif", ["latin"])];
    expect(scriptFamilies("devanagari", { kind: "serif", name: "" }, few)).toEqual(["noto-sans-devanagari"]);
  });

  it("reads a font's script off the letters it has", () => {
    expect(scriptOf("कखगतन")).toBe("devanagari");
    expect(scriptOf("ابتدرسعفقكلمنهوي")).toBe("arabic");
    expect(scriptOf("אבגד")).toBe("hebrew");
    expect(scriptOf("аб")).toBeNull();
    expect(scriptOf("")).toBeNull();
    // A Hindi subset with a few Latin letters is still a Hindi font; a Latin font with Arabic in it is not an Arabic one.
    expect(scriptOf("कखगतनपमरलसPDF")).toBe("devanagari");
    expect(scriptOf("aeinorstlcdumphgbfywابتدرسعفقكلمنهوي")).toBeNull();
  });

  it("a Devanagari font is given Devanagari faces: its own family, then shape matches of the script, never a look-alike of another script", () => {
    const more = [...families, row("noto-sans-sharada", "sans-serif", ["latin", "sharada"])];
    expect(scriptOrder("devanagari", { kind: "sans-serif", name: "NotoSansDevanagari" }, "noto-sans-devanagari", ["noto-sans-sharada", "hind"], more)).toEqual(["noto-sans-devanagari", "hind", "noto-serif-devanagari", "tiro-devanagari-hindi"]);
    expect(scriptOrder("devanagari", { kind: "serif", name: "Kokila" }, undefined, ["noto-sans-sharada"], more)[0]).toBe("noto-serif-devanagari");
  });

  it("Hindi typed into a Latin serif line is offered a serif Devanagari face before a sans one", () => {
    const out = orderCandidates({ matches: [], named: ["tinos", "noto-sans-devanagari"], fallbacks: ["tinos", "arimo"], families, kind: "serif", name: "Times New Roman", chars: "क" });
    expect(out.indexOf("noto-serif-devanagari")).toBeLessThan(out.indexOf("noto-sans-devanagari"));
    expect(out[0]).toBe("tinos");
  });

  it("Arabic typed into a line in a Kufi font is offered a Kufi face first after the font's own family", () => {
    const out = orderCandidates({ matches: [], named: [undefined, "noto-naskh-arabic"], fallbacks: ["arimo"], families, kind: "sans-serif", name: "DecoType Kufi", chars: "ب" });
    expect(out[0]).toBe("noto-kufi-arabic");
    expect(out).toContain("noto-naskh-arabic");
  });

  it("Greek and Cyrillic go by shape as before: no script family is put ahead", () => {
    const out = orderCandidates({ matches: [], named: ["tinos"], fallbacks: ["tinos"], families, kind: "serif", chars: "α" });
    expect(out[0]).toBe("tinos");
  });
});

describe("serif or sans of a document font (AC-288)", () => {
  const font = (name: string, serif = false, monospace = false) => ({ name, serif, monospace });
  it("asks the library's entry of that name first, then the name, then the PDF's flag", () => {
    expect(lookKind(font("ABCDEF+Amiri-Regular"), { c: "serif" })).toBe("serif");
    expect(lookKind(font("NotoSerifDevanagari-Regular"))).toBe("serif");
    expect(lookKind(font("ABCDEF+NotoSerifBengali"))).toBe("serif");
    expect(lookKind(font("NotoSansHebrew", true))).toBe("sans-serif");
    expect(lookKind(font("Mangal", true))).toBe("serif");
    expect(lookKind(font("Mangal"))).toBe("sans-serif");
    expect(lookKind(font("Whatever", true, true))).toBe("monospace");
    // The upright cut of a sans family, and a subset tag that happens to spell a word.
    expect(lookKind(font("Avenir-Roman"))).toBe("sans-serif");
    expect(lookKind(font("TimesNewRomanPSMT"))).toBe("serif");
    expect(lookKind(font("SERIFX+Mangal"))).toBe("sans-serif");
  });

  it("a serif font of one script gets the serif face of another", () => {
    const families = [row("noto-sans-bengali", "sans-serif", ["bengali"]), row("noto-serif-bengali", "serif", ["bengali"])];
    expect(scriptFamilies("bengali", { kind: lookKind(font("NotoSerifDevanagari")), name: "NotoSerifDevanagari" }, families)[0]).toBe("noto-serif-bengali");
  });
});
