/** F16 editor beta (/edit-pdf): edit an existing line, download, check the text with pdf.js. */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAxeViolations } from "../support/axe";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " "));
  }
  await task.destroy();
  return out;
}

/** Serves the engine's JS glue with `patch` appended (it can wrap BerryDocument methods). */
async function patchEngine(page: Page, patch: string) {
  // The glue is served from a content-hashed path (/engine/<sha>/berry_engine.js), compressed.
  await page.route("**/engine/*/berry_engine.js", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ status: 200, contentType: "text/javascript", body: `${await res.text()}\n${patch}` });
  });
}

async function open(page: Page, file: string) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus(file));
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
}

async function editLine(page: Page, containing: string, from: string, to: string) {
  const line = page.locator(`[data-testid="line"][data-text*="${containing}"]`).first();
  const before = (await line.getAttribute("data-text"))!;
  await line.click();
  const input = page.getByTestId("line-input");
  await expect(input).toBeFocused();
  await expect(input).toHaveText(before);
  await input.fill(before.replace(from, to));
  await input.press("Enter");
  await expect(page.locator(`[data-testid="line"][data-text*="${before.replace(from, to)}"]`)).toHaveCount(1);
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(await readFile((await dl.path())!)) };
}

test("landing: noindex, Beta badge, no engine before a file with Data Saver on, and no serious axe violations", async ({ page }) => {
  // With Data Saver (or on 2g) the engine waits for a file; otherwise it is fetched on idle
  // (e2e/f16/editor-slow-network.spec.ts).
  await page.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g" }, configurable: true }));
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await page.goto("/edit-pdf");
  await expect(page.getByRole("heading", { level: 1, name: "Edit PDF" })).toBeVisible();
  await expect(page.getByText("Beta", { exact: true })).toBeVisible();
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  await expect(page.getByRole("button", { name: "Open PDF" })).toBeInViewport();
  await page.waitForLoadState("networkidle");
  expect(requests.filter((p) => p.startsWith("/engine/"))).toEqual([]);
  await expectNoSeriousAxeViolations(page, "editor landing");
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("/edit-pdf");
});

test("edits a line, undoes it, edits it again, and downloads a PDF with the new text and without the old", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") sent.push(`${r.method()} ${r.url()}`);
  });
  await open(page, "chrome-justified-mixed.pdf");
  await expect(page.locator('[data-testid="line"]').first()).toBeVisible();
  await expectNoSeriousAxeViolations(page, "editor open");

  // Esc cancels.
  const line = page.locator('[data-testid="line"][data-text*="is made between"]');
  await line.click();
  await page.getByTestId("line-input").fill("nope");
  await page.getByTestId("line-input").press("Escape");
  await expect(page.getByTestId("line-input")).toHaveCount(0);
  await expect(line).toHaveCount(1);

  await editLine(page, "is made between", "made", "signed");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-testid="line"][data-text*="is made between"]')).toHaveCount(1);
  await editLine(page, "is made between", "made", "signed");

  const out = await download(page);
  expect(out.name).toBe("chrome-justified-mixed.pdf");
  const [text] = await pageTexts(out.bytes);
  expect(text).toContain("is signed between the Provider and the Client");
  expect(text).not.toContain("is made");
  expect(sent, "nothing is uploaded").toEqual([]);
});

test("a character the font lacks comes from the same open family, with nothing to explain (F24, AC-281)", async ({ page }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const line = page.locator('[data-testid="line"][data-text="Service Agreement"]');
  await line.click();
  await page.getByTestId("line-input").fill("Supply Quote");
  await page.getByTestId("line-input").press("Enter");
  await expect(page.locator('[data-testid="line"][data-text="Supply Quote"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(line).toHaveCount(0);
  // The file's font is a library family: its own glyphs are used, so no notice and no error.
  await expect(page.getByTestId("font-notice")).toHaveCount(0);
  await expect(page.getByTestId("editor-notice")).toHaveCount(0);
});

test("edits text on a rotated page", async ({ page }) => {
  await open(page, "rotated-90.pdf");
  await editLine(page, "Landscape notice", "notice", "bulletin");
  const [text] = await pageTexts((await download(page)).bytes);
  expect(text).toContain("Landscape bulletin board");
  expect(text).not.toContain("notice");
});

test("keyboard: one tab stop per page, arrows pick a line, Enter edits, Esc returns to the page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard path checked on desktop");
  const violations: string[] = [];
  page.on("console", (m) => /Content Security Policy/i.test(m.text()) && violations.push(m.text()));
  await open(page, "chrome-justified-mixed.pdf");
  const list = page.getByRole("listbox", { name: "Text on page 1" });
  await list.focus();
  await expect(list).toHaveAttribute("aria-activedescendant", /ed-p0-l\d+/);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("line-input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(list).toBeFocused();

  // Enter commits and also returns focus to the page's line list.
  await page.keyboard.press("Enter");
  const input = page.getByTestId("line-input");
  await expect(input).toBeFocused();
  const before = (await input.textContent()) ?? "";
  await input.fill(`${before} `);
  await page.keyboard.press("Enter");
  await expect(input).toHaveCount(0);
  // Wait until the edit has settled: the new line is there and the page's fresh text is in.
  await expect(page.locator(`[data-testid="line"][data-text="${before} "]`)).toHaveCount(1);
  await expect(list).not.toHaveAttribute("aria-disabled", "true");
  await page.waitForTimeout(500);
  await expect(list).toBeFocused();
  const active = await list.getAttribute("aria-activedescendant");
  expect(active).toBeTruthy();
  await expect(page.locator(`#${active}`)).toHaveCount(1);
  // The keyboard still works without tabbing back in.
  await page.keyboard.press("ArrowDown");
  await expect(list).not.toHaveAttribute("aria-activedescendant", active!);
  expect(violations, "the engine loads under the strict CSP").toEqual([]);
});

test("a page that crashes the engine is skipped with a notice, and the rest stays editable", async ({ page }) => {
  await patchEngine(
    page,
    `const pt = BerryDocument.prototype.pageText;
     BerryDocument.prototype.pageText = function (p) { if (p === 0) throw new WebAssembly.RuntimeError("test crash"); return pt.call(this, p); };`,
  );
  await open(page, "report-form-3p.pdf");
  await expect(page.getByTestId("editor-notice")).toContainText("Page 1 can’t be edited");
  await page.getByTestId("page-2").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("page-2").locator('[data-testid="line"]').first()).toBeVisible();
  await expect(page.getByTestId("page-1").locator('[data-testid="line"]')).toHaveCount(0);
  // The engine still edits after the restart.
  const line = page.getByTestId("page-2").locator('[data-testid="line"]').first();
  const text = (await line.getAttribute("data-text"))!;
  await line.click();
  await page.getByTestId("line-input").fill(`${text} `);
  await page.getByTestId("line-input").press("Enter");
  await expect(page.getByTestId("page-2").locator(`[data-testid="line"][data-text="${text} "]`)).toHaveCount(1);
});

test("a save that fails after an edit drops only that edit; Download keeps the earlier ones", async ({ page }) => {
  await patchEngine(
    page,
    `const sv = BerryDocument.prototype.save; let n = 0;
     BerryDocument.prototype.save = function () { n++; if (n === 2) throw { kind: "save", reason: "object-mismatch", message: "test" }; return sv.call(this); };`,
  );
  await open(page, "chrome-justified-mixed.pdf");
  await editLine(page, "is made between", "made", "signed");
  const cell = page.locator('[data-testid="line"][data-text="Item"]');
  await cell.click();
  await page.getByTestId("line-input").fill("Items");
  await page.getByTestId("line-input").press("Enter");
  await expect(page.getByTestId("editor-notice")).toContainText("Saving this edit failed, so the line is unchanged.");
  // What was typed is kept in the box (F24 AC-305); the file is as it was before this edit.
  await expect(page.getByTestId("line-input")).toHaveText("Items");
  await page.getByTestId("line-input").press("Escape");
  await expect(cell).toHaveCount(1);
  const [text] = await pageTexts((await download(page)).bytes);
  expect(text).toContain("is signed between");
  expect(text).not.toMatch(/\bItems\b/);
  expect(text).toContain("Item");
});

test("if reopening after a save fails, the edit is dropped and earlier edits still download", async ({ page }) => {
  // The 3rd BerryDocument is the reopen after edit 2's save (1: open, 2: reopen after edit 1).
  await patchEngine(
    page,
    `const Orig = BerryDocument; let k = 0;
     BerryDocument = class extends Orig { constructor(b, p) { if (++k === 3) throw new WebAssembly.RuntimeError("oom"); super(b, p); } };`,
  );
  await open(page, "chrome-justified-mixed.pdf");
  await editLine(page, "is made between", "made", "signed");
  const cell = page.locator('[data-testid="line"][data-text="Item"]');
  await cell.click();
  await page.getByTestId("line-input").fill("Items");
  await page.getByTestId("line-input").press("Enter");
  await expect(page.getByTestId("editor-notice")).toContainText("restarted");
  // What was typed is kept in the box (F24 AC-305); the file is as it was before this edit.
  await expect(page.getByTestId("line-input")).toHaveText("Items");
  await page.getByTestId("line-input").press("Escape");
  await expect(cell).toHaveCount(1);
  const [text] = await pageTexts((await download(page)).bytes);
  expect(text).toContain("is signed between");
  expect(text).not.toMatch(/\bItems\b/);
  // And the editor keeps working.
  await editLine(page, "Fee", "Fee", "Fees");
});

test("the engine is served brotli or gzip by what the request accepts, and br;q=0 refuses brotli", async ({ request }) => {
  const manifest = JSON.parse(await readFile("public/engine/manifest.json", "utf8")) as { files: Record<string, string>; wasmBytes: number };
  const path = `/engine/${manifest.files["berry_engine_bg.wasm"]!.slice(0, 16)}/berry_engine_bg.wasm`;
  const get = async (accept: string) => {
    const res = await request.get(path, { headers: { "accept-encoding": accept } });
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    return res.headers()["content-encoding"] ?? "identity";
  };
  expect(await get("gzip, deflate, br")).toBe("br");
  expect(await get("gzip, br;q=0")).toBe("gzip");
  expect(await get("br;q=0, gzip;q=0")).toBe("identity");
  expect(await get("identity")).toBe("identity");
});
