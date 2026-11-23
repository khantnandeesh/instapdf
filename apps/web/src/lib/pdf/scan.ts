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
/** Longest name plus its slash: the overlap kept between chunks. */
export const SCAN_OVERLAP = 16;

/** Scanner state across chunks: feed chunks in order (each starting SCAN_OVERLAP bytes before the previous end). */
export function createScanner() {
  const found: PdfMarkers = { signed: false, outputIntents: false, structTree: false };
  return {
    found,
    done: () => found.signed && found.outputIntents && found.structTree,
    feed(chunk: Uint8Array) {
      const n = chunk.length;
      for (let i = 0; i < n - 2; i++) {
        if (chunk[i] !== 0x2f) continue;
        const names = BY_FIRST[chunk[i + 1]];
        if (!names) continue;
        for (const name of names) {
          if (found[name.key] || i + 2 + name.rest.length > n) continue;
          let k = 0;
          while (k < name.rest.length && chunk[i + 2 + k] === name.rest[k]) k++;
          if (k === name.rest.length) found[name.key] = true;
        }
      }
    },
  };
}

export function scanMarkers(bytes: Uint8Array): PdfMarkers {
  const s = createScanner();
  s.feed(bytes);
  return s.found;
}
