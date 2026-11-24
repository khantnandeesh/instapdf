// Pre-compresses the editor engine (public/engine/) with brotli (quality 11) and gzip (level 9),
// next to the originals, served by the engine rewrites in next.config.ts. Skips files already up to date.
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const dir = new URL("../public/engine/", import.meta.url);
const fresh = (src, out) => {
  try {
    return statSync(out).mtimeMs >= statSync(src).mtimeMs;
  } catch {
    return false;
  }
};
for (const name of ["berry_engine_bg.wasm", "berry_engine.js"]) {
  const src = new URL(name, dir);
  const raw = readFileSync(src);
  const br = new URL(`${name}.br`, dir);
  const gz = new URL(`${name}.gz`, dir);
  if (!fresh(src, br)) writeFileSync(br, brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }));
  if (!fresh(src, gz)) writeFileSync(gz, gzipSync(raw, { level: 9 }));
  console.log(`engine: ${name} ${raw.length} B, br ${statSync(br).size} B, gzip ${statSync(gz).size} B`);
}
