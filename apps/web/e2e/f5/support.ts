/**
 * Helpers for the F5 page tools e2e suite (Organize, Combine & reorder, Alternate & mix).
 * Spec: docs/specs/f4-f5-page-tools.md §3e–§3g, §7, I-9, I-10, UI P-3 to P-8.
 *
 * The spec's F5 fixtures (odd, even, even-reversed, short, separator, duplex-scan, duplex-scan-odd)
 * are files in tests/fixtures (tests/fixtures/generate-page-tools.mjs). twelve.pdf (with its outline),
 * the 4-page mixed-sizes and rotated-last are generated in memory here.
 */
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { mixedSizesPdf, twelvePdf } from "../../src/lib/pdf/page-tool-fixtures";
import { flow, fx } from "../support/flow";

export * from "../f3/support";

export type Payload = { name: string; mimeType: string; buffer: Buffer };

async function textDoc(labels: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of labels) {
    const page = doc.addPage([595, 842]);
    page.drawText(label, { x: 60, y: 762, size: 28, font });
  }
  return doc.save();
}

const makers: Record<string, () => Promise<Uint8Array>> = {
  "twelve.pdf": twelvePdf,
  "mixed-sizes-4.pdf": mixedSizesPdf,
  "rotated-last.pdf": async () => {
    const doc = await PDFDocument.load(await textDoc(["Rot 1", "Rot 2"]));
    doc.getPage(1).setRotation(degrees(90));
    return doc.save();
  },
};

const cache = new Map<string, Buffer>();

/** A fixture as a file payload: generated (see above) or read from tests/fixtures. */
export async function f5fx(name: string): Promise<Payload> {
  // "mixed-sizes-4.pdf" is the spec's 4-page mixed-sizes.pdf; it keeps that name for the user.
  const shown = name === "mixed-sizes-4.pdf" ? "mixed-sizes.pdf" : name;
  if (!cache.has(name)) cache.set(name, Buffer.from(makers[name] ? await makers[name]() : await readFile(fx(name))));
  const mimeType = name.endsWith(".png") ? "image/png" : "application/pdf";
  return { name: shown, mimeType, buffer: cache.get(name)! };
}

export async function open(page: Page, slug: "organize-pdf" | "combine-reorder-pdf" | "alternate-mix-pdf") {
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
}

/** Picks files in one batch (in this order) through the main file input and waits until they are read. */
export async function pickF5(page: Page, ...names: string[]) {
  await page.getByTestId("file-input").setInputFiles(await Promise.all(names.map(f5fx)));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
}

/** The first line of a page's text (the fixtures put one label per page). */
export const label = (t: string) => t.match(/(Twelve|Page|Short|Front|Back|Rot|Mixed|Alpha|Bravo|Echo) \d+|Separator/)?.[0] ?? (t.trim() || "blank");

/** The live region's latest message. */
export const live = (page: Page) => page.locator("[data-testid=tool-flow] > [aria-live=polite]");

/** Undo / Redo in the bottom bar. */
export const undoButton = (page: Page) => page.getByTestId("history").getByRole("button", { name: "Undo" });
export const redoButton = (page: Page) => page.getByTestId("history").getByRole("button", { name: "Redo" });

/** Opens an Organize toolbar menu: its own button from 768 px, the "Page tools" menu below. */
export async function organizeMenu(page: Page, menu: "Select" | "Sort" | "Remove", item: string | RegExp) {
  const wide = (page.viewportSize()?.width ?? 1280) >= 768;
  await page.getByRole("button", { name: wide ? menu : "Page tools", exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: typeof item === "string" }).click();
}

/**
 * The workspace's tools row (above the pages): every visible control lies inside it, on its one row
 * (spec P-3: one row at every width), and nothing is cut off at its ends.
 */
export async function toolbarOverflow(page: Page) {
  return page.getByTestId("pages-scroll").evaluate((scroll) => {
    const row = scroll.previousElementSibling as HTMLElement;
    const r = row.getBoundingClientRect();
    const out: string[] = [];
    for (const el of row.querySelectorAll<HTMLElement>("button, [role=radio], input")) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden" || el.closest(".sr-only")) continue;
      if (b.top < r.top - 1 || b.bottom > r.bottom + 1 || b.left < r.left - 1 || b.right > r.right + 1) out.push(el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName);
    }
    return out;
  });
}
