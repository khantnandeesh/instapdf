// Writes the F13 Repair fixtures from twelve.pdf: the same file damaged in two ways.
//  cut-short.pdf   the end is missing (index and trailer gone): readers that trust the index give up.
//  no-pages.pdf    only the first bytes are left: nothing can open it, and nothing can be recovered.
// Run from apps/web:  node tests/fixtures/generate-damaged.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const whole = await readFile(join(here, "twelve.pdf"));
const text = whole.toString("latin1");
await writeFile(join(here, "cut-short.pdf"), whole.subarray(0, text.lastIndexOf("xref")));
await writeFile(join(here, "no-pages.pdf"), whole.subarray(0, 64));
console.log("wrote cut-short.pdf, no-pages.pdf");
