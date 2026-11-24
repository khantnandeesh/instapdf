#!/usr/bin/env node
// Builds the in-app copy of the font library into public/fonts/lib/ from the @fontsource
// packages this app installs (Latin slices, regular and bold): what development, tests and a
// build without the fonts bucket serve at /fonts/lib/. With FONTS_ORIGIN set, /fonts/lib/ is
// passed through to the bucket (next.config.ts) and no copy is built.
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "public", "fonts", "lib");
if (process.env.FONTS_ORIGIN) {
  await rm(out, { recursive: true, force: true });
  console.log("font library: served from FONTS_ORIGIN, no in-app copy");
} else {
  const run = spawnSync(
    process.execPath,
    ["--no-warnings", join(here, "build-library.mjs"), "--out", out, "--clean", "--subsets", "latin,latin-ext", "--weights", "400,700"],
    { stdio: "inherit" },
  );
  process.exit(run.status ?? 1);
}
