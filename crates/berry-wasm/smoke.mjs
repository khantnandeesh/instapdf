// Smoke test of the WebAssembly build under Node: open a fixture, edit, save, reopen.
// Run after: wasm-bindgen target/wasm32-unknown-unknown/release/berry_wasm.wasm \
//              --out-dir berry-wasm/pkg --target web --out-name berry_engine
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
// BERRY_ENGINE=berry_engine_shaping runs it against the full engine (complex-script shaping).
const name = process.env.BERRY_ENGINE ?? "berry_engine";
const shaping = name === "berry_engine_shaping";
const { initSync, BerryDocument } = await import(`./pkg/${name}.js`);

const here = new URL(".", import.meta.url);
initSync({ module: readFileSync(new URL(`pkg/${name}_bg.wasm`, here)) });
const pdf = new Uint8Array(readFileSync(new URL("../../tests/parity/editor/chrome-justified-mixed.pdf", here)));

const doc = new BerryDocument(pdf);
assert.equal(doc.pageCount, 1);
const before = doc.pageText(0);
assert.equal(before.lines[0].text, "Service Agreement");
assert.equal(before.fonts[before.lines[0].runs[0].font].name, "Caladea-Bold");

const caladea = doc.fonts().find((f) => f.name === "Caladea-Bold");
assert.ok(caladea.subset && caladea.embedded && caladea.bold && caladea.family === "Caladea");
assert.deepEqual(doc.coverage(caladea.object, "Agree Quote"), { covered: "Agre t", missing: "Quo" });

const [m] = doc.find(0, "made", true);
const edit = doc.replaceRange(0, m.line, m.start, m.end, "signed");
assert.equal(edit.substitutions.length, 0);
assert.match(edit.page.lines[m.line].text, /is signed between the Provider and the Client/);

// A character the subset lacks is refused until a font is registered.
const heading = doc.find(0, "Service", true)[0];
assert.throws(
  () => doc.replaceRange(0, heading.line, heading.start, heading.end, "Supply"),
  (e) => e.kind === "missing-glyphs" && e.request.families[0] === "Caladea" && e.request.bold === true,
);

const t0 = performance.now();
const { bytes, report } = doc.save();
const ms = performance.now() - t0;
assert.ok(report.original_preserved && report.objects_written === 1);
assert.deepEqual(bytes.subarray(0, pdf.length), pdf);
const again = new BerryDocument(bytes);
assert.match(again.pageText(0).lines[1].text, /is signed between/);
// Hindi and Arabic: both engines read logical text and direction. Only the full engine edits;
// the default one marks such lines "needs-shaping" so the host loads the full engine.
const scripts = new BerryDocument(new Uint8Array(readFileSync(new URL("../../tests/parity/editor/scripts-plain.pdf", here))));
const sp = scripts.pageText(0);
const hindi = sp.lines.findIndex((l) => l.text === "कुल राशि का भुगतान समय पर किया गया।");
assert.ok(hindi >= 0 && sp.lines[hindi].direction === "ltr");
assert.ok(sp.lines.some((l) => l.direction === "rtl" && l.text === "مرحبا بالعالم، هذا نص تجريبي."));
if (shaping) {
  assert.equal(sp.lines[hindi].read_only_reason, undefined);
  const shaped = scripts.replaceRange(0, hindi, 0, 3, "संपूर्ण");
  assert.equal(shaped.substitutions.length, 0);
  assert.ok(shaped.page.lines.some((l) => l.text === "संपूर्ण राशि का भुगतान समय पर किया गया।"));
} else {
  assert.equal(sp.lines[hindi].read_only_reason, "needs-shaping");
  assert.throws(() => scripts.replaceRange(0, hindi, 0, 3, "संपूर्ण"), (e) => e.kind === "read-only" && e.reason === "needs-shaping");
}

// New text: Latin in both engines, Hindi and Arabic only in the full one. Fonts are the WOFF
// files the web app ships.
const webfont = (f) => new Uint8Array(readFileSync(new URL(`../../tests/parity/editor/webfonts/${f}`, here)));
const page = new BerryDocument(pdf);
assert.ok(page.addFont("Noto Sans", false, false, webfont("NotoSans-Regular.woff")));
assert.ok(page.addFont("Noto Sans Devanagari", false, false, webfont("NotoSansDevanagari-Regular.woff")));
assert.ok(page.addFont("Noto Naskh Arabic", false, false, webfont("NotoNaskhArabic-Regular.woff")));
const sans = { families: ["Noto Sans"], bold: false, italic: false };
const measured = page.shape("Approved by the client", sans, 12);
assert.ok(measured.width > 100 && measured.runs.length === 1 && measured.runs[0].family === "Noto Sans");
const added = page.addText(0, "Approved by the client", sans, 12, 72, 40, 0, [0, 0, 0]);
assert.ok(added.changed.length === 1 && added.page.lines.some((l) => l.text === "Approved by the client"));
assert.throws(() => page.addText(0, "x", { families: ["Noto Sans"] }, 12, 0, 0, 0, "red"));
const hindiText = "संपूर्ण राशि का भुगतान";
const arabicText = "مرحبا بالعالم، هذا نص تجريبي.";
if (shaping) {
  const ar = page.shape(arabicText, sans, 14);
  assert.equal(ar.direction, "rtl");
  page.addText(0, arabicText, sans, 14, 540 - ar.width, 60, 0, [0, 0, 0]);
  const hi = page.addText(0, hindiText, sans, 14, 72, 80, 0, [0, 0, 0]);
  assert.ok(hi.substitutions.some((s) => s.substitute_font === "Noto Sans Devanagari"));
  const reread = new BerryDocument(page.save().bytes).pageText(0);
  for (const t of [arabicText, hindiText]) assert.ok(reread.lines.some((l) => l.text === t), t);
} else {
  assert.throws(() => page.shape(hindiText, sans, 14), (e) => e.kind === "read-only" && e.reason === "needs-shaping");
  assert.throws(() => page.addText(0, arabicText, sans, 14, 72, 60, 0, [0, 0, 0]), (e) => e.reason === "needs-shaping");
}

console.log(`${name} smoke ok: ${pdf.length} → ${bytes.length} bytes, save ${ms.toFixed(1)} ms`);
