const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => {
  const phone = process.env.PHONE === "1"; const tag = phone ? "390" : "1280";
  const { browser, page, reqs } = await open({ phone });
  await load(page, "chrome-justified-mixed.pdf"); await install(page);
  const tap = (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
  const box = page.getByTestId("line-input");
  const samples = { latin: "ř", greek: "Ωμέγα", cyrillic: "Жизнь", hebrew: "שלום", arabic: "سلام", devanagari: "नमस्ते", thai: "สวัสดี", cjk: "漢字", emoji: "😀", pua: "", pua16: "\u{10FFFD}", hiero: "\u{13000}", interrobang: "⸘", tifinagh: "ⴰ", georgian: "ქ", cherokee: "Ꭰ", braille: "⠓", ogham: "ᚁ", rupee: "₹", bitcoin: "₿", turkishlira: "₺" };
  for (const [name, s] of Object.entries(samples)) {
    const d = page.getByRole("option", { name: /^Design/ }); const db = await d.boundingBox();
    await tap(db.x + db.width - 3, db.y + db.height / 2); await box.waitFor(); await page.keyboard.press("End");
    const m = reqs.length;
    await page.keyboard.insertText(" " + s); await page.waitForTimeout(3500);
    const st = await state(page);
    log(tag, name, JSON.stringify({ text: st.box.text, missing: st.box.missing, hl: st.hl, hint: st.hint, status: st.status, focused: st.box.focused, fonts: reqs.slice(m).filter((r) => r.u && /woff/.test(r.u)).map((r) => r.u.split("/fonts/")[1]).slice(0, 6) }));
    if (!phone || /hebrew|pua$|devanagari/.test(name)) await page.screenshot({ path: SHOTS + `ac300-script-${name}-${tag}.png` });
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  }
  log(tag, "errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)), "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length, "hosts", [...new Set(reqs.filter((r) => r.u && /^http/.test(r.u)).map((r) => new URL(r.u).host))]);
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
