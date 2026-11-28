/**
 * Grayscale (spec F13 §1): a content stream with every colour it sets turned into a grey level.
 * The stream is not rebuilt: only the colour operators (and small inline pictures) are replaced,
 * so text, paths and everything else stay byte for byte what they were.
 */
import { CMYK, components, GRAY, initial, RGB, toGray, type Space } from "./gray-color";

export type ContentEnv = {
  /** The colour space a `cs` operand names: a device name or an entry of the stream's resources. */
  space(name: string): Space | null;
  /** The resource name of `[/Pattern /DeviceGray]`, added to the stream's resources when first asked for; null when it has none to add to. */
  grayPattern(): string | null;
  /** A form, pattern or glyph: until it sets a colour space of its own, it paints in whatever its caller had set. */
  inherits?: boolean;
  /**
   * Dark text is written in pure black instead of its grey: "objects" inside text objects (BT … ET),
   * "all" for a stream that only sets a text colour (a form field's default appearance). Light text
   * (on a dark ground) keeps its grey, or it would vanish.
   */
  blackText?: "objects" | "all";
};

export type ContentResult = { bytes: Uint8Array; changed: boolean; /** Inline pictures that keep their colour (a packed form this tool does not unpack). */ inlineKept: number; /** Colours set in a space that could not be read, or handed down from a caller that cannot be known: they stay as written. */ unknownKept: number };

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
const isWs = (b: number) => WS.has(b);
const isRegular = (b: number) => !WS.has(b) && !DELIM.has(b);

/** A grey level as PDF writes a number: at most four decimals, no trailing zeros. */
export function level(v: number): string {
  const s = (Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000).toFixed(4);
  return s.replace(/\.?0+$/, "") || "0";
}

type Operand = { start: number; num?: number; name?: string };
const enc = new TextEncoder();
const latin = (b: Uint8Array, from: number, to: number) => {
  let s = "";
  for (let i = from; i < to; i++) s += String.fromCharCode(b[i]);
  return s;
};

/** Text at least this dark becomes black; lighter text is light on purpose. */
const DARK_TEXT = 0.6;

const INLINE_SPACES: Record<string, Space> = { RGB, DeviceRGB: RGB, CMYK, DeviceCMYK: CMYK, G: GRAY, DeviceGray: GRAY, CalGray: GRAY };

export function grayContent(src: Uint8Array, env: ContentEnv): ContentResult {
  const patches: { start: number; end: number; bytes: Uint8Array }[] = [];
  const put = (start: number, end: number, text: string) => patches.push({ start, end, bytes: enc.encode(text) });
  let inlineKept = 0;
  let unknownKept = 0;
  let operands: Operand[] = [];
  // The colour spaces in force, saved and restored with the graphics state.
  let fill: Space | null = env.inherits ? null : GRAY;
  let stroke: Space | null = env.inherits ? null : GRAY;
  /** "Paints nothing": the pair of operators is left exactly as written. */
  const isNone = (s: Space | null) => s?.kind === "tint" && s.none === true;
  // Black text: the grey each colour really is (null when it is not a plain grey this code set or read),
  // and whether black stands in for it until the text object ends.
  const black = env.blackText;
  let inText = black === "all";
  let fillReal: number | null = env.inherits ? null : 0;
  let strokeReal: number | null = env.inherits ? null : 0;
  let fillForced = false;
  let strokeForced = false;
  const saved: [Space | null, Space | null, number | null, number | null][] = [];
  /** Writes a grey for fill or stroke in place of [start, end); dark text gets black. */
  const paint = (isFill: boolean, start: number, end: number, v: number, asWritten = false) => {
    const forced = !!black && inText && v > 0 && v <= DARK_TEXT;
    if (isFill) [fillReal, fillForced] = [v, forced];
    else [strokeReal, strokeForced] = [v, forced];
    if (forced) put(start, end, isFill ? "0 g" : "0 G");
    else if (!asWritten) put(start, end, `${level(v)} ${isFill ? "g" : "G"}`);
  };
  /** The colour was set in a way that leaves no plain grey to go back to. */
  const unknown = (isFill: boolean) => {
    if (isFill) [fillReal, fillForced] = [null, false];
    else [strokeReal, strokeForced] = [null, false];
  };
  const n = src.length;
  let i = 0;

  const skipString = () => {
    // "(" … ")" with nesting and backslash escapes.
    let depth = 1;
    i++;
    while (i < n && depth) {
      const b = src[i++];
      if (b === 92) i++;
      else if (b === 40) depth++;
      else if (b === 41) depth--;
    }
  };

  const setColour = (op: string, start: number, end: number) => {
    const isFill = op === "sc" || op === "scn";
    const nums = operands.filter((o) => o.num !== undefined).map((o) => o.num!);
    const last = operands[operands.length - 1];
    let space = isFill ? fill : stroke;
    unknown(isFill);
    if (last?.name !== undefined) {
      // A pattern. A coloured one carries its own colours (converted where it is defined); an
      // uncoloured one is painted in the colour given here.
      if (space?.kind === "pattern" && space.base && nums.length) put(start, end, `${level(toGray(space.base, nums))} /${last.name} ${op}`);
      return;
    }
    if (!nums.length || isNone(space)) return;
    // No `cs` seen in this stream (the space comes from whoever draws this form): the count tells.
    if (!space || space.kind === "pattern" || components(space) !== nums.length) {
      space = nums.length === 3 ? RGB : nums.length === 4 ? CMYK : null;
      if (!space) unknownKept++;
    }
    if (!space) return;
    // Already grey: left as written, unless it is dark text to blacken.
    if (space.kind === "gray") {
      if (nums.length === 1) {
        paint(isFill, start, end, nums[0], true);
        if (isFill ? fillForced : strokeForced) {
          if (isFill) fill = GRAY;
          else stroke = GRAY;
        }
      }
      return;
    }
    paint(isFill, start, end, toGray(space, nums));
  };

  const operator = (op: string, opStart: number, opEnd: number) => {
    const start = operands.length ? operands[0].start : opStart;
    const nums = operands.map((o) => o.num);
    switch (op) {
      case "q":
        saved.push([fill, stroke, fillReal, strokeReal]);
        break;
      case "Q": {
        const s = saved.pop();
        if (s) [fill, stroke, fillReal, strokeReal] = s;
        break;
      }
      case "BT": {
        if (!black) break;
        inText = true;
        // Dark colours set before the text object: black from here to its end.
        fillForced = fillReal !== null && fillReal > 0 && fillReal <= DARK_TEXT;
        strokeForced = strokeReal !== null && strokeReal > 0 && strokeReal <= DARK_TEXT;
        if (fillForced || strokeForced) put(opEnd, opEnd, `${fillForced ? " 0 g" : ""}${strokeForced ? " 0 G" : ""}`);
        break;
      }
      case "ET": {
        if (!black || black === "all") break;
        inText = false;
        // What follows the text is drawn in the colours the file set, not in the text's black.
        if (fillForced || strokeForced) put(opEnd, opEnd, `${fillForced ? ` ${level(fillReal!)} g` : ""}${strokeForced ? ` ${level(strokeReal!)} G` : ""}`);
        fillForced = strokeForced = false;
        break;
      }
      case "g":
      case "G": {
        const v = nums[nums.length - 1];
        if (op === "g") fill = GRAY;
        else stroke = GRAY;
        if (v === undefined) unknown(op === "g");
        else paint(op === "g", operands[operands.length - 1].start, opEnd, v, true);
        break;
      }
      case "rg":
      case "RG":
        if (nums.length >= 3 && nums.slice(-3).every((v) => v !== undefined)) paint(op === "rg", operands[operands.length - 3].start, opEnd, toGray(RGB, nums.slice(-3) as number[]));
        else unknown(op === "rg");
        if (op === "rg") fill = GRAY;
        else stroke = GRAY;
        break;
      case "k":
      case "K":
        if (nums.length >= 4 && nums.slice(-4).every((v) => v !== undefined)) paint(op === "k", operands[operands.length - 4].start, opEnd, toGray(CMYK, nums.slice(-4) as number[]));
        else unknown(op === "k");
        if (op === "k") fill = GRAY;
        else stroke = GRAY;
        break;
      case "cs":
      case "CS": {
        const name = operands[operands.length - 1]?.name;
        const space = name === undefined ? null : env.space(name);
        if (op === "cs") fill = space;
        else stroke = space;
        unknown(op === "cs");
        // A grey space starts at black.
        if (space?.kind === "gray") {
          if (op === "cs") fillReal = 0;
          else strokeReal = 0;
        }
        if (name === undefined || !space || space.kind === "gray" || isNone(space)) break;
        // Choosing a space also sets its first colour (full ink for a spot colour): say that colour in grey.
        if (space.kind !== "pattern") paint(op === "cs", start, opEnd, toGray(space, initial(space)));
        else if (space.base && space.base.kind !== "gray") {
          const gray = env.grayPattern();
          if (gray) put(start, opEnd, `/${gray} ${op}`);
          else if (op === "cs") fill = { kind: "pattern", base: null };
          else stroke = { kind: "pattern", base: null };
        }
        break;
      }
      case "sc":
      case "scn":
      case "SC":
      case "SCN":
        setColour(op, start, opEnd);
        break;
      default:
    }
    operands = [];
  };

  /** `BI … ID data EI`: the picture's own little dictionary and its data, in the stream itself. */
  const inlineImage = (biStart: number) => {
    const dict = new Map<string, string>();
    let key: string | null = null;
    let dataStart = -1;
    while (i < n) {
      while (i < n && isWs(src[i])) i++;
      const s = i;
      if (src[i] === 47) {
        i++;
        while (i < n && isRegular(src[i])) i++;
        const word = latin(src, s + 1, i);
        if (key === null) key = word;
        else {
          dict.set(key, `/${word}`);
          key = null;
        }
      } else if (src[i] === 91 || src[i] === 60 || src[i] === 40) {
        // An array, a dictionary or a string as a value: kept as text.
        if (src[i] === 40) skipString();
        else {
          const close = src[i] === 91 ? 93 : 62;
          while (i < n && src[i] !== close) i++;
          i++;
          if (close === 62 && src[i] === 62) i++;
        }
        if (key !== null) dict.set(key, latin(src, s, i));
        key = null;
      } else {
        while (i < n && isRegular(src[i])) i++;
        if (i === s) i++;
        const word = latin(src, s, i);
        if (word === "ID" && key === null) {
          dataStart = i + 1;
          break;
        }
        if (key !== null) dict.set(key, word);
        key = null;
      }
    }
    if (dataStart < 0) {
      i = n;
      return;
    }
    const get = (a: string, b: string) => dict.get(a) ?? dict.get(b);
    const width = Number(get("W", "Width"));
    const height = Number(get("H", "Height"));
    const bits = Number(get("BPC", "BitsPerComponent") ?? 8);
    const mask = get("IM", "ImageMask") === "true";
    const filter = get("F", "Filter");
    const csName = (get("CS", "ColorSpace") ?? "").replace(/^\//, "");
    const space = mask ? GRAY : (INLINE_SPACES[csName] ?? env.space(csName));
    const comps = space ? components(space) : 0;
    // Unpacked data has a known length; packed data ends at the first "EI" that stands alone.
    let dataEnd = -1;
    if (!filter && width > 0 && height > 0 && (mask || comps)) {
      const len = height * Math.ceil((width * (mask ? 1 : comps * bits)) / 8);
      if (dataStart + len <= n) dataEnd = dataStart + len;
    }
    const standsAlone = (j: number) => src[j] === 69 && src[j + 1] === 73 && (j + 2 >= n || !isRegular(src[j + 2]));
    let eiAt = -1;
    if (dataEnd >= 0) {
      let j = dataEnd;
      while (j < n && isWs(src[j])) j++;
      if (standsAlone(j)) eiAt = j;
      else dataEnd = -1; // the dictionary lied about the size: look for the end instead
    }
    if (eiAt < 0) {
      for (let j = dataStart; j + 1 < n; j++) {
        if (standsAlone(j) && (j === dataStart || isWs(src[j - 1]))) {
          eiAt = j;
          break;
        }
      }
    }
    if (eiAt < 0) {
      i = n;
      return;
    }
    const eiEnd = eiAt + 2;
    i = eiEnd;
    if (mask || space?.kind === "gray") return;
    if (!space || filter || bits !== 8 || dataEnd < 0 || space.kind === "pattern" || space.kind === "lab" || dict.has("D") || dict.has("Decode")) {
      inlineKept++;
      return;
    }
    const grey = new Uint8Array(width * height);
    const c: number[] = new Array<number>(comps);
    for (let p = 0, o = dataStart; p < grey.length; p++) {
      for (let k = 0; k < comps; k++) c[k] = space.kind === "indexed" ? src[o++] : src[o++] / 255;
      grey[p] = Math.round(toGray(space, c) * 255);
    }
    const head = enc.encode(`BI /W ${width} /H ${height} /BPC 8 /CS /G${(dict.get("I") ?? dict.get("Interpolate")) === "true" ? " /I true" : ""} ID\n`);
    const tail = enc.encode("\nEI");
    const bytes = new Uint8Array(head.length + grey.length + tail.length);
    bytes.set(head);
    bytes.set(grey, head.length);
    bytes.set(tail, head.length + grey.length);
    patches.push({ start: biStart, end: eiEnd, bytes });
  };

  while (i < n) {
    const b = src[i];
    if (isWs(b)) {
      i++;
    } else if (b === 37) {
      while (i < n && src[i] !== 10 && src[i] !== 13) i++;
    } else if (b === 40) {
      operands.push({ start: i });
      skipString();
    } else if (b === 60 && src[i + 1] !== 60) {
      operands.push({ start: i });
      while (i < n && src[i] !== 62) i++;
      i++;
    } else if (b === 60 || b === 62 || b === 91 || b === 93 || b === 123 || b === 125) {
      // Array and dictionary brackets: what is inside is an operand of something we leave alone,
      // but a name or number in there must not be taken for a colour, so mark the operand list.
      operands.push({ start: i });
      i += (b === 60 || b === 62) && src[i + 1] === b ? 2 : 1;
    } else if (b === 47) {
      const s = i++;
      while (i < n && isRegular(src[i])) i++;
      operands.push({ start: s, name: latin(src, s + 1, i).replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))) });
    } else if (b === 41) {
      i++;
    } else {
      const s = i;
      while (i < n && isRegular(src[i])) i++;
      const word = latin(src, s, i);
      const first = word.charCodeAt(0);
      if ((first >= 48 && first <= 57) || first === 43 || first === 45 || first === 46) {
        const v = Number(word);
        operands.push({ start: s, num: Number.isFinite(v) ? v : 0 });
      } else if (word === "BI") {
        operands = [];
        inlineImage(s);
      } else if (word === "true" || word === "false" || word === "null") operands.push({ start: s });
      else operator(word, s, i);
    }
  }

  if (!patches.length) return { bytes: src, changed: false, inlineKept, unknownKept };
  patches.sort((a, b) => a.start - b.start);
  let size = n;
  for (const p of patches) size += p.bytes.length - (p.end - p.start);
  const out = new Uint8Array(size);
  let from = 0;
  let to = 0;
  for (const p of patches) {
    if (p.start < from) continue;
    out.set(src.subarray(from, p.start), to);
    to += p.start - from;
    out.set(p.bytes, to);
    to += p.bytes.length;
    from = p.end;
  }
  out.set(src.subarray(from), to);
  to += n - from;
  return { bytes: to === size ? out : out.subarray(0, to), changed: true, inlineKept, unknownKept };
}
