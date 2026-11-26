/**
 * Helpers for the F4 page tools (Split, Extract pages, Delete pages): spec
 * docs/specs/f4-f5-page-tools.md §7 and UI P-5 to P-8. Outputs are read with libraries that are
 * independent of the app (upstream pdf-lib, pdf.js, fflate), as in the F1 and F3 suites.
 */
import { expect, type Page } from "@playwright/test";
import { downloadResult, flow, pick, primary, run, unzip } from "../support/flow";

export * from "../support/flow";
export { outlineOf } from "../f3/support";

export type F4Slug = "split-pdf" | "extract-pdf-pages" | "delete-pdf-pages";

export async function openTool(page: Page, slug: F4Slug) {
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
}

/** Opens the tool, picks the fixtures and waits for the ready state. */
export async function openReady(page: Page, slug: F4Slug, ...names: string[]) {
  await openTool(page, slug);
  await pick(page, ...names);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("page-tile")).not.toHaveCount(0);
}

export const field = (page: Page) => page.getByTestId("range-field");
export const fieldError = (page: Page) => page.getByTestId("field-error");
export const status = (page: Page) => page.getByTestId("dock-status");
/** The tile buttons of one file (several files) or of the whole grid. */
export const grid = (page: Page, file?: string) => (file ? page.getByRole("list", { name: `Pages of ${file}` }) : page.getByTestId("page-grid"));
export const tileButton = (page: Page, name: string, file?: string) => grid(page, file).getByRole("button", { name, exact: true });
export const mark = (page: Page, n: number) => page.getByRole("button", { name: `Split after page ${n}`, exact: true });
export const stepper = (page: Page) => page.getByRole("textbox", { name: "Pages per file" });

/** Tile buttons with aria-pressed="true", as 1-based page numbers (in one list). */
export async function pressedPages(page: Page, file?: string) {
  return grid(page, file)
    .locator("[data-tile-button][aria-pressed=true]")
    .evaluateAll((els) => els.map((el) => Number(el.closest("[data-page-index]")!.getAttribute("data-page-index")) + 1));
}

/** 1-based pages whose tile is in no Split part. */
export async function leftOutPages(page: Page) {
  return page.locator("[data-left-out]").evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-page-index")) + 1));
}

/** Split's mode: the pills from 1024 px, the native select below (UI P-5). */
export async function splitMode(page: Page, label: "Every page" | "Every N pages" | "Spreads" | "Custom") {
  const select = page.getByRole("combobox", { name: "Split" });
  // The select's option reads "Every N" (visual review 2026-11-26: the long label was cut at 390).
  if (await select.isVisible()) await select.selectOption({ label: label === "Every N pages" ? "Every N" : label });
  else await page.getByRole("radiogroup", { name: "Split" }).getByRole("radio", { name: label }).click();
}

export async function currentSplitMode(page: Page) {
  const select = page.getByRole("combobox", { name: "Split" });
  if (await select.isVisible()) return select.evaluate((el: HTMLSelectElement) => (el.selectedOptions[0]?.textContent === "Every N" ? "Every N pages" : (el.selectedOptions[0]?.textContent ?? "")));
  return page.getByRole("radiogroup", { name: "Split" }).getByRole("radio", { checked: true }).innerText();
}

/** Types into the range field and leaves it (blur rewrites it in canonical form). */
export async function typeRange(page: Page, text: string, { blur = false } = {}) {
  await field(page).fill(text);
  if (blur) await field(page).blur();
}

export async function openMore(page: Page) {
  await page.getByTestId("more-options").click();
  await expect(page.getByTestId("more-options-dialog")).toBeVisible();
}

export async function closeMore(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("more-options-dialog")).toHaveCount(0);
}

/** Runs and downloads; a ZIP comes back as its entries in order. */
export async function runDownload(page: Page) {
  await expect(primary(page)).toBeEnabled();
  await run(page);
  const out = await downloadResult(page);
  return { ...out, entries: out.name.endsWith(".zip") ? unzipOrdered(out.bytes) : null };
}

/** ZIP entries in directory order (fflate keeps insertion order in the object). */
export function unzipOrdered(bytes: Uint8Array): [string, Uint8Array][] {
  return Object.entries(unzip(bytes));
}
