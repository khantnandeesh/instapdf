/**
 * Hidden text (spec F15 §2): what an earlier OCR laid over a scan, text drawn in render mode 3
 * (neither filled nor stroked). `stripHiddenText` takes it out of one content stream and says what
 * else the stream does, so the caller can drop a form that held nothing but hidden text. Pure: no
 * PDF library. Text that shows is never touched.
 */

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
const PAINTS = new Set(["S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "sh", "EI"]);
const SHOWS = new Set(["Tj", "TJ", "'", '"']);
const enc = new TextEncoder();

export type HiddenTextResult = {
  /** The stream without its hidden text; the input itself when nothing was hidden. */
  bytes: Uint8Array;
  /** Text-showing operators taken out. */
  removed: number;
  /** Whether anything that shows is drawn here (paths, pictures, shading, text that shows). Forms drawn with Do are listed apart. */
  paints: boolean;
  /** Each `/Name Do`, with where it stands in the input, for the caller to judge and cut. */
  draws: { name: string; start: number; end: number }[];
};

/** Cuts `ranges` (sorted or not, not overlapping) out of `src`, putting each range's `text` in its place. */
export function cut(src: Uint8Array, ranges: readonly { start: number; end: number; text?: string }[]): Uint8Array {
  if (!ranges.length) return src;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const parts: Uint8Array[] = [];
  let at = 0;
  for (const r of sorted) {
    parts.push(src.subarray(at, r.start));
    if (r.text) parts.push(enc.encode(r.text));
    at = r.end;
  }
  parts.push(src.subarray(at));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * `solid` names the fonts whose glyphs show whatever the render mode (Type 3): text set in one of them
 * is never taken for hidden. Hidden text is cut a whole text object (BT to ET) at a time, and only when
 * nothing in that object shows: text that shows may stand where it does because of the hidden text
 * before it, so an object that mixes the two is left exactly as written.
 */
export function stripHiddenText(src: Uint8Array, solid?: ReadonlySet<string>): HiddenTextResult {
  type Cut = { start: number; end: number; text?: string };
  const cuts: Cut[] = [];
  const draws: HiddenTextResult["draws"] = [];
  let paints = false;
  // The text render mode and the font are part of the graphics state: saved and restored with it.
  let mode = 0;
  let font = "";
  const saved: { mode: number; font: string }[] = [];
  // The text object being read: its hidden text, held until its ET shows nothing else was in it.
  let inText = false;
  let pending: Cut[] = [];
  let shows = false;
  // The operands of the operator being read.
  let ops: { start: number; text: string }[] = [];
  const n = src.length;
  let i = 0;
  const operand = (start: number, text: string) => ops.push({ start, text });
  const text = (from: number, to: number) => String.fromCharCode(...src.subarray(from, Math.min(to, from + 64)));
  const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;
  while (i < n) {
    const b = src[i];
    if (WS.has(b)) {
      i++;
    } else if (b === 37) {
      // A comment runs to the end of its line.
      while (i < n && src[i] !== 10 && src[i] !== 13) i++;
    } else if (b === 40) {
      // A string: brackets nest, a backslash takes the next byte with it.
      const start = i;
      let depth = 0;
      do {
        if (src[i] === 92) i++;
        else if (src[i] === 40) depth++;
        else if (src[i] === 41) depth--;
        i++;
      } while (i < n && depth > 0);
      operand(start, "");
    } else if (b === 60 && src[i + 1] !== 60) {
      const start = i;
      while (i < n && src[i] !== 62) i++;
      i++;
      operand(start, "");
    } else if ((b === 60 && src[i + 1] === 60) || (b === 62 && src[i + 1] === 62)) {
      operand(i, "");
      i += 2;
    } else if (b === 91 || b === 93 || b === 123 || b === 125 || b === 62 || b === 41) {
      operand(i, "");
      i++;
    } else if (b === 47) {
      const start = i++;
      while (i < n && !WS.has(src[i]) && !DELIM.has(src[i])) i++;
      operand(start, text(start + 1, i));
    } else {
      const start = i;
      while (i < n && !WS.has(src[i]) && !DELIM.has(src[i])) i++;
      const word = text(start, i);
      if (NUMBER.test(word) || word === "true" || word === "false" || word === "null") {
        operand(start, word);
        continue;
      }
      // An operator.
      const last = ops.at(-1)?.text ?? "";
      const from = ops[0]?.start ?? start;
      if (word === "q") saved.push({ mode, font });
      else if (word === "Q") ({ mode, font } = saved.pop() ?? { mode, font });
      else if (word === "Tr") mode = Number(last) || 0;
      else if (word === "Tf") font = ops.at(-2)?.text ?? "";
      else if (word === "BT") {
        inText = true;
        pending = [];
        shows = false;
      } else if (word === "ET") {
        if (!shows) cuts.push(...pending);
        inText = false;
        pending = [];
      } else if (SHOWS.has(word)) {
        // A font not named in this stream comes from whoever draws it: hidden only when no font here always shows.
        const hidden = mode === 3 && inText && !(solid?.size && (font === "" || solid.has(font)));
        // ' starts a new line and " also sets the word and letter spacing, which later text may count on.
        const spacing = word === '"' && ops.length === 3 && NUMBER.test(ops[0].text) && NUMBER.test(ops[1].text) ? ` ${ops[0].text} Tw ${ops[1].text} Tc T* ` : null;
        if (hidden && (word !== '"' || spacing)) pending.push({ start: from, end: i, text: word === "'" ? " T* " : (spacing ?? undefined) });
        else paints = shows = true;
      } else if (word === "Do") draws.push({ name: last, start: from, end: i });
      else if (word === "BI") {
        // An inline picture: its data runs from ID to an EI that stands alone.
        paints = true;
        while (i < n && !(src[i] === 73 && src[i + 1] === 68 && WS.has(src[i + 2]) && WS.has(src[i - 1]))) i++;
        i += 2;
        while (i < n && !(src[i] === 69 && src[i + 1] === 73 && WS.has(src[i - 1]) && (i + 2 >= n || WS.has(src[i + 2]) || DELIM.has(src[i + 2])))) i++;
        i += 2;
      } else if (PAINTS.has(word)) paints = true;
      ops = [];
    }
  }
  return { bytes: cut(src, cuts), removed: cuts.length, paints, draws };
}
