/// <reference lib="webworker" />
/**
 * Download worker (U-E8): builds the edited PDF with pdf-lib, off the main thread. Loaded on the
 * first Download intent. Bytes stay on this device; the only fetches are our own font files.
 */
import { buildPdf, type BuildInput } from "./build";
import { FONT_BASE, USER_FILE, fontUrl, type EditorFontManifest } from "./fonts";

export type BuildRequest = { id: number; input: BuildInput } | { id: number; owner: { bytes: Uint8Array; password: string } };
export type BuildResponse = { id: number; ok: true; bytes: Uint8Array } | { id: number; ok: true; owner: boolean } | { id: number; ok: false; message: string };

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
  load: (file: string) => bytes(fontUrl(file)),
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
  if ("owner" in msg) {
    const { isOwnerPassword } = await import("./owner");
    const owner = await isOwnerPassword(msg.owner.bytes, msg.owner.password);
    scope.postMessage({ id: msg.id, ok: true, owner } satisfies BuildResponse);
    return;
  }
  try {
    const fontkit = (await import("@cantoo/fontkit")).default;
    // Library and user faces come with the request; the user's own bytes are never fetched.
    const more = msg.input.fonts;
    const withMore: typeof fonts = more
      ? {
          ...fonts,
          manifest: async () => ({ faces: { ...more.faces, ...(await fonts.manifest()).faces } }),
          load: async (file) => {
            if (!file.startsWith(USER_FILE)) return fonts.load(file);
            const own = more.bytes[file];
            if (!own) throw new Error("A font you added is no longer available. Add it again.");
            return own;
          },
        }
      : fonts;
    const out = await buildPdf(msg.input, withMore, fontkit);
    scope.postMessage({ id: msg.id, ok: true, bytes: out } satisfies BuildResponse, [out.buffer as ArrayBuffer]);
  } catch (error) {
    // Logged locally only, without file content.
    console.error("BerryPDF build failed", error);
    scope.postMessage({ id: msg.id, ok: false, message: error instanceof Error ? error.message : String(error) } satisfies BuildResponse);
  }
};
