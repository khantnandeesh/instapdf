/// <reference lib="webworker" />
/**
 * Download worker (U-E8): builds the edited PDF with pdf-lib, off the main thread. Loaded on the
 * first Download intent. Bytes stay on this device; the only fetches are our own font files.
 */
import { buildPdf, type BuildInput } from "./build";
import { FONT_BASE, type EditorFontManifest } from "./fonts";

export type BuildRequest = { id: number; input: BuildInput };
export type BuildResponse = { id: number; ok: true; bytes: Uint8Array } | { id: number; ok: false; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

async function bytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}
const json = async <T,>(url: string) => JSON.parse(new TextDecoder().decode(await bytes(url))) as T;

let manifest: Promise<EditorFontManifest> | null = null;
let noto: Promise<{ fonts: { file: string; ranges: [number, number][] }[] }> | null = null;
const fonts = {
  manifest: () => {
    manifest ??= json<EditorFontManifest>(`${FONT_BASE}manifest.json`);
    manifest.catch(() => (manifest = null));
    return manifest;
  },
  load: (file: string) => bytes(`${FONT_BASE}${encodeURIComponent(file)}`),
  fallback: {
    manifest: () => {
      noto ??= json("/fonts/noto/manifest.json");
      noto.catch(() => (noto = null));
      return noto;
    },
    load: (file: string) => bytes(`/fonts/noto/${encodeURIComponent(file)}`),
  },
};

scope.onmessage = async (event: MessageEvent<BuildRequest | { id: number; warm: true }>) => {
  const msg = event.data;
  if ("warm" in msg) return;
  try {
    const fontkit = (await import("@cantoo/fontkit")).default;
    const out = await buildPdf(msg.input, fonts, fontkit);
    scope.postMessage({ id: msg.id, ok: true, bytes: out } satisfies BuildResponse, [out.buffer as ArrayBuffer]);
  } catch (error) {
    // Logged locally only, without file content.
    console.error("BerryPDF build failed", error);
    scope.postMessage({ id: msg.id, ok: false, message: error instanceof Error ? error.message : String(error) } satisfies BuildResponse);
  }
};
