import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * Tests tagged "@serial" assert wall-clock time or carry a heavy load (50 files, 300 or 1,000
 * pages, a slow network). In CI they run in a job of their own with one worker, so another
 * worker's load never decides their result; the desktop and mobile jobs leave them out
 * (.github/workflows/ci.yml). `pnpm e2e` on a developer's machine still runs everything.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : // SITE_INDEXABLE=1: serve what prod serves (src/lib/seo/site.ts), so the SEO checks see indexable pages.
      { command: "pnpm start", url: baseURL, reuseExistingServer: true, timeout: 120_000, env: { SITE_INDEXABLE: "1" } },
});
