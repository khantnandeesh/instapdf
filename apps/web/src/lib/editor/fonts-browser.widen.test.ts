import { beforeEach, describe, expect, it, vi } from "vitest";

const face = (file: string, ranges: [number, number][]) => ({ files: [{ file, ranges }] });
const loadFamily = vi.fn();
vi.mock("../font-library/client", () => ({ loadFamily: (id: string) => loadFamily(id) }));
describe("a built-in family takes the library's files for alphabets its own copy lacks (AC-281)", () => {
  beforeEach(() => {
    vi.resetModules();
    // The built-in copy: Latin only.
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ faces: { carlito: { "400-normal": face("carlito-latin.woff2", [[0x20, 0x7e]]) } } })));
    loadFamily.mockReset();
    loadFamily.mockResolvedValue({ id: "carlito", family: "Carlito", licence: "OFL-1.1", faces: { "400-normal": face("carlito-greek.abc.woff2", [[0x370, 0x3ff]]) } });
  });

  it("fetches nothing for text the built-in copy covers", async () => {
    const { widenFor, knownManifest } = await import("./fonts-browser");
    await widenFor(["carlito"], "plain text");
    expect(loadFamily).not.toHaveBeenCalled();
    expect(knownManifest()!.faces.carlito["400-normal"].files).toHaveLength(1);
  });

  it("adds the library's files after its own, once, when a character is not covered", async () => {
    const { widenFor, knownManifest } = await import("./fonts-browser");
    const { fileFor, LIB_FILE } = await import("./fonts");
    await Promise.all([widenFor(["carlito"], "αβ"), widenFor(["carlito"], "γ")]);
    await widenFor(["carlito"], "δ");
    expect(loadFamily).toHaveBeenCalledTimes(1);
    const f = knownManifest()!.faces.carlito["400-normal"];
    expect(fileFor(f, "a".codePointAt(0)!)?.file).toBe("carlito-latin.woff2");
    expect(fileFor(f, "α".codePointAt(0)!)?.file).toBe(`${LIB_FILE}carlito-greek.abc.woff2`);
  });

  it("a failed fetch leaves the built-in copy as it is and is tried again", async () => {
    loadFamily.mockRejectedValueOnce(new Error("offline"));
    const { widenFor, knownManifest } = await import("./fonts-browser");
    await widenFor(["carlito"], "α");
    expect(knownManifest()!.faces.carlito["400-normal"].files).toHaveLength(1);
    await widenFor(["carlito"], "α");
    expect(knownManifest()!.faces.carlito["400-normal"].files).toHaveLength(2);
  });
});
