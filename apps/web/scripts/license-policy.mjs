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
    if (e.kind === "font") return !isAllowedExpression(e.license, ALLOWED_FONT);
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
    .filter((l) => !/\[yyyy\]|\{yyyy\}|<year>|copyright notice|copyright owner\]|copyright holders? (and|or)/i.test(l));
  return [...new Set(lines)].slice(0, 6);
}
