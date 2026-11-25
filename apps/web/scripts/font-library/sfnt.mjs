/**
 * The little font-file reading the library build needs: unpack WOFF 1.0 to the TrueType or
 * OpenType file inside it, and read vertical metrics. Pure functions over bytes.
 */
import { inflateSync } from "node:zlib";

const u16 = (b, o) => b.readUInt16BE(o);
const u32 = (b, o) => b.readUInt32BE(o);

/** True for a TrueType or OpenType file (not a collection). */
export function isSfnt(bytes) {
  if (bytes.length < 12) return false;
  const tag = u32(bytes, 0);
  return tag === 0x00010000 || tag === 0x4f54544f || tag === 0x74727565;
}

/**
 * Unpacks a WOFF 1.0 file. Returns the font file inside, or null when the bytes are not a
 * well-formed WOFF (bad signature, tables outside the file, sizes that do not add up).
 */
export function woffToSfnt(woff) {
  if (woff.length < 44 || woff.toString("latin1", 0, 4) !== "wOFF") return null;
  const numTables = u16(woff, 12);
  const total = u32(woff, 16);
  if (!numTables || 44 + numTables * 20 > woff.length || total > 64 * 1024 * 1024) return null;
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const [offset, compLength, origLength] = [u32(woff, o + 4), u32(woff, o + 8), u32(woff, o + 12)];
    if (offset + compLength > woff.length || compLength > origLength) return null;
    let data = woff.subarray(offset, offset + compLength);
    if (compLength < origLength) {
      try {
        data = inflateSync(data, { maxOutputLength: origLength });
      } catch {
        return null;
      }
    }
    if (data.length !== origLength) return null;
    tables.push({ tag: woff.subarray(o, o + 4), checksum: u32(woff, o + 16), data });
  }
  const pow = 2 ** Math.floor(Math.log2(numTables));
  let offset = 12 + numTables * 16;
  const size = tables.reduce((n, t) => n + ((t.data.length + 3) & ~3), offset);
  if (size > total + numTables * 4) return null;
  const out = Buffer.alloc(size);
  out.writeUInt32BE(u32(woff, 4), 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(pow * 16, 6);
  out.writeUInt16BE(Math.log2(pow), 8);
  out.writeUInt16BE(numTables * 16 - pow * 16, 10);
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    t.tag.copy(out, o);
    out.writeUInt32BE(t.checksum, o + 4);
    out.writeUInt32BE(offset, o + 8);
    out.writeUInt32BE(t.data.length, o + 12);
    t.data.copy(out, offset);
    offset += (t.data.length + 3) & ~3;
  });
  return out;
}

function table(sfnt, tag) {
  const n = u16(sfnt, 4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (o + 16 > sfnt.length) return null;
    if (sfnt.toString("latin1", o, o + 4) === tag) {
      const [offset, length] = [u32(sfnt, o + 8), u32(sfnt, o + 12)];
      return offset + length <= sfnt.length ? sfnt.subarray(offset, offset + length) : null;
    }
  }
  return null;
}

/**
 * Ascent and descent as fractions of the em (both positive), from `hhea`, as browsers lay text
 * out. Null when the tables are missing.
 */
export function verticalMetrics(sfnt) {
  if (!isSfnt(sfnt)) return null;
  const head = table(sfnt, "head");
  const hhea = table(sfnt, "hhea");
  if (!head || head.length < 20 || !hhea || hhea.length < 8) return null;
  const upm = u16(head, 18);
  if (!upm) return null;
  return { ascent: hhea.readInt16BE(4) / upm, descent: -hhea.readInt16BE(6) / upm };
}

/**
 * OS/2 fsType embedding permission: false when the font forbids embedding (bit 1 set alone:
 * "restricted licence"), true otherwise, including when there is no OS/2 table.
 */
export function mayEmbed(sfnt) {
  const os2 = isSfnt(sfnt) ? table(sfnt, "OS/2") : null;
  if (!os2 || os2.length < 10) return true;
  return (u16(os2, 8) & 0x000f) !== 0x0002;
}

/**
 * The characters a font has, as sorted [first, last] ranges, from its Unicode `cmap` (format 4
 * or 12). Empty when there is none.
 */
export function cmapRanges(sfnt) {
  const cmap = isSfnt(sfnt) ? table(sfnt, "cmap") : null;
  if (!cmap || cmap.length < 4) return [];
  let best = null;
  for (let i = 0, n = u16(cmap, 2); i < n && 4 + i * 8 + 8 <= cmap.length; i++) {
    const [platform, encoding, offset] = [u16(cmap, 4 + i * 8), u16(cmap, 6 + i * 8), u32(cmap, 8 + i * 8)];
    if (offset + 4 > cmap.length) continue;
    const format = u16(cmap, offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (unicode && (format === 12 || (format === 4 && best?.format !== 12))) best = { format, offset };
  }
  if (!best) return [];
  const out = [];
  const o = best.offset;
  if (best.format === 4) {
    if (o + 14 > cmap.length) return [];
    const segs = u16(cmap, o + 6) / 2;
    if (o + 16 + segs * 8 > cmap.length) return [];
    for (let i = 0; i < segs; i++) {
      const [end, start] = [u16(cmap, o + 14 + i * 2), u16(cmap, o + 16 + segs * 2 + i * 2)];
      if (start <= end && start !== 0xffff) out.push([start, Math.min(end, 0xfffe)]);
    }
  } else {
    if (o + 16 > cmap.length) return [];
    const groups = u32(cmap, o + 12);
    if (groups > 100000 || o + 16 + groups * 12 > cmap.length) return [];
    for (let i = 0; i < groups; i++) {
      const [start, end] = [u32(cmap, o + 16 + i * 12), u32(cmap, o + 20 + i * 12)];
      if (start <= end && end <= 0x10ffff) out.push([start, end]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
