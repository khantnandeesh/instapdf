const { open, load, log } = require("./lib.cjs");
const fs = require("fs");
(async () => {
  const { browser, page, reqs } = await open();
  await load(page, "chrome-justified-mixed.pdf");
  const short = (from) => reqs.slice(from).filter(r=>r.u).map((r) => r.m + " " + r.u.replace(/^https:\/\/[^/]+/, "").slice(0, 110) + (r.len ? " body=" + r.len : ""));
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.waitForTimeout(500);
  await page.mouse.click(700, 620);
  await page.waitForTimeout(800);
  await page.keyboard.type("Approved by Dvořák", { delay: 40 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: __dirname + "/out/ex4-esc.png" });
  let snap = await page.locator("body").ariaSnapshot();
  fs.writeFileSync(__dirname + "/out/ex4-aria1.txt", snap);
  console.log(snap.split("\n").slice(60).filter((l) => !/option "/.test(l)).join("\n"));
  // try to find a font control
  const cands = await page.evaluate(() => [...document.querySelectorAll("button,[role=combobox],select,input")].filter((e) => e.offsetParent && /font/i.test((e.getAttribute("aria-label") || "") + (e.getAttribute("data-testid") || "") + e.title)).map((e) => e.outerHTML.slice(0, 300)));
  log("font controls", JSON.stringify(cands, null, 1));
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
