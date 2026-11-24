/**
 * Scrolling rules, source check (docs/design/berrypdf.md "Scrolling"). Fails CI when code adds a scroll
 * container that is not registered as one of the allowed kinds, so a nested scroller or a sideways
 * scroll bar can't slip in unnoticed. The e2e twin (e2e/ui/scroll-rules.spec.ts) checks what actually
 * scrolls in the browser.
 *
 * - TSX: an element whose class list makes it scroll (overflow-auto, overflow-y-scroll, lg:overflow-x-auto…)
 *   must carry data-ip-scroll="pages" | "rail" | "overlay" | "chips" in the same JSX tag.
 * - CSS: a rule that sets overflow / overflow-x / overflow-y to auto, scroll or overlay must say which
 *   kind it is with an "ip-scroll: <kind>" comment inside the rule.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");
const KINDS = ["pages", "rail", "overlay", "chips"] as const;

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return files(p, ext);
    return ext.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
  });
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Is `i` inside a // line comment or a block comment? (good enough for our sources) */
function inComment(text: string, i: number): boolean {
  const lineStart = text.lastIndexOf("\n", i) + 1;
  if (/(^|[^:])\/\//.test(text.slice(lineStart, i))) return true;
  return text.lastIndexOf("/*", i) > text.lastIndexOf("*/", i);
}

/** The JSX opening tag around `index`: from the last `<Tag` before it to its closing `>` (outside braces and strings). */
export function openingTag(text: string, index: number): string | null {
  let start = -1;
  for (let i = index; i >= 0; i--) {
    if (text[i] === "<" && /[A-Za-z]/.test(text[i + 1] ?? "") && !inComment(text, i)) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") i = text.indexOf("\n", i);
    else if (ch === "/" && text[i + 1] === "*") i = text.indexOf("*/", i) + 1;
    else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * What makes an element a scroll container in our sources: a Tailwind class (any variant prefix),
 * a Tailwind arbitrary property ([overflow-y:auto]) or an inline style ({ overflowY: "auto" }).
 */
const TW_SCROLL =
  /(?<![\w-])(?:[\w-]+:|\[[^\]]*\]:)*(?:overflow(?:-[xy])?-(?:auto|scroll)(?![\w-])|\[overflow(?:-[xy])?:[^\]]*\b(?:auto|scroll)\b[^\]]*\])|overflow[XY]?\s*:\s*["'`][^"'`]*\b(?:auto|scroll)\b/g;

/** .ts files have no JSX tag to carry the attribute: a "ip-scroll: <kind>" comment on that line or the one above. */
export function tsViolations(path: string, text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TW_SCROLL)) {
    const line = lineOf(text, m.index!);
    const lines = text.split("\n").slice(Math.max(0, line - 2), line).join("\n");
    const marker = lines.match(/ip-scroll:\s*([a-z]+)/);
    if (!marker || !(KINDS as readonly string[]).includes(marker[1])) out.push(`${path}:${line} "${m[0]}" needs an "ip-scroll: <${KINDS.join(" | ")}>" comment on its line or the line above`);
  }
  return out;
}

export function tsxViolations(path: string, text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TW_SCROLL)) {
    const tag = openingTag(text, m.index!);
    // data-ip-scroll="kind", or an expression whose quoted values include an allowed kind.
    const attr = tag?.match(/data-ip-scroll=("[^"]*"|\{[^}]*\})/)?.[1] ?? "";
    const ok = KINDS.some((k) => attr.includes(`"${k}"`));
    if (!ok) out.push(`${path}:${lineOf(text, m.index!)} "${m[0]}" needs data-ip-scroll="${KINDS.join(" | ")}" on the same element`);
  }
  return out;
}

export function cssViolations(path: string, text: string): string[] {
  const out: string[] = [];
  // Strip comments except the ip-scroll markers, then look at each declaration block.
  // overflow / overflow-x / overflow-y set to auto|scroll|overlay (also as the second value of the
  // two-value overflow shorthand), or a Tailwind scroll class pulled in with @apply.
  const re = new RegExp(`overflow(?:-[xy])?\\s*:\\s*(?:[a-z]+\\s+)?(?:auto|scroll|overlay)\\b|@apply[^;]*?${TW_SCROLL.source}`, "g");
  for (const m of text.matchAll(re)) {
    const before = text.slice(0, m.index!);
    // Inside a comment? (an unclosed /* before it)
    if (before.lastIndexOf("/*") > before.lastIndexOf("*/")) continue;
    const open = before.lastIndexOf("{");
    const close = text.indexOf("}", m.index!);
    const block = text.slice(open, close);
    const marker = block.match(/ip-scroll:\s*([a-z]+)/);
    if (!marker || !(KINDS as readonly string[]).includes(marker[1])) out.push(`${path}:${lineOf(text, m.index!)} "${m[0]}" needs an "ip-scroll: <${KINDS.join(" | ")}>" comment in its rule`);
  }
  return out;
}

describe("scroll rules (source)", () => {
  it("every scroll container in TSX is registered with data-ip-scroll", () => {
    const bad = files(SRC, /\.tsx$/).flatMap((f) => tsxViolations(relative(SRC, f), readFileSync(f, "utf8")));
    expect(bad, "see docs/design/berrypdf.md \"Scrolling\"").toEqual([]);
  });

  it("every scroll class or style in plain .ts files is marked with its kind", () => {
    const bad = files(SRC, /\.ts$/).flatMap((f) => tsViolations(relative(SRC, f), readFileSync(f, "utf8")));
    expect(bad, "see docs/design/berrypdf.md \"Scrolling\"").toEqual([]);
  });

  it("every scrolling CSS rule says which allowed kind it is", () => {
    const bad = files(SRC, /\.css$/).flatMap((f) => cssViolations(relative(SRC, f), readFileSync(f, "utf8")));
    expect(bad, "see docs/design/berrypdf.md \"Scrolling\"").toEqual([]);
  });

  it("flags an unregistered scroller and accepts a registered one", () => {
    expect(tsxViolations("a.tsx", '<div className="lg:overflow-y-auto p-2">x</div>')).toHaveLength(1);
    expect(tsxViolations("a.tsx", '<div className="overflow-x-auto" data-ip-scroll="table">x</div>')).toHaveLength(1);
    expect(tsxViolations("a.tsx", '<div className={cx("a", b && "overflow-auto")} data-ip-scroll="overlay">x</div>')).toHaveLength(0);
    expect(tsxViolations("a.tsx", '<dialog data-ip-scroll={v ? "overlay" : undefined} className="overflow-y-auto" />')).toHaveLength(0);
    expect(tsxViolations("a.tsx", '<div className="overflow-hidden overflow-x-clip">x</div>')).toHaveLength(0);
    expect(tsxViolations("a.tsx", '<div\n  // a comment with a <tag> in it\n  className="overflow-y-auto"\n  data-ip-scroll="rail"\n/>')).toHaveLength(0);
    expect(tsxViolations("a.tsx", '<div style={{ overflowY: "auto" }}>x</div>')).toHaveLength(1);
    expect(tsxViolations("a.tsx", '<div className="lg:[overflow-y:auto]">x</div>')).toHaveLength(1);
    expect(tsxViolations("a.tsx", '<div style={{ overflowY: "auto" }} data-ip-scroll="overlay">x</div>')).toHaveLength(0);
    expect(tsViolations("a.ts", 'const bar = "flex overflow-x-auto";')).toHaveLength(1);
    expect(tsViolations("a.ts", '// ip-scroll: chips\nconst bar = "flex overflow-x-auto";')).toHaveLength(0);
    expect(cssViolations("a.css", ".a { overflow: hidden auto; }")).toHaveLength(1);
    expect(cssViolations("a.css", ".a { @apply flex lg:overflow-y-auto; }")).toHaveLength(1);
    expect(cssViolations("a.css", ".a { overflow-y: auto; }")).toHaveLength(1);
    expect(cssViolations("a.css", ".a { /* ip-scroll: pages */ overflow-y: auto; }")).toHaveLength(0);
    expect(cssViolations("a.css", "/* overflow: auto */ .a { overflow: hidden; }")).toHaveLength(0);
  });
});
