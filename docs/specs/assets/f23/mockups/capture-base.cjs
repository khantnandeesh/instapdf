// F23 mockup tooling: snapshots real BerryPDF states (`pnpm dev` on :3000) into static HTML bases
// (scripts removed, canvases turned into images, CSS saved next to them), so the F23 mockups start
// from the shipped look. Run: node docs/specs/assets/f23/mockups/capture-base.cjs (from the repo root; the font file
// fredoka.woff2 next to this script is the app's self-hosted Fredoka, SIL OFL 1.1).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUT = __dirname;
const FX = path.resolve(OUT, "../../../../../apps/web/tests/fixtures");
const BASE = "http://localhost:3000";
fs.mkdirSync(path.join(OUT, "base"), { recursive: true });
fs.mkdirSync(path.join(OUT, "css"), { recursive: true });

// Stable names for the app's stylesheets; anything else (dev-only font CSS) is dropped.
const SHEETS = [
  [/\/css\/app\/layout\.css/, "app.css"],
  [/\/css\/app\/[^/]+\/page\.css/, "tool-page.css"],
  [/SegmentGrid/, "segment-grid.css"],
  [/EditablePageGrid/, "page-grid.css"],
];

async function snapshot(page, name) {
  await page.waitForTimeout(1200);
  const { html, sheets } = await page.evaluate(async () => {
    // Canvases (thumbnails, previews) become images so the static copy keeps them.
    for (const c of document.querySelectorAll("canvas")) {
      const img = document.createElement("img");
      try {
        img.src = c.toDataURL("image/jpeg", 0.85);
      } catch {}
      img.className = c.className;
      img.setAttribute("style", c.getAttribute("style") || "");
      img.alt = "";
      c.replaceWith(img);
    }
    // Raw CSS text by URL (CSSOM serialisation drops shorthands that use var(), e.g. the jam fill).
    const sheets = [];
    for (const s of document.styleSheets) if (s.href) sheets.push({ href: s.href, css: await (await fetch(s.href)).text() });
    document
      .querySelectorAll("script, link[rel=stylesheet], style, link[rel=preload], link[rel=modulepreload], link[rel=icon], link[rel=apple-touch-icon], link[rel=manifest], link[rel=canonical], link[rel=alternate], next-route-announcer, nextjs-portal")
      .forEach((e) => e.remove());
    return { html: "<!doctype html>\n" + document.documentElement.outerHTML, sheets };
  });
  for (const s of sheets) {
    const hit = SHEETS.find(([re]) => re.test(s.href));
    if (hit) fs.writeFileSync(path.join(OUT, "css", hit[1]), s.css.replace(/url\(\/_next\/static\/media\/[^)]+\.woff2\)/g, "url(../fredoka.woff2)"));
  }
  const links = SHEETS.map(([, f]) => `<link rel="stylesheet" href="../css/${f}">`).join("\n");
  fs.writeFileSync(path.join(OUT, "base", `${name}.html`), html.replace("</head>", links + "\n</head>"));
  console.log("saved", name);
}

async function open(browser, vp, url) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.locator("[data-testid=tool-flow][data-hydrated]").waitFor();
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const desk = { width: 1280, height: 720 };
  const phone = { width: 390, height: 844 };
  for (const [tag, vp] of [["desk", desk], ["phone", phone]]) {
    let p = await open(browser, vp, "/merge-pdf");
    await snapshot(p, `merge-empty-${tag}`);
    await p.getByTestId("file-input").setInputFiles(["alpha.pdf", "bravo.pdf", "echo.pdf"].map((f) => path.join(FX, f)));
    await p.locator("[data-testid=tool-flow][data-state=ready]").waitFor();
    await p.waitForTimeout(1500);
    await snapshot(p, `merge-ready-${tag}`);
    await p.context().close();

    p = await open(browser, vp, "/rotate-pdf");
    await snapshot(p, `rotate-empty-${tag}`);
    await p.getByTestId("file-input").setInputFiles([path.join(FX, "alpha.pdf")]);
    await p.locator("[data-testid=tool-flow][data-state=ready]").waitFor();
    await p.waitForTimeout(1500);
    await snapshot(p, `rotate-ready-${tag}`);
    await p.getByRole("button", { name: "Rotate right", exact: true }).first().click();
    await p.getByTestId("primary-action").click();
    await p.getByTestId("result").waitFor({ timeout: 30000 });
    await p.waitForTimeout(1500);
    await snapshot(p, `rotate-result-${tag}`);
    await p.context().close();
  }
  await browser.close();
})();
