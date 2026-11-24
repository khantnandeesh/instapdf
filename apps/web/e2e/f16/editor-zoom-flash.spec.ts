/**
 * F16: zooming never flashes a page white. The page keeps its current bitmap (stretched to the
 * new size) until the render at the new scale is drawn, then swaps in one frame; Ctrl+wheel only
 * transforms the pages during the gesture and re-renders once it settles.
 *
 * A sampler in the page checks every animation frame: at a known ink spot of page 1, the shown
 * canvas must exist, be fully opaque and be dark there. With ZOOM_FRAMES=<dir> the test also
 * saves the screen frames (CDP screencast) of the run, for the before/after strips.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

async function open(page: Page, file: string) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus(file));
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

/** Starts the per-frame sampler: finds a dark spot on page 1 and records each frame's state there. */
async function startSampler(page: Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('[data-testid="page-1"]') as HTMLElement;
    const first = wrap.querySelector("canvas") as HTMLCanvasElement;
    const ctx = first.getContext("2d")!;
    const { width: w, height: h } = first;
    const data = ctx.getImageData(0, 0, w, h).data;
    const dark = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      return data[i + 3] > 200 && data[i] + data[i + 1] + data[i + 2] < 180;
    };
    // A spot inside a glyph stroke: dark with its 8 neighbours dark too.
    let spot: [number, number] | null = null;
    for (let y = Math.floor(h * 0.03); y < h * 0.6 && !spot; y += 1)
      for (let x = Math.floor(w * 0.03); x < w * 0.97; x += 1) {
        if (!dark(x, y)) continue;
        if ([-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => dark(x + dx, y + dy)))) {
          spot = [(x + 0.5) / w, (y + 0.5) / h];
          break;
        }
      }
    if (!spot) throw new Error("no ink spot on page 1");
    const state = { frames: 0, bad: [] as string[], stop: false, spot };
    (window as unknown as { __zoom: typeof state }).__zoom = state;
    const tick = () => {
      if (state.stop) return;
      state.frames++;
      const scroller = document.querySelector('[data-testid="canvas"]') as HTMLElement;
      const box = wrap.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      const sx = box.left + box.width * spot![0];
      const sy = box.top + box.height * spot![1];
      if (sx >= view.left && sx <= view.right && sy >= view.top && sy <= view.bottom) {
        const c = wrap.querySelector("canvas") as HTMLCanvasElement | null;
        let why = "";
        if (!c || !c.width || !c.isConnected) why = "no canvas";
        else {
          let o = 1;
          for (let el: HTMLElement | null = c; el && el !== scroller; el = el.parentElement) o *= parseFloat(getComputedStyle(el).opacity);
          const px = c.getContext("2d")!.getImageData(Math.floor(spot![0] * c.width), Math.floor(spot![1] * c.height), 1, 1).data;
          if (o < 0.98) why = `opacity ${o.toFixed(2)}`;
          else if (px[3] < 200 || px[0] + px[1] + px[2] > 300) why = `light pixel ${px.join(",")}`;
        }
        if (why) state.bad.push(`frame ${state.frames}: ${why}`);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return spot;
  });
}

async function stopSampler(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __zoom: { frames: number; bad: string[]; stop: boolean } }).__zoom;
    s.stop = true;
    return { frames: s.frames, bad: s.bad };
  });
}

/** Optional: records screen frames while `run` goes. */
async function recordFrames(page: Page, name: string, run: () => Promise<void>) {
  const dir = process.env.ZOOM_FRAMES;
  if (!dir) return run();
  const cdp = await page.context().newCDPSession(page);
  const frames: Buffer[] = [];
  cdp.on("Page.screencastFrame", (f) => {
    frames.push(Buffer.from(f.data, "base64"));
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 });
  try {
    await run();
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => {});
    const out = join(dir, name);
    mkdirSync(out, { recursive: true });
    frames.forEach((b, i) => writeFileSync(join(out, `${String(i).padStart(4, "0")}.jpg`), b));
  }
}

test("zooming in and out never shows a blank or white page where it had content", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Zoom buttons and Ctrl+wheel are desktop input; pinch shares the same path");
  await open(page, "report-form-3p.pdf");
  // The first appearance fades in (once); sampling starts after it.
  await page.waitForTimeout(400);
  await startSampler(page);
  await recordFrames(page, `${info.project.name}-zoom`, async () => {
    // Buttons: each step re-renders the page.
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Zoom in" }).first().click();
      await page.waitForTimeout(i % 2 ? 60 : 400);
    }
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Zoom out" }).first().click();
      await page.waitForTimeout(i % 2 ? 60 : 400);
    }
    // Ctrl+wheel over page 1: a stream of small steps, then a pause, both ways.
    const b = (await page.getByTestId("page-1").boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.4, Math.max(b.y + 40, 200));
    await page.keyboard.down("Control");
    for (const dir of [-1, 1, -1, 1]) {
      for (let i = 0; i < 8; i++) {
        await page.mouse.wheel(0, dir * 40);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(500);
    }
    await page.keyboard.up("Control");
    await page.waitForTimeout(600);
  });
  const { frames, bad } = await stopSampler(page);
  expect(frames).toBeGreaterThan(60);
  expect(bad, `frames where page 1 was blank at its ink spot (of ${frames})`).toEqual([]);
  // The pages settle at the final zoom, sharp: the bitmap matches the page size again.
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true");
  const ratio = await page.getByTestId("page-1").evaluate((el) => {
    const c = el.querySelector("canvas")!;
    return c.width / c.getBoundingClientRect().width / Math.min(2, devicePixelRatio || 1);
  });
  expect(ratio).toBeGreaterThan(0.97);
  expect(ratio).toBeLessThan(1.03);
});

test("objects and the text layer stay on their spot while a Ctrl+wheel zoom is in progress", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Ctrl+wheel is desktop input");
  await open(page, "report-form-3p.pdf");
  const line = page.getByTestId("page-1").locator('[data-testid="line"]').first();
  await expect(line).toBeVisible();
  const rel = async () =>
    page.getByTestId("page-1").evaluate((wrap) => {
      const p = wrap.getBoundingClientRect();
      const l = wrap.querySelector('[data-testid="line"]')!.getBoundingClientRect();
      return [(l.left - p.left) / p.width, (l.top - p.top) / p.height];
    });
  const before = await rel();
  const b = (await page.getByTestId("page-1").boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.5, Math.max(b.y + 60, 220));
  await page.keyboard.down("Control");
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -40);
  // Mid-gesture (before it settles): the line moved with the page.
  const during = await rel();
  await page.keyboard.up("Control");
  await page.waitForTimeout(700);
  const after = await rel();
  for (const r of [during, after]) {
    expect(Math.abs(r[0] - before[0])).toBeLessThan(0.01);
    expect(Math.abs(r[1] - before[1])).toBeLessThan(0.01);
  }
});
