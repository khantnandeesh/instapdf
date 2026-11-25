const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => { const { browser, page } = await open({}); await load(page, process.env.FXD + "/ac283-named-only.pdf"); await install(page);
  for (const [idx, txt] of [[0, " नया ⸘ ok"], [2, " ⸘"]]) { const o = page.getByTestId("line").nth(idx); const b = await o.boundingBox(); await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
  await page.keyboard.insertText(txt); await page.waitForTimeout(4000); await page.keyboard.press("Enter"); await page.waitForTimeout(3500); const s2 = await state(page); const snap = await page.locator("body").ariaSnapshot();
  log(idx, JSON.stringify({ box: s2.box && s2.box.text.slice(-14), notice: s2.notice && s2.notice.text, line: s2.lines[idx], ann: s2.ann.slice(-3), standin: snap.split("\n").filter((x) => /isn’t|Using|has no/.test(x)).map((x) => x.trim()) })); }
  await page.mouse.move(5, 5); await page.screenshot({ path: SHOTS + "ac300-arial-named-saved-page-1280.png" });
  const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs("out/s300o.pdf"); await browser.close(); })().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
