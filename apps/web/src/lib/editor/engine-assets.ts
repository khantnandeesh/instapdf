/**
 * Where the engine's files are served from: content-hashed paths (`/engine/<sha>/<name>`,
 * the sha from manifest.json), so they can be cached for a year and a new build gets new URLs.
 * Served with brotli or gzip by the rewrites and headers in next.config.ts.
 */
import manifest from "../../../public/engine/manifest.json";

export type EngineFile =
  | "berry_engine.js"
  | "berry_engine_bg.wasm"
  | "berry_engine_shaping.js"
  | "berry_engine_shaping_bg.wasm"
  | "berry_fontmatch.js"
  | "berry_fontmatch_bg.wasm";

/** The path segment for a file: the first 16 hex digits of its sha256. */
export const shaOf = (file: EngineFile) => manifest.files[file].slice(0, 16);
export const enginePath = (file: EngineFile) => `/engine/${shaOf(file)}/${file}`;

export const ENGINE_JS = enginePath("berry_engine.js");
export const ENGINE_WASM = enginePath("berry_engine_bg.wasm");
/** Decoded size of the WebAssembly file: what progress counts against. */
export const ENGINE_WASM_BYTES: number = manifest.wasmBytes;

/**
 * The full engine with complex-script shaping (Hindi, Arabic and similar), same interface. Load it
 * only when someone edits a line the default engine marks read-only with "needs-shaping"; it is
 * never prefetched.
 */
export const ENGINE_SHAPING_JS = enginePath("berry_engine_shaping.js");
export const ENGINE_SHAPING_WASM = enginePath("berry_engine_shaping_bg.wasm");
export const ENGINE_SHAPING_WASM_BYTES: number = manifest.shapingWasmBytes;

/**
 * The font matcher (F24): fingerprints a document font and ranks the font library against it.
 * Load it only when a match is needed; it is never prefetched.
 */
export const FONTMATCH_JS = enginePath("berry_fontmatch.js");
export const FONTMATCH_WASM = enginePath("berry_fontmatch_bg.wasm");
