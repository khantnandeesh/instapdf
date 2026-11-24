/**
 * F16: when the engine refuses an edit of an existing line, the notice says why in plain words
 * and offers "Replace with new text" (a whiteout plus a text box in the line's place).
 * Fixtures: tests/parity/editor/latex-type1c.pdf (gen_latex.py).
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

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

async function patchEngine(page: Page, patch: string) {
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

async function typeInto(page: Page, startsWith: string, next: (before: string) => string) {
  const line = page.locator(`[data-testid="line"][data-text^="${startsWith}"]`).first();
  const before = (await line.getAttribute("data-text"))!;
  await line.click();
  const input = page.getByTestId("line-input");
  await expect(input).toBeFocused();
  await input.fill(next(before));
  await input.press("Enter");
  return before;
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  return new Uint8Array(await readFile((await dl.path())!));
}

test("a space and a word typed at the end of a LaTeX line are applied (TeX fonts have no space glyph)", async ({ page }) => {
  await open(page, "latex-type1c.pdf");
  const before = await typeInto(page, "Left column", (t) => `${t} here`);
  await expect(page.locator(`[data-testid="line"][data-text="${before} here"]`)).toHaveCount(1);
  await expect(page.getByTestId("editor-notice")).toHaveCount(0);
  const [text] = await pageTexts(await download(page));
  expect(text).toContain("Left column text here");
});

test("a line that would run into its page number says so, and Replace with new text puts the text in its place", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  await open(page, "latex-type1c.pdf");
  const before = await typeInto(page, "1.2", (t) => `${t} and more`);
  const notice = page.getByTestId("editor-notice");
  await expect(notice).toContainText("The edited line would run into the text next to it.");
  expect(logs).toContain("[editor] edit not applied: verify/overlap");
  // The line is unchanged.
  await expect(page.locator(`[data-testid="line"][data-text="${before}"]`)).toHaveCount(1);
  await notice.getByRole("button", { name: "Replace with new text" }).click();
  await expect(page.locator('[data-kind="whiteout"]')).toHaveCount(1);
  const box = page.locator('[data-kind="text"]');
  await expect(box).toHaveCount(1);
  await expect(box).toContainText("1.2 Introduction");
  await expect(box).toContainText("and more");
  // One step: undo removes both.
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-kind="whiteout"], [data-kind="text"]')).toHaveCount(0);
});

test("an unknown verify failure gets the safe message and the fallback; the log has the reason, not the file's text", async ({ page }) => {
  await patchEngine(
    page,
    `BerryDocument.prototype.replaceLine = function () { throw { kind: "verify", reason: "position-drift", message: "the line reads \\"Results secret\\"" }; };`,
  );
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  await open(page, "latex-type1c.pdf");
  await typeInto(page, "Results", (t) => `${t} ₹5`);
  const notice = page.getByTestId("editor-notice");
  await expect(notice).toContainText("We couldn’t apply this edit safely, so the line is unchanged. Try a shorter change, or replace the line with new text.");
  await expect(notice).not.toContainText("pass our checks");
  expect(logs).toContain("[editor] edit not applied: verify/position-drift");
  expect(logs.join("\n")).not.toContain("secret");
  await notice.getByRole("button", { name: "Replace with new text" }).click();
  await expect(page.locator('[data-kind="text"]')).toContainText("₹5");
  const [text] = await pageTexts(await download(page));
  expect(text).toMatch(/₹\s?5/);
});

// Characters the file's font lacks are drawn with a stand-in from the font library (F24); one that
// no font here has (a private-use code point) is named.
test("a character no font here has is named, with no fallback offered", async ({ page }) => {
  await open(page, "latex-type1c.pdf");
  await typeInto(page, "Results", (t) => `${t} \uE123`);
  const notice = page.getByTestId("editor-notice");
  await expect(notice).toContainText("This font has no “\uE123”.", { timeout: 30_000 });
  await expect(notice.getByRole("button", { name: "Replace with new text" })).toHaveCount(0);
});
