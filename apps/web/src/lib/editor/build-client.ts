"use client";
/** Main-thread side of the download worker. Created on the first Download intent (pointerenter/focus) or click. */
import type { BuildInput } from "./build";
import type { BuildResponse } from "./build.worker";
import type { FormState } from "@/lib/forms/types";

type Ok = Extract<BuildResponse, { ok: true }>;
type Body = { input: BuildInput } | { owner: { bytes: Uint8Array; password: string } } | { forms: { bytes: Uint8Array; password?: string } };
// `body` is kept only for the small requests (a build's bytes are not held twice): those are the ones moved.
type Entry = { body: Body | null; resolve: (r: Ok) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
/** The requests still waiting for a reply, with what they asked, so they can be sent again to a new worker. */
const pending = new Map<number, Entry>();

const abortError = (message: string) => new DOMException(message, "AbortError");

/** Stops the worker (the editor closed): every request still running rejects with an AbortError ("closed"). */
export function disposeBuild(): void {
  if (!worker) return;
  worker.terminate();
  worker = null;
  const left = [...pending.values()];
  pending.clear();
  for (const e of left) e.reject(abortError("closed"));
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module", name: "berry-build" });
  w.addEventListener("message", (e: MessageEvent<BuildResponse>) => {
    const entry = pending.get(e.data.id);
    if (!entry || worker !== w) return;
    pending.delete(e.data.id);
    if (e.data.ok) entry.resolve(e.data);
    else entry.reject(new Error(e.data.message));
  });
  w.addEventListener("error", (e: ErrorEvent) => {
    if (worker !== w) return;
    w.terminate();
    worker = null;
    const left = [...pending.values()];
    pending.clear();
    for (const entry of left) entry.reject(new Error(e.message || "Build worker failed"));
  });
  worker = w;
  return w;
}

/** Starts the worker (and its pdf-lib chunk) early, on Download intent. */
export function warmBuild(): void {
  getWorker().postMessage({ id: 0, warm: true });
}

/** Warms a fresh worker when the main thread is idle (after a Cancel), so the next Download starts at once. */
function warmWhenIdle(): void {
  const go = () => {
    if (!worker) warmBuild();
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 2000 });
  else setTimeout(go, 200);
}

/**
 * Stops one request by stopping the worker it runs in. The other requests in flight (a form read, an
 * owner-password check) are sent again to a fresh worker, so they still answer.
 */
function stopRequest(id: number): void {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  worker?.terminate();
  worker = null;
  entry.reject(abortError("Cancelled"));
  if (pending.size) {
    const w = getWorker();
    for (const [otherId, other] of pending) {
      if (other.body) w.postMessage({ id: otherId, ...other.body });
      else {
        pending.delete(otherId);
        other.reject(abortError("Cancelled"));
      }
    }
  } else warmWhenIdle();
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
 * Builds the download in the worker. Aborting `signal` (F25 Cancel) stops the worker at once and rejects
 * with an AbortError; other requests in flight move to a fresh worker, otherwise one is warmed on idle.
 */
export function buildInWorker(input: BuildInput, opts: { signal?: AbortSignal } = {}): Promise<Uint8Array> {
  return request({ input }, opts.signal).then((r) => {
    if (!("bytes" in r)) throw new Error("Unexpected reply");
    return r.bytes;
  });
}

function request(body: Body, signal?: AbortSignal): Promise<Ok> {
  if (signal?.aborted) return Promise.reject(abortError("Cancelled"));
  return new Promise<Ok>((resolve, reject) => {
    const id = nextId++;
    const onAbort = () => stopRequest(id);
    const settle = () => signal?.removeEventListener("abort", onAbort);
    pending.set(id, {
      body: "input" in body ? null : body,
      resolve: (r) => (settle(), resolve(r)),
      reject: (e) => (settle(), reject(e)),
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    // Copies (not transfers) the bytes: the editor keeps its own for further edits.
    getWorker().postMessage({ id, ...body });
  });
}
