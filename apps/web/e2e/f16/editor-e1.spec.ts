/** F16 E1 (/edit-pdf): add and change objects, pages, sign, mark, undo, recovery, layout. */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, PDFName, PDFArray, PDFDict } from "pdf-lib";
import { expectNoSeriousAxeViolations } from "../support/axe";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;
/** 8×4 px berry-red PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAEUlEQVR4nGO4qe2NFTFQTwIAQFwp4WcA0H4AAAAASUVORK5CYII=", "base64");

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

/** Records every request that leaves this origin or sends a body (AC-3). */
function watchUploads(page: Page) {
  const sent: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "blob:" || u.protocol === "data:") return;
    if (u.host !== new URL(process.env.BASE_URL ?? "http://localhost:3000").host || (r.method() !== "GET" && r.method() !== "HEAD")) sent.push(`${r.method()} ${r.url()}`);
  });
  return sent;
}

async function open(page: Page, file = "report-form-3p.pdf") {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus(file));
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

/** Clicks (or drags) on a page at fractions of its box. */
async function at(page: Page, n: number, fx: number, fy: number) {
  const el = page.getByTestId(`page-${n}`);
  await el.scrollIntoViewIfNeeded();
  let b = (await el.boundingBox())!;
  const vh = page.viewportSize()!.height;
  const y = b.y + b.height * fy;
  if (y < 90 || y > vh - 160) {
    // Bring the point to the middle of the canvas (pages can be taller than the screen).
    await page.getByTestId("canvas").evaluate((c, d) => c.scrollBy(0, d), y - vh / 2);
    await page.waitForTimeout(150);
    b = (await el.boundingBox())!;
  }
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}
async function clickPage(page: Page, n: number, fx: number, fy: number) {
  const p = await at(page, n, fx, fy);
  await page.mouse.click(p.x, p.y);
}
async function dragPage(page: Page, n: number, from: [number, number], to: [number, number]) {
  const a = await at(page, n, ...from);
  const b = await at(page, n, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(await readFile((await dl.path())!)) };
}

/** Focus mode: tool shortcuts work when focus is on the canvas. */
async function tool(page: Page, key: string) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press(key);
}

async function addText(page: Page, text: string, n = 1, fx = 0.3, fy = 0.6) {
  await tool(page, "t");
  await clickPage(page, n, fx, fy);
  const input = page.getByTestId("text-input");
  await expect(input).toBeFocused();
  // AC-57: the placeholder is selected, so typing replaces it.
  await page.keyboard.type(text);
  await expect(input).toHaveValue(text);
  await input.press("Escape");
  await expect(input).toHaveCount(0);
}

const annots = (doc: PDFDocument, i: number) => {
  const a = doc.getPage(i).node.lookup(PDFName.of("Annots"));
  return a instanceof PDFArray ? a.asArray().map((r) => doc.context.lookup(r) as PDFDict) : [];
};

test("AC-85 AC-92: the landing shows the title and Open PDF above the fold; opening fills the screen with pages", async ({ page }) => {
  await page.goto("/edit-pdf");
  await expect(page.getByRole("heading", { level: 1, name: "Edit PDF" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Choose PDF" })).toBeInViewport({ ratio: 1 });
  await page.getByTestId("editor-input").setInputFiles(corpus("report-form-3p.pdf"));
  await expect(page.getByTestId("editor-shell")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "report-form-3p.pdf" })).toBeVisible();
  const vw = page.viewportSize()!.width;
  const box = (await page.getByTestId("page-1").boundingBox())!;
  expect(box.width / vw).toBeGreaterThan(vw < 640 ? 0.9 : 0.45);
});

test("AC-2 AC-23 AC-57 AC-91 AC-3: add text, the placeholder never ships, the font matches, nothing is uploaded", async ({ page }) => {
  const sent = watchUploads(page);
  await open(page);
  await addText(page, "Signed by A. Rao");
  await expect(page.getByRole("group", { name: /Signed by A\. Rao/ })).toHaveCount(1);
  // An untouched new box is dropped (AC-57).
  await tool(page, "t");
  await clickPage(page, 1, 0.3, 0.8);
  await page.getByTestId("text-input").press("Escape");
  await expect(page.locator('[data-kind="text"]')).toHaveCount(1);
  const out = await download(page);
  expect(out.name).toBe("report-form-3p.pdf");
  const [t1] = await pageTexts(out.bytes);
  expect(t1).toContain("Signed by A. Rao");
  expect(t1).not.toMatch(/\bText\b/);
  const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
  const fonts = doc.context.enumerateIndirectObjects().map(([, o]) => (o instanceof PDFDict ? o.lookup(PDFName.of("BaseFont"))?.toString() : undefined)).filter(Boolean);
  expect(fonts.some((f) => /Arimo/.test(f!))).toBe(true);
  expect(doc.getProducer()).toBe("BerryPDF");
  expect(sent, "nothing is uploaded").toEqual([]);
});

test("AC-43 AC-82 AC-88: arrows nudge, Delete removes, Ctrl+D duplicates, undo and redo cover each", async ({ page }) => {
  await open(page);
  await addText(page, "Nudge me");
  const obj = page.getByRole("group", { name: /Nudge me/ });
  // A new box stays selected after typing; focus it (on touch the handles cover small boxes).
  await expect(obj).toHaveAttribute("data-selected", "true");
  await obj.focus();
  const before = (await obj.boundingBox())!;
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  const after = (await obj.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 2);
  expect(after.y).toBeGreaterThan(before.y + 4);
  // A burst of nudges is one undo step (AC-88).
  await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.round((await obj.boundingBox())!.x)).toBe(Math.round(before.x));
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => Math.round((await obj.boundingBox())!.x)).toBe(Math.round(after.x));
  await obj.focus();
  await page.keyboard.press("Control+d");
  await expect(page.locator('[data-kind="text"]')).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-kind="text"]')).toHaveCount(1);
  await page.keyboard.press("Control+y").catch(() => {});
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-kind="text"]')).toHaveCount(2);
  await expect(page.getByTestId("live")).not.toBeEmpty();
});

test("AC-41 AC-55 AC-79: page actions rotate, duplicate, insert and delete; overlays keep their spot", async ({ page }) => {
  await open(page);
  await addText(page, "Stays put");
  await page.getByTestId("canvas").focus();
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    // F25 AC-627: a selection opens the properties panel over the canvas's right side; clear it first.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("editor-props")).toHaveCount(0);
    await page.getByRole("button", { name: "Rotate right, page 1" }).click();
    await page.getByRole("button", { name: "Duplicate page, page 2" }).click();
    await page.getByRole("button", { name: "Insert blank page after, page 1" }).click();
    await page.getByRole("button", { name: "Delete page, page 5" }).click();
  } else {
    await page.getByTestId("page-chip").click();
    await page.getByRole("button", { name: "Page 1 actions" }).click();
    await page.getByRole("menuitem", { name: "Rotate right" }).click();
    await page.getByRole("button", { name: "Page 2 actions" }).click();
    await page.getByRole("menuitem", { name: "Duplicate page" }).click();
    await page.getByRole("button", { name: "Page 1 actions" }).click();
    await page.getByRole("menuitem", { name: "Insert blank page after" }).click();
    await page.getByRole("button", { name: "Page 5 actions" }).click();
    await page.getByRole("menuitem", { name: "Delete page" }).click();
    await page.keyboard.press("Escape");
  }
  await expect(page.getByTestId("editor-notice")).toContainText("Page 5 deleted");
  const out = await download(page);
  const doc = await PDFDocument.load(out.bytes);
  expect(doc.getPageCount()).toBe(4);
  expect(doc.getPage(0).getRotation().angle).toBe(90);
  const texts = await pageTexts(out.bytes);
  expect(texts[0]).toContain("Stays put");
  expect(texts[0]).toContain("Quarterly Service Report");
  expect(texts[1].trim()).toBe("");
  expect(texts[2]).toContain("Application Form");
  expect(texts[3]).toContain("Application Form");
});

test("AC-24 AC-67 AC-68: an image follows the pointer until placed; Esc cancels placing", async ({ page }) => {
  await open(page);
  await tool(page, "i");
  await page.getByTestId("image-input").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("mode-hint")).toContainText("Esc");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("mode-hint")).toHaveCount(0);
  await tool(page, "i");
  await page.getByTestId("image-input").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: PNG });
  await clickPage(page, 1, 0.5, 0.7);
  await expect(page.locator('[data-kind="image"]')).toHaveCount(1);
  const out = await download(page);
  const doc = await PDFDocument.load(out.bytes);
  const xobjects = doc.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"));
  expect(xobjects instanceof PDFDict && xobjects.keys().length > 0).toBe(true);
});

test("AC-31 AC-32 AC-87: type a signature, place it, then reuse saved initials", async ({ page }) => {
  await open(page);
  await tool(page, "s");
  const dialog = page.getByTestId("sign-dialog");
  await expect(dialog).toBeVisible();
  await page.getByTestId("sign-text").fill("Asha Rao");
  await page.getByTestId("sign-place").click();
  await clickPage(page, 2, 0.5, 0.8);
  await expect(page.locator('[data-kind="signature"]')).toHaveCount(1);
  // Initials: their own tab and saved list.
  await tool(page, "s");
  await page.getByRole("radio", { name: "Initials" }).click();
  await page.getByTestId("sign-text").fill("AR");
  await page.getByTestId("sign-place").click();
  await clickPage(page, 2, 0.8, 0.9);
  await expect(page.locator('[data-kind="signature"]')).toHaveCount(2);
  await tool(page, "s");
  await page.getByRole("radio", { name: "Initials" }).click();
  await expect(page.getByRole("button", { name: "Use saved initials" })).toHaveCount(1);
  await page.getByRole("radio", { name: "Signature" }).click();
  await expect(page.getByRole("button", { name: "Use saved signature" })).toHaveCount(1);
  await page.getByRole("button", { name: "Use saved signature" }).click();
  await clickPage(page, 3, 0.5, 0.5);
  await expect(page.locator('[data-kind="signature"]')).toHaveCount(3);
  const texts = await pageTexts((await download(page)).bytes);
  expect(texts[1]).toContain("Asha Rao");
  expect(texts[1]).toContain("AR");
});

test("AC-27 AC-71 AC-70: highlight across words makes a Highlight annotation; annotations can be hidden in view only", async ({ page }) => {
  await open(page);
  await tool(page, "h");
  // "This report was made for the review board." line on page 1.
  const line = page.getByTestId("page-1").locator('[data-testid="line"][data-text*="review board"]');
  await expect(line).toHaveCount(1);
  const b = (await line.boundingBox())!;
  await page.mouse.move(b.x + 4, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-kind="markup"]')).toHaveCount(1);
  const vw = page.viewportSize()!.width;
  if (vw >= 640) {
    await page.getByTestId("hide-annots").click();
    await expect(page.locator('[data-kind="markup"]')).toBeHidden();
    await page.getByTestId("hide-annots").click();
  }
  const doc = await PDFDocument.load((await download(page)).bytes);
  const hl = annots(doc, 0).filter((a) => a.lookup(PDFName.of("Subtype"))?.toString() === "/Highlight");
  expect(hl).toHaveLength(1);
  expect(hl[0].lookup(PDFName.of("QuadPoints"))).toBeInstanceOf(PDFArray);
  expect(hl[0].lookup(PDFName.of("AP"))).toBeInstanceOf(PDFDict);
});

test("AC-95: Mark on a page with no text layer makes an area highlight", async ({ page }) => {
  await page.goto("/edit-pdf");
  await page.getByRole("button", { name: "Start with a blank page" }).click();
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
  await tool(page, "h");
  await dragPage(page, 1, [0.2, 0.2], [0.6, 0.25]);
  await expect(page.locator('[data-kind="markup"]')).toHaveCount(1);
});

test("AC-25 AC-26 AC-72 AC-97: whiteout warns and uses the page colour; shapes place on a click", async ({ page }) => {
  await open(page);
  await tool(page, "w");
  await expect(page.getByText("Hides content; doesn’t delete it").first()).toBeVisible();
  await dragPage(page, 1, [0.1, 0.05], [0.4, 0.1]);
  const wo = page.locator('[data-kind="whiteout"]');
  await expect(wo).toHaveCount(1);
  expect(await wo.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
  await tool(page, "r");
  await clickPage(page, 1, 0.5, 0.9);
  await expect(page.locator('[data-kind="shape"]')).toHaveCount(1);
  await tool(page, "p");
  await dragPage(page, 1, [0.2, 0.92], [0.5, 0.95]);
  await expect(page.locator('[data-kind="ink"]')).toHaveCount(1);
  const doc = await PDFDocument.load((await download(page)).bytes);
  expect(annots(doc, 0).some((a) => a.lookup(PDFName.of("Subtype"))?.toString() === "/Ink")).toBe(true);
});

test("AC-45 AC-81: changes are kept on this device and offered back when the same file opens again", async ({ page }) => {
  await open(page);
  await addText(page, "Keep this");
  await expect(page.getByTestId("save-chip")).toContainText("Saved", { timeout: 5000 }).catch(async () => {
    // Phones show no save chip: wait for the autosave instead.
    await page.waitForTimeout(1200);
  });
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus("report-form-3p.pdf"));
  const notice = page.getByTestId("recovery");
  await expect(notice).toContainText(/Restore 1 change from/);
  await notice.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("group", { name: /Keep this/ })).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("group", { name: /Keep this/ })).toHaveCount(0);
});

test("AC-73 AC-89: the Objects list names each object; History reverts a chosen change", async ({ page }) => {
  await open(page);
  await addText(page, "First note", 1, 0.3, 0.6);
  await addText(page, "Second note", 1, 0.3, 0.75);
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    if (!(await page.getByRole("tab", { name: "Objects" }).isVisible())) await page.getByRole("button", { name: "Pages panel" }).click();
  } else await page.getByTestId("page-chip").click();
  await page.getByRole("tab", { name: "Objects" }).click();
  const list = page.getByTestId("object-list");
  await expect(list.getByRole("button")).toHaveCount(2);
  await list.getByRole("button", { name: /First note/ }).click();
  await expect(page.getByRole("group", { name: /First note/ })).toBeFocused({ timeout: 3000 });
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByTestId("page-chip").click();
  await page.getByRole("tab", { name: "History" }).click();
  const hist = page.getByTestId("history-list");
  await hist.getByRole("checkbox").last().check();
  await hist.getByRole("button", { name: /Revert/ }).click();
  await expect(page.getByRole("group", { name: /First note/ })).toHaveCount(0);
  await expect(page.getByRole("group", { name: /Second note/ })).toHaveCount(1);
});

test("AC-48 AC-54 AC-83 AC-98: bars fit the screen, stay put while pages scroll, and the active tool stays visible", async ({ page }) => {
  await open(page);
  const vw = page.viewportSize()!.width;
  const bars = ["header.ed-top", vw >= 1024 ? "[data-testid=editor-tools]" : ".ed-dock"];
  for (const sel of bars) {
    const b = (await page.locator(sel).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vw + 0.5);
    expect(await page.locator(sel).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const top = (await page.locator("header.ed-top").boundingBox())!;
  await page.getByTestId("canvas").evaluate((el) => el.scrollBy(0, 900));
  expect((await page.locator("header.ed-top").boundingBox())!.y).toBe(top.y);
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeInViewport();
  if (vw < 1024) {
    // Shapes lives in More on phones: the More button shows it.
    await tool(page, "r");
    const more = page.getByTestId("dock-more");
    if (await more.count()) await expect(more).toHaveAccessibleName(/Shapes active/);
    else await expect(page.getByRole("button", { name: "Shapes", pressed: true })).toBeVisible();
  }
  const meta = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(meta ?? "").not.toMatch(/user-scalable\s*=\s*(0|no)|maximum-scale\s*=\s*1(\.0)?\b/);
});

test("AC-49 AC-56: tools have names, shortcuts and hints; the open editor has no serious axe violations", async ({ page }) => {
  await open(page);
  for (const name of ["Select", "Text", "Sign", "Mark", "Whiteout"]) {
    const b = page.getByRole("button", { name, exact: true }).first();
    if (await b.isVisible()) await expect(b).toHaveAttribute("aria-keyshortcuts", /^[A-Z]$/);
  }
  await addText(page, "Accessible");
  await expect(page.getByRole("group", { name: /Accessible/ })).toHaveAttribute("data-selected", "true");
  await expectNoSeriousAxeViolations(page, "editor with a selection");
});

test("AC-44 AC-93: Ctrl+S downloads, a second download works, and the editor stays open", { tag: "@serial" }, async ({ page }) => {
  await open(page, "chrome-justified-mixed.pdf");
  await addText(page, "One");
  await page.getByTestId("canvas").focus();
  const [d1] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  expect(d1.suggestedFilename()).toBe("chrome-justified-mixed.pdf");
  await addText(page, "Two", 1, 0.3, 0.8);
  const t0 = Date.now();
  const out = await download(page);
  expect(Date.now() - t0).toBeLessThan(3000);
  const [text] = await pageTexts(out.bytes);
  expect(text).toContain("One");
  expect(text).toContain("Two");
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
});
