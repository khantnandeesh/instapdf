/**
 * Twins on the page (F24, AC-298): a font the PDF only names (Georgia, Segoe UI, Arial…) is drawn
 * by pdf.js in whatever the device has, while the edit box draws its metric twin. So the page
 * shows what the box and the saved file will, the copy of the file that pdf.js draws from gets
 * the twin's font file attached to such fonts. Only that copy: the file the person edits and
 * downloads is never touched.
 *
 * The change is an incremental update appended to the bytes (new versions of the font objects,
 * a descriptor and a font file each), so it costs one parse per version of the file that is not
 * just an addition to the last one, and a copy of the bytes otherwise.
 */

/** A font of the open file that the PDF only names and that has a twin. */
export type NamedFont = { object: number; twin: string; bold: boolean; italic: boolean };

type Obj = { num: number; bytes: Uint8Array };
/** `names`: the BaseFont of each font the update covers, so a later version of the file is checked to hold the same font under that number. */
export type TwinPatch = { root: string; size: number; objects: Obj[]; fonts: number[]; names: Record<number, string> };

/** Object numbers far above anything the file or a later edit will use. */
const BASE = 6_000_000;
/** Files beyond this are left as they are (the parse would hold the editor up). */
export const TWIN_DISPLAY_MAX_BYTES = 30 * 1024 * 1024;

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** What a font descriptor needs from the font file. Null when it is not a TrueType file with outlines. */
export function sfntFacts(sfnt: Uint8Array): { unitsPerEm: number; bbox: number[]; ascent: number; descent: number; italicAngle: number; fixed: boolean } | null {
  if (sfnt.length < 12) return null;
  const v = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  if (v.getUint32(0) !== 0x00010000 && v.getUint32(0) !== 0x74727565) return null;
  const table = (tag: string) => {
    for (let i = 0, n = v.getUint16(4); i < n && 28 + i * 16 <= sfnt.length; i++) {
      const o = 12 + i * 16;
      if (String.fromCharCode(sfnt[o]!, sfnt[o + 1]!, sfnt[o + 2]!, sfnt[o + 3]!) === tag) {
        const [offset, length] = [v.getUint32(o + 8), v.getUint32(o + 12)];
        return offset + length <= sfnt.length ? { offset, length } : null;
      }
    }
    return null;
  };
  const [head, hhea, post, glyf] = [table("head"), table("hhea"), table("post"), table("glyf")];
  if (!head || head.length < 54 || !hhea || hhea.length < 8 || !glyf) return null;
  const unitsPerEm = v.getUint16(head.offset + 18);
  if (!unitsPerEm) return null;
  const k = 1000 / unitsPerEm;
  return {
    unitsPerEm,
    bbox: [36, 38, 40, 42].map((o) => Math.round(v.getInt16(head.offset + o) * k)),
    ascent: Math.round(v.getInt16(hhea.offset + 4) * k),
    descent: Math.round(v.getInt16(hhea.offset + 6) * k),
    italicAngle: post && post.length >= 8 ? v.getInt32(post.offset + 4) / 65536 : 0,
    fixed: !!post && post.length >= 16 && v.getUint32(post.offset + 12) !== 0,
  };
}

/** Windows-1252 codes 0x80 to 0x9F as characters (0: no character there). */
const CP1252_HIGH = [0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0, 0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178];
/** Windows-1252 letters outside Latin-1: the ones a Latin slice of a library font may lack. */
export const CP1252_EXTRA = CP1252_HIGH.filter((cp) => cp);

/**
 * Builds the update for `fonts` of the file in `bytes`. A font is left alone unless it is a
 * simple font with no font file, in WinAnsiEncoding with no remapped codes (so every letter it
 * can show is one the twin's file is asked about by the caller). Null when nothing is to be done
 * or the file can't be read this way (encrypted, damaged).
 */
export async function buildTwinPatch(
  bytes: Uint8Array,
  fonts: readonly NamedFont[],
  /** `declared`: the letters outside Latin-1 that the font's own table of widths says it may draw. */
  fileOf: (font: NamedFont, declared: number[]) => Promise<Uint8Array | null>,
  /** From an earlier version of the file: a font is only covered again under the same name. */
  expect?: Record<number, string>,
): Promise<TwinPatch | null> {
  if (!fonts.length || bytes.length > TWIN_DISPLAY_MAX_BYTES) return null;
  const { PDFDocument, PDFDict, PDFName, PDFRef, PDFNumber, PDFArray } = await import("@cantoo/pdf-lib");
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    return null;
  }
  const ctx = doc.context;
  const root = ctx.trailerInfo.Root;
  // Encrypted files, and the rare file that already numbers objects where the update's own go.
  if (!(root instanceof PDFRef) || ctx.trailerInfo.Encrypt || ctx.largestObjectNumber >= BASE) return null;
  const names: Record<number, string> = {};
  const name = (s: string) => PDFName.of(s);
  const objects: Obj[] = [];
  const done: number[] = [];
  let next = BASE;
  const serialise = (o: { sizeInBytes(): number; copyBytesInto(buffer: Uint8Array, offset: number): number }) => {
    const out = new Uint8Array(o.sizeInBytes());
    o.copyBytesInto(out, 0);
    return out;
  };
  for (const font of fonts) {
    const dict = ctx.lookup(PDFRef.of(font.object, 0));
    if (!(dict instanceof PDFDict)) continue;
    const subtype = dict.lookup(name("Subtype"));
    if (subtype !== name("Type1") && subtype !== name("TrueType")) continue;
    const descriptor = dict.lookup(name("FontDescriptor"));
    if (descriptor instanceof PDFDict && ["FontFile", "FontFile2", "FontFile3"].some((k) => descriptor.has(name(k)))) continue;
    const encoding = dict.lookup(name("Encoding"));
    const winAnsi = encoding === name("WinAnsiEncoding") || (encoding instanceof PDFDict && encoding.lookup(name("BaseEncoding")) === name("WinAnsiEncoding") && !encoding.has(name("Differences")));
    if (!winAnsi) continue;
    const base = dict.lookup(name("BaseFont"));
    const baseName = base instanceof PDFName ? base.decodeText() : "";
    if (expect && expect[font.object] !== undefined && expect[font.object] !== baseName) continue;
    // Codes 0x80 to 0x9F the font gives a width: the letters outside Latin-1 it may draw anywhere
    // in the file. With no table of widths (a standard font) it may draw them all.
    const [first, last, widths] = [dict.lookup(name("FirstChar")), dict.lookup(name("LastChar")), dict.lookup(name("Widths"))];
    const declared = CP1252_HIGH.filter((cp, i) => {
      if (!cp) return false;
      if (!(first instanceof PDFNumber) || !(last instanceof PDFNumber) || !(widths instanceof PDFArray)) return true;
      const code = 0x80 + i;
      if (code < first.asNumber() || code > last.asNumber()) return false;
      const at = code - first.asNumber();
      const w = at < widths.size() ? widths.lookup(at) : undefined;
      return !(w instanceof PDFNumber) || w.asNumber() !== 0;
    });
    const file = await fileOf(font, declared);
    const facts = file && sfntFacts(file);
    if (!file || !facts) continue;
    const [descNum, fileNum] = [next++, next++];
    const copy = PDFDict.withContext(ctx);
    for (const [k, v] of dict.entries()) copy.set(k, v);
    copy.set(name("Subtype"), name("TrueType"));
    copy.set(name("FontDescriptor"), PDFRef.of(descNum, 0));
    const desc = ctx.obj({
      Type: "FontDescriptor",
      FontName: base instanceof PDFName ? base : name("Twin"),
      // Nonsymbolic, plus fixed pitch and italic where they apply.
      Flags: 32 | (facts.fixed ? 1 : 0) | (font.italic ? 64 : 0),
      FontBBox: facts.bbox,
      ItalicAngle: PDFNumber.of(Math.round(facts.italicAngle * 100) / 100),
      Ascent: facts.ascent,
      Descent: facts.descent,
      CapHeight: Math.round(facts.ascent * 0.72),
      StemV: font.bold ? 140 : 80,
      FontFile2: PDFRef.of(fileNum, 0),
    });
    objects.push({ num: font.object, bytes: serialise(copy) });
    objects.push({ num: descNum, bytes: serialise(desc) });
    objects.push({ num: fileNum, bytes: join([ascii(`<< /Length ${file.length} /Length1 ${file.length} >>\nstream\n`), file, ascii("\nendstream")]) });
    done.push(font.object);
    names[font.object] = baseName;
  }
  if (!objects.length) return null;
  return { root: `${root.objectNumber} ${root.generationNumber} R`, size: next, objects: objects.sort((a, b) => a.num - b.num), fonts: done, names };
}

/** Where the file's last cross-reference section starts, read from its end. */
function lastStartXref(bytes: Uint8Array): number | null {
  const tail = String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 2048)));
  const at = tail.lastIndexOf("startxref");
  const m = at < 0 ? null : /^startxref\s+(\d+)/.exec(tail.slice(at));
  return m ? Number(m[1]) : null;
}

/** The bytes with the update appended; the bytes themselves when the file's end can't be read. */
export function withTwinPatch(bytes: Uint8Array, patch: TwinPatch | null): Uint8Array {
  const prev = patch && lastStartXref(bytes);
  if (!patch || prev == null) return bytes;
  const parts: Uint8Array[] = [bytes, ascii("\n")];
  let at = bytes.length + 1;
  const offsets: number[] = [];
  for (const o of patch.objects) {
    const chunk = join([ascii(`${o.num} 0 obj\n`), o.bytes, ascii("\nendobj\n")]);
    offsets.push(at);
    parts.push(chunk);
    at += chunk.length;
  }
  const rows = patch.objects.map((o, i) => `${o.num} 1\n${String(offsets[i]).padStart(10, "0")} 00000 n \n`).join("");
  parts.push(ascii(`xref\n${rows}trailer\n<< /Size ${patch.size} /Root ${patch.root} /Prev ${prev} >>\nstartxref\n${at}\n%%EOF\n`));
  return join(parts);
}
