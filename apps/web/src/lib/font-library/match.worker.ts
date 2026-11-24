/// <reference lib="webworker" />
/**
 * Font matching worker (F24). Loads the berry_fontmatch WebAssembly module and the library's
 * index on the first request, all from our own address. The document font arrives as bytes from
 * the engine worker and never leaves this device.
 */
import type * as Matcher from "../editor/berry-fontmatch";
import type { FontProgram } from "../editor/berry-engine";
import { FONTMATCH_JS, FONTMATCH_WASM } from "../editor/engine-assets";
import { loadIndex, loadSignature } from "./client";
import { matchProgram, type FontMatch } from "./match";

export type MatchRequest = { id: number; program: Pick<FontProgram, "format" | "bytes" | "glyphs">; top: number };
export type MatchResponse = { id: number; ok: true; matches: FontMatch[] } | { id: number; ok: false; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
type Module = typeof Matcher & { default: (opts: { module_or_path: Response | Promise<Response> }) => Promise<unknown> };
let matcher: Promise<Module> | null = null;
function load(): Promise<Module> {
  matcher ??= (async () => {
    const origin = scope.location.origin;
    const mod = (await import(/* webpackIgnore: true */ new URL(FONTMATCH_JS, origin).href)) as Module;
    await mod.default({ module_or_path: fetch(new URL(FONTMATCH_WASM, origin)) });
    return mod;
  })();
  matcher.catch(() => (matcher = null));
  return matcher;
}

scope.onmessage = async (event: MessageEvent<MatchRequest>) => {
  const { id, program, top } = event.data;
  try {
    const matches = await matchProgram({ matcher: await load(), index: loadIndex, signature: loadSignature }, program, top);
    scope.postMessage({ id, ok: true, matches } satisfies MatchResponse);
  } catch (error) {
    scope.postMessage({ id, ok: false, message: error instanceof Error ? error.message : String(error) } satisfies MatchResponse);
  }
};
