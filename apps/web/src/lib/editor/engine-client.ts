"use client";
/**
 * Main-thread side of the editor engine worker. The worker (and the WebAssembly module it
 * loads) is created on the first call: `preloadEngine` when /edit-pdf is idle (not on Data Saver
 * or 2g), or opening a file. Its load progress is published for the "Edit text" ring.
 * After a crash (WebAssembly.RuntimeError: the instance is unusable) the worker is dropped
 * and the next call starts a fresh one; the caller reopens its last good bytes.
 *
 * The shaping build (complex scripts) loads only through `openInShapingEngine`, never prefetched,
 * in a fresh worker of its own: once the document is open there (and the fonts registered with the
 * old one are registered again), the old worker is terminated, so the default build's memory is
 * freed. A failed download leaves the old worker and its document as they were. Its download has
 * a status of its own, for its own progress ring. Every "open" says which build it wants (the
 * controller passes `shaping` after a crash), and disposing the engine (closing the file) returns
 * to the default build.
 */
import type { BerryError } from "./berry-engine";
import { ENGINE_SHAPING_WASM_BYTES, ENGINE_WASM_BYTES } from "./engine-assets";
import type { EngineReply, EngineRequest, EngineResponse, EngineVariant } from "./engine.worker";

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
/** `variant`: the build the call waits for; the watchdog starts once that build is compiled. */
type Pending = { resolve: (r: EngineReply) => void; reject: (e: EngineError) => void; timer: ReturnType<typeof setTimeout> | null; ms: number; variant: EngineVariant; w: Worker };
const pending = new Map<number, Pending>();

/** Engine download and compile state (one per page). */
export type EngineStatus = { state: "idle" | "loading" | "ready" | "failed"; loaded: number; total: number; cached?: boolean };
let status: EngineStatus = { state: "idle", loaded: 0, total: ENGINE_WASM_BYTES };
let shapingStatus: EngineStatus = { state: "idle", loaded: 0, total: ENGINE_SHAPING_WASM_BYTES };
/** The open document is in the shaping build (set by each "open"; reset when the engine is disposed). */
let shapingActive = false;
/** The worker the shaping build is loading in, before it takes over (openInShapingEngine). */
let candidate: Worker | null = null;
/** Fonts registered with the engine (addFont), registered again in the shaping worker after a swap. */
let fonts: { family: string; bold: boolean; italic: boolean; bytes: Uint8Array }[] = [];
const listeners = new Set<() => void>();
function setStatus(next: Partial<EngineStatus>, variant: EngineVariant = "base") {
  if (variant === "base") status = { ...status, ...next };
  else shapingStatus = { ...shapingStatus, ...next };
  listeners.forEach((l) => l());
}
const statusOf = (v: EngineVariant) => (v === "base" ? status : shapingStatus);
export const getEngineStatus = () => status;
/** Download and compile state of the shaping build. */
export const getShapingStatus = () => shapingStatus;
export const isShapingActive = () => shapingActive;
export function subscribeEngine(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The hang watchdog runs only once the engine is compiled: a slow download isn't a hang. */
function arm(id: number, p: Pending) {
  if (p.timer || statusOf(p.variant).state !== "ready") return;
  p.timer = setTimeout(() => crash(id), p.ms);
}

/** Rejects (with `aborted`) the calls still waiting on `w`, or on any worker. */
function abortCalls(w?: Worker) {
  for (const [id, p] of [...pending]) {
    if (w && p.w !== w) continue;
    pending.delete(id);
    if (p.timer) clearTimeout(p.timer);
    p.reject({ kind: "aborted" });
  }
}

function dropCandidate() {
  const c = candidate;
  if (!c) return;
  candidate = null;
  c.terminate();
  abortCalls(c);
}

/** Terminates the worker (closing the file, or a crash). Calls still waiting are rejected with `aborted`. */
export function disposeEngine(): void {
  worker?.terminate();
  worker = null;
  dropCandidate();
  abortCalls();
  // The next file opens in the default build; after a crash the controller asks for shaping again.
  shapingActive = false;
  fonts = [];
  // The files stay in the HTTP cache: a new worker compiles them again without a download.
  if (status.state !== "failed") setStatus({ state: "idle", loaded: 0 });
  if (shapingStatus.state !== "failed") setStatus({ state: "idle", loaded: 0 }, "shaping");
}

/** Settles call `id` with `crashed` and drops its worker (the shaping candidate alone, if it was there). */
function crash(id: number) {
  const p = pending.get(id);
  pending.delete(id);
  if (p?.timer) clearTimeout(p.timer);
  if (p && p.w === candidate) {
    dropCandidate();
    setStatus({ state: "failed" }, "shaping");
  } else disposeEngine();
  p?.reject({ kind: "crashed" });
}

const live = (w: Worker) => w === worker || w === candidate;

function spawn(): Worker {
  const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module", name: "berry-engine" });
  w.onmessage = (event: MessageEvent<EngineResponse>) => {
    const msg = event.data;
    if (!live(w)) return;
    if ("progress" in msg) {
      setStatus({ state: msg.ready ? "ready" : "loading", loaded: msg.progress.loaded, total: msg.progress.total, ...(msg.ready ? { cached: !!msg.cached } : {}) }, msg.variant);
      if (msg.ready) pending.forEach((p, id) => arm(id, p));
      return;
    }
    const p = pending.get(msg.id);
    if (!p || p.w !== w) return;
    if (!msg.ok && msg.error.kind === "crashed") return crash(msg.id);
    pending.delete(msg.id);
    if (p.timer) clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.reply);
    else {
      // The download or compile failed (offline, server error): offer a retry.
      if (statusOf(p.variant).state !== "ready") setStatus({ state: "failed" }, p.variant);
      p.reject(msg.error);
    }
  };
  w.onerror = (event) => {
    event.preventDefault();
    if (!live(w)) return;
    const first = [...pending].find(([, p]) => p.w === w);
    if (first) crash(first[0]);
    else if (w === candidate) dropCandidate();
    else disposeEngine();
  };
  return w;
}

function getWorker(): Worker {
  worker ??= spawn();
  return worker;
}

/** Sends a call to `target` (default: the engine's worker, started on first use). */
function send<C extends Call>(call: C, transfer: Transferable[], target?: Worker): Promise<ReplyFor<C["op"]>> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    // An "open" says which build it wants; other calls go to the build the document is open in.
    const shaping = call.op === "open" ? !!call.shaping : shapingActive;
    const variant: EngineVariant = shaping && call.op !== "load" ? "shaping" : "base";
    const w = target ?? getWorker();
    const p: Pending = { resolve: resolve as (r: EngineReply) => void, reject, timer: null, ms: engineTimeoutMs(call.op === "open" ? call.bytes.length : fileBytes), variant, w };
    pending.set(id, p);
    const st = statusOf(variant).state;
    if (st === "idle" || st === "failed") setStatus({ state: "loading", loaded: 0 }, variant);
    arm(id, p);
    w.postMessage({ ...call, id } as EngineRequest, transfer);
  });
}

export async function callEngine<C extends Call>(call: C, transfer: Transferable[] = []): Promise<ReplyFor<C["op"]>> {
  const reply = await send(call, transfer);
  if (call.op === "open") shapingActive = !!call.shaping;
  else if (call.op === "clearFonts") fonts = [];
  else if (call.op === "addFont" && (reply as ReplyFor<"addFont">).ok) fonts.push({ family: call.family, bold: call.bold, italic: call.italic, bytes: call.bytes });
  return reply;
}

/**
 * Reopens `bytes` in the shaping build, in a fresh worker (downloading it first, with progress in
 * getShapingStatus), registers the fonts again, then terminates the old worker. After it resolves
 * every call uses the shaping build. On failure the open document is unchanged (still the default
 * build, in the old worker) and the status is "failed": call again to retry.
 */
export async function openInShapingEngine(bytes: Uint8Array): Promise<void> {
  dropCandidate();
  const next = spawn();
  candidate = next;
  try {
    await send({ op: "open", bytes, shaping: true }, [bytes.buffer as ArrayBuffer], next);
    for (const f of fonts) await send({ op: "addFont", ...f, bytes: f.bytes.slice() }, [], next);
  } catch (err) {
    if (candidate === next) dropCandidate();
    throw err;
  }
  if (candidate !== next) throw { kind: "aborted" } satisfies EngineError;
  candidate = null;
  const old = worker;
  worker = next;
  shapingActive = true;
  if (old) {
    old.terminate();
    abortCalls(old);
  }
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
      return `This font has no ${[...new Set(e.chars)].map((c) => `“${c}”`).join(" ")}.`;
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
