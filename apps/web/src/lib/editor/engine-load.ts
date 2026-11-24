/**
 * Loading the editor engine on slow connections. Pure, unit tested.
 *
 * - `countBody` wraps a fetch response so each chunk reports progress, and hands back a new
 *   Response that `WebAssembly.instantiateStreaming` can still compile while it streams. The total
 *   is the raw size from manifest.json: the wire size (brotli or gzip) is smaller and
 *   content-length isn't the decoded size.
 * - `earlyFetchAllowed` says whether to fetch before a file is picked: not with Data Saver on or
 *   on a 2g connection.
 */

export type Progress = { loaded: number; total: number };

/** A TransformStream that passes bytes through and reports the running count. */
export function countingStream(total: number, onProgress: (p: Progress) => void): TransformStream<Uint8Array, Uint8Array> {
  let loaded = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      loaded += chunk.byteLength;
      onProgress({ loaded: Math.min(loaded, total), total });
      ctl.enqueue(chunk);
    },
    flush() {
      onProgress({ loaded: total, total });
    },
  });
}

/** The response with its body counted (headers and status kept, so its type stays application/wasm). */
export function countBody(res: Response, total: number, onProgress: (p: Progress) => void): Response {
  if (!res.body) return res;
  const headers = new Headers(res.headers);
  // The body is the decoded bytes now: drop wire-level headers that no longer describe it.
  headers.delete("content-length");
  headers.delete("content-encoding");
  if (!headers.get("content-type")) headers.set("content-type", "application/wasm");
  return new Response(res.body.pipeThrough(countingStream(total, onProgress)), { status: res.status, statusText: res.statusText, headers });
}

/** Whole percent, 0 to 100. */
export const percent = (p: Progress) => (p.total > 0 ? Math.max(0, Math.min(100, Math.floor((p.loaded / p.total) * 100))) : 0);

type ConnectionLike = { saveData?: boolean; effectiveType?: string } | undefined;

/** False with Data Saver on or on a 2g / slow-2g connection: fetch on file open instead. */
export function earlyFetchAllowed(connection: ConnectionLike): boolean {
  if (!connection) return true;
  if (connection.saveData) return false;
  return !/(^|-)2g$/.test(connection.effectiveType ?? "");
}
