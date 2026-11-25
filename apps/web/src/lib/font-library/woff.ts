/**
 * Unpacks a WOFF 1.0 file to the TrueType or OpenType file inside it, in the browser (the same
 * work scripts/font-library/sfnt.mjs does at build time). Null when the bytes are not a sound WOFF.
 */
async function inflate(data: Uint8Array, size: number): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
    const out = new Uint8Array(await new Response(stream).arrayBuffer());
    return out.length === size ? out : null;
  } catch {
    return null;
  }
}

export async function woffToSfnt(woff: Uint8Array): Promise<Uint8Array | null> {
  if (woff.length < 44 || String.fromCharCode(...woff.subarray(0, 4)) !== "wOFF") return null;
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  const numTables = view.getUint16(12);
  if (!numTables || 44 + numTables * 20 > woff.length || view.getUint32(16) > 64 * 1024 * 1024) return null;
  const tables: { tag: Uint8Array; checksum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const [offset, compLength, origLength] = [view.getUint32(o + 4), view.getUint32(o + 8), view.getUint32(o + 12)];
    if (offset + compLength > woff.length || compLength > origLength || origLength > 64 * 1024 * 1024) return null;
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? await inflate(raw, origLength) : raw;
    if (!data) return null;
    tables.push({ tag: woff.subarray(o, o + 4), checksum: view.getUint32(o + 16), data });
  }
  const pow = 2 ** Math.floor(Math.log2(numTables));
  let offset = 12 + numTables * 16;
  const out = new Uint8Array(tables.reduce((n, t) => n + ((t.data.length + 3) & ~3), offset));
  const w = new DataView(out.buffer);
  w.setUint32(0, view.getUint32(4));
  w.setUint16(4, numTables);
  w.setUint16(6, pow * 16);
  w.setUint16(8, Math.log2(pow));
  w.setUint16(10, numTables * 16 - pow * 16);
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    out.set(t.tag, o);
    w.setUint32(o + 4, t.checksum);
    w.setUint32(o + 8, offset);
    w.setUint32(o + 12, t.data.length);
    out.set(t.data, offset);
    offset += (t.data.length + 3) & ~3;
  });
  return out;
}
