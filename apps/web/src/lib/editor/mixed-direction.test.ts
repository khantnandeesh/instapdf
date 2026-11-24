/**
 * Mixed-direction edits (Latin, digits, an en dash in an Arabic line), checked with readers that go
 * by the glyphs, not by the engine's own read-back: pdfium (pypdfium2) and pdf.js. The engine
 * keeps such an edit only when it reads as typed without ActualText help, and refuses it
 * otherwise (crates/berry-engine/tests/latex.rs, mixed_direction_text_in_an_arabic_line).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BerryDocument } from "./berry-engine";

const corpus = (name: string) => new URL(`../../../../../tests/parity/editor/${name}`, import.meta.url);
const engineDir = new URL("../../../public/engine/", import.meta.url);

async function engine() {
  const mod = (await import(/* @vite-ignore */ new URL("berry_engine_shaping.js", engineDir).href)) as {
    initSync: (o: { module: BufferSource }) => unknown;
    BerryDocument: new (b: Uint8Array) => BerryDocument;
  };
  mod.initSync({ module: readFileSync(new URL("berry_engine_shaping_bg.wasm", engineDir)) });
  return mod;
}

const pdfium = (() => {
  try {
    execFileSync("python3", ["-I", "-c", "import pypdfium2"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function pdfiumText(bytes: Uint8Array): string {
  const path = join(mkdtempSync(join(tmpdir(), "berry-mixed-")), "out.pdf");
  writeFileSync(path, bytes);
  const script = "import sys, pypdfium2\ndoc = pypdfium2.PdfDocument(sys.argv[1])\nsys.stdout.buffer.write(doc[0].get_textpage().get_text_range().encode('utf-8'))";
  return execFileSync("python3", ["-I", "-c", script, path], { encoding: "utf8" });
}

async function pdfjsText(bytes: Uint8Array): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const content = await (await doc.getPage(1)).getTextContent();
  await task.destroy();
  return content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : "")).join("");
}

const squash = (s: string) => s.replace(/\s+/g, "");
/**
 * Edits refused here (crates/berry-engine/src/complex.rs): punctuation next to punctuation and a
 * left-to-right run of two words, which PDFium reorders ("تجريبي،. نعم", "defabc").
 */
const MUST_REFUSE = new Set([" abc 12", "!", "، نعم", ": نعم", ", نعم", " abc def"]);
/**
 * Edits that must be kept and read as typed. " 2024": the subset draws "4" but neither its
 * ToUnicode nor its widths name it, so the digits go through a sibling font with its own
 * ToUnicode, drawn after the line's last glyph so pdf.js reads them in logical order.
 */
const MUST_KEEP = new Set([" 2024", " جديد"]);

describe("mixed-direction edits in an Arabic line (scripts-plain.pdf)", () => {
  for (const [starts, tail] of [
    ["المبلغ", "x"],
    ["المبلغ", " more"],
    ["مرحبا", " 1–2"],
    // Digits the Arabic subset draws but does not map ("202v" in pdf.js before): kept, and both
    // readers must read them as typed.
    ["مرحبا", " 2024"],
    // Two left-to-right words: PDFium reverses them.
    ["مرحبا", " abc 12"],
    // Punctuation next to the line's final "." (".!", ".،"), and two Latin words: PDFium reorders them.
    ["مرحبا", "!"],
    ["مرحبا", "، نعم"],
    ["مرحبا", ": نعم"],
    ["مرحبا", ", نعم"],
    ["مرحبا", " abc def"],
    // An Arabic word only: kept, and both readers must read it as typed.
    ["مرحبا", " جديد"],
  ] as const) {
    it(`"${tail}" after the line starting ${starts}: refused, or read back as typed by pdfium and pdf.js`, async () => {
      const { BerryDocument } = await engine();
      const doc = new BerryDocument(new Uint8Array(readFileSync(corpus("scripts-plain.pdf"))));
      try {
        doc.addFont("Noto Naskh Arabic", false, false, new Uint8Array(readFileSync(corpus("fonts/NotoNaskhArabic-Regular.ttf"))));
        const arimo = new URL("../../../node_modules/@fontsource/arimo/files/arimo-latin-400-normal.woff", import.meta.url);
        doc.addFont("Arimo", false, false, new Uint8Array(readFileSync(arimo)));
        const page = doc.pageText(0);
        const id = page.lines.findIndex((l) => l.text.startsWith(starts));
        expect(id).toBeGreaterThanOrEqual(0);
        const want = page.lines[id].text + tail;
        let result: ReturnType<BerryDocument["replaceLine"]> | null = null;
        try {
          result = doc.replaceLine(0, id, want);
        } catch (err) {
          if (MUST_KEEP.has(tail) || (!MUST_REFUSE.has(tail) && !/[A-Za-z0-9\u2013]/.test(tail))) throw err;
          expect((err as { kind: string; reason?: string }).reason).toBe("text-mismatch");
          expect(doc.pageText(0).lines.map((l) => l.text)).toEqual(page.lines.map((l) => l.text));
          return;
        }
        expect(MUST_REFUSE.has(tail), `${tail} was kept`).toBe(false);
        expect(result.page.lines.map((l) => l.text)).toContain(want);
        const bytes = doc.save().bytes;
        if (pdfium) expect(squash(pdfiumText(bytes))).toContain(squash(want));
        expect(squash(await pdfjsText(bytes))).toContain(squash(want));
      } finally {
        doc.free();
      }
    });
  }
});

/**
 * A second number typed at the end of the same Arabic line: kept, and read as typed by both
 * readers ("2024 3", not "3 2024").
 */
describe("two digit edits in a row at the end of an Arabic line (scripts-plain.pdf)", () => {
  for (const tails of [[" 2024", " 3"], [" 2024", "5"], [" 24", " 2024"]] as const) {
    it(`${tails.map((t) => JSON.stringify(t)).join(" then ")}: read back as typed by pdfium and pdf.js`, async () => {
      const { BerryDocument } = await engine();
      const doc = new BerryDocument(new Uint8Array(readFileSync(corpus("scripts-plain.pdf"))));
      try {
        doc.addFont("Noto Naskh Arabic", false, false, new Uint8Array(readFileSync(corpus("fonts/NotoNaskhArabic-Regular.ttf"))));
        let want = "";
        for (const tail of tails) {
          const page = doc.pageText(0);
          const id = page.lines.findIndex((l) => l.text.startsWith("مرحبا"));
          want = page.lines[id].text + tail;
          expect(doc.replaceLine(0, id, want).page.lines.map((l) => l.text)).toContain(want);
        }
        const bytes = doc.save().bytes;
        if (pdfium) expect(pdfiumText(bytes)).toContain(want);
        expect(squash(await pdfjsText(bytes))).toContain(squash(want));
      } finally {
        doc.free();
      }
    });
  }
});

/**
 * The editor's worker reopens the saved output after every edit and restores madeAfter from the
 * first open, so the sibling font the first digit edit made is extended, not copied again.
 */
describe("digit edits across the worker's reopen (scripts-plain.pdf)", () => {
  for (const trusted of [true, false]) {
    it(`${trusted ? "with" : "without"} madeAfter restored: ${trusted ? "one" : "a second"} sibling font`, async () => {
      const { BerryDocument } = await engine();
      const arabic = new Uint8Array(readFileSync(corpus("fonts/NotoNaskhArabic-Regular.ttf")));
      let bytes: Uint8Array = new Uint8Array(readFileSync(corpus("scripts-plain.pdf")));
      const first = new BerryDocument(bytes.slice());
      const floor = first.madeAfter();
      const fonts = first.fonts().length;
      first.free();
      let want = "";
      for (const tail of [" 2024", " 3"]) {
        const doc = new BerryDocument(bytes.slice());
        try {
          if (trusted) doc.setMadeAfter(floor);
          doc.addFont("Noto Naskh Arabic", false, false, arabic);
          const page = doc.pageText(0);
          const id = page.lines.findIndex((l) => l.text.startsWith("مرحبا"));
          want = page.lines[id].text + tail;
          doc.replaceLine(0, id, want);
          bytes = doc.save().bytes;
        } finally {
          doc.free();
        }
      }
      const done = new BerryDocument(bytes.slice());
      try {
        expect(done.pageText(0).lines.map((l) => l.text)).toContain(want);
        expect(done.fonts().length).toBe(fonts + (trusted ? 1 : 2));
      } finally {
        done.free();
      }
      if (pdfium) expect(pdfiumText(bytes)).toContain(want);
    });
  }
});
