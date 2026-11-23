/// <reference lib="webworker" />
/** Scans a PDF's raw bytes for catalog markers off the main thread, in chunks (see scan.ts). */
import { createScanner, SCAN_OVERLAP, type PdfMarkers } from "./scan";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const CHUNK = 8 * 1024 * 1024;

scope.onmessage = async (event: MessageEvent<{ id: number; blob: Blob }>) => {
  const { id, blob } = event.data;
  const s = createScanner();
  try {
    for (let start = 0; start < blob.size && !s.done(); start += CHUNK) {
      const from = Math.max(0, start - SCAN_OVERLAP);
      s.feed(new Uint8Array(await blob.slice(from, Math.min(blob.size, start + CHUNK)).arrayBuffer()));
    }
  } catch {
    // Unreadable: report what was found so far.
  }
  scope.postMessage({ id, markers: s.found satisfies PdfMarkers });
};
