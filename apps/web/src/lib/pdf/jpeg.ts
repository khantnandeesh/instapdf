/**
 * A baseline JPEG writer (ITU T.81, the Annex K tables), for the pictures this site packs itself:
 * grey ones (Grayscale, spec F13) and colour ones (Compress, spec F6). Written here rather than
 * through a canvas, because a canvas may hand back pixels a privacy setting has altered.
 * A picture is one or three planes; colour is YCbCr with the two colour planes at half size.
 */

const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
// prettier-ignore
const QUANT_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
// prettier-ignore
const QUANT_CHROMA = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// prettier-ignore
const AC_LUMA = [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];
// prettier-ignore
const AC_CHROMA = [0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];

type Huffman = { bits: number[]; vals: number[]; code: Uint16Array; size: Uint8Array };
function huffman(bits: number[], vals: number[]): Huffman {
  const code = new Uint16Array(256);
  const size = new Uint8Array(256);
  let c = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len - 1]; i++, k++) {
      code[vals[k]] = c++;
      size[vals[k]] = len;
    }
    c <<= 1;
  }
  return { bits, vals, code, size };
}
/** Table 0 is for brightness (and a grey picture), table 1 for the two colour planes. */
export const JPEG_TABLES = [
  { quant: QUANT_LUMA, dc: huffman([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], DC_VALS), ac: huffman([0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], AC_LUMA) },
  { quant: QUANT_CHROMA, dc: huffman([0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], DC_VALS), ac: huffman([0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], AC_CHROMA) },
] as const;

// cos((2x + 1) u π / 16) with the 1/2 and 1/√2 factors folded in.
const COS = new Float32Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) COS[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);

/** One plane of a picture: `h` × `v` of its 8 × 8 blocks go into each unit of the picture (1 × 1, or 2 × 2 for brightness beside half-size colour). */
export type JpegPlane = { plane: Uint8Array; width: number; height: number; h: 1 | 2; v: 1 | 2; table: 0 | 1 };

/** A JPEG holds at most 65,535 pixels a side. */
export const JPEG_MAX_SIDE = 65535;

export function encodeJpeg(width: number, height: number, planes: readonly JpegPlane[], quality: number): Uint8Array {
  if (!(width >= 1 && height >= 1) || width > JPEG_MAX_SIDE || height > JPEG_MAX_SIDE) throw new RangeError("A JPEG holds 1 to 65,535 pixels a side.");
  const scale = quality < 50 ? 5000 / quality : 200 - 2 * quality;
  const used = [...new Set(planes.map((p) => p.table))].sort();
  const q = JPEG_TABLES.map((t) => t.quant.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100)))));

  let out = new Uint8Array(Math.max(4096, (width * height) >> 2));
  let at = 0;
  const room = (n: number) => {
    if (at + n <= out.length) return;
    const bigger = new Uint8Array(Math.max(out.length * 2, at + n));
    bigger.set(out.subarray(0, at));
    out = bigger;
  };
  const bytes = (...b: number[]) => {
    room(b.length);
    for (const v of b) out[at++] = v;
  };
  bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0);
  for (const t of used) bytes(0xff, 0xdb, 0, 67, t, ...ZIGZAG.map((i) => q[t][i]));
  bytes(0xff, 0xc0, 0, 8 + 3 * planes.length, 8, height >> 8, height & 255, width >> 8, width & 255, planes.length);
  planes.forEach((p, i) => bytes(i + 1, (p.h << 4) | p.v, p.table));
  for (const t of used) {
    bytes(0xff, 0xc4, 0, 19 + JPEG_TABLES[t].dc.vals.length, t, ...JPEG_TABLES[t].dc.bits, ...JPEG_TABLES[t].dc.vals);
    bytes(0xff, 0xc4, 0, 19 + JPEG_TABLES[t].ac.vals.length, 0x10 | t, ...JPEG_TABLES[t].ac.bits, ...JPEG_TABLES[t].ac.vals);
  }
  bytes(0xff, 0xda, 0, 6 + 2 * planes.length, planes.length);
  planes.forEach((p, i) => bytes(i + 1, (p.table << 4) | p.table));
  bytes(0, 63, 0);

  let acc = 0;
  let nacc = 0;
  const put = (code: number, size: number) => {
    acc = (acc << size) | code;
    nacc += size;
    while (nacc >= 8) {
      const b = (acc >> (nacc - 8)) & 255;
      room(2);
      out[at++] = b;
      if (b === 255) out[at++] = 0;
      nacc -= 8;
    }
    acc &= (1 << nacc) - 1;
  };
  const bitsOf = (v: number) => {
    let a = v < 0 ? -v : v;
    let n = 0;
    while (a) {
      n++;
      a >>= 1;
    }
    return n;
  };

  const block = new Float32Array(64);
  const tmp = new Float32Array(64);
  const coef = new Int16Array(64);
  const prevDc = planes.map(() => 0);
  /** One 8 × 8 block of plane `c`, its top left at (bx, by): transformed, quantised and written. */
  const writeBlock = (c: number, bx: number, by: number) => {
    const p = planes[c];
    const px = p.plane;
    const table = JPEG_TABLES[p.table];
    const quant = q[p.table];
    // Blocks past the edge repeat the last row and column.
    for (let y = 0; y < 8; y++) {
      const row = Math.min(p.height - 1, by + y) * p.width;
      for (let x = 0; x < 8; x++) block[y * 8 + x] = px[row + Math.min(p.width - 1, bx + x)] - 128;
    }
    for (let y = 0; y < 8; y++) {
      for (let u = 0; u < 8; u++) {
        let s = 0;
        for (let x = 0; x < 8; x++) s += block[y * 8 + x] * COS[u * 8 + x];
        tmp[y * 8 + u] = s;
      }
    }
    for (let u = 0; u < 8; u++) {
      for (let v = 0; v < 8; v++) {
        let s = 0;
        for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * COS[v * 8 + y];
        block[v * 8 + u] = s;
      }
    }
    for (let i = 0; i < 64; i++) coef[i] = Math.round(block[ZIGZAG[i]] / quant[ZIGZAG[i]]);

    const diff = coef[0] - prevDc[c];
    prevDc[c] = coef[0];
    let n = bitsOf(diff);
    put(table.dc.code[n], table.dc.size[n]);
    if (n) put((diff < 0 ? diff - 1 : diff) & ((1 << n) - 1), n);
    let run = 0;
    for (let i = 1; i < 64; i++) {
      const v = coef[i];
      if (!v) {
        run++;
        continue;
      }
      while (run > 15) {
        put(table.ac.code[0xf0], table.ac.size[0xf0]);
        run -= 16;
      }
      n = bitsOf(v);
      put(table.ac.code[(run << 4) | n], table.ac.size[(run << 4) | n]);
      put((v < 0 ? v - 1 : v) & ((1 << n) - 1), n);
      run = 0;
    }
    if (run) put(table.ac.code[0], table.ac.size[0]);
  };

  const hMax = Math.max(...planes.map((p) => p.h));
  const vMax = Math.max(...planes.map((p) => p.v));
  for (let my = 0; my < height; my += 8 * vMax) {
    for (let mx = 0; mx < width; mx += 8 * hMax) {
      for (let c = 0; c < planes.length; c++) {
        const p = planes[c];
        // This plane's pixels are the picture's, scaled by its share of the unit.
        const x0 = (mx * p.h) / hMax;
        const y0 = (my * p.v) / vMax;
        for (let v = 0; v < p.v; v++) for (let h = 0; h < p.h; h++) writeBlock(c, x0 + h * 8, y0 + v * 8);
      }
    }
  }
  if (nacc) put((1 << (8 - nacc)) - 1, 8 - nacc);
  bytes(0xff, 0xd9);
  return out.slice(0, at);
}

/**
 * A colour picture (three bytes a pixel: red, green, blue) as a JPEG: brightness at full size, the
 * two colour planes at half size each way (each of their pixels the average of four).
 */
export function encodeColourJpeg(rgb: Uint8Array, width: number, height: number, quality: number): Uint8Array {
  const cw = (width + 1) >> 1;
  const ch = (height + 1) >> 1;
  const y = new Uint8Array(width * height);
  const cb = new Uint8Array(cw * ch);
  const cr = new Uint8Array(cw * ch);
  const sumB = new Float32Array(cw);
  const sumR = new Float32Array(cw);
  const count = new Uint8Array(cw);
  for (let row = 0; row < height; row++) {
    if (!(row & 1)) {
      sumB.fill(0);
      sumR.fill(0);
      count.fill(0);
    }
    for (let x = 0, i = row * width * 3; x < width; x++, i += 3) {
      const r = rgb[i];
      const g = rgb[i + 1];
      const b = rgb[i + 2];
      y[row * width + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      sumB[x >> 1] += -0.168736 * r - 0.331264 * g + 0.5 * b;
      sumR[x >> 1] += 0.5 * r - 0.418688 * g - 0.081312 * b;
      count[x >> 1]++;
    }
    if (row & 1 || row === height - 1) {
      const o = (row >> 1) * cw;
      for (let x = 0; x < cw; x++) {
        cb[o + x] = Math.min(255, Math.max(0, Math.round(sumB[x] / count[x] + 128)));
        cr[o + x] = Math.min(255, Math.max(0, Math.round(sumR[x] / count[x] + 128)));
      }
    }
  }
  return encodeJpeg(width, height, [{ plane: y, width, height, h: 2, v: 2, table: 0 }, { plane: cb, width: cw, height: ch, h: 1, v: 1, table: 1 }, { plane: cr, width: cw, height: ch, h: 1, v: 1, table: 1 }], quality);
}
