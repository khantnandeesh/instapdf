const { open, load, log } = require("./lib.cjs");
const fs = require("fs");
(async () => {
  const { browser, page, reqs } = await open();
  log("landing reqs", reqs.filter(r=>r.u).length, reqs.filter((r) => r.u && /font|woff|wasm|\.bin|manifest/i.test(r.u)).map((r) => r.u.replace(/^https:\/\/[^/]+/, "")));
  const mark = reqs.length;
  await load(page, "chrome-justified-mixed.pdf");
  log("after load", reqs.slice(mark).filter(r=>r.u).map((r) => r.m + " " + r.u.replace(/^https:\/\/[^/]+/, "").slice(0, 110)));
  await page.screenshot({ path: __dirname + "/out/ex1-loaded.png" });
  const snap = await page.locator("body").ariaSnapshot();
  fs.writeFileSync(__dirname + "/out/ex1-aria.txt", snap);
  fs.writeFileSync(__dirname + "/out/ex1-dom.html", await page.content());
  log(snap.slice(0, 6000));
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
