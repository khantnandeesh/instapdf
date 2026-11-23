"use client";
/** Main-thread side of the processing worker. The worker is created on first use. */
import type { Job, JobOutput } from "./jobs";
import type { WorkerRequest, WorkerResponse } from "./processing.worker";

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  worker ??= new Worker(new URL("./processing.worker.ts", import.meta.url), { type: "module", name: "instapdf-processing" });
  return worker;
}

function resetWorker() {
  worker?.terminate();
  worker = null;
}

export function runInWorker(
  job: Job,
  { signal, onProgress, transfer }: { signal?: AbortSignal; onProgress?: (fraction: number) => void; transfer?: Transferable[] },
): Promise<JobOutput> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = nextId++;
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") onProgress?.(msg.value);
      else {
        cleanup();
        if (msg.type === "done") resolve(msg.output);
        else reject(new Error(msg.message));
      }
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      resetWorker();
      reject(new Error(event.message || "Worker failed"));
    };
    const onAbort = () => {
      cleanup();
      resetWorker();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) return onAbort();
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort);
    const request: WorkerRequest = { id, job };
    w.postMessage(request, transfer ?? []);
  });
}
