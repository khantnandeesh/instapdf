/**
 * Streams a file from a provider into a `File` in the /cloud window, with truthful progress
 * (research §3.2). Chunks are folded into Blob parts every few MB, so a large file lives in the
 * browser's blob store rather than as thousands of small arrays on the JS heap.
 */

export class DownloadError extends Error {
  constructor(
    readonly kind: "access" | "network" | "aborted",
    readonly status = 0,
    /** The provider's own reason for a refusal, when it gives one (Google: `exportSizeLimitExceeded`). */
    readonly reason?: string,
  ) {
    super(`download ${kind}${status ? ` ${status}` : ""}`);
  }
}

const FOLD_BYTES = 8 * 1024 * 1024;

/** Google APIs explain a 403 in a JSON body: `{ error: { errors: [{ reason }] } }`. */
export async function refusalReason(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { errors?: { reason?: unknown }[] } };
    const r = body.error?.errors?.[0]?.reason;
    return typeof r === "string" ? r : undefined;
  } catch {
    return undefined;
  }
}

export type DownloadRequest = { url: string; headers?: Record<string, string>; name: string; type?: string; total?: number };

export async function downloadFile(
  req: DownloadRequest,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<File> {
  let res: Response;
  try {
    res = await fetchImpl(req.url, { headers: req.headers, signal, credentials: "omit", referrerPolicy: "no-referrer" });
  } catch {
    throw new DownloadError(signal?.aborted ? "aborted" : "network");
  }
  if (!res.ok) throw new DownloadError(res.status === 401 || res.status === 403 || res.status === 404 ? "access" : "network", res.status, res.status === 403 ? await refusalReason(res) : undefined);
  const header = Number(res.headers.get("content-length"));
  const total = req.total && req.total > 0 ? req.total : Number.isFinite(header) && header > 0 ? header : 0;
  const type = req.type || res.headers.get("content-type")?.split(";")[0] || "";
  const parts: Blob[] = [];
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let loaded = 0;
  onProgress(0, total);
  const fold = () => {
    if (!pending.length) return;
    parts.push(new Blob(pending as BlobPart[]));
    pending = [];
    pendingBytes = 0;
  };
  if (!res.body) {
    const blob = await res.blob();
    loaded = blob.size;
    parts.push(blob);
  } else {
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending.push(value);
        pendingBytes += value.byteLength;
        loaded += value.byteLength;
        if (pendingBytes >= FOLD_BYTES) fold();
        onProgress(loaded, Math.max(total, loaded));
      }
    } catch {
      throw new DownloadError(signal?.aborted ? "aborted" : "network");
    }
    fold();
  }
  // A body shorter than the size the provider reported means the stream broke off.
  if (total && loaded < total) throw new DownloadError("network");
  onProgress(loaded, Math.max(total, loaded));
  return new File(parts, req.name, { type });
}

/** Runs `fn` over `items`, at most `limit` at a time (downloads go 2 by 2, research §3.2). */
export async function runPool<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
