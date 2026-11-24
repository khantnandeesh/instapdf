/**
 * Turns a PDF's embedded font program into a font file a browser will load, so the line-edit
 * box can draw text in the document's own font (F24, the owner's "why show font B at all").
 *
 * A PDF keeps only what a PDF reader needs: a TrueType program usually has its outlines and
 * metrics but no character map, name or OS/2 table, and a CFF program is a bare CFF table with
 * no file around it. Browsers refuse both. This module adds what is missing, from what the
 * engine knows about the font (which glyph draws each character, and how wide it is):
 *
 *   truetype → the same tables, plus cmap, name, OS/2 and post written here
 *   cff      → an OpenType file around the CFF table: head, hhea, hmtx, maxp, cmap, name, OS/2, post
 *
 * Pure functions over bytes; no DOM. Returns null when the program can't be used (not embedded,
 * Type 1 or Type 3, a font collection, damaged tables), and the caller falls back.
 */

export type EmbeddedProgram = {
  bytes: Uint8Array;
  format: "truetype" | "cff" | "none";
  glyphs: { cp: number; gid: number; width: number }[];
};

const MAX_BYTES = 30 * 1024 * 1024;

const tagOf = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

class Writer {
  private parts: number[] = [];
  u8(v: number) {
    this.parts.push(v & 0xff);
    return this;
  }
  u16(v: number) {
    this.parts.push((v >>> 8) & 0xff, v & 0xff);
    return this;
  }
  i16(v: number) {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number) {
    this.parts.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    return this;
  }
  zeros(n: number) {
    for (let i = 0; i < n; i++) this.parts.push(0);
    return this;
  }
  get length() {
    return this.parts.length;
  }
  bytes() {
    return Uint8Array.from(this.parts);
  }
}

/** Tables of a TrueType or OpenType file, or null when the bytes are not one. */
function readTables(bytes: Uint8Array): { flavor: number; tables: Map<string, Uint8Array> } | null {
  if (bytes.length < 12) return null;
  const v = view(bytes);
  const flavor = v.getUint32(0);
  if (flavor !== 0x00010000 && flavor !== 0x74727565 && flavor !== 0x4f54544f) return null;
  const n = v.getUint16(4);
  if (!n || n > 64 || 12 + n * 16 > bytes.length) return null;
  const tables = new Map<string, Uint8Array>();
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    const offset = v.getUint32(o + 8);
    const length = v.getUint32(o + 12);
    if (offset + length > bytes.length) return null;
    tables.set(tagOf(bytes, o), bytes.subarray(offset, offset + length));
  }
  return { flavor, tables };
}

function checksum(data: Uint8Array): number {
  let sum = 0;
  const whole = data.length & ~3;
  for (let i = 0; i < whole; i += 4) sum = (sum + ((data[i]! << 24) | (data[i + 1]! << 16) | (data[i + 2]! << 8) | data[i + 3]!)) >>> 0;
  let last = 0;
  for (let i = whole; i < data.length; i++) last |= data[i]! << (24 - 8 * (i - whole));
  return (sum + last) >>> 0;
}

/** Writes a font file from its tables (sorted by tag, padded, with checksums). */
function writeFile(flavor: number, tables: Map<string, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort();
  const n = tags.length;
  const pow = 2 ** Math.floor(Math.log2(n));
  let offset = 12 + n * 16;
  const total = offset + tags.reduce((s, t) => s + ((tables.get(t)!.length + 3) & ~3), 0);
  const out = new Uint8Array(total);
  const v = view(out);
  v.setUint32(0, flavor);
  v.setUint16(4, n);
  v.setUint16(6, pow * 16);
  v.setUint16(8, Math.log2(pow));
  v.setUint16(10, n * 16 - pow * 16);
  let headAt = -1;
  tags.forEach((tag, i) => {
    let data = tables.get(tag)!;
    if (tag === "head") {
      // The file's own checksum is worked out with this field at zero.
      data = data.slice();
      view(data).setUint32(8, 0);
      headAt = offset;
    }
    const o = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[o + k] = tag.charCodeAt(k);
    v.setUint32(o + 4, checksum(data));
    v.setUint32(o + 8, offset);
    v.setUint32(o + 12, data.length);
    out.set(data, offset);
    offset += (data.length + 3) & ~3;
  });
  if (headAt >= 0) v.setUint32(headAt + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}

/** cmap with a format 4 table (Basic Multilingual Plane) and a format 12 table (everything). */
function cmapTable(map: Map<number, number>): Uint8Array {
  const all = [...map.entries()].filter(([cp, gid]) => cp > 0 && cp <= 0x10ffff && gid > 0 && gid <= 0xffff).sort((a, b) => a[0] - b[0]);
  // Runs of consecutive characters with consecutive glyphs.
  const runs: { start: number; end: number; gid: number }[] = [];
  for (const [cp, gid] of all) {
    const last = runs.at(-1);
    if (last && cp === last.end + 1 && gid === last.gid + (cp - last.start)) last.end = cp;
    else runs.push({ start: cp, end: cp, gid });
  }
  const bmp = runs.flatMap((r) => (r.start > 0xfffe ? [] : [{ start: r.start, end: Math.min(r.end, 0xfffe), gid: r.gid }]));
  const segs = [...bmp, { start: 0xffff, end: 0xffff, gid: 1 }];
  const segCount = segs.length;
  const pow = 2 ** Math.floor(Math.log2(segCount));
  const f4 = new Writer();
  f4.u16(4).u16(16 + segCount * 8).u16(0).u16(segCount * 2).u16(pow * 2).u16(Math.log2(pow)).u16(segCount * 2 - pow * 2);
  for (const s of segs) f4.u16(s.end);
  f4.u16(0);
  for (const s of segs) f4.u16(s.start);
  for (const s of segs) f4.u16((s.gid - s.start) & 0xffff);
  for (let i = 0; i < segCount; i++) f4.u16(0);
  const f12 = new Writer();
  f12.u16(12).u16(0).u32(16 + runs.length * 12).u32(0).u32(runs.length);
  for (const r of runs) f12.u32(r.start).u32(r.end).u32(r.gid);
  const w = new Writer();
  w.u16(0).u16(2);
  w.u16(3).u16(1).u32(20);
  w.u16(3).u16(10).u32(20 + f4.length);
  return Uint8Array.from([...w.bytes(), ...f4.bytes(), ...f12.bytes()]);
}

function nameTable(family: string): Uint8Array {
  const ps = family.replace(/[^A-Za-z0-9-]/g, "") || "Embedded";
  const records: [number, string][] = [
    [1, family],
    [2, "Regular"],
    [3, `${ps};embedded`],
    [4, family],
    [5, "Version 1.0"],
    [6, ps],
  ];
  const strings = new Writer();
  const head = new Writer();
  head.u16(0).u16(records.length).u16(6 + records.length * 12);
  for (const [id, text] of records) {
    head.u16(3).u16(1).u16(0x409).u16(id).u16(text.length * 2).u16(strings.length);
    for (const ch of text) strings.u16(ch.charCodeAt(0));
  }
  return Uint8Array.from([...head.bytes(), ...strings.bytes()]);
}

type Metrics = { unitsPerEm: number; ascent: number; descent: number; xMin: number; yMin: number; xMax: number; yMax: number; avgWidth: number; first: number; last: number };

function os2Table(m: Metrics): Uint8Array {
  const w = new Writer();
  w.u16(3).i16(Math.round(m.avgWidth)).u16(400).u16(5).u16(0);
  // Subscript, superscript and strikeout sizes: plain proportions of the em.
  const em = m.unitsPerEm;
  for (const v of [0.65, 0.6, 0, 0.075, 0.65, 0.6, 0, 0.35, 0.05, 0.25]) w.i16(Math.round(v * em));
  w.i16(0).zeros(10);
  w.u32(1).u32(0).u32(0).u32(0); // Basic Latin
  w.u8(0x20).u8(0x20).u8(0x20).u8(0x20); // vendor "    "
  w.u16(0x40).u16(Math.min(m.first, 0xffff)).u16(Math.min(m.last, 0xffff));
  w.i16(m.ascent).i16(m.descent).i16(0).u16(Math.max(0, m.ascent)).u16(Math.max(0, -m.descent));
  w.u32(1).u32(0);
  w.i16(Math.round(em * 0.5)).i16(Math.round(em * 0.7)).u16(0).u16(32).u16(1);
  return w.bytes();
}

function postTable(): Uint8Array {
  return new Writer().u32(0x00030000).u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0).bytes();
}

/** Number of glyphs in a bare CFF table (the count of its CharStrings INDEX), or 0. */
export function cffGlyphCount(cff: Uint8Array): number {
  try {
    if (cff.length < 4 || cff[0] !== 1) return 0;
    const index = (at: number) => {
      const count = (cff[at]! << 8) | cff[at + 1]!;
      if (!count) return { count, end: at + 2, offsets: [] as number[], base: at + 2 };
      const size = cff[at + 2]!;
      if (size < 1 || size > 4) throw new Error("bad index");
      const offsets: number[] = [];
      for (let i = 0; i <= count; i++) {
        let v = 0;
        for (let k = 0; k < size; k++) v = v * 256 + cff[at + 3 + i * size + k]!;
        offsets.push(v);
      }
      const base = at + 3 + (count + 1) * size - 1;
      const end = base + offsets[count]!;
      if (end > cff.length) throw new Error("index outside the table");
      return { count, end, offsets, base };
    };
    const names = index(cff[2]!);
    const tops = index(names.end);
    if (!tops.count) return 0;
    // Top DICT: operands, then an operator. 17 is CharStrings (an offset from the table's start).
    let i = tops.base + tops.offsets[0]!;
    const stop = tops.base + tops.offsets[1]!;
    const stack: number[] = [];
    while (i < stop) {
      const b = cff[i]!;
      if (b <= 21) {
        if (b === 12) i += 2;
        else {
          if (b === 17 && stack.length) return index(stack.at(-1)!).count;
          i += 1;
        }
        stack.length = 0;
      } else if (b === 28) {
        stack.push(((cff[i + 1]! << 8) | cff[i + 2]!) << 16 >> 16);
        i += 3;
      } else if (b === 29) {
        stack.push((cff[i + 1]! << 24) | (cff[i + 2]! << 16) | (cff[i + 3]! << 8) | cff[i + 4]!);
        i += 5;
      } else if (b === 30) {
        i += 1;
        while (i < stop && (cff[i]! & 0x0f) !== 0x0f && (cff[i]! & 0xf0) !== 0xf0) i += 1;
        i += 1;
        stack.push(0);
      } else if (b >= 32 && b <= 246) {
        stack.push(b - 139);
        i += 1;
      } else if (b >= 247 && b <= 250) {
        stack.push((b - 247) * 256 + cff[i + 1]! + 108);
        i += 2;
      } else if (b >= 251 && b <= 254) {
        stack.push(-(b - 251) * 256 - cff[i + 1]! - 108);
        i += 2;
      } else return 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

function fromTrueType(program: EmbeddedProgram, family: string): Uint8Array | null {
  const file = readTables(program.bytes);
  if (!file) return null;
  const t = file.tables;
  const head = t.get("head");
  const hhea = t.get("hhea");
  const maxp = t.get("maxp");
  const hmtx = t.get("hmtx");
  if (!head || head.length < 54 || !hhea || hhea.length < 36 || !maxp || maxp.length < 6 || !hmtx) return null;
  const outlines = file.flavor === 0x4f54544f ? t.has("CFF ") : t.has("glyf") && t.has("loca");
  if (!outlines) return null;
  const numGlyphs = view(maxp).getUint16(4);
  const map = new Map<number, number>();
  for (const g of program.glyphs) if (g.gid > 0 && g.gid < numGlyphs && !map.has(g.cp)) map.set(g.cp, g.gid);
  if (!map.size) return null;
  const h = view(head);
  const hh = view(hhea);
  const cps = [...map.keys()];
  const widths = program.glyphs.filter((g) => g.width > 0).map((g) => g.width);
  const unitsPerEm = h.getUint16(18) || 1000;
  const metrics: Metrics = {
    unitsPerEm,
    ascent: hh.getInt16(4),
    descent: hh.getInt16(6),
    xMin: h.getInt16(36),
    yMin: h.getInt16(38),
    xMax: h.getInt16(40),
    yMax: h.getInt16(42),
    avgWidth: widths.length ? ((widths.reduce((a, b) => a + b, 0) / widths.length) * unitsPerEm) / 1000 : unitsPerEm / 2,
    first: Math.min(...cps),
    last: Math.max(...cps),
  };
  const out = new Map<string, Uint8Array>();
  // Only the tables a browser needs to draw: no layout or naming data of the original is kept.
  for (const tag of ["head", "hhea", "hmtx", "maxp", "glyf", "loca", "cvt ", "fpgm", "prep", "gasp", "CFF "]) {
    const data = t.get(tag);
    if (data) out.set(tag, data);
  }
  out.set("cmap", cmapTable(map));
  out.set("name", nameTable(family));
  out.set("OS/2", os2Table(metrics));
  out.set("post", postTable());
  return writeFile(file.flavor === 0x4f54544f ? 0x4f54544f : 0x00010000, out);
}

function fromCff(program: EmbeddedProgram, family: string): Uint8Array | null {
  const numGlyphs = cffGlyphCount(program.bytes);
  if (numGlyphs < 2 || numGlyphs > 0xffff) return null;
  const map = new Map<number, number>();
  const advance = new Map<number, number>();
  for (const g of program.glyphs) {
    if (g.gid <= 0 || g.gid >= numGlyphs) continue;
    if (!map.has(g.cp)) map.set(g.cp, g.gid);
    advance.set(g.gid, Math.max(0, Math.min(0xffff, Math.round(g.width))));
  }
  if (!map.size) return null;
  const cps = [...map.keys()];
  const widths = [...advance.values()];
  const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
  // PDF widths are in 1/1000 em, and a CFF font in a PDF is drawn at 1000 units to the em.
  const m: Metrics = { unitsPerEm: 1000, ascent: 800, descent: -200, xMin: -200, yMin: -300, xMax: 1200, yMax: 1000, avgWidth: avg, first: Math.min(...cps), last: Math.max(...cps) };
  const head = new Writer();
  head.u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(m.unitsPerEm);
  head.zeros(16); // created, modified
  head.i16(m.xMin).i16(m.yMin).i16(m.xMax).i16(m.yMax).u16(0).u16(8).i16(2).i16(0).i16(0);
  const hhea = new Writer();
  hhea.u32(0x00010000).i16(m.ascent).i16(m.descent).i16(0).u16(Math.max(...widths, 1000)).i16(m.xMin).i16(m.xMin).i16(m.xMax).i16(1).i16(0).i16(0).zeros(8).i16(0).u16(numGlyphs);
  const hmtx = new Writer();
  for (let gid = 0; gid < numGlyphs; gid++) hmtx.u16(advance.get(gid) ?? Math.round(avg)).i16(0);
  const maxp = new Writer().u32(0x00005000).u16(numGlyphs);
  const out = new Map<string, Uint8Array>([
    ["CFF ", program.bytes],
    ["head", head.bytes()],
    ["hhea", hhea.bytes()],
    ["hmtx", hmtx.bytes()],
    ["maxp", maxp.bytes()],
    ["cmap", cmapTable(map)],
    ["name", nameTable(family)],
    ["OS/2", os2Table(m)],
    ["post", postTable()],
  ]);
  return writeFile(0x4f54544f, out);
}

/**
 * A font file for the browser from a document font's embedded program, or null when it can't be
 * made. `family` only names the file; the caller chooses the CSS family when loading it.
 */
export function webFontFromProgram(program: EmbeddedProgram, family = "Embedded"): Uint8Array | null {
  if (program.format === "none" || !program.bytes.length || program.bytes.length > MAX_BYTES || !program.glyphs.length) return null;
  try {
    return program.format === "cff" ? fromCff(program, family) : fromTrueType(program, family);
  } catch {
    return null;
  }
}

/** The characters a program can draw, for marking what the user typed that it can't. */
export function coveredBy(program: EmbeddedProgram): Set<number> {
  return new Set(program.glyphs.filter((g) => g.gid > 0 || program.format === "none").map((g) => g.cp));
}

/** Ascent and descent of a font file as fractions of the em (both positive), or null. */
export function verticalOf(file: Uint8Array): { ascent: number; descent: number } | null {
  const t = readTables(file)?.tables;
  const head = t?.get("head");
  const hhea = t?.get("hhea");
  if (!head || head.length < 20 || !hhea || hhea.length < 8) return null;
  const upm = view(head).getUint16(18) || 1000;
  return { ascent: view(hhea).getInt16(4) / upm, descent: -view(hhea).getInt16(6) / upm };
}
