/**
 * Sends each page its Content-Security-Policy (backlog Q1). See src/lib/security/csp.ts.
 *
 * Runs on the Node.js runtime so it can read `.next/csp-manifest.json`, which
 * scripts/csp-manifest.mjs writes after `next build` (it is not known at bundle
 * time). Middleware does not make pages dynamic: the prerendered HTML is still
 * served as is, this only adds a header. `/_next/static` is excluded; its files
 * get the hash-free policy from next.config.ts.
 *
 * Also sends `X-Robots-Tag: noindex` on every host but the canonical one (docs/seo/strategy.md).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { cloudPolicy, cloudRouteOf, contentSecurityPolicy, hashesFor, type CspManifest } from "@/lib/security/csp";
import { isIndexable } from "@/lib/seo/site";

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static/).*)"],
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
  const path = request.nextUrl.pathname;
  // F25 AC-623: test fixtures answer only on a server started for the e2e suite.
  if (path.startsWith("/test-fixtures") && process.env.IP_TEST_FIXTURES !== "1") return new NextResponse("Not found", { status: 404 });
  // F23: a /cloud/<provider> window gets its own policy (its provider's hosts only); every other page the strict one.
  const cloud = cloudRouteOf(path);
  const policy = cloud
    ? cloudPolicy(cloud, dev ? { dev } : { scriptHashes: hashesFor(loadManifest(), path) })
    : dev
      ? contentSecurityPolicy({ dev })
      : contentSecurityPolicy({ scriptHashes: hashesFor(loadManifest(), path) });
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", policy);
  // Only prod on the canonical host may be indexed (src/lib/seo/site.ts): staging and raw Cloud Run URLs never are.
  if (!isIndexable(request.headers.get("host"))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}
