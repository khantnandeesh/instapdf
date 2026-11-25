import { describe, expect, it } from "vitest";
import { orderCandidates, setsOf } from "./candidates";
import type { FamilyRow } from "./client";
import type { FontMatch } from "./match";

const row = (i: string, c: string, s: string[]): FamilyRow => ({ i, n: i, c, l: "OFL-1.1", s, w: [400], t: 0, m: "0" });
const match = (family: string, grade: FontMatch["grade"]): FontMatch => ({ face: `${family}_400_normal`, family, weight: 400, italic: false, grade, distance: 0, letters: 20 });

const families = [
  row("advent-pro", "sans-serif", ["latin", "greek", "cyrillic"]),
  row("alegreya", "serif", ["latin", "greek", "cyrillic"]),
  row("adamina", "serif", ["latin"]),
  row("besley", "serif", ["latin", "latin-ext"]),
  row("carlito", "sans-serif", ["latin", "greek", "cyrillic"]),
  row("inter", "sans-serif", ["latin", "latin-ext", "greek"]),
  row("noto-serif-georgian", "serif", ["latin", "georgian"]),
  row("noto-serif-telugu", "serif", ["latin", "latin-ext", "telugu"]),
  row("tinos", "serif", ["latin", "greek", "cyrillic", "hebrew"]),
];
const base = { fallbacks: ["tinos", "arimo"], families, kind: "serif" as const };

describe("the order fonts are tried in for characters a document font lacks (F24)", () => {
  it("AC-281: the document's own family comes first when the shapes agree, before any A–Z family", () => {
    const out = orderCandidates({ ...base, kind: "sans-serif", fallbacks: ["arimo"], matches: [match("carlito", "exact")], named: ["carlito"], chars: "αЖ" });
    expect(out[0]).toBe("carlito");
    expect(out.indexOf("advent-pro")).toBeGreaterThan(out.indexOf("arimo"));
  });

  it("AC-301: the closest by shape comes before families that merely have the alphabet", () => {
    const out = orderCandidates({ ...base, matches: [match("tinos", "exact"), match("besley", "loose")], named: [undefined], chars: "α" });
    expect(out.slice(0, 2)).toEqual(["tinos", "besley"]);
    expect(out).toContain("alegreya");
    expect(out.indexOf("alegreya")).toBeGreaterThan(out.indexOf("besley"));
  });

  it("AC-282: a name the shapes disagree with waits until after the fonts that look like the text", () => {
    const out = orderCandidates({ ...base, matches: [match("adamina", "close"), match("noto-serif-telugu", "close"), match("besley", "close")], named: ["inter"], chars: "ř" });
    expect(out.slice(0, 2)).toEqual(["adamina", "besley"]);
    expect(out[out.length - 1]).toBe("inter");
  });

  it("with no shapes compared, the name is all there is and is used", () => {
    expect(orderCandidates({ ...base, matches: [], named: ["inter"], chars: "ř" })[0]).toBe("inter");
  });

  it("a family made for another script is offered only for that script", () => {
    const matches = [match("adamina", "close"), match("noto-serif-telugu", "close")];
    expect(orderCandidates({ ...base, matches, named: [], chars: "ř" })).not.toContain("noto-serif-telugu");
    expect(orderCandidates({ ...base, matches, named: [], chars: "అ" })).toContain("noto-serif-telugu");
  });

  it("the person's choice is first whatever else is known", () => {
    expect(orderCandidates({ ...base, choice: "besley", matches: [match("tinos", "exact")], named: [], chars: "α" })[0]).toBe("besley");
  });

  it("knows the sets of scripts the library has families for", () => {
    expect(setsOf("aα")).toEqual(["greek"]);
    expect(setsOf("აⴰᎠ⠀ ")).toEqual(["georgian", "tifinagh", "cherokee", "braille", "ogham"]);
    expect(orderCandidates({ ...base, matches: [], named: [], chars: "ა" })).toContain("noto-serif-georgian");
  });
});
