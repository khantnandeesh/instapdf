#!/usr/bin/env node
/**
 * Post-build step (backlog Q1): hashes every prerendered page's inline scripts
 * and writes .next/csp-manifest.json, which src/middleware.ts turns into the
 * page's Content-Security-Policy `script-src` hashes.
 *
 *   node scripts/csp-manifest.mjs        (run by `pnpm build` after `next build`)
 *
 * Also fails the build when server HTML contains something the strict policy
 * would block: style attributes or <style> tags (style-src 'self'), inline
 * event handlers, or javascript: URLs.
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cspViolationsInHtml, inlineScriptHashes, routeForHtmlFile } from "./csp-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, ".next", "server", "app");

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith(".html") ? [p] : [];
  });
}

if (!existsSync(appDir)) {
  console.error("csp-manifest: .next/server/app not found. Run `next build` first.");
  process.exit(1);
}

const routes = {};
const problems = [];
for (const file of htmlFiles(appDir)) {
  const html = readFileSync(file, "utf8");
  const route = routeForHtmlFile(relative(appDir, file).split(sep).join("/"));
  routes[route] = inlineScriptHashes(html);
  for (const p of cspViolationsInHtml(html)) problems.push(`${route}: ${p}`);
}

if (problems.length) {
  console.error("csp-manifest: server HTML would be blocked by the CSP:\n  " + problems.join("\n  "));
  process.exit(1);
}
if (!routes["/"] || !routes["/_not-found"]) {
  console.error("csp-manifest: expected prerendered / and /_not-found pages.");
  process.exit(1);
}

const out = join(root, ".next", "csp-manifest.json");
writeFileSync(out, JSON.stringify({ routes }, null, 0) + "\n");

// output: "standalone" copies .next before this runs; put the manifest next to its server.js too.
const standaloneRoot = join(root, ".next", "standalone");
if (existsSync(standaloneRoot)) {
  const serverJs = findServerJs(standaloneRoot);
  if (serverJs) copyFileSync(out, join(dirname(serverJs), ".next", "csp-manifest.json"));
  else {
    console.error("csp-manifest: standalone output has no server.js");
    process.exit(1);
  }
}

const count = Object.values(routes).reduce((n, h) => n + h.length, 0);
console.log(`csp-manifest: ${Object.keys(routes).length} pages, ${count} inline-script hashes`);

function findServerJs(dir, depth = 0) {
  if (existsSync(join(dir, "server.js")) && existsSync(join(dir, ".next"))) return join(dir, "server.js");
  // Standalone output mirrors the path from the tracing root, which can be several folders deep (a git worktree).
  if (depth > 8) return null;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name !== "node_modules" && e.name !== ".next") {
      const found = findServerJs(join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}
