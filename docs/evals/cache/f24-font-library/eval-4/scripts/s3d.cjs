const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => {
  const phone = process.env.PHONE === "1"; const tag = phone ? "390" : "1280";
  const { browser, page, reqs } = await open({ phone });
  await load(page, "chrome-justified-mixed.pdf"); await install(page);
  const tap = (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
  const brief = async () => { const s = await state(page); return JSON.stringify({ box: s.box && [s.box.text.slice(-12), s.box.focused], notice: s.notice && s.notice.text.slice(0, 60), hint: s.hint && s.hint.vis, l1: s.lines[1].slice(-14), focus: s.focus.slice(0, 26) }); };
  const timeline = async (name, ms = 3000) => { let last = ""; const t0 = Date.now(); while (Date.now() - t0 < ms) { const b = await brief(); if (b !== last) { log(tag, name, "+" + (Date.now() - t0), b); last = b; } await page.waitForTimeout(60); } };
  const refuse = async () => { const o = page.getByRole("option", { name: /^This agreement/ }); const b = await o.boundingBox(); await tap(b.x + b.width * 0.3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(400); await page.keyboard.press("End"); await page.keyboard.type(" for Dvořák", { delay: 30 }); await page.waitForTimeout(1200); await page.keyboard.press("Enter"); await page.waitForTimeout(1800); };
  await refuse(); log(tag, "refused", await brief());
  const nb = await page.getByTestId("editor-notice").getByRole("button", { name: "Dismiss" }).boundingBox();
  await tap(nb.x + nb.width / 2, nb.y + nb.height / 2); await timeline("after Dismiss click", 4000);
  await tap(...(phone ? [200, 500] : [900, 700])); await timeline("after click on blank page", 4000);
  await tap(...(phone ? [200, 560] : [900, 760])); await timeline("after 2nd click on blank", 3000);
  // Escape from elsewhere: focus the zoom/download button
  await page.getByTestId("download").focus(); log(tag, "focus on download", await brief());
  await page.keyboard.press("Escape"); await timeline("Escape with focus on Download", 2500);
  await page.screenshot({ path: SHOTS + `ac310-escape-elsewhere-${tag}.png` });
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
