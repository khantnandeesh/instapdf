// Sixth evaluation, AC-312 after "Use your own font" in the mixed case. For each text, line kind and size:
//  - hint text, buttons (pressed or not), status, before and after the font is added;
//  - which real font draws each glyph of the box (CDP CSS.getPlatformFontsForNode: family, web font or system font, glyph count), per text node that holds a missing letter;
//  - hint geometry: every button and span inside the row's own rectangle and inside the screen; elements that cut their text (scrollWidth > clientWidth) and whether they show an ellipsis; U+25CC or "…" in the letters;
//  - accessible name against the visible words of each hint button;
//  - Enter: time until the line shows the text, what is on screen meanwhile; the notice; the download.
// ADD=first adds the font before anything is typed (from the font menu is not used: the hint's own button after a lone "⸘", then the text is replaced).
const { chromium, BASE, log, SHOTS, FX } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
const SIZES = { 1280: { viewport: { width: 1280, height: 800 } }, 390: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 320: { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true } };
const TEXTS = process.env.TEXTS ? JSON.parse(process.env.TEXTS) : [" ř ⸘", " नया ⸘ ok", " Ω ⸘ ok", " ř ⸘ Ω ⸙"];
const LINES = [[FX + "chrome-justified-mixed.pdf", /^in full/, "embedded"], [process.env.FXD + "/ac283-named-only.pdf", 0, "arial-named"]];
const OWNF = process.env.OWNF || "own-dejavu.ttf";
const geoFn = () => { const h = document.querySelector("[data-testid=line-missing]"); if (!h) return null; const r = h.getBoundingClientRect();
  const kids = [...h.querySelectorAll("button, span, b, strong, em, i")].filter((e) => e.getBoundingClientRect().width > 0);
  const outRow = kids.filter((e) => { const q = e.getBoundingClientRect(); return q.left < r.left - 0.5 || q.right > r.right + 0.5 || q.top < r.top - 0.5 || q.bottom > r.bottom + 0.5; }).map((e) => e.textContent.trim().slice(0, 24) + " [" + [q(e).left, q(e).right].map(Math.round) + "] row [" + [r.left, r.right].map(Math.round) + "]");
  function q(e) { return e.getBoundingClientRect(); }
  const outScreen = kids.filter((e) => q(e).right > innerWidth + 0.5 || q(e).left < -0.5).map((e) => e.textContent.trim().slice(0, 24));
  const cut = [h, ...h.querySelectorAll("*")].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible").map((e) => ({ t: (e.textContent || "").trim().slice(0, 40), sw: e.scrollWidth, cw: e.clientWidth, ellipsis: getComputedStyle(e).textOverflow, tag: e.tagName, cls: (e.className || "").toString().slice(0, 40) }));
  const btns = [...h.querySelectorAll("button")].map((b) => ({ vis: b.innerText.trim().replace(/\s+/g, " "), aria: b.getAttribute("aria-label"), title: b.getAttribute("title"), pressed: b.getAttribute("aria-pressed"), r: [q(b).left, q(b).top, q(b).width, q(b).height].map(Math.round) }));
  return { r: [r.x, r.y, r.width, r.height].map(Math.round), vw: innerWidth, docW: document.documentElement.scrollWidth, rows: new Set(btns.map((b) => b.r[1])).size, outRow, outScreen, cut, btns, bg: getComputedStyle(h).backgroundColor, has25CC: /◌/.test(h.innerText), hasDots: /…|\.\.\./.test(h.innerText), text: h.innerText.replace(/\n/g, " | ") }; };
(async () => { const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  for (const tag of (process.env.SIZES || "1280,390,320").split(",")) for (const [file, which, label] of LINES) for (const txt of TEXTS) {
    if (process.env.ONLY && !label.includes(process.env.ONLY)) continue;
    const phone = tag !== "1280"; const ctx = await browser.newContext({ deviceScaleFactor: 2, acceptDownloads: true, ...SIZES[tag] }); const page = await ctx.newPage(); const reqs = []; page.on("request", (r) => reqs.push({ t: Date.now(), m: r.method(), u: r.url() }));
    const cdp = await ctx.newCDPSession(page); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const platform = async () => { // real fonts per text node of the box that holds a letter outside ASCII, and for the whole box
      await cdp.send("DOM.getDocument", { depth: 0 }); const out = [];
      const { result } = await cdp.send("Runtime.evaluate", { expression: `(() => { const el = document.querySelector("[data-testid=line-input]"); if (!el) return []; const a = [el]; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (/[^\\x00-\\x7f\\u2018\\u2019\\u201c\\u201d]/.test(n.textContent)) a.push(n); return a; })()` });
      const { result: props } = await cdp.send("Runtime.getProperties", { objectId: result.objectId, ownProperties: true });
      for (const p of props) { if (!/^\d+$/.test(p.name)) continue; try { const { nodeId } = await cdp.send("DOM.requestNode", { objectId: p.value.objectId }); const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId }); const d = await cdp.send("Runtime.callFunctionOn", { objectId: p.value.objectId, functionDeclaration: "function(){ return this.nodeType === 3 ? JSON.stringify(this.textContent.slice(-14)) + ' css:' + getComputedStyle(this.parentElement).fontFamily.slice(0, 120) : 'BOX' }", returnByValue: true }); out.push(d.result.value + " => " + fonts.map((f) => `${f.familyName}${f.isCustomFont ? "(web)" : "(system)"}x${f.glyphCount}`).join(", ")); } catch (e) { out.push("err " + String(e).slice(0, 80)); } }
      const extra = await page.evaluate(() => { const el = document.querySelector("[data-testid=line-input]"); if (!el) return null; const host = el.parentElement; return { face: el.dataset.face, faces: el.dataset.faces, style: (el.getAttribute("style") || "").slice(0, 200), overlay: host ? [...host.querySelectorAll("canvas, svg")].map((c) => c.tagName + " " + Math.round(c.getBoundingClientRect().width) + "x" + Math.round(c.getBoundingClientRect().height)).slice(0, 4) : [], color: getComputedStyle(el).color, fill: getComputedStyle(el).webkitTextFillColor, docFonts: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family).filter((f) => /dejavu|own|user|upload/i.test(f)).slice(0, 6) }; });
      return { nodes: out, extra }; };
    await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle", timeout: 90000 }); await page.locator('input[type="file"]').first().setInputFiles(file); await page.waitForTimeout(4000); await install(page);
    const o = typeof which === "number" ? page.getByTestId("line").nth(which) : page.getByRole("option", { name: which }); await o.scrollIntoViewIfNeeded().catch(() => {}); const b = await o.boundingBox();
    phone ? await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(600); await page.keyboard.press("End");
    await page.keyboard.insertText(txt); await page.waitForTimeout(4000); let s = await state(page); const nm = txt.trim().replace(/\s/g, "_"); const P = [tag, label, JSON.stringify(txt)];
    log(...P, "before:", JSON.stringify({ hint: s.hint && s.hint.text, btns: s.hint && s.hint.btns, status: s.status }));
    const own = page.getByRole("button", { name: /own font|Your font/ }).first(); const n0 = reqs.length; const fc = page.waitForEvent("filechooser", { timeout: 6000 }).catch(() => null); phone ? await own.tap().catch((e) => log("tap err", String(e).slice(0, 120))) : await own.click().catch((e) => log("click err", String(e).slice(0, 120))); const ch = await fc;
    if (!ch) { log(...P, "NO file chooser"); await ctx.close(); continue; }
    await ch.setFiles(process.env.FXD + "/" + OWNF); const tO = Date.now(); let at = null, prev = "", settle = null;
    for (let k = 0; k < 70; k++) { s = await state(page); const cur = JSON.stringify([s.hint && s.hint.text, s.hint && s.hint.btns, s.status]); if (cur !== prev) { prev = cur; settle = Date.now() - tO; } if (at == null && s.hint && s.hint.btns.some((x) => /DejaVu/.test(x))) at = Date.now() - tO; await page.waitForTimeout(50); }
    const geo = await page.evaluate(geoFn); const pf = await platform();
    log(...P, "added: offered after ms", at, "settled ms", settle, JSON.stringify({ box: !!s.box, focused: s.box && s.box.focused, under: s.box && s.box.under, hint: s.hint && s.hint.text, btns: s.hint && s.hint.btns, status: s.status, notice: s.notice && s.notice.text.slice(0, 200), live: s.live }), "non-GET after pick", reqs.slice(n0).filter((r) => r.m !== "GET").length);
    log(...P, "geo:", JSON.stringify(geo)); log(...P, "box fonts:", JSON.stringify(pf));
    await page.screenshot({ path: SHOTS + `ac312r-${label}-${nm}-added-${tag}.png` });
    if (geo) { const pad = 8; const clip = { x: Math.max(0, geo.r[0] - pad), y: Math.max(0, geo.r[1] - 60), width: Math.min(geo.vw - Math.max(0, geo.r[0] - pad), Math.max(geo.r[2] + 200, 400)), height: geo.r[3] + 120 }; await page.screenshot({ path: SHOTS + `ac312r-${label}-${nm}-added-${tag}-hint.png`, clip }).catch((e) => log("clip err", String(e).slice(0, 100))); }
    if (!s.box) { log(...P, "box closed before Enter"); await ctx.close(); continue; }
    await page.locator("[data-testid=line-input]").focus(); const n1 = reqs.length; await page.keyboard.press("Enter"); const t0 = Date.now(); let last = "", tl = [], done = null;
    while (Date.now() - t0 < 12000) { const st = await state(page); const saved = !st.box && st.lines.some((l) => l.endsWith(txt.slice(-3))); const busy = await page.evaluate(() => [...document.querySelectorAll("[aria-busy=true], [role=progressbar], .ed-saving, [data-saving]")].length); const k = JSON.stringify({ box: !!st.box, notice: st.notice && st.notice.text.slice(0, 120), saved, undo: st.undo, busy }); if (k !== last) { tl.push("+" + (Date.now() - t0) + " " + k); last = k; } if (saved && done == null) done = Date.now() - t0; if (done != null && Date.now() - t0 > done + 1200) break; await page.waitForTimeout(30); }
    await page.waitForTimeout(1200); s = await state(page); const snap = await page.locator("body").ariaSnapshot();
    log(...P, "Enter → saved ms", done, "| timeline", tl.join("  "), "| after:", JSON.stringify({ box: !!s.box, notice: s.notice && s.notice.text.slice(0, 200), standin: [...new Set(snap.split("\n").filter((x) => /isn’t|Using|has no/.test(x)).map((x) => x.trim()))].join(" || ").slice(0, 400) }), "| font requests after Enter", JSON.stringify(reqs.slice(n1).filter((r) => /woff|fonts\//.test(r.u)).map((r) => "+" + (r.t - t0) + " " + r.u.split("/").slice(-1)[0].slice(0, 40)).slice(0, 6)), "non-GET total", reqs.filter((r) => r.m !== "GET").length);
    await page.mouse.move(5, 5).catch(() => {}); await page.screenshot({ path: SHOTS + `ac312r-${label}-${nm}-saved-${tag}.png` });
    if (!s.box) { const dl = page.waitForEvent("download", { timeout: 8000 }).catch(() => null); await page.getByTestId("download").click(); const d = await dl; if (d) await d.saveAs(`out/s312r-${label}-${nm}-${tag}.pdf`); else log(...P, "no download"); }
    await ctx.close(); }
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1200)); process.exit(1); });
