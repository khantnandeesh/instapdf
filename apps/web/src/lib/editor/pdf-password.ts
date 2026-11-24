/**
 * Which password of a PDF's standard security handler a password is: the owner one, the user
 * (open) one, or neither. pdf.js and pdf-lib open a file with either and don't say which, so the
 * checks of ISO 32000-2 §7.6.4 are done here (owner first: a password that is both is the owner's).
 * Pure apart from Web Crypto (SHA-2, AES-CBC); MD5 and RC4 are small and written out. Unit tested on
 * files of each revision (R2 to R6).
 */

export type EncryptInfo = {
  /** Revision (R) and key length in bytes. */
  r: number;
  length: number;
  o: Uint8Array;
  u: Uint8Array;
  p: number;
  id: Uint8Array;
  encryptMetadata: boolean;
};

export type PasswordKind = "owner" | "user" | null;

const PAD = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

// ---- MD5 (RFC 1321) ----
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(data: Uint8Array): Uint8Array {
  const n = data.length;
  const padded = new Uint8Array(((n + 72) >>> 6) << 6);
  padded.set(data);
  padded[n] = 0x80;
  const bits = n * 8;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bits >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bits / 2 ** 32), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const m = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) m[i] = dv.getUint32(off + i * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      const r = i >> 4;
      const f = r === 0 ? (b & c) | (~b & d) : r === 1 ? (d & b) | (~d & c) : r === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const g = r === 0 ? i : r === 1 ? (5 * i + 1) % 16 : r === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const t = d;
      d = c;
      c = b;
      const x = (a + f + K[i]! + m[g]!) >>> 0;
      b = (b + ((x << S[i]!) | (x >>> (32 - S[i]!)))) >>> 0;
      a = t;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((w, i) => ov.setUint32(i * 4, w, true));
  return out;
}

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256).map((_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 255;
    [s[i], s[j]] = [s[j]!, s[i]!];
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]!) & 255;
    [s[i], s[j]] = [s[j]!, s[i]!];
    out[k] = data[k]! ^ s[(s[i]! + s[j]!) & 255]!;
  }
  return out;
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const padded = (pw: Uint8Array) => concat(pw.subarray(0, 32), PAD.subarray(0, 32 - Math.min(32, pw.length)));
/** PDFDocEncoding codes that differ from Latin-1 (ISO 32000-2 Annex D): code → Unicode. */
const PDFDOC_SPECIAL: Record<number, number> = {
  0x18: 0x02d8, 0x19: 0x02c7, 0x1a: 0x02c6, 0x1b: 0x02d9, 0x1c: 0x02dd, 0x1d: 0x02db, 0x1e: 0x02da, 0x1f: 0x02dc,
  0x80: 0x2022, 0x81: 0x2020, 0x82: 0x2021, 0x83: 0x2026, 0x84: 0x2014, 0x85: 0x2013, 0x86: 0x0192, 0x87: 0x2044,
  0x88: 0x2039, 0x89: 0x203a, 0x8a: 0x2212, 0x8b: 0x2030, 0x8c: 0x201e, 0x8d: 0x201c, 0x8e: 0x201d, 0x8f: 0x2018,
  0x90: 0x2019, 0x91: 0x201a, 0x92: 0x2122, 0x93: 0xfb01, 0x94: 0xfb02, 0x95: 0x0141, 0x96: 0x0152, 0x97: 0x0160,
  0x98: 0x0178, 0x99: 0x017d, 0x9a: 0x0131, 0x9b: 0x0142, 0x9c: 0x0153, 0x9d: 0x0161, 0x9e: 0x017e, 0xa0: 0x20ac,
};
const FROM_UNICODE = new Map(Object.entries(PDFDOC_SPECIAL).map(([code, cp]) => [cp, Number(code)]));

/**
 * R2 to R4 passwords are bytes in PDFDocEncoding. Null when a character has no code there (it
 * can't be the password: truncating it to a byte could match a different one). U+00AD (soft
 * hyphen) has none: 0xAD is undefined in PDFDocEncoding.
 */
export function pdfDocBytes(s: string): Uint8Array | null {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const special = FROM_UNICODE.get(cp);
    if (special !== undefined) out.push(special);
    else if (cp <= 0xff && !(cp >= 0x18 && cp <= 0x1f) && !(cp >= 0x7f && cp <= 0xa0) && cp !== 0xad) out.push(cp);
    else return null;
  }
  return Uint8Array.from(out);
}
const xorKey = (key: Uint8Array, i: number) => key.map((b) => b ^ i);

// ---- R2 to R4 (RC4 / AES-128) ----

/** Algorithm 6: the user password check. */
function isUserLegacy(e: EncryptInfo, pw: Uint8Array): boolean {
  const n = e.r === 2 ? 5 : e.length;
  const p = new Uint8Array(4);
  new DataView(p.buffer).setInt32(0, e.p, true);
  let key = md5(concat(padded(pw), e.o.subarray(0, 32), p, e.id, e.r >= 4 && !e.encryptMetadata ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array()));
  if (e.r >= 3) for (let i = 0; i < 50; i++) key = md5(key.subarray(0, n));
  key = key.subarray(0, n);
  if (e.r === 2) return equal(rc4(key, PAD), e.u.subarray(0, 32));
  let x = rc4(key, md5(concat(PAD, e.id)));
  for (let i = 1; i <= 19; i++) x = rc4(xorKey(key, i), x);
  return equal(x, e.u.subarray(0, 16));
}

/** Algorithm 7: the owner password decrypts O to the user password. */
function isOwnerLegacy(e: EncryptInfo, pw: Uint8Array): boolean {
  const n = e.r === 2 ? 5 : e.length;
  let key = md5(padded(pw));
  if (e.r >= 3) for (let i = 0; i < 50; i++) key = md5(key);
  key = key.subarray(0, n);
  let user = e.o.subarray(0, 32);
  if (e.r === 2) user = rc4(key, user);
  else for (let i = 19; i >= 0; i--) user = rc4(xorKey(key, i), user);
  return isUserLegacy(e, user);
}

// ---- R5 and R6 (AES-256) ----

const subtle = () => globalThis.crypto.subtle;
const sha = async (name: "SHA-256" | "SHA-384" | "SHA-512", d: Uint8Array) => new Uint8Array(await subtle().digest(name, d as Uint8Array<ArrayBuffer>));

/** Algorithm 2.B (R6), or plain SHA-256 (R5). `extra` is U[0:48] for the owner check. */
async function hash2B(e: EncryptInfo, pw: Uint8Array, salt: Uint8Array, extra: Uint8Array): Promise<Uint8Array> {
  let k = await sha("SHA-256", concat(pw, salt, extra));
  if (e.r === 5) return k;
  for (let i = 0; ; i++) {
    const one = concat(pw, k, extra);
    const k1 = new Uint8Array(one.length * 64);
    for (let j = 0; j < 64; j++) k1.set(one, j * one.length);
    const aes = await subtle().importKey("raw", k.slice(0, 16), { name: "AES-CBC" }, false, ["encrypt"]);
    // Web Crypto adds a padding block; k1 is a whole number of blocks, so it is cut off.
    const enc = new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv: k.slice(16, 32) }, aes, k1)).subarray(0, k1.length);
    let mod = 0;
    for (let j = 0; j < 16; j++) mod += enc[j]!;
    k = await sha(mod % 3 === 0 ? "SHA-256" : mod % 3 === 1 ? "SHA-384" : "SHA-512", enc);
    if (i >= 63 && enc[enc.length - 1]! <= i + 1 - 32) break;
  }
  return k.subarray(0, 32);
}

/** UTF-8, cut to 127 bytes (SASLprep is left out: it changes no password a person types here). */
const utf8 = (s: string) => new TextEncoder().encode(s.normalize("NFKC")).subarray(0, 127);

export async function passwordKind(e: EncryptInfo, password: string): Promise<PasswordKind> {
  if (e.r >= 5) {
    const pw = utf8(password);
    if (equal(await hash2B(e, pw, e.o.subarray(32, 40), e.u.subarray(0, 48)), e.o.subarray(0, 32))) return "owner";
    if (equal(await hash2B(e, pw, e.u.subarray(32, 40), new Uint8Array()), e.u.subarray(0, 32))) return "user";
    return null;
  }
  // PDFDocEncoding first (the standard), then the UTF-8 bytes, as qpdf also tries: some tools
  // write a non-Latin password that way.
  const doc = pdfDocBytes(password);
  const raw = new TextEncoder().encode(password);
  const tries = [doc, doc && equal(doc, raw) ? null : raw].filter((x): x is Uint8Array => !!x);
  for (const pw of tries) if (isOwnerLegacy(e, pw)) return "owner";
  for (const pw of tries) if (isUserLegacy(e, pw)) return "user";
  return null;
}
