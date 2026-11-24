#!/usr/bin/env node
// Builds the in-app copy of the font library into public/fonts/lib/ from the @fontsource
// packages this app installs (Latin slices, regular and bold): what development, tests and a
// build without the fonts bucket serve at /fonts/lib/. With FONTS_ORIGIN set, /fonts/lib/ is
// passed through to the bucket (next.config.ts) and no copy is built.
import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fontsOrigin } from "./origin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "public", "fonts", "lib");
// What the notices page lists when the bucket serves the library (scripts/licenses.mjs reads it).
const listing = join(here, "..", "..", ".generated", "font-library.json");
const origin = fontsOrigin(process.env.FONTS_ORIGIN);
if (origin) {
  await rm(out, { recursive: true, force: true });
  const get = async (path) => {
    const res = await fetch(`${origin}/${path}`);
    if (!res.ok) throw new Error(`font library: ${origin}/${path}: HTTP ${res.status}`);
    return res.json();
  };
  const manifest = await get("manifest.json");
  if (typeof manifest.families !== "string" || !/^index\/families\.[0-9a-f]{8}\.json$/.test(manifest.families)) throw new Error("font library: the bucket's manifest names no family list");
  const rows = await get(manifest.families);
  await mkdir(dirname(listing), { recursive: true });
  await writeFile(listing, JSON.stringify(rows.map((r) => ({ i: r.i, n: r.n, l: r.l }))));
  console.log(`font library: served from ${origin} (${rows.length} families), no in-app copy`);
} else {
  await rm(listing, { force: true });
  const run = spawnSync(
    process.execPath,
    ["--no-warnings", join(here, "build-library.mjs"), "--out", out, "--clean", "--subsets", "latin,latin-ext", "--weights", "400,700"],
    { stdio: "inherit" },
  );
  process.exit(run.status ?? 1);
}
