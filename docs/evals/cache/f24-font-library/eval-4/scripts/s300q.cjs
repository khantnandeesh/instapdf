// AC-300 on named-only lines: is the letter marked as typed, and how fast does Enter answer? Also the same texts on an embedded line for comparison.
const { open, load, log, SHOTS, FX } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => { const phone = process.env.PHONE === "1"; const tag = phone ? "390" : "1280";
  const CASES = [[process.env.FXD + "/ac283-named-only.pdf", 0, "arial-named"], [FX + "std14-reportlab.pdf", 1, "std14-helvetica"], [process.env.FXD + "/ac283-named-only.pdf", 16, "georgia-named"], [FX + "chrome-justified-mixed.pdf", /^in full/, "embedded-libserif"]];
  for (const [file, which, label] of CASES) for (const txt of [" ⸘", " नया", " नया ใหม่", " नया ⸘ ok", " ř"]) {
    if (process.env.ONLY && !label.includes(process.env.ONLY)) continue;
    const { browser, page, reqs } = await open({ phone, ctx: phone ? {} : { viewport: { width: 1280, height: 1100 } } }); await load(page, file); await install(page);
    const o = typeof which === "number" ? page.getByTestId("line").nth(which) : page.getByRole("option", { name: which }); await o.scrollIntoViewIfNeeded().catch(() => {}); const b = await o.boundingBox(); const before = await o.getAttribute("data-text");
    phone ? await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(800); await page.keyboard.press("End");
    const tT = Date.now(); await page.keyboard.insertText(txt); let markMs = null, btnMs = null, s = null;
    for (let k = 0; k < 120; k++) { s = await state(page); if (markMs == null && (s.hl.some((h) => h.length > 8) || s.box.missing)) markMs = Date.now() - tT; if (s.hint && (s.hint.btns.length || /own font|No font/.test(s.hint.text))) { btnMs = Date.now() - tT; break; } await page.waitForTimeout(50); }
    await page.waitForTimeout(1200); s = await state(page);
    log(tag, label, JSON.stringify(txt), "typed:", JSON.stringify({ markMs, btnMs, missing: s.box.missing, hl: s.hl, hint: s.hint && s.hint.text, btns: s.hint && s.hint.btns, status: s.status, focused: s.box.focused }));
    if (txt === " ⸘" || txt === " नया ⸘ ok") await page.screenshot({ path: SHOTS + `ac300-${label}-typed-${txt.length}-${tag}.png` });
    const idx = await page.getByTestId("line").evaluateAll((ls, t) => ls.findIndex((l) => l.dataset.text === t), before);
    await page.keyboard.press("Enter"); const t0 = Date.now(); let last = "", tl = [], answered = null, boxGoneAt = null;
    while (Date.now() - t0 < 9000) { const st = await state(page); const snap = await page.locator("body").ariaSnapshot(); const standin = snap.split("\n").filter((x) => /isn’t|Using/.test(x)).map((x) => x.trim())[0];
      const lineNow = st.lines.find((l) => l.endsWith(txt.slice(-6))); const k = JSON.stringify({ box: st.box ? st.box.text.slice(-8) : null, notice: st.notice && st.notice.text.slice(0, 110), saved: !!lineNow, standin });
      if (k !== last) { tl.push("+" + (Date.now() - t0) + " " + k); last = k; }
      if (!st.box && boxGoneAt == null) boxGoneAt = Date.now() - t0;
      if (answered == null && (lineNow && !st.box || (st.notice && /has no|still in the box|couldn/.test(st.notice.text)))) answered = Date.now() - t0;
      if (answered != null && Date.now() - t0 > answered + 1200) break; await page.waitForTimeout(40); }
    log(tag, label, JSON.stringify(txt), "Enter: answered ms", answered, "boxGoneAt", boxGoneAt, "timeline", tl.join("  "));
    if (txt === " ⸘" || txt === " नया ⸘ ok") await page.screenshot({ path: SHOTS + `ac300-${label}-enter-${txt.length}-${tag}.png` });
    const st = await state(page);
    if (!st.box) { const dl = page.waitForEvent("download", { timeout: 8000 }).catch(() => null); await page.getByTestId("download").click(); const d = await dl; if (d) await d.saveAs(`out/s300q-${label}-${txt.length}-${tag}.pdf`); }
    log(tag, label, JSON.stringify(txt), "font files fetched", JSON.stringify([...new Set(reqs.filter((r) => r.u && /woff/.test(r.u)).map((r) => r.u.split("/fonts/")[1]))].slice(0, 12)), "sig", reqs.filter((r) => r.u && /index\/sig\//.test(r.u)).length, "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length);
    await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
