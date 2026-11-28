/**
 * Grayscale (spec F13 §1): a grey picture (one byte a pixel) packed for the PDF. A picture that was
 * a photo (JPEG, JPEG 2000) becomes a one-channel JPEG; anything else stays lossless (Flate, with
 * the PNG row filters that make flat areas and soft gradients pack well).
 */
import { zlibSync } from "fflate";

/* ── Baseline JPEG, one component (ITU T.81 Annex K tables) ──────────────────────────────────── */

const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
// prettier-ignore
const QUANT = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
// prettier-ignore
const AC_VALS = [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];

function huffman(bits: number[], vals: number[]): { code: Uint16Array; size: Uint8Array } {
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
  return { code, size };
}
const DC = huffman(DC_BITS, DC_VALS);
const AC = huffman(AC_BITS, AC_VALS);

// cos((2x + 1) u π / 16) with the 1/2 and 1/√2 factors folded in.
const COS = new Float32Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) COS[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);

export const JPEG_QUALITY = 88;

export function encodeGrayJpeg(px: Uint8Array, width: number, height: number, quality = JPEG_QUALITY): Uint8Array {
  const scale = quality < 50 ? 5000 / quality : 200 - 2 * quality;
  const q = QUANT.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));

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
  bytes(0xff, 0xdb, 0, 67, 0, ...ZIGZAG.map((i) => q[i]));
  bytes(0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0);
  bytes(0xff, 0xc4, 0, 19 + DC_VALS.length, 0x00, ...DC_BITS, ...DC_VALS);
  bytes(0xff, 0xc4, 0, 19 + AC_VALS.length, 0x10, ...AC_BITS, ...AC_VALS);
  bytes(0xff, 0xda, 0, 8, 1, 1, 0x00, 0, 63, 0);

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
  let prevDc = 0;
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      // Blocks past the edge repeat the last row and column.
      for (let y = 0; y < 8; y++) {
        const row = Math.min(height - 1, by + y) * width;
        for (let x = 0; x < 8; x++) block[y * 8 + x] = px[row + Math.min(width - 1, bx + x)] - 128;
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
      for (let i = 0; i < 64; i++) coef[i] = Math.round(block[ZIGZAG[i]] / q[ZIGZAG[i]]);

      const diff = coef[0] - prevDc;
      prevDc = coef[0];
      let n = bitsOf(diff);
      put(DC.code[n], DC.size[n]);
      if (n) put((diff < 0 ? diff - 1 : diff) & ((1 << n) - 1), n);
      let run = 0;
      for (let i = 1; i < 64; i++) {
        const v = coef[i];
        if (!v) {
          run++;
          continue;
        }
        while (run > 15) {
          put(AC.code[0xf0], AC.size[0xf0]);
          run -= 16;
        }
        n = bitsOf(v);
        put(AC.code[(run << 4) | n], AC.size[(run << 4) | n]);
        put((v < 0 ? v - 1 : v) & ((1 << n) - 1), n);
        run = 0;
      }
      if (run) put(AC.code[0], AC.size[0]);
    }
  }
  if (nacc) put((1 << (8 - nacc)) - 1, 8 - nacc);
  bytes(0xff, 0xd9);
  return out.slice(0, at);
}

/* ── Lossless ────────────────────────────────────────────────────────────────────────────────── */

/** Flate with a PNG filter chosen per row (none, left, up or Paeth: whichever leaves the smallest values). */
export function encodeGrayFlate(px: Uint8Array, width: number, height: number): Uint8Array {
  const rows = new Uint8Array((width + 1) * height);
  const tries = [new Uint8Array(width), new Uint8Array(width), new Uint8Array(width), new Uint8Array(width)];
  const kinds = [0, 1, 2, 4];
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let best = 0;
    let bestSum = Infinity;
    for (let t = 0; t < 4; t++) {
      const out = tries[t];
      let sum = 0;
      for (let x = 0; x < width && sum < bestSum; x++) {
        const a = x ? px[row + x - 1] : 0;
        const b = y ? px[row - width + x] : 0;
        let pred = 0;
        if (t === 1) pred = a;
        else if (t === 2) pred = b;
        else if (t === 3) {
          const c = x && y ? px[row - width + x - 1] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (px[row + x] - pred) & 255;
        out[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = t;
      }
    }
    rows[y * (width + 1)] = kinds[best];
    rows.set(tries[best], y * (width + 1) + 1);
  }
  return zlibSync(rows, { level: 6 });
}
