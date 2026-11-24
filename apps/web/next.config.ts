import { join } from "node:path";
import type { NextConfig } from "next";
import { baseSecurityHeaders, CLOUD_COOP, contentSecurityPolicy, TOOL_PAGE_COOP } from "./src/lib/security/csp";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // next/image optimisation is unused, and sharp (LGPL-3.0 libvips) is deliberately not installed.
  images: { unoptimized: true },
  // F23: always defined (empty when unset), so `process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1"` folds to a
  // constant at build time and builds without cloud sources ship none of its code (AC-120).
  env: {
    NEXT_PUBLIC_CLOUD_SOURCES: process.env.NEXT_PUBLIC_CLOUD_SOURCES ?? "",
    NEXT_PUBLIC_CLOUD_MOCK: process.env.NEXT_PUBLIC_CLOUD_MOCK ?? "",
  },
  webpack(config, { webpack }) {
    // F23 off (the default): tool pages get the no-op cloud module, so none of the cloud code ships.
    if (process.env.NEXT_PUBLIC_CLOUD_SOURCES !== "1")
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/[\\/]cloud[\\/]tool-cloud$/, join(__dirname, "src/components/cloud/tool-cloud.off.ts")));
    return config;
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      // COOP same-origin on every page except the F23 cloud windows (spec D-3): tool pages keep it byte for byte.
      { source: "/:path((?!cloud/).*)", headers: [{ key: "Cross-Origin-Opener-Policy", value: TOOL_PAGE_COOP }] },
      // Each cloud window sets its own COOP (src/lib/security/csp.ts CLOUD_COOP); its CSP comes from the middleware.
      ...Object.entries(CLOUD_COOP).map(([route, value]) => ({ source: `/cloud/${route}`, headers: [{ key: "Cross-Origin-Opener-Policy", value }] })),
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
