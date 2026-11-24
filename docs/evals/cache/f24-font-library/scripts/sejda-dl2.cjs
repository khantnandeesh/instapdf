const { chromium } = require("/opt/node-tools/node_modules/playwright");
const fs = require("fs");
const ID = process.argv[2], TAG = process.argv[3];
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, acceptDownloads: true });
  let next = 0;
  await ctx.route(/sejda/i, async (route) => { const now = Date.now(); const at = Math.max(now, next); next = at + 1000; if (at > now) await new Promise((r) => setTimeout(r, at - now)); await route.continue().catch(() => {}); });
  const page = await ctx.newPage();
  page.on("response", async (r) => { if (/api|result|download/i.test(r.url()) && !/\.(js|css|png|svg|woff)/.test(r.url())) { let body = ""; try { body = (await r.text()).slice(0, 500); } catch {} log("resp", r.status(), r.request().method(), r.url().slice(0, 140), /json/.test(r.headers()["content-type"] || "") ? body : ""); } });
  await page.goto("https://www.sejda.com/pdf-editor#results-" + ID, { waitUntil: "networkidle", timeout: 180000 }).catch((e) => log("goto", String(e).slice(0, 100)));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: __dirname + "/out/sejda-" + TAG + "-reopen.png" });
  for (const f of page.frames()) log("frame", f.url());
  const fr = page.frames().find((f) => /result\?id/.test(f.url()));
  if (fr) {
    const a = fr.locator("#download-btn");
    log("btn visible", await a.isVisible(), "href", await a.getAttribute("href"));
    const p = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
    const pp = ctx.waitForEvent("page", { timeout: 15000 }).catch(() => null);
    await a.click({ timeout: 10000 }).catch((e) => log("click", String(e).slice(0, 100)));
    const np = await pp; if (np) { log("new page", np.url()); np.on("download", async (d) => { await d.saveAs(__dirname + "/out/sejda-" + TAG + "-output.pdf"); log("saved via popup"); }); }
    const d = await p; if (d) { log("download", d.url().slice(0, 150)); await d.saveAs(__dirname + "/out/sejda-" + TAG + "-output.pdf"); log("saved", fs.statSync(__dirname + "/out/sejda-" + TAG + "-output.pdf").size); }
    await page.waitForTimeout(5000);
  }
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
