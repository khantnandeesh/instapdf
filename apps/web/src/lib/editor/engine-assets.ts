/**
 * Where the engine's two files are served from: content-hashed paths (`/engine/<sha>/<name>`,
 * the sha from manifest.json), so they can be cached for a year and a new build gets new URLs.
 * Served with brotli or gzip by the rewrites and headers in next.config.ts.
 */
import manifest from "../../../public/engine/manifest.json";

export type EngineFile = "berry_engine.js" | "berry_engine_bg.wasm";

/** The path segment for a file: the first 16 hex digits of its sha256. */
export const shaOf = (file: EngineFile) => manifest.files[file].slice(0, 16);
export const enginePath = (file: EngineFile) => `/engine/${shaOf(file)}/${file}`;

export const ENGINE_JS = enginePath("berry_engine.js");
export const ENGINE_WASM = enginePath("berry_engine_bg.wasm");
/** Decoded size of the WebAssembly file: what progress counts against. */
export const ENGINE_WASM_BYTES: number = manifest.wasmBytes;
