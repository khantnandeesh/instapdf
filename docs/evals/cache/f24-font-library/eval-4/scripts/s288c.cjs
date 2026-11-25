const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
const same = { arabic: " جديد ظ", hindi: " नया झ", hebrew: " חדש ץ", bengali: " নতুন ঝ", tamil: " புதிய ஞ", thai: " ใหม่ ฬ" };
const cross = { hindi: " নতুন", hebrew: " جديد", bengali: " ใหม่", tamil: " नया", thai: " নতুন", arabic: " חדש" };
const kind = (t) => /[ऀ-ॿ]/.test(t) ? "hindi" : /[؀-ۿ]/.test(t) ? "arabic" : /[֐-׿]/.test(t) ? "hebrew" : /[ঀ-৿]/.test(t) ? "bengali" : /[஀-௿]/.test(t) ? "tamil" : /[฀-๿]/.test(t) ? "thai" : null;
(async () => {
  for (const mode of ["same", "cross"]) {
    const { browser, page, reqs } = await open({ ctx: { viewport: { width: 1280, height: 1500 } } }); await load(page, process.env.FXD + "/ac288-scripts2.pdf"); await install(page);
    const lines = await page.getByTestId("line").evaluateAll((ls) => ls.map((l) => { const r = l.getBoundingClientRect(); return [l.dataset.text, Math.round(r.y), Math.round(r.width)]; }));
    if (mode === "same") log("lines", JSON.stringify(lines));
    // visual rows: cluster by y within 40px; pick the widest piece
    const rows = []; for (const [i, l] of lines.entries()) { const r = rows.find((x) => Math.abs(x.y - l[1]) < 40); if (r) { if (l[2] > r.w) { r.i = i; r.w = l[2]; } } else rows.push({ y: l[1], i, w: l[2] }); }
    const FONT = ["Kufi", "Nastaliq", "Amiri(Naskh)", "SansArabic", "SansDeva", "SerifDeva", "SerifHebrew", "SansHebrew", "SerifBengali", "SansTamil", "SerifThai"];
    for (const [ri, r] of rows.entries()) { const k = kind(lines[r.i][0]); const txt = (mode === "same" ? same : cross)[k]; const o = page.getByTestId("line").nth(r.i); const b = await o.boundingBox(); if (!b) continue; const m = reqs.length;
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); const ok = await page.getByTestId("line-input").waitFor({ timeout: 8000 }).then(() => true).catch(() => false); if (!ok) { log(mode, FONT[ri], "did not open"); continue; }
      await page.waitForTimeout(1200); const s0 = await state(page); await page.keyboard.press("End"); await page.keyboard.insertText(txt); await page.waitForTimeout(4500); const s1 = await state(page);
      await page.screenshot({ path: SHOTS + `ac288-docfont-${mode}-${ri}-${FONT[ri].replace(/\W/g, "")}-typed-1280.png` });
      await page.keyboard.press("Enter"); await page.waitForTimeout(3500); const s2 = await state(page); const snap = await page.locator("body").ariaSnapshot();
      log(mode, ri, FONT[ri], JSON.stringify({ face: s0.box && s0.box.face, typed: txt, hint: s1.hint && s1.hint.text, btns: s1.hint && s1.hint.btns, status: s1.status, kept: s2.box && s2.box.text.slice(-8), notice: s2.notice && s2.notice.text, standin: snap.split("\n").filter((x) => /isn’t|Using/.test(x)).map((x) => x.trim()), woff: reqs.slice(m).filter((q) => q.u && /woff/.test(q.u)).map((q) => q.u.split("/fonts/")[1]) }));
      if (s2.box) { await page.keyboard.press("Escape"); await page.waitForTimeout(600); }
      const dn = page.getByTestId("editor-notice").getByRole("button", { name: "Dismiss" }); if (await dn.count()) await dn.first().click().catch(() => {});
    }
    await page.screenshot({ path: SHOTS + `ac288-docfont-${mode}-saved-1280.png` });
    const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs(`out/s288c-${mode}.pdf`);
    log(mode, "errors", JSON.stringify(reqs.filter((q) => q.console || q.pageerror)).slice(0, 400), "non-GET", reqs.filter((q) => q.u && q.m !== "GET").length); await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
