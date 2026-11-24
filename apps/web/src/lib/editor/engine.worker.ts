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
  | { op: "replace"; result: EditResult; bytes: Uint8Array }
  | { op: "save"; bytes: Uint8Array };

export type EngineResponse =
  | { id: number; ok: true; reply: EngineReply }
  /** `crashed`: the module aborted (WebAssembly.RuntimeError); the worker must be recreated. */
  | { id: number; ok: false; error: BerryError | { kind: "crashed" } | { kind: "internal"; message: string } };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let engine: Promise<EngineModule> | null = null;
let doc: BerryDocumentType | null = null;

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

async function handle(req: EngineRequest): Promise<EngineReply> {
  const { BerryDocument } = await loadEngine();
  if (req.op === "open") {
    doc?.free();
    doc = null;
    doc = new BerryDocument(req.bytes);
    return { op: "open", pageCount: doc.pageCount };
  }
  if (!doc) throw { kind: "internal", message: "No document" };
  if (req.op === "text") return { op: "text", page: doc.pageText(req.page) };
  if (req.op === "replace") {
    const result = doc.replaceLine(req.page, req.line, req.text);
    // The engine has no render of its own: the page is redrawn by pdf.js from the saved
    // bytes (an incremental save: the original plus one appended revision).
    const { bytes } = doc.save();
    return { op: "replace", result, bytes };
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
    if (error instanceof WebAssembly.RuntimeError) out = { kind: "crashed" };
    else if (error && typeof error === "object" && "kind" in error) out = error as BerryError;
    else out = { kind: "internal", message: error instanceof Error ? error.message : String(error) };
    scope.postMessage({ id: req.id, ok: false, error: out } satisfies EngineResponse);
  }
};
