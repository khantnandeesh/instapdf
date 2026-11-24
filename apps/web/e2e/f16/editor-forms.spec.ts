/** F16 E3 (/edit-pdf): fill, create and detect form fields, tab order, and the Form tool's place. */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

/** A two-page form made here: text (required), email (required), dropdown, checkbox, radio, notes. */
async function fillable(opts: { checked?: boolean } = {}): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const [p1, p2] = [doc.addPage([612, 792]), doc.addPage([612, 792])];
  p1.drawText("Application form", { x: 50, y: 740, size: 20, font });
  const name = form.createTextField("full_name");
  name.addToPage(p1, { x: 150, y: 682, width: 300, height: 22 });
  name.enableRequired();
  const email = form.createTextField("email");
  email.addToPage(p1, { x: 150, y: 642, width: 300, height: 22 });
  email.enableRequired();
  const country = form.createDropdown("country");
  country.addOptions(["India", "Germany", "Japan"]);
  country.addToPage(p1, { x: 150, y: 602, width: 160, height: 22 });
  const agree = form.createCheckBox("agree");
  agree.addToPage(p1, { x: 150, y: 566, width: 16, height: 16 });
  if (opts.checked) agree.check();
  const contact = form.createRadioGroup("contact");
  contact.addOptionToPage("Email", p2, { x: 150, y: 686, width: 16, height: 16 });
  contact.addOptionToPage("Phone", p2, { x: 230, y: 686, width: 16, height: 16 });
  const notes = form.createTextField("notes");
  notes.enableMultiline();
  notes.addToPage(p2, { x: 150, y: 560, width: 60, height: 90 }); // narrow: its own column, apart from Phone
  return { name: "fillable.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
}

/** Records every request that leaves this origin or sends a body (AC-240). */
function watchUploads(page: Page) {
  const sent: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "blob:" || u.protocol === "data:") return;
    if (u.host !== new URL(process.env.BASE_URL ?? "http://localhost:3000").host || (r.method() !== "GET" && r.method() !== "HEAD")) sent.push(`${r.method()} ${r.url()}`);
  });
  return sent;
}

async function open(page: Page, file: string | Awaited<ReturnType<typeof fillable>>) {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(typeof file === "string" ? corpus(file) : file);
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  return new Uint8Array(await readFile((await dl.path())!));
}

async function formTool(page: Page) {
  const wide = page.viewportSize()!.width >= 1024;
  if (wide) {
    await page.getByTestId("canvas").focus();
    await page.keyboard.press("f");
  } else {
    await page.getByTestId("dock-more").click();
    await page.getByRole("button", { name: /^Form/ }).click();
  }
  await expect(page.getByTestId("form-tool-options")).toBeVisible();
}

/** A point on page n at fractions of its box, scrolled into the canvas first. */
async function at(page: Page, n: number, fx: number, fy: number) {
  const el = page.getByTestId(`page-${n}`);
  let b = (await el.boundingBox())!;
  const vh = page.viewportSize()!.height;
  const y = b.y + b.height * fy;
  if (y < 120 || y > vh - 200) {
    await page.getByTestId("canvas").evaluate((c, d) => c.scrollBy(0, d), y - vh / 2);
    await page.waitForTimeout(150);
    b = (await el.boundingBox())!;
  }
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

test("AC-248 AC-231 AC-233: fields fill with any tool, Tab follows the order, the download carries the values", async ({ page }) => {
  await open(page, await fillable());
  const name = page.locator('.bf-field[data-kind="text"] input').first();
  await expect(name).toBeVisible();
  if (page.viewportSize()!.width >= 1024) await expect(page.locator(".bf-fieldschip")).toHaveAccessibleName(/6 fields/);
  await name.fill("Ada Lovelace");
  await name.press("Tab");
  await expect(page.locator('.bf-field[data-kind="text"] input').nth(1)).toBeFocused();
  await page.keyboard.type("ada@example.com");
  await page.locator('.bf-field[data-kind="dropdown"] select').selectOption("Japan");
  await page.locator('.bf-field[data-kind="checkbox"] .bf-hit').click();
  await expect(page.getByRole("checkbox", { name: "agree" })).toBeChecked();
  await page.getByRole("radio", { name: "contact: Phone" }).check({ force: true });
  // One undo step per field burst: undo takes the radio back, not the typed text.
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("radio", { name: "contact: Phone" })).not.toBeChecked();
  await expect(name).toHaveValue("Ada Lovelace");
  await page.getByRole("radio", { name: "contact: Phone" }).check({ force: true });

  const out = await PDFDocument.load(await download(page));
  const form = out.getForm();
  expect(form.getTextField("full_name").getText()).toBe("Ada Lovelace");
  expect(form.getTextField("email").getText()).toBe("ada@example.com");
  expect(form.getDropdown("country").getSelected()).toEqual(["Japan"]);
  expect(form.getCheckBox("agree").isChecked()).toBe(true);
  expect(form.getRadioGroup("contact").getSelected()).toBe("Phone");
});

test("AC-248: Tab follows a custom tab order and crosses pages without stopping on page controls", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, "the order is set in the side panel; phones share the same key handling");
  await open(page, await fillable());
  await formTool(page);
  await page.getByRole("button", { name: "Tab order", exact: true }).first().click();
  // Move email above full_name with the keyboard: pick up, up, drop.
  const chip = page.locator(".bf-taborder li.bf-chip").filter({ hasText: "email" }).first();
  await chip.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("v");
  const text = (n: string) => page.getByRole("textbox", { name: n });
  await text("email").focus();
  await page.keyboard.press("Tab");
  await expect(text("full_name")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator('.bf-field[data-kind="dropdown"] select')).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("checkbox", { name: "agree" })).toBeFocused();
  // Page 1's last field to page 2's first: the radio group, one stop, then notes.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "contact: Email" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(text("notes")).toBeFocused();
  // The field Tab lands on is clear of the floating top bar and view pill (G-21).
  await expect(async () => {
    const box = (await text("notes").boundingBox())!;
    const top = (await page.locator('[data-region="top"]').first().boundingBox())!;
    const pill = await page.locator('[data-region="view"]').first().boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(top.y + top.height);
    if (pill) expect(box.y + box.height).toBeLessThanOrEqual(pill.y);
  }).toPass();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("checkbox", { name: "agree" })).toBeFocused();
});

test("G-25: on a phone, the fill bar never covers the field being typed into", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 1024, "the fill bar is for phones");
  // Small one-line fields near the top of the file and further down it.
  const doc = await PDFDocument.create();
  const form = doc.getForm();
  const pages = [doc.addPage([612, 792]), doc.addPage([612, 792]), doc.addPage([612, 792])];
  const add = (name: string, page: number, y: number) => form.createTextField(name).addToPage(pages[page], { x: 150, y, width: 300, height: 22 });
  add("full_name", 0, 682);
  add("email", 0, 642);
  add("city", 2, 400);
  await open(page, { name: "g25.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) });
  const peek = page.locator(".bf-peek");
  const text = (n: string) => page.getByRole("textbox", { name: n });
  const clear = async (n: string) =>
    expect(async () => {
      const bar = (await peek.boundingBox())!;
      const box = (await text(n).boundingBox())!;
      expect(box.y >= bar.y + bar.height || box.y + box.height <= bar.y, `the bar is clear of ${n}`).toBe(true);
    }).toPass();
  // Near the top of the file: nothing to scroll, so the bar moves out of the way.
  await text("full_name").focus();
  await expect(peek).toBeVisible();
  await clear("full_name");
  // The next field starts from the bar's own place again.
  await text("email").focus();
  await clear("email");
  // Further down, under where the bar sits: the field is scrolled below the bar, which stays on top.
  await text("email").blur();
  await text("city").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await text("city").focus();
  await clear("city");
  expect((await peek.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height / 2);
});

test("G-21: Tab at high zoom brings a field off to the side into view", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, "desktop zoom");
  await open(page, await fillable());
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Zoom in" }).first().click();
  const text = (n: string) => page.getByRole("textbox", { name: n });
  const canvas = page.locator(".ed-canvas").first();
  // Scroll the canvas fully right, so the fields' left side is out of view.
  await canvas.evaluate((c) => (c.scrollLeft = c.scrollWidth));
  await text("email").evaluate((el) => el.focus({ preventScroll: true }));
  await page.keyboard.press("Shift+Tab");
  await expect(text("full_name")).toBeFocused();
  await expect(async () => {
    const box = (await text("full_name").boundingBox())!;
    const c = (await canvas.boundingBox())!;
    // Its start is in view (a field wider than the screen lines up its start).
    expect(box.x).toBeGreaterThanOrEqual(c.x);
    expect(box.x).toBeLessThan(c.x + c.width / 2);
  }).toPass();
});

test("G-23: an editable dropdown takes typed text as well as its options", async ({ page }) => {
  const buffer = await readFile("tests/fixtures/forms/form-extra.pdf");
  await open(page, { name: "form-extra.pdf", mimeType: "application/pdf", buffer });
  const city = page.getByRole("combobox", { name: "city" });
  await expect(city).toHaveValue("Pune");
  await city.fill("Nagpur");
  const out = await PDFDocument.load(await download(page));
  const dd = out.getForm().getDropdown("city");
  expect(dd.getSelected()).toEqual(["Nagpur"]);
  expect(dd.isEditable()).toBe(true);
});

test("AC-233: required fields left empty become a nudge after Download, never a block", async ({ page }) => {
  await open(page, await fillable());
  await page.locator('.bf-field[data-kind="text"] input').first().fill("Ada");
  const out = await download(page);
  expect(out.length).toBeGreaterThan(0);
  await expect(page.getByText(/1 required field is empty/)).toBeVisible();
  if (page.viewportSize()!.width >= 1024) await expect(page.locator(".bf-fieldschip")).toHaveAccessibleName(/1 required field is empty/);
});

test("AC-249 AC-234: the Form tool draws a field, opens its properties; Delete, nudge and undo work", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, "drawing with a mouse; phones use the same code with touch");
  await open(page, "libreoffice-memo.pdf");
  await formTool(page);
  const a = await at(page, 1, 0.2, 0.42);
  const b = await at(page, 1, 0.55, 0.45);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".bf-field")).toHaveCount(1);
  const popover = page.locator(".bf-popover");
  await expect(popover).toBeVisible();
  await expect(popover.getByRole("textbox", { name: /Name/ })).toHaveValue("text");
  // Nudge right by 10 pt with Shift+Arrow.
  const before = (await page.locator(".bf-field").boundingBox())!;
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await page.locator(".bf-field").boundingBox())!.x).toBeGreaterThan(before.x + 5);
  // A click adds a checkbox at its default size.
  await page.getByRole("radio", { name: /Checkbox/ }).click();
  const c = await at(page, 1, 0.7, 0.43);
  await page.mouse.click(c.x, c.y);
  await expect(page.locator(".bf-field")).toHaveCount(2);
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".bf-field")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".bf-field")).toHaveCount(2);

  const out = await PDFDocument.load(await download(page));
  const fields = out.getForm().getFields().map((f) => f.getName()).sort();
  expect(fields).toEqual(["checkbox", "text"]);
});

test("AC-240 AC-246 AC-250: Detect runs in the browser, proposals are reviewed, Add all is one undo step", async ({ page }) => {
  const sent = watchUploads(page);
  await open(page, "report-form-3p.pdf");
  await formTool(page);
  await page.getByRole("button", { name: "Detect fields" }).click();
  await expect(page.locator(".bf-proposal")).toHaveCount(7, { timeout: 20_000 });
  await expect(page.getByText("7 fields on 1 page")).toBeVisible();
  // Skip one, then add the rest at once.
  // Skip one from the keyboard (Enter adds, Delete skips).
  await page.locator(".bf-proposal").first().focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".bf-proposal")).toHaveCount(6);
  await page.getByRole("button", { name: "Add all" }).click();
  await expect(page.locator(".bf-proposal")).toHaveCount(0);
  await expect(page.locator(".bf-field")).toHaveCount(6);
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".bf-field")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".bf-field")).toHaveCount(6);
  expect(sent).toEqual([]);
});

test("AC-251: with Tab order open, every field shows its number and a sort renumbers them", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, "the badges and the side panel tab are the same on phones, in a sheet");
  await open(page, await fillable());
  await formTool(page);
  await page.getByRole("button", { name: "Tab order", exact: true }).first().click();
  await expect(page.locator(".bf-badge")).toHaveCount(7);
  await expect(page.locator(".bf-badge").first()).toHaveText("1");
  await expect(page.getByRole("tab", { name: "Tab order" })).toHaveAttribute("aria-selected", "true");
  // Page 2: Email and Phone radios side by side, Notes below. Rows: Email, Phone, Notes; columns:
  // Email, Notes, Phone. The badges (in field order: Email, Phone, Notes) renumber at once.
  const page2 = page.getByTestId("overlay-2").locator(".bf-badge");
  await expect(page2).toHaveText(["5", "6", "7"]);
  await page.getByRole("button", { name: "Columns" }).click();
  await expect(page.getByRole("button", { name: "Columns" })).toHaveAttribute("aria-pressed", "true");
  await expect(page2).toHaveText(["5", "7", "6"]);
  await page.getByRole("button", { name: "Rows" }).click();
  await expect(page2).toHaveText(["5", "6", "7"]);
});

test("AC-253: the Form tool keeps its place: the rail fits 1366x657, and phones find Form in More", async ({ page }) => {
  await open(page, await fillable());
  const vw = page.viewportSize()!.width;
  if (vw >= 1024) {
    await page.setViewportSize({ width: 1366, height: 657 });
    const rail = page.locator(".ed-rail");
    expect(await rail.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await expect(page.getByRole("button", { name: /^Form/ })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: test.info().outputPath("rail-1366x657.png") });
  } else {
    await page.getByTestId("dock-more").click();
    await expect(page.getByRole("button", { name: /^Form/ })).toBeVisible();
  }
});

test("AC-236: a field moved with the Form tool leaves nothing behind on the page image", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, "dragging with a mouse");
  await open(page, await fillable({ checked: true }));
  await expect(page.getByRole("checkbox", { name: "agree" })).toBeChecked();
  await formTool(page);
  const field = page.locator('.bf-field[data-kind="checkbox"]');
  const from = (await field.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 150, from.y + from.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await field.boundingBox())!.x).toBeGreaterThan(from.x + 100);
  // The raster under the old spot is blank paper: no tick or box from the file's own appearance.
  const dark = await page.getByTestId("page-1").evaluate((el, r) => {
    const c = el.querySelector<HTMLCanvasElement>("canvas.ed-raster")!;
    const b = c.getBoundingClientRect();
    const k = c.width / b.width;
    const d = c.getContext("2d")!.getImageData((r.x - b.x) * k, (r.y - b.y) * k, r.width * k, r.height * k).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 384) n++;
    return n;
  }, from);
  expect(dark).toBe(0);
});

test("AC-237: a signature field takes the signature made for it; a cancelled one doesn't catch the next", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1024, "placing with a mouse");
  await open(page, "libreoffice-memo.pdf");
  await formTool(page);
  await page.getByRole("radio", { name: /Signature/ }).click();
  const p = await at(page, 1, 0.5, 0.45);
  await page.mouse.click(p.x, p.y);
  const field = page.locator('.bf-field[data-kind="signature"]');
  await expect(field).toHaveCount(1);
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const sig = page.locator('.ed-obj[data-kind="signature"]');
  // Ask from the field, then cancel: the next signature from the Sign tool is placed by hand.
  await field.getByRole("button", { name: /^Sign/ }).click();
  await expect(page.getByTestId("sign-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sign-dialog")).toHaveCount(0);
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("s");
  await page.getByTestId("sign-text").fill("Asha Rao");
  await page.getByTestId("sign-place").click();
  await expect(sig).toHaveCount(0);
  const q = await at(page, 1, 0.3, 0.7);
  await page.mouse.click(q.x, q.y);
  await expect(sig).toHaveCount(1);
  await expect(field).toHaveCount(1);
  // Sign into the field: the signature lands in its box and takes the field's place (one undo step).
  await page.keyboard.press("Escape");
  const fb = (await field.boundingBox())!;
  await field.getByRole("button", { name: /^Sign/ }).click();
  await page.getByTestId("sign-text").fill("Asha Rao");
  await page.getByTestId("sign-place").click();
  await expect(sig).toHaveCount(2);
  await expect(field).toHaveCount(0);
  const sb = (await sig.nth(1).boundingBox())!;
  expect(sb.x).toBeGreaterThanOrEqual(fb.x - 1);
  expect(sb.x + sb.width).toBeLessThanOrEqual(fb.x + fb.width + 1);
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("Control+z");
  await expect(sig).toHaveCount(1);
  await expect(field).toHaveCount(1);
  const out = await PDFDocument.load(await download(page));
  expect(out.getForm().getFields().map((f) => f.constructor.name)).toEqual(["PDFSignature"]);
});
