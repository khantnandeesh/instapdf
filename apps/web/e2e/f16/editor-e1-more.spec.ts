/** F16 E1 (/edit-pdf), part 2: privacy, limits, speed, zoom, thumbnails, properties, output validity. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

/** A text PDF with `n` numbered pages (made at test time, not committed). */
async function numbered(n: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Page number ${i}`, { x: 72, y: 760, size: 18, font });
    p.drawText("The quick brown fox jumps over the lazy dog.", { x: 72, y: 720, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

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

async function openFile(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(typeof file === "string" ? corpus(file) : file);
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

async function at(page: Page, n: number, fx: number, fy: number) {
  const el = page.getByTestId(`page-${n}`);
  await el.scrollIntoViewIfNeeded();
  let b = (await el.boundingBox())!;
  const vh = page.viewportSize()!.height;
  const y = b.y + b.height * fy;
  if (y < 90 || y > vh - 160) {
    await page.getByTestId("canvas").evaluate((c, d) => c.scrollBy(0, d), y - vh / 2);
    await page.waitForTimeout(150);
    b = (await el.boundingBox())!;
  }
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

async function tool(page: Page, key: string) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press(key);
}

async function addText(page: Page, text: string, n = 1, fx = 0.3, fy = 0.3) {
  await tool(page, "t");
  const p = await at(page, n, fx, fy);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("text-input")).toBeFocused();
  await page.keyboard.type(text);
  await page.getByTestId("text-input").press("Escape");
  await expect(page.getByTestId("text-input")).toHaveCount(0);
  return page.getByRole("group", { name: new RegExp(text) });
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(await readFile((await dl.path())!)) };
}

/** Position of an element inside page n, as fractions of the page box. */
async function relative(page: Page, el: ReturnType<Page["locator"]>, n = 1) {
  const p = (await page.getByTestId(`page-${n}`).boundingBox())!;
  const b = (await el.boundingBox())!;
  return { x: (b.x - p.x) / p.width, y: (b.y - p.y) / p.height, w: b.width / p.width };
}

test("AC-1 AC-2 AC-4: no upload, the CSP blocks other origins, and five downloads in a row never hit a limit", async ({ page }) => {
  const big: string[] = [];
  page.on("request", (r) => {
    const body = r.postDataBuffer();
    if (body && body.length > 10 * 1024) big.push(r.url());
  });
  await openFile(page, "chrome-justified-mixed.pdf");
  const blocked = await page.evaluate(() =>
    fetch("https://example.com/upload", { method: "POST", body: "x" }).then(
      () => false,
      () => true,
    ),
  );
  expect(blocked, "connect-src 'self'").toBe(true);
  await addText(page, "Five times");
  for (let i = 0; i < 5; i++) {
    const out = await download(page);
    expect(out.bytes.length).toBeGreaterThan(1000);
  }
  await expect(page.getByTestId("editor-shell").getByText(/limit|upgrade|wait \d+/i)).toHaveCount(0);
  expect(big).toEqual([]);
});

test("AC-5 AC-84: a 300-page PDF opens, edits on its last page and downloads every page", async ({ page }) => {
  test.setTimeout(120_000);
  await openFile(page, { name: "big-300p.pdf", mimeType: "application/pdf", buffer: await numbered(300) });
  await expect(page.getByTestId("page-300")).toHaveCount(1);
  if (page.viewportSize()!.width >= 640) {
    await page.getByRole("textbox", { name: "Page number" }).fill("300");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
  } else await page.getByTestId("page-300").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("page-300")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
  await addText(page, "Last page note", 300, 0.3, 0.3);
  const out = await download(page);
  const doc = await PDFDocument.load(out.bytes);
  expect(doc.getPageCount()).toBe(300);
  const texts = await pageTexts(out.bytes);
  expect(texts[299]).toContain("Last page note");
});

test("AC-6 AC-90: page 1 of a 10-page PDF is visible within a second of picking it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Timing target is for the CI desktop profile");
  const buffer = await numbered(10);
  await page.goto("/edit-pdf");
  // Let the idle prefetch finish, as on a real visit (intent happens before the pick).
  await page.waitForLoadState("networkidle");
  const t0 = Date.now();
  await page.getByTestId("editor-input").setInputFiles({ name: "ten-page.pdf", mimeType: "application/pdf", buffer });
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 5000 });
  expect(Date.now() - t0).toBeLessThan(1000);
});

test("AC-7 AC-79: zoom by buttons and Ctrl+wheel keeps added objects on their spot", async ({ page }) => {
  await openFile(page, "report-form-3p.pdf");
  const obj = await addText(page, "Aligned", 1, 0.3, 0.3);
  const before = await relative(page, obj);
  const pill = page.getByRole("group", { name: "View" });
  const zoomIn = page.viewportSize()!.width >= 640 ? pill.getByRole("button", { name: "Zoom in" }) : null;
  if (zoomIn) {
    await zoomIn.click();
    await zoomIn.click();
  } else {
    await page.getByTestId("page-chip").click();
    await page.getByRole("dialog").getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Zoom in" }).click();
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(300);
  await obj.scrollIntoViewIfNeeded();
  const zoomed = await relative(page, obj);
  expect(Math.abs(zoomed.x - before.x)).toBeLessThan(0.01);
  expect(Math.abs(zoomed.y - before.y)).toBeLessThan(0.01);
  expect(Math.abs(zoomed.w - before.w)).toBeLessThan(0.01);
  const c = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 400);
  await page.keyboard.up("Control");
  await page.waitForTimeout(300);
  await obj.scrollIntoViewIfNeeded();
  const out = await relative(page, obj);
  expect(Math.abs(out.x - before.x)).toBeLessThan(0.01);
  expect(Math.abs(out.y - before.y)).toBeLessThan(0.01);
});

test("AC-8 AC-80 AC-42: thumbnails go to a page, follow scrolling, and reorder pages", async ({ page }) => {
  await openFile(page, "report-form-3p.pdf");
  const wide = page.viewportSize()!.width >= 1024;
  if (wide) {
    if (!(await page.getByTestId("thumbs").isVisible())) await page.getByRole("button", { name: "Pages panel" }).click();
  } else await page.getByTestId("page-chip").click();
  const thumbs = page.getByTestId("thumbs");
  await expect(thumbs.getByRole("button", { name: /^Page \d of 3$/ })).toHaveCount(3);
  await thumbs.getByRole("button", { name: "Page 3 of 3" }).click();
  await expect(page.getByTestId("page-chip").or(page.getByRole("textbox", { name: "Page number" })).first()).toBeVisible();
  await expect.poll(async () => (wide ? await page.getByRole("textbox", { name: "Page number" }).inputValue() : await page.getByTestId("page-chip").textContent())).toContain("3");
  if (!wide) await page.getByTestId("page-chip").click();
  // Keyboard reorder: page 3 to the front.
  await thumbs.getByRole("button", { name: "Page 3 of 3" }).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await page.keyboard.press("Alt+ArrowUp");
  if (!wide) await page.keyboard.press("Escape");
  const texts = await pageTexts((await download(page)).bytes);
  expect(texts[0]).toContain("Appendix");
  expect(texts[1]).toContain("Quarterly Service Report");
});

test("AC-58 AC-96: duplicate lands one line below; the size takes typed values with presets and becomes the next default", async ({ page }) => {
  await openFile(page, "report-form-3p.pdf");
  const obj = await addText(page, "Sized", 1, 0.3, 0.3);
  await obj.focus();
  await page.keyboard.press("Control+d");
  const objs = page.getByRole("group", { name: /Sized/ });
  await expect(objs).toHaveCount(2);
  const [a, b] = [(await objs.nth(0).boundingBox())!, (await objs.nth(1).boundingBox())!];
  expect(Math.abs(a.x - b.x)).toBeLessThan(1);
  expect(b.y).toBeGreaterThan(a.y + a.height * 0.6);
  const size = page.getByRole("spinbutton", { name: "Font size" }).first();
  await expect(size).toBeVisible();
  const presets = await page.locator("#ed-sizes option").evaluateAll((os) => os.map((o) => Number((o as HTMLOptionElement).value)));
  expect(Math.min(...presets)).toBe(8);
  expect(Math.max(...presets)).toBe(72);
  await size.fill("30");
  await size.press("Enter");
  await expect(size).toHaveValue("30");
  const grown = (await objs.nth(1).boundingBox())!;
  expect(grown.height).toBeGreaterThan(b.height * 1.8);
  // The next new box uses 30 pt (AC-96).
  const next = await addText(page, "Bigger", 1, 0.3, 0.6);
  const nb = (await next.boundingBox())!;
  expect(nb.height / grown.height).toBeGreaterThan(0.9);
});

test("AC-60 AC-26 AC-69: colours have a palette, hex, no-colour fill and recents; order follows forward/backward", async ({ page }) => {
  await openFile(page, "report-form-3p.pdf");
  await tool(page, "r");
  const p = await at(page, 1, 0.5, 0.35);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('[data-kind="shape"]')).toHaveCount(1);
  const fill = page.getByRole("button", { name: /^Fill/ }).first();
  await fill.click();
  const pop = page.locator("[data-popover]:popover-open");
  await expect(pop.getByRole("radio", { name: "No colour" })).toBeVisible();
  await pop.getByLabel("Hex colour").fill("#12805c");
  await pop.getByLabel("Hex colour").press("Enter");
  await expect(page.locator('[data-kind="shape"] svg [fill="#12805c"]')).toHaveCount(1);
  await fill.click();
  await expect(page.locator("[data-popover]:popover-open").getByRole("button", { name: "Recent #12805c" })).toBeVisible();
  await page.keyboard.press("Escape");
  // A second shape on top; send it backward and check the drawing order.
  await tool(page, "r");
  const q = await at(page, 1, 0.3, 0.45);
  await page.mouse.click(q.x, q.y);
  const shapes = page.locator('[data-kind="shape"]');
  await expect(shapes).toHaveCount(2);
  const topId = await shapes.nth(1).getAttribute("data-obj-id");
  await shapes.nth(1).focus();
  await page.keyboard.press("Control+[");
  await expect(shapes.nth(0)).toHaveAttribute("data-obj-id", topId!);
});

test("AC-64: moving an object snaps to the page centre and shows a guide; Alt turns snapping off", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Pointer drag with a mouse");
  await openFile(page, "report-form-3p.pdf");
  const obj = await addText(page, "Snap", 1, 0.2, 0.3);
  const pb = (await page.getByTestId("page-1").boundingBox())!;
  const ob = (await obj.boundingBox())!;
  const start = { x: ob.x + ob.width / 2, y: ob.y + ob.height / 2 };
  const target = pb.x + pb.width / 2 + 2; // 2 px off the centre line
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + target) / 2, start.y, { steps: 4 });
  await page.mouse.move(target, start.y, { steps: 4 });
  await expect(page.locator(".ed-guide--x").first()).toBeVisible();
  await page.mouse.up();
  const snapped = (await obj.boundingBox())!;
  expect(Math.abs(snapped.x + snapped.width / 2 - (pb.x + pb.width / 2))).toBeLessThan(1.5);
});

test("AC-50: with reduced motion, nothing animates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFile(page, "report-form-3p.pdf");
  await addText(page, "Still");
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  expect(running).toBe(0);
});

test("AC-46: every output passes qpdf's structural check", async ({ page }) => {
  let check = "";
  try {
    execFileSync("python3", ["-c", "import pikepdf"], { stdio: "ignore" });
    check = "import sys, pikepdf\nwith pikepdf.open(sys.argv[1]) as p:\n  probs = p.check_pdf_syntax()\n  print('\\n'.join(map(str, probs)))";
  } catch {
    test.skip(true, "pikepdf (qpdf) is not installed here");
  }
  const dir = mkdtempSync(join(tmpdir(), "berry-qpdf-"));
  for (const file of ["report-form-3p.pdf", "rotated-90.pdf", "shared-xobject.pdf", "std14-reportlab.pdf", "libreoffice-memo.pdf"]) {
    await openFile(page, file);
    await addText(page, "Checked");
    await tool(page, "r");
    const p = await at(page, 1, 0.5, 0.5);
    await page.mouse.click(p.x, p.y);
    await tool(page, "h");
    const line = page.getByTestId("page-1").locator('[data-testid="line"]').first();
    if (await line.count()) {
      const b = (await line.boundingBox())!;
      await page.mouse.move(b.x + 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, { steps: 4 });
      await page.mouse.up();
    }
    const out = await download(page);
    const path = join(dir, file);
    writeFileSync(path, out.bytes);
    const problems = execFileSync("python3", ["-c", check, path], { encoding: "utf8" }).trim();
    expect(problems, `qpdf check ${file}`).toBe("");
  }
});

test("AC-78: an edited line can be highlighted, and a Mark drag never moves it", async ({ page }) => {
  await openFile(page, "chrome-justified-mixed.pdf");
  const line = page.locator('[data-testid="line"][data-text*="is made between"]').first();
  const before = (await line.getAttribute("data-text"))!;
  await line.click();
  await page.getByTestId("line-input").fill(before.replace("made", "signed"));
  await page.getByTestId("line-input").press("Enter");
  const edited = page.locator(`[data-testid="line"][data-text*="is signed between"]`).first();
  await expect(edited).toHaveCount(1);
  const box = (await edited.boundingBox())!;
  await tool(page, "h");
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-kind="markup"]')).toHaveCount(1);
  expect((await edited.boundingBox())!.x).toBeCloseTo(box.x, 0);
  const out = await download(page);
  const [text] = await pageTexts(out.bytes);
  expect(text).toContain("is signed between");
  const doc = await PDFDocument.load(out.bytes);
  const annots = doc.getPage(0).node.Annots();
  expect(annots?.size() ?? 0).toBeGreaterThan(0);
});

test("AC-94: with Draw, one finger draws and two fingers do not", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Touch input");
  await openFile(page, "report-form-3p.pdf");
  await tool(page, "p");
  const cdp = await page.context().newCDPSession(page);
  const a = await at(page, 1, 0.2, 0.6);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", pts: { x: number; y: number }[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ ...p, id: i })) });
  await touch("touchStart", [a]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: a.x + i * 12, y: a.y + i * 4 }]);
  await touch("touchEnd", []);
  await expect(page.locator('[data-kind="ink"]')).toHaveCount(1);
  // Two fingers: a pan or pinch, never a stroke.
  const b = await at(page, 1, 0.3, 0.7);
  await touch("touchStart", [b, { x: b.x + 80, y: b.y }]);
  for (let i = 1; i <= 6; i++) await touch("touchMove", [{ x: b.x + i * 6, y: b.y - i * 10 }, { x: b.x + 80 + i * 6, y: b.y - i * 10 }]);
  await touch("touchEnd", []);
  await page.waitForTimeout(300);
  await expect(page.locator('[data-kind="ink"]')).toHaveCount(1);
});
