// AC-290..297: font menu, own fonts
const { open, load, log, SHOTS } = require("./lib.cjs");
const fs = require("fs");
(async () => {
  const phone = process.env.PHONE === "1"; const tag = phone ? "390" : "1280";
  const { browser, ctx, page, reqs } = await open({ phone });
  const short = (from) => reqs.slice(from).filter((r) => r.u).map((r) => r.m + " " + r.u.replace(/^https:\/\/[^/]+/, "").slice(0, 100) + (r.len ? " body=" + r.len : ""));
  const fontish = (from) => short(from).filter((u) => /font|\.bin|woff/i.test(u));
  log("AC-290 landing: font-library requests", JSON.stringify(fontish(0).filter((u) => /fonts\/(lib|editor)|fontmatch/.test(u))));
  let m = reqs.length;
  await load(page, "chrome-justified-mixed.pdf");
  log("AC-290 after file open", JSON.stringify(fontish(m).filter((u) => /fonts\/(lib|editor)|fontmatch/.test(u))));
  const tap = (x, y) => phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
  m = reqs.length;
  if (phone) await page.getByRole("button", { name: /^Text$/ }).first().click(); else await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.waitForTimeout(400);
  const pg = await page.locator(".ed-page").first().boundingBox();
  await tap(phone ? 200 : 700, phone ? 420 : 620); await page.waitForTimeout(700);
  await page.keyboard.type("Approved Quickly 2026"); await page.keyboard.press("Escape"); await page.waitForTimeout(1200);
  log("after adding text", JSON.stringify(fontish(m)));
  const picker = page.getByTestId("font-picker");
  if (!(await picker.isVisible().catch(() => false))) { log("picker not visible; snapshot"); console.log((await page.locator("body").ariaSnapshot()).split("\n").slice(60).join("\n").slice(0, 2500)); }
  m = reqs.length;
  await picker.click(); await page.waitForTimeout(3500);
  const dlg = page.locator("#" + (await picker.getAttribute("aria-controls")));
  log("AC-291 menu open: woff files", JSON.stringify(short(m).filter((u) => /woff/.test(u))), "index/sig files", short(m).filter((u) => /\.bin|\.json/.test(u)).length);
  await page.screenshot({ path: SHOTS + `ours-font-menu-${tag}.png` });
  log("groups", JSON.stringify(await dlg.locator("[role=group]").evaluateAll((gs) => gs.map((g) => g.getAttribute("aria-label") + ":" + g.querySelectorAll("[role=option]").length))));
  log("dialog rect", JSON.stringify(await dlg.boundingBox()), "scrollers", JSON.stringify(await dlg.evaluate((e) => [e, ...e.querySelectorAll("*")].filter((x) => /(auto|scroll)/.test(getComputedStyle(x).overflowY) && x.scrollHeight > x.clientHeight + 1).map((x) => x.className.toString().slice(0, 40) + " " + x.clientHeight + "/" + x.scrollHeight))));
  // scroll the list: fonts load as rows come into view
  m = reqs.length;
  await dlg.locator(".ed-fonts__list").evaluate((e) => e.scrollTo(0, 900)); await page.waitForTimeout(2500);
  log("after scroll to 900: woff", short(m).filter((u) => /woff/.test(u)).length, short(m).filter((u) => /woff/.test(u)).slice(0, 4));
  const total = reqs.filter((r) => r.u && /fonts\/lib\/fonts\/.*woff/.test(r.u)).length;
  log("library woff files loaded so far", total, "of 354");
  // search
  const sb = dlg.getByRole("searchbox");
  for (const q of ["playfair", "mono", "zzzz", "Baskerville", "noto sans jp"]) { await sb.fill(q); await page.waitForTimeout(900); log("search", q, JSON.stringify(await dlg.locator("[role=option]").evaluateAll((os) => os.map((o) => o.textContent.trim().slice(0, 40))))); if (q === "zzzz") await page.screenshot({ path: SHOTS + `ours-font-search-empty-${tag}.png` }); }
  await sb.fill("playfair"); await page.waitForTimeout(900);
  await page.screenshot({ path: SHOTS + `ours-font-search-${tag}.png` });
  // AC-292: pick Playfair Display, note the file, download
  m = reqs.length;
  await dlg.getByRole("option", { name: /^Playfair Display/ }).last().click(); await page.waitForTimeout(2500);
  log("picked Playfair: requests", JSON.stringify(short(m).filter((u) => /woff|families/.test(u))), "picker label", await picker.getAttribute("aria-label"));
  const prevFam = await page.evaluate(() => { const t = document.querySelector('[role=group][aria-label^="Text:"]'); const el = t && (t.querySelector("[style*=font-family]") || t); return el ? getComputedStyle(el.querySelector("*") || el).fontFamily : null; });
  const faces = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded" && /playfair/i.test(f.family)).map((f) => f.family + " " + f.weight + " " + f.style + " " + (f.unicodeRange || "").slice(0, 30)));
  log("preview font-family", prevFam, "loaded faces", JSON.stringify(faces));
  await page.screenshot({ path: SHOTS + `ours-font-picked-${tag}.png` });
  const dl = page.waitForEvent("download", { timeout: 20000 }); await page.getByRole("button", { name: "Download PDF" }).click(); await (await dl).saveAs(`${__dirname}/out/c-${tag}-playfair.pdf`);
  log("non-GET so far", reqs.filter((r) => r.u && r.m !== "GET").length);
  // AC-294/295: own font files
  const sel = page.locator('[role=group][aria-label^="Text:"]').first();
  const tryFile = async (file) => {
    if (!(await picker.isVisible().catch(() => false))) { const b = await sel.boundingBox().catch(() => null); if (b) await tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500); }
    await picker.click(); await page.waitForTimeout(700);
    const d2 = page.locator("#" + (await picker.getAttribute("aria-controls")));
    const mm = reqs.length;
    const fc = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
    await d2.getByRole("option", { name: /Add a font file/ }).click();
    const ch = await fc; if (!ch) { log(file, "NO file chooser"); return; }
    const acc = await ch.element().getAttribute("accept");
    await ch.setFiles(__dirname + "/fx/" + file); await page.waitForTimeout(2500);
    const snap = await page.locator("body").ariaSnapshot();
    const msgs = snap.split("\n").filter((l) => /font|Font/.test(l) && !/option "|button "Font|searchbox|Search|listbox|group "|uploaded/.test(l)).map((l) => l.trim()).join(" || ");
    const dev = await d2.locator('[role=group][aria-label="On this device"] [role=option]').evaluateAll((os) => os.map((o) => o.textContent.trim().slice(0, 50))).catch(() => []);
    log("own font", file, JSON.stringify({ accept: acc, msgs: msgs.slice(0, 400), device: dev, picker: await picker.getAttribute("aria-label").catch(() => null), net: short(mm) }));
    await page.screenshot({ path: SHOTS + `ours-own-font-${file.replace(/\W/g, "-")}-${tag}.png` });
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  };
  for (const f of ["notes.txt", "own-fake.ttf", "own-broken.ttf", "own-empty.otf", "own-restricted.ttf", "own-dejavu.ttf", "own-dejavu.woff", "own-dejavu.woff2", "own-inter.otf", "own-preview-print.ttf"]) await tryFile(f);
  const dl2 = page.waitForEvent("download", { timeout: 20000 }); await page.getByRole("button", { name: "Download PDF" }).click(); await (await dl2).saveAs(`${__dirname}/out/c-${tag}-ownfont.pdf`);
  log("final picker", await picker.getAttribute("aria-label").catch(() => null), "non-GET total", reqs.filter((r) => r.u && r.m !== "GET").length, "hosts", [...new Set(reqs.filter((r) => r.u && /^http/.test(r.u)).map((r) => new URL(r.u).host))]);
  // AC-297: reload, is an own font still listed?
  await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  log("after reload: body mentions", (await page.locator("body").innerText()).split("\n").filter((l) => /Restore|DejaVu|font/i.test(l)).join(" | ").slice(0, 300));
  log("errors", JSON.stringify(reqs.filter((r) => r.console || r.pageerror)).slice(0, 600));
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
