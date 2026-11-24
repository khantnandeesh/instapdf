// Upload-only Sejda visits (no Apply): phone and desktop captures of line edit + font menu
const { chromium } = require("/opt/node-tools/node_modules/playwright");
const SHOTS = "/mnt/project-files/designs/fonts/eval/";
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  let next = 0;
  for (const phone of [true, false]) {
    const tag = phone ? "390" : "1280";
    const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: 2, hasTouch: phone, isMobile: phone });
    await ctx.route(/sejda/i, async (route) => { const now = Date.now(); const at = Math.max(now, next); next = at + 1000; if (at > now) await new Promise((r) => setTimeout(r, at - now)); await route.continue().catch(() => {}); });
    const page = await ctx.newPage(); const wait = (ms) => page.waitForTimeout(ms);
    const shot = (n) => page.screenshot({ path: SHOTS + `sejda-ux-${n}-${tag}.png` }).catch(() => {});
    const t0 = Date.now();
    await page.goto("https://www.sejda.com/pdf-editor", { waitUntil: "networkidle", timeout: 240000 }).catch((e) => log("goto", String(e).slice(0, 100)));
    await shot("0-landing");
    log(tag, "landing words before action", await page.evaluate(() => { const b = [...document.querySelectorAll("a,button,label")].find((e) => /Upload PDF/i.test(e.textContent) && e.offsetParent); if (!b) return null; const top = b.getBoundingClientRect().top; let n = 0; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const el = w.currentNode.parentElement; if (!el || !el.offsetParent) continue; const r = el.getBoundingClientRect(); if (r.bottom <= top && r.height > 0) n += w.currentNode.textContent.trim().split(/\s+/).filter(Boolean).length; } return { words: n, actionTop: top }; }));
    const t1 = Date.now();
    await page.locator('input[type="file"]').first().setInputFiles("/home/user/instapdf/tests/parity/editor/chrome-justified-mixed.pdf");
    const t = page.getByText("This agreement is made", { exact: false }).first();
    await t.waitFor({ timeout: 180000 }); log(tag, "pick to text layer ms (throttled to 1 req/s)", Date.now() - t1);
    await wait(3000);
    await shot("1-opened");
    log(tag, "scrollW/innerW", await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, scrollY]));
    await t.scrollIntoViewIfNeeded(); await wait(500);
    const b = await t.boundingBox(); log(tag, "box", JSON.stringify(b));
    phone ? await page.touchscreen.tap(b.x + b.width - 10, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 30, b.y + b.height / 2);
    await wait(2500); await shot("2-line-open");
    await page.keyboard.press("End"); await page.keyboard.type(" for Dvořák", { delay: 100 }); await wait(2000);
    await shot("3-typed");
    const opened = await page.evaluate(() => { const ul = [...document.querySelectorAll("ul.font-family-opts")].find((u) => u.parentElement && u.parentElement.offsetParent); if (!ul) return "no menu"; const tg = ul.parentElement.querySelector(".dropdown-toggle, button, a"); tg.click(); return tg.outerHTML.slice(0, 200); });
    log(tag, "font toggle", opened); await wait(1500); await shot("4-font-menu");
    log(tag, "menu", await page.evaluate(() => { const ul = [...document.querySelectorAll("ul.font-family-opts")].find((u) => u.offsetParent); if (!ul) return null; const r = ul.getBoundingClientRect(); return { n: ul.querySelectorAll("a").length, rect: [r.x, r.y, r.width, r.height], search: !!ul.querySelector("input"), items: [...ul.querySelectorAll("a")].map((a) => a.textContent.trim()).join(" | ").slice(0, 900) }; }));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
