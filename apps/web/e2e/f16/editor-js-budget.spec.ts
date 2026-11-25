/**
 * F16 AC-51 / U-E13, as a browser sees it: the editor's JS (the idle prefetch on the landing plus
 * everything opening a file fetches; not pdf.js, fonts or WASM) stays within 250 kB gzip, and
 * pdf-lib and fontkit (about 330 kB) are not fetched until Download intent or the first edit.
 * The file names fonts it doesn't embed, so the page draws them in their twins (F24): that path
 * once pulled pdf-lib in on open (round-2 eval, gap 2). The build check in
 * scripts/first-load-budget.mjs holds the same budget statically.
 */
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;
const BUDGET = 250_000;

type Seen = { url: string; phase: string; gz: number; lib: "pdfjs" | "pdf-lib" | "fontkit" | null };

function watchJs(page: Page) {
  const state = { phase: "landing", seen: [] as Seen[], pending: [] as Promise<void>[] };
  page.on("response", (res) => {
    const u = new URL(res.url());
    if (!u.pathname.startsWith("/_next/static/") || !u.pathname.endsWith(".js") || res.status() !== 200) return;
    const phase = state.phase;
    state.pending.push(
      res.body().then(
        (body) => {
          const text = body.toString("latin1");
          const lib = /pdfjsVersion|PDFDocumentProxy/.test(text) ? "pdfjs" : /PDFContext/.test(text) ? "pdf-lib" : /GSUB/.test(text) && /GPOS/.test(text) && /fontkit|TTFFont|WOFF2/i.test(text) ? "fontkit" : null;
          state.seen.push({ url: u.pathname, phase, gz: gzipSync(body, { level: 9 }).length, lib });
        },
        () => undefined,
      ),
    );
  });
  return state;
}

test("AC-51: the editor's JS is within 250 kB gzip, and pdf-lib waits for Download intent", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the same chunks on every layout");
  const js = watchJs(page);
  await page.goto("/edit-pdf", { waitUntil: "load" });
  js.phase = "idle";
  // The landing's idle prefetch (U-E13): the shell and pdf.js, then the engine.
  await page.waitForTimeout(5000);
  js.phase = "open";
  await page.getByTestId("editor-input").setInputFiles(corpus("named-only-twins.pdf"));
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 20_000 });
  // The page draws the named fonts in their twins, without pdf-lib.
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-twins", /^[1-9]/, { timeout: 15_000 });
  await page.waitForTimeout(2000);
  await Promise.all(js.pending);

  const editor = js.seen.filter((s) => s.phase !== "landing" && s.lib !== "pdfjs" && !/^\/_next\/static\/chunks\/app\/(?!edit-pdf\/)/.test(s.url));
  const total = editor.reduce((n, s) => n + s.gz, 0);
  const list = editor.map((s) => `${s.url.replace("/_next/static/chunks/", "")} ${s.gz} (${s.phase})`).join("\n");
  expect(editor.filter((s) => s.lib), `pdf-lib or fontkit before Download intent:\n${list}`).toEqual([]);
  expect(total, `editor JS ${total} B gzip:\n${list}`).toBeLessThanOrEqual(BUDGET);

  // Download intent: the worker and its pdf-lib start loading (off the main thread).
  js.phase = "intent";
  await page.getByRole("button", { name: "Download PDF" }).hover();
  await expect.poll(async () => (await Promise.all(js.pending), js.seen.some((s) => s.phase === "intent" && s.lib === "pdf-lib")), { timeout: 15_000 }).toBe(true);
});
