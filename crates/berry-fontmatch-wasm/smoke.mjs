// Smoke test of the font matcher's WebAssembly build under Node, together with the engine:
// take a font out of a PDF, fingerprint it, and find it in a small index.
// Run after scripts/build-engine-wasm.sh has written both pkg/ folders.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const here = new URL(".", import.meta.url);
const fm = await import("./pkg/berry_fontmatch.js");
fm.initSync({ module: readFileSync(new URL("pkg/berry_fontmatch_bg.wasm", here)) });
const engine = await import("../berry-wasm/pkg/berry_engine.js");
engine.initSync({ module: readFileSync(new URL("../berry-wasm/pkg/berry_engine_bg.wasm", here)) });

const fixture = (name) => new Uint8Array(readFileSync(new URL(`../../tests/parity/editor/${name}`, here)));
const HINDI = "कखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह";
const LATIN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// The library side: two font files.
const hindi = fm.fingerprintFile(fixture("fonts/NotoSansDevanagari-Regular.ttf"), HINDI);
const arabic = fm.fingerprintFile(fixture("fonts/NotoNaskhArabic-Regular.ttf"), HINDI);
assert.equal(hindi.coarse.length, 64);
assert.equal(hindi.glyphs.length, hindi.count * 36);
assert.equal(fm.fingerprintFile(new Uint8Array([1, 2, 3])), null);

// The document side: the subset Chrome embedded.
const doc = new engine.BerryDocument(fixture("scripts-chrome.pdf"));
const font = doc.fonts().find((f) => f.name.includes("NotoSansDevanagari"));
assert.equal(font.complete, false);
const program = doc.fontProgram(font.object, LATIN + HINDI);
assert.equal(program.format, "truetype");
assert.ok(program.bytes.length > 1000 && program.glyphs.length >= 5);
const target = fm.fingerprintProgram(
  program.format,
  program.bytes,
  Uint32Array.from(program.glyphs, (g) => g.cp),
  Uint16Array.from(program.glyphs, (g) => g.gid),
  Float32Array.from(program.glyphs, (g) => g.width),
);
const [same, shared, grade] = fm.compare(target.glyphs, hindi.glyphs, 0);
assert.ok(shared >= 5 && same < 0.012 && grade === 0, `same family: ${same} over ${shared}, grade ${grade}`);
const [other] = fm.compare(target.glyphs, arabic.glyphs, 0);
assert.ok(other === -1 || other > same + 0.02, `different family: ${other}`);

// Ranking: a font finds itself first, and the filter can leave it out.
const index = new Uint8Array(128);
index.set(arabic.coarse, 0);
index.set(hindi.coarse, 64);
assert.deepEqual([...fm.rank(hindi.coarse, index, 2)].filter((_, i) => i % 2 === 0), [1, 0]);
assert.deepEqual([...fm.rank(hindi.coarse, index, 2, Uint8Array.of(1, 0))].filter((_, i) => i % 2 === 0), [0]);
assert.equal(fm.coarseDistance(hindi.coarse, hindi.coarse), 0);

// A font that is not embedded still gives its widths.
const std = new engine.BerryDocument(fixture("std14-reportlab.pdf"));
const helvetica = std.fonts().find((f) => f.name === "Helvetica");
const widths = std.fontProgram(helvetica.object, LATIN);
assert.equal(widths.format, "none");
assert.equal(widths.bytes.length, 0);
assert.equal(widths.glyphs.find((g) => g.cp === 105).width, 222);
assert.throws(() => std.fontProgram(999999, "a"), (e) => e.kind === "bad-font");

console.log(`berry_fontmatch smoke ok: same family ${same.toFixed(4)} over ${shared} letters`);
