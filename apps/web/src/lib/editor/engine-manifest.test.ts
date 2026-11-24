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
  shapingWasmGzipBytes: number;
  shapingWasmBytes: number;
};

describe("engine artifact", () => {
  it("matches the sha256 recorded by the build script", () => {
    expect(Object.keys(manifest.files).sort()).toEqual([
      "berry_engine.js",
      "berry_engine_bg.wasm",
      "berry_engine_shaping.js",
      "berry_engine_shaping_bg.wasm",
    ]);
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
    expect(manifest.shapingWasmBytes).toBe(read("berry_engine_shaping_bg.wasm").length);
  });

  it("stays inside the 1 MB gzip budget, both modules", () => {
    for (const name of ["berry_engine_bg.wasm", "berry_engine_shaping_bg.wasm"]) {
      expect(gzipSync(read(name), { level: 9 }).length, name).toBeLessThanOrEqual(1_000_000);
    }
  });

  // The default module loads on every editor visit, so it must not grow: new features go into the
  // lazily loaded shaping module. Raising this cap needs the lead's OK (measured as the build
  // script does, `gzip -9`, recorded in manifest.json; Node's zlib reads about 1% higher). It is
  // 792,277 bytes; the cap leaves room for the few dozen bytes builds differ by between machines.
  it("keeps the default module at its size (792 KB gzip)", () => {
    expect(manifest.wasmGzipBytes).toBeLessThanOrEqual(793_000);
    expect(gzipSync(read("berry_engine_bg.wasm"), { level: 9 }).length).toBeLessThanOrEqual(803_300);
  });

  it("ships the engine's typed API unchanged", () => {
    const api = readFileSync(new URL("../../../../../crates/berry-wasm/berry-engine.d.ts", import.meta.url), "utf8");
    expect(readFileSync(new URL("./berry-engine.d.ts", import.meta.url), "utf8")).toBe(api);
  });

  it("inlines the same hashed paths for the site-wide prefetch (next.config env)", async () => {
    const { default: config } = await import("../../../next.config");
    const { ENGINE_JS, ENGINE_WASM } = await import("./engine-assets");
    // Exactly these keys: the two prefetched engine files plus the F23 cloud flags (never the shaping module).
    expect(config.env).toEqual({
      ENGINE_JS_PATH: ENGINE_JS,
      ENGINE_WASM_PATH: ENGINE_WASM,
      NEXT_PUBLIC_CLOUD_SOURCES: process.env.NEXT_PUBLIC_CLOUD_SOURCES ?? "",
      NEXT_PUBLIC_CLOUD_MOCK: process.env.NEXT_PUBLIC_CLOUD_MOCK ?? "",
    });
  });

  it("serves the shaping module from hashed, precompressed paths but never prefetches it", async () => {
    const { default: config } = await import("../../../next.config");
    const { ENGINE_SHAPING_JS, ENGINE_SHAPING_WASM } = await import("./engine-assets");
    const rewrites = (await config.rewrites!()) as { beforeFiles: { source: string; destination: string }[] };
    for (const [path, file] of [
      [ENGINE_SHAPING_JS, "berry_engine_shaping.js"],
      [ENGINE_SHAPING_WASM, "berry_engine_shaping_bg.wasm"],
    ]) {
      const dests = rewrites.beforeFiles.filter((r) => r.source === path).map((r) => r.destination);
      expect(dests, file).toEqual([`/engine/${file}.br`, `/engine/${file}.gz`, `/engine/${file}`]);
      expect(Object.values(config.env ?? {})).not.toContain(path);
    }
  });
});
