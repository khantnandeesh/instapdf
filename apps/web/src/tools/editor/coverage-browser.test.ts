import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorObject, TextObj } from "@/lib/editor/model";

// The face covers Latin only, the Noto list Greek, the shaping list Devanagari.
const manifest = { faces: { arimo: { "400-normal": { files: [{ file: "a.woff2", ranges: [[0x20, 0x7e]] }] } } } };
vi.mock("@/lib/editor/fonts-browser", () => ({ loadFontManifest: async () => manifest, knownManifest: () => manifest }));

type Lists = Record<string, unknown>;
function serve(lists: Lists) {
  vi.stubGlobal("fetch", async (url: string) => {
    const body = lists[url];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body };
  });
}
const NOTO = { fonts: [{ file: "g.woff2", ranges: [[0x370, 0x3ff]] }] };
const SHAPING = { fonts: [{ url: "d.otf", ranges: [[0x900, 0x97f]] }] };

const text = (t: string, lines = t.split("\n")): TextObj => ({ kind: "text", text: t, lines, font: "arimo", bold: false, italic: false }) as unknown as TextObj;

describe("coverage in the page", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("checks each wrapped line on its own, as the build draws it", async () => {
    serve({ "/fonts/noto/manifest.json": NOTO, "/fonts/shaping/manifest.json": SHAPING });
    const { missingInObjects } = await import("./coverage-browser");
    // One typed line, wrapped so the Greek letter sits on a line of its own: that line is drawn
    // with the face and the Noto fonts, not shaped, so it prints.
    expect(await missingInObjects([text("Ω नमस्ते", ["Ω", "नमस्ते"])] as EditorObject[])).toEqual({ chars: [], unchecked: false });
    // On the shaped line it doesn't.
    expect(await missingInObjects([text("Ω नमस्ते")] as EditorObject[])).toEqual({ chars: ["Ω"], unchecked: false });
  });

  it("says the text wasn't checked when a font list can't be fetched", async () => {
    serve({ "/fonts/noto/manifest.json": NOTO });
    const { missingInObjects } = await import("./coverage-browser");
    expect(await missingInObjects([text("नमस्ते")] as EditorObject[])).toEqual({ chars: [], unchecked: true });
    expect(await missingInObjects([text("plain ☃")] as EditorObject[])).toEqual({ chars: ["☃"], unchecked: false });
  });

  it("a missing fallback list is a failed check, not 'nothing prints'", async () => {
    serve({ "/fonts/noto/manifest.json": new Error("offline") });
    const { missingInObjects } = await import("./coverage-browser");
    expect(await missingInObjects([text("Ω")] as EditorObject[])).toEqual({ chars: [], unchecked: true });
  });
});
