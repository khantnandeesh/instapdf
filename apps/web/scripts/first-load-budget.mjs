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
  // +1 kB preloads (F12): four more live tools in the catalogue and the registry.
  "/page": [121, 128],
  "/merge-pdf/page": [152, 162],
  "/rotate-pdf/page": [142, 152],
  // F5 page tools (spec F4/F5 UI P-12).
  // +1 kB on four routes that sat at their limit: the registry every page carries grew by Grayscale and Repair (F13).
  "/organize-pdf/page": [151, 161],
  "/combine-reorder-pdf/page": [152, 162],
  // +1 kB entry (F12, 27 Nov), as Extract below.
  "/alternate-mix-pdf/page": [151, 161],
  // F4 page tools (spec F4/F5 UI P-12): Rotate + the range parser, field and stepper (+ marks on Split).
  // +1 kB entry on Split and Delete (F12 Extract images): each live tool adds its flow entry to the registry every route loads.
  "/split-pdf/page": [150, 160],
  "/split-pdf-by-bookmarks/page": [150, 160],
  "/split-pdf-by-size/page": [144, 154],
  "/split-pdf-by-text/page": [150, 160],
  "/split-pdf-in-half/page": [145, 155],
  "/crop-pdf/page": [145, 155],
  // +1 kB on thirteen more routes at their limit: the shared flow now fetches the run's code ahead of the click, offers Repair
  // on a file that will not open and shows a result's good news (F13 key checks M7, M9).
  // +1 kB on Resize, Clear annotations and Metadata, which sat at their limit: the registry every page carries grew by Deskew (F15).
  // F15 Deskew: the flow and its "Only these pages" field (+2 kB, key check G-1); the skew detector and the dialog load on demand.
  "/deskew-pdf/page": [147, 157],
  "/ocr-pdf/page": [145, 155],
  "/resize-pdf/page": [146, 156],
  "/flip-pdf/page": [145, 155],
  "/n-up-pdf/page": [145, 155],
  "/add-page-numbers/page": [150, 160],
  "/pdf-header-footer/page": [149, 159],
  "/watermark-pdf/page": [150, 160],
  // +1 kB entry on Extract (F12, 27 Nov): three more tools in the registry every route loads, and the shared
  // LinkButton / IconButton variants.
  "/extract-pdf-pages/page": [146, 156],
  "/delete-pdf-pages/page": [145, 155],
  // F12 (spec f12-image-text-tools.md): PDF to image is Extract's page with two option groups; PDF to text is the
  // bare flow; Image to PDF is Organize's workspace. Their engines (page-images, page-text, tiff-write) are lazy.
  // F12 and F11 added six tools to the registry every route carries: the routes within that of their
  // budget (home, Split, Delete, PDF to JPG, JPG to PDF) move up 1 kB.
  // F11: Protect is the bare flow plus the password field and three switches; Unlock is the bare flow.
  "/protect-pdf/page": [143, 153],
  // +1 kB entry (F10, 28 Nov): three more tools in the registry every route loads.
  "/unlock-pdf/page": [140, 150],
  // F10 document tools: the pick-pages flow with switches; the bare flow with one select; the bare flow with a form.
  "/remove-pdf-annotations/page": [146, 156],
  // Flatten: +1 kB for the pictures choice (a second select and its copy).
  "/flatten-pdf/page": [144, 154],
  // F13 Grayscale: the bare flow with one select.
  "/grayscale-pdf/page": [144, 154],
  "/repair-pdf/page": [143, 153],
  // +1 kB: it sat at its limit and the shared flow grew by the OCR job's registry entry (F15).
  "/rename-pdf/page": [146, 156],
  "/pdf-bookmarks/page": [145, 155],
  "/edit-pdf-metadata/page": [145, 155],
  "/pdf-to-jpg/page": [146, 156],
  "/extract-images/page": [143, 153],
  // +1 kB: the tool registry every page carries grew by Grayscale (F13).
  "/pdf-to-text/page": [140, 150],
  "/jpg-to-pdf/page": [152, 162],
  // The editor's landing (F16 AC-86), measured 124 / 140 on 26 Nov plus ~2 kB (the landing tool cap is 150);
  // its shell, pdf.js and engine are the editor JS budget below.
  "/edit-pdf/page": [126, 142],
};
/** Cloud-on builds carry the F23 source caret and row (~0.9 KB entry, ~2 KB phone), accepted by the lead 24 Nov. */
const CLOUD_BUDGET_KB = {
  ...BUDGET_KB,
  // +1 kB on six routes that sat at their limit (merge, combine, split, by bookmarks, by size, extract): the shared flow now takes damaged files for Repair (F13).
  "/merge-pdf/page": [153, 163],
  "/rotate-pdf/page": [144, 154],
  "/organize-pdf/page": [153, 163],
  "/combine-reorder-pdf/page": [153, 163],
  // Alternate shares every first-load chunk with Organize but its page chunk (150.6 vs 150.8 kB after the
  // F4 + main tile-rule merge); 1 kB over its F5 budget, still under Organize's and Combine's 152.
  "/alternate-mix-pdf/page": [152, 162],
  "/split-pdf/page": [151, 161],
  "/split-pdf-by-bookmarks/page": [151, 161],
  "/split-pdf-by-size/page": [145, 155],
  "/split-pdf-by-text/page": [151, 161],
  "/split-pdf-in-half/page": [146, 156],
  "/crop-pdf/page": [147, 157],
  "/deskew-pdf/page": [149, 159],
  "/ocr-pdf/page": [147, 157],
  // +1 kB on Alternate (preloads), Delete, Protect and Unlock, at their limit: the shared-flow changes of the F13 key checks (see the table above).
  "/resize-pdf/page": [147, 157],
  "/flip-pdf/page": [147, 157],
  "/n-up-pdf/page": [147, 157],
  "/add-page-numbers/page": [151, 161],
  "/pdf-header-footer/page": [151, 161],
  "/watermark-pdf/page": [152, 162],
  "/extract-pdf-pages/page": [147, 157],
  "/delete-pdf-pages/page": [147, 157],
  "/protect-pdf/page": [145, 155],
  "/unlock-pdf/page": [142, 152],
  "/remove-pdf-annotations/page": [147, 157],
  "/flatten-pdf/page": [145, 155],
  "/grayscale-pdf/page": [145, 155],
  "/repair-pdf/page": [145, 155],
  "/rename-pdf/page": [147, 157],
  "/pdf-bookmarks/page": [147, 157],
  "/edit-pdf-metadata/page": [146, 156],
  "/pdf-to-jpg/page": [148, 158],
  "/extract-images/page": [144, 154],
  "/pdf-to-text/page": [142, 152],
  "/jpg-to-pdf/page": [154, 164],
  // The editor's landing with the F23 caret, row and intake (E6): measured 128 / 144 on 26 Nov plus ~2 kB.
  "/edit-pdf/page": [130, 146],
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
/**
 * No `import()` of pdf-lib or fontkit from the editor's own code or lib/pdf, which run on the main
 * thread, except from modules only the processing worker reaches (listed with why). A new one
 * would load ~240-330 kB on the main thread; it goes in a worker, or on Download intent.
 */
const MAIN_THREAD = /^(tools\/editor\/|lib\/pdf\/)/;
const WORKER_ONLY = new Set([
  "lib/pdf/text.ts", // Merge's text writer: lib/pdf/merge.ts ← jobs.ts ← processing.worker.ts
]);
for (const key of Object.keys(loadable)) {
  const [importer, target] = key.split(" -> ");
  if (MAIN_THREAD.test(importer ?? "") && /^@cantoo\/(pdf-lib|fontkit)$/.test(target ?? "") && !WORKER_ONLY.has(importer)) {
    console.error(`OVER main thread: ${importer} imports ${target}; load it in a worker (the download worker for the editor, U-E13)`);
    failed++;
  }
}

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
