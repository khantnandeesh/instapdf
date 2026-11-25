const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => {
  for (const phone of [false, true]) { const tag = phone ? "390" : "1280";
  const { browser, page, reqs } = await open({ phone }); await load(page, "latex-type1c.pdf"); await install(page);
  const tap = (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
  log(tag, "lines", JSON.stringify(await page.getByTestId("line").evaluateAll((ls) => ls.map((l) => l.dataset.text))));
  await page.screenshot({ path: SHOTS + `ac298-cff-before-${tag}.png` });
  const o = page.getByTestId("line").nth(0); const b = await o.boundingBox(); await tap(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(800);
  if (!phone) await page.mouse.move(5, 5);
  await page.screenshot({ path: SHOTS + `ac298-cff-ligature-line-open-${tag}.png` });
  log(tag, "open", JSON.stringify((await state(page)).box));
  if (!phone) {
  await page.keyboard.press("End"); await page.keyboard.type(" Ok", { delay: 40 }); await page.waitForTimeout(1500); log("typed", JSON.stringify((await state(page)).hint));
  await page.keyboard.press("Enter"); await page.waitForTimeout(3000); const s = await state(page); log("after Enter", JSON.stringify({ box: s.box && s.box.text, notice: s.notice, l0: s.lines[0] }));
  const snap = await page.locator("body").ariaSnapshot(); log("notice", snap.split("\n").filter((x) => /isn’t|Using|Change/.test(x)).map((x) => x.trim()).join(" || "));
  await page.screenshot({ path: SHOTS + `ac298-cff-ligature-line-saved-${tag}.png` });
  // footnote line
  const o2 = page.getByRole("option", { name: /^A footnote/ }); const b2 = await o2.boundingBox(); await tap(b2.x + b2.width * 0.5, b2.y + b2.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(800); await page.mouse.move(5, 5);
  await page.screenshot({ path: SHOTS + `ac298-cff-footnote-line-open-${tag}.png`, clip: { x: b2.x - 60, y: b2.y - 60, width: 700, height: 150 } });
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs(`out/s7-cff.pdf`);
  }
  await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
