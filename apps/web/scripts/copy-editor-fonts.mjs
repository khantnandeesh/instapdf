// Copies the editor's fonts into public/fonts/editor/ and writes manifest.json (F16 E1).
// Text fonts (Arimo, Tinos, Cousine, Carlito, Caladea) and the signature faces come from
// @fontsource packages (SIL OFL 1.1, each family's license copied next to its files as
// OFL-<family>.txt). The editor previews new text with the very file it later embeds
// (spec F16 U-E3, AC-91), so both read this manifest: the file per character range, plus the
// vertical metrics (computed here with fontkit) that place each line's baseline identically on
// screen and in the PDF. Runs before `next build` / `next dev`; the output is generated.
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fontkit from "@cantoo/fontkit";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const outDir = join(here, "..", "public", "fonts", "editor");
const config = JSON.parse(await readFile(join(here, "..", "src", "lib", "editor", "fonts.json"), "utf8"));

const parse = (css) =>
  css.split(",").map((p) => p.trim().replace(/^U\+/i, "")).filter(Boolean).map((p) => {
    const [lo, hi] = p.split("-");
    return [parseInt(lo, 16), parseInt(hi ?? lo, 16)];
  });

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

/** id → { "<weight>-<style>": { files: [{ file, ranges }], ascent, descent } } */
const faces = {};
let count = 0;
const families = [
  ...config.text.map((f) => ({ ...f, styles: ["400-normal", "400-italic", "700-normal", "700-italic"] })),
  ...config.sign.map((f) => ({ ...f, styles: ["400-normal"] })),
];
for (const fam of families) {
  const root = dirname(require.resolve(`@fontsource/${fam.id}/package.json`));
  const unicode = JSON.parse(await readFile(join(root, "unicode.json"), "utf8"));
  faces[fam.id] = {};
  for (const style of fam.styles) {
    const files = [];
    let metrics = null;
    for (const subset of config.subsets) {
      const file = `${fam.id}-${subset}-${style}.woff`;
      const src = join(root, "files", file);
      if (!unicode[subset] || !existsSync(src)) continue;
      await copyFile(src, join(outDir, file));
      count++;
      files.push({ file, ranges: parse(unicode[subset]) });
      if (!metrics) {
        const font = fontkit.create(await readFile(src));
        metrics = { ascent: font.ascent / font.unitsPerEm, descent: -font.descent / font.unitsPerEm };
      }
    }
    if (!files.length) throw new Error(`copy-editor-fonts: no files for ${fam.id} ${style}`);
    faces[fam.id][style] = { files, ...metrics };
  }
  await copyFile(join(root, "LICENSE"), join(outDir, `OFL-${fam.id}.txt`));
}
await writeFile(join(outDir, "manifest.json"), JSON.stringify({ faces }));
console.log(`copy-editor-fonts: ${count} files from ${families.length} families -> public/fonts/editor/`);
