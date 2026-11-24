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
  // Still one engine worker: the shaping build took over in a fresh one, and the old one (with the
  // default build's memory) was ended.
  await expect.poll(() => page.workers().length).toBe(workers);
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

test("after a file that needed shaping, the next file opens in the default build, without the shaping files", async ({ page }) => {
  const seen = watch(page);
  await open(page, "report-form-3p.pdf");
  const hindi = page.locator("[data-needs-shaping]").first();
  await expect(hindi).toBeVisible({ timeout: 15_000 });
  await hindi.click();
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-shaping", "ready", { timeout: 30_000 });
  await page.getByTestId("line-input").press("Escape");
  const fetched = seen.shaping().length;
  expect(fetched).toBeGreaterThan(0);
  await page.getByTestId("file-menu").click();
  await page.getByRole("menuitem", { name: "Close" }).click();
  await page.getByTestId("editor-input").setInputFiles(corpus("latex-type1c.pdf"));
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-shaping", "idle");
  // Edit text: the default build loads (its ring shows while it does), and a line opens.
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("e");
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-engine", "ready", { timeout: 30_000 });
  await expect(page.getByTestId("engine-ring")).toHaveCount(0);
  await page.locator('[data-testid="line"][data-text^="Left column"]').first().click();
  await expect(page.getByTestId("line-input")).toBeFocused();
  expect(seen.shaping().length).toBe(fetched);
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
  await expect(page.getByTestId("editor-notice")).toContainText("This font has no");
});

test("Hindi typed while the shaping download fails is kept, and made after Retry", async ({ page }) => {
  let fail = true;
  await page.route("**/engine/*/berry_engine_shaping_bg.wasm", (route) => (fail ? route.fulfill({ status: 503, body: "" }) : route.continue()));
  await open(page, "latex-type1c.pdf");
  const line = page.locator('[data-testid="line"][data-text^="Left column"]').first();
  await line.click();
  await page.getByTestId("line-input").fill("Left column नमस्ते");
  await page.getByTestId("line-input").press("Enter");
  const pill = page.getByTestId("engine-progress");
  await expect(pill).toContainText("Editing for this script didn’t load.", { timeout: 30_000 });
  // Nothing was said about the edit itself yet: it waits for the shaping build.
  await expect(page.getByTestId("editor-notice")).toHaveCount(0);
  fail = false;
  await pill.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-shaping", "ready", { timeout: 30_000 });
  // The kept edit is made in the shaping build without typing it again. This TeX file's font has
  // no Devanagari (no font here can add it to that line), so the shaping build's own answer
  // names the letters: only an edit that reached it can say that.
  await expect(page.getByTestId("editor-notice")).toContainText("This font has no “न”", { timeout: 30_000 });
});

for (const how of ["Esc", "a newer edit of the line"] as const) {
  test(`a waiting Hindi edit is dropped by ${how}, so Retry doesn't make it`, async ({ page }) => {
    let fail = true;
    await page.route("**/engine/*/berry_engine_shaping_bg.wasm", (route) => (fail ? route.fulfill({ status: 503, body: "" }) : route.continue()));
    await open(page, "latex-type1c.pdf");
    const line = () => page.locator('[data-testid="line"][data-text^="Left column"]').first();
    await line().click();
    await page.getByTestId("line-input").fill("Left column नमस्ते");
    await page.getByTestId("line-input").press("Enter");
    const pill = page.getByTestId("engine-progress");
    await expect(pill).toContainText("Editing for this script didn’t load.", { timeout: 30_000 });
    if (how === "Esc") {
      await page.getByTestId("canvas").focus();
      await page.keyboard.press("Escape");
    } else {
      await line().click();
      await page.getByTestId("line-input").fill("Left column column");
      await page.getByTestId("line-input").press("Enter");
      await expect(page.locator('[data-testid="line"][data-text^="Left column column"]')).toHaveCount(1, { timeout: 30_000 });
    }
    fail = false;
    await pill.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("editor-shell")).toHaveAttribute("data-shaping", "ready", { timeout: 30_000 });
    // The dropped edit never reaches the shaping build (it would name "न" as missing).
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("editor-notice")).toHaveCount(0);
    if (how !== "Esc") await expect(page.locator('[data-testid="line"][data-text^="Left column column"]')).toHaveCount(1);
  });
}

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

/** Ink pixels of page 1 inside a box given as page fractions, in pdfium's render (pypdfium2). */
function pdfiumInk(bytes: Uint8Array, box: { x: number; y: number; w: number; h: number }): number {
  const dir = mkdtempSync(join(tmpdir(), "berry-zorder-"));
  const path = join(dir, "out.pdf");
  writeFileSync(path, bytes);
  const script = [
    "import sys, pypdfium2",
    "x, y, w, h = map(float, sys.argv[2:6])",
    "bmp = pypdfium2.PdfDocument(sys.argv[1])[0].render(scale=2)",
    "buf, n, W, H, st = bytes(bmp.buffer), bmp.n_channels, bmp.width, bmp.height, bmp.stride",
    "ink = 0",
    "for yy in range(int(y * H), int((y + h) * H)):",
    "  for xx in range(int(x * W), int((x + w) * W)):",
    "    i = yy * st + xx * n",
    "    if min(buf[i:i + 3]) < 160: ink += 1",
    "print(ink)",
  ].join("\n");
  return Number(execFileSync("python3", ["-I", "-c", script, path, String(box.x), String(box.y), String(box.w), String(box.h)], { encoding: "utf8" }).trim());
}

test("AC-224: a whiteout added over a shaped line covers it in the download (z-order)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Output checks run once, on the desktop project");
  try {
    execFileSync("python3", ["-I", "-c", "import pypdfium2"], { stdio: "ignore" });
  } catch {
    if (process.env.CI) throw new Error("AC-224 needs pypdfium2 in CI: pip install pypdfium2==5.14.0");
    test.skip(true, "pypdfium2 is not installed here");
  }
  await open(page, "latex-type1c.pdf");
  const arabic = "مرحبا بالعالم";
  // Two copies: the first gets a whiteout over it, the second stays as the control.
  await addTextAt(page, arabic, 0.3, 0.3);
  await addTextAt(page, arabic, 0.3, 0.4);
  const pageBox = (await page.getByTestId("page-1").boundingBox())!;
  const frac = async (n: number) => {
    const b = (await page.locator('[data-kind="text"]').nth(n).boundingBox())!;
    return { x: (b.x - pageBox.x) / pageBox.width, y: (b.y - pageBox.y) / pageBox.height, w: b.width / pageBox.width, h: b.height / pageBox.height };
  };
  const covered = await frac(0);
  const control = await frac(1);
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("w");
  const pad = 0.01;
  await page.mouse.move(pageBox.x + (covered.x - pad) * pageBox.width, pageBox.y + (covered.y - pad) * pageBox.height);
  await page.mouse.down();
  await page.mouse.move(pageBox.x + (covered.x + covered.w + pad) * pageBox.width, pageBox.y + (covered.y + covered.h + pad) * pageBox.height, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-kind="whiteout"]')).toHaveCount(1);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  const bytes = new Uint8Array(await readFile((await dl.path())!));
  // The control line printed; the covered one is hidden under the whiteout, as on screen.
  expect(pdfiumInk(bytes, control)).toBeGreaterThan(50);
  expect(pdfiumInk(bytes, covered)).toBe(0);
});
