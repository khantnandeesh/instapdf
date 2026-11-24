const { open, load, log } = require("./lib.cjs");
const fs = require("fs");
const src = fs.readFileSync("/home/user/instapdf/node_modules/.pnpm/axe-core@4.14.1/node_modules/axe-core/axe.min.js", "utf8");
(async () => {
  const all = {};
  for (const phone of [false, true]) {
    const tag = phone ? "390" : "1280";
    const { browser, page } = await open({ phone });
    const run = async (name) => { await page.evaluate(src); const r = await page.evaluate(async () => { const r = await axe.run(document, { resultTypes: ["violations"] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].html.slice(0, 160), target: String(v.nodes[0].target).slice(0, 80) })); }); all[tag + ":" + name] = r; log(tag, name, JSON.stringify(r.map((v) => v.impact + ":" + v.id + "x" + v.n))); };
    const tap = (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
    await run("landing");
    await load(page, "chrome-justified-mixed.pdf"); await run("editor-open");
    const l = page.getByRole("option", { name: /^This agreement/ }); const b = await l.boundingBox();
    await tap(b.x + b.width * 0.3, b.y + b.height / 2); await page.getByTestId("line-input").waitFor(); await page.waitForTimeout(500); await run("line-open");
    await page.keyboard.press("End"); await page.keyboard.type(" Dvořák"); await page.waitForTimeout(2000); await run("line-missing-hint");
    await page.keyboard.press("Enter"); await page.waitForTimeout(2000); await run("stand-in-notice");
    await page.getByRole("button", { name: "Change font" }).click(); await page.waitForTimeout(5000); await run("change-font-menu");
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
    await browser.close();
  }
  fs.writeFileSync(__dirname + "/out/axe.json", JSON.stringify(all, null, 1));
  const worst = Object.entries(all).flatMap(([k, v]) => v.filter((x) => x.impact === "critical" || x.impact === "serious").map((x) => k + " " + x.impact + " " + x.id + " " + x.sample));
  console.log("critical/serious:\n" + worst.join("\n"));
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
