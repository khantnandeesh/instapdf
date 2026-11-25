// AC-298 repeat: does the opened box sit a whole CSS pixel above/below the page's own drawing? 3 fresh sessions per line, device scale factor 1 and 2.
const { chromium, BASE, FX, log } = require("./lib.cjs"); const fs = require("fs");
const N = process.env.FXD + "/ac283-named-only.pdf";
const CASES = [["latex-type1c.pdf", 1], ["cid-bold-run.pdf", 1], [N, 16], [N, 18], [N, 0], ["reportlab-mono-subset.pdf", 0], ["libreoffice-memo.pdf", /^Please bring/], ["chrome-justified-mixed.pdf", /^and it stays/], ["latex-type1c.pdf", 10], ["latex-type1c.pdf", 4]];
(async () => { const res = []; const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  for (const phone of [false, true]) for (const dsf of [1, 2]) for (const [ci, [file, which]] of CASES.entries()) for (let rep = 0; rep < 3; rep++) {
    const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: dsf, hasTouch: phone, isMobile: phone }); const page = await ctx.newPage();
    await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle" }); await page.locator('input[type="file"]').first().setInputFiles(file.startsWith("/") ? file : FX + file); await page.waitForTimeout(4000);
    const opt = typeof which === "number" ? page.getByTestId("line").nth(which) : page.getByRole("option", { name: which }); await opt.scrollIntoViewIfNeeded().catch(() => {}); await page.mouse.move(5, 5); await page.waitForTimeout(300);
    const b = await opt.boundingBox(); const text = await opt.getAttribute("data-text"); const pad = 12; const clip = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(b.width + 2 * pad, (phone ? 390 : 1280) - Math.max(0, b.x - pad)), height: b.height + 2 * pad };
    const base = `out/v298/${phone ? "p" : "d"}-x${dsf}-c${ci}-r${rep}`; await page.screenshot({ path: base + "-before.png", clip });
    phone ? await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2) : await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(1800); if (!phone) await page.mouse.move(5, 5); await page.waitForTimeout(200);
    await page.screenshot({ path: base + "-open.png", clip });
    const geo = await page.evaluate(() => { const el = document.querySelector("[data-testid=line-input]"); const r = el.getBoundingClientRect(); const pg = document.querySelector(".ed-page").getBoundingClientRect(); const cv = document.querySelector(".ed-page canvas"); const cr = cv ? cv.getBoundingClientRect() : null; return { box: [r.x, r.y, r.width, r.height], page: [pg.x, pg.y, pg.width, pg.height], canvas: cr && [cr.x, cr.y, cr.width, cr.height, cv.width, cv.height], face: el.dataset.face, top: getComputedStyle(el).top, lh: getComputedStyle(el).lineHeight, fs: getComputedStyle(el).fontSize, tr: getComputedStyle(el).transform }; });
    res.push({ base, phone, dsf, ci, rep, text, line: b, clip, geo }); await ctx.close(); }
  await browser.close(); fs.writeFileSync("out/v298/res.json", JSON.stringify(res, null, 1)); log("done", res.length);
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
