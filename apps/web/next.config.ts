import { join } from "node:path";
import type { NextConfig } from "next";
import engine from "./public/engine/manifest.json";
import { ACCEPTS_BR, ACCEPTS_GZIP } from "./src/lib/editor/accept-encoding";
import { cloudSourcesOn, configuredProviders, providerList } from "./src/lib/cloud/providers";
import { baseSecurityHeaders, CLOUD_COOP, CLOUD_REFERRER, contentSecurityPolicy, TOOL_PAGE_COOP } from "./src/lib/security/csp";
import { FONT_LIBRARY_PATHS, fontsOrigin } from "./scripts/font-library/origin.mjs";

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
 * F23: cloud sources are on only with NEXT_PUBLIC_CLOUD_SOURCES=1 and at least one provider configured
 * (or the mock). With the flag but no provider, the build is a build without the flag.
 */
const CLOUD_ON = cloudSourcesOn();

/**
 * The font library (F24) is always fetched from our own address, /fonts/lib/*, so the page's
 * policy stays 'self'. Without FONTS_ORIGIN (development, tests, a build without the bucket) the
 * files are the in-app copy in public/fonts/lib; with it (set at build, e.g.
 * https://storage.googleapis.com/<bucket>) the same paths are passed through to the bucket.
 */
const FONTS_ORIGIN = fontsOrigin(process.env.FONTS_ORIGIN);
// Only the library's own, fully spelled-out paths are passed through, never the whole bucket.
const FONT_PATHS = FONT_LIBRARY_PATHS;

const nextConfig: NextConfig = {
  output: "standalone",
  // Inlined at build: the site-wide prefetch (EnginePrefetch) needs only these two strings.
  // F23: the cloud flags are always defined (empty when unset), so `process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1"`
  // folds to a constant at build time and builds without cloud sources ship none of its code (AC-120).
  // The flag is the effective one (CLOUD_ON): "1" with no provider configured builds as off.
  env: {
    ...Object.fromEntries(
      engineFiles.flatMap(({ file, source }) => (file in PREFETCH_ENV ? [[PREFETCH_ENV[file as keyof typeof PREFETCH_ENV], source]] : [])),
    ),
    NEXT_PUBLIC_CLOUD_SOURCES: CLOUD_ON ? "1" : "",
    // The providers this build shows, worked out once here (a tool page's own code reads only this; lib/cloud/names.ts).
    NEXT_PUBLIC_CLOUD_LIST: CLOUD_ON ? configuredProviders().join(",") : "",
    NEXT_PUBLIC_CLOUD_NAMES: CLOUD_ON ? providerList(configuredProviders()) : "",
    NEXT_PUBLIC_CLOUD_MOCK: process.env.NEXT_PUBLIC_CLOUD_MOCK ?? "",
  },
  poweredByHeader: false,
  reactStrictMode: true,
  // next/image optimisation is unused, and sharp (LGPL-3.0 libvips) is deliberately not installed.
  images: { unoptimized: true },
  webpack(config, { webpack }) {
    // F23 off (the default): tool pages get the no-op cloud module, so none of the cloud code ships.
    // The /cloud window page gets a stub too, so its adapters (and MSAL) are not even async chunks.
    if (!CLOUD_ON) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/[\\/]cloud[\\/]tool-cloud$/, join(__dirname, "src/components/cloud/tool-cloud.off.ts")),
        // The editor's landing (F23 E6) the same way.
        new webpack.NormalModuleReplacementPlugin(/[\\/]cloud[\\/]editor-cloud$/, join(__dirname, "src/components/cloud/editor-cloud.off.ts")),
        new webpack.NormalModuleReplacementPlugin(/[\\/]cloud[\\/]window[\\/]CloudWindow$/, join(__dirname, "src/components/cloud/window/CloudWindow.off.tsx")),
      );
      // Nothing reads the no-op module (every use sits behind the flag): it does nothing when loaded, so it
      // is left out entirely and the tool pages are main's chunks byte for byte.
      config.module.rules.push({ test: /[\\/]cloud[\\/](tool|editor)-cloud\.off\.ts$/, sideEffects: false });
    }
    return config;
  },
  // The editor's registry slug was "pdf-editor" while it was listed as coming soon; it lives at /edit-pdf.
  async redirects() {
    return [{ source: "/pdf-editor", destination: "/edit-pdf", permanent: false }];
  },
  async rewrites() {
    return {
      beforeFiles: engineFiles.flatMap(({ file, source }) => [
        { source, has: [BR], destination: `/engine/${file}.br` },
        { source, has: [GZIP], destination: `/engine/${file}.gz` },
        { source, destination: `/engine/${file}` },
      ]),
      afterFiles: FONTS_ORIGIN ? FONT_PATHS.map((p) => ({ source: `/fonts/lib/${p.source}`, destination: `${FONTS_ORIGIN}/${p.destination}` })) : [],
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
      { source: "/:path*", headers: baseSecurityHeaders },
      // COOP same-origin on every page except the F23 cloud windows (spec D-3): tool pages keep it byte for byte.
      { source: "/:path((?!cloud/).*)", headers: [{ key: "Cross-Origin-Opener-Policy", value: TOOL_PAGE_COOP }] },
      // Each cloud window sets its own COOP (src/lib/security/csp.ts CLOUD_COOP); its CSP comes from the middleware.
      ...Object.entries(CLOUD_COOP).map(([route, value]) => ({ source: `/cloud/${route}`, headers: [{ key: "Cross-Origin-Opener-Policy", value }] })),
      // After the base headers, so it wins (the last rule setting a key does).
      ...Object.entries(CLOUD_REFERRER).map(([route, value]) => ({ source: `/cloud/${route}`, headers: [{ key: "Referrer-Policy", value }] })),
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
