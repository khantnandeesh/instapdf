/**
 * Motion rules, source check (docs/design/motion.md §4 and §7), modelled on lib/ui/scroll-rules.test.ts.
 * The e2e twin (e2e/ui/motion.spec.ts) checks what actually moves in the browser.
 *
 * - No transition or keyframe animates a layout or paint-heavy property (width, height, top/left/right/bottom,
 *   margin, padding, font-size, border-*, box-shadow, filter, backdrop-filter, `all`), in CSS, in Tailwind
 *   classes or in inline styles. Hover colour changes (background-color, color, border-color) may transition.
 * - CSS durations (plus delay) stay at 400ms or less, except the listed loops and one-shot decorations.
 * - Only the listed loops repeat forever (no ambient motion).
 * - Only lib/motion/engine.ts imports GSAP; only lib/motion calls element.animate(); no requestAnimationFrame
 *   loop animates anything outside lib/motion.
 * - Every CSS animation is covered by the global reduced-motion kill switch.
 * - lib/motion/tokens.ts agrees with the CSS custom properties in styles/tokens.css.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CAP, DIST, DUR, EASE, STAGGER } from "./tokens";

const SRC = join(__dirname, "..", "..");

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return d.name === "node_modules" ? [] : files(p, ext);
    return ext.test(d.name) ? [p] : [];
  });
}
const rel = (p: string) => relative(SRC, p);
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const CSS = files(SRC, /\.css$/).map((p) => ({ path: rel(p), text: stripComments(readFileSync(p, "utf8")) }));
const CODE = files(SRC, /\.(tsx?|mjs)$/)
  .filter((p) => !/\.test\.tsx?$/.test(p))
  .map((p) => ({ path: rel(p), text: readFileSync(p, "utf8") }));

/** Never animated (motion.md rule 1). Transitions may still change these three colours on hover. */
const FORBIDDEN = /^(all|width|height|min-width|max-width|min-height|max-height|block-size|inline-size|top|left|right|bottom|inset(-[a-z-]+)?|margin(-[a-z-]+)?|padding(-[a-z-]+)?|font-size|line-height|border(-[a-z-]+)?|box-shadow|filter|backdrop-filter|-webkit-backdrop-filter|outline(-[a-z-]+)?)$/;
const TRANSITION_OK = new Set(["border-color", "outline-color"]);
const forbiddenInTransition = (prop: string) => FORBIDDEN.test(prop) && !TRANSITION_OK.has(prop);

/** Repeating loops that carry state (the busy pulse, spinners, the jam while work runs) and one-shot
 *  decorations that are allowed to outlast the cap (they stop within 5s, WCAG 2.2.2). */
const LOOPS = new Set(["mp-jam-flow", "mp-jam-glide", "ip-pulse", "ip-spin", "ed-spin"]);
const LONG_ONCE = new Set(["mp-levitate", "mp-ring-once"]);
/** The berry loader is a loader (it runs only while work runs); its timings are per element. */
const LOADER_FILES = new Set(["components/berry/berry-loader.css"]);

/** Splits on commas outside parentheses. */
function splitTop(v: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of v) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** --name: value pairs from styles/tokens.css (the first definition wins). */
const TOKENS = (() => {
  const css = stripComments(readFileSync(join(SRC, "styles/tokens.css"), "utf8"));
  const map = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!map.has(m[1])) map.set(m[1], m[2].trim());
  return map;
})();

/** A time in ms, resolving var(--token) through tokens.css; null when it can't be known statically. */
function ms(token: string): number | null {
  const v = token.match(/^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/);
  if (v) {
    const t = TOKENS.get(v[1]) ?? v[2];
    return t ? ms(t.trim()) : null;
  }
  const m = token.match(/^(-?[\d.]+)(ms|s)$/);
  return m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : null;
}
const isTime = (t: string) => /^(-?[\d.]+)(ms|s)$/.test(t) || /^var\(--(dur|motion)-/.test(t);

/** Each declaration `prop: value` in a CSS text, with the selector of its rule (roughly). */
function declarations(css: string, props: RegExp) {
  const out: { prop: string; value: string; at: string }[] = [];
  for (const m of css.matchAll(/([{;]\s*)([\w-]+)\s*:\s*([^;{}]+)/g)) {
    if (!props.test(m[2])) continue;
    const before = css.slice(0, m.index);
    const sel = before.slice(Math.max(before.lastIndexOf("}"), 0)).replace(/[{}]/g, "").trim().slice(0, 60);
    out.push({ prop: m[2], value: m[3].replace(/!important/, "").trim(), at: sel });
  }
  return out;
}

/** @keyframes blocks: name and the properties they set. */
function keyframes(css: string) {
  const out: { name: string; props: string[] }[] = [];
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const start = i;
    while (depth && i < css.length) {
      if (css[i] === "{") depth++;
      if (css[i] === "}") depth--;
      i++;
    }
    const body = css.slice(start, i - 1);
    const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((p) => p[1]).filter((p) => !/^(animation-timing-function)$/.test(p));
    out.push({ name: m[1], props });
  }
  return out;
}

describe("motion rules (docs/design/motion.md §4)", () => {
  it("keyframes animate transform and opacity only", () => {
    const bad = CSS.flatMap((f) =>
      keyframes(f.text).flatMap((k) => k.props.filter((p) => FORBIDDEN.test(p)).map((p) => `${f.path}: @keyframes ${k.name} sets ${p}`)),
    );
    expect(bad).toEqual([]);
  });

  it("CSS transitions never animate a layout property, a shadow or a filter", () => {
    const bad: string[] = [];
    for (const f of CSS) {
      for (const d of declarations(f.text, /^transition(-property)?$/)) {
        for (const part of splitTop(d.value)) {
          const prop = part.split(/\s+/)[0];
          if (d.prop === "transition-property" || !isTime(prop)) {
            if (prop !== "none" && forbiddenInTransition(prop)) bad.push(`${f.path} (${d.at}): transition ${prop}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("Tailwind classes and inline styles never transition a layout property, a shadow or a filter", () => {
    const bad: string[] = [];
    for (const f of CODE.filter((c) => /\.tsx?$/.test(c.path))) {
      for (const m of f.text.matchAll(/(?<![\w-])transition-(all|shadow|\[([^\]]+)\])(?![\w-])/g)) {
        const props = m[2] ? m[2].split(",") : [m[1] === "shadow" ? "box-shadow" : "all"];
        for (const p of props) if (forbiddenInTransition(p.trim())) bad.push(`${f.path}: ${m[0]}`);
      }
      for (const m of f.text.matchAll(/transition\s*:\s*["'`]([^"'`]+)["'`]/g)) {
        for (const part of splitTop(m[1])) {
          const prop = part.split(/\s+/)[0];
          if (forbiddenInTransition(prop)) bad.push(`${f.path}: inline transition ${prop}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("CSS durations stay within 400ms, delay included (loops and one-shot decorations listed)", () => {
    const bad: string[] = [];
    for (const f of CSS.filter((c) => !LOADER_FILES.has(c.path))) {
      for (const d of declarations(f.text, /^(animation|transition|animation-duration|transition-duration)$/)) {
        for (const part of splitTop(d.value)) {
          const tokens = part.split(/\s+(?![^(]*\))/);
          const name = tokens.find((t) => /^[a-z][\w-]*$/i.test(t) && /-/.test(t) && !/^(ease|linear|step|cubic)/.test(t) && !isTime(t));
          if (name && (LOOPS.has(name) || LONG_ONCE.has(name))) continue;
          // Waits, not motion: a hover delay before a 120ms fade (S9); the 300ms anti-flicker wait of the processing card (T11).
          if (d.at.includes(".ip-tooltip") || d.at.includes(".ip-wait-in")) continue;
          const times = tokens.filter(isTime).map(ms);
          if (times.some((t) => t === null)) continue;
          const [dur = 0, delay = 0] = times as number[];
          if (dur + Math.max(0, delay) > CAP * 1000) bad.push(`${f.path} (${d.at}): ${d.prop}: ${part} = ${dur + Math.max(0, delay)}ms`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("staggered and delayed entrances still land by 400ms", () => {
    // Every delay rule belongs to a 200ms entrance (tiles, cards) or the 320ms hero; the hero's are checked here.
    const bad: string[] = [];
    for (const f of CSS) {
      for (const d of declarations(f.text, /^animation-delay$/)) {
        const delay = ms(d.value) ?? 0;
        const dur = d.at.includes("mp-hero") ? DUR.base * 1000 : DUR.quick * 1000;
        if (delay + dur > CAP * 1000) bad.push(`${f.path} (${d.at}): delay ${delay}ms + ${dur}ms`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("only state-carrying loops repeat forever", () => {
    const bad: string[] = [];
    for (const f of CSS.filter((c) => !LOADER_FILES.has(c.path))) {
      for (const d of declarations(f.text, /^(animation|animation-iteration-count)$/)) {
        for (const part of splitTop(d.value)) {
          if (!/\binfinite\b/.test(part)) continue;
          const name = part.split(/\s+/).find((t) => LOOPS.has(t));
          if (!name) bad.push(`${f.path} (${d.at}): ${part}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("the global reduced-motion kill switch covers every CSS animation", () => {
    const globals = stripComments(readFileSync(join(SRC, "app/globals.css"), "utf8"));
    expect(globals).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{\s*animation: none !important;\s*transition: none !important;/,
    );
  });

  it("only lib/motion/engine.ts imports GSAP", () => {
    const bad = CODE.filter((f) => /from\s+["']gsap(\/[\w/]+)?["']|import\(\s*["']gsap/.test(f.text) && f.path !== "lib/motion/engine.ts").map((f) => f.path);
    expect(bad).toEqual([]);
    // And lib/motion's public files never pull it in statically.
    for (const f of ["lib/motion/index.ts", "lib/motion/flow.ts", "lib/motion/state.ts", "lib/motion/load.ts", "lib/motion/react.ts"]) {
      const text = CODE.find((c) => c.path === f)?.text ?? "";
      expect(text, f).not.toMatch(/["']gsap/);
      // A type-only import is erased; a value import would pull the engine into that file's chunk.
      expect(text, f).not.toMatch(/^import\s+(?!type\b)[^\n(]*["']\.\/engine["']/m);
    }
  });

  it("only lib/motion calls element.animate() or runs a requestAnimationFrame loop", () => {
    const outside = CODE.filter((f) => !f.path.startsWith("lib/motion/"));
    expect(outside.filter((f) => /\.animate\(\s*[[{]/.test(f.text)).map((f) => f.path)).toEqual([]);
    // A rAF loop: a function that schedules itself. The drag auto-scroll scrolls (it animates nothing).
    const SCROLL_LOOPS = new Set(["components/page-edit/drag.ts"]);
    const loops = outside.filter((f) => {
      if (SCROLL_LOOPS.has(f.path)) return false;
      return [...f.text.matchAll(/requestAnimationFrame\((\w+)\)/g)].some((m) => {
        const def = f.text.search(new RegExp(`(function\\s+${m[1]}\\s*\\(|(const|let)\\s+${m[1]}\\s*=)`));
        return def >= 0 && def < m.index!;
      });
    });
    expect(loops.map((f) => f.path)).toEqual([]);
  });

  it("lib/motion/tokens.ts matches styles/tokens.css", () => {
    const t = (name: string) => TOKENS.get(name);
    expect(ms(t("--motion-instant")!)).toBe(DUR.instant * 1000);
    expect(ms(t("--motion-micro")!)).toBe(DUR.micro * 1000);
    expect(ms(t("--motion-quick")!)).toBe(DUR.quick * 1000);
    expect(ms(t("--motion-base")!)).toBe(DUR.base * 1000);
    expect(ms(t("--motion-stagger")!)).toBe(Math.round(STAGGER.each * 1000));
    expect(t("--motion-rise")).toBe(`${DIST.rise}px`);
    expect(t("--motion-nudge")).toBe(`${DIST.nudge}px`);
    expect(t("--motion-sheet")).toBe(`${DIST.sheet}px`);
    for (const k of ["out", "in", "move", "pop"] as const) expect(t(`--ease-${k}`), k).toBe(EASE[k].css);
    // The cap holds for the longest preset plus a full stagger.
    expect(DUR.base).toBeLessThanOrEqual(CAP);
    expect(DUR.quick + STAGGER.max).toBeLessThanOrEqual(CAP + 1e-9);
  });
});
