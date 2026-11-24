// Sejda T1: chrome-justified-mixed.pdf, line edit with missing letter + added text. APPLY=1 spends a task.
const { chromium } = require("/opt/node-tools/node_modules/playwright");
const fs = require("fs");
const SHOTS = "/mnt/project-files/designs/fonts/eval/";
const OUT = __dirname + "/out/";
const TAG = process.env.TAG || "t1";
const FILE = process.env.FILE || "/home/user/instapdf/tests/parity/editor/chrome-justified-mixed.pdf";
const FIND = process.env.FIND || "This agreement is made";
const TYPED = process.env.TYPED || " for Dvořák";
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, acceptDownloads: true });
  // politeness: at most 1 request a second to sejda hosts
  let next = 0; let n = 0; const posts = [];
  await ctx.route(/sejda/i, async (route) => {
    const now = Date.now(); const at = Math.max(now, next); next = at + 1000; n++;
    const r = route.request();
    if (r.method() !== "GET") posts.push({ t: new Date(at).toISOString(), m: r.method(), u: r.url().slice(0, 160), len: (r.postDataBuffer() || Buffer.alloc(0)).length });
    if (at > now) await new Promise((res) => setTimeout(res, at - now));
    await route.continue().catch(() => {});
  });
  const page = await ctx.newPage();
  let dl = null;
  page.on("download", async (d) => { dl = OUT + "sejda-" + TAG + "-output.pdf"; log("download event", d.url().slice(0, 140), d.suggestedFilename()); await d.saveAs(dl).catch((e) => log("saveAs fail", String(e))); log("saved"); });
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = (name) => page.screenshot({ path: SHOTS + "sejda-" + TAG + "-" + name + ".png" }).catch((e) => log("shot fail", String(e).slice(0, 100)));
  await page.goto("https://www.sejda.com/pdf-editor", { waitUntil: "networkidle", timeout: 240000 }).catch((e) => log("goto", String(e).slice(0, 120)));
  log("loaded", await page.title(), "reqs", n);
  await page.locator('input[type="file"]').first().setInputFiles(FILE);
  log("file set");
  const t = page.getByText(FIND, { exact: false }).first();
  await t.waitFor({ timeout: 180000 });
  await wait(4000);
  log("editor ready, reqs", n);
  await shot("1-opened");
  const b = await t.boundingBox(); log("box", JSON.stringify(b));
  await page.mouse.click(b.x + b.width - 30, b.y + b.height / 2); await wait(2500);
  await page.keyboard.press("End"); await wait(400);
  for (const ch of TYPED) { await page.keyboard.type(ch, { delay: 100 }); await wait(250); }
  await wait(2000);
  await shot("2-typed");
  const dialogs = await page.evaluate(() => [...document.querySelectorAll('.modal, [role=dialog], .alert, .notification, .toast')].filter((e) => e.offsetParent).map((e) => e.innerText.slice(0, 400)));
  log("visible dialogs/alerts after typing", JSON.stringify(dialogs));
  // open the font menu of the run being edited and dump it
  const fontBtn = page.locator('.text-editor-toolbar, .floating-toolbar, body').locator('text=/^Aa/').first();
  if (process.env.DUMP) {
    const html = await page.evaluate(() => { const el = [...document.querySelectorAll('button, a')].filter((e) => e.offsetParent && /Aa/.test(e.textContent || "")); return el.map((e) => e.outerHTML.slice(0, 300) + " || parent: " + e.parentElement.className + " || gp: " + e.parentElement.parentElement.className); });
    log("font buttons", JSON.stringify(html, null, 1));
  }
  await page.mouse.click(1150, 500); await wait(2500); // click away (blank right margin)
  await shot("3-after-blur");
  const state = await page.evaluate(() => [...document.querySelectorAll('.modal, [role=dialog]')].filter((e) => e.offsetParent).map((e) => e.innerText.slice(0, 600)));
  log("visible dialogs after blur", JSON.stringify(state));
  if (process.env.DUMP) {
    fs.writeFileSync(OUT + "sejda-" + TAG + "-dom.html", await page.content());
  }
  if (process.env.APPLY === "1") {
    page.on("response", async (r) => { if (/\/api\/tasks/.test(r.url())) { let body = ""; try { body = (await r.text()).slice(0, 1500); } catch {} log("resp", r.status(), r.request().method(), r.url().slice(0, 120), body); fs.appendFileSync(OUT + "sejda-" + TAG + "-api.log", r.url() + "\n" + body + "\n"); } });
    const apply = page.locator("#save-pdf-btn");
    log("APPLY click"); const t0 = Date.now();
    await apply.click();
    const fr = page.frameLocator("#taskResultsFrame");
    const btn = fr.locator("#download-btn");
    await btn.waitFor({ state: "visible", timeout: 240000 }).catch((e) => log("btn wait", String(e).slice(0, 100)));
    log("ready after", Date.now() - t0, "ms; url", page.url());
    await shot("4-result");
    const href = await btn.getAttribute("href").catch(() => null);
    log("href", href);
    if (!dl) {
      const p = ctx.waitForEvent("page", { timeout: 20000 }).catch(() => null);
      const pd = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
      await btn.click({ timeout: 15000 }).catch((e) => log("btn click", String(e).slice(0, 100)));
      const np = await p;
      if (np) { log("popup", np.url()); const d2 = await np.waitForEvent("download", { timeout: 30000 }).catch(() => null); if (d2) { dl = OUT + "sejda-" + TAG + "-output.pdf"; await d2.saveAs(dl); log("saved from popup"); } }
      const d = await pd; if (d && !dl) await wait(3000);
    }
    await wait(5000);
    if ((!dl || !fs.existsSync(dl)) && href && /^http/.test(href)) {
      const r = await ctx.request.get(href); log("direct get", r.status()); if (r.ok()) { dl = OUT + "sejda-" + TAG + "-output.pdf"; fs.writeFileSync(dl, await r.body()); }
    }
    log("output", dl, dl && fs.existsSync(dl) ? fs.statSync(dl).size : "missing");
    if (!dl || !fs.existsSync(dl)) { log("keeping page open 60 s for inspection"); for (const f of page.frames()) log("frame", f.url()); fs.writeFileSync(OUT + "sejda-" + TAG + "-frame.html", await page.frames().find((f) => /result/.test(f.url()))?.content() || ""); }
  }
  log("non-GET requests", JSON.stringify(posts, null, 1), "total reqs", n);
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
