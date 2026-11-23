/**
 * Sends each page its Content-Security-Policy (backlog Q1). See src/lib/security/csp.ts.
 *
 * Runs on the Node.js runtime so it can read `.next/csp-manifest.json`, which
 * scripts/csp-manifest.mjs writes after `next build` (it is not known at bundle
 * time). Middleware does not make pages dynamic: the prerendered HTML is still
 * served as is, this only adds a header. `/_next/static` is excluded; its files
 * get the hash-free policy from next.config.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, hashesFor, type CspManifest } from "@/lib/security/csp";

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image).*)"],
};

const dev = process.env.NODE_ENV === "development";
let manifest: CspManifest | null | undefined;

function loadManifest(): CspManifest | null {
  if (manifest !== undefined) return manifest;
  try {
    manifest = JSON.parse(readFileSync(join(process.cwd(), ".next", "csp-manifest.json"), "utf8")) as CspManifest;
  } catch (error) {
    // Fail closed: without hashes no inline script runs, pages still render server HTML.
    console.error("CSP manifest missing; inline scripts will be blocked. Run the full `pnpm build`.", error);
    manifest = null;
  }
  return manifest;
}

export function middleware(request: NextRequest) {
  const policy = dev ? contentSecurityPolicy({ dev }) : contentSecurityPolicy({ scriptHashes: hashesFor(loadManifest(), request.nextUrl.pathname) });
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", policy);
  return response;
}
