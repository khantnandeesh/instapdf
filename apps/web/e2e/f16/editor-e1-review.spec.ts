/**
 * F16 E1 (/edit-pdf), part 3: memory and device-store limits found in review (PR #25), and the
 * open-another-file check.
 */
import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument as Encryptable } from "@cantoo/pdf-lib";
import { PDFDocument, StandardFonts } from "pdf-lib";

const corpus = (name: string) => `../../tests/parity/editor/${name}`;

/** A text PDF with `n` numbered pages (made at test time, not committed). */
async function numbered(n: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) doc.addPage([595, 842]).drawText(`Page number ${i}`, { x: 72, y: 760, size: 18, font });
  return Buffer.from(await doc.save());
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = t[(c ^ x) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
}

/** A grey RGB PNG of the given size. `declare` overrides the header size (a decompression bomb). */
function png(width: number, height: number, declare?: [number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(declare?.[0] ?? width, 0);
  ihdr.writeUInt32BE(declare?.[1] ?? height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3, 0x80);
  row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function open(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer } = "std14-reportlab.pdf") {
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles(typeof file === "string" ? corpus(file) : file);
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
}

async function tool(page: Page, key: string) {
  await page.getByTestId("canvas").focus();
  await page.keyboard.press(key);
}

async function clickPage(page: Page, n: number, fx: number, fy: number) {
  const el = page.getByTestId(`page-${n}`);
  await el.scrollIntoViewIfNeeded();
  const b = (await el.boundingBox())!;
  await page.mouse.click(b.x + b.width * fx, b.y + Math.min(b.height * fy, page.viewportSize()!.height - b.y - 180));
}

async function addText(page: Page, text: string, fy = 0.3) {
  await tool(page, "t");
  await clickPage(page, 1, 0.3, fy);
  await expect(page.getByTestId("text-input")).toBeFocused();
  await page.keyboard.type(text);
  await page.getByTestId("text-input").press("Escape");
  await expect(page.getByTestId("text-input")).toHaveCount(0);
}

/** Session records in the device store. */
const sessionCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const r = indexedDB.open("berrypdf-editor");
        r.onsuccess = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("sessions")) return resolve(0);
          const c = db.transaction("sessions").objectStore("sessions").count();
          c.onsuccess = () => (resolve(c.result), db.close());
          c.onerror = () => resolve(-1);
        };
        r.onerror = () => resolve(-1);
      }),
  );

/** Counts image blob URLs still alive, and records the asset ids each build is sent. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __liveImages: Set<string>; __built: string[][]; __failPut: boolean };
    w.__liveImages = new Set();
    w.__built = [];
    w.__failPut = false;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (o: Blob | MediaSource) => {
      const u = create(o);
      if (o instanceof Blob && o.type.startsWith("image/")) w.__liveImages.add(u);
      return u;
    };
    URL.revokeObjectURL = (u: string) => {
      w.__liveImages.delete(u);
      revoke(u);
    };
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, msg: unknown, ...rest: unknown[]) {
      const m = msg as { input?: { assets?: Record<string, unknown> } } | null;
      if (m?.input?.assets) w.__built.push(Object.keys(m.input.assets));
      return (post as (...a: unknown[]) => void).call(this, msg, ...rest);
    } as typeof Worker.prototype.postMessage;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: Parameters<IDBObjectStore["put"]>) {
      if (w.__failPut) throw new DOMException("Quota exceeded (test)", "QuotaExceededError");
      return put.apply(this, a);
    };
  });
}
const liveImages = (page: Page) => page.evaluate(() => (window as unknown as { __liveImages: Set<string> }).__liveImages.size);

/** The save chip shows on wide layouts only. */
async function chip(page: Page, text: string) {
  if (page.viewportSize()!.width >= 1024) await expect(page.getByTestId("save-chip")).toHaveText(text);
}

test("review #4: a failed autosave says so quietly, leaves no stale record, and saves again later", async ({ page }) => {
  await instrument(page);
  await open(page);
  await addText(page, "Kept");
  await chip(page, "Saved");
  await expect.poll(() => sessionCount(page)).toBe(1);
  await page.evaluate(() => ((window as unknown as { __failPut: boolean }).__failPut = true));
  await addText(page, "Not kept", 0.4);
  await expect(page.getByText("Changes aren’t being kept on this device right now.")).toBeVisible();
  await chip(page, "Not saved on device");
  // The older record would restore the wrong state: it is gone.
  await expect.poll(() => sessionCount(page)).toBe(0);
  await page.evaluate(() => ((window as unknown as { __failPut: boolean }).__failPut = false));
  await addText(page, "Kept again", 0.5);
  await chip(page, "Saved");
  await expect.poll(() => sessionCount(page)).toBe(1);
});

test("review #14: an encrypted file is never kept on the device", async ({ page }) => {
  // A user-password file that allows editing (an owner-restricted one opens read-only).
  const doc = await Encryptable.create();
  doc.addPage([595, 842]);
  doc.encrypt({ userPassword: "test", ownerPassword: "test-owner", algorithm: "AES-256", permissions: { modifying: true, printing: true, copying: true, annotating: true, fillingForms: true, documentAssembly: true, contentAccessibility: true } });
  await page.goto("/edit-pdf");
  await page.getByTestId("editor-input").setInputFiles({ name: "locked.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save({ useObjectStreams: false })) });
  await page.getByLabel(/password/i).first().fill("test");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByTestId("page-1")).toHaveAttribute("data-drawn", "true", { timeout: 15_000 });
  await addText(page, "Private");
  await page.waitForTimeout(1200);
  await chip(page, "Not saved on device");
  expect(await sessionCount(page)).toBe(0);
});

test("review #13: opening another PDF with edits not downloaded asks first", async ({ page }) => {
  await open(page, "rotated-90.pdf");
  await addText(page, "Draft");
  await page.getByTestId("open-input").setInputFiles(corpus("report-form-3p.pdf"));
  const ask = page.getByRole("dialog", { name: "Open report-form-3p.pdf without downloading?" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByRole("group", { name: /Draft/ })).toHaveCount(1);
  await expect(page.getByTestId("page-3")).toHaveCount(0);
  await page.getByTestId("open-input").setInputFiles(corpus("report-form-3p.pdf"));
  await ask.getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("page-3")).toBeVisible();
  // No edits: opens straight away.
  await page.getByTestId("open-input").setInputFiles(corpus("rotated-90.pdf"));
  await expect(page.getByTestId("page-3")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: /without downloading/ })).toHaveCount(0);
});

test("review #6: a decompression-bomb PNG is refused before decoding, and a wide one is redrawn to 4096 px", async ({ page }) => {
  await instrument(page);
  await open(page);
  await page.getByTestId("image-input").setInputFiles({ name: "bomb.png", mimeType: "image/png", buffer: png(1, 1, [100_000, 100_000]) });
  await expect(page.getByText("That image is too large: up to 40 megapixels, please.")).toBeVisible();
  expect(await liveImages(page)).toBe(0);
  await page.getByTestId("image-input").setInputFiles({ name: "wide.png", mimeType: "image/png", buffer: png(5000, 20) });
  const widest = () =>
    page.evaluate(async () => {
      const urls = [...(window as unknown as { __liveImages: Set<string> }).__liveImages];
      const sizes = await Promise.all(
        urls.map(async (u) => {
          const i = new Image();
          i.src = u;
          return i.decode().then(() => i.naturalWidth, () => 0);
        }),
      );
      return Math.max(0, ...sizes);
    });
  // Once the image is ready to place, the only one alive is the redrawn copy.
  await expect.poll(() => page.evaluate(() => document.querySelector(".ed-pagewrap--place") !== null)).toBe(true);
  expect(await liveImages(page)).toBe(1);
  expect(await widest()).toBe(4096);
});

test("review #7: replaced and unplaced uploads are released, and Download sends only the assets in use", async ({ page }) => {
  await instrument(page);
  await open(page);
  await tool(page, "s");
  const dialog = page.getByTestId("sign-dialog");
  await dialog.getByRole("radio", { name: "Upload" }).click();
  await dialog.getByTestId("sign-upload").setInputFiles({ name: "sig.png", mimeType: "image/png", buffer: png(60, 20) });
  await expect(dialog.getByRole("img", { name: "Uploaded signature" })).toBeVisible();
  const toggle = dialog.getByRole("checkbox", { name: "Remove background" });
  for (let i = 0; i < 3; i++) {
    await toggle.click();
    await expect(dialog.getByRole("img", { name: "Uploaded signature" })).toBeVisible();
    await page.waitForTimeout(150);
  }
  // Only the shown upload is alive while the dialog is open.
  await expect.poll(() => liveImages(page)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => liveImages(page), { timeout: 4000 }).toBe(0);

  // An image added and then deleted stays for undo, but isn't sent to the build.
  await page.getByTestId("image-input").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: png(30, 30) });
  await clickPage(page, 1, 0.5, 0.6);
  await expect(page.locator('[data-kind="image"]')).toHaveCount(1);
  // Placing selects and focuses the image.
  await page.locator('[data-kind="image"]').first().focus();
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-kind="image"]')).toHaveCount(0);
  await addText(page, "Text only");
  await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  const built = await page.evaluate(() => (window as unknown as { __built: string[][] }).__built);
  expect(built.at(-1)).toEqual([]);
  expect(await liveImages(page)).toBe(1);
});

test("review #8: placing the same typed signature again keeps one saved copy", async ({ page }) => {
  await open(page);
  for (const fy of [0.6, 0.75]) {
    await tool(page, "s");
    await page.getByTestId("sign-text").fill("Asha Rao");
    await page.getByTestId("sign-place").click();
    await clickPage(page, 1, 0.5, fy);
  }
  await expect(page.locator('[data-kind="signature"]')).toHaveCount(2);
  await tool(page, "s");
  await expect(page.getByRole("button", { name: "Use saved signature" })).toHaveCount(1);
});

test("review #9 #10: off-screen page and thumbnail canvases are zeroed, and the build worker stops on close", async ({ page }, info) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __rasters: HTMLCanvasElement[] };
    w.__rasters = [];
    const make = document.createElement.bind(document);
    document.createElement = ((tag: string, o?: ElementCreationOptions) => {
      const el = make(tag, o);
      if (tag.toLowerCase() === "canvas") w.__rasters.push(el as HTMLCanvasElement);
      return el;
    }) as typeof document.createElement;
  });
  await open(page, { name: "forty.pdf", mimeType: "application/pdf", buffer: await numbered(40) });
  const leaked = () =>
    page.evaluate(() =>
      (window as unknown as { __rasters: HTMLCanvasElement[] }).__rasters.filter(
        (c) => (c.className === "ed-raster" || c.className === "ed-thumb__canvas") && !c.isConnected && c.width * c.height > 0,
      ).length,
    );
  const drawn = () => page.evaluate(() => document.querySelectorAll(".ed-raster, .ed-thumb__canvas").length);
  await expect.poll(drawn).toBeGreaterThan(1);
  // Far down the file: page 1 and (on desktop) its thumbnail are released.
  await page.getByTestId("canvas").evaluate((c) => c.scrollTo(0, c.scrollHeight));
  if (info.project.name === "desktop") await page.getByTestId("thumbs").evaluate((t) => t.parentElement!.scrollTo(0, t.parentElement!.scrollHeight));
  await expect(page.getByTestId("page-1").locator("canvas")).toHaveCount(0, { timeout: 5000 });
  if (info.project.name === "desktop") await expect(page.locator('[data-thumb="0"] canvas')).toHaveCount(0, { timeout: 5000 });
  expect(await leaked()).toBe(0);

  // The build worker starts on Download and ends with the editor.
  const before = new Set(page.workers());
  await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  const started = page.workers().filter((w) => !before.has(w));
  expect(started).toHaveLength(1);
  let closed = false;
  started[0]!.on("close", () => (closed = true));
  // Back closes the editor (nothing unsaved: no leave check).
  await page.goBack();
  await expect(page.getByTestId("editor")).toHaveAttribute("data-state", "empty");
  await expect.poll(() => closed).toBe(true);
});
