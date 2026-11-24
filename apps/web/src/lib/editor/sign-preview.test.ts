import { describe, expect, it } from "vitest";
import { drawnPreview, safeHex } from "./sign-preview";

const svgOf = (url: string) => decodeURIComponent(url.slice(url.indexOf(",") + 1));

describe("safeHex", () => {
  it("accepts #rrggbb only", () => {
    expect(safeHex("#1A2b3C")).toBe("#1A2b3C");
    for (const bad of ["red", "#fff", "#12345g", '#000000"/><script>', "", null, 7]) expect(safeHex(bad)).toBe("#000000");
  });
});

describe("drawnPreview", () => {
  it("never puts a malicious colour in the SVG", () => {
    const evil = '#000"/><image href="https://example.invalid/x.png"/><g stroke="';
    const svg = svgOf(drawnPreview([[[0.1, 0.5], [0.9, 0.5]]], 3.2, evil));
    expect(svg).not.toContain("example.invalid");
    expect(svg).not.toContain("<image");
    expect(svg).toContain('stroke="#000000"');
  });
  it("keeps a valid colour", () => {
    expect(svgOf(drawnPreview([[[0.1, 0.5]]], 3.2, "#1f4fbf"))).toContain('stroke="#1f4fbf"');
  });
});
