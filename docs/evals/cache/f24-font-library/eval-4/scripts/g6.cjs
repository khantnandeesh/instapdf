// gap 6 + AC-290 (as worded after the third evaluation): what loads, and when, for a file that only names fonts, and for one that embeds them
const { open, load, log, SHOTS, FX } = require("./lib.cjs");
(async () => {
  for (const phone of [false, true]) { const tag = phone ? "390" : "1280";
    for (const [name, file] of [["named-only", process.env.FXD + "/ac283-named-only.pdf"], ["named-std14", process.env.FXD + "/ac283-named-std14.pdf"], ["std14-reportlab", FX + "std14-reportlab.pdf"], ["embedded-chrome", FX + "chrome-justified-mixed.pdf"], ["embedded-memo", FX + "libreoffice-memo.pdf"], ["cff", FX + "latex-type1c.pdf"]]) {
      const { browser, page, reqs } = await open({ phone, ctx: phone ? {} : { viewport: { width: 1280, height: 1500 } } });
      const lib = (from) => reqs.slice(from).filter((r) => r.u && /\/fonts\//.test(r.u)).map((r) => r.u.split("/fonts/")[1]);
      log(tag, name, "font/library requests on landing", JSON.stringify(lib(0)));
      const n0 = reqs.length; const t0 = Date.now();
      await page.locator('input[type="file"]').first().setInputFiles(file);
      await page.locator(".ed-page--drawn").first().waitFor({ timeout: 20000 }); const tDrawn = Date.now() - t0;
      await page.waitForTimeout(6000);
      const after = reqs.slice(n0).filter((r) => r.u && /\/fonts\//.test(r.u)).map((r) => "+" + (r.t - t0) + " " + r.u.split("/fonts/")[1]);
      log(tag, name, "first page drawn ms", tDrawn, "requests after file open (no menu, no click):", JSON.stringify(after), "non-GET", reqs.filter((r) => r.u && r.m !== "GET").length);
      log(tag, name, "document.fonts loaded", JSON.stringify(await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "").slice(0, 40) + ":" + f.weight + ":" + f.style))));
      if (/named/.test(name)) await page.screenshot({ path: SHOTS + `gap6-${name}-page-${tag}.png` });
      await browser.close();
    }
  }
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
