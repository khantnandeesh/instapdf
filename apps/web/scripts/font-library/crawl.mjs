#!/usr/bin/env node
/**
 * Builds the font library catalogue from open font catalogues.
 *
 *   node scripts/font-library/crawl.mjs --out <dir>
 *
 * Writes catalogue.json (families that passed the licence gate), rejected.json (what was left
 * out and why) and summary.json. Only the listed catalogues are read, one request per second at
 * most, with a plain client name. No font files are downloaded here.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCatalogue, summarise } from "./lib.mjs";

const SOURCES = [{ source: "fontsource", url: "https://api.fontsource.org/v1/fonts" }];
const GAP_MS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "font-catalogue-crawler", accept: "application/json" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const at = process.argv.indexOf("--out");
  const out = at > 0 ? process.argv[at + 1] : null;
  if (!out) {
    console.error("usage: crawl.mjs --out <dir>");
    process.exit(2);
  }
  const listings = [];
  for (const [i, s] of SOURCES.entries()) {
    if (i) await sleep(GAP_MS);
    const entries = await getJson(s.url);
    if (!Array.isArray(entries)) throw new Error(`${s.url}: expected a list`);
    listings.push({ source: s.source, entries });
  }
  const result = buildCatalogue(listings);
  if (result.families.length < 500) throw new Error(`only ${result.families.length} families passed: refusing to write a shrunken catalogue`);
  const summary = summarise(result);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "catalogue.json"), JSON.stringify(result.families));
  await writeFile(join(out, "rejected.json"), JSON.stringify(result.rejected, null, 1));
  await writeFile(join(out, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify({ families: summary.families, faces: summary.faces, licences: summary.licences, rejected: summary.rejected }));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
