// Copies the Noto Sans font slices used for Merge's footer and contents text
// into public/fonts/noto/ and writes manifest.json (file + code point ranges,
// in order of preference). Runs before `next build` / `next dev`; the output
// is generated, not committed. Fonts: SIL Open Font License 1.1 (OFL.txt is
// copied next to them). The browser only fetches a slice when a run needs a
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

const packages = [
  // Noto Sans first (Latin, Greek, Cyrillic, Vietnamese, Devanagari), then the Japanese slices.
  { pkg: "@fontsource/noto-sans", prefix: "noto-sans", keys: (u) => ["latin", "latin-ext", "greek", "greek-ext", "cyrillic", "cyrillic-ext", "vietnamese", "devanagari"].filter((k) => u[k]) },
  { pkg: "@fontsource/noto-sans-jp", prefix: "noto-sans-jp", keys: (u) => Object.keys(u).filter((k) => /^\[\d+\]$/.test(k)) },
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
  if (prefix === "noto-sans") await copyFile(join(root, "LICENSE"), join(outDir, "OFL.txt"));
}
await writeFile(join(outDir, "manifest.json"), JSON.stringify({ fonts }));
console.log(`copy-fonts: ${fonts.length} Noto Sans slices -> public/fonts/noto/`);
