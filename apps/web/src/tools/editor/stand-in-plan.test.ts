import { describe, expect, it } from "vitest";
import { planCover } from "./font-service";

const by = (o: Record<string, string>) => new Map(Object.entries(o).map(([id, s]) => [id, [...s]]));

describe("planCover: which font draws which missing letter", () => {
  it("gives the font in use what it has and the rest to the font that has it", () => {
    const plan = planCover(["tinos"], ["own", "tinos", "lora"], by({ tinos: "ř", lora: "ř", own: "ř⸘" }), ["ř", "⸘"]);
    expect(plan).toEqual([
      { id: "tinos", chars: ["ř"] },
      { id: "own", chars: ["⸘"] },
    ]);
  });

  it("keeps a font whose only letter no other font has", () => {
    const fonts = by({ a: "नया", b: "नया", c: "नया", own: "⸘" });
    expect(planCover(["a"], ["a", "b", "c", "own"], fonts, ["न", "य", "ा", "⸘"]).map((p) => p.id)).toEqual(["a", "own"]);
  });

  it("follows the fonts named first, in their order, before looking for more", () => {
    const fonts = by({ a: "x", b: "yz", c: "y", d: "z" });
    expect(planCover(["a", "c"], ["a", "b", "c", "d"], fonts, ["x", "y", "z"])).toEqual([
      { id: "a", chars: ["x"] },
      { id: "c", chars: ["y"] },
      { id: "b", chars: ["z"] },
    ]);
  });

  it("leaves out a font that adds nothing, and stops when no font has what is left", () => {
    expect(planCover(["a"], ["a", "b"], by({ a: "", b: "x" }), ["x", "q"])).toEqual([{ id: "b", chars: ["x"] }]);
  });
});
