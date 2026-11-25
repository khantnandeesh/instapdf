import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { woffToSfnt } from "@/lib/font-library/woff";
import { buildTwinPatch, sfntFacts, withTwinPatch } from "./twin-display";

const require = createRequire(import.meta.url);
const woff = new Uint8Array(readFileSync(join(dirname(require.resolve("@fontsource/gelasio/package.json")), "files", "gelasio-latin-400-normal.woff")));

/** A one-page file whose font 4 is only named (Georgia), font 6 has remapped codes, and whose xref is a plain table. */
function namedOnlyPdf(): Uint8Array {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>",
    `<< /Type /Font /Subtype /TrueType /BaseFont /Georgia /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [${Array(95).fill(500).join(" ")}] /FontDescriptor 7 0 R >>`,
    null,
    "<< /Type /Font /Subtype /TrueType /BaseFont /Georgia-Bold /Encoding << /BaseEncoding /WinAnsiEncoding /Differences [65 /Scaron] >> >>",
    "<< /Type /FontDescriptor /FontName /Georgia /Flags 34 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>",
  ];
  const content = "BT /F1 20 Tf 20 40 Td (Invoice 450) Tj ET";
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body ?? `<< /Length ${content.length} >>\nstream\n${content}\nendstream`}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

async function fontsOf(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const ops = await page.getOperatorList();
  const text = (await page.getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join("");
  const ids = ops.argsArray.filter((_, i) => ops.fnArray[i] === 37).map((a) => a[0] as string);
  const fonts = ids.map((id) => page.commonObjs.get(id) as { missingFile?: boolean; data?: Uint8Array | null; name: string });
  await doc.loadingTask.destroy();
  return { fonts, text };
}

describe("twins on the page (AC-298)", () => {
  it("unpacks the library's WOFF in the browser's way and reads what a descriptor needs", async () => {
    const sfnt = (await woffToSfnt(woff))!;
    expect(sfnt.length).toBeGreaterThan(woff.length);
    const facts = sfntFacts(sfnt)!;
    expect(facts.unitsPerEm).toBeGreaterThan(0);
    expect(facts.ascent).toBeGreaterThan(600);
    expect(facts.descent).toBeLessThan(0);
    expect(facts.fixed).toBe(false);
    expect(await woffToSfnt(new Uint8Array(60))).toBeNull();
    expect(sfntFacts(new Uint8Array(20))).toBeNull();
  });

  it("gives a named-only font the twin's file in the copy pdf.js draws, and leaves the bytes before it untouched", async () => {
    const bytes = namedOnlyPdf();
    const before = await fontsOf(bytes);
    expect(before.fonts[0]!.missingFile).toBe(true);
    const sfnt = (await woffToSfnt(woff))!;
    const patch = (await buildTwinPatch(bytes, [{ object: 4, twin: "gelasio", bold: false, italic: false }], async () => sfnt))!;
    expect(patch.fonts).toEqual([4]);
    const shown = withTwinPatch(bytes, patch);
    expect(shown.subarray(0, bytes.length)).toEqual(bytes);
    const after = await fontsOf(shown);
    expect(after.fonts[0]!.missingFile).toBeFalsy();
    expect(after.text).toBe("Invoice 450");
    // The same update goes on a later version of the file (an edit the engine appended).
    const later = withTwinPatch(shown, patch);
    expect((await fontsOf(later)).fonts[0]!.missingFile).toBeFalsy();
  });

  it("leaves alone a font with remapped codes, an embedded font, and a file it can't place", async () => {
    const bytes = namedOnlyPdf();
    const sfnt = (await woffToSfnt(woff))!;
    expect(await buildTwinPatch(bytes, [{ object: 6, twin: "gelasio", bold: true, italic: false }], async () => sfnt)).toBeNull();
    expect(await buildTwinPatch(bytes, [{ object: 4, twin: "gelasio", bold: false, italic: false }], async () => null)).toBeNull();
    expect(await buildTwinPatch(bytes, [{ object: 3, twin: "gelasio", bold: false, italic: false }], async () => sfnt)).toBeNull();
    expect(await buildTwinPatch(bytes, [], async () => sfnt)).toBeNull();
    expect(withTwinPatch(bytes, null)).toBe(bytes);
    const noEnd = new Uint8Array(40);
    expect(withTwinPatch(noEnd, { root: "1 0 R", size: 10, objects: [{ num: 4, bytes: new Uint8Array(2) }], fonts: [4] })).toBe(noEnd);
  });
});
