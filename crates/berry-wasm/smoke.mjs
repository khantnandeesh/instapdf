// Smoke test of the WebAssembly build under Node: open a fixture, edit, save, reopen.
// Run after: wasm-bindgen target/wasm32-unknown-unknown/release/berry_wasm.wasm \
//              --out-dir berry-wasm/pkg --target web --out-name berry_engine
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { initSync, BerryDocument } from "./pkg/berry_engine.js";

const here = new URL(".", import.meta.url);
initSync({ module: readFileSync(new URL("pkg/berry_engine_bg.wasm", here)) });
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
// Hindi and Arabic: logical text, direction, and a shaped word edit (the embedded font shapes).
const scripts = new BerryDocument(new Uint8Array(readFileSync(new URL("../../tests/parity/editor/scripts-plain.pdf", here))));
const sp = scripts.pageText(0);
const hindi = sp.lines.findIndex((l) => l.text === "कुल राशि का भुगतान समय पर किया गया।");
assert.ok(hindi >= 0 && sp.lines[hindi].direction === "ltr");
assert.ok(sp.lines.some((l) => l.direction === "rtl" && l.text === "مرحبا بالعالم، هذا نص تجريبي."));
const shaped = scripts.replaceRange(0, hindi, 0, 3, "संपूर्ण");
assert.equal(shaped.substitutions.length, 0);
assert.ok(shaped.page.lines.some((l) => l.text === "संपूर्ण राशि का भुगतान समय पर किया गया।"));

console.log(`wasm smoke ok: ${pdf.length} → ${bytes.length} bytes, save ${ms.toFixed(1)} ms`);
