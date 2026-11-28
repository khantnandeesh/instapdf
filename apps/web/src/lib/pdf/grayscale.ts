/**
 * Grayscale (spec F13 §1): every colour in the file becomes a grey level, in place.
 *
 * Text stays text and drawings stay drawings: the colour operators of each content stream (pages,
 * forms, patterns, annotation looks, Type 3 glyphs) are rewritten to DeviceGray, gradients get a grey
 * colour function, and pictures are swapped for the grey ones drawn by the caller (pdf.js decodes
 * them in the tab; see grayscale-run.ts). Worker-only: this module pulls in the PDF library.
 */
import { decodePDFRawStream, PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, type PDFContext, type PDFDocument, type PDFObject } from "@cantoo/pdf-lib";
import { CMYK, components, GRAY, parsePs, RGB, toGray, evalFns, type Fn, type Space } from "./gray-color";
import { grayContent, type ContentEnv } from "./gray-content";
import { loadForEdit } from "./rotate";
import { saveCompact } from "./write";

/** A picture's grey replacement: 8 bits a pixel, as a JPEG or as Flate data (with the PNG row predictor when `predictor`). */
export type GrayImage = { ref: string; width: number; height: number; jpeg: boolean; predictor?: boolean; data: Uint8Array };
export type GrayInput = { bytes: Uint8Array; password?: string; /** Text, drawings and gradients. */ vector: boolean; images?: readonly GrayImage[] };
export type GrayResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean; warnings?: string[] };

const N = (s: string) => PDFName.of(s);
const GRAY_PATTERN = "IpGrayPattern";
const DROP = new Set(["Filter", "DecodeParms", "Length", "DL", "F", "FFilter", "FDecodeParms"]);
/** pdf.js writes an object reference as "12R", or "12R1" with a generation. */
export type ColourImage = { ref: string; lossy: boolean; /** The size the picture's dictionary states. */ width: number; height: number };
export const refKey = (ref: PDFRef) => `${ref.objectNumber}R${ref.generationNumber || ""}`;

const nameOf = (o: PDFObject | undefined) => (o instanceof PDFName ? o.decodeText() : undefined);
const numOf = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : undefined);

class Walk {
  private readonly ctx: PDFContext;
  private readonly spaces = new Map<PDFObject, Space | null>();
  private readonly seen = new Set<PDFObject>();
  private readonly seenRefs = new Set<string>();
  inlineKept = 0;
  unknownKept = 0;
  gradientsKept = 0;
  unread = 0;

  constructor(private readonly doc: PDFDocument) {
    this.ctx = doc.context;
  }

  private look(o: PDFObject | undefined): PDFObject | undefined {
    return o instanceof PDFRef ? this.ctx.lookup(o) : o;
  }
  private dict(o: PDFObject | undefined): PDFDict | undefined {
    const v = this.look(o);
    return v instanceof PDFDict ? v : undefined;
  }
  private nums(o: PDFObject | undefined): number[] | null {
    const a = this.look(o);
    if (!(a instanceof PDFArray)) return null;
    const out: number[] = [];
    for (let i = 0; i < a.size(); i++) {
      const v = numOf(this.look(a.get(i)));
      if (v === undefined) return null;
      out.push(v);
    }
    return out;
  }
  private bytes(stream: PDFRawStream): Uint8Array | null {
    // The library unpacks Flate and LZW but does not undo a row predictor: such data is not read at all.
    const parms = this.look(stream.dict.get(N("DecodeParms")));
    const predicted = (parms instanceof PDFArray ? parms.asArray() : [parms]).some((p) => (numOf(this.look(this.dict(p)?.get(N("Predictor")))) ?? 1) > 1);
    if (predicted) return null;
    try {
      return decodePDFRawStream(stream).decode();
    } catch {
      return null;
    }
  }
  /** A new Flate stream with the old one's dictionary (minus how the old data was packed), under the same reference. */
  private replace(ref: PDFRef, old: PDFRawStream, data: Uint8Array, set: Record<string, unknown> = {}) {
    const entries: Record<string, unknown> = {};
    for (const [k, v] of old.dict.entries()) {
      const key = k.decodeText();
      if (!DROP.has(key)) entries[key] = v;
    }
    this.ctx.assign(ref, this.ctx.flateStream(data, { ...entries, ...set } as never));
  }

  /* ── Colour spaces and functions ─────────────────────────────────────────────────────────── */

  space(raw: PDFObject | undefined, depth = 0): Space | null {
    const o = this.look(raw);
    if (!o || depth > 6) return null;
    const known = this.spaces.get(o);
    if (known !== undefined) return known;
    const space = this.readSpace(o, depth);
    this.spaces.set(o, space);
    return space;
  }

  private readSpace(o: PDFObject, depth: number): Space | null {
    const name = nameOf(o);
    if (name !== undefined) {
      if (name === "DeviceGray" || name === "G" || name === "CalGray") return GRAY;
      if (name === "DeviceRGB" || name === "RGB" || name === "CalRGB") return RGB;
      if (name === "DeviceCMYK" || name === "CMYK") return CMYK;
      if (name === "Pattern") return { kind: "pattern", base: null };
      return null;
    }
    if (!(o instanceof PDFArray) || !o.size()) return null;
    const family = nameOf(this.look(o.get(0)));
    switch (family) {
      case "DeviceGray":
      case "CalGray":
        return GRAY;
      case "DeviceRGB":
      case "CalRGB":
        return RGB;
      case "DeviceCMYK":
        return CMYK;
      case "Lab": {
        const range = this.dict(o.get(1)) ? this.nums(this.dict(o.get(1))!.get(N("Range"))) : null;
        return { kind: "lab", range: range?.length === 4 ? range : [-100, 100, -100, 100] };
      }
      case "ICCBased": {
        const profile = this.look(o.get(1));
        if (!(profile instanceof PDFRawStream)) return null;
        const n = numOf(this.look(profile.dict.get(N("N"))));
        return n === 1 ? GRAY : n === 3 ? RGB : n === 4 ? CMYK : this.space(profile.dict.get(N("Alternate")), depth + 1);
      }
      case "Indexed":
      case "I": {
        const base = this.space(o.get(1), depth + 1);
        const hival = numOf(this.look(o.get(2)));
        const table = this.look(o.get(3));
        const lookup = table instanceof PDFRawStream ? this.bytes(table) : table instanceof PDFString || table instanceof PDFHexString ? table.asBytes() : null;
        if (!base || base.kind === "pattern" || base.kind === "indexed" || hival === undefined || !lookup) return null;
        return { kind: "indexed", base, hival, lookup };
      }
      case "Separation":
      case "DeviceN": {
        const names = this.look(o.get(1));
        const alt = this.space(o.get(2), depth + 1);
        if (!alt || alt.kind === "pattern") return null;
        const n = family === "Separation" ? 1 : names instanceof PDFArray ? names.size() : 0;
        if (!n) return null;
        const one = family === "Separation" ? nameOf(names) : undefined;
        return { kind: "tint", n, alt, fns: this.fns(o.get(3)), all: one === "All", none: one === "None" };
      }
      case "Pattern":
        return { kind: "pattern", base: o.size() > 1 ? this.space(o.get(1), depth + 1) : null };
      default:
        return null;
    }
  }

  /** One function, or an array of them (one per output); empty when any cannot be read. */
  fns(raw: PDFObject | undefined): Fn[] {
    const o = this.look(raw);
    const list = o instanceof PDFArray ? o.asArray() : o ? [o] : [];
    const out: Fn[] = [];
    for (const item of list) {
      const fn = this.fn(item, 0);
      if (!fn) return [];
      out.push(fn);
    }
    return out;
  }

  private fn(raw: PDFObject, depth: number): Fn | null {
    const o = this.look(raw);
    const d = o instanceof PDFRawStream ? o.dict : o instanceof PDFDict ? o : null;
    if (!d || depth > 6) return null;
    const type = numOf(this.look(d.get(N("FunctionType"))));
    const domain = this.nums(d.get(N("Domain")));
    const range = this.nums(d.get(N("Range"))) ?? undefined;
    if (!domain || domain.length < 2) return null;
    if (type === 2) {
      return { type: 2, domain, range, c0: this.nums(d.get(N("C0"))) ?? [0], c1: this.nums(d.get(N("C1"))) ?? [1], n: numOf(this.look(d.get(N("N")))) ?? 1 };
    }
    if (type === 3) {
      const subs = this.look(d.get(N("Functions")));
      if (!(subs instanceof PDFArray)) return null;
      const fns: Fn[] = [];
      for (const s of subs.asArray()) {
        const f = this.fn(s, depth + 1);
        if (!f) return null;
        fns.push(f);
      }
      return { type: 3, domain, range, fns, bounds: this.nums(d.get(N("Bounds"))) ?? [], encode: this.nums(d.get(N("Encode"))) ?? [] };
    }
    if (!(o instanceof PDFRawStream) || !range) return null;
    const data = this.bytes(o);
    if (!data) return null;
    if (type === 0) {
      const size = this.nums(d.get(N("Size")));
      const bits = numOf(this.look(d.get(N("BitsPerSample"))));
      if (!size || size.length !== domain.length >> 1 || !bits || bits > 32) return null;
      return { type: 0, domain, range, size, bits, encode: this.nums(d.get(N("Encode"))) ?? [], decode: this.nums(d.get(N("Decode"))) ?? [], data };
    }
    if (type === 4) {
      let text = "";
      for (let i = 0; i < data.length; i++) text += String.fromCharCode(data[i]);
      const code = parsePs(text);
      return code ? { type: 4, domain, range, code } : null;
    }
    return null;
  }

  /** A colour array of an annotation or a gradient's background, as one grey level. */
  private grayArray(raw: PDFObject | undefined, space?: Space | null): PDFArray | null {
    const c = this.nums(raw);
    if (!c?.length) return null;
    const s = space && components(space) === c.length ? space : c.length === 3 ? RGB : c.length === 4 ? CMYK : null;
    return s && s.kind !== "gray" ? (this.ctx.obj([toGray(s, c)]) as PDFArray) : null;
  }

  /* ── Content ─────────────────────────────────────────────────────────────────────────────── */

  private env(res: PDFDict | undefined, inherits = false): ContentEnv {
    return {
      inherits,
      space: (name) => {
        if (name === "DeviceGray" || name === "DeviceRGB" || name === "DeviceCMYK" || name === "Pattern") return this.space(N(name));
        return this.space(this.dict(res?.get(N("ColorSpace")))?.get(N(name)));
      },
      grayPattern: () => {
        if (!res) return null;
        let spaces = this.dict(res.get(N("ColorSpace")));
        if (!spaces) {
          spaces = this.ctx.obj({});
          res.set(N("ColorSpace"), spaces);
        }
        if (!spaces.has(N(GRAY_PATTERN))) spaces.set(N(GRAY_PATTERN), this.ctx.obj(["Pattern", "DeviceGray"]));
        return GRAY_PATTERN;
      },
    };
  }

  /** Rewrites one content stream under its reference. */
  private stream(ref: PDFRef, res: PDFDict | undefined, inherits = true) {
    const stream = this.ctx.lookup(ref);
    if (!(stream instanceof PDFRawStream)) return;
    const data = this.bytes(stream);
    if (!data) {
      this.unread++;
      return;
    }
    const r = grayContent(data, this.env(res, inherits));
    this.inlineKept += r.inlineKept;
    this.unknownKept += r.unknownKept;
    if (r.changed) this.replace(ref, stream, r.bytes);
  }

  private groupToGray(d: PDFDict) {
    const group = this.dict(d.get(N("Group")));
    const cs = group?.get(N("CS"));
    if (group && cs && this.space(cs)?.kind !== "gray") group.set(N("CS"), N("DeviceGray"));
  }

  /** A form XObject, a tiling pattern or an annotation's look: its content, then what it uses. */
  private form(raw: PDFObject | undefined, parentRes: PDFDict | undefined) {
    if (!(raw instanceof PDFRef) || this.seenRefs.has(raw.tag)) return;
    const stream = this.ctx.lookup(raw);
    if (!(stream instanceof PDFRawStream)) return;
    this.seenRefs.add(raw.tag);
    if (nameOf(this.look(stream.dict.get(N("Subtype")))) === "Image") return;
    const own = this.dict(stream.dict.get(N("Resources")));
    this.groupToGray(stream.dict);
    this.stream(raw, own ?? parentRes);
    if (own) this.resources(own);
  }

  private each(d: PDFDict | undefined, fn: (raw: PDFObject, key: PDFName) => void) {
    if (d) for (const [k, v] of d.entries()) fn(v, k);
  }

  resources(res: PDFDict | undefined) {
    if (!res || this.seen.has(res)) return;
    this.seen.add(res);
    this.each(this.dict(res.get(N("XObject"))), (raw) => this.form(raw, res));
    this.each(this.dict(res.get(N("Pattern"))), (raw) => {
      const o = this.look(raw);
      if (o instanceof PDFRawStream) this.form(raw, res);
      else if (o instanceof PDFDict && !this.seen.has(o)) {
        this.seen.add(o);
        this.shading(o.get(N("Shading")));
        this.extGState(this.dict(o.get(N("ExtGState"))), res);
      }
    });
    this.each(this.dict(res.get(N("Shading"))), (raw) => this.shading(raw));
    this.each(this.dict(res.get(N("ExtGState"))), (raw) => this.extGState(this.dict(raw), res));
    this.each(this.dict(res.get(N("Font"))), (raw) => {
      const font = this.dict(raw);
      if (!font || this.seen.has(font) || nameOf(this.look(font.get(N("Subtype")))) !== "Type3") return;
      this.seen.add(font);
      const own = this.dict(font.get(N("Resources")));
      this.each(this.dict(font.get(N("CharProcs"))), (glyph) => {
        if (glyph instanceof PDFRef && !this.seenRefs.has(glyph.tag)) {
          this.seenRefs.add(glyph.tag);
          this.stream(glyph, own ?? res);
        }
      });
      this.resources(own);
    });
  }

  private extGState(gs: PDFDict | undefined, res: PDFDict | undefined) {
    if (!gs || this.seen.has(gs)) return;
    this.seen.add(gs);
    const mask = this.dict(gs.get(N("SMask")));
    if (!mask) return;
    this.form(mask.get(N("G")), res);
    const backdrop = this.grayArray(mask.get(N("BC")));
    if (backdrop) mask.set(N("BC"), backdrop);
  }

  /* ── Gradients ───────────────────────────────────────────────────────────────────────────── */

  private shading(raw: PDFObject | undefined) {
    const o = this.look(raw);
    const d = o instanceof PDFRawStream ? o.dict : o instanceof PDFDict ? o : null;
    if (!d || this.seen.has(d)) return;
    this.seen.add(d);
    const space = this.space(d.get(N("ColorSpace")));
    if (!space || space.kind === "gray" || space.kind === "pattern") return;
    const type = numOf(this.look(d.get(N("ShadingType")))) ?? 0;
    const background = this.grayArray(d.get(N("Background")), space);
    if (d.has(N("Function"))) {
      const fns = this.fns(d.get(N("Function")));
      const two = type === 1;
      // A mesh has no /Domain: its corners carry values of the function's own domain.
      const domain = this.nums(d.get(N("Domain"))) ?? (two ? [0, 1, 0, 1] : type >= 4 && fns.length ? fns[0].domain.slice(0, 2) : [0, 1]);
      const size = two ? [32, 32] : [256];
      const data = new Uint8Array(two ? 1024 : 256);
      let ok = fns.length > 0 && domain.length >= (two ? 4 : 2);
      for (let i = 0; ok && i < data.length; i++) {
        const x = domain[0] + ((i % size[0]) / (size[0] - 1)) * (domain[1] - domain[0]);
        const input = two ? [x, domain[2] + (Math.floor(i / 32) / 31) * (domain[3] - domain[2])] : [x];
        const colour = evalFns(fns, input);
        if (!colour || colour.length < components(space)) ok = false;
        else data[i] = Math.round(toGray(space, colour) * 255);
      }
      if (!ok) {
        this.gradientsKept++;
        return;
      }
      d.set(N("Function"), this.ctx.register(this.ctx.flateStream(data, { FunctionType: 0, Domain: domain.slice(0, two ? 4 : 2), Size: size, BitsPerSample: 8, Range: [0, 1] })));
      d.set(N("ColorSpace"), N("DeviceGray"));
    } else if (o instanceof PDFRawStream && raw instanceof PDFRef && type >= 4 && type <= 7) {
      const mesh = this.mesh(o, type, space);
      if (!mesh) {
        this.gradientsKept++;
        return;
      }
      this.replace(raw, o, mesh.data, { BitsPerComponent: 8, Decode: mesh.decode, ColorSpace: N("DeviceGray"), ...(background ? { Background: background } : {}) });
      this.seen.add((this.ctx.lookup(raw) as PDFRawStream).dict);
      return;
    } else {
      this.gradientsKept++;
      return;
    }
    if (background) d.set(N("Background"), background);
  }

  /** A mesh gradient with a colour at each corner: the same mesh with one grey byte per colour. */
  private mesh(stream: PDFRawStream, type: number, space: Space): { data: Uint8Array; decode: number[] } | null {
    const d = stream.dict;
    const bitsXY = numOf(this.look(d.get(N("BitsPerCoordinate"))));
    const bitsC = numOf(this.look(d.get(N("BitsPerComponent"))));
    const bitsF = type === 5 ? 0 : numOf(this.look(d.get(N("BitsPerFlag"))));
    const decode = this.nums(d.get(N("Decode")));
    const n = components(space);
    const src = this.bytes(stream);
    if (!bitsXY || !bitsC || bitsF === undefined || !decode || decode.length < 4 + 2 * n || !src || bitsXY > 32 || bitsC > 16) return null;
    // A colour of fewer than 8 bits in all grows to one byte.
    const out = new Uint8Array(src.length * Math.max(1, Math.ceil(8 / (n * bitsC))) + 16);
    let rp = 0; // bit positions
    let wp = 0;
    const left = () => src.length * 8 - rp;
    const read = (bits: number) => {
      let v = 0;
      for (let i = 0; i < bits; i++, rp++) v = v * 2 + ((src[rp >> 3] >> (7 - (rp & 7))) & 1);
      return v;
    };
    const write = (v: number, bits: number) => {
      for (let i = bits - 1; i >= 0; i--, wp++) if (Math.floor(v / 2 ** i) % 2) out[wp >> 3] |= 0x80 >> (wp & 7);
    };
    const copy = (bits: number, times = 1) => {
      for (let i = 0; i < times; i++) write(read(bits), bits);
    };
    const align = () => {
      rp = (rp + 7) & ~7;
      wp = (wp + 7) & ~7;
    };
    const max = 2 ** bitsC - 1;
    const c: number[] = new Array<number>(n);
    const colour = () => {
      for (let k = 0; k < n; k++) c[k] = decode[4 + 2 * k] + (read(bitsC) * (decode[5 + 2 * k] - decode[4 + 2 * k])) / max;
      write(Math.round(toGray(space, c) * 255), 8);
    };
    if (type === 4) {
      while (left() >= bitsF + 2 * bitsXY + n * bitsC) {
        copy(bitsF);
        copy(bitsXY, 2);
        colour();
        align();
      }
    } else if (type === 5) {
      while (left() >= 2 * bitsXY + n * bitsC) {
        copy(bitsXY, 2);
        colour();
      }
    } else {
      while (left() >= bitsF) {
        const flag = read(bitsF);
        const points = type === 6 ? (flag ? 8 : 12) : flag ? 12 : 16;
        const colours = flag ? 2 : 4;
        if (left() < points * 2 * bitsXY + colours * n * bitsC) break;
        write(flag, bitsF);
        copy(bitsXY, points * 2);
        for (let k = 0; k < colours; k++) colour();
      }
      wp = (wp + 7) & ~7;
    }
    return { data: out.subarray(0, (wp + 7) >> 3), decode: [...decode.slice(0, 4), 0, 1] };
  }

  /* ── Pages, annotations, form defaults ───────────────────────────────────────────────────── */

  private daString(d: PDFDict) {
    const da = this.look(d.get(N("DA")));
    if (!(da instanceof PDFString || da instanceof PDFHexString)) return;
    const r = grayContent(da.asBytes(), this.env(undefined));
    if (!r.changed) return;
    let hex = "";
    for (const b of r.bytes) hex += b.toString(16).padStart(2, "0");
    d.set(N("DA"), PDFHexString.of(hex));
  }

  private annotation(a: PDFDict, res: PDFDict | undefined) {
    if (this.seen.has(a)) return;
    this.seen.add(a);
    for (const key of ["C", "IC"]) {
      const grey = this.grayArray(a.get(N(key)));
      if (grey) a.set(N(key), grey);
    }
    const mk = this.dict(a.get(N("MK")));
    for (const key of ["BC", "BG"]) {
      const grey = mk && this.grayArray(mk.get(N(key)));
      if (mk && grey) mk.set(N(key), grey);
    }
    this.daString(a);
    this.each(this.dict(a.get(N("AP"))), (raw) => {
      // One look, or one per state (a check box's "on" and "off").
      if (this.look(raw) instanceof PDFRawStream) this.form(raw, res);
      else this.each(this.dict(raw), (state) => this.form(state, res));
    });
  }

  run(onProgress?: (fraction: number) => void) {
    const pages = this.doc.getPages();
    const done = new Map<string, PDFObject>();
    const resIds = new Map<PDFDict, number>();
    pages.forEach((page, index) => {
      const node = page.node;
      const res = node.Resources();
      const raw = node.get(N("Contents"));
      const list = this.look(raw);
      const refs = list instanceof PDFArray ? list.asArray() : raw ? [raw] : [];
      // Pages that share both their streams and their resources share the rewritten stream too.
      if (res && !resIds.has(res)) resIds.set(res, resIds.size);
      const key = refs.length > 1 && refs.every((r) => r instanceof PDFRef) ? `${refs.map((r) => (r as PDFRef).tag).join(" ")}|${res ? resIds.get(res) : ""}` : "";
      const same = key ? done.get(key) : undefined;
      if (same) node.set(N("Contents"), same);
      else if (refs.length === 1 && refs[0] instanceof PDFRef && !this.seenRefs.has(refs[0].tag)) {
        this.seenRefs.add(refs[0].tag);
        this.stream(refs[0], res, false);
      } else if (refs.length > 1) {
        // Several streams are one stream cut anywhere between two words: join, rewrite, write one.
        const parts: Uint8Array[] = [];
        for (const r of refs) {
          const s = this.look(r);
          const data = s instanceof PDFRawStream ? this.bytes(s) : null;
          if (!data) {
            parts.length = 0;
            this.unread++;
            break;
          }
          parts.push(data, new Uint8Array([10]));
        }
        if (parts.length) {
          const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
          let at = 0;
          for (const p of parts) {
            joined.set(p, at);
            at += p.length;
          }
          const r = grayContent(joined, this.env(res));
          this.inlineKept += r.inlineKept;
          this.unknownKept += r.unknownKept;
          if (r.changed) {
            const made = this.ctx.register(this.ctx.flateStream(r.bytes));
            node.set(N("Contents"), made);
            if (key) done.set(key, made);
          }
        }
      }
      this.groupToGray(node);
      this.resources(res);
      const annots = node.Annots();
      if (annots) for (const a of annots.asArray()) {
        const d = this.dict(a);
        if (d) this.annotation(d, res);
      }
      onProgress?.((index + 1) / pages.length);
    });

    const form = this.dict(this.doc.catalog.get(N("AcroForm")));
    if (form) {
      this.daString(form);
      this.resources(this.dict(form.get(N("DR"))));
    }
    for (const [, obj] of this.ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFDict) || obj instanceof PDFRawStream) continue;
      // Fields carry their text colour in /DA; bookmarks may carry a colour of their own.
      if (obj.has(N("DA")) && !this.seen.has(obj)) this.daString(obj);
      if (obj.has(N("Title")) && obj.has(N("Parent")) && obj.has(N("C"))) {
        const c = this.nums(obj.get(N("C")));
        if (c?.length === 3) {
          const g = toGray(RGB, c);
          obj.set(N("C"), this.ctx.obj([g, g, g]));
        }
      }
    }
  }

  /* ── Pictures ────────────────────────────────────────────────────────────────────────────── */

  /** The pictures that hold colour: every image that is not a stencil and not already in a grey space. */
  colourImages(): ColourImage[] {
    const out: ColourImage[] = [];
    for (const [ref, obj] of this.ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const d = obj.dict;
      if (nameOf(this.look(d.get(N("Subtype")))) !== "Image" || this.look(d.get(N("ImageMask")))?.toString() === "true") continue;
      const filter = this.look(d.get(N("Filter")));
      const filters = (filter instanceof PDFArray ? filter.asArray() : filter ? [filter] : []).map((f) => nameOf(this.look(f)));
      const cs = d.get(N("ColorSpace"));
      // A JPEG 2000 picture may leave its colour space to the picture itself: take it as colour.
      if (cs && this.space(cs)?.kind === "gray") continue;
      const width = numOf(this.look(d.get(N("Width"))));
      const height = numOf(this.look(d.get(N("Height"))));
      if (!width || !height) continue;
      out.push({ ref: refKey(ref), lossy: filters.some((f) => f === "DCTDecode" || f === "DCT" || f === "JPXDecode"), width, height });
    }
    return out;
  }

  /** The pictures a page can draw: through its resources, its forms and patterns, its fonts' glyphs and its annotations. */
  drawnImages(): Set<string> {
    const found = new Set<string>();
    const dicts = new Set<PDFDict>();
    const stream = (raw: PDFObject, parent: PDFDict | undefined) => {
      const o = this.look(raw);
      if (!(raw instanceof PDFRef) || !(o instanceof PDFRawStream) || dicts.has(o.dict)) return;
      dicts.add(o.dict);
      if (nameOf(this.look(o.dict.get(N("Subtype")))) === "Image") found.add(refKey(raw));
      else res(this.dict(o.dict.get(N("Resources"))) ?? parent);
    };
    const res = (r: PDFDict | undefined) => {
      if (!r || dicts.has(r)) return;
      dicts.add(r);
      this.each(this.dict(r.get(N("XObject"))), (raw) => stream(raw, r));
      this.each(this.dict(r.get(N("Pattern"))), (raw) => stream(raw, r));
      this.each(this.dict(r.get(N("Font"))), (raw) => res(this.dict(this.dict(raw)?.get(N("Resources")))));
      this.each(this.dict(r.get(N("ExtGState"))), (raw) => {
        const g = this.dict(this.dict(raw)?.get(N("SMask")))?.get(N("G"));
        if (g) stream(g, r);
      });
    };
    for (const page of this.doc.getPages()) {
      const r = page.node.Resources();
      res(r);
      for (const a of page.node.Annots()?.asArray() ?? []) {
        this.each(this.dict(this.dict(a)?.get(N("AP"))), (raw) => {
          if (this.look(raw) instanceof PDFRawStream) stream(raw, r);
          else this.each(this.dict(raw), (state) => stream(state, r));
        });
      }
    }
    return found;
  }

  /** Swaps in the grey pictures; returns the references of those swapped. */
  swap(images: readonly GrayImage[]): Set<string> {
    const swapped = new Set<string>();
    for (const img of images) {
      const m = /^(\d+)R(\d*)$/.exec(img.ref);
      const ref = m ? PDFRef.of(Number(m[1]), m[2] ? Number(m[2]) : 0) : null;
      const old = ref ? this.ctx.lookup(ref) : null;
      if (!ref || !(old instanceof PDFRawStream) || nameOf(this.look(old.dict.get(N("Subtype")))) !== "Image") continue;
      const space = this.space(old.dict.get(N("ColorSpace")));
      if (space?.kind === "gray") continue;
      // A JPEG 2000 picture that carries its own transparency would lose it: it is left as it is.
      if ((numOf(this.look(old.dict.get(N("SMaskInData")))) ?? 0) > 0) continue;
      const entries: Record<string, unknown> = {};
      for (const [k, v] of old.dict.entries()) {
        const key = k.decodeText();
        // The grey picture is plain: no colour key, no remap, no second copy of the old one.
        if (!DROP.has(key) && key !== "Decode" && key !== "Alternates" && !(key === "Mask" && this.look(v) instanceof PDFArray)) entries[key] = v;
      }
      Object.assign(entries, { Width: img.width, Height: img.height, BitsPerComponent: 8, ColorSpace: N("DeviceGray") });
      if (img.jpeg) entries.Filter = N("DCTDecode");
      else {
        entries.Filter = N("FlateDecode");
        if (img.predictor) entries.DecodeParms = this.ctx.obj({ Predictor: 15, Colors: 1, BitsPerComponent: 8, Columns: img.width });
      }
      this.ctx.assign(ref, PDFRawStream.of(this.ctx.obj(entries as never) as unknown as PDFDict, img.data));
      // pdf.js hands over pixels with a mask's matte colour already taken out, so the mask must not
      // ask for that again. The mask may serve other pictures: this one gets its own copy without it.
      const maskRef = old.dict.get(N("SMask"));
      const mask = this.look(maskRef);
      if (mask instanceof PDFRawStream && mask.dict.has(N("Matte"))) {
        const plain = new Map(mask.dict.entries());
        plain.delete(N("Matte"));
        (this.ctx.lookup(ref) as PDFRawStream).dict.set(N("SMask"), this.ctx.register(PDFRawStream.of(PDFDict.fromMapWithContext(plain, this.ctx), mask.contents)));
      }
      swapped.add(img.ref);
    }
    return swapped;
  }
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("{n}", String(n)));

/** The colour pictures of a file, for the caller to draw in grey. */
export async function colourImages({ bytes, password }: { bytes: Uint8Array; password?: string }): Promise<{ images: ColourImage[]; pageCount: number }> {
  const { doc } = await loadForEdit(bytes, password);
  return { images: new Walk(doc).colourImages(), pageCount: doc.getPageCount() };
}

export async function grayscalePdf({ bytes, password, vector, images }: GrayInput, onProgress?: (fraction: number) => void): Promise<GrayResult> {
  const { doc, wasEncrypted } = await loadForEdit(bytes, password);
  onProgress?.(0.2);
  const walk = new Walk(doc);
  const warnings: string[] = [];
  if (images) {
    // Pictures no page draws are left alone and not counted: nobody sees them.
    const drawn = walk.drawnImages();
    const colour = walk.colourImages();
    const swapped = walk.swap(images);
    const left = colour.filter((i) => drawn.has(i.ref) && !swapped.has(i.ref)).length;
    if (left > 0) warnings.push(plural(left, "One picture could not be converted, so it keeps its colour.", "{n} pictures could not be converted, so they keep their colour."));
  }
  if (vector) {
    walk.run((f) => onProgress?.(0.2 + 0.5 * f));
    if (walk.unread) warnings.push(plural(walk.unread, "One part of a page could not be read, so it keeps its colours.", "{n} parts of pages could not be read, so they keep their colours."));
    if (walk.gradientsKept) warnings.push(plural(walk.gradientsKept, "One gradient is in a form this tool cannot convert, so it keeps its colours.", "{n} gradients are in a form this tool cannot convert, so they keep their colours."));
    if (walk.unknownKept) warnings.push(plural(walk.unknownKept, "One colour is set in a way this tool cannot read, so it stays as it is.", "{n} colours are set in a way this tool cannot read, so they stay as they are."));
    if (walk.inlineKept) warnings.push(plural(walk.inlineKept, "One small picture inside the page content keeps its colour.", "{n} small pictures inside the page content keep their colour."));
  }
  onProgress?.(0.7);
  const out = await saveCompact(doc);
  onProgress?.(1);
  return { bytes: out, pageCount: doc.getPageCount(), wasEncrypted, ...(warnings.length ? { warnings } : {}) };
}
