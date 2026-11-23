/**
 * Pure helpers for scripts/csp-manifest.mjs (unit-tested in src/lib/security/csp-lib.test.ts).
 */
import { createHash } from "node:crypto";

/** sha256 CSP hash source (without quotes) of one inline script's text. */
export function scriptHash(text) {
  return `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/** Hashes of the inline (no src) scripts of a page, in document order, without duplicates. */
export function inlineScriptHashes(html) {
  const out = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = /\btype\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    // Data blocks (JSON-LD etc.) are not executed and need no hash.
    if (type && !/^(text\/javascript|module)$/i.test(type)) continue;
    const h = scriptHash(m[2]);
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

/** Things in server HTML (outside scripts) that the strict policy would block. */
export function cspViolationsInHtml(html) {
  const markup = html.replace(SCRIPT_RE, "<script></script>");
  const problems = [];
  if (/<style\b/i.test(markup)) problems.push("<style> element (style-src has no 'unsafe-inline')");
  const style = /<[a-z][^>]*\sstyle="/i.exec(markup);
  if (style) problems.push(`style attribute (style-src has no 'unsafe-inline'): ${markup.slice(style.index, style.index + 80)}`);
  const handler = /<[a-z][^>]*\son[a-z]+="/i.exec(markup);
  if (handler) problems.push(`inline event handler: ${markup.slice(handler.index, handler.index + 80)}`);
  if (/\s(?:href|src|action)="\s*javascript:/i.test(markup)) problems.push("javascript: URL");
  return problems;
}

/** "index.html" → "/", "rotate-pdf.html" → "/rotate-pdf", "_not-found.html" → "/_not-found". */
export function routeForHtmlFile(relPath) {
  // Route groups like "(info)/" are not part of the URL.
  const path = "/" + relPath.replace(/\.html$/, "").replace(/(^|\/)\([^/]+\)(?=\/)/g, "").replace(/^\//, "");
  if (path === "/index") return "/";
  return path.replace(/\/index$/, "");
}
