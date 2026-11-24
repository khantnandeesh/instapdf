import type { NextConfig } from "next";
import engine from "./public/engine/manifest.json";
import { contentSecurityPolicy, securityHeaders } from "./src/lib/security/csp";

/**
 * The editor engine from content-hashed paths (/engine/<sha16>/<file>, see
 * src/lib/editor/engine-assets.ts), cached for a year, as the brotli or gzip copy made at build
 * by scripts/engine-precompress.mjs when the request accepts it. Route handlers can't send
 * Content-Encoding, so this is a rewrite to the static copy plus headers.
 */
const ENGINE_TYPES = { "berry_engine_bg.wasm": "application/wasm", "berry_engine.js": "text/javascript; charset=utf-8" } as const;
const BR = { type: "header" as const, key: "accept-encoding", value: ".*\\bbr\\b.*" };
const GZIP = { type: "header" as const, key: "accept-encoding", value: ".*\\bgzip\\b.*" };
const engineFiles = (Object.keys(ENGINE_TYPES) as (keyof typeof ENGINE_TYPES)[]).map((file) => ({ file, source: `/engine/${engine.files[file].slice(0, 16)}/${file}` }));

const nextConfig: NextConfig = {
  output: "standalone",
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
      afterFiles: [],
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
