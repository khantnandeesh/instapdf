/**
 * Content Security Policy and security headers (backlog Q1).
 *
 * The policy is the verifiable form of "browser tools upload nothing":
 * `connect-src 'self'` stops page and worker code from sending data to any
 * other origin (fetch, XHR, WebSocket, EventSource, sendBeacon), `img-src`,
 * `form-action` and `default-src` close the other obvious exfiltration paths.
 *
 * Scripts: Next.js App Router pages carry inline <script> tags (the RSC
 * payload, `self.__next_f.push(...)`) and our pre-paint script for Recent
 * tools. Every page is prerendered, so after `next build` we hash each page's
 * inline scripts (scripts/csp-manifest.mjs) and the middleware sends that
 * page's hashes. No 'unsafe-inline', no nonces, pages stay static.
 */

/** Hash source for one inline script, e.g. `'sha256-abc…='`. */
export type ScriptHash = `sha256-${string}`;

export type CspOptions = {
  /** Hashes of the page's inline scripts (from the build manifest). */
  scriptHashes?: readonly string[];
  /** `next dev`: React Refresh needs eval, dev styles are injected inline, HMR uses a WebSocket. */
  dev?: boolean;
};

/**
 * The policy string. Directives (production):
 * - `script-src 'self' 'wasm-unsafe-eval' <hashes>`: our own files plus exactly the inline
 *   scripts the build produced. 'wasm-unsafe-eval' lets pdf.js compile PostScript functions
 *   to WebAssembly (and will be needed by qpdf/tesseract WASM builds); it does not allow JS eval.
 * - `style-src 'self'`: no inline styles. Server HTML has no style attributes (the build
 *   checks); React sets styles after hydration through CSSOM, which CSP does not restrict.
 * - `worker-src 'self' blob:`: pdf.js and processing workers are same-origin files.
 */
export function contentSecurityPolicy({ scriptHashes = [], dev = false }: CspOptions = {}): string {
  const hashes = scriptHashes.map((h) => `'${h}'`);
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    dev
      ? ["script-src", "'self'", "'unsafe-inline'", "'unsafe-eval'"]
      : ["script-src", "'self'", "'wasm-unsafe-eval'", ...hashes],
    dev ? ["style-src", "'self'", "'unsafe-inline'"] : ["style-src", "'self'"],
    ["img-src", "'self'", "blob:", "data:"],
    ["font-src", "'self'"],
    dev ? ["connect-src", "'self'", "ws:", "wss:"] : ["connect-src", "'self'"],
    ["worker-src", "'self'", "blob:"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["frame-ancestors", "'none'"],
    ["form-action", "'self'"],
  ];
  return directives.map((d) => d.join(" ")).join("; ");
}

/** Headers sent on every response (next.config.ts `headers()`), besides the CSP. */
export const securityHeaders: { key: string; value: string }[] = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // web-share and clipboard stay allowed (Share and paste are features).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

/** Shape of `.next/csp-manifest.json`, written by scripts/csp-manifest.mjs after `next build`. */
export type CspManifest = {
  /** Route path ("/", "/rotate-pdf", "/_not-found") → hashes of that page's inline scripts. */
  routes: Record<string, string[]>;
};

/** Normalises a request path to a manifest key: no trailing slash, "/" for the root. */
export function routeKey(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Hashes for a request path. Unknown paths get the 404 page's hashes, which is what
 * Next serves for them. Returns [] when there is no manifest (scripts then stay blocked:
 * fail closed).
 */
export function hashesFor(manifest: CspManifest | null, pathname: string): string[] {
  if (!manifest) return [];
  return manifest.routes[routeKey(pathname)] ?? manifest.routes["/_not-found"] ?? [];
}
