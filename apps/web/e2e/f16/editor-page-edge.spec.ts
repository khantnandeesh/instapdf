/**
 * F16: objects never sit past the page edge. Dragging past each edge stops at it, resizing stops
 * at it, a signature larger than the page is fitted, and typed text wraps at the right edge.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

async function open(page: Page) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus("report-form-3p.pdf"));
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

async function tool(page: Page, key: string) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press(key);
}

const box = async (l: Locator) => (await l.boundingBox())!;

/** The object's box lies inside the page's box (1 px for rounding). */
async function expectInside(page: Page, obj: Locator) {
  const p = await box(page.getByTestId("page-1"));
  const o = await box(obj);
  expect(o.x).toBeGreaterThanOrEqual(p.x - 1);
  expect(o.y).toBeGreaterThanOrEqual(p.y - 1);
  expect(o.x + o.width).toBeLessThanOrEqual(p.x + p.width + 1);
  expect(o.y + o.height).toBeLessThanOrEqual(p.y + p.height + 1);
  return { p, o };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

async function placeSignature(page: Page, text: string) {
  await tool(page, "s");
  await page.getByTestId("sign-text").fill(text);
  await page.getByTestId("sign-place").click();
  await expect(page.getByTestId("sign-dialog")).toBeHidden();
  const p = await box(page.getByTestId("page-1"));
  await page.mouse.click(p.x + p.width / 2, p.y + Math.min(p.height, page.viewportSize()!.height - p.y) / 2);
  const sig = page.locator('[data-kind="signature"]');
  await expect(sig).toHaveCount(1);
  return sig;
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "pointer drags are covered on desktop; touch uses the same clamp");
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("dragging a signature past each edge stops at that edge", async ({ page }) => {
  await open(page);
  const sig = await placeSignature(page, "Asha Rao");
  const far = 2000;
  for (const [dx, dy, edge] of [[-far, 0, "left"], [far, 0, "right"], [0, -far, "top"], [0, far, "bottom"]] as const) {
    const o = await box(sig);
    const c = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
    // Stay inside the window: the pointer is captured, so the drag keeps going past the page.
    const vw = page.viewportSize()!;
    const to = { x: Math.min(vw.width - 2, Math.max(2, c.x + dx)), y: Math.min(vw.height - 2, Math.max(2, c.y + dy)) };
    await drag(page, c, to);
    const { p, o: a } = await expectInside(page, sig);
    if (edge === "left") expect(Math.abs(a.x - p.x)).toBeLessThan(2);
    if (edge === "right") expect(Math.abs(a.x + a.width - (p.x + p.width))).toBeLessThan(2);
    if (edge === "top") expect(Math.abs(a.y - p.y)).toBeLessThan(2);
    // The page can be taller than the window: the bottom edge is checked through the readout-free
    // way, by nudging down with the keyboard until it stops.
    if (edge === "bottom") {
      await sig.focus();
      for (let i = 0; i < 120; i++) await page.keyboard.press("Shift+ArrowDown");
      const q = await box(page.getByTestId("page-1"));
      const b = await box(sig);
      expect(Math.abs(b.y + b.height - (q.y + q.height))).toBeLessThan(2);
    }
  }
});

test("resizing a signature past the page edge stops at the edge and keeps its shape", async ({ page }) => {
  await open(page);
  const sig = await placeSignature(page, "Asha Rao");
  await sig.click();
  const before = await box(sig);
  const handle = page.locator('[data-handle="ne"]').first();
  await expect(handle).toBeVisible();
  const h = await box(handle);
  await drag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: page.viewportSize()!.width - 2, y: 2 });
  const { p, o } = await expectInside(page, sig);
  expect(o.width).toBeGreaterThan(before.width);
  expect(o.width / o.height).toBeCloseTo(before.width / before.height, 0);
  // It reached the right edge (the corner handle stopped there).
  expect(Math.abs(o.x + o.width - (p.x + p.width))).toBeLessThan(2);
});

test("a long typed signature is fitted to the page when placed", async ({ page }) => {
  await open(page);
  const sig = await placeSignature(page, "Asha Rao Venkataraman Subramaniam Krishnamurthy Iyer the Third of Coimbatore");
  await expectInside(page, sig);
  // Grow it with the keyboard-free path: drag its corner far past the page; it stays on the page.
  await sig.click();
  const h = await box(page.locator('[data-handle="se"]').first());
  await drag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: page.viewportSize()!.width - 2, y: page.viewportSize()!.height - 2 });
  await expectInside(page, sig);
});

test("text typed past the right edge wraps at the edge", async ({ page }) => {
  await open(page);
  await tool(page, "t");
  const p = await box(page.getByTestId("page-1"));
  await page.mouse.click(p.x + p.width * 0.7, p.y + 120);
  const input = page.locator('[data-kind="text"] textarea, textarea').first();
  await expect(input).toBeFocused();
  await page.keyboard.type("This sentence is much too long to fit between here and the right edge of the page");
  await page.keyboard.press("Escape");
  const text = page.locator('[data-kind="text"]');
  await expect(text).toHaveCount(1);
  await expectInside(page, text);
});
