/// <reference lib="webworker" />
/**
 * Download worker (U-E8): builds the edited PDF with pdf-lib, off the main thread. Loaded on the
 * first Download intent. Bytes stay on this device; the only fetches are our own font files.
 */
import { buildPdf, type BuildInput } from "./build";
import { FONT_BASE, USER_FILE, fontUrl, type EditorFontManifest } from "./fonts";
import { needsShaping, SHAPING_MANIFEST, type ShapingManifest } from "./shaping";
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

/** Hindi, Arabic and similar added text: drawn by the shaping engine (loaded only for it, AC-224). */
const wantsShaping = (input: BuildInput) => input.objects.some((o) => o.kind === "text" && o.lines.some(needsShaping));

async function shapingEngine() {
  const { ENGINE_SHAPING_JS, ENGINE_SHAPING_WASM } = await import("./engine-assets");
  const origin = scope.location.origin;
  const mod = (await import(/* webpackIgnore: true */ new URL(ENGINE_SHAPING_JS, origin).href)) as {
    default: (opts: { module_or_path: string }) => Promise<unknown>;
    BerryDocument: import("./shaped-text").ShapingEngine["BerryDocument"];
  };
  await mod.default({ module_or_path: new URL(ENGINE_SHAPING_WASM, origin).href });
  return mod;
}
let engine: ReturnType<typeof shapingEngine> | null = null;
let shapingFonts: Promise<ShapingManifest> | null = null;

scope.onmessage = async (event: MessageEvent<BuildRequest | { id: number; warm: true }>) => {
  const msg = event.data;
  if ("warm" in msg) return;
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
    const input = msg.input;
    let out: Uint8Array;
    if (wantsShaping(input)) {
      const { buildShaped } = await import("./shaped-text");
      out = await buildShaped(
        input,
        {
          engine: () => {
            engine ??= shapingEngine();
            engine.catch(() => (engine = null));
            return engine;
          },
          editorManifest: withMore.manifest,
          shapingManifest: () => {
            shapingFonts ??= json<ShapingManifest>(SHAPING_MANIFEST);
            shapingFonts.catch(() => (shapingFonts = null));
            return shapingFonts;
          },
          loadFace: withMore.load,
          loadUrl: bytes,
          labels: input.fonts?.labels,
        },
        (bytes, defer, pass) => buildPdf(pass.layer === 0 ? input : { ...input, bytes, password: undefined }, withMore, fontkit, defer, pass),
      );
    } else out = await buildPdf(input, withMore, fontkit);
    scope.postMessage({ id: msg.id, ok: true, bytes: out } satisfies BuildResponse, [out.buffer as ArrayBuffer]);
  } catch (error) {
    // Logged locally only, without file content.
    console.error("BerryPDF build failed", error);
    scope.postMessage({ id: msg.id, ok: false, message: error instanceof Error ? error.message : String(error) } satisfies BuildResponse);
  }
};
