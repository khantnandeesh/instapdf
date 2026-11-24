#!/usr/bin/env node
/**
 * First-load JS budget (CI, after `next build`): each route's "First Load JS" as `next build`
 * computes it (gzip level 9 of the route's .js files in app-build-manifest.json; printed rounded, in
 * kB of 1000 bytes) must print no more than its budget. Runs on the normal build and on the F23
 * cloud build (NEXT_PUBLIC_CLOUD_SOURCES=1), so neither can grow a tool page unnoticed.
 *
 * Usage: node scripts/first-load-budget.mjs [apps/web dir]   (V=1 lists each route's files)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/** Route → the most `next build` may print for it, in kB (main's numbers when this was added). */
const BUDGET_KB = {
  "/page": 120,
  "/merge-pdf/page": 150,
  "/rotate-pdf/page": 141,
};

const dir = process.argv[2] ?? process.cwd();
const pages = JSON.parse(readFileSync(join(dir, ".next/app-build-manifest.json"), "utf8")).pages;
const gz = (f) => gzipSync(readFileSync(join(dir, ".next", f)), { level: 9 }).length;

let failed = 0;
for (const [route, budget] of Object.entries(BUDGET_KB)) {
  const files = [...new Set(pages[route] ?? [])].filter((f) => f.endsWith(".js"));
  if (!files.length) {
    console.error(`${route}: not in the build`);
    failed++;
    continue;
  }
  const bytes = files.reduce((s, f) => s + gz(f), 0);
  const printed = Math.round(bytes / 1000);
  const ok = printed <= budget;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "OVER"} ${route.padEnd(18)} ${String(bytes).padStart(7)} B gz, prints ${printed} kB (budget ${budget} kB, room ${budget * 1000 + 499 - bytes} B)`);
  if (process.env.V) for (const f of files) console.log(`       ${f} ${gz(f)}`);
}
if (failed) {
  console.error(`First-load JS budget: ${failed} route(s) over.`);
  process.exit(1);
}
