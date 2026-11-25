const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => { for (const phone of [false, true]) { const tag = phone ? "390" : "1280";
  for (const [file, idx, label] of [[__dirname + "/fx/ac283-named-only.pdf", 0, "arial-named"], ["std14-reportlab.pdf", 1, "std14-helvetica"]]) {
  const { browser, page, reqs } = await open({ phone }); await load(page, file); await install(page);
  const o = page.getByTestId("line").nth(idx); const b = await o.boundingBox(); phone ? await page.touchscreen.tap(b.x + b.width - 3, b.y + b.height / 2) : await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
  await page.keyboard.insertText(" नया ใหม่ ⸘"); await page.waitForTimeout(5000); const s = await state(page);
  log(tag, label, JSON.stringify({ box: s.box && { text: s.box.text.slice(-14), missing: s.box.missing, under: s.box.under, face: s.box.face }, hint: s.hint, status: s.status, hl: s.hl }));
  log(tag, label, "rendered fonts of typed part", JSON.stringify(await page.evaluate(() => { const el = document.querySelector("[data-testid=line-input]"); return [...el.querySelectorAll("span")].slice(-3).map((x) => x.textContent.slice(-8) + " :: " + getComputedStyle(x).fontFamily.slice(0, 70)); })));
  await page.screenshot({ path: SHOTS + `ac300-${label}-other-script-typed-${tag}.png` });
  await page.keyboard.press("Enter"); await page.waitForTimeout(3500); const s2 = await state(page); const snap = await page.locator("body").ariaSnapshot();
  log(tag, label, "after Enter", JSON.stringify({ box: s2.box && s2.box.text.slice(-14), notice: s2.notice && s2.notice.text, standin: snap.split("\n").filter((x) => /isn’t|Using/.test(x)).map((x) => x.trim())[0], hint: s2.hint && s2.hint.text }));
  await page.screenshot({ path: SHOTS + `ac300-${label}-other-script-enter-${tag}.png` });
  await browser.close(); } } })().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
