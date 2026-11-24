"use client";
/**
 * Main-thread side of the editor engine worker. The worker (and the WebAssembly module it
 * loads) is created on the first call: `preloadEngine` when /edit-pdf is idle (not on Data Saver
 * or 2g), or opening a file. Its load progress is published for the "Edit text" ring.
 * After a crash (WebAssembly.RuntimeError: the instance is unusable) the worker is dropped
 * and the next call starts a fresh one; the caller reopens its last good bytes.
 */
import type { BerryError } from "./berry-engine";
import { ENGINE_WASM_BYTES } from "./engine-assets";
import type { EngineReply, EngineRequest, EngineResponse } from "./engine.worker";

/**
 * `crashed`: this call crashed the module or timed out; the worker is gone and the caller should
 * reopen its last good bytes. `aborted`: another call crashed the worker while this one waited.
 */
export type EngineError = BerryError | { kind: "crashed" } | { kind: "aborted" } | { kind: "internal"; message: string };

/**
 * A call that takes longer is treated as a hang and the worker is terminated: 20 s, plus 1 s per
 * 2 MB of the open file (an edit on a big file parses it three times).
 */
export function engineTimeoutMs(fileBytes: number): number {
  return 20_000 + Math.ceil(fileBytes / (2 * 1024 * 1024)) * 1000;
}
let fileBytes = 0;
/** Tells the watchdog how big the open file is. */
export function setEngineFileSize(bytes: number): void {
  fileBytes = bytes;
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
type Call = DistributiveOmit<EngineRequest, "id">;
type ReplyFor<O extends Call["op"]> = Extract<EngineReply, { op: O }>;

let worker: Worker | null = null;
let nextId = 1;
type Pending = { resolve: (r: EngineReply) => void; reject: (e: EngineError) => void; timer: ReturnType<typeof setTimeout> | null; ms: number };
const pending = new Map<number, Pending>();

/** Engine download and compile state (one per page). */
export type EngineStatus = { state: "idle" | "loading" | "ready" | "failed"; loaded: number; total: number; cached?: boolean };
let status: EngineStatus = { state: "idle", loaded: 0, total: ENGINE_WASM_BYTES };
const listeners = new Set<() => void>();
function setStatus(next: Partial<EngineStatus>) {
  status = { ...status, ...next };
  listeners.forEach((l) => l());
}
export const getEngineStatus = () => status;
export function subscribeEngine(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The hang watchdog runs only once the engine is compiled: a slow download isn't a hang. */
function arm(id: number, p: Pending) {
  if (p.timer || status.state !== "ready") return;
  p.timer = setTimeout(() => crash(id), p.ms);
}

/** Terminates the worker. Calls still waiting are rejected with `aborted`. */
export function disposeEngine(): void {
  worker?.terminate();
  worker = null;
  const all = [...pending.values()];
  pending.clear();
  for (const p of all) {
    if (p.timer) clearTimeout(p.timer);
    p.reject({ kind: "aborted" });
  }
  // The files stay in the HTTP cache: a new worker compiles them again without a download.
  if (status.state !== "failed") setStatus({ state: "idle", loaded: 0 });
}

/** Settles call `id` with `crashed` and drops the worker. */
function crash(id: number) {
  const p = pending.get(id);
  pending.delete(id);
  if (p?.timer) clearTimeout(p.timer);
  disposeEngine();
  p?.reject({ kind: "crashed" });
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module", name: "berry-engine" });
  w.onmessage = (event: MessageEvent<EngineResponse>) => {
    const msg = event.data;
    if (worker !== w) return;
    if ("progress" in msg) {
      setStatus({ state: msg.ready ? "ready" : "loading", loaded: msg.progress.loaded, total: msg.progress.total, ...(msg.ready ? { cached: !!msg.cached } : {}) });
      if (msg.ready) pending.forEach((p, id) => arm(id, p));
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    if (!msg.ok && msg.error.kind === "crashed") return crash(msg.id);
    pending.delete(msg.id);
    if (p.timer) clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.reply);
    else {
      // The download or compile failed (offline, server error): offer a retry.
      if (status.state !== "ready") setStatus({ state: "failed" });
      p.reject(msg.error);
    }
  };
  w.onerror = (event) => {
    event.preventDefault();
    if (worker !== w) return;
    const first = pending.keys().next();
    if (first.done) disposeEngine();
    else crash(first.value);
  };
  worker = w;
  return w;
}

export function callEngine<C extends Call>(call: C, transfer: Transferable[] = []): Promise<ReplyFor<C["op"]>> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const p: Pending = { resolve: resolve as (r: EngineReply) => void, reject, timer: null, ms: engineTimeoutMs(call.op === "open" ? call.bytes.length : fileBytes) };
    pending.set(id, p);
    const w = getWorker();
    if (status.state === "idle" || status.state === "failed") setStatus({ state: "loading", loaded: 0 });
    arm(id, p);
    w.postMessage({ ...call, id } as EngineRequest, transfer);
  });
}

/** Starts the engine download early (idle on /edit-pdf). Resolves when it's compiled; never throws. */
export function preloadEngine(priority: "low" | "high" = "low"): Promise<boolean> {
  if (status.state === "ready" || status.state === "loading") return Promise.resolve(status.state === "ready");
  return callEngine({ op: "load", priority }).then(
    () => true,
    () => false,
  );
}

/** Short user-facing text for an engine error. */
/** What the user is told when an edit is refused. Never quotes the engine's own message. */
export function describeEngineError(e: EngineError): string {
  switch (e.kind) {
    case "missing-glyphs":
      return `This font in the file has no ${[...new Set(e.chars)].map((c) => `“${c}”`).join(" ")}.`;
    case "read-only":
    case "unsupported":
      return "This line can’t be edited yet.";
    case "encrypted":
      return "Password-protected PDFs aren’t supported in the beta yet.";
    case "parse":
      return "This file couldn’t be read as a PDF.";
    case "crashed":
    case "aborted":
      return "The editor restarted. Please try that again.";
    case "verify":
      if (e.reason === "overflow") return "The edited line would run past the page edge.";
      if (e.reason === "overlap") return "The edited line would run into the text next to it.";
      return "We couldn’t apply this edit safely, so the line is unchanged. Try a shorter change, or replace the line with new text.";
    case "save":
      return "Saving this edit failed, so the line is unchanged. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** True when "Replace with new text" (cover the line, add a text box in its place) can stand in for an edit the engine refused. */
export function offersLineReplacement(e: EngineError): boolean {
  return e.kind === "verify";
}

/**
 * One console line for a refused edit: the kind and reason code only. The engine's message can
 * quote the file's text, so it is never logged.
 */
export function engineErrorLog(e: EngineError): string {
  const reason = "reason" in e && typeof e.reason === "string" ? `/${e.reason}` : "";
  return `[editor] edit not applied: ${e.kind}${reason}`;
}
