"use client";
/**
 * Main-thread side of the editor engine worker. The worker (and the WebAssembly module it
 * loads) is created on the first call, which happens only after the user opens a file.
 * After a crash (WebAssembly.RuntimeError: the instance is unusable) the worker is dropped
 * and the next call starts a fresh one; the caller reopens its last good bytes.
 */
import type { BerryError } from "./berry-engine";
import type { EngineReply, EngineRequest, EngineResponse } from "./engine.worker";

export type EngineError = BerryError | { kind: "crashed" } | { kind: "internal"; message: string };

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
type Call = DistributiveOmit<EngineRequest, "id">;
type ReplyFor<O extends Call["op"]> = Extract<EngineReply, { op: O }>;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: EngineReply) => void; reject: (e: EngineError) => void }>();

function failAll(error: EngineError) {
  const all = [...pending.values()];
  pending.clear();
  for (const p of all) p.reject(error);
}

export function disposeEngine(): void {
  worker?.terminate();
  worker = null;
  failAll({ kind: "crashed" });
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module", name: "berry-engine" });
  w.onmessage = (event: MessageEvent<EngineResponse>) => {
    const msg = event.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.reply);
    else {
      if (msg.error.kind === "crashed") disposeEngine();
      p.reject(msg.error);
    }
  };
  w.onerror = (event) => {
    event.preventDefault();
    if (worker === w) disposeEngine();
  };
  worker = w;
  return w;
}

export function callEngine<C extends Call>(call: C, transfer: Transferable[] = []): Promise<ReplyFor<C["op"]>> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: resolve as (r: EngineReply) => void, reject });
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
      return "The editor restarted. Please try that again.";
    case "verify":
    case "save":
      return "That change didn’t pass our checks, so it wasn’t made.";
    default:
      return "Something went wrong. Please try again.";
  }
}
