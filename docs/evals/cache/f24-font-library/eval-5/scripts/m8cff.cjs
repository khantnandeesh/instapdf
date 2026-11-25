const { open, load, log, SHOTS } = require("./lib.cjs"); const { install, state } = require("./st.cjs");
(async () => { const { browser, page, reqs } = await open({}); await load(page, "latex-type1c.pdf"); await install(page);
  const o = page.getByRole("option", { name: /^Results don/ }); const b = await o.boundingBox(); await page.screenshot({ path: SHOTS + "m5-cff-1-opened-1280.png" });
  await page.mouse.click(b.x + b.width - 30, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(800); await page.screenshot({ path: SHOTS + "m5-cff-1c-clicked-1280.png" });
  await page.keyboard.press("End"); await page.keyboard.type("O", { delay: 100 }); await page.waitForTimeout(3500); const s = await state(page); log("typed", JSON.stringify({ hint: s.hint, status: s.status })); await page.screenshot({ path: SHOTS + "m5-cff-2-typed-1280.png" });
  const t0 = Date.now(); await page.keyboard.press("Enter"); await page.getByRole("option", { name: /^Results don.*O$/ }).waitFor({ timeout: 15000 }).catch(() => log("line not updated")); log("Enter→saved ms", Date.now() - t0); await page.waitForTimeout(1500);
  const snap = await page.locator("body").ariaSnapshot(); log("notice", snap.split("\n").filter((x) => /isn’t|Using|Change|own font/.test(x)).map((x) => x.trim()).join(" || ")); await page.mouse.move(5, 5); await page.screenshot({ path: SHOTS + "m5-cff-3-saved-1280.png" });
  const t1 = Date.now(); const dl = page.waitForEvent("download"); await page.getByTestId("download").click(); await (await dl).saveAs("out/m8-cff-ours.pdf"); log("Download→file ms", Date.now() - t1, "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length);
  await browser.close(); })().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
