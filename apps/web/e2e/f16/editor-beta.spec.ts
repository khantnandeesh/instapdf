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
  await expect(input).toHaveValue(before);
  await input.fill(before.replace(from, to));
  await input.press("Enter");
  await expect(page.locator(`[data-testid="line"][data-text*="${before.replace(from, to)}"]`)).toHaveCount(1);
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(await readFile((await dl.path())!)) };
}

test("landing: noindex, Beta badge, no engine before a file, and no serious axe violations", async ({ page }) => {
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

test("edits a line, undoes and redoes it, and downloads a PDF with the new text and without the old", async ({ page }) => {
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

test("explains a character the font lacks", async ({ page }) => {
  await open(page, "chrome-justified-mixed.pdf");
  const line = page.locator('[data-testid="line"][data-text="Service Agreement"]');
  await line.click();
  await page.getByTestId("line-input").fill("Supply Quote");
  await page.getByTestId("line-input").press("Enter");
  await expect(page.getByTestId("editor-notice")).toContainText("This font has no");
  await expect(line).toHaveCount(1);
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
  expect(violations, "the engine loads under the strict CSP").toEqual([]);
});
