/** F1 shared flow, section "Options and processing" (AC-30 to AC-40) plus fixture-corpus checks. Spec: docs/specs/f1-shared-flow.md */
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, PDFName } from "pdf-lib";
import {
  dialog,
  downloadResult,
  fixtureBytes,
  flow,
  isDesktop,
  loadPlain,
  openRotate,
  passwordField,
  pick,
  pickReady,
  primary,
  rotateLeft,
  rotateRight,
  rotationsOf,
  run,
  scope,
  startOver,
  textsOf,
  tiles,
} from "../support/flow";
import { LARGE_MIN_BYTES, makeLargePdf } from "../support/large-pdf";

test.beforeEach(async ({ page }) => {
  await openRotate(page);
});

async function rotateAndDownload(page: Page, fixture: string, act: () => Promise<void>) {
  await pickReady(page, fixture);
  await act();
  await run(page);
  return downloadResult(page);
}

const within = (input: number) => input * 1.1 + 10 * 1024;

test("AC-30: all pages + rotate right gives 3 pages in order, text kept, each /Rotate 90", async ({ page }) => {
  const out = await rotateAndDownload(page, "three-pages.pdf", async () => {
    await expect(scope(page, "All")).toHaveAttribute("aria-checked", "true");
    await rotateRight(page).click();
  });
  expect(await rotationsOf(out.bytes)).toEqual([90, 90, 90]);
  expect(await textsOf(out.bytes)).toEqual(["Page 1", "Page 2", "Page 3"]);
});

test("AC-31: rotate left once gives /Rotate 270 on every page", async ({ page }) => {
  const out = await rotateAndDownload(page, "three-pages.pdf", () => rotateLeft(page).click());
  expect(await rotationsOf(out.bytes)).toEqual([270, 270, 270]);
});

test("AC-32: per-page rotate right on page 2 only gives [0, 90, 0]", async ({ page }) => {
  const out = await rotateAndDownload(page, "three-pages.pdf", async () => {
    await page.getByRole("button", { name: "Rotate page 2 right" }).click();
    await expect(tiles(page).nth(1)).toHaveAttribute("data-rotation", "90");
  });
  expect(await rotationsOf(out.bytes)).toEqual([0, 90, 0]);
});

test("AC-33: odd pages give [90, 0, 90]; even pages give [0, 90, 0]", async ({ page }) => {
  const odd = await rotateAndDownload(page, "three-pages.pdf", async () => {
    await scope(page, "Odd").click();
    await rotateRight(page).click();
  });
  expect(await rotationsOf(odd.bytes)).toEqual([90, 0, 90]);
  await startOver(page);
  const even = await rotateAndDownload(page, "three-pages.pdf", async () => {
    await scope(page, "Even").click();
    await rotateRight(page).click();
  });
  expect(await rotationsOf(even.bytes)).toEqual([0, 90, 0]);
});

test("AC-34: rotate right twice gives 180; four times gives 0", async ({ page }) => {
  const twice = await rotateAndDownload(page, "three-pages.pdf", async () => {
    await rotateRight(page).click();
    await rotateRight(page).click();
  });
  expect(await rotationsOf(twice.bytes)).toEqual([180, 180, 180]);
  await startOver(page);
  const four = await rotateAndDownload(page, "three-pages.pdf", async () => {
    for (let i = 0; i < 4; i++) await rotateRight(page).click();
  });
  expect(await rotationsOf(four.bytes)).toEqual([0, 0, 0]);
});

test("AC-35: Reset after rotations gives the input's /Rotate values", async ({ page }) => {
  const input = await rotationsOf(await fixtureBytes("pre-rotated.pdf"));
  expect(input).toEqual([0, 90, 0]);
  const out = await rotateAndDownload(page, "pre-rotated.pdf", async () => {
    await rotateRight(page).click();
    await page.getByRole("button", { name: "Rotate page 3 left" }).click();
    await page.getByRole("button", { name: "Reset rotation" }).click();
    await expect(tiles(page).nth(0)).toHaveAttribute("data-rotation", "0");
    await expect(primary(page)).toBeEnabled();
  });
  expect(await rotationsOf(out.bytes)).toEqual(input);
});

test("AC-36: pre-rotated.pdf + rotate right keeps and adds to the existing rotation: [90, 180, 90]", async ({ page }) => {
  const out = await rotateAndDownload(page, "pre-rotated.pdf", () => rotateRight(page).click());
  expect(await rotationsOf(out.bytes)).toEqual([90, 180, 90]);
});

test("AC-37: after a rotation click the affected thumbnails are shown rotated before running", async ({ page }) => {
  await pickReady(page, "three-pages.pdf");
  const visual = (i: number) => page.getByTestId("page-visual").nth(i);
  const aspect = async (i: number) => {
    const b = (await visual(i).boundingBox())!;
    return b.width / b.height;
  };
  expect(await aspect(0)).toBeLessThan(1); // portrait
  await scope(page, "Odd").click();
  await rotateRight(page).click();
  await expect(visual(0)).toHaveAttribute("style", /rotate\(90deg\)/);
  await expect.poll(() => aspect(0)).toBeGreaterThan(1); // now landscape on screen
  await expect.poll(() => aspect(2)).toBeGreaterThan(1);
  expect(await aspect(1)).toBeLessThan(1); // page 2 is not in scope
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
});

test("AC-38: primary is disabled while empty, loading or waiting for a password, enabled when ready", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as unknown as { __states: { state: string; enabled: boolean }[] };
    w.__states = [];
    const snap = () => {
      const root = document.querySelector("[data-testid=tool-flow]");
      const btn = document.querySelector<HTMLButtonElement>("[data-testid=primary-action]");
      w.__states.push({ state: root?.getAttribute("data-state") ?? "", enabled: !!btn && !btn.disabled });
    };
    snap();
    new MutationObserver(snap).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  await expect(primary(page)).toBeDisabled();
  await pickReady(page, "sixty-pages.pdf");
  await expect(primary(page)).toBeEnabled();
  await pick(page, "user-pw.pdf");
  await expect(dialog(page)).toBeVisible();
  await expect(flow(page)).toHaveAttribute("data-state", "password");
  await expect(primary(page)).toBeDisabled();
  await passwordField(page).fill("test");
  await passwordField(page).press("Enter");
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(primary(page)).toBeEnabled();

  const states = await page.evaluate(() => (window as unknown as { __states: { state: string; enabled: boolean }[] }).__states);
  const seen = new Set(states.map((s) => s.state));
  expect([...seen]).toEqual(expect.arrayContaining(["empty", "loading", "password", "ready"]));
  expect(states.filter((s) => ["empty", "loading", "password"].includes(s.state) && s.enabled)).toEqual([]);
});

test("AC-39: while processing a progressbar shows and the primary and options are disabled", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CPU throttling uses the Chrome DevTools Protocol");
  await pickReady(page, "sixty-pages.pdf");
  await rotateRight(page).click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const snapshot = page.waitForFunction(() => {
    if (document.querySelector("[data-testid=tool-flow]")?.getAttribute("data-state") !== "processing") return null;
    const bar = document.querySelector("[role=progressbar]");
    if (!bar) return null;
    const btn = document.querySelector<HTMLButtonElement>("[data-testid=primary-action]");
    const dock = document.querySelector("aside[role=region] fieldset") as HTMLFieldSetElement | null;
    const rotate = document.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');
    return {
      barVisible: (bar as HTMLElement).getBoundingClientRect().width > 0,
      primaryEnabled: !!btn && !btn.disabled,
      optionsDisabled: !!dock?.disabled && !!rotate?.matches(":disabled"),
    };
  });
  await primary(page).click();
  const s = await (await snapshot).jsonValue();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(s).toEqual({ barVisible: true, primaryEnabled: false, optionsDisabled: true });
  await expect(flow(page)).toHaveAttribute("data-state", "done", { timeout: 30_000 });
});

test("AC-40: output size is at most input x 1.1 + 10 KB (3-page, 60-page and >= 40 MB inputs)", async ({ page }, info) => {
  test.setTimeout(180_000);
  for (const name of ["three-pages.pdf", "sixty-pages.pdf"]) {
    const input = (await fixtureBytes(name)).length;
    const out = await rotateAndDownload(page, name, () => rotateRight(page).click());
    expect(out.bytes.length, name).toBeLessThanOrEqual(within(input));
    await startOver(page);
  }
  if (!isDesktop(info.project.name)) return; // the 40 MB case runs once, on desktop
  const large = info.outputPath("large.pdf");
  const size = await makeLargePdf(large);
  expect(size).toBeGreaterThanOrEqual(LARGE_MIN_BYTES);
  await pick(page, large);
  await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  await rotateRight(page).click();
  await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "done", { timeout: 90_000 });
  const out = await downloadResult(page);
  expect(out.bytes.length).toBeLessThanOrEqual(within(size));
  expect(await rotationsOf(out.bytes)).toEqual([90, 90, 90]);
});

// ---- fixture corpus: rotation must not lose document features ------------------

test("Corpus: a scanned (image-only) PDF rotates and keeps its page images", async ({ page }) => {
  const out = await rotateAndDownload(page, "scanned.pdf", () => rotateRight(page).click());
  const doc = await loadPlain(out.bytes);
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 90]);
  for (const p of doc.getPages()) {
    const xobjects = p.node.Resources()?.lookup(PDFName.of("XObject"));
    expect(xobjects?.toString()).toMatch(/\/Image|0 R/);
  }
});

test("Corpus: a form PDF keeps its fields and values after rotation", async ({ page }) => {
  const out = await rotateAndDownload(page, "form.pdf", () => rotateRight(page).click());
  const doc = await loadPlain(out.bytes);
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 90]);
  const form = doc.getForm();
  expect(form.getFields().map((f) => f.getName()).sort()).toEqual(["agree", "full_name"]);
  expect(form.getTextField("full_name").getText()).toBe("Ada Lovelace");
  expect(form.getCheckBox("agree").isChecked()).toBe(true);
});

test("Corpus: a PDF with bookmarks keeps its outline after rotation", async ({ page }) => {
  const out = await rotateAndDownload(page, "bookmarks.pdf", () => rotateRight(page).click());
  expect(await rotationsOf(out.bytes)).toEqual([90, 90, 90]);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: out.bytes.slice(), verbosity: 0 });
  const outline = await (await task.promise).getOutline();
  expect(outline?.map((o) => o.title)).toEqual(["Chapter 1", "Chapter 2", "Chapter 3"]);
  await task.destroy();
});

test("Corpus: mixed page sizes keep their sizes and get rotated", async ({ page }) => {
  const input = await PDFDocument.load(await fixtureBytes("mixed-sizes.pdf"));
  const out = await rotateAndDownload(page, "mixed-sizes.pdf", () => rotateRight(page).click());
  const doc = await loadPlain(out.bytes);
  expect(doc.getPages().map((p) => p.getSize())).toEqual(input.getPages().map((p) => p.getSize()));
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 90, 90]);
});

test("Corpus: non-Latin text survives rotation unchanged", async ({ page }) => {
  const before = await textsOf(await fixtureBytes("non-latin.pdf"));
  expect(before[0]).toContain("Привет мир");
  expect(before[0]).toContain("你好世界");
  const out = await rotateAndDownload(page, "non-latin.pdf", () => rotateRight(page).click());
  expect(await rotationsOf(out.bytes)).toEqual([90, 90]);
  expect(await textsOf(out.bytes)).toEqual(before);
});
