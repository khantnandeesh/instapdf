/**
 * Raw-byte scan for catalog keys pdf.js does not expose (PR #7 addendum C):
 * one pass over the bytes, chunk by chunk. Keys inside compressed object
 * streams are not seen. Pure, unit tested; runs in scan.worker.ts.
 */

/** Catalog keys found in a file's raw bytes. */
export type PdfMarkers = { signed: boolean; outputIntents: boolean; structTree: boolean };

const codes = (t: string) => [...t].map((c) => c.charCodeAt(0));
/** Names by their first letter, so most slashes cost one comparison. */
const BY_FIRST: Record<number, { key: keyof PdfMarkers; rest: number[] }[]> = {
  0x42: [{ key: "signed", rest: codes("yteRange") }], // B
  0x53: [
    { key: "signed", rest: codes("igFlags") }, // S
    { key: "structTree", rest: codes("tructTreeRoot") },
  ],
  0x4f: [{ key: "outputIntents", rest: codes("utputIntents") }], // O
};
/** Longest name with its slash and the byte after it: the overlap kept between chunks. */
export const SCAN_OVERLAP = 16;

/** PDF white-space and delimiter bytes: a name ends at one of these (or at the end of the file). */
const ENDS_NAME = new Uint8Array(256);
for (const c of [0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20, 0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]) ENDS_NAME[c] = 1;

/**
 * Scanner state across chunks. Feed chunks in order, each starting
 * SCAN_OVERLAP bytes before the previous one ended, and mark the last one
 * `final`: a name that runs into the end of a non-final chunk is left for
 * the next chunk, which sees it whole along with the byte after it.
 */
export function createScanner() {
  const found: PdfMarkers = { signed: false, outputIntents: false, structTree: false };
  return {
    found,
    done: () => found.signed && found.outputIntents && found.structTree,
    feed(chunk: Uint8Array, final = false) {
      const n = chunk.length;
      for (let i = 0; i + 1 < n; i++) {
        if (chunk[i] !== 0x2f) continue;
        const names = BY_FIRST[chunk[i + 1]];
        if (!names) continue;
        for (const name of names) {
          const end = i + 2 + name.rest.length; // index just past the name
          if (found[name.key] || end > n) continue;
          let k = 0;
          while (k < name.rest.length && chunk[i + 2 + k] === name.rest[k]) k++;
          if (k < name.rest.length) continue;
          if (end === n ? final : ENDS_NAME[chunk[end]] === 1) found[name.key] = true;
        }
      }
    },
  };
}

export function scanMarkers(bytes: Uint8Array): PdfMarkers {
  const s = createScanner();
  s.feed(bytes, true);
  return s.found;
}

/** Reads a file in chunks and scans it (stops early once every marker is found). */
export async function scanBlob(blob: Blob, chunkSize = 8 * 1024 * 1024): Promise<PdfMarkers> {
  const s = createScanner();
  for (let start = 0; start < blob.size && !s.done(); start += chunkSize) {
    const end = Math.min(blob.size, start + chunkSize);
    s.feed(new Uint8Array(await blob.slice(Math.max(0, start - SCAN_OVERLAP), end).arrayBuffer()), end === blob.size);
  }
  return s.found;
}
