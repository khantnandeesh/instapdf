const { chromium } = require("/opt/node-tools/node_modules/playwright"); const fs = require("fs");
const F = JSON.parse(fs.readFileSync(__dirname + "/lib/scriptfonts.json"));
const L = [["noto-kufi-arabic", "مرحبا بالعالم هذا نص", "rtl"], ["noto-nastaliq-urdu", "مرحبا بالعالم هذا نص", "rtl"], ["amiri", "مرحبا بالعالم هذا نص", "rtl"], ["noto-sans-arabic", "مرحبا بالعالم هذا نص", "rtl"], ["noto-sans-devanagari", "कुल राशि का भुगतान", "ltr"], ["noto-serif-devanagari", "कुल राशि का भुगतान", "ltr"], ["noto-serif-hebrew", "שלום עולם זה טקסט", "rtl"], ["noto-sans-hebrew", "שלום עולם זה טקסט", "rtl"], ["noto-serif-bengali", "মোট পরিমাণ পরিশোধ", "ltr"], ["noto-sans-tamil", "மொத்த தொகை செலுத்து", "ltr"], ["noto-serif-thai", "ยอดรวมที่ต้องชำระ", "ltr"]];
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  const css = L.map(([k]) => `@font-face{font-family:"f-${k}";src:url(data:font/woff;base64,${fs.readFileSync(__dirname + "/" + F[k]).toString("base64")})}`).join("\n");
  const body = L.map(([k, t, d]) => `<p dir="${d}" style="font-family:'f-${k}';font-size:18px;margin:0 0 34px;text-align:${d === "rtl" ? "right" : "left"}">${t}</p>`).join("\n");
  await p.setContent(`<html><head><meta charset="utf-8"><style>${css} body{margin:0}</style></head><body>${body}</body></html>`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  await p.pdf({ path: process.env.FXD + "/ac288-scripts2.pdf", format: "A4", margin: { top: "20mm", left: "20mm", right: "20mm", bottom: "20mm" } }); await b.close(); })();
