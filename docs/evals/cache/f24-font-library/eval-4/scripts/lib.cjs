const { chromium } = require("/opt/node-tools/node_modules/playwright");
const BASE = "https://web-staging-qzq5fa2g7q-uc.a.run.app";
const SHOTS = "/mnt/project-files/designs/fonts/eval-4/";
const FX = "/home/user/instapdf/tests/parity/editor/";
async function open(opts = {}) {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const phone = opts.phone;
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: 2, acceptDownloads: true, hasTouch: !!phone, isMobile: !!phone, ...(opts.ctx || {}) });
  const page = await ctx.newPage();
  const reqs = [];
  page.on("request", (r) => reqs.push({ t: Date.now(), m: r.method(), u: r.url(), len: (r.postDataBuffer() || Buffer.alloc(0)).length, type: r.resourceType() }));
  page.on("console", (m) => { if (m.type() === "error") reqs.push({ t: Date.now(), console: m.text().slice(0, 300) }); });
  page.on("pageerror", (e) => reqs.push({ t: Date.now(), pageerror: String(e).slice(0, 300) }));
  await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle", timeout: 90000 });
  return { browser, ctx, page, reqs };
}
async function load(page, file) {
  await page.locator('input[type="file"]').first().setInputFiles(file.startsWith("/") ? file : FX + file);
  await page.waitForTimeout(4000);
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
module.exports = { open, load, BASE, SHOTS, FX, log, chromium };
