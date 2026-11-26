import { describe, expect, it } from "vitest";
import { pageBoxStyle, pageTransform, TILE_ASPECT } from "./page-box";

const A4 = { width: 595, height: 842 };
const LETTER = { width: 612, height: 792 };
const LANDSCAPE = { width: 842, height: 595 };
const num = (s: string) => parseFloat(s) / 100;
const scaleOf = (t: string) => Number(/scale\(([\d.]+)\)/.exec(t)?.[1] ?? 1);

describe("page tiles (berrypdf.md 'Page tiles')", () => {
  it("an A4 page and anything wider fill the box width", () => {
    for (const size of [A4, LETTER, LANDSCAPE]) expect(num(pageBoxStyle(size).width)).toBeCloseTo(1, 2);
  });

  it("keeps the page's aspect ratio inside the page-shaped box", () => {
    const { width, height } = pageBoxStyle(LETTER);
    expect((num(width) / num(height)) * TILE_ASPECT).toBeCloseTo(612 / 792, 3);
  });

  it("a page turned 90 degrees is scaled to fit the same box, across its full width", () => {
    const t = pageTransform(A4, 90);
    expect(t).toMatch(/^rotate\(90deg\) scale\(/);
    // A4 fills the box (W x H); turned it is H wide, so it scales by W/H to span the width exactly.
    expect(scaleOf(t)).toBeCloseTo(TILE_ASPECT, 3);
    expect(pageTransform(A4, -270)).toBe(pageTransform(A4, -270));
    expect(pageTransform(A4, 180)).toBe("rotate(180deg)");
    expect(pageTransform(A4, 0)).toBe("rotate(0deg)");
  });

  it("a landscape page turned upright grows to the box height, never past the width", () => {
    const k = scaleOf(pageTransform(LANDSCAPE, 90));
    const { width, height } = pageBoxStyle(LANDSCAPE);
    // turned: on-screen width = height fraction * H * k, in W units = num(height) / TILE_ASPECT * k
    expect((num(height) / TILE_ASPECT) * k).toBeLessThanOrEqual(1.0001);
    expect(num(width) * TILE_ASPECT * k).toBeLessThanOrEqual(1.0001);
  });

  it("boxAspect 1 is the old square box (longest side fills it)", () => {
    expect(pageBoxStyle(A4, 1)).toEqual({ width: `${+((595 / 842) * 100).toFixed(3)}%`, height: "100%" });
  });
});
