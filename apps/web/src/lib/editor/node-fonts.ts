/** Test support: the editor fonts read from node_modules, for tests that run the build in Node. */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import fontkit from "@cantoo/fontkit";
import type { BuildFonts } from "./build";
import config from "./fonts.json";
import type { EditorFontManifest } from "./fonts";

const require = createRequire(import.meta.url);
export const parse = (css: string): [number, number][] =>
  css.split(",").map((p) => {
    const [lo, hi] = p.trim().replace(/^U\+/i, "").split("-");
    return [parseInt(lo, 16), parseInt(hi ?? lo, 16)];
  });

/** The editor fonts straight from node_modules, the same way scripts/copy-editor-fonts.mjs lays them out. */
export async function nodeFonts(): Promise<BuildFonts & { manifestValue: EditorFontManifest }> {
  const faces: EditorFontManifest["faces"] = {};
  const where = new Map<string, string>();
  for (const fam of [...config.text, ...config.sign]) {
    const root = dirname(require.resolve(`@fontsource/${fam.id}/package.json`));
    const unicode = JSON.parse(await readFile(join(root, "unicode.json"), "utf8"));
    faces[fam.id] = {};
    const styles = config.text.some((t) => t.id === fam.id) ? ["400-normal", "400-italic", "700-normal", "700-italic"] : ["400-normal"];
    for (const style of styles) {
      const files = [];
      let metrics = { ascent: 0.9, descent: 0.2 };
      for (const subset of config.subsets) {
        const file = `${fam.id}-${subset}-${style}.woff`;
        if (!unicode[subset]) continue;
        const path = join(root, "files", file);
        try {
          const font = fontkit.create(await readFile(path)) as unknown as { ascent: number; descent: number; unitsPerEm: number };
          if (!files.length) metrics = { ascent: font.ascent / font.unitsPerEm, descent: -font.descent / font.unitsPerEm };
        } catch {
          continue;
        }
        where.set(file, path);
        files.push({ file, ranges: parse(unicode[subset]) });
      }
      faces[fam.id][style] = { files, ...metrics };
    }
  }
  const manifestValue = { faces };
  const noto = dirname(require.resolve("@fontsource/noto-sans/package.json"));
  const notoRanges = JSON.parse(await readFile(join(noto, "unicode.json"), "utf8"));
  const fallback = {
    manifest: async () => ({ fonts: ["latin", "devanagari"].map((k) => ({ file: `noto-sans-${k}-400-normal.woff`, ranges: parse(notoRanges[k]) })) }),
    load: async (f: string) => new Uint8Array(await readFile(join(noto, "files", f))),
  };
  return { manifestValue, manifest: async () => manifestValue, load: async (f) => new Uint8Array(await readFile(where.get(f)!)), fallback };
}
