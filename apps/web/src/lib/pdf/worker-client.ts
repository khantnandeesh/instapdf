"use client";
/** Main-thread side of the processing worker. The worker is created on first use. */
import type { Job, JobOutput } from "./jobs";
import type { WorkerRequest, WorkerResponse } from "./processing.worker";

let worker: Worker | null = null;
let nextId = 1;
/** Rejecters of the jobs in flight, so disposing the worker settles them. */
const inFlight = new Set<(reason: unknown) => void>();

function getWorker(): Worker {
  worker ??= new Worker(new URL("./processing.worker.ts", import.meta.url), { type: "module", name: "instapdf-processing" });
  return worker;
}

/** Starts the worker ahead of its first job, so the job does not wait for the worker's code to arrive. */
export function warmWorker(): void {
  getWorker();
}

/** Terminates the worker (stopping any running job) and rejects jobs in flight. */
export function disposeWorker(): void {
  worker?.terminate();
  worker = null;
  const pending = [...inFlight];
  inFlight.clear();
  for (const reject of pending) reject(new DOMException("Aborted", "AbortError"));
}

/** Runs a job in the worker. Inputs are Blobs: posting them copies no bytes. */
export function runInWorker(
  job: Job,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (fraction: number, phase?: "fonts" | "pages") => void },
): Promise<JobOutput> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const w = getWorker();
    const id = nextId++;
    const settle = (fn: () => void) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      inFlight.delete(fail);
      fn();
    };
    const fail = (reason: unknown) => settle(() => reject(reason));
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") onProgress?.(msg.value, msg.phase);
      else if (msg.type === "done") settle(() => resolve(msg.output));
      else fail(new Error(msg.message));
    };
    const onError = (event: ErrorEvent) => {
      fail(new Error(event.message || "Worker failed"));
      if (worker === w) disposeWorker(); // never kill a newer worker
    };
    const onAbort = () => {
      fail(new DOMException("Aborted", "AbortError"));
      if (worker === w) disposeWorker(); // the only way to stop a job that is mid-way
    };
    inFlight.add(fail);
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort);
    const request: WorkerRequest = { id, job };
    w.postMessage(request);
  });
}
