/**
 * Generated test inputs, made once before any test file runs. public/fonts/noto is written by
 * scripts/copy-fonts.mjs, which empties the folder first: run from test files in parallel, one
 * run deleted the fonts another file was reading.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default function setup() {
  const dir = new URL("./public/fonts/noto/", import.meta.url);
  if (!existsSync(new URL("manifest.json", dir)) || !existsSync(new URL("cmap.json", dir))) {
    execFileSync("node", [fileURLToPath(new URL("./scripts/copy-fonts.mjs", import.meta.url))], { stdio: "inherit" });
  }
}
