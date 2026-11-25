// timings: pick -> first page, Enter -> saved, Download -> file (3 runs each)
const { chromium, BASE, FX, log } = require("./lib.cjs");
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  for (const phone of [false, true]) { const first = [], dlms = [], total = [];
    for (let i = 0; i < 3; i++) { const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: 2, hasTouch: phone, isMobile: phone, acceptDownloads: true }); const page = await ctx.newPage(); await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle" });
      const t0 = Date.now(); await page.locator('input[type="file"]').first().setInputFiles(FX + "chrome-justified-mixed.pdf"); await page.locator(".ed-page--drawn").first().waitFor({ timeout: 20000 }); first.push(Date.now() - t0);
      const o = page.getByRole("option", { name: /^in full/ }); const b = await o.boundingBox(); phone ? await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End"); await page.keyboard.type(" for Dvořák"); await page.keyboard.press("Enter");
      await page.getByRole("option", { name: /^in full\. for Dvořák/ }).waitFor({ timeout: 20000 });
      const t1 = Date.now(); const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); const d = await dl; await d.path(); dlms.push(Date.now() - t1); total.push(Date.now() - t0); await ctx.close(); }
    log(phone ? "390" : "1280", "pick→first page ms", first, "Download→file ms", dlms, "pick→file total ms", total); }
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
