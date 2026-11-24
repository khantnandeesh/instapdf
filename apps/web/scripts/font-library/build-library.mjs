#!/usr/bin/env node
/**
 * Builds the published font library: font files, a manifest per family, the family list the
 * font menu searches, and the matching index.
 *
 *   node scripts/font-library/build-library.mjs --out <dir>
 *        [--source packages | catalogue] [--catalogue <catalogue.json>] [--families id,id] [--limit n]
 *        [--subsets latin,latin-ext] [--weights 400,700] [--clean]
 *
 * --source packages (default) reads the @fontsource packages installed in this app: the small
 * library that development, tests and CI use. --source catalogue downloads every family of a
 * catalogue written by crawl.mjs, one request a second per host. --subsets and --weights keep
 * only those slices and weights (the copy shipped inside the app stays small); --clean empties
 * <out> first.
 *
 * Layout written under <out> (everything but manifest.json is content-addressed and can be
 * cached forever):
 *   manifest.json                         → names of the current index files
 *   index/families.<sha8>.json            → one row a family (lib.mjs familyRow)
 *   index/faces.<sha8>.json               → face ids, in the order of features.bin
 *   index/features.<sha8>.bin             → 64 bytes a face
 *   index/sig/<face id>.<sha8>.bin        → glyph signatures of one face
 *   families/<id>.<sha8>.json             → faces → files with character ranges, metrics
 *   fonts/<id>/<subset>-<weight>-<style>.<sha8>.woff
 *   licences/<id>.txt
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { faceId, faceKey, familyRow, fontFileName, gate, parseUnicodeRange, printSubset } from "./lib.mjs";
import { mayEmbed, verticalMetrics, woffToSfnt } from "./sfnt.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function args() {
  const a = process.argv.slice(2);
  const get = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  return { out: get("--out"), source: get("--source") ?? "packages", catalogue: get("--catalogue"), families: get("--families")?.split(","), limit: Number(get("--limit") ?? 0), subsets: get("--subsets")?.split(","), weights: get("--weights")?.split(",").map(Number), clean: a.includes("--clean") };
}

/** Installed @fontsource packages as a source: { entry, unicode, defSubset, read(subset, weight, style), licence() }. */
async function packageSource(only) {
  // The app's own node_modules: with pnpm each package resolves into a folder of its own.
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", "@fontsource");
  const out = [];
  for (const id of (await readdir(root)).sort()) {
    if (only && !only.includes(id)) continue;
    const dir = join(root, id);
    const meta = JSON.parse(await readFile(join(dir, "metadata.json"), "utf8"));
    const g = gate({ ...meta, id: meta.id ?? id, family: meta.family, license: meta.license?.type ?? meta.license }, "fontsource");
    if (!g.ok) {
      console.error(`skip ${id}: ${g.reason}`);
      continue;
    }
    out.push({
      entry: g.entry,
      defSubset: meta.defSubset,
      unicode: JSON.parse(await readFile(join(dir, "unicode.json"), "utf8")),
      read: async (subset, weight, style) => {
        const f = join(dir, "files", `${id}-${subset}-${weight}-${style}.woff`);
        return existsSync(f) ? readFile(f) : null;
      },
      licence: () => readFile(join(dir, "LICENSE"), "utf8"),
    });
  }
  return out;
}

const lastHit = new Map();
/** GET with at most one request a second per host. Null on 404. */
async function polite(url) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  const res = await fetch(url, { headers: { "user-agent": "font-catalogue-crawler" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** A catalogue from crawl.mjs as a source; files come from the catalogue's own CDN listing. */
async function catalogueSource(path, only, limit) {
  let entries = JSON.parse(await readFile(path, "utf8"));
  if (only) entries = entries.filter((e) => only.includes(e.id));
  if (limit) entries = entries.slice(0, limit);
  return entries.map((entry) => {
    let detail;
    const load = async () => (detail ??= JSON.parse((await polite(`https://api.fontsource.org/v1/fonts/${entry.id}`)) ?? "{}"));
    return {
      entry,
      get defSubset() {
        return detail?.defSubset;
      },
      prepare: load,
      get unicode() {
        return detail?.unicodeRange ?? {};
      },
      read: async (subset, weight, style) => {
        const url = (await load()).variants?.[weight]?.[style]?.[subset]?.url?.woff;
        // Only the catalogue's CDN: a listing must not send the crawler anywhere else.
        return url?.startsWith("https://cdn.jsdelivr.net/fontsource/") ? polite(url) : null;
      },
      licence: async () => (await polite(`https://cdn.jsdelivr.net/npm/@fontsource/${entry.id}/LICENSE`))?.toString("utf8") ?? "",
    };
  });
}

/** The font matcher: the WebAssembly module the editor loads, built by scripts/build-engine-wasm.sh. */
async function loadMatcher() {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "engine");
  const matcher = await import(pathToFileURL(join(dir, "berry_fontmatch.js")).href);
  matcher.initSync({ module: await readFile(join(dir, "berry_fontmatch_bg.wasm")) });
  return matcher;
}

async function main() {
  const opt = args();
  if (!opt.out) {
    console.error("usage: build-library.mjs --out <dir> [--source packages|catalogue] [--catalogue file] [--families a,b] [--limit n] [--subsets a,b] [--weights 400,700] [--clean]");
    process.exit(2);
  }
  const sources = opt.source === "catalogue" ? await catalogueSource(opt.catalogue, opt.families, opt.limit) : await packageSource(opt.families);
  const matcher = await loadMatcher();
  if (opt.clean) await rm(opt.out, { recursive: true, force: true });
  const put = async (rel, bytes) => {
    await mkdir(dirname(join(opt.out, rel)), { recursive: true });
    await writeFile(join(opt.out, rel), bytes);
  };
  const rows = [];
  /** [face id, fingerprint] in index order. */
  const prints = [];
  let files = 0;
  for (const src of sources) {
    const { entry } = src;
    await src.prepare?.();
    const faces = {};
    const forPrint = printSubset(entry, src.defSubset);
    for (const weight of entry.weights) {
      if (opt.weights && !opt.weights.includes(weight)) continue;
      for (const style of entry.styles) {
        const list = [];
        let metrics = null;
        for (const subset of entry.subsets) {
          if (opt.subsets && !opt.subsets.includes(subset)) continue;
          const ranges = parseUnicodeRange(src.unicode[subset]);
          // Numbered slices (CJK) carry their ranges under "[n]" keys: not handled yet, skipped.
          if (!ranges.length) continue;
          const woff = await src.read(subset, weight, style);
          const sfnt = woff && woffToSfnt(woff);
          if (!sfnt) continue;
          if (!mayEmbed(sfnt)) {
            console.error(`skip ${entry.id} ${subset} ${weight} ${style}: embedding not allowed`);
            continue;
          }
          const name = fontFileName(subset, weight, style, sha256(woff));
          await put(`fonts/${entry.id}/${name}`, woff);
          files++;
          list.push({ file: `${entry.id}/${name}`, ranges });
          metrics ??= verticalMetrics(sfnt);
          if (subset === forPrint) {
            const print = matcher.fingerprintFile(sfnt);
            // A face with no Latin letters or digits has nothing the index can compare yet.
            if (print?.count) prints.push([faceId(entry.id, weight, style), print]);
          }
        }
        if (list.length && metrics) faces[faceKey(weight, style)] = { files: list, ...metrics };
      }
    }
    if (!Object.keys(faces).length) {
      console.error(`skip ${entry.id}: no usable files`);
      continue;
    }
    const manifest = Buffer.from(JSON.stringify({ id: entry.id, family: entry.family, licence: entry.licence, faces }));
    const sha = sha256(manifest);
    await put(`families/${entry.id}.${sha.slice(0, 8)}.json`, manifest);
    await put(`licences/${entry.id}.txt`, await src.licence());
    rows.push(familyRow({ ...entry, weights: [...new Set(Object.keys(faces).map((k) => Number(k.split("-")[0])))], styles: [...new Set(Object.keys(faces).map((k) => k.split("-")[1]))] }, sha));
  }

  // The matching index, from the same Rust code the browser runs (its WebAssembly build).
  const features = Buffer.concat(prints.map(([, p]) => Buffer.from(p.coarse)));
  const faceIds = prints.map(([id]) => id);
  const sigs = {};
  for (const [id, p] of prints) {
    const bytes = Buffer.from(p.glyphs);
    sigs[id] = sha256(bytes).slice(0, 8);
    await put(`index/sig/${id}.${sigs[id]}.bin`, bytes);
  }
  const named = async (stem, ext, bytes) => {
    const name = `index/${stem}.${sha256(bytes).slice(0, 8)}.${ext}`;
    await put(name, bytes);
    return name;
  };
  const manifest = {
    families: await named("families", "json", Buffer.from(JSON.stringify(rows))),
    faces: await named("faces", "json", Buffer.from(JSON.stringify(faceIds.map((id) => [id, sigs[id]])))),
    features: await named("features", "bin", features),
    counts: { families: rows.length, faces: faceIds.length, files },
  };
  await put("manifest.json", JSON.stringify(manifest, null, 1) + "\n");
  console.log(`font library: ${rows.length} families, ${faceIds.length} faces indexed, ${files} files -> ${opt.out}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
