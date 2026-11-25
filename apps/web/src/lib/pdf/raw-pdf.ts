/**
 * A small read-only PDF object reader, for the twins on the page (twin-display.ts): it finds an
 * object by number and reads it, and writes objects back as PDF syntax. It exists so the editor
 * does not load pdf-lib (about 240 kB gzip) when a file opens (AC-51, U-E13: pdf-lib loads on
 * Download intent, in the download worker).
 *
 * It reads cross-reference tables and streams (with /Prev, hybrid /XRefStm, PNG predictors) and
 * object streams. When the cross-reference data is missing or points at the wrong place, it
 * scans the file for `N G obj` headers, as readers do. Encryption is not handled: the caller
 * checks `trailer.Encrypt` and leaves such files alone.
 *
 * It runs on the main thread, where nothing can stop a hang or an out-of-memory, so every step is
 * bounded: a hostile file makes it throw (and the page keep its untouched display), never stall.
 * - Decompression stops past MAX_INFLATE bytes of output per stream (an inflate bomb).
 * - `endstream` is found from an index of its places, built once in one pass over the bytes.
 * - Cross-reference streams take /W widths of 0 to 8 bytes and read no more rows than they hold.
 * - All the work a file costs (bytes scanned, inflated, parsed) is charged to a budget
 *   (`RawPdf.load(bytes, budget)`); past it, `BudgetError`.
 */
import { Inflate } from "fflate";

/** Output cap per decompressed stream: xref and object streams are far smaller (a few hundred kB at most). */
const ENDSTREAM = Uint8Array.from("endstream", (c) => c.charCodeAt(0));

export const MAX_INFLATE = 8 * 1024 * 1024;
/** The default work budget, in bytes touched: a few passes over a large file, plus the decoding. */
export const defaultBudget = (fileBytes: number) => 4 * fileBytes + 64 * 1024 * 1024;

/** The work budget ran out: the caller gives up (the untouched display stays). */
export class BudgetError extends Error {}

export type PdfName = { name: string };
export type PdfRef = { num: number; gen: number };
export type PdfString = { str: Uint8Array };
export type PdfDict = { dict: Map<string, PdfObj> };
export type PdfStream = PdfDict & { data: Uint8Array };
export type PdfObj = number | boolean | null | PdfName | PdfRef | PdfString | PdfDict | PdfStream | PdfObj[];

export const isName = (o: PdfObj | undefined, name?: string): o is PdfName => typeof o === "object" && o !== null && "name" in o && (name === undefined || o.name === name);
export const isRef = (o: PdfObj | undefined): o is PdfRef => typeof o === "object" && o !== null && "num" in o && "gen" in o;
export const isDict = (o: PdfObj | undefined): o is PdfDict => typeof o === "object" && o !== null && "dict" in o;
export const isStream = (o: PdfObj | undefined): o is PdfStream => isDict(o) && "data" in o;
export const isNum = (o: PdfObj | undefined): o is number => typeof o === "number";
export const name = (n: string): PdfName => ({ name: n });
export const ref = (num: number, gen = 0): PdfRef => ({ num, gen });

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const latin1 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
};

class ParseError extends Error {}

/** Reads PDF objects from `bytes` starting at `pos`. */
class Lexer {
  /**
   * `charge` is told of every byte the lexer looks at, as it looks (a parse that fails still
   * scanned its bytes, so failing can't be a way round the reader's budget).
   */
  constructor(
    readonly b: Uint8Array,
    public pos = 0,
    readonly charge: (n: number) => void = () => {},
  ) {}

  skip(): void {
    const b = this.b;
    const from = this.pos;
    while (this.pos < b.length) {
      const c = b[this.pos]!;
      if (WS.has(c)) this.pos++;
      else if (c === 0x25) while (this.pos < b.length && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
      else break;
    }
    this.charge(this.pos - from);
  }

  /** A run of regular characters (a number or a keyword), without moving past it when `peek`. */
  word(peek = false): string {
    this.skip();
    let end = this.pos;
    while (end < this.b.length && !WS.has(this.b[end]!) && !DELIM.has(this.b[end]!)) end++;
    this.charge(end - this.pos + 1);
    const w = latin1(this.b.subarray(this.pos, end));
    if (!peek) this.pos = end;
    return w;
  }

  /** An integer at the current position, or null (the position is kept). */
  int(): number | null {
    const at = this.pos;
    const w = this.word();
    if (/^\d+$/.test(w)) return Number(w);
    this.pos = at;
    return null;
  }

  object(depth = 0): PdfObj {
    if (depth > 64) throw new ParseError("too deep");
    this.skip();
    const b = this.b;
    if (this.pos >= b.length) throw new ParseError("end of data");
    const c = b[this.pos]!;
    if (c === 0x2f) return this.nameToken();
    if (c === 0x28) return this.literal();
    if (c === 0x3c) {
      if (b[this.pos + 1] === 0x3c) return this.dict(depth);
      return this.hex();
    }
    if (c === 0x5b) {
      this.pos++;
      const out: PdfObj[] = [];
      for (;;) {
        this.skip();
        if (this.pos >= b.length) throw new ParseError("open array");
        if (b[this.pos] === 0x5d) {
          this.pos++;
          return out;
        }
        out.push(this.object(depth + 1));
      }
    }
    const w = this.word();
    if (w === "true") return true;
    if (w === "false") return false;
    if (w === "null") return null;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) {
      // `N G R`: a reference.
      if (/^\d+$/.test(w)) {
        const at = this.pos;
        const gen = this.int();
        if (gen !== null && this.word(true) === "R") {
          this.word();
          return ref(Number(w), gen);
        }
        this.pos = at;
      }
      return Number(w);
    }
    throw new ParseError(`unexpected "${w.slice(0, 20)}"`);
  }

  private nameToken(): PdfName {
    this.pos++;
    let end = this.pos;
    while (end < this.b.length && !WS.has(this.b[end]!) && !DELIM.has(this.b[end]!)) end++;
    this.charge(end - this.pos + 1);
    const raw = latin1(this.b.subarray(this.pos, end));
    this.pos = end;
    return name(raw.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))));
  }

  private literal(): PdfString {
    const b = this.b;
    const out: number[] = [];
    const from = this.pos++;
    try {
      return this.literalBody(b, out);
    } finally {
      this.charge(this.pos - from);
    }
  }

  private literalBody(b: Uint8Array, out: number[]): PdfString {
    let depth = 0;
    while (this.pos < b.length) {
      const c = b[this.pos++]!;
      if (c === 0x5c) {
        const e = b[this.pos++];
        if (e === undefined) break;
        const map: Record<number, number> = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12 };
        if (e in map) out.push(map[e]!);
        else if (e >= 0x30 && e <= 0x37) {
          let v = e - 0x30;
          for (let k = 0; k < 2 && b[this.pos]! >= 0x30 && b[this.pos]! <= 0x37; k++) v = v * 8 + (b[this.pos++]! - 0x30);
          out.push(v & 0xff);
        } else if (e === 13) {
          if (b[this.pos] === 10) this.pos++;
        } else if (e !== 10) out.push(e);
        continue;
      }
      if (c === 0x28) depth++;
      if (c === 0x29 && depth-- === 0) return { str: Uint8Array.from(out) };
      out.push(c);
    }
    throw new ParseError("open string");
  }

  private hex(): PdfString {
    const end = this.b.indexOf(0x3e, this.pos);
    // The search looked at every byte up to the `>`, or to the end when there is none.
    this.charge((end < 0 ? this.b.length : end + 1) - this.pos);
    if (end < 0) throw new ParseError("open hex string");
    const digits = latin1(this.b.subarray(this.pos + 1, end)).replace(/[^0-9a-fA-F]/g, "");
    this.pos = end + 1;
    const padded = digits.length % 2 ? `${digits}0` : digits;
    return { str: Uint8Array.from(padded.match(/../g) ?? [], (h) => parseInt(h, 16)) };
  }

  private dict(depth: number): PdfDict {
    this.pos += 2;
    const dict = new Map<string, PdfObj>();
    for (;;) {
      this.skip();
      if (this.pos >= this.b.length) throw new ParseError("open dictionary");
      if (this.b[this.pos] === 0x3e && this.b[this.pos + 1] === 0x3e) {
        this.pos += 2;
        return { dict };
      }
      const key = this.object(depth + 1);
      if (!isName(key)) throw new ParseError("dictionary key is not a name");
      dict.set(key.name, this.object(depth + 1));
    }
  }
}

/**
 * Raw deflate data inflated, at most `cap` bytes of output (else throws). Fed in small slices,
 * so no single step can make much more than a slice's worth of output (deflate expands at most
 * about 1032 times).
 */
export function inflateCapped(data: Uint8Array, cap: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > cap) throw new ParseError("stream inflates past the cap");
    parts.push(chunk);
  });
  const SLICE = 1024;
  for (let i = 0; i < data.length; i += SLICE) inf.push(data.subarray(i, i + SLICE), i + SLICE >= data.length);
  if (!data.length) inf.push(new Uint8Array(0), true);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** PNG predictors (10 to 15) on decoded rows of `columns` bytes. */
function unpredict(data: Uint8Array, columns: number): Uint8Array {
  const row = columns + 1;
  const rows = Math.floor(data.length / row);
  const out = new Uint8Array(rows * columns);
  for (let r = 0; r < rows; r++) {
    const type = data[r * row]!;
    for (let i = 0; i < columns; i++) {
      const raw = data[r * row + 1 + i]!;
      const left = i > 0 ? out[r * columns + i - 1]! : 0;
      const up = r > 0 ? out[(r - 1) * columns + i]! : 0;
      const ul = r > 0 && i > 0 ? out[(r - 1) * columns + i - 1]! : 0;
      let v = raw;
      if (type === 1) v = raw + left;
      else if (type === 2) v = raw + up;
      else if (type === 3) v = raw + ((left + up) >> 1);
      else if (type === 4) {
        const p = left + up - ul;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - ul)];
        v = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul);
      }
      out[r * columns + i] = v & 0xff;
    }
  }
  return out;
}

type Entry = { type: "free" } | { type: "at"; offset: number } | { type: "in"; stream: number; index: number };

/** An opened file: its trailer and a way to read any object in it. */
export class RawPdf {
  readonly trailer: Map<string, PdfObj>;
  /** The highest object number the file uses. */
  readonly largestObjectNumber: number;
  private readonly entries = new Map<number, Entry>();
  private scanned: Map<number, number> | null = null;
  private readonly cache = new Map<number, PdfObj | undefined>();
  private readonly streams = new Map<number, { first: number; offsets: number[]; data: Uint8Array } | null>();
  private textCache: string | null = null;
  private endstreams: number[] | null = null;
  private left: number;

  private constructor(
    readonly bytes: Uint8Array,
    budget: number,
  ) {
    this.left = budget;
    let trailer: Map<string, PdfObj> | null = null;
    try {
      trailer = this.readXref();
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      trailer = null;
    }
    if (!trailer || !isRef(trailer.get("Root"))) {
      this.entries.clear();
      trailer = this.scanTrailer();
    }
    this.trailer = trailer;
    let largest = isNum(trailer.get("Size")) ? (trailer.get("Size") as number) - 1 : 0;
    for (const n of this.entries.keys()) largest = Math.max(largest, n);
    if (this.scanned) for (const n of this.scanned.keys()) largest = Math.max(largest, n);
    this.largestObjectNumber = largest;
  }

  /** Opens a file; throws when it has no readable trailer, or `BudgetError` when it costs more than `budget` bytes of work. */
  static load(bytes: Uint8Array, budget = defaultBudget(bytes.length)): RawPdf {
    return new RawPdf(bytes, budget);
  }

  /** `work`, for a Lexer to call. */
  private readonly charge = (n: number) => this.work(n);

  /** Charges `n` bytes of work to the budget. */
  private work(n: number) {
    this.left -= n;
    if (this.left < 0) throw new BudgetError("PDF read budget exceeded");
  }

  /** The whole file as a string (one character per byte), made once. */
  private text(): string {
    if (this.textCache === null) {
      this.work(this.bytes.length);
      this.textCache = latin1(this.bytes);
    }
    return this.textCache;
  }

  /** Whether `endstream` starts within 32 bytes after `at`. */
  private endstreamNear(at: number): boolean {
    const window = this.bytes.subarray(at, at + 32 + ENDSTREAM.length);
    this.work(window.length);
    for (let i = 0; i + ENDSTREAM.length <= window.length; i++) {
      let k = 0;
      while (k < ENDSTREAM.length && window[i + k] === ENDSTREAM[k]) k++;
      if (k === ENDSTREAM.length) return true;
    }
    return false;
  }

  /** Whether the whole-file `endstream` index was built (tests: a clean file never needs it). */
  get builtEndstreamIndex(): boolean {
    return this.endstreams !== null;
  }

  /** The first `endstream` at or after `from` (-1: none), from an index of every one, built in one pass. */
  private endstreamFrom(from: number): number {
    if (!this.endstreams) {
      const at: number[] = [];
      const text = this.text();
      for (let i = text.indexOf("endstream"); i >= 0; i = text.indexOf("endstream", i + 9)) at.push(i);
      this.endstreams = at;
    }
    const list = this.endstreams;
    let [lo, hi] = [0, list.length];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid]! < from) lo = mid + 1;
      else hi = mid;
    }
    return lo < list.length ? list[lo]! : -1;
  }

  /** The object `num`, or undefined when the file has none. */
  get(num: number): PdfObj | undefined {
    if (this.cache.has(num)) return this.cache.get(num);
    this.cache.set(num, undefined); // a loop through references reads as missing
    let obj: PdfObj | undefined;
    try {
      obj = this.read(num);
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      obj = undefined;
    }
    this.cache.set(num, obj);
    return obj;
  }

  /** `o` itself, or the object it refers to. */
  resolve(o: PdfObj | undefined): PdfObj | undefined {
    return isRef(o) ? this.get(o.num) : o;
  }

  /** A dictionary's value, with a reference followed. */
  lookup(d: PdfDict, key: string): PdfObj | undefined {
    return this.resolve(d.dict.get(key));
  }

  private read(num: number): PdfObj | undefined {
    const entry = this.entries.get(num);
    if (entry?.type === "free") return undefined;
    if (entry?.type === "in") {
      const s = this.objectStream(entry.stream);
      if (!s) return undefined;
      const at = s.offsets[entry.index * 2 + 1];
      if (s.offsets[entry.index * 2] !== num || at === undefined || s.first + at >= s.data.length) return undefined;
      return new Lexer(s.data, s.first + at, this.charge).object();
    }
    if (entry?.type === "at") {
      const obj = this.objectAt(entry.offset, num);
      if (obj !== undefined) return obj;
    }
    const at = this.scan().get(num);
    return at === undefined ? undefined : this.objectAt(at, num);
  }

  /** The object whose `N G obj` header starts at `offset`; undefined when it is not `num`'s. */
  private objectAt(offset: number, num: number | null): PdfObj | undefined {
    const lx = new Lexer(this.bytes, offset, this.charge);
    const n = lx.int();
    const gen = lx.int();
    if (n === null || gen === null || (num !== null && n !== num) || lx.word() !== "obj") return undefined;
    const obj = lx.object();
    if (!isDict(obj) || lx.word(true) !== "stream") return obj;
    lx.word();
    // The data starts after the end of the `stream` line.
    if (this.bytes[lx.pos] === 13) lx.pos++;
    if (this.bytes[lx.pos] === 10) lx.pos++;
    const start = lx.pos;
    const declared = obj.dict.get("Length");
    const length = isNum(declared) ? declared : isRef(declared) ? this.get(declared.num) : undefined;
    const valid = typeof length === "number" && Number.isInteger(length) && length >= 0 && start + length <= this.bytes.length;
    let end = valid ? start + length : -1;
    // The declared length is right when `endstream` follows it (after an end of line).
    // Looked for in the few bytes after it: the whole-file index is only for the fallback.
    if (end < 0 || !this.endstreamNear(end)) {
      const at = this.endstreamFrom(start);
      if (at < 0) throw new ParseError("open stream");
      end = at;
      while (end > start && (this.bytes[end - 1] === 10 || this.bytes[end - 1] === 13)) end--;
    }
    return { dict: obj.dict, data: this.bytes.subarray(start, end) };
  }

  /** A stream's data with its filters undone (Flate with PNG predictors, or none). */
  decode(s: PdfStream): Uint8Array {
    const filter = this.resolve(s.dict.get("Filter"));
    const filters = Array.isArray(filter) ? filter.map((f) => this.resolve(f)) : filter === undefined || filter === null ? [] : [filter];
    if (!filters.length) return s.data;
    if (filters.length !== 1 || !isName(filters[0]!, "FlateDecode")) throw new ParseError("unsupported filter");
    // The zlib header is skipped and the checksum not required, so a file with a damaged ending still reads.
    let data = inflateCapped(s.data.subarray(2), MAX_INFLATE);
    this.work(s.data.length + data.length);
    const parms = this.resolve(Array.isArray(s.dict.get("DecodeParms")) ? (s.dict.get("DecodeParms") as PdfObj[])[0] : s.dict.get("DecodeParms"));
    if (isDict(parms)) {
      const predictor = this.lookup(parms, "Predictor");
      if (isNum(predictor) && predictor >= 10) {
        const columns = this.lookup(parms, "Columns") ?? 1;
        if (!isNum(columns) || !Number.isInteger(columns) || columns < 1 || columns > 65536) throw new ParseError("bad /Columns");
        data = unpredict(data, columns);
      } else if (isNum(predictor) && predictor > 1) throw new ParseError("unsupported predictor");
    }
    return data;
  }

  private objectStream(num: number) {
    if (this.streams.has(num)) return this.streams.get(num)!;
    let out: { first: number; offsets: number[]; data: Uint8Array } | null = null;
    try {
      const s = this.get(num);
      if (isStream(s)) {
        const data = this.decode(s);
        const [n, first] = [this.lookup(s, "N"), this.lookup(s, "First")];
        if (isNum(n) && isNum(first) && Number.isInteger(n) && Number.isInteger(first) && n >= 0 && first >= 0 && first < data.length) {
          const lx = new Lexer(data, 0, this.charge);
          const offsets: number[] = [];
          for (let i = 0; i < Math.min(n * 2, data.length); i++) {
            const v = lx.int();
            if (v === null) break;
            offsets.push(v);
          }
          out = { first, offsets, data };
        }
      }
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      out = null;
    }
    this.streams.set(num, out);
    return out;
  }

  private set(num: number, entry: Entry) {
    // Newer sections are read first: they win.
    if (!this.entries.has(num)) this.entries.set(num, entry);
  }

  /** Reads the cross-reference sections from the last one back; returns the newest trailer. */
  private readXref(): Map<string, PdfObj> | null {
    const tail = latin1(this.bytes.subarray(Math.max(0, this.bytes.length - 2048)));
    const m = /startxref\s+(\d+)/.exec(tail.slice(tail.lastIndexOf("startxref")));
    if (!m) return null;
    let trailer: Map<string, PdfObj> | null = null;
    const seen = new Set<number>();
    const queue = [Number(m[1])];
    while (queue.length) {
      const at = queue.shift()!;
      if (seen.has(at) || at < 0 || at >= this.bytes.length || seen.size > 256) continue;
      seen.add(at);
      const lx = new Lexer(this.bytes, at, this.charge);
      let section: Map<string, PdfObj>;
      if (lx.word(true) === "xref") {
        lx.word();
        section = this.readTable(lx);
        const stm = section.get("XRefStm");
        // Hybrid files: the stream's entries rank right after this table's.
        if (isNum(stm)) queue.unshift(stm);
      } else {
        const s = this.objectAt(at, null);
        if (!isStream(s)) throw new ParseError("no cross-reference here");
        section = s.dict;
        this.readStream(s);
      }
      trailer ??= section;
      const prev = section.get("Prev");
      if (isNum(prev)) queue.push(prev);
    }
    return trailer;
  }

  private readTable(lx: Lexer): Map<string, PdfObj> {
    for (;;) {
      if (lx.word(true) === "trailer") {
        lx.word();
        const t = lx.object();
        if (!isDict(t)) throw new ParseError("bad trailer");
        return t.dict;
      }
      const start = lx.int();
      const count = lx.int();
      if (start === null || count === null) throw new ParseError("bad xref table");
      for (let i = 0; i < count; i++) {
        const offset = lx.int();
        const gen = lx.int();
        const kind = lx.word();
        if (offset === null || gen === null || (kind !== "n" && kind !== "f")) throw new ParseError("bad xref row");
        if (start + i === 0) continue;
        this.set(start + i, kind === "n" ? { type: "at", offset } : { type: "free" });
      }
    }
  }

  private readStream(s: PdfStream) {
    const w = this.resolve(s.dict.get("W"));
    // Each field is 0 to 8 bytes (a JavaScript number holds 6 exactly; more is no real file), and a row has at least one.
    if (!Array.isArray(w) || w.length < 3 || !w.slice(0, 3).every((x) => isNum(x) && Number.isInteger(x) && x >= 0 && x <= 8)) throw new ParseError("bad /W");
    const widths = w as number[];
    const rowLength = widths[0]! + widths[1]! + widths[2]!;
    if (rowLength < 1) throw new ParseError("bad /W");
    const size = this.resolve(s.dict.get("Size"));
    const index = this.resolve(s.dict.get("Index"));
    const ranges = Array.isArray(index) && index.every((x) => isNum(x) && Number.isInteger(x) && x >= 0) ? (index as number[]) : [0, isNum(size) && Number.isInteger(size) && size >= 0 ? size : 0];
    const data = this.decode(s);
    // No more rows than the data holds, whatever /Size or /Index say.
    let rows = Math.floor(data.length / rowLength);
    let at = 0;
    const field = (width: number, fallback: number) => {
      if (!width) return fallback;
      let v = 0;
      for (let k = 0; k < width; k++) v = v * 256 + data[at++]!;
      return v;
    };
    for (let r = 0; r + 1 < ranges.length; r += 2) {
      for (let i = 0; i < ranges[r + 1]!; i++) {
        if (rows-- <= 0) return;
        const num = ranges[r]! + i;
        const type = field(widths[0]!, 1);
        const a = field(widths[1]!, 0);
        const b = field(widths[2]!, 0);
        if (num === 0) continue;
        if (type === 0) this.set(num, { type: "free" });
        else if (type === 1) this.set(num, { type: "at", offset: a });
        else if (type === 2) this.set(num, { type: "in", stream: a, index: b });
      }
    }
  }

  /** Where each `N G obj` header is, by a scan of the whole file (the last one of a number wins). */
  private scan(): Map<number, number> {
    if (this.scanned) return this.scanned;
    const found = new Map<number, number>();
    const text = this.text();
    this.work(this.bytes.length);
    for (const m of text.matchAll(/(?:^|[\s>\]])(\d{1,10})[ \t\r\n\f\0]+(\d{1,5})[ \t\r\n\f\0]+obj\b/g)) found.set(Number(m[1]), m.index + m[0].indexOf(m[1]!));
    this.scanned = found;
    return found;
  }

  /** For a file whose cross-reference data can't be read: the newest trailer, or the newest xref stream's dictionary. */
  private scanTrailer(): Map<string, PdfObj> {
    const text = this.text();
    // From the last `trailer` back to the first (at 0 there is none before it: stop).
    for (let at = text.lastIndexOf("trailer"); at >= 0; at = at === 0 ? -1 : text.lastIndexOf("trailer", at - 1)) {
      try {
        const t = new Lexer(this.bytes, at + "trailer".length, this.charge).object();
        if (isDict(t) && isRef(t.dict.get("Root"))) return t.dict;
      } catch (e) {
        if (e instanceof BudgetError) throw e;
        // an earlier one, then
      }
    }
    const byOffset = [...this.scan().entries()].sort((a, b) => b[1] - a[1]);
    for (const [num, at] of byOffset) {
      try {
        const o = this.objectAt(at, num);
        if (isDict(o) && isName(o.dict.get("Type"), "XRef") && isRef(o.dict.get("Root"))) return o.dict;
        if (isDict(o) && isName(o.dict.get("Type"), "Catalog")) return new Map<string, PdfObj>([["Root", ref(num)]]);
      } catch (e) {
        if (e instanceof BudgetError) throw e;
        // keep looking
      }
    }
    throw new ParseError("no trailer");
  }
}

const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const NAME_PLAIN = /^[\x21-\x7e]$/;

/** A number as PDF writes it: never an exponent (1e+21, 1e-7), at most 6 decimals. */
export function num(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // Whole numbers of any size (String(1e21) is "1e+21"; a BigInt prints every digit).
  if (Number.isInteger(n)) return BigInt(n).toString();
  const out = n.toFixed(6).replace(/\.?0+$/, "");
  return out === "-0" ? "0" : out;
}

/** `o` as PDF syntax. A stream is written as its dictionary only (the caller writes the data). */
export function serialize(o: PdfObj): string {
  if (o === null) return "null";
  if (typeof o === "boolean") return String(o);
  if (typeof o === "number") return num(o);
  if (Array.isArray(o)) return `[${o.map(serialize).join(" ")}]`;
  if ("name" in o)
    return `/${Array.from(o.name, (c) => (NAME_PLAIN.test(c) && !DELIM.has(c.charCodeAt(0)) && c !== "#" ? c : `#${(c.charCodeAt(0) & 0xff).toString(16).padStart(2, "0")}`)).join("")}`;
  if ("num" in o) return `${o.num} ${o.gen} R`;
  if ("str" in o) return `<${hexOf(o.str)}>`;
  return `<<${[...o.dict].map(([k, v]) => ` ${serialize(name(k))} ${serialize(v)}`).join("")} >>`;
}
