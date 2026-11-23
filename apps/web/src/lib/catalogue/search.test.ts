import { describe, expect, it } from "vitest";
import { tools } from "@/tools/registry";
import { matchTools, splitAt } from "./search";

const names = (q: string) => matchTools(tools, q).map((m) => m.item.name);

describe("matchTools", () => {
  it("returns every tool for an empty or blank query", () => {
    expect(matchTools(tools, "")).toHaveLength(tools.length);
    expect(matchTools(tools, "   ")).toHaveLength(tools.length);
  });

  it("AC-15: `split` finds the five split tools and not Merge, Rotate or Compress", () => {
    const hits = names("split");
    expect(hits).toEqual(expect.arrayContaining(["Split", "Split by bookmarks", "Split by size", "Split by text", "Split in half"]));
    expect(hits).not.toContain("Merge");
    expect(hits).not.toContain("Rotate");
    expect(hits).not.toContain("Compress");
  });

  it("AC-16: ignores case and surrounding spaces", () => {
    expect(names("  ROTATE ")).toContain("Rotate");
  });

  it("AC-17: matches keywords", () => {
    expect(names("encrypt")).toContain("Protect");
    expect(names("jpg")).toEqual(expect.arrayContaining(["Image to PDF", "PDF to image"]));
    expect(names("combine")).toEqual(expect.arrayContaining(["Merge", "Combine & reorder"]));
    expect(names("ppt")).toContain("PDF to PowerPoint");
  });

  it("finds nothing for nonsense", () => {
    expect(matchTools(tools, "zzqx")).toEqual([]);
  });

  it("AC-63: reports the match range in the name and summary, and none for keyword-only hits", () => {
    const rotate = matchTools(tools, "rot").find((m) => m.item.slug === "rotate-pdf")!;
    expect(rotate.name).toEqual([0, 3]);
    expect(splitAt("Rotate", rotate.name)).toEqual(["", "Rot", "ate"]);
    const protect = matchTools(tools, "encrypt").find((m) => m.item.slug === "protect-pdf")!;
    expect(protect.keywordOnly).toBe(true);
    expect(protect.name ?? protect.summary).toBeUndefined();
    const img = matchTools(tools, "jpg").find((m) => m.item.slug === "image-to-pdf")!;
    expect(img.name).toBeUndefined();
    expect(img.item.summary.slice(...img.summary!)).toBe("JPG");
  });

  it("keeps registry order", () => {
    const hits = matchTools(tools, "pdf").map((m) => m.item.slug);
    const order = tools.map((t) => t.slug).filter((s) => hits.includes(s));
    expect(hits).toEqual(order);
  });
});
