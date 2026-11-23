/// <reference lib="webworker" />
/** Scans a PDF's raw bytes for catalog markers off the main thread, in chunks (see scan.ts). */
import { scanBlob, type PdfMarkers } from "./scan";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const NONE: PdfMarkers = { signed: false, outputIntents: false, structTree: false };

scope.onmessage = async (event: MessageEvent<{ id: number; blob: Blob }>) => {
  const { id, blob } = event.data;
  let markers = NONE;
  try {
    markers = await scanBlob(blob);
  } catch {
    // Unreadable file: no markers (the notice falls back to what pdf.js reports).
  }
  scope.postMessage({ id, markers });
};
