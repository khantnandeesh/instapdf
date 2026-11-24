/**
 * Third review of #25, the lows: owner passwords in PDFDocEncoding (qpdf fixtures), and two tabs
 * with the same file never leave a saved session pointing at blobs the other tab swept.
 */
import { expect, test, type Page } from "@playwright/test";

const enc = (name: string) => `tests/fixtures/encryption/${name}`;
const corpus = (name: string) => `../../tests/parity/editor/${name}`;
/** 8×4 px PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAEUlEQVR4nGO4qe2NFTFQTwIAQFwp4WcA0H4AAAAASUVORK5CYII=", "base64");

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "storage and passwords behave the same on phones"));

async function openWith(page: Page, file: string, password: string) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(enc(file));
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

test("qpdf files opened with an owner password outside ASCII are unlocked; their open password isn't", async ({ page }) => {
  // R4: "é" is one byte in PDFDocEncoding. R6: "€" and "é" in UTF-8.
  for (const [file, owner] of [["r4aes-latin1.pdf", "Owné-r"], ["r6.pdf", "Own€r-é"]]) {
    await openWith(page, file, owner);
    await expect(page.getByTestId("owner-lock")).toHaveCount(0);
    await openWith(page, file, "op3n");
    await expect(page.getByTestId("owner-lock")).toBeVisible();
  }
});

async function open(page: Page) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus("report-form-3p.pdf"));
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}
async function saved(page: Page) {
  await expect(page.getByTestId("save-chip")).toContainText("Saved", { timeout: 8000 });
}
async function addText(page: Page, text: string, fy: number) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("t");
  const p = (await page.getByTestId("page-1").boundingBox())!;
  await page.mouse.click(p.x + p.width * 0.3, p.y + 200 + fy * 200);
  await expect(page.getByTestId("text-input")).toBeFocused();
  await page.keyboard.type(text);
  await page.getByTestId("text-input").press("Escape");
}

test("two tabs with the same file: a sweep in one never strands the other's saved session", async ({ context }) => {
  const a = await context.newPage();
  await open(a);
  // Tab A: an image (its bytes are a stored blob).
  await a.getByTestId("canvas").focus();
  await a.keyboard.press("i");
  await a.getByTestId("image-input").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: PNG });
  const p = (await a.getByTestId("page-1").boundingBox())!;
  await a.mouse.click(p.x + p.width / 2, p.y + 300);
  await expect(a.locator('[data-kind="image"]')).toHaveCount(1);
  await saved(a);
  // Tab B: same file, starts fresh; its first write sweeps the file's blobs it doesn't use.
  const b = await context.newPage();
  await open(b);
  await addText(b, "From tab B", 0);
  await saved(b);
  // Tab A writes again: the image blob it wrote is gone, so it writes in full.
  await addText(a, "From tab A", 0.5);
  await saved(a);
  // A third tab restores tab A's session, image included.
  const c = await context.newPage();
  await c.goto("/edit-pdf");
  await c.getByTestId("editor-input").setInputFiles(corpus("report-form-3p.pdf"));
  const notice = c.getByTestId("recovery");
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Restore" }).click();
  await expect(c.locator('[data-kind="image"]')).toHaveCount(1);
  await expect(c.getByRole("group", { name: /From tab A/ })).toHaveCount(1);
});
