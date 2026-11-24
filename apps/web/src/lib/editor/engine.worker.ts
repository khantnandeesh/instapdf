/// <reference lib="webworker" />
/**
 * Editor engine worker (F16). Loads berry-engine (WebAssembly, public/engine/, served from
 * content-hashed paths) on the first message: an idle prefetch on /edit-pdf, or opening a file.
 * Bytes stay in memory on this device: the only fetches are the engine's own same-origin files.
 *
 * Two builds, one worker: the default engine, and the shaping one (Hindi, Arabic and other complex
 * scripts), loaded only when an "open" asks for it (`shaping: true`), never prefetched. The two
 * modules have separate memories, so they live side by side; opening with the shaping build frees
 * the default build's document and every later call uses the shaping one.
 */
import type { BerryDocument as BerryDocumentType, BerryError, EditResult, PageText } from "./berry-engine";

import { ENGINE_JS, ENGINE_SHAPING_JS, ENGINE_SHAPING_WASM, ENGINE_SHAPING_WASM_BYTES, ENGINE_WASM, ENGINE_WASM_BYTES } from "./engine-assets";
import { countBody, type Progress } from "./engine-load";

type EngineModule = { default: (opts: { module_or_path: Response | Promise<Response> }) => Promise<unknown>; BerryDocument: typeof BerryDocumentType };

export type EngineRequest =
  /** Fetches and compiles the engine ahead of a file (`low`: idle prefetch). */
  | { id: number; op: "load"; priority: "low" | "high" }
  /** `shaping`: open in the shaping build (downloading it first); later calls use it. */
  | { id: number; op: "open"; bytes: Uint8Array; shaping?: boolean }
  | { id: number; op: "text"; page: number }
  | { id: number; op: "replace"; page: number; line: number; text: string }
  | { id: number; op: "save" };

export type EngineReply =
  | { op: "load" }
  | { op: "open"; pageCount: number }
  | { op: "text"; page: PageText }
  /** `appended`: the output starts with the bytes before the edit (undo can keep just a length). */
  | { op: "replace"; result: EditResult; bytes: Uint8Array; appended: boolean }
  | { op: "save"; bytes: Uint8Array };

export type EngineResponse =
  | { id: number; ok: true; reply: EngineReply }
  /** Download progress of a WebAssembly file (id 0), and `ready` once it is compiled. */
  | { id: 0; progress: Progress; ready?: boolean; cached?: boolean; variant: EngineVariant }
  /** `crashed`: the module aborted (WebAssembly.RuntimeError); the worker must be recreated. */
  | { id: number; ok: false; error: BerryError | { kind: "crashed" } | { kind: "internal"; message: string } };

export type EngineVariant = "base" | "shaping";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const FILES: Record<EngineVariant, { js: string; wasm: string; bytes: number }> = {
  base: { js: ENGINE_JS, wasm: ENGINE_WASM, bytes: ENGINE_WASM_BYTES },
  shaping: { js: ENGINE_SHAPING_JS, wasm: ENGINE_SHAPING_WASM, bytes: ENGINE_SHAPING_WASM_BYTES },
};
const engines: Record<EngineVariant, Promise<EngineModule> | null> = { base: null, shaping: null };
/** The build `doc` belongs to, and later calls use. */
let active: EngineVariant = "base";
let doc: BerryDocumentType | null = null;
/** The bytes `doc` was opened from: an edit that fails after replaceLine is undone by reopening them. */
let current: Uint8Array | null = null;

function loadEngine(variant: EngineVariant, priority: "low" | "high" = "high"): Promise<EngineModule> {
  const files = FILES[variant];
  const loading = (engines[variant] ??= (async () => {
    const origin = scope.location.origin;
    const mod = (await import(/* webpackIgnore: true */ new URL(files.js, origin).href)) as EngineModule;
    const res = await fetch(new URL(files.wasm, origin), { priority: priority === "low" ? "low" : "high" } as RequestInit);
    if (!res.ok) throw new Error(`engine ${res.status}`);
    // Still compiled while it streams (instantiateStreaming); each chunk reports progress.
    let last = -1;
    const counted = countBody(res, files.bytes, (p) => {
      const pct = Math.floor((p.loaded / p.total) * 100);
      if (pct === last) return;
      last = pct;
      scope.postMessage({ id: 0, progress: p, variant } satisfies EngineResponse);
    });
    await mod.default({ module_or_path: counted });
    // From the HTTP cache (prefetched or a second visit): nothing came over the network.
    const timing = performance.getEntriesByName(res.url).at(-1) as PerformanceResourceTiming | undefined;
    const cached = !!timing && timing.transferSize === 0 && timing.decodedBodySize > 0;
    scope.postMessage({ id: 0, progress: { loaded: files.bytes, total: files.bytes }, ready: true, cached, variant } satisfies EngineResponse);
    return mod;
  })());
  loading.catch(() => (engines[variant] = null));
  return loading;
}

/** Frees the document without ever leaving a freed object in `doc` (a second free throws). */
function dropDoc() {
  const old = doc;
  doc = null;
  try {
    old?.free();
  } catch {
    // Already unusable; nothing to release.
  }
}

/**
 * After a failure that may have left changes in the engine: reopen the last good bytes.
 * A RuntimeError means the instance is unusable, so it is not touched: the client drops the
 * worker. If reopening fails, `doc` stays null and the reply reports a crash (see onmessage).
 */
function rollback(BerryDocument: EngineModule["BerryDocument"], error: unknown): never {
  if (error instanceof WebAssembly.RuntimeError) throw error;
  dropDoc();
  if (current) doc = new BerryDocument(current);
  throw error;
}

async function handle(req: EngineRequest): Promise<EngineReply> {
  if (req.op === "load") {
    await loadEngine("base", req.priority);
    return { op: "load" };
  }
  if (req.op === "open") {
    // A download failure leaves the open document as it was.
    const variant: EngineVariant = req.shaping ? "shaping" : active;
    const { BerryDocument } = await loadEngine(variant);
    dropDoc();
    current = null;
    active = variant;
    doc = new BerryDocument(req.bytes);
    current = req.bytes;
    return { op: "open", pageCount: doc.pageCount };
  }
  const { BerryDocument } = await loadEngine(active);
  if (!doc) throw { kind: "internal", message: "No document" };
  if (req.op === "text") return { op: "text", page: doc.pageText(req.page) };
  if (req.op === "replace") {
    const result = doc.replaceLine(req.page, req.line, req.text); // rolls back on its own errors
    const before = current!;
    let saved: { bytes: Uint8Array; report: { original_preserved: boolean } };
    try {
      // The engine has no render of its own: the page is redrawn by pdf.js from the saved
      // bytes (an incremental save: the previous bytes plus one appended revision).
      saved = doc.save();
    } catch (error) {
      // save() does not roll back: drop the edit the UI will report as not made.
      return rollback(BerryDocument, error);
    }
    try {
      // Reopen from the output so the next save appends to it, and undo states stay prefixes.
      dropDoc();
      doc = new BerryDocument(saved.bytes);
      current = saved.bytes.slice();
    } catch (error) {
      return rollback(BerryDocument, error);
    }
    // original_preserved is the engine's full byte comparison of the prefix.
    return { op: "replace", result, bytes: saved.bytes, appended: saved.report.original_preserved && saved.bytes.length >= before.length };
  }
  return { op: "save", bytes: doc.save().bytes };
}

scope.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const req = event.data;
  try {
    const reply = await handle(req);
    const transfer = "bytes" in reply ? [reply.bytes.buffer as ArrayBuffer] : [];
    scope.postMessage({ id: req.id, ok: true, reply } satisfies EngineResponse, transfer);
  } catch (error) {
    let out: Extract<EngineResponse, { ok: false }>["error"];
    // No usable document after a failure (a reopen failed): only a fresh worker can recover.
    if (error instanceof WebAssembly.RuntimeError || (req.op !== "open" && !doc)) out = { kind: "crashed" };
    else if (error && typeof error === "object" && "kind" in error) out = error as BerryError;
    else out = { kind: "internal", message: error instanceof Error ? error.message : String(error) };
    scope.postMessage({ id: req.id, ok: false, error: out } satisfies EngineResponse);
  }
};
