/** Helpers for the F3 Merge e2e suite. Spec: docs/specs/f3-merge.md */
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { cloudOn, downloadResult, flow, fx, primary } from "../support/flow";

export * from "../support/flow";

export async function openMerge(page: Page) {
  await page.goto("/merge-pdf");
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
}

/** Picks files in one batch through the main file input and waits for the ready state. */
export async function pickMerge(page: Page, ...names: string[]) {
  await page.getByTestId("file-input").setInputFiles(names.map((n) => (n.includes("/") ? n : fx(n))));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
}

export const cardNames = (page: Page) => page.getByTestId("file-name").allTextContents();
export const cards = (page: Page) => page.getByTestId("file-card");
export const card = (page: Page, name: string) => cards(page).filter({ has: page.getByTestId("file-name").getByText(name, { exact: true }) });
export const tileLabels = (page: Page) => page.getByTestId("tile-label").allTextContents();
export const tile = (page: Page, label: string) => page.locator(`[data-uid]`).filter({ has: page.getByTestId("tile-label").getByText(label, { exact: true }) });
export const tileMain = (page: Page, label: string) => tile(page, label).getByTestId("tile-main");

export async function showPages(page: Page) {
  await page.getByRole("radio", { name: "Pages" }).click();
  await expect(page.getByTestId("page-grid")).toBeVisible();
}
export async function showFiles(page: Page) {
  await page.getByRole("radio", { name: "Files" }).click();
  await expect(page.getByTestId("segment-grid")).toBeVisible();
}

/** True when the viewport is below 640 px, where the toolbar has one "Add" menu (spec M-3). */
export const isPhoneToolbar = (page: Page) => (page.viewportSize()?.width ?? 1280) < 640;

/**
 * Chooses "Pages from a file…" or "Blank page" from the toolbar: the "Add pages" menu at
 * ≥ 640 px, the one "Add" menu below (spec M-3, eval G-2). Same item names in both.
 */
export async function chooseAddPages(page: Page, item: "Pages from a file…" | "Blank page") {
  if (!cloudOn || item === "Blank page") return chooseMenu(page, isPhoneToolbar(page) ? "Add" : "Add pages", item);
  // F23 (spec U-2 E3/E4): "From a file" lists This device and the clouds; on phones it is a step in the Add sheet.
  if (isPhoneToolbar(page)) {
    await chooseMenu(page, "Add", "Pages from a file");
    await page.getByRole("menuitem", { name: "This device", exact: true }).click();
  } else await chooseMenu(page, "Add pages", "This device");
}

/** The Add pages menu's "pages from this device" item: its F3 name, or "This device" with F23 on. */
export const fromFileItem = cloudOn ? "This device" : "Pages from a file…";

/** Opens a menu by its trigger name and chooses an item. */
export async function chooseMenu(page: Page, trigger: string | RegExp, item: string) {
  await (typeof trigger === "string" ? page.getByRole("button", { name: trigger, exact: true }) : page.getByRole("button", { name: trigger })).first().click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

/** Opens a tile's More menu and chooses an item. */
export async function tileAction(page: Page, label: string, item: string) {
  await tile(page, label).hover();
  await tile(page, label).getByTestId("tile-more").click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** Drags one box onto the left or right half of another (pointer events, mouse). */
export async function dragTo(page: Page, from: string, to: string, side: "before" | "after") {
  const a = (await page.locator(from).first().boundingBox())!;
  const b = (await page.locator(to).first().boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 3);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 3 + 10, { steps: 3 });
  const tx = side === "before" ? b.x + b.width * 0.25 : b.x + b.width * 0.75;
  await page.mouse.move(tx, b.y + b.height / 2, { steps: 8 });
  await expect(page.getByTestId("slot-bar")).toBeVisible();
  await page.mouse.up();
}

export const firstWord = (t: string) => t.match(/(Alpha|Bravo|Echo|Page|File|Form) \d+|Form [AB]/)?.[0] ?? (t.trim() ? t.trim() : "blank");

export async function outputDoc(bytes: Uint8Array) {
  return PDFDocument.load(bytes, { updateMetadata: false });
}

/** An 8000x8000 PNG header (64 MP). Only the header is real: the app must reject it before decoding. */
export async function hugePngPayload() {
  const png = await readFile(fx("charlie.png"));
  const out = Buffer.from(png);
  out.writeUInt32BE(8000, 16);
  out.writeUInt32BE(8000, 20);
  return { name: "huge.png", mimeType: "image/png", buffer: out };
}

/** Opens the Merge options: inline in the dock at >= 1024 px, the bottom sheet below. Returns the panel. */
export async function mergeOptions(page: Page) {
  if (await page.getByTestId("options-button").isVisible()) {
    await page.getByTestId("options-button").click();
    await expect(page.getByTestId("options-sheet")).toBeVisible();
    return page.getByTestId("options-sheet");
  }
  return page.getByTestId("merge-options");
}
/** Closes the options sheet if it is open (no-op for the inline panel). */
export async function closeMergeOptions(page: Page) {
  const sheet = page.getByTestId("options-sheet");
  if (await sheet.isVisible()) {
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    await expect(sheet).toBeHidden();
  }
}
export type ContentsChoice = "None" | "File names" | "Document titles";
/** Sets options through the UI (switches by label, Contents radio, Bookmarks and Form fields selects). */
export async function setMergeOptions(
  page: Page,
  o: { toc?: ContentsChoice; switches?: string[]; bookmarks?: "keep" | "remove" | "perFile" | "perFileNested"; forms?: "rename" | "merge" | "flatten" | "remove" },
) {
  const panel = await mergeOptions(page);
  if (o.toc) {
    const short = { None: "None", "File names": "Names", "Document titles": "Titles" }[o.toc];
    await panel.getByRole("radio", { name: new RegExp(`^(${o.toc}|${short})$`) }).click();
  }
  for (const name of o.switches ?? []) await panel.getByRole("switch", { name }).check();
  if (o.bookmarks) await panel.getByLabel("Bookmarks").selectOption(o.bookmarks);
  if (o.forms) await panel.getByLabel("Form fields").selectOption(o.forms);
  await closeMergeOptions(page);
}

/** Runs the merge from the UI and returns the downloaded file. */
export async function runAndDownload(page: Page) {
  await primary(page).click();
  await expect(flow(page)).toHaveAttribute("data-state", "done", { timeout: 60_000 });
  return downloadResult(page);
}

// ---- reading the downloaded file with pdf.js (independent of the app) ----

export async function pdfjsOpen(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
}
type PdfjsDoc = Awaited<ReturnType<typeof pdfjsOpen>>;
async function withDoc<T>(bytes: Uint8Array, fn: (doc: PdfjsDoc) => Promise<T>): Promise<T> {
  const doc = await pdfjsOpen(bytes);
  try {
    return await fn(doc);
  } finally {
    await doc.loadingTask.destroy();
  }
}

export type Mark = { title: string; page: number; children: Mark[] };
/** The outline as a tree of { title, 1-based page, children }. */
export function outlineOf(bytes: Uint8Array): Promise<Mark[]> {
  return withDoc(bytes, async (doc) => {
    const resolve = async (dest: unknown) => {
      const d = (typeof dest === "string" ? await doc.getDestination(dest) : dest) as unknown[];
      return 1 + (await doc.getPageIndex(d[0] as never));
    };
    type Item = NonNullable<Awaited<ReturnType<PdfjsDoc["getOutline"]>>>[number];
    const map = async (list: Item[]): Promise<Mark[]> => Promise.all(list.map(async (it) => ({ title: it.title, page: await resolve(it.dest), children: await map(it.items) })));
    return map((await doc.getOutline()) ?? []);
  });
}

/** 1-based target pages of the internal link annotations on a page, in annotation order. */
export function linkTargets(bytes: Uint8Array, pageNumber: number): Promise<number[]> {
  return withDoc(bytes, async (doc) => {
    const annots = await (await doc.getPage(pageNumber)).getAnnotations();
    const out: number[] = [];
    for (const a of annots.filter((x) => x.subtype === "Link")) {
      const d = (typeof a.dest === "string" ? await doc.getDestination(a.dest) : a.dest) as unknown[];
      out.push(1 + (await doc.getPageIndex(d[0] as never)));
    }
    return out;
  });
}

/** Form widgets per field name ({ value, 0-based page }) and the widget count per page. */
export function widgetsOf(bytes: Uint8Array) {
  return withDoc(bytes, async (doc) => {
    const byName: Record<string, { value: unknown; page: number }[]> = {};
    const perPage: number[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const ws = (await (await doc.getPage(i)).getAnnotations()).filter((a) => a.subtype === "Widget");
      perPage.push(ws.length);
      for (const w of ws) (byName[w.fieldName] ??= []).push({ value: w.fieldValue, page: i - 1 });
    }
    return { byName, perPage };
  });
}

/** Where a text run sits on the rendered (rotated) page: angle in degrees as read, and x/y as fractions of the viewport. */
export function textPlacement(bytes: Uint8Array, pageNumber: number, needle: string) {
  return withDoc(bytes, async (doc) => {
    const page = await doc.getPage(pageNumber);
    const vp = page.getViewport({ scale: 1 });
    const item = (await page.getTextContent()).items.find((it) => "str" in it && it.str.includes(needle)) as { transform: number[]; width: number } | undefined;
    if (!item) return null;
    const [a, b, , , e, f] = item.transform;
    const [x, y] = vp.convertToViewportPoint(e, f);
    const angle = (Math.round((Math.atan2(b, a) * 180) / Math.PI - page.rotate) + 720) % 360;
    return { angle, x: x / vp.width, y: y / vp.height, rotate: page.rotate };
  });
}

/** Counts non-overlapping occurrences of `needle` in `hay`. */
export const occurrences = (hay: string, needle: string) => hay.split(needle).length - 1;

/** Sets in-memory files on the main input (any name, including non-ASCII). */
export async function pickBuffers(page: Page, files: { name: string; buffer: Buffer; mimeType?: string }[]) {
  await page.getByTestId("file-input").setInputFiles(files.map((f) => ({ mimeType: "application/pdf", ...f })));
}
