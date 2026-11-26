/**
 * The client side of a server tool's job (F25 §6 "Server phases"). This PR ships the UI contract
 * only: no job API exists yet, so the HTTP shape below is what the first server tool's backend must
 * serve (and `e2e/ui/progress-pill.spec.ts` mocks it with Playwright routes):
 *
 * - `POST   {base}`          multipart (`tool`, `options` JSON, `file`…), upload progress reported
 *                            through XHR → `{ id }`
 * - `GET    {base}/{id}`     → `{ state: "queued", position, etaSeconds? }` | `{ state: "working", progress? }`
 *                            | `{ state: "done", url, name }` | `{ state: "failed", message }`
 * - `GET    {url}`           the result's bytes
 * - `DELETE {base}/{id}`     dequeue, stop the worker task and delete the upload (2xx = deleted)
 *
 * The flow sees only phases (`onPhase`) and a cancel hook (`onCancel`), so the action pill is the same
 * for browser and server tools. Requests go to our own origin (`connect-src 'self'`).
 */
import type { PillProgress } from "@/components/tool-flow/announce";
import { USER_ERROR } from "@/lib/pdf/user-error";

export type JobStatus =
  | { state: "queued"; position: number; etaSeconds?: number }
  | { state: "working"; progress?: number }
  | { state: "done"; url: string; name: string }
  | { state: "failed"; message: string };

/** What the pill needs from a server job; a fake one in tests. */
export interface JobApi {
  create(input: JobInput, onUpload: (fraction: number) => void, signal: AbortSignal): Promise<{ id: string }>;
  status(id: string, signal: AbortSignal): Promise<JobStatus>;
  result(url: string, signal: AbortSignal): Promise<Blob>;
  /** True when the server confirmed the job and its upload are gone. */
  cancel(id: string): Promise<boolean>;
}

export type JobInput = { tool: string; files: { name: string; blob: Blob }[]; options: Record<string, unknown> };

export type JobHooks = {
  signal: AbortSignal;
  onPhase: (p: PillProgress) => void;
  /** Registers what Cancel must do once the job exists (send DELETE); resolves true when deleted. */
  onCancel: (cancel: () => Promise<boolean>) => void;
  pollMs?: number;
};

const abortError = () => new DOMException("Aborted", "AbortError");

export function httpJobApi(base = "/api/jobs"): JobApi {
  return {
    create(input, onUpload, signal) {
      return new Promise((resolve, reject) => {
        const form = new FormData();
        form.set("tool", input.tool);
        form.set("options", JSON.stringify(input.options));
        for (const f of input.files) form.append("file", f.blob, f.name);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", base);
        xhr.responseType = "json";
        xhr.upload.onprogress = (e) => e.lengthComputable && onUpload(e.loaded / e.total);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 && xhr.response?.id ? resolve({ id: String(xhr.response.id) }) : reject(new Error(xhr.response?.message ?? `Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Upload failed"));
        const stop = () => {
          xhr.abort();
          reject(abortError());
        };
        if (signal.aborted) return stop();
        signal.addEventListener("abort", stop, { once: true });
        xhr.send(form);
      });
    },
    async status(id, signal) {
      const r = await fetch(`${base}/${encodeURIComponent(id)}`, { signal, cache: "no-store" });
      if (!r.ok) throw new Error(`Status failed (${r.status})`);
      return (await r.json()) as JobStatus;
    },
    async result(url, signal) {
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      return r.blob();
    },
    async cancel(id) {
      try {
        const r = await fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
        return r.ok;
      } catch {
        return false;
      }
    },
  };
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(abortError())), { once: true });
  });

/** Upload, wait in the queue, work, done: each step reported as a pill phase. Polling stops at once on abort. */
export async function runServerJob(api: JobApi, input: JobInput, { signal, onPhase, onCancel, pollMs = 1000 }: JobHooks): Promise<{ blob: Blob; name: string }> {
  onPhase({ phase: "upload", fraction: 0 });
  const { id } = await api.create(input, (fraction) => onPhase({ phase: "upload", fraction }), signal);
  onCancel(() => api.cancel(id));
  if (signal.aborted) throw abortError();
  for (;;) {
    const s = await api.status(id, signal);
    if (signal.aborted) throw abortError();
    if (s.state === "queued") onPhase({ phase: "queue", position: s.position, etaSeconds: s.etaSeconds });
    else if (s.state === "working") onPhase({ phase: "work", fraction: s.progress });
    // The server says what to do ("Server tools are paused until tomorrow…"): shown as is.
    else if (s.state === "failed") throw new Error(USER_ERROR + s.message);
    else return { blob: await api.result(s.url, signal), name: s.name };
    await wait(pollMs, signal);
  }
}
