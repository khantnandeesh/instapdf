"use client";
/** Main-thread side of the download worker. Created on the first Download intent (pointerenter/focus) or click. */
import type { BuildInput } from "./build";
import type { BuildResponse } from "./build.worker";
import type { FormState } from "@/lib/forms/types";

let worker: Worker | null = null;
let nextId = 1;
/** Rejects the builds still running (when the worker is stopped). */
const pending = new Map<number, (e: Error) => void>();

/** Stops the worker (the editor closed); a running build is rejected. */
export function disposeBuild(): void {
  if (!worker) return;
  worker.terminate();
  worker = null;
  for (const reject of pending.values()) reject(new Error("closed"));
  pending.clear();
}

function getWorker(): Worker {
  worker ??= new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module", name: "berry-build" });
  return worker;
}

/** Starts the worker (and its pdf-lib chunk) early, on Download intent. */
export function warmBuild(): void {
  getWorker().postMessage({ id: 0, warm: true });
}

/** True when `password` is the file's owner password (checked in the download worker). */
export function checkOwnerPassword(bytes: Uint8Array, password: string): Promise<boolean> {
  return request({ owner: { bytes, password } }).then((r) => "owner" in r && r.owner);
}

/** Reads the file's form fields (lib/forms/read) in the download worker, where pdf-lib lives. */
export function readFormsInWorker(bytes: Uint8Array, password?: string): Promise<{ forms: FormState; xfa: boolean }> {
  return request({ forms: { bytes, password } }).then((r) => {
    if (!("forms" in r)) throw new Error("Unexpected reply");
    return { forms: r.forms, xfa: r.xfa };
  });
}

/**
 * Builds the download in the worker. Aborting `signal` (F25 Cancel) stops the worker at once, rejects
 * with an AbortError and starts a fresh warm worker for the next try.
 */
export function buildInWorker(input: BuildInput, opts: { signal?: AbortSignal } = {}): Promise<Uint8Array> {
  const { signal } = opts;
  if (signal?.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
  const onAbort = () => {
    disposeBuild();
    warmBuild();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  return request({ input })
    .then(
      (r) => {
        if (!("bytes" in r)) throw new Error("Unexpected reply");
        return r.bytes;
      },
      (e) => {
        throw signal?.aborted ? new DOMException("Cancelled", "AbortError") : e;
      },
    )
    .finally(() => signal?.removeEventListener("abort", onAbort));
}

type Ok = Extract<BuildResponse, { ok: true }>;
type Body = { input: BuildInput } | { owner: { bytes: Uint8Array; password: string } } | { forms: { bytes: Uint8Array; password?: string } };

function request(body: Body): Promise<Ok> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = nextId++;
    const done = () => {
      pending.delete(id);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    pending.set(id, (e) => {
      done();
      reject(e);
    });
    const onMessage = (e: MessageEvent<BuildResponse>) => {
      if (e.data.id !== id) return;
      done();
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.message));
    };
    const onError = (e: ErrorEvent) => {
      done();
      if (worker === w) {
        w.terminate();
        worker = null;
      }
      reject(new Error(e.message || "Build worker failed"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    // Copies (not transfers) the bytes: the editor keeps its own for further edits.
    w.postMessage({ id, ...body });
  });
}
