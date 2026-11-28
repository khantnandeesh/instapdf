// Copies the text recogniser into public/ocr/ (spec F15 §2): tesseract.js's worker script, its
// WebAssembly core (LSTM builds only) and the language data named in src/lib/ocr/ocr.json. All
// Apache-2.0 (the data packages' wrappers are MIT); the licence texts are copied beside the files.
// Everything is served from our own origin, under folders named by version, so the files can be
// cached for a year and nothing is fetched from a CDN. Runs before `next build` / `next dev`; the
// output is generated.
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const config = JSON.parse(await readFile(join(here, "..", "src", "lib", "ocr", "ocr.json"), "utf8"));
const out = join(here, "..", "public", "ocr");

const pkgDir = (name, from = require) => dirname(from.resolve(`${name}/package.json`));
const version = async (dir) => JSON.parse(await readFile(join(dir, "package.json"), "utf8")).version;
const expect = (name, got, want) => {
  if (got !== want) throw new Error(`copy-ocr: ${name} is ${got}, but src/lib/ocr/ocr.json says ${want}. Update the one that is wrong.`);
};

const main = pkgDir("tesseract.js");
const core = pkgDir("tesseract.js-core", createRequire(join(main, "package.json")));
expect("tesseract.js", await version(main), config.engine);
expect("tesseract.js-core", await version(core), config.engine);

await rm(out, { recursive: true, force: true });
const engineOut = join(out, `engine-${config.engine}`);
const dataOut = join(out, `data-${config.data}`);
await mkdir(join(engineOut, "core"), { recursive: true });
await mkdir(dataOut, { recursive: true });

await copyFile(join(main, "dist", "worker.min.js"), join(engineOut, "worker.min.js"));
await copyFile(join(main, "LICENSE.md"), join(engineOut, "LICENSE-tesseract.js.txt"));
await copyFile(join(core, "LICENSE"), join(engineOut, "LICENSE-tesseract.js-core.txt"));
for (const build of ["tesseract-core-lstm", "tesseract-core-simd-lstm", "tesseract-core-relaxedsimd-lstm"]) {
  await copyFile(join(core, `${build}.wasm.js`), join(engineOut, "core", `${build}.wasm.js`));
}
for (const { code } of config.languages) {
  const dir = pkgDir(`@tesseract.js-data/${code}`);
  expect(`@tesseract.js-data/${code}`, await version(dir), config.data);
  // The integer LSTM model: the accurate one, a quarter the size of the file that also holds the old engine.
  await copyFile(join(dir, "4.0.0_best_int", `${code}.traineddata.gz`), join(dataOut, `${code}.traineddata.gz`));
}
console.log(`copy-ocr: engine ${config.engine}, ${config.languages.length} languages`);
