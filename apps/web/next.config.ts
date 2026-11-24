import type { NextConfig } from "next";
import engine from "./public/engine/manifest.json";
import { ACCEPTS_BR, ACCEPTS_GZIP } from "./src/lib/editor/accept-encoding";
import { contentSecurityPolicy, securityHeaders } from "./src/lib/security/csp";

/**
 * The editor engine from content-hashed paths (/engine/<sha16>/<file>, see
 * src/lib/editor/engine-assets.ts), cached for a year, as the brotli or gzip copy made at build
 * by scripts/engine-precompress.mjs when the request accepts it. Route handlers can't send
 * Content-Encoding, so this is a rewrite to the static copy plus headers.
 */
const WASM = "application/wasm";
const JS = "text/javascript; charset=utf-8";
// The shaping module is served the same way but loaded only on demand (never prefetched).
const ENGINE_TYPES = {
  "berry_engine_bg.wasm": WASM,
  "berry_engine.js": JS,
  "berry_engine_shaping_bg.wasm": WASM,
  "berry_engine_shaping.js": JS,
  // The font matcher (F24): loaded only when the editor needs a match.
  "berry_fontmatch_bg.wasm": WASM,
  "berry_fontmatch.js": JS,
} as const;
const PREFETCH_ENV = { "berry_engine.js": "ENGINE_JS_PATH", "berry_engine_bg.wasm": "ENGINE_WASM_PATH" } as const;
// "br;q=0" refuses brotli: the patterns take a coding only when it is listed without q=0.
const BR = { type: "header" as const, key: "accept-encoding", value: ACCEPTS_BR };
const GZIP = { type: "header" as const, key: "accept-encoding", value: ACCEPTS_GZIP };
const engineFiles = (Object.keys(ENGINE_TYPES) as (keyof typeof ENGINE_TYPES)[]).map((file) => ({ file, source: `/engine/${engine.files[file].slice(0, 16)}/${file}` }));

/**
 * The font library (F24) is always fetched from our own address, /fonts/lib/*, so the page's
 * policy stays 'self'. Without FONTS_ORIGIN (development, tests, a build without the bucket) the
 * files are the in-app copy in public/fonts/lib; with it (set at build, e.g.
 * https://storage.googleapis.com/<bucket>) the same paths are passed through to the bucket.
 */
const FONTS_ORIGIN = (process.env.FONTS_ORIGIN ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  // Inlined at build: the site-wide prefetch (EnginePrefetch) needs only these two strings.
  env: Object.fromEntries(
    engineFiles.flatMap(({ file, source }) => (file in PREFETCH_ENV ? [[PREFETCH_ENV[file as keyof typeof PREFETCH_ENV], source]] : [])),
  ),
  poweredByHeader: false,
  reactStrictMode: true,
  // next/image optimisation is unused, and sharp (LGPL-3.0 libvips) is deliberately not installed.
  images: { unoptimized: true },
  async rewrites() {
    return {
      beforeFiles: engineFiles.flatMap(({ file, source }) => [
        { source, has: [BR], destination: `/engine/${file}.br` },
        { source, has: [GZIP], destination: `/engine/${file}.gz` },
        { source, destination: `/engine/${file}` },
      ]),
      afterFiles: FONTS_ORIGIN ? [{ source: "/fonts/lib/:path*", destination: `${FONTS_ORIGIN}/:path*` }] : [],
      fallback: [],
    };
  },
  async headers() {
    const immutable = { key: "Cache-Control", value: "public, max-age=31536000, immutable" };
    return [
      ...engineFiles.flatMap(({ file, source }) => [
        { source, headers: [immutable, { key: "Content-Type", value: ENGINE_TYPES[file] }, { key: "Vary", value: "Accept-Encoding" }] },
        { source, has: [BR], headers: [{ key: "Content-Encoding", value: "br" }] },
        { source, has: [GZIP], missing: [BR], headers: [{ key: "Content-Encoding", value: "gzip" }] },
      ]),
      { source: "/:path*", headers: securityHeaders },
      // Content-addressed library files never change; manifest.json names the current ones.
      { source: "/fonts/lib/:dir(index|families|fonts)/:path*", headers: [immutable] },
      { source: "/fonts/lib/manifest.json", headers: [{ key: "Cache-Control", value: "public, max-age=300" }] },
      // Pages get a per-page CSP (with their inline-script hashes) from src/middleware.ts.
      // Static files skip the middleware; workers loaded from here run under this hash-free policy.
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy({ dev: process.env.NODE_ENV === "development" }) }],
      },
    ];
  },
};

export default nextConfig;
