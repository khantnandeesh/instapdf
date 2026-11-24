/**
 * The committed engine build (public/engine/) must match its manifest, so a stale or
 * hand-edited artifact is visible. Rebuild with scripts/build-engine-wasm.sh.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const dir = new URL("../../../public/engine/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, dir));
const manifest = JSON.parse(read("manifest.json").toString("utf8")) as {
  rust: string;
  wasmBindgen: string;
  files: Record<string, string>;
  wasmGzipBytes: number;
  wasmBytes: number;
};

describe("engine artifact", () => {
  it("matches the sha256 recorded by the build script", () => {
    expect(Object.keys(manifest.files).sort()).toEqual(["berry_engine.js", "berry_engine_bg.wasm"]);
    for (const [name, sha] of Object.entries(manifest.files)) {
      expect(createHash("sha256").update(read(name)).digest("hex"), name).toBe(sha);
    }
  });

  it("is built with the toolchain CI pins (.github/workflows/engine.yml)", () => {
    const ci = readFileSync(new URL("../../../../../.github/workflows/engine.yml", import.meta.url), "utf8");
    expect(ci).toContain(`WASM_BINDGEN_VERSION: ${manifest.wasmBindgen}`);
    expect(ci).toContain(`rustup toolchain install ${manifest.rust}`);
  });

  it("records the raw WebAssembly size that load progress counts against", () => {
    expect(manifest.wasmBytes).toBe(read("berry_engine_bg.wasm").length);
  });

  it("stays inside the 1 MB gzip budget", () => {
    expect(gzipSync(read("berry_engine_bg.wasm"), { level: 9 }).length).toBeLessThanOrEqual(1_000_000);
  });

  it("ships the engine's typed API unchanged", () => {
    const api = readFileSync(new URL("../../../../../crates/berry-wasm/berry-engine.d.ts", import.meta.url), "utf8");
    expect(readFileSync(new URL("./berry-engine.d.ts", import.meta.url), "utf8")).toBe(api);
  });

  it("inlines the same hashed paths for the site-wide prefetch (next.config env)", async () => {
    const { default: config } = await import("../../../next.config");
    const { ENGINE_JS, ENGINE_WASM } = await import("./engine-assets");
    expect(config.env).toEqual({ ENGINE_JS_PATH: ENGINE_JS, ENGINE_WASM_PATH: ENGINE_WASM });
  });
});
