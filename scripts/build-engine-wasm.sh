#!/usr/bin/env bash
# Rebuilds the editor engine's WebAssembly and commits-ready copies for the web app.
#
#   scripts/build-engine-wasm.sh
#
# The web deploy (apps/web/Dockerfile, GitHub Actions) never needs Rust: it serves the
# artifacts this script writes to apps/web/public/engine/, which are checked in. Run it after
# any change under crates/ and commit the output. A unit test (apps/web/src/lib/editor/
# engine-manifest.test.ts) fails when the .wasm no longer matches manifest.json.
#
# Same toolchain and steps as .github/workflows/engine.yml (Rust 1.100.0, wasm-bindgen 0.2.130,
# --target web). Needs: rustup, the wasm32-unknown-unknown target, wasm-bindgen-cli, node.
set -euo pipefail

RUST_VERSION=1.100.0
WASM_BINDGEN_VERSION=0.2.130
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/apps/web/public/engine"
export PATH="$HOME/.cargo/bin:$PATH"

rustup toolchain install "$RUST_VERSION" --profile minimal --no-self-update >/dev/null
rustup target add wasm32-unknown-unknown --toolchain "$RUST_VERSION" >/dev/null
if [[ "$(wasm-bindgen --version 2>/dev/null)" != "wasm-bindgen $WASM_BINDGEN_VERSION" ]]; then
  cargo install wasm-bindgen-cli --version "$WASM_BINDGEN_VERSION" --locked
fi

cd "$root/crates"
cargo "+$RUST_VERSION" build -p berry-wasm --target wasm32-unknown-unknown --release --locked
rm -rf berry-wasm/pkg
wasm-bindgen target/wasm32-unknown-unknown/release/berry_wasm.wasm --out-dir berry-wasm/pkg --target web --out-name berry_engine
node berry-wasm/smoke.mjs

mkdir -p "$out"
cp berry-wasm/pkg/berry_engine_bg.wasm berry-wasm/pkg/berry_engine.js "$out/"
# The typed API (the generated .d.ts is untyped `any`); the worker imports it as types only.
cp berry-wasm/berry-engine.d.ts "$root/apps/web/src/lib/editor/berry-engine.d.ts"

gzip_bytes=$(gzip -9 -c "$out/berry_engine_bg.wasm" | wc -c | tr -d ' ')
if (( gzip_bytes > 1000000 )); then
  echo "berry_engine_bg.wasm is $gzip_bytes bytes gzip, over the 1 MB budget" >&2
  exit 1
fi
node -e '
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const [out, rust, bindgen, gz] = process.argv.slice(1);
const sha = (f) => createHash("sha256").update(readFileSync(`${out}/${f}`)).digest("hex");
const manifest = {
  note: "Built by scripts/build-engine-wasm.sh from crates/berry-wasm. Do not edit by hand.",
  rust, wasmBindgen: bindgen,
  files: { "berry_engine_bg.wasm": sha("berry_engine_bg.wasm"), "berry_engine.js": sha("berry_engine.js") },
  wasmGzipBytes: Number(gz),
  wasmBytes: readFileSync(`${out}/berry_engine_bg.wasm`).length,
};
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
' "$out" "$RUST_VERSION" "$WASM_BINDGEN_VERSION" "$gzip_bytes"
echo "engine: $(wc -c < "$out/berry_engine_bg.wasm") bytes, $gzip_bytes gzip -> $out"
