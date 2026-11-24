"use client";
/**
 * Main-thread side of the editor engine worker. The worker (and the WebAssembly module it
 * loads) is created on the first call, which happens only after the user opens a file.
 * After a crash (WebAssembly.RuntimeError: the instance is unusable) the worker is dropped
 * and the next call starts a fresh one; the caller reopens its last good bytes.
 */
import type { BerryError } from "./berry-engine";
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
type Pending = { resolve: (r: EngineReply) => void; reject: (e: EngineError) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<number, Pending>();

/** Terminates the worker. Calls still waiting are rejected with `aborted`. */
export function disposeEngine(): void {
  worker?.terminate();
  worker = null;
  const all = [...pending.values()];
  pending.clear();
  for (const p of all) {
    clearTimeout(p.timer);
    p.reject({ kind: "aborted" });
  }
}

/** Settles call `id` with `crashed` and drops the worker. */
function crash(id: number) {
  const p = pending.get(id);
  pending.delete(id);
  if (p) clearTimeout(p.timer);
  disposeEngine();
  p?.reject({ kind: "crashed" });
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module", name: "berry-engine" });
  w.onmessage = (event: MessageEvent<EngineResponse>) => {
    const msg = event.data;
    const p = pending.get(msg.id);
    if (!p) return;
    if (!msg.ok && msg.error.kind === "crashed") return crash(msg.id);
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.reply);
    else p.reject(msg.error);
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
    const timer = setTimeout(() => crash(id), engineTimeoutMs(call.op === "open" ? call.bytes.length : fileBytes));
    pending.set(id, { resolve: resolve as (r: EngineReply) => void, reject, timer });
    getWorker().postMessage({ ...call, id } as EngineRequest, transfer);
  });
}

/** Short user-facing text for an engine error. */
export function describeEngineError(e: EngineError): string {
  switch (e.kind) {
    case "missing-glyphs":
      return `This font has no ${[...e.chars].map((c) => `“${c}”`).join(" ")}. Try other characters.`;
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
    case "save":
      return "That change didn’t pass our checks, so it wasn’t made.";
    default:
      return "Something went wrong. Please try again.";
  }
}
