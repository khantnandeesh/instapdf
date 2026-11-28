/** F10 document tools: spec docs/specs/f10-doc-tools.md, AC-1230 onwards. */
import { expect, test, type Page } from "@playwright/test";
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { expectNoSeriousAxeViolations } from "../support/axe";
import { downloadResult, flow, pick, primary, run, tiles, unzip } from "../support/flow";

async function open(page: Page, slug: string, ...names: string[]) {
  await page.goto(`/${slug}`);
  await expect(page.locator("[data-testid=tool-flow][data-hydrated]")).toBeVisible();
  await pick(page, ...names);
  await expect(flow(page)).toHaveAttribute("data-state", "ready");
}
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
async function inOptions(page: Page, change: (where: "side" | "more") => Promise<void>) {
  if (wide(page)) return change("side");
  await page.getByRole("button", { name: /More options/ }).click();
  await change("more");
  await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
}
/** A group's switch, in the side panel or in the sheet (which gives its switches ids of its own). */
const group = (page: Page, where: "side" | "more", name: string) => (where === "side" ? page.locator('[data-ip-options="side"]') : page.getByRole("dialog")).getByRole("switch", { name });
async function subtypes(bytes: Uint8Array, page: number) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const a = doc.getPage(page).node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  return a ? Array.from({ length: a.size() }, (_, i) => String(a.lookup(i, PDFDict).lookup(PDFName.of("Subtype")))) : [];
}

test.describe("Remove annotations", () => {
  test("AC-1230: highlights, notes and drawings go; links and form fields stay", async ({ page }) => {
    await open(page, "remove-pdf-annotations", "annotated.pdf");
    await expect(primary(page)).toHaveText("Clean 2 pages");
    await expectNoSeriousAxeViolations(page, "Remove annotations, loaded");
    await run(page);
    const out = await downloadResult(page);
    expect(await subtypes(out.bytes, 0)).toEqual(["/Widget", "/Link"]);
    expect(await subtypes(out.bytes, 1)).toEqual([]);
  });

  test("AC-1231: only the switched-on groups, only on the picked pages", async ({ page }) => {
    await open(page, "remove-pdf-annotations", "annotated.pdf");
    await inOptions(page, async (where) => {
      await group(page, where, "Notes and text boxes").uncheck();
      await group(page, where, "Links").check();
    });
    await tiles(page).first().getByRole("button", { name: /^Page 1/ }).click();
    await expect(primary(page)).toHaveText("Clean 1 page");
    await run(page);
    const out = await downloadResult(page);
    expect(await subtypes(out.bytes, 0)).toEqual(["/Widget", "/Text", "/Popup", "/Text"]);
    expect(await subtypes(out.bytes, 1)).toEqual(["/Ink"]);
  });

  test("AC-1232: everything switched off keeps the button waiting; a file with nothing to remove says so", async ({ page }) => {
    await open(page, "remove-pdf-annotations", "three-pages.pdf");
    await inOptions(page, async (where) => {
      for (const name of ["Highlights and underlines", "Drawings and shapes", "Notes and text boxes", "Stamps and attachments"]) await group(page, where, name).uncheck();
    });
    await expect(primary(page)).toBeDisabled();
    await expect(page.getByTestId("dock-status")).toHaveText("Switch on something to remove");
    await inOptions(page, async (where) => group(page, where, "Highlights and underlines").check());
    await primary(page).click();
    await expect(page.getByText(/No annotations of the chosen kinds were found/)).toBeVisible();
  });
});

test.describe("Flatten", () => {
  test("AC-1240: fields and annotations become part of the page; links stay", async ({ page }) => {
    await open(page, "flatten-pdf", "annotated.pdf");
    await expectNoSeriousAxeViolations(page, "Flatten, loaded");
    await run(page);
    const out = await downloadResult(page);
    const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
    expect(doc.catalog.has(PDFName.of("AcroForm"))).toBe(false);
    // The notes and the drawing have no drawn form in this file: they stay, and the result says so.
    expect(await subtypes(out.bytes, 0)).toEqual(["/Text", "/Text", "/Link"]);
    await expect(page.getByText(/annotations have no drawn form/)).toBeVisible();
  });

  test("AC-1241: form fields only leaves annotations alone; several files come back as a ZIP", async ({ page }) => {
    await open(page, "flatten-pdf", "annotated.pdf", "form.pdf");
    const what = page.locator(wide(page) ? "#flatten-what-side" : "#flatten-what-bar");
    await what.selectOption("fields");
    await run(page);
    const out = await downloadResult(page);
    const files = await unzip(out.bytes);
    expect(Object.keys(files).sort()).toEqual(["annotated.pdf", "form.pdf"]);
    expect(await subtypes(files["annotated.pdf"], 0)).toEqual(["/Highlight", "/Text", "/Popup", "/Text", "/Link"]);
  });
});

test.describe("Metadata", () => {
  const field = (page: Page, name: string, where: string) => page.locator(`#meta-${name}-${where}`);

  test("AC-1250, AC-1251: the form is filled from the file; edits and a new field are saved", async ({ page }) => {
    await open(page, "edit-pdf-metadata", "annotated.pdf");
    await expectNoSeriousAxeViolations(page, "Metadata, loaded");
    await inOptions(page, async (where) => {
      await expect(field(page, "Title", where)).toHaveValue("Quarterly report");
      await expect(field(page, "Author", where)).toHaveValue("Asha Rao");
      await expect(page.locator(`#meta-own-name-0-${where}`)).toHaveValue("Department");
      await field(page, "Title", where).fill("Annual report");
      await field(page, "Keywords", where).fill("finance, 2026");
      await field(page, "Author", where).fill("");
      await page.getByTestId(`meta-add-${where}`).click();
      await page.locator(`#meta-own-name-1-${where}`).fill("Project");
      await page.locator(`#meta-own-value-1-${where}`).fill("Berry");
    });
    await run(page);
    const doc = await PDFDocument.load((await downloadResult(page)).bytes, { updateMetadata: false });
    expect(doc.getTitle()).toBe("Annual report");
    expect(doc.getKeywords()).toBe("finance, 2026");
    expect(doc.getAuthor()).toBeUndefined();
    const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict);
    expect(String(info.lookup(PDFName.of("Project")) && doc.getTitle())).toBe("Annual report");
    expect(info.has(PDFName.of("Department"))).toBe(true);
    expect(doc.catalog.has(PDFName.of("Metadata"))).toBe(false);
  });

  test("AC-1252: a bad field name keeps the button waiting and says why", async ({ page }) => {
    await open(page, "edit-pdf-metadata", "three-pages.pdf");
    await inOptions(page, async (where) => {
      await page.getByTestId(`meta-add-${where}`).click();
      await page.locator(`#meta-own-name-0-${where}`).fill("Title");
      await page.locator(`#meta-own-value-0-${where}`).fill("x");
    });
    await expect(primary(page)).toBeDisabled();
    await expect(page.getByTestId("dock-status")).toHaveText("There is already a field with this name");
  });

  test("AC-1253: remove all leaves no details in the file", async ({ page }) => {
    await open(page, "edit-pdf-metadata", "annotated.pdf");
    await page.getByRole("radio", { name: "Remove all" }).locator("visible=true").first().click();
    await run(page);
    const out = await downloadResult(page);
    const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
    expect(doc.context.trailerInfo.Info).toBeUndefined();
    expect(new TextDecoder("latin1").decode(out.bytes)).not.toContain("xmpmeta");
  });
});
