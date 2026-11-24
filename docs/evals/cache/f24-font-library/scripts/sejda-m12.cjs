const { chromium } = require("/opt/node-tools/node_modules/playwright");
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } }); let next = 0;
  for (const [w, h] of [[1366, 657], [390, 664]]) {
    const phone = w < 500;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: phone, isMobile: phone });
    await ctx.route(/sejda/i, async (route) => { const now = Date.now(); const at = Math.max(now, next); next = at + 1000; if (at > now) await new Promise((r) => setTimeout(r, at - now)); await route.continue().catch(() => {}); });
    const page = await ctx.newPage();
    await page.goto("https://www.sejda.com/pdf-editor", { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
    await page.locator('input[type="file"]').first().setInputFiles("/home/user/instapdf/tests/parity/editor/chrome-justified-mixed.pdf");
    await page.getByText("This agreement is made", { exact: false }).first().waitFor({ timeout: 90000 }); await page.waitForTimeout(2500);
    const m = () => page.evaluate(() => { const t = [...document.querySelectorAll("div,span")].find((e) => /This agreement is made/.test(e.textContent) && e.children.length === 0); let p = t; while (p && !(p.querySelector && p.querySelector("canvas")) ) p = p.parentElement; const c = (p && p.querySelector("canvas")) || document.querySelector("canvas"); const r = c.getBoundingClientRect(); const vis = { w: Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)), h: Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) }; const a = document.querySelector("#save-pdf-btn").getBoundingClientRect(); return { scrollY: Math.round(scrollY), canvas: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], pageWpct: Math.round(100 * vis.w / innerWidth), pageHpct: Math.round(100 * vis.h / innerHeight), areaPct: Math.round(100 * vis.w * vis.h / (innerWidth * innerHeight)), applyInView: a.top >= 0 && a.bottom <= innerHeight, sw: document.documentElement.scrollWidth }; });
    log(`${w}x${h} as opened`, JSON.stringify(await m()));
    await page.screenshot({ path: `/mnt/project-files/designs/fonts/eval/sejda-m12-${w}x${h}-opened.png` });
    await page.evaluate(() => { const c = document.querySelector("canvas"); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 4); }); await page.waitForTimeout(800);
    log(`${w}x${h} scrolled to page top`, JSON.stringify(await m()));
    await page.screenshot({ path: `/mnt/project-files/designs/fonts/eval/sejda-m12-${w}x${h}-scrolled.png` });
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
