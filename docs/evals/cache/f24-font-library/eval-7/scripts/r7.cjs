// Seventh evaluation (narrow re-check of AC-312). One generic runner built on the sixth run's s292n.cjs / s292e.cjs / s312q.cjs / s312o.cjs / axe2.cjs.
// For each case: open a line, type, (add the person's own font), report hint, buttons (* = in use), status and the fonts the browser REALLY draws each text node of the box in
// (CDP CSS.getPlatformFontsForNode, with glyph counts), run axe on the hint state, press Enter and time Enter -> text on the line, report the notice, optionally a second edit, download.
// SUF=<suffix> is added to the output name on repeat passes (timings).
// Run from a work folder that has out/ and fx/ (FXD=$PWD/fx). CASES=<comma list of case names> limits the run. Output: out/r7-<case>.pdf, shots r7-<case>-*.png.
const { chromium, BASE, log, SHOTS, FX } = require("./lib.cjs"); const { install, state } = require("./st.cjs"); const fs = require("fs");
const axeSrc = fs.readFileSync("/home/user/instapdf/node_modules/.pnpm/axe-core@4.14.1/node_modules/axe-core/axe.min.js", "utf8");
const SIZES = { 1280: { viewport: { width: 1280, height: 800 } }, 390: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 320: { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true } };
const NAMED = process.env.FXD + "/ac283-named-only.pdf", EMB = FX + "chrome-justified-mixed.pdf";
// name, file, first line (index or name pattern), text, add own font?, pick the added font's button?, second edit [line, text] or null
const C = [];
for (const tag of ["1280", "390", "320"]) { C.push([`nA-${tag}`, NAMED, 0, " ř ⸘", true, false, null, tag]); C.push([`nB-${tag}`, NAMED, 0, " Ω ⸘ ok", true, false, null, tag]); }
for (const tag of ["1280", "390"]) { C.push([`nD-${tag}`, NAMED, 0, " ⸘", true, false, [1, " ř Ω"], tag]); C.push([`nE-${tag}`, NAMED, 0, " ř Ω", false, false, null, tag]); }
C.push(["nC-1280", NAMED, 0, " ⸘", true, false, [0, " ř Ω"], "1280"]);
C.push(["nN-1280", NAMED, 0, " नया ⸘ ok", true, false, null, "1280"]);
C.push(["nP-1280", NAMED, 0, " ř ⸘", true, true, null, "1280"]);
for (const tag of ["1280", "390"]) { C.push([`eA-${tag}`, EMB, /^in full/, " ř ⸘", true, false, null, tag]); C.push([`eN-${tag}`, EMB, /^in full/, " नया ⸘ ok", true, false, null, tag]); }
C.push(["eP-1280", EMB, /^in full/, " ř ⸘", true, true, null, "1280"]);
C.push(["nT-1280", NAMED, 2, " ř ⸘", true, false, null, "1280"]); // another named-only font (the second text line of the fixture)
C.push(["eD-1280", EMB, /^in full/, " ⸘", true, false, [/^Total amount/, " ř Ω"], "1280"]);
(async () => { const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } }); const only = process.env.CASES ? process.env.CASES.split(",") : null; const axeAll = {};
  for (const [name, file, which, first, own, pick, second, tag] of C) { if (only && !only.includes(name)) continue;
    const phone = tag !== "1280"; const ctx = await browser.newContext({ deviceScaleFactor: 2, acceptDownloads: true, ...SIZES[tag] }); const page = await ctx.newPage(); const reqs = []; page.on("request", (r) => reqs.push({ m: r.method(), u: r.url() }));
    const cdp = await ctx.newCDPSession(page); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    // every text node of the box that holds a non-ASCII letter (or all, if all=true): its text and the platform fonts that draw it
    const platform = async (all) => { await cdp.send("DOM.getDocument", { depth: 0 }); const { result } = await cdp.send("Runtime.evaluate", { expression: `(() => { const el = document.querySelector("[data-testid=line-input]"); if (!el) return 0; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; window.__tn = []; while ((n = w.nextNode())) if (${all ? "true" : "/[^\\x00-\\x7f]/.test(n.textContent)"}) window.__tn.push(n); return window.__tn.length; })()` }); const out = [];
      for (let i = 0; i < result.value; i++) { const r = await cdp.send("Runtime.evaluate", { expression: `window.__tn[${i}]` }); const txt = (await cdp.send("Runtime.evaluate", { expression: `window.__tn[${i}].textContent` })).result.value; const { nodeId } = await cdp.send("DOM.requestNode", { objectId: r.result.objectId }); const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId }); out.push(JSON.stringify(txt.slice(-14)) + " = " + fonts.map((f) => `${f.familyName}${f.isCustomFont ? "(web)" : "(system)"}x${f.glyphCount}`).join(" + ")); } return out.join(" ; "); };
    const axe = async (st) => { await page.evaluate(axeSrc); const r = await page.evaluate(async () => { const r = await axe.run(document, { resultTypes: ["violations"] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].html.slice(0, 160) })); }); axeAll[name + " " + st] = r; log(name, "axe", st, JSON.stringify(r)); };
    await page.goto(BASE + "/edit-pdf", { waitUntil: "networkidle", timeout: 90000 }); await page.locator('input[type="file"]').first().setInputFiles(file); await page.waitForTimeout(4000); await install(page);
    const endBox = async () => page.evaluate(() => [...document.querySelectorAll("[data-testid=line]")].map((l) => { const r = l.getBoundingClientRect(); return l.dataset.text.slice(-8) + "@" + [r.x, r.y, r.width].map((v) => v.toFixed(1)).join(","); }).slice(0, 3));
    const openLine = async (w) => { const o = typeof w === "number" ? page.getByTestId("line").nth(w) : page.getByRole("option", { name: w }); const b = await o.boundingBox(); const t = await o.getAttribute("data-text"); phone ? await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(600); return [t, b]; };
    const enter = async (txt) => { await page.locator("[data-testid=line-input]").focus(); await page.keyboard.press("Enter"); const t0 = Date.now(); let done = null, st;
      while (Date.now() - t0 < 8000) { st = await state(page); if (!st.box && st.lines.some((l) => l.includes(txt.trim()))) { done = Date.now() - t0; break; } await page.waitForTimeout(40); }
      await page.waitForTimeout(2500); st = await state(page); const snap = await page.locator("body").ariaSnapshot();
      return { enterToSavedMs: done, boxStillOpen: !!st.box, notice: st.notice && st.notice.text.slice(0, 200), standin: [...new Set(snap.split("\n").filter((x) => /isn’t|Using/.test(x)).map((x) => x.trim()))], status: st.status, hint: st.hint && st.hint.text }; };
    const before = await endBox(); const [t0, b0] = await openLine(which); let s = await state(page);
    log(name, tag, "opened:", JSON.stringify(t0.slice(-30)), "line w", b0.width.toFixed(1), "box w", s.box && s.box.r[2], "| box fonts (all nodes):", await platform(true));
    await page.keyboard.press("End"); await page.keyboard.insertText(first); await page.waitForTimeout(3500); s = await state(page);
    log(name, "typed", JSON.stringify(first), "| hint:", s.hint && s.hint.vis && s.hint.text, "| btns:", s.hint && JSON.stringify(s.hint.btns), "| status:", s.status, "| box fonts:", await platform());
    if (s.hint && s.hint.vis) await axe("hint");
    if (own) { const btn = page.getByRole("button", { name: /own font|Your font/ }).first(); const fc = page.waitForEvent("filechooser", { timeout: 6000 }).catch(() => null); phone ? await btn.tap() : await btn.click(); const ch = await fc; if (!ch) { log(name, "NO chooser"); await ctx.close(); continue; } await ch.setFiles(process.env.FXD + "/own-dejavu.ttf"); await page.waitForTimeout(2500); s = await state(page);
      log(name, "own font added | hint:", s.hint && s.hint.vis && s.hint.text, "| btns:", s.hint && JSON.stringify(s.hint.btns), "| hint rect", s.hint && JSON.stringify(s.hint.r), "| status:", s.status, "| box fonts:", await platform());
      await page.screenshot({ path: SHOTS + `r7-${name}-box.png` }); if (s.hint && s.hint.vis) await axe("own-font-added"); }
    if (pick) { const d = page.getByTestId("line-missing").getByRole("button", { name: /DejaVu/ }); phone ? await d.tap() : await d.click(); await page.waitForTimeout(1500); s = await state(page); log(name, "picked DejaVu | hint:", s.hint && s.hint.text, "| btns:", s.hint && JSON.stringify(s.hint.btns), "| status:", s.status, "| box fonts:", await platform()); await page.screenshot({ path: SHOTS + `r7-${name}-picked.png` }); if (s.hint && s.hint.vis) await axe("picked"); }
    let r = await enter(first); log(name, "after Enter:", JSON.stringify(r), "| lines:", JSON.stringify(await endBox()), "| before:", JSON.stringify(before));
    await page.mouse.move(5, 5); await page.screenshot({ path: SHOTS + `r7-${name}-saved.png` });
    if (second && !r.boxStillOpen) { const [t1] = await openLine(second[0]); await page.keyboard.press("End"); await page.keyboard.insertText(second[1]); await page.waitForTimeout(3500); s = await state(page);
      log(name, "second edit", JSON.stringify(second[1]), "on", String(second[0]), JSON.stringify(t1.slice(-30)), "| hint:", s.hint && s.hint.vis && s.hint.text, "| btns:", s.hint && JSON.stringify(s.hint.btns), "| status:", s.status, "| box fonts:", await platform());
      await page.screenshot({ path: SHOTS + `r7-${name}-box2.png` }); if (s.hint && s.hint.vis) await axe("second-hint");
      r = await enter(second[1]); log(name, "after second Enter:", JSON.stringify(r)); await page.mouse.move(5, 5); await page.screenshot({ path: SHOTS + `r7-${name}-saved2.png` }); }
    if (!r.boxStillOpen) { const dl = page.waitForEvent("download", { timeout: 10000 }).catch(() => null); await page.getByTestId("download").click(); const d = await dl; if (d) await d.saveAs(`out/r7-${name}${process.env.SUF || ""}.pdf`); else log(name, "no download"); }
    log(name, "non-GET requests", reqs.filter((q) => q.m !== "GET").length, "| font requests", JSON.stringify([...new Set(reqs.filter((q) => /\/fonts\//.test(q.u)).map((q) => q.u.split("/").slice(-1)[0].slice(0, 40)))].slice(0, 12)));
    await ctx.close(); }
  await browser.close(); fs.writeFileSync(`out/axe-${process.env.TAGOUT || "r7"}.json`, JSON.stringify(axeAll, null, 1));
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
