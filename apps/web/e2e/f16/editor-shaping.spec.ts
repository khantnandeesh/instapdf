/**
 * F16: the shaping build (Hindi, Arabic and other complex scripts) loads lazily, in the same
 * engine worker, only when a line that needs it is picked, with the same counted progress and
 * Retry as the default build. It is never requested for a Latin-only file.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;
const SHAPING = /berry_engine_shaping/;

function watch(page: Page) {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  return { shaping: () => urls.filter((u) => SHAPING.test(u) || /\/fonts\/shaping\//.test(u)), engine: () => urls.filter((u) => /\/engine\//.test(u)) };
}

async function open(page: Page, file: string) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus(file));
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

async function texts(bytes: Uint8Array): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const content = await (await doc.getPage(1)).getTextContent();
  await task.destroy();
  return content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
}

test("a Latin-only file never requests the shaping build, from the landing to a line edit", async ({ page }) => {
  const seen = watch(page);
  await page.goto("/edit-pdf");
  // The idle prefetch runs (the default build), the shaping one is not part of it.
  await expect.poll(() => seen.engine().length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByTestId("editor-input").setInputFiles(corpus("latex-type1c.pdf"));
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
  const line = page.locator('[data-testid="line"][data-text^="Left column"]').first();
  await line.click();
  await page.getByTestId("line-input").fill("Left column changed");
  await page.getByTestId("line-input").press("Enter");
  await expect(page.locator('[data-testid="line"][data-text="Left column changed"]')).toHaveCount(1);
  await expect(page.locator("[data-needs-shaping]")).toHaveCount(0);
  // Added Latin text downloads without the shaping build or its fonts (AC-224).
  await addTextAt(page, "Approved", 0.3, 0.12);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  expect(await dl.path()).toBeTruthy();
  expect(seen.shaping()).toEqual([]);
});

test("a Hindi line loads the shaping build on click, then opens for editing and the edit is kept", async ({ page }) => {
  const seen = watch(page);
  await open(page, "report-form-3p.pdf");
  const hindi = page.locator("[data-needs-shaping]").first();
  await expect(hindi).toBeVisible({ timeout: 15_000 });
  const before = (await hindi.getAttribute("data-text"))!;
  expect(seen.shaping()).toEqual([]);
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-engine", "ready", { timeout: 30_000 });
  const workers = page.workers().length;
  await hindi.click();
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-shaping", "ready", { timeout: 30_000 });
  expect(seen.shaping().some((u) => u.endsWith(".wasm"))).toBe(true);
  // One engine worker: the shaping build was loaded into it, no worker was started for it.
  expect(page.workers().length).toBe(workers);
  const input = page.getByTestId("line-input");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(before);
  // Drop a word: the file's own subset has every glyph left (typing new letters would need them).
  const after = before.replace(" सेवा", "");
  expect(after).not.toBe(before);
  await input.fill(after);
  await input.press("Enter");
  await expect(page.locator(`[data-testid="line"][data-text="${after}"]`)).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId("editor-notice")).toHaveCount(0);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  const { readFile } = await import("node:fs/promises");
  const out = await texts(new Uint8Array(await readFile((await dl.path())!)));
  expect(out).toContain("Quarterly");
  // pdf.js reads Devanagari in glyph order, so compare a word that was there once and is gone.
  expect(out.replace(/\s+/g, "")).not.toContain("सेवा");
});

test("a failed shaping download says so and Retry loads it, then the line opens", async ({ page }) => {
  let fail = true;
  await page.route("**/engine/*/berry_engine_shaping_bg.wasm", (route) => (fail ? route.fulfill({ status: 503, body: "" }) : route.continue()));
  await open(page, "report-form-3p.pdf");
  const hindi = page.locator("[data-needs-shaping]").first();
  await expect(hindi).toBeVisible({ timeout: 15_000 });
  await hindi.click();
  const pill = page.getByTestId("engine-progress");
  await expect(pill).toContainText("Editing for this script didn’t load.");
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-shaping", "failed");
  fail = false;
  await pill.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("line-input")).toBeFocused({ timeout: 30_000 });
  await expect(page.getByTestId("engine-progress")).toHaveCount(0);
});

test("typing Hindi into a Latin line loads the shaping build and retries the edit there", async ({ page }) => {
  const seen = watch(page);
  await open(page, "latex-type1c.pdf");
  const line = page.locator('[data-testid="line"][data-text^="Left column"]').first();
  await line.click();
  await page.getByTestId("line-input").fill("Left column नमस्ते");
  await page.getByTestId("line-input").press("Enter");
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-shaping", "ready", { timeout: 30_000 });
  expect(seen.shaping().length).toBeGreaterThan(0);
  // Retried in the shaping build: this file's TeX font has no Devanagari, which is now the reason given.
  await expect(page.getByTestId("editor-notice")).toContainText("This font in the file has no");
});

// ---- added text (AC-224) ------------------------------------------------------------------------

async function addTextAt(page: Page, text: string, fx: number, fy: number) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("t");
  const b = (await page.getByTestId("page-1").boundingBox())!;
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
  await expect(page.getByTestId("text-input")).toBeFocused();
  await page.keyboard.insertText(text);
  await page.getByTestId("text-input").press("Escape");
  await expect(page.getByTestId("text-input")).toHaveCount(0);
}

/** Page 1's text as pdfium (pypdfium2, Apache-2.0/BSD) extracts it. */
function pdfiumText(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "berry-shaped-"));
  const path = join(dir, "out.pdf");
  writeFileSync(path, bytes);
  const script = ["import sys, pypdfium2", "doc = pypdfium2.PdfDocument(sys.argv[1])", "sys.stdout.buffer.write(doc[0].get_textpage().get_text_range().encode('utf-8'))"].join("\n");
  return execFileSync("python3", ["-I", "-c", script, path], { encoding: "utf8" });
}

test("AC-224: added Arabic and Hindi lines print shaped, as real text pdfium reads back", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Output checks run once, on the desktop project");
  try {
    execFileSync("python3", ["-I", "-c", "import pypdfium2"], { stdio: "ignore" });
  } catch {
    if (process.env.CI) throw new Error("AC-224 needs pypdfium2 in CI: pip install pypdfium2==5.14.0");
    test.skip(true, "pypdfium2 is not installed here");
  }
  const seen = watch(page);
  await open(page, "latex-type1c.pdf");
  const arabic = "مرحبا بالعالم";
  const hindi = "नमस्ते दुनिया, धर्म और कार्य";
  await addTextAt(page, arabic, 0.3, 0.12);
  await addTextAt(page, hindi, 0.3, 0.2);
  // Both scripts print now: no "Won't print" marker on either box.
  await expect(page.getByRole("group", { name: new RegExp(arabic) })).toHaveCount(1);
  await expect(page.getByTestId("text-missing")).toHaveCount(0);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  const bytes = new Uint8Array(await readFile((await dl.path())!));
  const text = pdfiumText(bytes).replace(/\s+/g, "");
  expect(text).toContain(arabic.replace(/\s+/g, ""));
  expect(text).toContain(hindi.replace(/\s+/g, ""));
  // The file's own text is still there.
  expect(text).toContain("Leftcolumn");
  // The download worker fetched the shaping build and the Arabic font for it, from our origin.
  expect(seen.shaping().some((u) => /berry_engine_shaping_bg\.wasm/.test(u))).toBe(true);
  expect(seen.shaping().some((u) => /noto-naskh-arabic/.test(u))).toBe(true);
});
