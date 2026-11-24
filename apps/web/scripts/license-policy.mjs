/**
 * License allow-list (CLAUDE.md rule 3) used by scripts/licenses.mjs, which runs at the
 * start of every `pnpm build` and so is also the CI license scan.
 * Unit-tested in src/lib/licenses/policy.test.ts.
 */

/** SPDX ids allowed for code in the production dependency tree. */
export const ALLOWED_CODE = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0", "0BSD", "Zlib"]);

/** SPDX ids allowed for fonts (and only for fonts). */
export const ALLOWED_FONT = new Set(["OFL-1.1"]);

/**
 * SPDX ids the font library may serve (entries with `library: true`): licences CLAUDE.md rule 3
 * already allows (OFL-1.1 for fonts; Apache-2.0 and MIT from the permissive list). UFL-1.0,
 * CC0-1.0, the GUST Font License and Bitstream Vera wait for the owner to write them into rule 3.
 * Must stay equal to FONT_LICENCES in scripts/font-library/lib.mjs (policy.test.ts checks).
 */
export const ALLOWED_LIBRARY_FONT = new Set(["OFL-1.1", "Apache-2.0", "MIT"]);

/**
 * npm packages that ship only font files and their CSS (no program code), e.g. self-hosted
 * Fontsource fonts loaded with next/font/local. They are judged as fonts (ALLOWED_FONT), and only
 * if every file in them is a font, stylesheet or metadata file (see isFontOnlyPackage).
 */
export const FONT_PACKAGES = [/^@fontsource\/[a-z0-9-]+$/, /^@fontsource-variable\/[a-z0-9-]+$/];

/** File types a font-only package may contain (allow-list; anything else, e.g. JS or WASM, disqualifies it). */
export const FONT_PACKAGE_FILES = [
  /\.(css|scss|woff2?|ttf|otf|json|md)$/i,
  /\.d\.[a-z0-9]+\.ts$/i, // type stubs for CSS imports, e.g. index.d.css.ts
  /^(licen[cs]e|readme|changelog)(\.(md|txt))?$/i,
];

/**
 * A listed font package that is really only fonts: `files` is every file in the package,
 * walked recursively (paths relative to its root, "/" separators), and its package.json
 * declares no `scripts` and no `bin` (nothing that could run at install or as a command).
 */
export function isFontOnlyPackage(name, files, pkg = {}) {
  if (!FONT_PACKAGES.some((re) => re.test(name))) return false;
  const has = (v) => v != null && (typeof v === "string" ? v.trim() !== "" : Object.keys(v).length > 0);
  if (has(pkg.scripts) || has(pkg.bin)) return false;
  return files.length > 0 && files.every((f) => {
    const base = f.split("/").pop() ?? f;
    return FONT_PACKAGE_FILES.some((re) => re.test(base));
  });
}

/**
 * Named, reviewed exceptions: package name → the exact license expression accepted for it
 * and why. Anything else outside the allow-list fails the build.
 * @type {Record<string, { license: string; reason: string }>}
 */
export const EXCEPTIONS = {
  "caniuse-lite": {
    license: "CC-BY-4.0",
    reason:
      "Browser-support data table required by Next.js (build tooling), not program code. CC BY 4.0 only asks for attribution, which /licenses gives. Needs owner sign-off.",
  },
};

/** Normalises the package.json `license` / legacy `licenses` field to one SPDX expression string, or null. */
export function licenseExpression(pkg) {
  const l = pkg?.license ?? pkg?.licenses;
  if (typeof l === "string") return l.trim() || null;
  if (Array.isArray(l)) {
    const ids = l.map((x) => (typeof x === "string" ? x : x?.type)).filter(Boolean);
    return ids.length ? (ids.length === 1 ? ids[0] : `(${ids.join(" OR ")})`) : null;
  }
  if (l && typeof l === "object" && typeof l.type === "string") return l.type;
  return null;
}

function tokenize(expr) {
  return expr.replace(/\(/g, " ( ").replace(/\)/g, " ) ").trim().split(/\s+/);
}

/**
 * Evaluates an SPDX expression against an allow-list: `A OR B` passes if either side
 * does, `A AND B` only if both do, `A WITH exception` is judged on A. Unknown syntax
 * ("SEE LICENSE IN …", "UNLICENSED", empty) fails.
 */
export function isAllowedExpression(expr, allowed = ALLOWED_CODE) {
  if (typeof expr !== "string" || !expr.trim()) return false;
  const tokens = tokenize(expr);
  let i = 0;
  const peek = () => tokens[i];
  function primary() {
    const t = tokens[i++];
    if (t === undefined) throw new Error("unexpected end");
    if (t === "(") {
      const v = orExpr();
      if (tokens[i++] !== ")") throw new Error("missing )");
      return v;
    }
    if (t === ")" || /^(AND|OR|WITH)$/i.test(t)) throw new Error(`unexpected ${t}`);
    const ok = allowed.has(t);
    if (peek() && /^WITH$/i.test(peek())) {
      i++;
      if (tokens[i++] === undefined) throw new Error("WITH needs an exception");
    }
    return ok;
  }
  function andExpr() {
    let v = primary();
    while (peek() && /^AND$/i.test(peek())) {
      i++;
      const r = primary();
      v = v && r;
    }
    return v;
  }
  function orExpr() {
    let v = andExpr();
    while (peek() && /^OR$/i.test(peek())) {
      i++;
      const r = andExpr();
      v = v || r;
    }
    return v;
  }
  try {
    const v = orExpr();
    return i === tokens.length ? v : false;
  } catch {
    return false;
  }
}

/**
 * Returns the entries that break the policy.
 * @template {{ name: string; version: string; license: string | null; kind: "package" | "font" | "asset" }} T
 * @param {T[]} entries
 * @param {{ exceptions?: Record<string, { license: string; reason: string }> }} [options]
 * @returns {T[]}
 */
export function findViolations(entries, { exceptions = EXCEPTIONS } = {}) {
  return entries.filter((e) => {
    if (e.kind === "font") return !isAllowedExpression(e.license, e.library ? ALLOWED_LIBRARY_FONT : ALLOWED_FONT);
    if (isAllowedExpression(e.license, ALLOWED_CODE)) return false;
    const ex = exceptions[e.name];
    return !(ex && ex.license === e.license);
  });
}

/** "Copyright …" lines of a license or NOTICE text (not the template lines). */
export function copyrightLines(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(copyright\b|\(c\)|©)/i.test(l))
    .filter((l) => !/\[yyyy\]|\{yyyy\}|<year>|copyright notice|copyright owner\]|copyright holders? (and|or)/i.test(l))
    // SIL OFL 1.1 boilerplate ("Copyright Holder(s)", "copyright statement(s).", the warranty line).
    .filter((l) => !/^copyright (holder|statement)|^copyright holder be liable/i.test(l));
  return [...new Set(lines)].slice(0, 6);
}
