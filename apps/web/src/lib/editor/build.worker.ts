/// <reference lib="webworker" />
/**
 * Download worker (U-E8): builds the edited PDF with pdf-lib, off the main thread. Loaded on the
 * first Download intent. Bytes stay on this device; the only fetches are our own font files.
 */
import type { BuildInput } from "./build";
import { runBuild } from "./build-runtime";
import type { FormState } from "@/lib/forms/types";

export type BuildRequest =
  | { id: number; input: BuildInput }
  | { id: number; owner: { bytes: Uint8Array; password: string } }
  | { id: number; forms: { bytes: Uint8Array; password?: string } };
export type BuildResponse =
  | { id: number; ok: true; bytes: Uint8Array }
  | { id: number; ok: true; owner: boolean }
  | { id: number; ok: true; forms: FormState; xfa: boolean }
  | { id: number; ok: false; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<BuildRequest | { id: number; warm: true }>) => {
  const msg = event.data;
  // Download intent: fetch and compile the build's own chunks now, so the first build doesn't wait for them.
  if ("warm" in msg) return void import("@cantoo/fontkit").catch(() => undefined);
  if ("owner" in msg) {
    const { isOwnerPassword } = await import("./owner");
    const owner = await isOwnerPassword(msg.owner.bytes, msg.owner.password);
    scope.postMessage({ id: msg.id, ok: true, owner } satisfies BuildResponse);
    return;
  }
  if ("forms" in msg) {
    try {
      const { readFormFromBytes } = await import("@/lib/forms/read");
      const r = await readFormFromBytes(msg.forms.bytes, msg.forms.password);
      scope.postMessage({ id: msg.id, ok: true, forms: r.form, xfa: r.xfa } satisfies BuildResponse);
    } catch (error) {
      scope.postMessage({ id: msg.id, ok: false, message: error instanceof Error ? error.message : String(error) } satisfies BuildResponse);
    }
    return;
  }
  try {
    const out = await runBuild(msg.input);
    scope.postMessage({ id: msg.id, ok: true, bytes: out } satisfies BuildResponse, [out.buffer as ArrayBuffer]);
  } catch (error) {
    // Logged locally only, without file content.
    console.error("BerryPDF build failed", error);
    scope.postMessage({ id: msg.id, ok: false, message: error instanceof Error ? error.message : String(error) } satisfies BuildResponse);
  }
};
