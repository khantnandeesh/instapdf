import { describe, expect, it } from "vitest";
import { derivedName, pageImageName } from "./naming";
import { imagePageSize, imagePlacement, setImagePreviewLayout } from "./images";
import { MAX_PAGE_PIXELS, pageScale } from "./page-images";

describe("pageScale (F12 AC-704)", () => {
  it("draws at dpi / 72", () => {
    expect(pageScale(595, 842, 150)).toEqual({ scale: 150 / 72, reduced: false });
    expect(pageScale(595, 842, 300).scale).toBeCloseTo(4.1667, 3);
  });
  it("lowers the scale so a huge page stays under the pixel cap and the canvas side limit", () => {
    const big = pageScale(14_400, 14_400, 300);
    expect(big.reduced).toBe(true);
    expect(14_400 * big.scale * 14_400 * big.scale).toBeLessThanOrEqual(MAX_PAGE_PIXELS + 1);
    const long = pageScale(100, 14_400, 300);
    expect(long.reduced).toBe(true);
    expect(14_400 * long.scale).toBeLessThanOrEqual(16_384);
  });
});

describe("image names (F12 AC-701)", () => {
  it("pads the page number to the document's page count", () => {
    expect(pageImageName("report.pdf", 2, 3, "jpg")).toBe("report-2.jpg");
    expect(pageImageName("report.pdf", 2, 120, "png")).toBe("report-002.png");
  });
  it("derives the ZIP, TIFF and text names from the input", () => {
    expect(derivedName("report.pdf", "-images.zip")).toBe("report-images.zip");
    expect(derivedName("report.pdf", ".txt")).toBe("report.txt");
    expect(derivedName(undefined, ".txt")).toBe("berrypdf.txt");
  });
});

describe("image layout (F12 AC-711, AC-712)", () => {
  it("fills the chosen page inside the margin, enlarging small images", () => {
    const p = imagePlacement(100, 50, { size: "a4", orientation: "portrait", margin: 36 });
    expect(p.page).toEqual({ width: 595, height: 842 });
    expect(p.width).toBeCloseTo(523);
    expect(p.x).toBeCloseTo(36);
    expect(p.y).toBeCloseTo((842 - p.height) / 2);
  });
  it("auto orientation follows the image; a fixed one does not", () => {
    expect(imagePageSize(200, 100, { size: "letter", orientation: "auto", margin: 0 })).toEqual({ width: 792, height: 612 });
    expect(imagePageSize(200, 100, { size: "letter", orientation: "portrait", margin: 0 })).toEqual({ width: 612, height: 792 });
  });
  it("Fit to image: the page is the image plus the margin", () => {
    const p = imagePlacement(300, 200, { size: "fit", orientation: "auto", margin: 36 });
    expect(p.page).toEqual({ width: 372, height: 272 });
    expect([p.x, p.y, p.width, p.height]).toEqual([36, 36, 300, 200]);
  });
  it("without a layout Merge's rule stands; the preview layout applies only when no layout is named", () => {
    expect(imagePlacement(100, 50).width).toBe(100);
    setImagePreviewLayout({ size: "fit", orientation: "auto", margin: 0 });
    expect(imagePageSize(100, 50)).toEqual({ width: 100, height: 50 });
    setImagePreviewLayout(undefined);
    expect(imagePageSize(100, 50)).toEqual({ width: 842, height: 595 });
  });
});
