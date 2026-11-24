// Copies the Noto Sans font slices used for Merge's footer and contents text
// into public/fonts/noto/ and writes manifest.json (file + code point ranges,
// in order of preference). Runs before `next build` / `next dev`; the output
// is generated, not committed. Fonts: SIL Open Font License 1.1 (each
// family's license is copied next to them as OFL-<family>.txt).
// The browser only fetches a slice when a run needs a
// glyph Helvetica cannot show (spec F3 §8a decision 8).
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const outDir = join(here, "..", "public", "fonts", "noto");

const parse = (css) =>
  css.split(",").map((p) => p.trim().replace(/^U\+/i, "")).filter(Boolean).map((p) => {
    const [lo, hi] = p.split("-");
    return [parseInt(lo, 16), parseInt(hi ?? lo, 16)];
  });

const named = (...names) => (u) => names.filter((k) => u[k]);
const sliced = (u) => Object.keys(u).filter((k) => /^\[\d+\]$/.test(k));
// In order of preference: a character uses the first slice that covers it.
const packages = [
  { pkg: "@fontsource/noto-sans", prefix: "noto-sans", keys: named("latin", "latin-ext", "greek", "greek-ext", "cyrillic", "cyrillic-ext", "vietnamese", "devanagari") },
  { pkg: "@fontsource/noto-sans-hebrew", prefix: "noto-sans-hebrew", keys: named("hebrew") },
  { pkg: "@fontsource/noto-sans-thai", prefix: "noto-sans-thai", keys: named("thai") },
  { pkg: "@fontsource/noto-sans-jp", prefix: "noto-sans-jp", keys: sliced },
  { pkg: "@fontsource/noto-sans-kr", prefix: "noto-sans-kr", keys: sliced },
  { pkg: "@fontsource/noto-sans-sc", prefix: "noto-sans-sc", keys: sliced },
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const fonts = [];
for (const { pkg, prefix, keys } of packages) {
  const root = dirname(require.resolve(`${pkg}/package.json`));
  const unicode = JSON.parse(await readFile(join(root, "unicode.json"), "utf8"));
  for (const key of keys(unicode)) {
    const slice = key.replace(/[[\]]/g, "");
    const file = `${prefix}-${slice}-400-normal.woff`;
    await copyFile(join(root, "files", file), join(outDir, file));
    fonts.push({ file, ranges: parse(unicode[key]) });
  }
  // Each family ships its own copy of its license (SIL OFL 1.1).
  await copyFile(join(root, "LICENSE"), join(outDir, `OFL-${prefix}.txt`));
}
await writeFile(join(outDir, "manifest.json"), JSON.stringify({ fonts }));
console.log(`copy-fonts: ${fonts.length} Noto Sans slices from ${packages.length} families -> public/fonts/noto/`);

// Fonts the shaping engine draws added Hindi, Arabic, Hebrew and Thai text with (AC-224), under
// the family names the engine asks for. Written to public/fonts/shaping/manifest.json, kept apart
// from the list above (Merge reads that one and does not shape). Files already copied above are
// referenced where they are; the download worker fetches them only for text that needs shaping.
const shapingDir = join(here, "..", "public", "fonts", "shaping");
await rm(shapingDir, { recursive: true, force: true });
await mkdir(shapingDir, { recursive: true });
const shaping = [
  { family: "Noto Naskh Arabic", pkg: "@fontsource/noto-naskh-arabic", prefix: "noto-naskh-arabic", key: "arabic", copy: true },
  { family: "Noto Sans Devanagari", pkg: "@fontsource/noto-sans", prefix: "noto-sans", key: "devanagari" },
  { family: "Noto Sans Hebrew", pkg: "@fontsource/noto-sans-hebrew", prefix: "noto-sans-hebrew", key: "hebrew" },
  { family: "Noto Sans Thai", pkg: "@fontsource/noto-sans-thai", prefix: "noto-sans-thai", key: "thai" },
  // Punctuation and digits the script slices leave out ("." and ":" are not in the Arabic slice).
  { family: "Noto Sans", pkg: "@fontsource/noto-sans", prefix: "noto-sans", key: "latin" },
];
const shapingFonts = [];
for (const { family, pkg, prefix, key, copy } of shaping) {
  const root = dirname(require.resolve(`${pkg}/package.json`));
  const unicode = JSON.parse(await readFile(join(root, "unicode.json"), "utf8"));
  const file = `${prefix}-${key}-400-normal.woff`;
  if (copy) {
    await copyFile(join(root, "files", file), join(shapingDir, file));
    await copyFile(join(root, "LICENSE"), join(shapingDir, `OFL-${prefix}.txt`));
  }
  shapingFonts.push({ family, url: `/fonts/${copy ? "shaping" : "noto"}/${file}`, ranges: parse(unicode[key]) });
}
await writeFile(join(shapingDir, "manifest.json"), JSON.stringify({ fonts: shapingFonts }));
console.log(`copy-fonts: ${shapingFonts.length} shaping fonts -> public/fonts/shaping/`);
