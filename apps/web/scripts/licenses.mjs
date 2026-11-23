#!/usr/bin/env node
/**
 * Third-party notices and license scan (backlog Q1). Runs first in `pnpm build`,
 * so CI's build step is also the license scan.
 *
 *   node scripts/licenses.mjs
 *
 * 1. Reads the production dependency tree with `pnpm list --prod --json --depth Infinity`
 *    (packages listed but not installed, e.g. other platforms' optional binaries, are skipped:
 *    they are never built into or shipped with the app).
 *    Font-only packages (e.g. @fontsource/*, served by next/font/local) are entries of kind
 *    "font", so OFL-1.1 is allowed for them and only them (license-policy.mjs FONT_PACKAGES).
 * 2. Adds the fonts and vendored assets that are not npm dependencies: the next/font Google
 *    fonts (OFL-1.1), any OFL fonts under public/fonts, and the Lucide/Feather icon paths.
 * 3. Fails (exit 1) if anything is outside the allow-list in scripts/license-policy.mjs.
 * 4. Writes .generated/licenses.json (read by the /licenses page at build time) and
 *    public/third-party-notices.txt (full license and NOTICE texts). Both are gitignored.
 *
 * No GPL tooling: only Node built-ins and pnpm.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { copyrightLines, EXCEPTIONS, findViolations, isFontOnlyPackage, licenseExpression } from "./license-policy.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Fonts loaded with next/font/google. Their files are downloaded at build and served
 * from our origin. The scan below fails if src/ imports a Google font missing here.
 */
const GOOGLE_FONTS = {
  Geist: { copyright: "Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font)", homepage: "https://github.com/vercel/geist-font" },
  Geist_Mono: { copyright: "Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font)", homepage: "https://github.com/vercel/geist-font" },
};

// ---- npm packages ----------------------------------------------------------------

function prodTree() {
  const out = execFileSync("pnpm", ["list", "--prod", "--json", "--depth", "Infinity"], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const [project] = JSON.parse(out);
  const seen = new Map();
  const walk = (deps) => {
    for (const [name, d] of Object.entries(deps ?? {})) {
      const key = `${name}@${d.version}`;
      if (seen.has(key)) continue;
      seen.set(key, { name, version: d.version, path: d.path });
      walk(d.dependencies);
    }
  };
  walk(project.dependencies);
  return [...seen.values()];
}

/** Every file under `dir`, recursively, as "/"-separated paths relative to it (symlinks are listed, not followed). */
function filesDeep(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesDeep(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  );
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

function filesIn(dir) {
  try {
    return readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort();
  } catch {
    return [];
  }
}

function authorOf(pkg) {
  const a = pkg.author;
  if (!a) return null;
  return typeof a === "string" ? a : a.name ?? null;
}

function homepageOf(pkg) {
  if (typeof pkg.homepage === "string") return pkg.homepage;
  const r = pkg.repository;
  const url = typeof r === "string" ? r : r?.url;
  if (!url) return null;
  return url
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "")
    .replace(/^github:/, "https://github.com/")
    .replace(/^(?!https?:)([\w.-]+\/[\w.-]+)$/, "https://github.com/$1");
}

function packageEntries() {
  const entries = [];
  for (const { name, version, path } of prodTree()) {
    const pjPath = join(path, "package.json");
    if (!existsSync(pjPath)) continue; // listed optional dependency for another platform: not installed
    const pkg = JSON.parse(readFileSync(pjPath, "utf8"));
    const texts = filesIn(path).map((f) => ({ file: f, text: readFileSync(join(path, f), "utf8").trim() }));
    const copyright = texts.flatMap((t) => copyrightLines(t.text));
    entries.push({
      kind: isFontOnlyPackage(name, filesDeep(path), pkg) ? "font" : "package",
      name,
      version,
      license: licenseExpression(pkg),
      copyright: [...new Set(copyright)].slice(0, 6),
      author: authorOf(pkg),
      homepage: homepageOf(pkg),
      texts,
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, "en") || a.version.localeCompare(b.version, "en"));
}

// ---- fonts and vendored assets ------------------------------------------------------

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(tsx?|mjs|jsx?)$/.test(e.name) ? [p] : [];
  });
}

function googleFontsInSource() {
  const used = new Set();
  for (const file of sourceFiles(join(root, "src"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/import\s*\{([^}]+)\}\s*from\s*["']next\/font\/google["']/g)) {
      for (const n of m[1].split(",")) used.add(n.trim().split(/\s+as\s+/)[0]);
    }
  }
  return [...used].filter(Boolean).sort();
}

function fontEntries() {
  const ofl = readFileSync(join(root, "licenses", "OFL-1.1.txt"), "utf8").trim();
  const entries = [];
  const missing = googleFontsInSource().filter((f) => !GOOGLE_FONTS[f]);
  if (missing.length) {
    console.error(`licenses: next/font/google fonts without a notice entry in scripts/licenses.mjs: ${missing.join(", ")}`);
    process.exit(1);
  }
  for (const font of googleFontsInSource()) {
    const meta = GOOGLE_FONTS[font];
    entries.push({
      kind: "font",
      name: `${font.replace(/_/g, " ")} (font)`,
      version: "via Google Fonts, self-hosted",
      license: "OFL-1.1",
      copyright: [meta.copyright],
      author: null,
      homepage: meta.homepage,
      texts: [{ file: "OFL-1.1", text: `${meta.copyright}\n\n${ofl}` }],
    });
  }
  // Self-hosted font files that ship their own OFL text (public/fonts/**/OFL*.txt).
  const fontsDir = join(root, "public", "fonts");
  const walk = (dir) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /^OFL.*\.txt$/i.test(e.name) ? [join(dir, e.name)] : []))
      : [];
  for (const file of walk(fontsDir).sort()) {
    const text = readFileSync(file, "utf8").trim();
    const label = relative(join(root, "public"), file).replace(/\\/g, "/");
    entries.push({
      kind: "font",
      name: `${label.replace(/^fonts\//, "").replace(/\/?OFL-?/i, " ").replace(/\.txt$/i, "").trim()} (font)`,
      version: "self-hosted",
      license: /SIL OPEN FONT LICENSE[\s\S]{0,40}Version 1\.1/i.test(text) ? "OFL-1.1" : null,
      copyright: copyrightLines(text),
      author: null,
      homepage: null,
      texts: [{ file: label, text }],
    });
  }
  return entries;
}

function assetEntries() {
  const dir = join(root, "node_modules", "lucide-static");
  if (!existsSync(join(dir, "LICENSE"))) {
    console.error("licenses: lucide-static is not installed; its notice is needed for the vendored icons (run pnpm install).");
    process.exit(1);
  }
  const version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
  const text = readFileSync(join(dir, "LICENSE"), "utf8").trim();
  return [
    {
      kind: "asset",
      name: "Lucide icons (icon paths, some derived from Feather)",
      version,
      license: "ISC AND MIT",
      copyright: copyrightLines(text),
      author: null,
      homepage: "https://lucide.dev",
      texts: [{ file: "LICENSE", text }],
    },
  ];
}

// ---- output ---------------------------------------------------------------------------

function noticesText(entries) {
  const groups = new Map();
  const add = (text, who) => {
    const key = createHash("sha256").update(text).digest("hex");
    if (!groups.has(key)) groups.set(key, { text, who: [] });
    groups.get(key).who.push(who);
  };
  const missing = [];
  for (const e of entries) {
    const who = `${e.name} ${e.version}`;
    if (!e.texts.length) missing.push(`${who} (${e.license})${e.author ? `, author: ${e.author}` : ""}`);
    for (const t of e.texts) add(t.text, `${who} (${t.file})`);
  }
  const rule = "=".repeat(78);
  const parts = [
    "BerryPDF: third-party notices",
    "",
    "BerryPDF includes or uses the open-source software, fonts and icons below.",
    "Each block lists the components it applies to, followed by the license or",
    "NOTICE text they ship with. A summary is at /licenses.",
    "",
  ];
  for (const g of groups.values()) parts.push(rule, ...g.who.map((w) => `* ${w}`), rule, "", g.text, "");
  if (missing.length) {
    parts.push(
      rule,
      "Packages that ship no license file. Each is published under the license named,",
      "whose standard text applies (MIT and Apache-2.0 texts appear above).",
      rule,
      "",
      ...missing.map((m) => `* ${m}`),
      "",
    );
  }
  return parts.join("\n");
}

const entries = [...packageEntries(), ...fontEntries(), ...assetEntries()];
const violations = findViolations(entries);
if (violations.length) {
  console.error("licenses: dependencies outside the license allow-list (CLAUDE.md rule 3):");
  for (const v of violations) console.error(`  ${v.name}@${v.version}: ${v.license ?? "no license field"}`);
  process.exit(1);
}

mkdirSync(join(root, ".generated"), { recursive: true });
const summary = entries.map(({ texts, ...e }) => ({
  ...e,
  hasNotice: texts.some((t) => /^notice/i.test(t.file)),
  exception: e.kind === "package" && EXCEPTIONS[e.name] ? EXCEPTIONS[e.name].reason : null,
}));
writeFileSync(join(root, ".generated", "licenses.json"), JSON.stringify({ entries: summary }, null, 1) + "\n");
writeFileSync(join(root, "public", "third-party-notices.txt"), noticesText(entries));
const counts = entries.reduce((m, e) => ((m[e.kind] = (m[e.kind] ?? 0) + 1), m), {});
console.log(`licenses: OK, ${counts.package ?? 0} packages, ${counts.font ?? 0} fonts, ${counts.asset ?? 0} asset sets, all within the allow-list`);
