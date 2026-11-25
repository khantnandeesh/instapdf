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
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/** Route → the most each measure may print, in kB: [entry, entry + preloads] (main's numbers at 006ce21). */
const BUDGET_KB = {
  "/page": [120, 126],
  "/merge-pdf/page": [150, 160],
  "/rotate-pdf/page": [141, 151],
};
/** Cloud-on builds carry the F23 source caret and row (~0.9 KB entry, ~2 KB phone), accepted by the lead 24 Nov. */
const CLOUD_BUDGET_KB = {
  ...BUDGET_KB,
  "/merge-pdf/page": [152, 162],
  "/rotate-pdf/page": [143, 153],
};

const dir = process.argv[2] ?? process.cwd();
/**
 * Whether this build has cloud sources: next.config.ts CLOUD_ON (the flag and at least one provider),
 * as that build resolved it into its env.
 */
const cloudOn = JSON.parse(readFileSync(join(dir, ".next/required-server-files.json"), "utf8")).config.env?.NEXT_PUBLIC_CLOUD_SOURCES === "1";
const budgets = cloudOn ? CLOUD_BUDGET_KB : BUDGET_KB;
console.log(`First-load JS budget: ${cloudOn ? "cloud sources on (F23 budgets)" : "cloud sources off"}`);
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
for (const [route, [budget, budgetAll]] of Object.entries(budgets)) {
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

/**
 * The motion engine (GSAP, docs/design/motion.md §7) is never in any route's first load: no file in any
 * route's entry, or in the scripts its prerendered HTML loads or preloads, carries GreenSock's banner.
 * It must exist as its own lazy chunk (reported with its size).
 */
const GSAP_MARK = /GreenSock|gsap\.com\/standard-license|_gsap\b/;
const has = (f) => GSAP_MARK.test(readFileSync(join(dir, ".next", f), "utf8"));
for (const route of Object.keys(pages)) {
  const entry = [...new Set(pages[route])].filter((f) => f.endsWith(".js"));
  let extra = [];
  try {
    extra = scriptsInHtml(readFileSync(htmlOf(route), "utf8"));
  } catch {
    // Not prerendered (dynamic or an API route): its entry is still checked.
  }
  const hits = [...new Set([...entry, ...extra])].filter(has);
  if (hits.length) {
    console.error(`OVER ${route}: the motion engine is in its first load (${hits.join(", ")})`);
    failed++;
  }
}
const chunksDir = join(dir, ".next/static/chunks");
const engineChunks = readdirSync(chunksDir, { recursive: true })
  .filter((f) => String(f).endsWith(".js"))
  .map((f) => `static/chunks/${f}`)
  .filter(has);
const noticed = engineChunks.filter((f) => /Copyright 2026, GreenSock[^"]*gsap\.com\/standard-license/.test(readFileSync(join(dir, ".next", f), "utf8")));
if (!engineChunks.length || !noticed.length) {
  console.error(`motion engine: no lazy chunk carries GSAP${engineChunks.length ? ", or GreenSock's notice is missing (licence §III)" : ""}`);
  failed++;
} else
  console.log(
    `ok   motion engine is lazy only: ${engineChunks.map((f) => `${f.replace("static/chunks/", "")} ${gz(f)} B`).join(" + ")} = ${sum(engineChunks)} B gz, GreenSock's notice in ${noticed.length} (not in any route's first load)`,
  );

/**
 * The editor's JS (F16 AC-51, U-E13): what /edit-pdf fetches beyond its first load, from the idle
 * prefetch through opening a file and the first edits, excluding pdf.js, fonts and WASM, is at
 * most 250 kB gzip. It is the async chunk groups below (react-loadable-manifest.json, the build's
 * own map of each `import()`), less the route's first load and pdf.js's chunks. pdf-lib and
 * fontkit are never among them: they load in the download worker, on Download intent. Each group
 * must exist, so a renamed import fails here rather than dropping out of the sum. The e2e twin of
 * this check (e2e/f16/editor-js-budget.spec.ts) counts what a browser really fetches.
 */
const EDITOR_BUDGET_KB = 250;
const EDITOR_GROUPS = [
  "tools/editor/EditorTool.tsx -> ./EditorShell", // the shell (idle prefetch, then the pick)
  "tools/editor/EditorTool.tsx -> @/lib/editor/engine-client", // the engine's client (its WASM is not counted)
  "tools/editor/EditorTool.tsx -> @/components/tool-flow/PasswordDialog",
  "tools/editor/EditorShell.tsx -> ./RecentImages", // the Image tool's first step (AC-66)
  "lib/pdf/twin-display.ts -> ./raw-pdf", // on open, for a file with fonts it only names (F24)
  "lib/motion/load.ts -> ./engine", // UI motion
];
const loadable = JSON.parse(readFileSync(join(dir, ".next/react-loadable-manifest.json"), "utf8"));
const groupFiles = (key) => (loadable[key]?.files ?? []).filter((f) => f.endsWith(".js"));
const pdfjsFiles = new Set(groupFiles("lib/pdf/pdfjs.ts -> pdfjs-dist"));
const heavy = new Set(
  Object.entries(loadable)
    .filter(([k]) => / -> @cantoo\/(pdf-lib|fontkit)$/.test(k))
    .flatMap(([, v]) => v.files.filter((f) => f.endsWith(".js") && !pdfjsFiles.has(f))),
);
const missing = EDITOR_GROUPS.filter((k) => !loadable[k]);
if (missing.length) {
  console.error(`OVER editor JS: chunk groups not in the build (renamed? update EDITOR_GROUPS): ${missing.join("; ")}`);
  failed++;
} else {
  const route = "/edit-pdf/page";
  const first = new Set((pages[route] ?? []).filter((f) => f.endsWith(".js")));
  try {
    for (const f of scriptsInHtml(readFileSync(htmlOf(route), "utf8"))) first.add(f);
  } catch {
    // not prerendered: its entry alone
  }
  // pdf.js's own chunk is left out; a chunk it shares with the editor (a polyfill) is counted.
  const isPdfjs = (f) => pdfjsFiles.has(f) && /pdfjsVersion|PDFDocumentProxy/.test(readFileSync(join(dir, ".next", f), "utf8"));
  const files = [...new Set(EDITOR_GROUPS.flatMap(groupFiles))].filter((f) => !first.has(f) && !isPdfjs(f));
  const bytes = sum(files);
  const leaked = files.filter((f) => heavy.has(f));
  const ok = kb(bytes) <= EDITOR_BUDGET_KB && !leaked.length;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "OVER"} editor JS (idle prefetch + open + edit, no pdf.js/fonts/WASM) ${bytes} B gz, prints ${kb(bytes)} kB (budget ${EDITOR_BUDGET_KB}, room ${EDITOR_BUDGET_KB * 1000 + 499 - bytes} B)`);
  if (leaked.length) console.error(`OVER editor JS: pdf-lib or fontkit is in the editor's chunks (${leaked.join(", ")}); they belong in the download worker (U-E13)`);
  if (process.env.V) for (const f of files) console.log(`       ${f} ${gz(f)}`);
}

if (failed) {
  console.error(`First-load JS budget: ${failed} route(s) over.`);
  process.exit(1);
}
