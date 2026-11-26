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

/**
 * F23 cloud sources: the policy of one `/cloud/<provider>` window (spec D-3, research §2.1).
 * Tool pages never get these hosts: provider code runs only in its own window, which never
 * holds the visitor's local files (except the result they chose to save there).
 * Each entry is exactly what the provider's flow needs (host-source paths match as prefixes
 * when they end in "/", exactly otherwise):
 * - Dropbox Chooser: its one script; downloads from the direct-link host.
 * - Google: GIS token client + gapi (and the picker module from /_/scs/); the Picker and GIS
 *   frames; Drive v3 about.get (the token's account, for the Picker), file downloads and the
 *   Drive upload endpoint (save).
 * - OneDrive: MSAL is bundled (no third-party script); token endpoint, Graph, the download-URL
 *   hosts, and the File Picker v8 frame, started with a form POST. Personal accounts first.
 * - mock (CI/e2e only): nothing beyond our own origin.
 */
export const CLOUD_ALLOW: Record<"google" | "dropbox" | "onedrive" | "mock", { script: string[]; connect: string[]; frame: string[]; form: string[] }> = {
  dropbox: { script: ["https://www.dropbox.com/static/api/2/dropins.js"], connect: ["https://dl.dropboxusercontent.com"], frame: [], form: [] },
  google: {
    script: ["https://apis.google.com/js/api.js", "https://apis.google.com/_/scs/", "https://accounts.google.com/gsi/client"],
    connect: ["https://www.googleapis.com/drive/v3/about", "https://www.googleapis.com/drive/v3/files", "https://www.googleapis.com/drive/v3/files/", "https://www.googleapis.com/upload/drive/v3/files", "https://accounts.google.com/gsi/"],
    // Whole hosts, as Google's own Picker sample does: the Picker frame moves between docs, drive
    // and accounts pages (sign-in, account switch, upload), and a path-limited source blocks those.
    frame: ["https://docs.google.com", "https://drive.google.com", "https://accounts.google.com"],
    form: [],
  },
  onedrive: {
    script: [],
    connect: ["https://login.microsoftonline.com", "https://graph.microsoft.com", "https://*.files.1drv.com", "https://my.microsoftpersonalcontent.com"],
    frame: ["https://onedrive.live.com/picker/"],
    form: ["https://onedrive.live.com/picker/"],
  },
  mock: { script: [], connect: [], frame: [], form: [] },
};

export type CloudRouteName = keyof typeof CLOUD_ALLOW;

/** The policy for `/cloud/<route>`: the strict base plus only that provider's hosts. */
export function cloudPolicy(route: CloudRouteName, { scriptHashes = [], dev = false }: CspOptions = {}): string {
  const allow = CLOUD_ALLOW[route];
  const hashes = scriptHashes.map((h) => `'${h}'`);
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    dev ? ["script-src", "'self'", "'unsafe-inline'", "'unsafe-eval'", ...allow.script] : ["script-src", "'self'", ...hashes, ...allow.script],
    dev ? ["style-src", "'self'", "'unsafe-inline'"] : ["style-src", "'self'"],
    ["img-src", "'self'", "blob:", "data:"],
    ["font-src", "'self'"],
    dev ? ["connect-src", "'self'", "ws:", "wss:", ...allow.connect] : ["connect-src", "'self'", ...allow.connect],
    ["frame-src", ...(allow.frame.length ? allow.frame : ["'none'"])],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["frame-ancestors", "'none'"],
    ["form-action", "'self'", ...allow.form],
  ];
  return directives.map((d) => d.join(" ")).join("; ");
}

/**
 * COOP of each cloud window. Dropbox and Google return results from a nested popup to this
 * window, which needs `same-origin-allow-popups` (research §2.1). OneDrive signs in by a full-page
 * redirect (MSAL `loginRedirect`, no popup, no redirect bridge page) and hosts the picker in an
 * iframe, so it keeps `same-origin`. The mock mirrors Google.
 */
export const CLOUD_COOP: Record<CloudRouteName, string> = {
  dropbox: "same-origin-allow-popups",
  google: "same-origin-allow-popups",
  onedrive: "same-origin",
  mock: "same-origin-allow-popups",
};

/** `/cloud/<route>` (and nothing deeper) → the route, else null. */
export function cloudRouteOf(pathname: string): CloudRouteName | null {
  const m = /^\/cloud\/(google|dropbox|onedrive|mock)\/?$/.exec(pathname);
  return m ? (m[1] as CloudRouteName) : null;
}

/** COOP for every page that is not a cloud window (tool pages: unchanged, spec D-3). */
export const TOOL_PAGE_COOP = "same-origin";

/** Headers sent on every response (next.config.ts `headers()`), besides the CSP and COOP. */
export const baseSecurityHeaders: { key: string; value: string }[] = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // web-share and clipboard stay allowed (Share and paste are features).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

/** Everything a non-cloud page gets: the base headers plus COOP `same-origin` (same set and values as before F23). */
export const securityHeaders: { key: string; value: string }[] = [...baseSecurityHeaders.slice(0, 3), { key: "Cross-Origin-Opener-Policy", value: TOOL_PAGE_COOP }, baseSecurityHeaders[3]];

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
