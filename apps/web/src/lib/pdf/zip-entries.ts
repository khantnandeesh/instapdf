/**
 * Per-entry downloads from a result ZIP (spec F4/F5 UI P-3 "Result", decision 7). Our ZIPs store
 * their entries uncompressed (zip.ts), so each entry is a byte range of the ZIP Blob: this reads
 * the central directory and hands out `Blob.slice`s, which copy nothing. Pure apart from the
 * Blob reads; unit tested against createZipWriter's output.
 */

export type ZipEntrySlice = { name: string; start: number; size: number };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

async function bytesAt(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

/**
 * The stored entries of a ZIP, in directory order. Returns null when the file is not a ZIP we can
 * slice (no end record, ZIP64, or a compressed entry), so the caller simply offers no per-entry links.
 */
export async function storedZipEntries(blob: Blob): Promise<ZipEntrySlice[] | null> {
  const tailStart = Math.max(0, blob.size - (22 + 0xffff));
  const tail = await bytesAt(blob, tailStart, blob.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = tail.getUint16(eocd + 10, true);
  const dirSize = tail.getUint32(eocd + 12, true);
  const dirStart = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || dirStart === 0xffffffff || dirStart + dirSize > blob.size) return null;
  const dir = await bytesAt(blob, dirStart, dirStart + dirSize);
  const decoder = new TextDecoder();
  const out: ZipEntrySlice[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > dir.byteLength || dir.getUint32(p, true) !== CENTRAL) return null;
    const method = dir.getUint16(p + 10, true);
    const size = dir.getUint32(p + 20, true);
    const nameLen = dir.getUint16(p + 28, true);
    const extraLen = dir.getUint16(p + 30, true);
    const commentLen = dir.getUint16(p + 32, true);
    const local = dir.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen));
    if (method !== 0 || size === 0xffffffff || local === 0xffffffff) return null;
    const head = await bytesAt(blob, local, local + 30);
    if (head.byteLength < 30 || head.getUint32(0, true) !== LOCAL) return null;
    const start = local + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    if (start + size > blob.size) return null;
    out.push({ name, start, size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** One entry as its own file (a view of the ZIP's bytes). */
export const entryBlob = (zip: Blob, e: ZipEntrySlice, type = "application/pdf") => zip.slice(e.start, e.start + e.size, type);
