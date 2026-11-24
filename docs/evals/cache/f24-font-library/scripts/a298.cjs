// AC-298/299/303: open lines and compare the box's ink with the page's
const { open, load, log, SHOTS } = require("./lib.cjs");
const fs = require("fs");
const CASES = [
  ["chrome-justified-mixed.pdf", /^Service Agreement/], ["chrome-justified-mixed.pdf", /^This agreement/], ["chrome-justified-mixed.pdf", /^and it stays/], ["chrome-justified-mixed.pdf", /^Total amount/], ["chrome-justified-mixed.pdf", /^non-refundable/],
  ["libreoffice-memo.pdf", /^The meeting/], ["libreoffice-memo.pdf", /^Please bring/], ["libreoffice-memo.pdf", /^Team memo/],
  ["std14-reportlab.pdf", 0], ["std14-reportlab.pdf", 1], ["std14-reportlab.pdf", 3],
  ["latex-type1.pdf", 0], ["latex-type1.pdf", 1], ["latex-type1c.pdf", 1],
  ["cid-bold-run.pdf", 0], ["cid-bold-run.pdf", 1], ["font-coverage-1p.pdf", 1], ["font-coverage-1p.pdf", 3],
];
(async () => {
  const phone = process.env.PHONE === "1";
  const res = [];
  let cur = null, sess = null;
  for (const [i, [file, which]] of CASES.entries()) {
    if (cur !== file) { if (sess) await sess.browser.close(); sess = await open({ phone }); await load(sess.page, file); cur = file; }
    const { page } = sess;
    const opt = typeof which === "number" ? page.getByTestId("line").nth(which) : page.getByRole("option", { name: which });
    if (!(await opt.count())) { res.push({ file, which: String(which), err: "no such line" }); continue; }
    await opt.scrollIntoViewIfNeeded().catch(() => {});
    await page.mouse.move(5, 5); await page.waitForTimeout(300);
    const b = await opt.boundingBox(); const text = await opt.getAttribute("data-text");
    const pad = 40;
    const clip = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(b.width + 2 * pad, (phone ? 390 : 1280) - Math.max(0, b.x - pad)), height: b.height + 2 * pad };
    const base = `${__dirname}/out/a298/${phone ? "p" : "d"}${i}`;
    await page.screenshot({ path: base + "-before.png", clip });
    const cx = b.x + b.width * 0.5, cy = b.y + b.height / 2;
    // record what the box shows from the first frame
    await page.evaluate(() => { window.__f = []; const t0 = performance.now(); const tick = () => { const el = document.querySelector('[data-testid=line-input]'); if (el) window.__f.push([Math.round(performance.now() - t0), el.dataset.face, el.dataset.faces, getComputedStyle(el).opacity, el.getAnimations({ subtree: true }).length, getComputedStyle(el).color, [...el.querySelectorAll('span')].map((s) => getComputedStyle(s).color + "|" + getComputedStyle(s).webkitTextFillColor).join(";")]); if (performance.now() - t0 < 1500) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    phone ? await page.touchscreen.tap(cx, cy) : await page.mouse.click(cx, cy);
    await page.screenshot({ path: base + "-f0.png", clip });
    await page.waitForTimeout(120);
    await page.screenshot({ path: base + "-f1.png", clip });
    await page.waitForTimeout(1500);
    if (!phone) await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
    await page.screenshot({ path: base + "-open.png", clip });
    const box = page.getByTestId("line-input");
    const info = await box.evaluate((el, cx) => {
      const s = getSelection(); const r = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null; const cs = getComputedStyle(el);
      const rects = s.rangeCount ? [...s.getRangeAt(0).getClientRects()] : [];
      return { face: el.dataset.face, faces: el.dataset.faces, fam: [...el.querySelectorAll("span")].map((x) => x.style.fontFamily.split(",")[0]), selType: s.type, caretX: r ? (rects[0] ? rects[0].x : r.x) : null, clickX: cx, kerning: cs.fontKerning, lig: cs.fontVariantLigatures, feat: cs.fontFeatureSettings, rect: el.getBoundingClientRect().toJSON(), scrollW: el.scrollWidth, anim: el.getAnimations({ subtree: true }).length, ws: cs.wordSpacing, ls: cs.letterSpacing, spans: [...el.querySelectorAll("span")].map((x) => x.style.letterSpacing + "/" + x.style.wordSpacing).join(",").slice(0, 120) };
    }, cx).catch((e) => ({ err: String(e).slice(0, 200) }));
    const frames = await page.evaluate(() => window.__f);
    const uniq = []; for (const f of frames) { const k = JSON.stringify(f.slice(1)); if (!uniq.length || uniq[uniq.length - 1][1] !== k) uniq.push([f[0], k]); }
    res.push({ i, file, text, line: b, clip, info, timeline: uniq });
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  }
  if (sess) await sess.browser.close();
  fs.writeFileSync(`${__dirname}/out/a298/${phone ? "p" : "d"}-res.json`, JSON.stringify(res, null, 1));
  for (const r of res) console.log(r.i, r.file, JSON.stringify(r.text), r.err || JSON.stringify({ face: r.info.face, faces: r.info.faces, fam: r.info.fam, sel: r.info.selType, caretDx: r.info.caretX != null ? +(r.info.caretX - r.info.clickX).toFixed(1) : null, kern: r.info.kerning, lig: r.info.lig, feat: r.info.feat, anim: r.info.anim, w: [+r.line.width.toFixed(1), +r.info.rect.width.toFixed(1), r.info.scrollW] }), "\n   timeline", JSON.stringify(r.timeline).slice(0, 700));
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
