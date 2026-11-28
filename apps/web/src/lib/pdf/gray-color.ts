/**
 * Grayscale (spec F13 §1): the colour maths. A colour in any PDF colour space becomes one grey level
 * between 0 (black) and 1 (white): its luminance, the weights a black-and-white print of it has.
 * No PDF library here: the document walk (grayscale.ts) reads the file's objects into these shapes.
 */

/** A PDF function (PDF 32000-1 §7.10), read into plain data. */
export type Fn =
  | { type: 0; domain: number[]; range: number[]; size: number[]; bits: number; encode: number[]; decode: number[]; data: Uint8Array }
  | { type: 2; domain: number[]; range?: number[]; c0: number[]; c1: number[]; n: number }
  | { type: 3; domain: number[]; range?: number[]; fns: Fn[]; bounds: number[]; encode: number[] }
  | { type: 4; domain: number[]; range: number[]; code: PsCode };

export type Space =
  | { kind: "gray" }
  | { kind: "rgb" }
  | { kind: "cmyk" }
  | { kind: "lab"; range: number[] }
  | { kind: "indexed"; base: Space; hival: number; lookup: Uint8Array }
  /** Separation and DeviceN: `fns` turn the tints into a colour of `alt`. */
  | { kind: "tint"; n: number; alt: Space; fns: Fn[]; all?: boolean; none?: boolean }
  /** `base` is set for uncoloured patterns: the pattern is painted in a colour of that space. */
  | { kind: "pattern"; base: Space | null };

export const GRAY: Space = { kind: "gray" };
export const RGB: Space = { kind: "rgb" };
export const CMYK: Space = { kind: "cmyk" };

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : Number.isFinite(v) ? v : lo);

/** How many numbers a colour of this space has (0 for a pattern). */
export function components(space: Space): number {
  switch (space.kind) {
    case "gray":
    case "indexed":
      return 1;
    case "rgb":
    case "lab":
      return 3;
    case "cmyk":
      return 4;
    case "tint":
      return space.n;
    default:
      return 0;
  }
}

export const luminance = (r: number, g: number, b: number) => clamp(0.299 * r + 0.587 * g + 0.114 * b);

/** The grey level of a colour: 0 black, 1 white. */
export function toGray(space: Space, c: readonly number[], depth = 0): number {
  switch (space.kind) {
    case "gray":
      return clamp(c[0] ?? 0);
    case "rgb":
      return luminance(clamp(c[0] ?? 0), clamp(c[1] ?? 0), clamp(c[2] ?? 0));
    case "cmyk": {
      const k = 1 - clamp(c[3] ?? 0);
      return luminance((1 - clamp(c[0] ?? 0)) * k, (1 - clamp(c[1] ?? 0)) * k, (1 - clamp(c[2] ?? 0)) * k);
    }
    case "lab": {
      // L* to relative luminance, then the display curve the other spaces already carry.
      const f = (clamp(c[0] ?? 0, 0, 100) + 16) / 116;
      const y = f > 6 / 29 ? f * f * f : 3 * (6 / 29) ** 2 * (f - 4 / 29);
      return clamp(y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055);
    }
    case "indexed": {
      const n = components(space.base);
      const i = Math.round(clamp(c[0] ?? 0, 0, space.hival));
      const entry: number[] = [];
      for (let k = 0; k < n; k++) entry.push((space.lookup[i * n + k] ?? 0) / 255);
      if (space.base.kind === "lab") {
        const r = space.base.range;
        return toGray(space.base, [entry[0] * 100, r[0] + entry[1] * (r[1] - r[0]), r[2] + entry[2] * (r[3] - r[2])], depth + 1);
      }
      return depth > 4 ? 0 : toGray(space.base, entry, depth + 1);
    }
    case "tint": {
      if (space.none) return 1;
      const out = depth > 4 ? null : evalFns(space.fns, c.slice(0, space.n));
      if (out && out.length >= components(space.alt)) return toGray(space.alt, out, depth + 1);
      // No usable tint function: more ink is darker.
      return 1 - clamp(c.reduce((a, b) => Math.max(a, b), 0));
    }
    default:
      return 0;
  }
}

/** One function with every output, or one function per output: the outputs, or null when it cannot be worked out. */
export function evalFns(fns: readonly Fn[], input: readonly number[]): number[] | null {
  if (!fns.length) return null;
  const out: number[] = [];
  for (const fn of fns) {
    const r = evalFn(fn, input);
    if (!r) return null;
    out.push(...r);
  }
  return out;
}

const interpolate = (x: number, xmin: number, xmax: number, ymin: number, ymax: number) => (xmax === xmin ? ymin : ymin + ((x - xmin) * (ymax - ymin)) / (xmax - xmin));

export function evalFn(fn: Fn, input: readonly number[], depth = 0): number[] | null {
  if (depth > 8) return null;
  const m = fn.domain.length >> 1;
  const x: number[] = [];
  for (let i = 0; i < m; i++) x.push(clamp(input[i] ?? 0, fn.domain[2 * i], fn.domain[2 * i + 1]));
  let out: number[] | null;
  if (fn.type === 2) {
    const t = x[0];
    const p = fn.n === 1 ? t : t <= 0 && fn.n < 0 ? 0 : Math.pow(t, fn.n);
    out = fn.c0.map((a, i) => a + p * ((fn.c1[i] ?? a) - a));
  } else if (fn.type === 3) {
    const t = x[0];
    let k = 0;
    while (k < fn.bounds.length && t >= fn.bounds[k]) k++;
    // The last piece includes the end of the domain.
    k = Math.min(k, fn.fns.length - 1);
    if (k < 0) return null;
    const lo = k === 0 ? fn.domain[0] : fn.bounds[k - 1];
    const hi = k === fn.bounds.length ? fn.domain[1] : fn.bounds[k];
    out = evalFn(fn.fns[k], [interpolate(t, lo, hi, fn.encode[2 * k] ?? 0, fn.encode[2 * k + 1] ?? 1)], depth + 1);
  } else if (fn.type === 0) out = sampled(fn, x);
  else out = runPs(fn.code, x);
  if (!out) return null;
  if (fn.range) for (let i = 0; i < out.length && 2 * i + 1 < fn.range.length; i++) out[i] = clamp(out[i], fn.range[2 * i], fn.range[2 * i + 1]);
  return out.every(Number.isFinite) ? out : null;
}

/** Sampled function: linear between samples for one input, the nearest sample for more. */
function sampled(fn: Extract<Fn, { type: 0 }>, x: readonly number[]): number[] | null {
  const m = fn.size.length;
  const n = fn.range.length >> 1;
  const max = 2 ** fn.bits - 1;
  const at = (index: number[]): number[] | null => {
    let pos = 0;
    let stride = 1;
    for (let i = 0; i < m; i++) {
      pos += index[i] * stride;
      stride *= fn.size[i];
    }
    const out: number[] = [];
    for (let j = 0; j < n; j++) {
      const v = readSample(fn.data, (pos * n + j) * fn.bits, fn.bits);
      if (v === null) return null;
      out.push(interpolate(v, 0, max, fn.decode[2 * j] ?? fn.range[2 * j], fn.decode[2 * j + 1] ?? fn.range[2 * j + 1]));
    }
    return out;
  };
  const e = x.map((v, i) => clamp(interpolate(v, fn.domain[2 * i], fn.domain[2 * i + 1], fn.encode[2 * i] ?? 0, fn.encode[2 * i + 1] ?? fn.size[i] - 1), 0, fn.size[i] - 1));
  if (m !== 1) return at(e.map(Math.round));
  const i0 = Math.floor(e[0]);
  const i1 = Math.min(i0 + 1, fn.size[0] - 1);
  const a = at([i0]);
  const b = at([i1]);
  if (!a || !b) return null;
  const t = e[0] - i0;
  return a.map((v, j) => v + t * (b[j] - v));
}

function readSample(data: Uint8Array, bit: number, bits: number): number | null {
  if (bit + bits > data.length * 8) return null;
  let v = 0;
  for (let i = 0; i < bits; ) {
    const byte = data[(bit + i) >> 3];
    const offset = (bit + i) & 7;
    const take = Math.min(8 - offset, bits - i);
    v = v * 2 ** take + ((byte >> (8 - offset - take)) & ((1 << take) - 1));
    i += take;
  }
  return v;
}

/* ── Type 4: the PostScript calculator ─────────────────────────────────────────────────────────── */

export type PsCode = (number | string | PsCode)[];

/** `{ … }` read into numbers, operator names and nested blocks; null when it is not well formed. */
export function parsePs(text: string): PsCode | null {
  const tokens = text.replace(/%[^\r\n]*/g, " ").match(/[{}]|[^\s{}]+/g) ?? [];
  let i = 0;
  const block = (): PsCode | null => {
    const out: PsCode = [];
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t === "}") return out;
      if (t === "{") {
        const inner = block();
        if (!inner) return null;
        out.push(inner);
      } else {
        const v = Number(t);
        out.push(Number.isFinite(v) && /^[+-]?(\d|\.\d)/.test(t) ? v : t);
      }
    }
    return null;
  };
  if (tokens[i++] !== "{") return null;
  return block();
}

const DEG = Math.PI / 180;
type Val = number | boolean;

export function runPs(code: PsCode, input: readonly number[]): number[] | null {
  const s: Val[] = [...input];
  let steps = 0;
  const num = (): number => {
    const v = s.pop();
    if (typeof v !== "number") throw new Error("type");
    return v;
  };
  const any = (): Val => {
    if (!s.length) throw new Error("underflow");
    return s.pop()!;
  };
  const int = () => Math.trunc(num());
  const run = (block: PsCode) => {
    for (let i = 0; i < block.length; i++) {
      if (++steps > 100_000 || s.length > 100) throw new Error("limit");
      const t = block[i];
      if (typeof t === "number") {
        s.push(t);
        continue;
      }
      if (Array.isArray(t)) {
        // A block is only ever the operand of `if` or `ifelse`.
        const next = block[i + 1];
        const after = block[i + 2];
        if (next === "if") {
          if (any() === true) run(t);
          i += 1;
        } else if (Array.isArray(next) && after === "ifelse") {
          run(any() === true ? t : next);
          i += 2;
        } else throw new Error("block");
        continue;
      }
      switch (t) {
        case "abs": s.push(Math.abs(num())); break;
        case "add": s.push(num() + num()); break;
        case "sub": { const b = num(); s.push(num() - b); break; }
        case "mul": s.push(num() * num()); break;
        case "div": { const b = num(); s.push(num() / b); break; }
        case "idiv": { const b = int(); s.push(Math.trunc(int() / b)); break; }
        case "mod": { const b = int(); s.push(int() % b); break; }
        case "neg": s.push(-num()); break;
        case "ceiling": s.push(Math.ceil(num())); break;
        case "floor": s.push(Math.floor(num())); break;
        case "round": s.push(Math.round(num())); break;
        case "truncate": case "cvi": s.push(Math.trunc(num())); break;
        case "cvr": s.push(num()); break;
        case "sqrt": s.push(Math.sqrt(num())); break;
        case "sin": s.push(Math.sin(num() * DEG)); break;
        case "cos": s.push(Math.cos(num() * DEG)); break;
        case "atan": { const den = num(); const a = Math.atan2(num(), den) / DEG; s.push(a < 0 ? a + 360 : a); break; }
        case "exp": { const e = num(); s.push(Math.pow(num(), e)); break; }
        case "ln": s.push(Math.log(num())); break;
        case "log": s.push(Math.log10(num())); break;
        case "eq": s.push(any() === any()); break;
        case "ne": s.push(any() !== any()); break;
        case "gt": { const b = num(); s.push(num() > b); break; }
        case "ge": { const b = num(); s.push(num() >= b); break; }
        case "lt": { const b = num(); s.push(num() < b); break; }
        case "le": { const b = num(); s.push(num() <= b); break; }
        case "true": s.push(true); break;
        case "false": s.push(false); break;
        case "not": { const a = any(); s.push(typeof a === "boolean" ? !a : ~a); break; }
        case "and": case "or": case "xor": {
          const b = any();
          const a = any();
          if (typeof a === "boolean" && typeof b === "boolean") s.push(t === "and" ? a && b : t === "or" ? a || b : a !== b);
          else if (typeof a === "number" && typeof b === "number") s.push(t === "and" ? a & b : t === "or" ? a | b : a ^ b);
          else throw new Error("type");
          break;
        }
        case "bitshift": { const by = int(); const a = int(); s.push(by >= 0 ? a << by : a >> -by); break; }
        case "pop": any(); break;
        case "dup": { const a = any(); s.push(a, a); break; }
        case "exch": { const b = any(); const a = any(); s.push(b, a); break; }
        case "copy": { const n = int(); if (n < 0 || n > s.length) throw new Error("range"); s.push(...s.slice(s.length - n)); break; }
        case "index": { const n = int(); if (n < 0 || n >= s.length) throw new Error("range"); s.push(s[s.length - 1 - n]); break; }
        case "roll": {
          const j = int();
          const n = int();
          if (n < 0 || n > s.length) throw new Error("range");
          if (n > 0) {
            const top = s.splice(s.length - n, n);
            const by = ((j % n) + n) % n;
            s.push(...top.slice(n - by), ...top.slice(0, n - by));
          }
          break;
        }
        default:
          throw new Error("operator");
      }
    }
  };
  try {
    run(code);
  } catch {
    return null;
  }
  return s.every((v) => typeof v === "number") ? (s as number[]) : null;
}
