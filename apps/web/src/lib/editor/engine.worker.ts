/// <reference lib="webworker" />
/**
 * Editor engine worker (F16 beta). Loads berry-engine (WebAssembly, public/engine/) on the
 * first message, which the page sends only after a file is opened. Bytes stay in memory on
 * this device: the only fetches are the engine's own two same-origin files.
 */
import type { BerryDocument as BerryDocumentType, BerryError, EditResult, PageText } from "./berry-engine";

type EngineModule = { default: (opts: { module_or_path: string }) => Promise<unknown>; BerryDocument: typeof BerryDocumentType };

export type EngineRequest =
  | { id: number; op: "open"; bytes: Uint8Array }
  | { id: number; op: "text"; page: number }
  | { id: number; op: "replace"; page: number; line: number; text: string }
  | { id: number; op: "save" };

export type EngineReply =
  | { op: "open"; pageCount: number }
  | { op: "text"; page: PageText }
  /** `appended`: the output starts with the bytes before the edit (undo can keep just a length). */
  | { op: "replace"; result: EditResult; bytes: Uint8Array; appended: boolean }
  | { op: "save"; bytes: Uint8Array };

export type EngineResponse =
  | { id: number; ok: true; reply: EngineReply }
  /** `crashed`: the module aborted (WebAssembly.RuntimeError); the worker must be recreated. */
  | { id: number; ok: false; error: BerryError | { kind: "crashed" } | { kind: "internal"; message: string } };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let engine: Promise<EngineModule> | null = null;
let doc: BerryDocumentType | null = null;
/** The bytes `doc` was opened from: an edit that fails after replaceLine is undone by reopening them. */
let current: Uint8Array | null = null;

function loadEngine(): Promise<EngineModule> {
  engine ??= (async () => {
    const url = new URL("/engine/berry_engine.js", scope.location.origin).href;
    const mod = (await import(/* webpackIgnore: true */ url)) as EngineModule;
    await mod.default({ module_or_path: new URL("/engine/berry_engine_bg.wasm", scope.location.origin).href });
    return mod;
  })();
  engine.catch(() => (engine = null));
  return engine;
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
  const { BerryDocument } = await loadEngine();
  if (req.op === "open") {
    dropDoc();
    current = null;
    doc = new BerryDocument(req.bytes);
    current = req.bytes;
    return { op: "open", pageCount: doc.pageCount };
  }
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
