const { open, load, log } = require("./lib.cjs");
(async () => {
  const { browser, page } = await open({}); await load(page, "chrome-justified-mixed.pdf");
  const o = page.getByRole("option", { name: /^in full/ }); const b = await o.boundingBox(); await page.mouse.click(b.x + b.width - 3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.keyboard.press("End");
  await page.keyboard.insertText(" ⸘"); await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__ev = []; const oc = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { window.__ev.push("input.click() type=" + this.type + " connected=" + this.isConnected); return oc.call(this); }; for (const t of ["keydown", "keyup", "click", "focusout"]) document.addEventListener(t, (e) => window.__ev.push(t + ":" + (e.key || "") + "@" + (e.target.dataset?.testid || e.target.tagName) + (e.defaultPrevented ? " prevented" : "")), true); });
  await page.keyboard.press("Tab"); await page.waitForTimeout(200); await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
  log("keyboard path events", JSON.stringify(await page.evaluate(() => window.__ev)));
  await page.evaluate(() => { window.__ev = []; });
  const fc = page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null); await page.getByTestId("line-missing-own").click(); log("mouse chooser", !!(await fc)); log("mouse path events", JSON.stringify(await page.evaluate(() => window.__ev)));
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
