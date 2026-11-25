/**
 * F16 E1 round-2 eval follow-ups: Draw selects a stroke it is pressed on (gap 6), tool tooltips sit
 * beside their buttons so names match what shows (gap 5, WCAG 2.5.3), and the Image tool offers the
 * last five images used on this device (gap 4, AC-66).
 */
import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousAxeViolations } from "../support/axe";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = t[(c ^ x) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
}
/** A one-colour 24×16 RGB PNG: each shade is a different image. */
function png(shade: number): { name: string; mimeType: string; buffer: Buffer } {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(24, 0);
  ihdr.writeUInt32BE(16, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + 24 * 3, shade);
  row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: 16 }, () => row));
  return { name: `shade-${shade}.png`, mimeType: "image/png", buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]) };
}

async function open(page: Page, file = "report-form-3p.pdf") {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus(file));
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}
async function tool(page: Page, key: string) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press(key);
}
/** A point on page 1 at fractions of its box, scrolled to the middle of the canvas when off screen. */
async function at(page: Page, fx: number, fy: number) {
  const el = page.getByTestId("page-1");
  let b = (await el.boundingBox())!;
  const vh = page.viewportSize()!.height;
  const y = b.y + b.height * fy;
  if (y < 110 || y > vh - 160) {
    await page.getByTestId("canvas").evaluate((c, d) => c.scrollBy(0, d), y - vh / 2);
    await page.waitForTimeout(150);
    b = (await el.boundingBox())!;
  }
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  // The second point may have scrolled the page: take the first again.
  const a2 = await at(page, ...from);
  a.x = a2.x;
  a.y = a2.y;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

const ink = (page: Page) => page.locator('[data-kind="ink"]');

test("gap 6: with Draw armed, a click on a stroke selects it; drawing over empty space and page text still draws", async ({ page }) => {
  await open(page);
  // The first line of the report is page text: a stroke across it is drawn, not a selection.
  await tool(page, "p");
  await drag(page, [0.1, 0.09], [0.6, 0.09]);
  await expect(ink(page)).toHaveCount(1);
  // Empty space lower down.
  await drag(page, [0.2, 0.92], [0.5, 0.95]);
  await expect(ink(page)).toHaveCount(2);
  await expect(page.locator('[data-kind="ink"][data-selected="true"]')).toHaveCount(0);
  // A click in the middle of the first (straight) stroke selects it and draws nothing.
  const mid = await at(page, 0.35, 0.09);
  await page.mouse.click(mid.x, mid.y);
  await expect(ink(page)).toHaveCount(2);
  await expect(ink(page).first()).toHaveAttribute("data-selected", "true");
  // Draw is still the tool: empty space draws again (and clears the selection).
  await drag(page, [0.2, 0.8], [0.45, 0.82]);
  await expect(ink(page)).toHaveCount(3);
  await expect(page.locator('[data-kind="ink"][data-selected="true"]')).toHaveCount(0);
});

test("gap 5: a tool's tooltip is beside its button, describes it, and the active tool passes axe with its tip showing", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "tooltips show on hover and keyboard focus with a fine pointer");
  await open(page);
  await tool(page, "h");
  const mark = page.getByRole("button", { name: "Mark", exact: true });
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  // Nothing but the icon inside the button: its name is what it shows.
  expect(await mark.evaluate((b) => b.textContent?.trim() ?? "")).toBe("");
  await expect(mark).toHaveAccessibleDescription(/Mark H\s*Drag across words to mark them/);
  // Keyboard focus shows the tip.
  await mark.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(mark).toBeFocused();
  const tip = page.locator(`#${await mark.getAttribute("aria-describedby")}`);
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute("role", "tooltip");
  await expectNoSeriousAxeViolations(page, "active tool focused, its tooltip showing");
});

test("gap 7: the font size field is a native number field (no role on a text input)", async ({ page }) => {
  await open(page);
  await tool(page, "t");
  const p = await at(page, 0.3, 0.6);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("text-input")).toBeFocused();
  await page.keyboard.type("Size");
  await page.getByTestId("text-input").press("Escape");
  const size = page.getByRole("spinbutton", { name: "Font size" }).first();
  await expect(size).toBeVisible();
  expect(await size.evaluate((el) => [el.getAttribute("type"), el.getAttribute("role")])).toEqual(["number", null]);
});

test.describe("AC-66: recent images", () => {
  /** Places a new image; `recent`: this device has used images before, so the list shows first. */
  async function place(page: Page, file: ReturnType<typeof png>, fy: number, recent = true) {
    await tool(page, "i");
    if (recent) {
      await expect(page.getByTestId("recent-images")).toBeVisible();
      const chooser = page.waitForEvent("filechooser");
      await page.getByTestId("recent-choose").click();
      await (await chooser).setFiles(file);
    } else await page.getByTestId("image-input").setInputFiles(file);
    // The image is read on this device first; then it follows the pointer until a click places it.
    await expect(page.locator(".ed-pagewrap--place").first()).toBeAttached();
    const before = Number(await page.getByTestId("image-input").getAttribute("data-recent"));
    const p = await at(page, 0.5, fy);
    await page.mouse.click(p.x, p.y);
    // Kept on this device (a hash and an IndexedDB write) before the next pick.
    await expect.poll(async () => Number(await page.getByTestId("image-input").getAttribute("data-recent"))).toBe(Math.min(5, before + 1));
  }

  test("the last five placed images are offered before the file picker, each removable, kept on this device only", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET" && r.method() !== "HEAD") sent.push(`${r.method()} ${r.url()}`);
    });
    await open(page);
    // No recent images yet: the Image tool goes straight to the file picker.
    await place(page, png(10), 0.3, false);
    await expect(page.locator('[data-kind="image"]')).toHaveCount(1);
    // Now the Image tool shows it first, with Choose image.
    await tool(page, "i");
    const list = page.getByTestId("recent-images");
    await expect(list).toBeVisible();
    await expect(list.getByRole("button", { name: /^Place recent image/ })).toHaveCount(1);
    await expect(page.getByTestId("recent-choose")).toBeFocused();
    // One click on it arms the same image; the next click on the page places it.
    await list.getByRole("button", { name: "Place recent image 1" }).click();
    await expect(list).toBeHidden();
    await expect(page.locator(".ed-pagewrap--place").first()).toBeAttached();
    const p = await at(page, 0.5, 0.5);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('[data-kind="image"]')).toHaveCount(2);
    // The same image again: still one entry.
    await expect(page.getByTestId("image-input")).toHaveAttribute("data-recent", "1");
    // Six different images: five are kept, newest first.
    for (const [i, shade] of [40, 80, 120, 160, 200].entries()) await place(page, png(shade), 0.4 + i * 0.08);
    await tool(page, "i");
    await expect(list.getByRole("button", { name: /^Place recent image/ })).toHaveCount(5);
    // Kept across a reload (IndexedDB on this device).
    await page.keyboard.press("Escape");
    await open(page);
    await tool(page, "i");
    await expect(list.getByRole("button", { name: /^Place recent image/ })).toHaveCount(5);
    // Each can be removed; focus stays in the list.
    await list.getByRole("button", { name: "Remove recent image 1" }).click();
    await expect(list.getByRole("button", { name: /^Place recent image/ })).toHaveCount(4);
    await expect(list.getByRole("button", { name: "Place recent image 1" })).toBeFocused();
    for (let n = 4; n > 0; n--) await list.getByRole("button", { name: "Remove recent image 1" }).click();
    await expect(list.getByRole("button", { name: /^Place recent image/ })).toHaveCount(0);
    await expect(page.getByTestId("recent-choose")).toBeFocused();
    await page.keyboard.press("Escape");
    // None left: straight to the file picker again.
    const chooser = page.waitForEvent("filechooser", { timeout: 5000 });
    await tool(page, "i");
    await chooser;
    await expect(list).toBeHidden();
    expect(sent, "nothing is uploaded").toEqual([]);
  });

  for (const width of [320, 390]) {
    test(`at ${width}px the recent images sheet fits with nothing clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height: 568 });
      await open(page);
      for (const [i, shade] of [30, 90, 150].entries()) await place(page, png(shade), 0.2 + i * 0.1, i > 0);
      await tool(page, "i");
      const list = page.getByTestId("recent-images");
      await expect(list).toBeVisible();
      await page.waitForTimeout(400);
      for (const el of [list, page.getByTestId("recent-choose"), ...(await list.getByRole("button").all())]) {
        const b = (await el.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(width + 0.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expectNoSeriousAxeViolations(page, `recent images at ${width}px`);
    });
  }
});
