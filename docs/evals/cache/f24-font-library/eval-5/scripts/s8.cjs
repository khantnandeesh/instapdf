const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => {
  const phone = process.env.PHONE === "1"; const tag = phone ? "390" : "1280"; const VW = phone ? 390 : 1280;
  const { browser, page, reqs } = await open({ phone }); await load(page, "chrome-justified-mixed.pdf"); await install(page);
  const tap = (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
  const geo = () => page.evaluate(() => { const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)]; }; const q = (s) => document.querySelector(`[data-testid=${s}]`); const sc = [...document.querySelectorAll("*")].filter((e) => e.scrollTop > 0 || e.scrollLeft > 0).map((e) => (e.dataset.testid || e.className.toString().slice(0, 20)) + ":" + e.scrollTop + "," + e.scrollLeft); const h = q("line-missing"); return { page: R(q("page-1")), dock: R(q("dock")), hint: R(h), hintLines: h ? Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)) : null, hintOpaque: h ? getComputedStyle(h).backgroundColor : null, box: R(q("line-input")), notice: R(q("editor-notice")), scrollY, sc, vv: [visualViewport.width, visualViewport.height, visualViewport.offsetTop], sw: document.documentElement.scrollWidth }; });
  // ---- outline on the middle line of the first paragraph
  const mid = page.getByRole("option", { name: /^and it stays/ }); const mb = await mid.boundingBox();
  const region = { x: Math.max(0, mb.x - 16), y: mb.y - 30, width: Math.min(VW - Math.max(0, mb.x - 16), mb.width + 32), height: mb.height + 60 };
  if (!phone) await page.mouse.move(3, 3); await page.waitForTimeout(200);
  await page.screenshot({ path: `out/s8-${tag}-outline-before.png`, clip: region });
  const g0 = await geo();
  await tap(mb.x + mb.width * 0.4, mb.y + mb.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(800); if (!phone) await page.mouse.move(3, 3); await page.waitForTimeout(200);
  await page.screenshot({ path: `out/s8-${tag}-outline-open.png`, clip: region });
  await page.screenshot({ path: SHOTS + `outline-middle-line-${tag}.png` });
  log(tag, "outline css", JSON.stringify(await page.evaluate(() => { const el = document.querySelector("[data-testid=line-input]"); const out = []; let n = el; for (let i = 0; i < 4 && n; i++, n = n.parentElement) { for (const pseudo of [null, "::before", "::after"]) { const cs = getComputedStyle(n, pseudo); if (pseudo && cs.content === "none") continue; if (parseFloat(cs.borderTopWidth) || parseFloat(cs.outlineWidth) || cs.boxShadow !== "none") out.push({ el: (n.dataset.testid || n.className.toString().slice(0, 30)) + (pseudo || ""), border: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(" ") + " " + cs.borderTopColor, outline: cs.outlineWidth + " " + cs.outlineStyle, shadow: cs.boxShadow.slice(0, 80), inset: n.dataset.inset, r: (pseudo ? null : (() => { const r = n.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(1)); })()) }); } } return { out, inset: el.dataset.inset, lineRects: [...document.querySelectorAll("[data-testid=line]")].slice(0, 4).map((l) => { const r = l.getBoundingClientRect(); return [l.dataset.text.slice(0, 12), +r.y.toFixed(1), +r.bottom.toFixed(1)]; }) }; })));
  const g1 = await geo(); log(tag, "geo before/after open", JSON.stringify(g0), JSON.stringify(g1));
  // ---- hint appears: does the page move?
  await page.keyboard.type("ř", { delay: 30 }); await page.waitForTimeout(3500);
  const g2 = await geo(); log(tag, "geo with hint", JSON.stringify(g2));
  const s2 = await state(page); log(tag, "hint", JSON.stringify(s2.hint), "status", s2.status, "hl", s2.hl);
  await page.screenshot({ path: SHOTS + `hint-middle-line-${tag}.png` });
  // which lines does the hint overlap (ink)?
  log(tag, "hint overlaps", JSON.stringify(await page.evaluate(() => { const h = document.querySelector("[data-testid=line-missing]").getBoundingClientRect(); return [...document.querySelectorAll("[data-testid=line]")].map((l) => { const r = l.getBoundingClientRect(); const ox = Math.min(r.right, h.right) - Math.max(r.left, h.left), oy = Math.min(r.bottom, h.bottom) - Math.max(r.top, h.top); return ox > 0 && oy > 0 ? [l.dataset.text.slice(0, 16), +ox.toFixed(0), +oy.toFixed(1)] : null; }).filter(Boolean); })));
  // ---- Tab order
  const foc = () => page.evaluate(() => { const a = document.activeElement; return (a.dataset.testid || a.tagName) + ":" + (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 24) + " boxOpen=" + !!document.querySelector("[data-testid=line-input]"); });
  await page.getByTestId("line-input").focus(); const seq = [];
  await page.keyboard.press("Tab"); seq.push("Tab→" + await foc()); await page.keyboard.press("Shift+Tab"); seq.push("Shift+Tab→" + await foc());
  await page.keyboard.press("Tab"); seq.push("Tab→" + await foc()); await page.keyboard.press("Tab"); seq.push("Tab→" + await foc());
  await page.keyboard.press("Enter"); await page.waitForTimeout(1500); seq.push("Enter(pick)→" + await foc() + " picks=" + JSON.stringify((await state(page)).hint?.btns));
  await page.keyboard.press("Tab"); await page.waitForTimeout(2500); seq.push("Tab past last→" + await foc());
  log(tag, "tab order", JSON.stringify(seq)); const s3 = await state(page); log(tag, "after tab-out", JSON.stringify({ box: s3.box && s3.box.text.slice(0, 30), notice: s3.notice, lines: s3.lines[2] }));
  const snap = await page.locator("body").ariaSnapshot(); log(tag, "stand-in notice", snap.split("\n").filter((x) => /isn’t|Using|Change|own font/.test(x)).map((x) => x.trim()).join(" || "));
  await page.screenshot({ path: SHOTS + `after-tab-out-${tag}.png` });
  log(tag, "geo end", JSON.stringify(await geo()));
  // ---- hint on other lines: heading, first line start, in full., table
  for (const [re, frac] of [[/^Service/, 0.5], [/^This agreement/, 0.05], [/^This agreement/, 0.6], [/^in full/, 0.95], [/^Total amount/, 0.5], [/^Item/, 0.9], [/^non-refundable/, 0.9]]) {
    if (await page.getByTestId("line-input").count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(500); }
    const o = page.getByRole("option", { name: re }); const b = await o.boundingBox(); await tap(b.x + b.width * frac, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(400);
    await page.keyboard.type("ř"); await page.waitForTimeout(2500);
    const r = await page.evaluate(() => { const hE = document.querySelector("[data-testid=line-missing]"); if (!hE) return null; const h = hE.getBoundingClientRect(); const el = document.querySelector("[data-testid=line-input]"); const e = el.getBoundingClientRect(); let cr = null; try { for (const [, v] of CSS.highlights) for (const rg of v) { cr = rg.getBoundingClientRect(); break; } } catch {} const ov = [...document.querySelectorAll("[data-testid=line]")].map((l) => { const r = l.getBoundingClientRect(); const ox = Math.min(r.right, h.right) - Math.max(r.left, h.left), oy = Math.min(r.bottom, h.bottom) - Math.max(r.top, h.top); return ox > 0 && oy > 0 ? l.dataset.text.slice(0, 14) + " " + ox.toFixed(0) + "x" + oy.toFixed(0) : null; }).filter(Boolean); return { side: hE.dataset.side, hint: [h.x, h.y, h.width, h.height].map(Math.round), box: [e.x, e.y, e.width, e.height].map(Math.round), charX: cr && Math.round(cr.x), overBox: Math.max(0, Math.min(e.bottom, h.bottom) - Math.max(e.top, h.top)) > 0 && Math.min(e.right, h.right) - Math.max(e.left, h.left) > 0 ? +(Math.min(e.bottom, h.bottom) - Math.max(e.top, h.top)).toFixed(1) : 0, overlapsLineRects: ov, text: hE.innerText.replace(/\n/g, "|") }; });
    log(tag, "hint@", String(re), frac, JSON.stringify(r));
    await page.screenshot({ path: SHOTS + `hint-${String(re).replace(/\W/g, "")}-${String(frac).replace(".", "")}-${tag}.png` });
  }
  log(tag, "errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)).slice(0, 300));
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
