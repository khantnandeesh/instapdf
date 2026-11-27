/**
 * Slow-page conditions for the "run with the text as typed" checks (eval G-3).
 *
 * - `slowLazyChunks`: every script and stylesheet the page fetches from now on arrives late, as on a
 *   slow link (staging was ~100 ms per chunk). This is the path that broke: a field that mounts
 *   (Split's Parts, Every N) fetched a lazy chunk whose stylesheet held React's commits.
 * - `holdCommits`: React holds every commit until a stylesheet has loaded, whatever asked for it.
 *   Next renders a lazy chunk's CSS as a React <link precedence> through `_N_E_STYLE_LOAD`; asking it
 *   for a slow stylesheet holds the page's commits as any lazy CSS would. The page must still run
 *   with what the user typed, though React has not shown it yet.
 */
import type { Page } from "@playwright/test";

export async function slowLazyChunks(page: Page, ms = 800) {
  await page.route(/\/_next\/static\/(chunks|css)\//, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue().catch(() => {});
  });
}

const HELD = "/held-commit.css";

/** Holds React's commits for `ms` from now. Returns once the hold is in place. */
export async function holdCommits(page: Page, ms = 1500) {
  let requested!: () => void;
  const started = new Promise<void>((r) => (requested = r));
  await page.route(`**${HELD}*`, async (route) => {
    requested();
    await new Promise((r) => setTimeout(r, ms));
    await route.fulfill({ status: 200, contentType: "text/css", body: "/* held */" }).catch(() => {});
  });
  await page.evaluate((href) => {
    const load = (globalThis as { _N_E_STYLE_LOAD?: (href: string) => Promise<void> })._N_E_STYLE_LOAD;
    if (!load) throw new Error("Next's runtime stylesheet loader is missing");
    void load(`${href}?${Math.random().toString(36).slice(2)}`);
  }, HELD);
  // React fetches the stylesheet when it renders the <link>, and holds that commit, and the ones
  // after it, until the stylesheet has loaded: the hold is in place once the request is out.
  await started;
}
