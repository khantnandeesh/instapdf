const { open, load, log } = require("./lib.cjs");
(async () => { const { browser, page } = await open({ ctx: { viewport: { width: 1280, height: 1150 } } }); await load(page, __dirname + "/fx/ac283-named-only.pdf");
  const o = page.getByTestId("line").nth(0); const b = await o.boundingBox(); log(JSON.stringify(b)); await page.screenshot({ path: "out/dbg.png" });
  log(JSON.stringify(await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.dataset.testid || e.tagName + "." + e.className); }, [b.x + b.width - 3, b.y + b.height / 2])));
  await browser.close(); })();
