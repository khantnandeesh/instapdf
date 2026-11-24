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
const sorted = (s: string) => [...squash(s)].sort().join("");
/** Kept edits pdf.js reads out of order (a word in another font is a text item of its own). */
const ORDER_LIMIT = new Set(["!"]);
/** Edits that need ActualText here: refused (crates/berry-engine/src/complex.rs). */
const MUST_REFUSE = new Set([" 2024", " abc 12"]);

describe("mixed-direction edits in an Arabic line (scripts-plain.pdf)", () => {
  for (const [starts, tail] of [
    ["المبلغ", "x"],
    ["المبلغ", " more"],
    ["مرحبا", " 1–2"],
    // Digits the Arabic font draws with glyphs whose ToUnicode maps them elsewhere: they read as
    // typed only through ActualText, which pdf.js ignores ("202v", "abc s2"), so they are refused.
    ["مرحبا", " 2024"],
    ["مرحبا", " abc 12"],
    // The line ends "تجريبي." already, so this makes ".!". The subset has no "!", so the word is
    // drawn in the registered face: a text item of its own, which pdf.js puts in content order,
    // ahead of the line. A known pdf.js ordering limit (crates/README.md): pdfium reads it as typed.
    ["مرحبا", "!"],
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
          if (!/[A-Za-z0-9\u2013]/.test(tail)) throw err;
          expect((err as { kind: string; reason?: string }).reason).toBe("text-mismatch");
          expect(doc.pageText(0).lines.map((l) => l.text)).toEqual(page.lines.map((l) => l.text));
          return;
        }
        expect(MUST_REFUSE.has(tail), `${tail} was kept`).toBe(false);
        expect(result.page.lines.map((l) => l.text)).toContain(want);
        const bytes = doc.save().bytes;
        if (pdfium) expect(squash(pdfiumText(bytes))).toContain(squash(want));
        const read = squash(await pdfjsText(bytes));
        if (ORDER_LIMIT.has(tail)) {
          // Every character is there; only the order of the line's text items differs.
          const before = squash(await pdfjsText(new Uint8Array(readFileSync(corpus("scripts-plain.pdf")))));
          expect(sorted(read)).toBe(sorted(before + tail));
          expect(read).not.toContain(squash(want));
        } else expect(read).toContain(squash(want));
      } finally {
        doc.free();
      }
    });
  }
});
