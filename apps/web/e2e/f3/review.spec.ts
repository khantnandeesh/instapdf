/** F3 Merge: PR #7 review fixes, through the UI on the downloaded file. Spec: docs/specs/f3-merge.md */
import { expect, test } from "@playwright/test";
import { cardNames, flow, fx, loadPlain, occurrences, openMerge, pickMerge, runAndDownload, setMergeOptions, showPages, textsOf, tile } from "./support";

const pdfjsItems = async (bytes: Uint8Array) => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const out: { str: string; scale: number }[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(c.items.flatMap((it) => ("str" in it && it.str.trim() ? [{ str: it.str, scale: Math.abs(it.transform[0]) }] : [])));
  }
  await doc.loadingTask.destroy();
  return out;
};

async function duplicateFirstTile(page: import("@playwright/test").Page, label: string) {
  await showPages(page);
  await tile(page, label).hover();
  await tile(page, label).getByTestId("tile-more").click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
}

test.beforeEach(async ({ page }) => {
  await openMerge(page);
});

test("review 1: a duplicated page carries the file-name footer once", async ({ page }) => {
  await pickMerge(page, "alpha.pdf");
  await duplicateFirstTile(page, "A1");
  await setMergeOptions(page, { switches: ["Add file name to the footer"] });
  const out = await runAndDownload(page);
  const texts = await textsOf(out.bytes);
  expect(texts).toHaveLength(4);
  for (const t of texts.slice(0, 2)) {
    expect(occurrences(t, "alpha.pdf")).toBe(1);
    expect(t).toContain("Alpha 1");
  }
});

test("review 1: a duplicated page is scaled once with same width", async ({ page }) => {
  await pickMerge(page, "bravo.pdf");
  await pickMerge(page, "alpha.pdf");
  await duplicateFirstTile(page, "B1"); // bravo first, so alpha pages scale up to 792 wide
  await duplicateFirstTile(page, "A1");
  await setMergeOptions(page, { switches: ["Make all pages the same width"] });
  const out = await runAndDownload(page);
  const doc = await loadPlain(out.bytes);
  for (const p of doc.getPages()) expect(Math.abs(p.getWidth() - 792)).toBeLessThanOrEqual(0.5);
  const items = await pdfjsItems(out.bytes);
  const alphaOnes = items.flatMap((pg) => pg.filter((i) => i.str === "Alpha 1"));
  expect(alphaOnes).toHaveLength(2);
  for (const a of alphaOnes) expect(a.scale).toBeCloseTo(36 * (792 / 595), 0);
});

test("review 2: a TIFF whose IFD points at itself is refused; the other files stay and the tab stays responsive", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles([fx("cyclic-ifd.tiff"), fx("alpha.pdf")]);
  await expect(flow(page)).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await expect(page.getByRole("alert").filter({ hasText: "cyclic-ifd.tiff" })).toBeVisible();
  expect(await cardNames(page)).toEqual(["alpha.pdf"]);
  expect(await page.evaluate(() => 1 + 1)).toBe(2);
});

test("review 2/3: a multi-frame TIFF still shows thumbnails (decoded in the TIFF worker)", async ({ page }) => {
  await pickMerge(page, "fox.tiff");
  await showPages(page);
  await expect(page.locator("[data-uid] canvas")).toHaveCount(2, { timeout: 10_000 });
});

test("addendum C: properties the merge cannot keep are named in a notice before running", async ({ page }) => {
  await pickMerge(page, "tagged-features.pdf", "alpha.pdf");
  const notice = page.getByTestId("notice").filter({ hasText: "tagged-features.pdf has" });
  await expect(notice).toBeVisible();
  for (const word of ["accessibility tags", "PDF/A conformance", "layers", "attached files", "digital signatures"]) await expect(notice).toContainText(word);
  await expect(page.getByTestId("notice").filter({ hasText: "alpha.pdf has" })).toHaveCount(0);
  // It stays when more files are added, and the merge still runs.
  await pickMerge(page, "bravo.pdf");
  await expect(notice).toBeVisible();
  const out = await runAndDownload(page);
  expect((await loadPlain(out.bytes)).getPageCount()).toBe(6);
});

test("addendum A: a field that cannot be flattened is kept, with a notice naming the file", async ({ page }) => {
  await pickMerge(page, "sig-no-ap.pdf");
  await setMergeOptions(page, { forms: "flatten" });
  const out = await runAndDownload(page);
  await expect(page.getByTestId("notice").filter({ hasText: "sig-no-ap.pdf couldn't be flattened" }).or(page.getByTestId("notice").filter({ hasText: /form fields in sig-no-ap\.pdf/ }))).toBeVisible();
  expect((await loadPlain(out.bytes)).getForm().getFields().map((f) => f.getName())).toEqual(["approval"]);
  expect((await textsOf(out.bytes))[0]).toContain("Ann");
});
