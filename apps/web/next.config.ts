import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Always defined so it is inlined: the e2e fault hook (AC-46) is then removed
  // from normal builds. Set NEXT_PUBLIC_E2E_HOOKS=1 only for a test build.
  env: { NEXT_PUBLIC_E2E_HOOKS: process.env.NEXT_PUBLIC_E2E_HOOKS === "1" ? "1" : "" },
};

export default nextConfig;
