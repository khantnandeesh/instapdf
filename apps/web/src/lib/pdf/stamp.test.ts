import fontkit from "@cantoo/fontkit";
import { PDFDocument, PDFName, StandardFonts, degrees } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPdf } from "@/lib/editor/build";
import { nodeFonts } from "@/lib/editor/node-fonts";
import type { ImageObj, TextObj } from "@/lib/editor/model";
import { fillTokens, fittedSize, numbering, roman, stampObjects, type LineStamp, type PageShape, type TextMark } from "./stamp";
import { stampPdf, type StampBuild } from "./stamp-run";

const style = { font: "arimo", size: 12, color: "#000000", bold: false } as const;
const values = { n: 4, total: 9, file: "report", date: "28 Nov 2026" };
const upright: PageShape = { id: "p0", view: [0, 0, 600, 800], baseRotate: 0 };

describe("stamp text (F9 AC-1100 to AC-1103)", () => {
  it("AC-1100: tokens are filled; other braces stay as typed", () => {
    expect(fillTokens("Page {n} of {total}", values)).toBe("Page 4 of 9");
    expect(fillTokens("{file} · {date} · {ROMAN} · {roman}", values)).toBe("report · 28 Nov 2026 · IV · iv");
    expect(fillTokens("{name} {N}", values)).toBe("{name} {N}");
  });
  it("AC-1101: roman numerals, and digits where there are none", () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1994, 3999].map(roman)).toEqual(["I", "IV", "IX", "XIV", "XL", "XC", "CD", "MCMXCIV", "MMMCMXCIX"]);
    expect([0, -2, 4000].map(roman)).toEqual(["0", "-2", "4000"]);
  });
  it("AC-1102: numbers count the stamped pages from the first number", () => {
    const { numbers, total } = numbering(6, [5, 2, 3, 2, 9], 1);
    expect([...numbers]).toEqual([[2, 1], [3, 2], [5, 3]]);
    expect(total).toBe(3);
    expect(numbering(3, [0, 1, 2], 10).total).toBe(12);
  });
  it("AC-1103: a watermark's text never outgrows the room it has", () => {
    expect(fittedSize("DRAFT", 72, 600)).toBe(72);
    expect(fittedSize("A very long line of watermark text here", 72, 400)).toBeLessThan(20);
    expect(fittedSize("x", 2, 400)).toBe(4);
  });
});

describe("stamp layout (F9 AC-1110 to AC-1114)", () => {
  const line = (place: LineStamp["place"]): LineStamp => ({ kind: "line", place, text: "{n}", style, margin: 30 });
  it("AC-1110: a line sits in the margin, as wide as the page between the margins, aligned by its place", () => {
    const [top] = stampObjects(upright, [line("top-right")], values) as TextObj[];
    expect(top).toMatchObject({ x: 30, y: 30, w: 540, h: 15, rot: 0, align: "right", lines: ["4"] });
    const [bottom] = stampObjects(upright, [line("bottom-center")], values) as TextObj[];
    expect(bottom).toMatchObject({ x: 30, y: 755, align: "center" });
  });
  it("AC-1111: on a turned page the line still reads upright along the edge the reader sees", () => {
    // /Rotate 90: the reader sees an 800 × 600 page; its top edge is the frame's left edge.
    const [o] = stampObjects({ ...upright, baseRotate: 90 }, [line("top-left")], values) as TextObj[];
    expect(o.rot).toBe(270);
    expect(o.w).toBe(740);
    // Centre: shown (400, 37.5) is frame (37.5, 800 − 400).
    expect([o.x + o.w / 2, o.y + o.h / 2]).toEqual([37.5, 400]);
    const [half] = stampObjects({ ...upright, baseRotate: 180 }, [line("top-left")], values) as TextObj[];
    expect(half.rot).toBe(180);
    expect(half.y + half.h / 2).toBe(800 - 37.5);
  });
  it("AC-1112: an empty line draws nothing", () => {
    expect(stampObjects(upright, [{ ...line("top-left"), text: "   " }], values)).toEqual([]);
  });
  const mark: TextMark = { kind: "text", text: "DRAFT", style: { ...style, size: 72 }, opacity: 0.3, angle: 45, layout: "center" };
  it("AC-1113: a watermark is centred, turned and see-through; tiled it covers the page", () => {
    const [one] = stampObjects(upright, [mark], values) as TextObj[];
    expect([one.x + one.w / 2, one.y + one.h / 2]).toEqual([300, 400]);
    expect(one).toMatchObject({ rot: -45 + 360, opacity: 0.3, align: "center", size: 72 });
    const tiles = stampObjects(upright, [{ ...mark, layout: "tile" }], values) as TextObj[];
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    for (const t of tiles) {
      expect(t.x + t.w / 2).toBeGreaterThan(0);
      expect(t.x + t.w / 2).toBeLessThan(600);
    }
  });
  it("AC-1114: a picture keeps its shape and stays on the page", () => {
    const [img] = stampObjects(upright, [{ kind: "image", asset: "a", width: 200, height: 100, scale: 0.5, opacity: 0.5, angle: 0, layout: "center" }], values) as ImageObj[];
    expect(img).toMatchObject({ w: 300, h: 150, x: 150, y: 325, opacity: 0.5 });
    const [tall] = stampObjects(upright, [{ kind: "image", asset: "a", width: 100, height: 1000, scale: 1, opacity: 1, angle: 0, layout: "center" }], values) as ImageObj[];
    expect(tall.h).toBeLessThanOrEqual(800);
    expect(tall.w / tall.h).toBeCloseTo(0.1, 5);
  });
});

describe("stamped files (F9 AC-1120 to AC-1123)", () => {
  async function source() {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 3; i++) doc.addPage([600, 800]).drawText(`Body ${i + 1}`, { x: 50, y: 400, size: 20, font });
    doc.getPage(2).setRotation(degrees(90));
    return doc.save();
  }
  const build = async (): Promise<StampBuild> => {
    const fonts = await nodeFonts();
    return (input) => buildPdf(input, fonts, fontkit);
  };
  async function items(bytes: Uint8Array) {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    const out: { str: string; x: number; y: number }[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      out.push((content.items as { str: string; transform: number[] }[]).filter((it) => it.str?.trim()).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] })));
    }
    await task.destroy();
    return out;
  }
  const footer: LineStamp = { kind: "line", place: "bottom-center", text: "Page {n} of {total}", style, margin: 30 };

  it("AC-1120: page numbers land in the footer of the picked pages, counted from the first number", async () => {
    const r = await stampPdf({ bytes: await source(), pages: [1, 2], stamps: [footer], first: 1, file: "f", date: "" }, await build());
    const pages = await items(r.bytes);
    expect(pages[0].map((t) => t.str)).toEqual(["Body 1"]);
    const two = pages[1].find((t) => t.str.startsWith("Page"))!;
    expect(two.str).toBe("Page 1 of 2");
    expect(two.y).toBeGreaterThan(30);
    expect(two.y).toBeLessThan(45);
    // Centred: the line's middle is the page's middle.
    expect(two.x).toBeGreaterThan(260);
    expect(two.x).toBeLessThan(300);
    // The turned page: the reader's bottom edge is the frame's right edge.
    const three = pages[2].find((t) => t.str.startsWith("Page"))!;
    expect(three.str).toBe("Page 2 of 2");
    expect(three.x).toBeGreaterThan(555);
    expect(three.x).toBeLessThan(570);
  });
  it("AC-1121: a see-through watermark is drawn with its opacity, and the page's own text stays", async () => {
    const mark: TextMark = { kind: "text", text: "DRAFT", style: { ...style, size: 60, color: "#cc0000" }, opacity: 0.25, angle: 45, layout: "center" };
    const r = await stampPdf({ bytes: await source(), pages: [0], stamps: [mark], first: 1, file: "f", date: "" }, await build());
    const doc = await PDFDocument.load(r.bytes);
    const states = doc.getPage(0).node.Resources()!.lookup(PDFName.of("ExtGState"));
    expect(String(states)).toContain("/ca 0.25");
    expect((await items(r.bytes))[0].map((t) => t.str).sort()).toEqual(["Body 1", "DRAFT"]);
  });
  it("AC-1122: no pages picked, or only empty text, gives the file back unchanged", async () => {
    const bytes = await source();
    const r = await stampPdf({ bytes, pages: [], stamps: [footer], first: 1, file: "f", date: "" }, async () => { throw new Error("not built"); });
    expect(r.bytes).toBe(bytes);
    expect(r.pageCount).toBe(3);
  });
  it("AC-1123: a file opened with a password is stamped and saved without it", async () => {
    const plain = await PDFDocument.load(await source());
    plain.encrypt({ userPassword: "pw", ownerPassword: "owner" });
    const locked = await plain.save();
    const r = await stampPdf({ bytes: locked, password: "pw", pages: [0], stamps: [footer], first: 7, file: "f", date: "" }, await build());
    expect(r.wasEncrypted).toBe(true);
    const out = await PDFDocument.load(r.bytes);
    expect(out.isEncrypted).toBe(false);
    expect((await items(r.bytes))[0].map((t) => t.str)).toContain("Page 7 of 7");
  });
});
