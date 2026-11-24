#!/usr/bin/env node
/**
 * First-load JS budget (CI, after `next build`). Two measures per route, both gzip level 9, printed
 * rounded in kB of 1000 bytes, each with its own budget:
 * - entry: "First Load JS" as `next build` computes it (the route's .js files in app-build-manifest.json);
 * - entry + preloads: that plus every other script the route's prerendered HTML loads or preloads
 *   (a server-rendered `next/dynamic` part, for example, is a `<link rel="preload" as="script">`,
 *   which `next build` does not count but the browser fetches on every visit; the root layout's own
 *   script is one on every page, so this measure is higher than the first everywhere).
 * Runs on the normal build and on the F23 cloud build (NEXT_PUBLIC_CLOUD_SOURCES=1), so neither can
 * grow a tool page unnoticed.
 *
 * Usage: node scripts/first-load-budget.mjs [apps/web dir]   (V=1 lists each route's files)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/** Route → the most each measure may print, in kB: [entry, entry + preloads] (main's numbers at 006ce21). */
const BUDGET_KB = {
  "/page": [120, 126],
  "/merge-pdf/page": [150, 160],
  "/rotate-pdf/page": [141, 151],
};

const dir = process.argv[2] ?? process.cwd();
const pages = JSON.parse(readFileSync(join(dir, ".next/app-build-manifest.json"), "utf8")).pages;
const gz = (f) => gzipSync(readFileSync(join(dir, ".next", f)), { level: 9 }).length;
const sum = (files) => files.reduce((s, f) => s + gz(f), 0);

/** The prerendered page of a route ("/merge-pdf/page" → server/app/merge-pdf.html). */
const htmlOf = (route) => join(dir, ".next/server/app", `${route === "/page" ? "index" : route.replace(/^\//, "").replace(/\/page$/, "")}.html`);

/** Every script the HTML runs or preloads (not the `noModule` polyfills old browsers alone fetch). */
export function scriptsInHtml(html) {
  const out = new Set();
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const isLink = /^<link/i.test(tag);
    if (isLink && !(/\brel="(?:preload|modulepreload)"/i.test(tag) && (/\bas="script"/i.test(tag) || /modulepreload/i.test(tag)))) continue;
    if (!isLink && /\bnomodule\b/i.test(tag)) continue;
    const url = tag.match(isLink ? /\bhref="([^"]+)"/i : /\bsrc="([^"]+)"/i)?.[1];
    const path = url && new URL(url, "https://x.invalid").pathname;
    if (path?.startsWith("/_next/static/") && path.endsWith(".js")) out.add(path.slice("/_next/".length));
  }
  return [...out];
}

const kb = (b) => Math.round(b / 1000);
let failed = 0;
for (const [route, [budget, budgetAll]] of Object.entries(BUDGET_KB)) {
  const entry = [...new Set(pages[route] ?? [])].filter((f) => f.endsWith(".js"));
  if (!entry.length) {
    console.error(`${route}: not in the build`);
    failed++;
    continue;
  }
  let html;
  try {
    html = readFileSync(htmlOf(route), "utf8");
  } catch {
    console.error(`${route}: no prerendered HTML at ${htmlOf(route)}`);
    failed++;
    continue;
  }
  const extra = scriptsInHtml(html).filter((f) => !entry.includes(f));
  const a = sum(entry);
  const b = a + sum(extra);
  const ok = kb(a) <= budget && kb(b) <= budgetAll;
  if (!ok) failed++;
  const room = (bytes, kB) => kB * 1000 + 499 - bytes;
  console.log(
    `${ok ? "ok  " : "OVER"} ${route.padEnd(16)} entry ${String(a).padStart(7)} B gz, prints ${kb(a)} kB (budget ${budget}, room ${room(a, budget)} B); ` +
      `entry + preloads ${String(b).padStart(7)} B gz, prints ${kb(b)} kB (budget ${budgetAll}, room ${room(b, budgetAll)} B)`,
  );
  if (process.env.V) for (const f of [...entry, ...extra.map((f) => `${f} (preload)`)]) console.log(`       ${f} ${gz(f.replace(/ \(preload\)$/, ""))}`);
}
if (failed) {
  console.error(`First-load JS budget: ${failed} route(s) over.`);
  process.exit(1);
}
