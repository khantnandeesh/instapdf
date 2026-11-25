// AC-312 with a mix: one missing letter that library fonts have and one that no font here has, in the same edit
const { open, load, log, SHOTS, FX } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => { for (const phone of [false, true]) { const tag = phone ? "390" : "1280";
  for (const [file, which, label] of [[FX + "chrome-justified-mixed.pdf", /^in full/, "embedded"], [process.env.FXD + "/ac283-named-only.pdf", 0, "arial-named"]]) for (const txt of [" ř ⸘", " ⸘ ř", " Ω ⸘", " ⸘ ⸙"]) {
    const { browser, page } = await open({ phone }); await load(page, file); await install(page);
    const o = typeof which === "number" ? page.getByTestId("line").nth(which) : page.getByRole("option", { name: which }); const b = await o.boundingBox();
    phone ? await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(600); await page.keyboard.press("End");
    await page.keyboard.insertText(txt); await page.waitForTimeout(4500); const s = await state(page);
    log(tag, label, JSON.stringify(txt), "typed:", JSON.stringify({ missing: s.box.missing, hint: s.hint && s.hint.text, btns: s.hint && s.hint.btns, status: s.status }));
    await page.screenshot({ path: SHOTS + `ac312-mix-${label}-${txt.trim().replace(/\s/g, "_")}-typed-${tag}.png` });
    await page.keyboard.press("Enter"); const t0 = Date.now(); let ans = null, last = "", tl = [];
    while (Date.now() - t0 < 8000) { const st = await state(page); const k = JSON.stringify({ box: !!st.box, notice: st.notice && st.notice.text.slice(0, 120), saved: st.lines.some((l) => l.endsWith(txt.slice(-3))) }); if (k !== last) { tl.push("+" + (Date.now() - t0) + " " + k); last = k; } if (ans == null && (st.notice || (!st.box && st.lines.some((l) => l.endsWith(txt.slice(-3)))))) ans = Date.now() - t0; if (ans != null && Date.now() - t0 > ans + 1000) break; await page.waitForTimeout(40); }
    const s2 = await state(page); log(tag, label, JSON.stringify(txt), "Enter answered ms", ans, tl.join("  "), "| hint after:", JSON.stringify(s2.hint && s2.hint.text));
    await page.screenshot({ path: SHOTS + `ac312-mix-${label}-${txt.trim().replace(/\s/g, "_")}-enter-${tag}.png` });
    await browser.close(); } }
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
