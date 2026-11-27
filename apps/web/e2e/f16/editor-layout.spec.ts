/**
 * F25 E1 editor layout (docs/specs/f25-tool-layout-standard.md §5, §7): AC-624–629, AC-650 and AC-651.
 * The site header stays, the editor bar is slim, the strip is always there from 1024 px, the download
 * says "Downloaded" in its slot with a small card under it (no toast), and leaving by a header link asks.
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

async function open(page: Page, file = "report-form-3p.pdf") {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(corpus(file));
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

/** Adds a text box on page 1, `dy` px below the page's top (each call in a test uses its own spot). */
async function addText(page: Page, text: string, dy = 160) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("t");
  const b = (await page.getByTestId("page-1").boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.3, b.y + dy);
  await expect(page.getByTestId("text-input")).toBeFocused();
  await page.keyboard.type(text);
  await page.getByTestId("text-input").press("Escape");
  await expect(page.getByTestId("text-input")).toHaveCount(0);
}

const downloadBtn = (page: Page) => page.getByRole("button", { name: "Download PDF" });

for (const [width, height] of [
  [1280, 632],
  [390, 664],
] as const) {
  test(`AC-624 AC-628: at ${width}x${height} the site header stays usable, nothing is fixed or inert, and the canvas gets the rest`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const banner = page.getByRole("banner").first();
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("link").first()).toBeVisible();
    const fixedAncestor = await page.getByTestId("editor-shell").evaluate((el) => {
      for (let n: Element | null = el; n; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return n.className || n.tagName;
      return "";
    });
    expect(fixedAncestor, "no ancestor of the editor is position: fixed").toBe("");
    expect(await page.locator("main").evaluate((m) => (m as HTMLElement).inert)).toBe(false);
    const canvas = (await page.getByTestId("canvas").boundingBox())!;
    if (width >= 1024) expect(canvas.height).toBeGreaterThanOrEqual(632 - 72 - 56);
    else {
      const dock = (await page.getByTestId("dock").boundingBox())!;
      expect(canvas.height).toBeGreaterThanOrEqual(height - 64 - 56 - dock.height - 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test("AC-625: from 1024 the bar reads h1 Edit PDF + Beta, file menu, tools, Undo, Redo, Download; no rail. Below 1024: h1, file menu, Download and the dock", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 632 });
  await open(page);
  const top = page.locator(".ed-top");
  const order = await top.evaluate((bar) => {
    const pick = (sel: string) => bar.querySelector(sel)?.getBoundingClientRect().left ?? -1;
    return [pick("h1"), pick(".ed-beta"), pick("[data-testid=file-menu]"), pick("[data-testid=editor-tools]"), pick("[aria-label=Undo]"), pick("[aria-label=Redo]"), pick("[data-testid=download]")];
  });
  for (const x of order) expect(x).toBeGreaterThanOrEqual(0);
  for (let i = 1; i < order.length; i++) expect(order[i], `item ${i} follows item ${i - 1}`).toBeGreaterThan(order[i - 1]);
  await expect(top.getByRole("heading", { level: 1 })).toHaveText("Edit PDF");
  await expect(page.locator(".ed-rail")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 664 });
  await expect(page.locator(".ed-top h1")).toBeVisible();
  await expect(page.getByTestId("file-menu")).toBeVisible();
  await expect(downloadBtn(page)).toBeVisible();
  await expect(page.getByTestId("dock")).toBeVisible();
  await expect(page.getByTestId("editor-tools")).toHaveCount(0);
});

test("AC-626: the page strip is shown on open at every width from 1024, beside the canvas, never inside it", async ({ page }) => {
  for (const width of [1024, 1280, 1599, 1920]) {
    await page.setViewportSize({ width, height: 768 });
    await open(page);
    const strip = page.getByTestId("editor-strip");
    await expect(strip, `strip at ${width}`).toBeVisible();
    const s = (await strip.boundingBox())!;
    const c = (await page.getByTestId("page-1").boundingBox())!;
    expect(s.x + s.width, `the strip ends before the first page at ${width}`).toBeLessThanOrEqual(c.x);
    expect(await page.getByTestId("canvas").evaluate((el) => !!el.querySelector("[data-testid=editor-strip]"))).toBe(false);
    await expect(page.locator("[data-region=panel]")).toHaveCount(1);
  }
});

test("AC-627: no properties panel with nothing selected; selecting shows it in the same frame without moving the object; deselecting hides it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 632 });
  await open(page);
  const props = page.getByTestId("editor-props");
  await expect(props).toHaveCount(0);
  await addText(page, "Hold still");
  await page.keyboard.press("v");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
  await expect(props).toHaveCount(0);
  // The first frame after the press already has the panel.
  await page.evaluate(() => {
    const w = window as unknown as { __propsAtFrame?: boolean };
    document.addEventListener("pointerdown", () => requestAnimationFrame(() => (w.__propsAtFrame = !!document.querySelector("[data-testid=editor-props]"))), { capture: true, once: true });
  });
  const box = page.getByRole("group", { name: /Hold still/ });
  const before = (await box.boundingBox())!;
  await box.click();
  await expect(props).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __propsAtFrame?: boolean }).__propsAtFrame)).toBe(true);
  await expect(props.getByRole("toolbar", { name: /properties/ })).toBeVisible();
  const after = (await box.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  // It never covers what is selected.
  const p = (await props.boundingBox())!;
  const covers = !(p.x + p.width <= after.x || after.x + after.width <= p.x || p.y + p.height <= after.y || after.y + after.height <= p.y);
  expect(covers).toBe(false);
  // Deselecting hides it: Escape, and a click on empty canvas.
  await page.keyboard.press("Escape");
  await expect(props).toHaveCount(0);
  await box.click();
  await expect(props).toBeVisible();
  // Empty space on the page.
  const c = (await page.getByTestId("page-1").boundingBox())!;
  await page.mouse.click(c.x + c.width * 0.6, c.y + 300);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
  await expect(props).toHaveCount(0);
  // A tool with options shows them in the panel.
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("t");
  await expect(props).toBeVisible();
});

test("AC-627: a selection under the panel's spot moves the panel to the canvas's left, so nothing selected is covered", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 632 });
  await open(page);
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("t");
  const b = (await page.getByTestId("page-1").boundingBox())!;
  // Just under the panel (it shows the Text tool's options now), so the click reaches the page.
  const tp = (await page.getByTestId("editor-props").boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.86, tp.y + tp.height + 16);
  await expect(page.getByTestId("text-input")).toBeFocused();
  await page.keyboard.type("Edge");
  await page.getByTestId("text-input").press("Escape");
  await page.keyboard.press("v");
  await page.keyboard.press("Escape");
  const box = page.getByRole("group", { name: /Edge/ });
  await box.click();
  const props = page.getByTestId("editor-props");
  await expect(props).toBeVisible();
  const o = (await box.boundingBox())!;
  const p = (await props.boundingBox())!;
  const covers = !(p.x + p.width <= o.x || o.x + o.width <= p.x || p.y + p.height <= o.y || o.y + o.height <= p.y);
  expect(covers, "the panel leaves the selected object visible").toBe(false);
  await expect(props).toHaveAttribute("data-side", "left");
  // On the canvas's left means beside the page strip, never over it.
  const strip = (await page.getByTestId("editor-strip").boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(strip.x + strip.width);
});

test("G-9: a selection under both of the panel's spots: the panel moves below or above it, and stays clear while the pages scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 632 });
  await open(page);
  const props = page.getByTestId("editor-props");
  const clear = async () => {
    const r = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('[data-testid=canvas] [data-selected="true"], [data-testid=canvas] [data-handle]'), (e) => e.getBoundingClientRect());
      const p = document.querySelector("[data-testid=editor-props]")?.getBoundingClientRect();
      if (!p || !boxes.length) return null;
      const s = { l: Math.min(...boxes.map((b) => b.left)), r: Math.max(...boxes.map((b) => b.right)), t: Math.min(...boxes.map((b) => b.top)), b: Math.max(...boxes.map((b) => b.bottom)) };
      const visible = (y: number) => Math.max(0, Math.min(y, innerHeight));
      // Only the part of the selection on screen counts.
      const covers = Math.min(p.right, s.r) > Math.max(p.left, s.l) && Math.min(p.bottom, visible(s.b)) > Math.max(p.top, visible(s.t));
      return { covers, side: document.querySelector("[data-testid=editor-props]")!.getAttribute("data-side") };
    });
    return r;
  };
  // A wide rectangle across the whole page, under the panel's spot on the right and on the left.
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("r");
  const b = (await page.getByTestId("page-1").boundingBox())!;
  const tp = (await props.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.03, tp.y + 30);
  await page.mouse.down();
  // It ends below the panel, so the pointer never goes over it.
  await page.mouse.move(b.x + b.width * 0.5, tp.y + tp.height + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width * 0.97, tp.y + tp.height + 12, { steps: 4 });
  await page.mouse.up();
  // The shape just drawn is selected (Shapes stays armed, so its kind switch shows above: a taller panel).
  await expect(page.locator('[data-kind="shape"][data-selected="true"]')).toHaveCount(1);
  await expect(props).toBeVisible();
  await expect.poll(async () => (await clear())?.covers).toBe(false);
  expect(["below", "above"]).toContain((await clear())?.side);
  // The pages scroll under it: it follows, never covering what is still on screen.
  for (const dy of [40, 80, 120, -200]) {
    await page.getByTestId("canvas").evaluate((el, dy) => el.scrollBy(0, dy), dy);
    await expect.poll(async () => (await clear())?.covers ?? false).toBe(false);
  }
});

test("G-10: with Shapes armed, a shape just drawn keeps the kind switch above its own controls until Esc", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 632 });
  await open(page);
  const props = page.getByTestId("editor-props");
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("r");
  const kinds = props.getByRole("radiogroup", { name: "Shape" });
  await expect(kinds).toBeVisible();
  const b = (await page.getByTestId("page-1").boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.2, b.y + 220);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.35, b.y + 300, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-kind="shape"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Shapes", pressed: true })).toBeVisible();
  // Still armed: the kind switch stays, above the drawn shape's controls.
  await expect(kinds).toBeVisible();
  await expect(props.getByRole("toolbar", { name: /properties/ })).toBeVisible();
  const k = (await kinds.boundingBox())!;
  const t = (await props.getByRole("toolbar", { name: /properties/ }).boundingBox())!;
  expect(k.y + k.height).toBeLessThanOrEqual(t.y);
  // A second kind applies to the next shape.
  await kinds.getByRole("radio", { name: "Ellipse" }).click();
  await expect(kinds.getByRole("radio", { name: "Ellipse" })).toHaveAttribute("aria-checked", "true");
});

test("G-1 page actions: they take the pointer only in the page's top band; lower on the page what is under them is the page's; Tab reaches them with a drawing tool armed", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse (a touch screen keeps the current page's actions shown)");
  await page.setViewportSize({ width: 1280, height: 632 });
  await open(page);
  const rotate = page.getByRole("button", { name: "Rotate right, page 1" });
  const p1 = (await page.getByTestId("page-1").boundingBox())!;
  const r = (await rotate.boundingBox())!;
  const hit = () => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".ed-pagehead button")?.getAttribute("aria-label") ?? null, [r.x + r.width / 2, r.y + r.height / 2]);
  // At rest, and with the pointer lower on the page, the action's spot is the page's.
  expect(await hit()).toBe(null);
  await page.mouse.move(p1.x + p1.width / 2, p1.y + 200);
  await page.waitForTimeout(250);
  expect(await hit()).toBe(null);
  expect(Number(await rotate.evaluate((b) => getComputedStyle(b.parentElement!).opacity))).toBe(0);
  // In the top band they show and take the pointer.
  await page.mouse.move(p1.x + p1.width / 2, p1.y + 20);
  await expect.poll(() => hit()).toBe("Rotate right, page 1");
  // The pages scrolling under a still pointer take the band with them: page 1's actions go once its top
  // has scrolled away, and come back when it scrolls back under the pointer.
  const head0 = () => page.locator('.ed-slot[data-index="0"]').evaluate((el) => el.hasAttribute("data-head"));
  await page.mouse.wheel(0, 200);
  await expect.poll(head0).toBe(false);
  await page.mouse.wheel(0, -200);
  await expect.poll(head0).toBe(true);
  await expect.poll(() => hit()).toBe("Rotate right, page 1");
  await rotate.click();
  await expect(page.getByTestId("live")).not.toBeEmpty();
  // A drawing tool armed: the band is the page's for the pointer, but Tab still reaches the actions.
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("p");
  await expect(page.locator(".ed-frame-root")).toHaveAttribute("data-tool", "draw");
  await page.mouse.move(p1.x + p1.width / 2, p1.y + 20);
  await page.waitForTimeout(250);
  expect(await hit()).toBe(null);
  await page.getByRole("button", { name: "Rotate left, page 1" }).focus();
  await expect(page.getByRole("button", { name: "Rotate left, page 1" })).toBeFocused();
  await expect.poll(() => rotate.evaluate((b) => getComputedStyle(b.parentElement!).opacity)).toBe("1");
});

test("AC-629: a header link with edits not downloaded asks; Cancel stays, Download anyway downloads then leaves; no edits leaves at once", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 632 });
  await open(page);
  const link = page.getByRole("banner").first().getByRole("link", { name: /rotate/i }).first();
  await addText(page, "Not saved yet");
  await link.click();
  const ask = page.getByRole("dialog", { name: "Close without downloading?" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/edit-pdf$/);
  await expect(page.locator('[data-kind="text"]')).toHaveCount(1);
  await link.click();
  const [dl] = await Promise.all([page.waitForEvent("download"), ask.getByRole("button", { name: "Download anyway" }).click()]);
  expect(dl.suggestedFilename()).toBe("report-form-3p.pdf");
  await expect(page).toHaveURL(/\/rotate-pdf$/);

  await open(page);
  await page.getByRole("banner").first().getByRole("link", { name: /rotate/i }).first().click();
  await expect(page).toHaveURL(/\/rotate-pdf$/);
});

test("AC-650: Download runs the pill, says Downloaded for about 2.4s, and opens the card (no toast); Escape and the next edit close it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 632 });
  await open(page);
  await addText(page, "Ready to go");
  await page.evaluate(() => {
    const w = window as unknown as { __dl: { pill?: number; done?: number; back?: number; pillFocused?: boolean } };
    w.__dl = {};
    new MutationObserver(() => {
      const now = performance.now();
      const btn = document.querySelector("[data-testid=download]");
      const pill = document.querySelector("[data-testid=processing]");
      if (!w.__dl.pill && pill) w.__dl.pill = now;
      // The pill takes focus while it runs (so Escape cancels).
      if (pill && document.activeElement === pill) w.__dl.pillFocused = true;
      if (!w.__dl.done && btn?.hasAttribute("data-done")) w.__dl.done = now;
      if (w.__dl.done && !w.__dl.back && btn && !btn.hasAttribute("data-done")) w.__dl.back = now;
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-done"] });
  });
  const [dl] = await Promise.all([page.waitForEvent("download"), downloadBtn(page).click()]);
  const bytes = new Uint8Array(await readFile((await dl.path())!));
  await expect(page.getByTestId("download")).toHaveText("Downloaded");
  // Focus went to the pill and back to Download when the run settled.
  await expect(page.getByTestId("download")).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { __dl: { pillFocused?: boolean } }).__dl.pillFocused), "the pill held focus while it ran").toBe(true);
  const card = page.getByTestId("download-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText(`report-form-3p.pdf, `);
  await expect(card).toContainText("Done on this device.");
  await expect(card.getByRole("button")).toHaveCount(4); // Close + three chips
  await expect(page.locator(".ed-toast", { hasText: "Downloaded" })).toHaveCount(0);
  expect(bytes.byteLength).toBeGreaterThan(1000);
  await expect(page.getByTestId("download")).toHaveText("Download", { timeout: 4000 });
  const t = await page.evaluate(() => (window as unknown as { __dl: { pill: number; done: number; back: number } }).__dl);
  expect(t.pill, "the pill ran").toBeGreaterThan(0);
  expect(t.back - t.done).toBeGreaterThanOrEqual(2200);
  expect(t.back - t.done).toBeLessThanOrEqual(2600 + 200);
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  // The next edit closes it too.
  await Promise.all([page.waitForEvent("download"), downloadBtn(page).click()]);
  await expect(card).toBeVisible();
  await addText(page, "One more", 260);
  await expect(card).toHaveCount(0);
});

test("AC-650: from 1024 the pill reads 'Downloading…' whole beside Cancel, and the editor bar doesn't move", async ({ page }) => {
  for (const width of [1024, 1280]) {
    await page.setViewportSize({ width, height: 700 });
    await open(page);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/berry-build\.[^/]*\.js/, async (r) => {
      await gate;
      await r.continue().catch(() => {});
    });
    const bar = () => page.evaluate(() => ["[data-testid=editor-tools]", "[aria-label=Undo]", "[data-testid=action-slot]"].map((s) => document.querySelector(s)!.getBoundingClientRect().x));
    const before = await bar();
    await downloadBtn(page).click();
    const pill = page.getByTestId("processing");
    await expect(pill).toBeVisible();
    await expect(pill).toContainText("Downloading…");
    const fit = await pill.evaluate((p) => {
      const l = p.querySelector<HTMLElement>(".ip-pill__label")!;
      const c = p.querySelector<HTMLElement>(".ip-pill__cancel")!.getBoundingClientRect();
      const r = p.getBoundingClientRect();
      return { whole: l.scrollWidth <= l.clientWidth, cancelInside: c.right <= r.right + 0.5 };
    });
    expect(fit.whole, `the label is not truncated at ${width}`).toBe(true);
    expect(fit.cancelInside, `Cancel sits inside the pill at ${width}`).toBe(true);
    expect(await bar(), `the bar keeps its place at ${width}`).toEqual(before);
    release();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await expect(pill).toHaveCount(0, { timeout: 20_000 });
  }
});

// AC-650 no-password-note: its testid and text are asserted in editor-e1-qa.spec.ts:164.

test("AC-651: Keep going hands the downloaded file to a ready tool without the leave guard", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 632 });
  await open(page);
  await addText(page, "Hand me over");
  await Promise.all([page.waitForEvent("download"), downloadBtn(page).click()]);
  const card = page.getByTestId("download-card");
  await card.getByRole("button", { name: "Merge" }).click();
  await expect(page.getByRole("dialog", { name: "Close without downloading?" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/merge-pdf$/);
  await expect(page.getByTestId("tool-flow")).toHaveAttribute("data-state", "ready", { timeout: 15_000 });
  await expect(page.getByText("report-form-3p.pdf").first()).toBeVisible();
});

test("AC-651: Compress (planned) opens its page with nothing handed over", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 632 });
  await open(page);
  await addText(page, "Shrink me");
  await Promise.all([page.waitForEvent("download"), downloadBtn(page).click()]);
  await page.getByTestId("download-card").getByRole("button", { name: "Compress" }).click();
  await expect(page.getByRole("dialog", { name: "Close without downloading?" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/compress-pdf$/);
});
