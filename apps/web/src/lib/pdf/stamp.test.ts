import fontkit from "@cantoo/fontkit";
import { PDFDict, PDFDocument, PDFName, StandardFonts, degrees } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPdf } from "@/lib/editor/build";
import { nodeFonts } from "@/lib/editor/node-fonts";
import { LINE_HEIGHT, type ImageObj, type TextObj } from "@/lib/editor/model";
import { batesNumber, batesTemplate, fillTokens, fittedSize, numbering, roman, stampObjects, STAMP_LINE_HEIGHT, type LineStamp, type PageShape, type TextMark } from "./stamp";
import { stampPdf, type StampBuild } from "./stamp-run";

const style = { font: "arimo", size: 12, color: "#000000", bold: false } as const;
const values = { n: 4, total: 9, file: "report", date: "28 Nov 2026" };
const upright: PageShape = { id: "p0", view: [0, 0, 600, 800], baseRotate: 0 };

describe("stamp text (F9 AC-1100 to AC-1103)", () => {
  it("AC-1100: tokens are filled; other braces stay as typed", () => {
    expect(fillTokens("Page {n} of {total}", values)).toBe("Page 4 of 9");
    expect(fillTokens("{file} · {date} · {ROMAN} · {roman}", values)).toBe("report · 28 Nov 2026 · IV · iv");
    expect(fillTokens("{name} {N}", values)).toBe("{name} {N}");
    // What cannot be printed goes: a tab is a space, a zero-width space is nothing.
    expect(fillTokens("a\tb {file}", { ...values, file: "re\u200bport\n2" })).toBe("a b report 2");
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
  it("AC-1115: a quarter turn the other way, on a page whose visible box starts off the origin", () => {
    // /Rotate 270: the reader sees 800 × 600; shown (x, y) is frame (600 − y, x). The frame has no origin offset: the build adds the box's.
    const [o] = stampObjects({ id: "p0", view: [50, 100, 650, 900], baseRotate: 270 }, [line("top-left")], values) as TextObj[];
    expect(o.rot).toBe(90);
    expect([o.x + o.w / 2, o.y + o.h / 2]).toEqual([600 - 37.5, 400]);
  });
  it("AC-1116: lines on the same edge share its width and never overlap", () => {
    const [l, c, r] = stampObjects(upright, [line("top-left"), line("top-center"), line("top-right"), line("bottom-left")], values) as TextObj[];
    expect(l.x + l.w).toBeLessThan(c.x);
    expect(c.x + c.w).toBeLessThan(r.x);
    expect(c.x + c.w / 2).toBe(300);
    expect(r.x + r.w).toBe(570);
    const [a, b] = stampObjects(upright, [line("bottom-left"), line("bottom-right")], values) as TextObj[];
    expect(a.w).toBeGreaterThan(250);
    expect(a.x + a.w).toBeLessThan(b.x);
  });
  it("lines are as tall as the editor's", () => {
    expect(STAMP_LINE_HEIGHT).toBe(LINE_HEIGHT);
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
    const out: { str: string; x: number; y: number; w: number }[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      out.push((content.items as { str: string; width: number; transform: number[] }[]).filter((it) => it.str?.trim()).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })));
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
    expect(String(doc.context.lookup(doc.getPage(0).node.Resources()!.lookup(PDFName.of("ExtGState"), PDFDict).values()[0]))).toContain("/ca 0.25");
    expect((await items(r.bytes))[0].map((t) => t.str).sort()).toEqual(["Body 1", "DRAFT"]);
  });
  it("AC-1124: wide letters are drawn smaller, so the line stays on the page", async () => {
    const wide = "W".repeat(24);
    const mark: TextMark = { kind: "text", text: wide, style: { ...style, size: 72, bold: true }, opacity: 1, angle: 0, layout: "center" };
    const header: LineStamp = { kind: "line", place: "top-left", text: "M".repeat(80), style: { ...style, size: 14 }, margin: 30 };
    const r = await stampPdf({ bytes: await source(), pages: [0], stamps: [mark, header], first: 1, file: "f", date: "" }, await build());
    const drawn = (await items(r.bytes))[0].filter((t) => /^[WM]+$/.test(t.str));
    expect(drawn.map((t) => t.str.length).sort()).toEqual([24, 80]);
    for (const t of drawn) {
      expect(t.x).toBeGreaterThanOrEqual(29);
      expect(t.x + t.w).toBeLessThanOrEqual(571);
    }
  });
  it("AC-1125: a tiled see-through watermark adds one graphics state, not one per copy", async () => {
    const mark: TextMark = { kind: "text", text: "DRAFT", style: { ...style, size: 30 }, opacity: 0.25, angle: 45, layout: "tile" };
    const r = await stampPdf({ bytes: await source(), pages: [0, 1], stamps: [mark], first: 1, file: "f", date: "" }, await build());
    const doc = await PDFDocument.load(r.bytes);
    const refs = new Set<string>();
    for (const i of [0, 1]) {
      const states = doc.getPage(i).node.Resources()!.lookup(PDFName.of("ExtGState"), PDFDict);
      for (const [, v] of states.entries()) if (String(doc.context.lookup(v)).includes("/ca 0.25")) refs.add(String(v));
    }
    expect(refs.size).toBe(1);
  });
  it("AC-1122: no pages picked, or only empty text, gives the file back unchanged", async () => {
    const bytes = await source();
    const r = await stampPdf({ bytes, pages: [], stamps: [footer], first: 1, file: "f", date: "" }, async () => { throw new Error("not built"); });
    expect(r.bytes).toBe(bytes);
    expect(r.pageCount).toBe(3);
    const blank = await stampPdf({ bytes, pages: [0, 1], stamps: [{ ...footer, text: "  " }], first: 1, file: "f", date: "" }, async () => { throw new Error("not built"); });
    expect(blank.bytes).toBe(bytes);
  });
  it("AC-1123: a file opened with a password is stamped and saved without it", async () => {
    const plain = await PDFDocument.load(await source());
    plain.encrypt({ userPassword: "pw", ownerPassword: "owner" });
    const locked = await plain.save();
    const r = await stampPdf({ bytes: locked, password: "pw", pages: [0], stamps: [footer], first: 7, file: "f", date: "" }, await build());
    expect(r.wasEncrypted).toBe(true);
    const out = await PDFDocument.load(r.bytes);
    expect(out.isEncrypted).toBe(false);
    expect(new TextDecoder("latin1").decode(r.bytes)).not.toContain("/Encrypt");
    expect((await items(r.bytes))[0].map((t) => t.str)).toContain("Page 7 of 7");
  });
  it("AC-1160: a Bates number is padded to its digits, and a longer number is written whole", () => {
    expect(batesNumber(7, 6)).toBe("000007");
    expect(batesNumber(123456, 3)).toBe("123456");
    expect(batesNumber(0, 1)).toBe("0");
  });
  it("AC-1161: the Bates line is built from the style and the text before the number; tokens are filled only where the run gives them", () => {
    expect(batesTemplate("number", "", "")).toBe("{bates}");
    expect(batesTemplate("exhibit-page", " Case XYZ ", "")).toBe("Exhibit {doc} Case XYZ {bates} Page {n}");
    expect(batesTemplate("custom", "ignored", "ABC-{bates}")).toBe("ABC-{bates}");
    expect(fillTokens("Exhibit {doc} Case XYZ {bates} Page {n}", { ...values, bates: "000041", doc: 3 })).toBe("Exhibit 3 Case XYZ 000041 Page 4");
    // Page numbers and headers have no Bates run: the braces stay as typed.
    expect(fillTokens("{bates} {doc}", values)).toBe("{bates} {doc}");
  });
  it("AC-1162: a file's pages count on from where its run starts, and carry the file's number", async () => {
    const line: LineStamp = { ...footer, text: "Ex {doc} {bates} p{n}" };
    const r = await stampPdf({ bytes: await source(), pages: [0, 1, 2], stamps: [line], first: 1, file: "f", date: "", bates: { start: 13, digits: 4, doc: 2 } }, await build());
    expect((await items(r.bytes)).map((page) => page.map((t) => t.str).find((t) => t.startsWith("Ex")))).toEqual(["Ex 2 0013 p1", "Ex 2 0014 p2", "Ex 2 0015 p3"]);
  });
  it("AC-1163: with room asked for, the stamped pages grow at that edge and the line sits in the new strip", async () => {
    const bytes = await source();
    const before = (await PDFDocument.load(bytes)).getPage(0).getSize();
    const r = await stampPdf({ bytes, pages: [0], stamps: [{ ...footer, text: "{bates}" }], first: 1, file: "f", date: "", bates: { start: 1, digits: 6, doc: 1 }, room: { top: 0, bottom: 40 } }, await build());
    const out = await PDFDocument.load(r.bytes);
    expect(out.getPage(0).getSize().height).toBeCloseTo(before.height + 40, 3);
    expect(out.getPage(0).getSize().width).toBeCloseTo(before.width, 3);
    expect(out.getPage(1).getSize().height).toBeCloseTo(before.height, 3);
    expect((await items(r.bytes))[0].map((t) => t.str)).toContain("000001");
  });
  it("AC-1164: the added strip on a locked file and on a page shown turned: no password left, the strip at the edge the reader sees, the line inside it", async () => {
    const plain = await PDFDocument.load(await source());
    plain.getPage(0).setRotation(degrees(90));
    const before = plain.getPage(0).getSize();
    plain.encrypt({ userPassword: "pw", ownerPassword: "owner" });
    const r = await stampPdf({ bytes: await plain.save(), password: "pw", pages: [0], stamps: [{ ...footer, text: "{bates}" }], first: 1, file: "f", date: "", bates: { start: 5, digits: 3, doc: 1 }, room: { top: 0, bottom: 40 } }, await build());
    expect(r.wasEncrypted).toBe(true);
    expect(new TextDecoder("latin1").decode(r.bytes)).not.toContain("/Encrypt");
    const page = (await PDFDocument.load(r.bytes)).getPage(0);
    // Shown turned a quarter: the reader's bottom edge is a side of the stored page, so the stored width grows.
    expect(page.getSize().width).toBeCloseTo(before.width + 40, 3);
    expect(page.getSize().height).toBeCloseTo(before.height, 3);
    const line = (await items(r.bytes))[0].find((t) => t.str === "005")!;
    expect(line).toBeDefined();
    const box = page.getCropBox();
    const x = line.x;
    // Inside the strip: within 40 points of one of the stored page's side edges.
    expect(Math.min(x - box.x, box.x + box.width - x)).toBeLessThan(40);
  });
});

describe("result name prefix (F9 Bates, key check G-2)", () => {
  it("AC-1178: keeps what a file name can hold, drops the rest, and never starts with a dot or a space", async () => {
    const { cleanNamePrefix } = await import("./stamp");
    expect(cleanNamePrefix("ACME-")).toBe("ACME-");
    expect(cleanNamePrefix('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
    expect(cleanNamePrefix("  ..hidden")).toBe("hidden");
    expect(cleanNamePrefix("Дело 12 ")).toBe("Дело 12 ");
    expect(cleanNamePrefix("x".repeat(80))).toHaveLength(60);
    expect(cleanNamePrefix("\u0000\u001f")).toBe("");
    expect(cleanNamePrefix("a\u202eb\u0085")).toBe("ab");
    expect(cleanNamePrefix("x".repeat(59) + "\ud83d\ude00")).toBe("x".repeat(59));
  });
  it("AC-1179: each result's name takes the prefix, cleaned", async () => {
    const { runJob } = await import("./jobs");
    const { readFile } = await import("node:fs/promises");
    const bytes = new Uint8Array(await readFile("tests/fixtures/three-pages.pdf"));
    const file = (name: string) => ({ name, source: new Blob([bytes as Uint8Array<ArrayBuffer>]), pages: [0] });
    const out = await runJob({ kind: "stamp", zipName: "out.zip", stamps: [], first: 1, date: "2026-11-28", namePrefix: "ACME/-", bates: { start: 1, digits: 6, doc: 1 }, files: [file("a.pdf"), file("b.pdf")] }, () => {});
    expect(out.entries?.map((e) => e.name)).toEqual(["ACME-a.pdf", "ACME-b.pdf"]);
  });
});
