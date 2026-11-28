// Writes the F4/F5 page-tool fixtures (spec docs/specs/f4-f5-page-tools.md §7 and
// "Improvement acceptance criteria") as files, for the e2e suites and the evaluator's uploads.
// They come from the same makers the engine's unit tests use (src/lib/pdf/page-tool-fixtures.ts),
// so the unit and browser tests read identical documents.
// Run from apps/web:  node tests/fixtures/generate-page-tools.mjs   (Node 22.18+ runs the .ts import)
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { annotatedPdf, imagesPdf, labelledPdf, linksPdf, sharedResPdf } from "../../src/lib/pdf/page-tool-fixtures.ts";

const here = dirname(fileURLToPath(import.meta.url));
const range = (from, to, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const files = {
  // I-1: one indirect resource dict with all 12 images, on every page or on the page-tree root.
  "shared-res.pdf": () => sharedResPdf("shared"),
  "inherited-res.pdf": () => sharedResPdf("inherited"),
  // I-2 to I-5: links (explicit, named, GoTo, URI), styled outline, a text field, Info and /PageLayout.
  "links.pdf": () => linksPdf(),
  // F5 Alternate & mix and Organize.
  "odd.pdf": () => labelledPdf(range(1, 9, 2).map((n) => `Page ${n}`)),
  "even.pdf": () => labelledPdf(range(2, 10, 2).map((n) => `Page ${n}`)),
  "even-reversed.pdf": () => labelledPdf(range(2, 10, 2).reverse().map((n) => `Page ${n}`)),
  "short.pdf": () => labelledPdf(["Short 1", "Short 2"]),
  "separator.pdf": () => labelledPdf(["Separator"]),
  "duplex-scan.pdf": () => labelledPdf(["Front 1", "Front 2", "Front 3", "Back 3", "Back 2", "Back 1"]),
  "duplex-scan-odd.pdf": () => labelledPdf(["Front 1", "Front 2", "Front 3", "Back 2", "Back 1"]),
  // F12 Extract images: a JPEG and a PNG on page 1, the PNG again and a 1x1 dot on page 2, text only on page 3.
  // F10: annotations (drawn and not), a filled field, a link, and details about the file.
  "annotated.pdf": () => annotatedPdf(),
  "with-images.pdf": async () => imagesPdf(await readFile(join(here, "delta.jpg")), await readFile(join(here, "charlie.png"))),
};

for (const [name, make] of Object.entries(files)) {
  const bytes = await make();
  await writeFile(join(here, name), bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}
