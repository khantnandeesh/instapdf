import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { downloadResult, flow, fx, isDesktop, primary, run, textsOf, unzip } from "../support/flow";

/** Where each piece of text sits on the page as shown: fractions of the page, 0,0 at the top left. */
async function placesOf(bytes: Uint8Array, pageNumber: number) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  const page = await doc.getPage(pageNumber);
  const view = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const out = content.items.flatMap((it) => {
    if (!("str" in it) || !it.str.trim()) return [];
    const [x, y] = view.convertToViewportPoint(it.transform[4], it.transform[5]);
    return [{ str: it.str.trim(), x: x / view.width, y: y / view.height }];
  });
  await task.destroy();
  return out;
}

const load = async (page: Page) => {
  await page.goto("/ocr-pdf");
  await page.getByTestId("file-input").setInputFiles(fx("scan.pdf"));
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
};
const side = (page: Page, label: string) => page.locator(".ip-opt-side").getByLabel(label, { exact: true });

test.describe("OCR", () => {
  test.describe.configure({ timeout: 120_000 });

  test("AC-1530, AC-1533: scanned pages get their text where the words are, an upright and a turned page alike; a typed page is left alone; nothing leaves the device", async ({ page, baseURL }, info) => {
    test.skip(!isDesktop(info.project.name), "the recogniser is the same on phones; AC-1534 covers the phone layout");
    const sent: string[] = [];
    page.on("request", (r) => {
      if (/^(blob|data):/.test(r.url())) return;
      if (r.method() !== "GET" || new URL(r.url()).origin !== new URL(baseURL!).origin) sent.push(`${r.method()} ${r.url()}`);
    });
    await load(page);
    await expectNoSeriousAxeViolations(page, "OCR, loaded");
    const before = await PDFDocument.load(await (await import("node:fs/promises")).readFile(fx("scan.pdf")));
    await run(page);
    await expect(page.getByText("Text was recognised on 2 of 3 pages. The others already had their text.")).toBeVisible();
    const out = await downloadResult(page);
    expect(out.name).toBe("scan.pdf");
    const texts = await textsOf(out.bytes);
    expect(texts[0]).toContain("Harbour Lane Bakery");
    expect(texts[0]).toContain("48213");
    expect(texts[1]).toContain("This page was typed, not scanned.");
    expect(texts[2]).toContain("Delivery note");
    // The words lie on the picture's words: the first line near the top left, each later line lower.
    const first = await placesOf(out.bytes, 1);
    const at = (list: typeof first, word: string) => list.find((p) => p.str.includes(word))!;
    expect(at(first, "Harbour").x).toBeGreaterThan(0.06);
    expect(at(first, "Harbour").x).toBeLessThan(0.14);
    expect(at(first, "Harbour").y).toBeGreaterThan(0.06);
    expect(at(first, "Harbour").y).toBeLessThan(0.13);
    expect(at(first, "Total").y).toBeGreaterThan(at(first, "Invoice").y);
    expect(at(first, "Total").y).toBeLessThan(0.3);
    // The page lying on its side: the text is laid on the page as it is shown.
    const third = await placesOf(out.bytes, 3);
    expect(at(third, "Delivery").x).toBeLessThan(0.14);
    expect(at(third, "Delivery").y).toBeLessThan(0.13);
    expect(at(third, "Signed").y).toBeGreaterThan(at(third, "Leave").y);
    // The typed page got no layer, the pictures were not touched, and the file grew by the text alone.
    const made = await PDFDocument.load(out.bytes);
    const layered = made.getPages().map((p) => (p.node.Resources()?.lookup(PDFName.of("XObject"))?.toString() ?? "").includes("OcrText"));
    expect(layered).toEqual([true, false, true]);
    expect(made.getPageCount()).toBe(before.getPageCount());
    expect(out.bytes.length).toBeLessThan((await (await import("node:fs/promises")).stat(fx("scan.pdf"))).size + 12_000);
    expect(sent, "only GET requests to this site").toEqual([]);
  });

  test("AC-1531: the text can be had as a text file, or both in a ZIP", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "the recogniser is the same on phones");
    await load(page);
    await side(page, "What to make").selectOption({ label: "Text file" });
    await run(page);
    const txt = await downloadResult(page);
    expect(txt.name).toBe("scan.txt");
    const text = new TextDecoder().decode(txt.bytes);
    expect(text).toContain("Invoice number 48213");
    expect(text).toContain("This page was typed, not scanned.");
    expect(text).toContain("Signed for by the morning shift");
    await page.getByRole("button", { name: "Back to editing" }).click();
    await side(page, "What to make").selectOption({ label: "Searchable PDF and text file" });
    await run(page);
    const both = await downloadResult(page);
    expect(both.name).toBe("scan.zip");
    const zip = unzip(both.bytes);
    expect(Object.keys(zip).sort()).toEqual(["scan.pdf", "scan.txt"]);
    expect((await textsOf(zip["scan.pdf"]))[0]).toContain("Harbour Lane Bakery");
  });

  test("AC-1532: a second language is fetched with the first, and the choices are remembered", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "the recogniser is the same on phones");
    const data: string[] = [];
    page.on("request", (r) => {
      const m = /\/ocr\/data-[^/]+\/(\w+)\.traineddata\.gz$/.exec(r.url());
      if (m) data.push(m[1]);
    });
    await load(page);
    await expect(side(page, "Language of the document")).toHaveValue("eng");
    expect(await side(page, "Language of the document").locator("option").count()).toBe(72);
    await side(page, "Second language").selectOption({ label: "French" });
    await run(page);
    expect(new Set(data)).toEqual(new Set(["eng", "fra"]));
    await page.reload();
    await page.getByTestId("file-input").setInputFiles(fx("scan.pdf"));
    await expect(side(page, "Second language")).toHaveValue("fra");
  });

  test("AC-1537: a file read before is left alone, or read afresh with its old text replaced, never doubled", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "the recogniser is the same on phones");
    await load(page);
    await run(page);
    const first = await downloadResult(page);
    const again = async (replace: boolean) => {
      await page.goto("/ocr-pdf");
      await page.getByTestId("file-input").setInputFiles({ name: "read.pdf", mimeType: "application/pdf", buffer: Buffer.from(first.bytes) });
      await expect(flow(page)).toHaveAttribute("data-state", "ready");
      const sw = page.locator(".ip-opt-side").getByRole("switch", { name: "Replace text from an earlier OCR" });
      if ((await sw.getAttribute("aria-checked")) !== String(replace)) await sw.click();
      await run(page);
      return downloadResult(page);
    };
    const count = (text: string, word: string) => text.split(word).length - 1;
    const layers = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => (p.node.Resources()?.lookup(PDFName.of("XObject"))?.toString() ?? "").split("OcrText").length - 1);
    // Left alone: every page has text now, so nothing is read and the file comes back as it was.
    const kept = await again(false);
    expect(await layers(kept.bytes)).toEqual([1, 0, 1]);
    expect(count((await textsOf(kept.bytes))[0], "Harbour Lane Bakery")).toBe(1);
    // Replaced: the old layer goes, a new one comes, the typed page keeps its own text.
    const fresh = await again(true);
    expect(await layers(fresh.bytes)).toEqual([1, 0, 1]);
    const texts = await textsOf(fresh.bytes);
    expect(count(texts[0], "Harbour Lane Bakery")).toBe(1);
    expect(texts[1]).toContain("This page was typed, not scanned.");
    expect(count(texts[2], "Delivery note")).toBe(1);
    expect(fresh.bytes.length).toBeLessThan(first.bytes.length + 2_000);
  });

  test("AC-1534: Cancel stops the reading at once and the tool is ready again; the phone layout fits", async ({ page }) => {
    await load(page);
    await expectNoSeriousAxeViolations(page, "OCR, loaded");
    // The language data is held back, so the run is still starting when Cancel is pressed.
    let release = () => {};
    await page.route(/\/ocr\/data-[^/]+\/eng\.traineddata\.gz$/, async (route) => {
      await new Promise<void>((r) => (release = r));
      await route.continue().catch(() => {});
    });
    await primary(page).click();
    const pill = page.getByTestId("processing");
    await expect(pill).toBeVisible();
    await pill.getByRole("button", { name: "Cancel" }).click();
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    release();
    await page.unroute(/\/ocr\/data-[^/]+\/eng\.traineddata\.gz$/);
    await run(page);
    await expect(page.getByTestId("result")).toContainText("scan.pdf");
  });

  test("AC-1535: a language file that cannot be fetched is said, and the tool is ready to try again", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "the recogniser is the same on phones");
    await load(page);
    await page.route(/\/ocr\/data-[^/]+\/eng\.traineddata\.gz$/, (route) => route.fulfill({ status: 404, body: "" }));
    await primary(page).click();
    await expect(page.getByText("The text recogniser could not start. Check your connection and try again.")).toBeVisible();
    await expect(flow(page)).toHaveAttribute("data-state", "error");
    await page.unroute(/\/ocr\/data-[^/]+\/eng\.traineddata\.gz$/);
    await page.getByTestId("action-slot").getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("result")).toContainText("scan.pdf", { timeout: 60_000 });
  });

  test("AC-1536: Cancel while a page is being read stops the run, and the next run finishes", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "the recogniser is the same on phones");
    await load(page);
    // The recogniser's own code arriving means it has started; the first page is on its way in.
    const started = page.waitForResponse(/\/ocr\/engine-[^/]+\/core\/.+\.wasm\.js$/);
    await primary(page).click();
    await started;
    await page.waitForTimeout(600);
    const pill = page.getByTestId("processing");
    await pill.getByRole("button", { name: "Cancel" }).click();
    await expect(flow(page)).toHaveAttribute("data-state", "ready");
    await run(page);
    await expect(page.getByTestId("result")).toContainText("scan.pdf");
  });
});
