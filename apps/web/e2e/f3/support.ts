/** Helpers for the F3 Merge e2e suite. Spec: docs/specs/f3-merge.md */
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { flow, fx } from "../support/flow";

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
