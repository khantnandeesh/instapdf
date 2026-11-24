# F16 competitor micro-teardown (2026-11-23)

Internal evidence only; screenshots of other sites never ship (CLAUDE.md rule 1).


**Method.** Headless Chromium through Playwright (Node), with a desktop Chrome 131 user agent, a 1440×900 viewport and deviceScaleFactor 1. Network capture used CDP: `requestWillBeSentExtraInfo` gives the real `Content-Length` of each upload, and `loadingFinished.encodedDataLength` gives bytes transferred. All timings start when the file is picked (`setInputFiles` or file chooser), and each is one sample on a cloud VM, so read them as rough figures. Each page was fetched once, with at least 1 s between navigations, and each site got no more than 2 edit+download runs. Output files were checked with pypdf, pypdfium2, and poppler's `pdffonts`/`pdftotext`. Poppler is GPL: it was used once here for ad-hoc research only and must never enter the repo, tests or CI (CLAUDE.md rule 3). sejda.com was not touched. Scripts and screenshots are in `assets/f16-pdf-editor/competitors/`. `driver.js`, `lib.js` and `run.sh` form a long-lived browser driven by JS snippets. `analyze.py` and `render.py` check the output.

**Main finding.** Only two engines in this group can edit existing text. **iLovePDF ("TrueEdit"), Smallpdf and Xodo all run the same commercial engine, Apryse/PDFTron WebViewer.** It is a WASM build of PDFNet plus the "InfixServer" content-edit module (`trueedit_libpdf/.../InfixServerWasm.br.wasm` and `webviewer/11-13-0/core/contentEdit/...`), and it runs in the browser. Of those three, only iLovePDF lets you save for free, and only once. PDF24 and PDFgear cannot edit existing text in their online tools. Adobe blocks headless browsers. Smallpdf and Xodo let you edit, then put the paywall at export.

## Comparison table

| | iLovePDF | Smallpdf | PDF24 | PDFgear | Xodo | Adobe online |
|---|---|---|---|---|---|---|
| Edit existing text in the browser? | **Yes** (Apryse WASM, "Edit" mode with crown icon) | Yes in the editor; **export is Pro** | **No** (add-only annotation editor) | **No** ("Get PDFgear app to edit texts") | Yes in the editor, "preview mode"; **saving needs an upgrade** | Not measured: **HTTP 403 "Access Denied"** (Akamai) to headless Chromium even with a desktop UA |
| Free tier for text edit | **1 free save**. The 2nd text-edit save in the same session showed "Upgrade to Premium – This is a Premium feature" | Paywall dialog on Download: "Editing text is a Pro feature" (7-day trial) | n/a | Desktop-app upsell | Paywall banner as soon as the tool opens | n/a |
| Engine | Apryse WebViewer (PDFNet + Infix WASM) | Apryse WebViewer 11.13 | pdf.js viewer + server-side writer | Syncfusion PDF Viewer (client) | Apryse WebViewer | — |
| File uploaded? | **Yes, at pick** (+62 ms) to `api67/api78.ilovepdf.com/v1/upload`, used for server-rendered page images. The edit and save run on the client (`taskId=-1`), with no second upload | **Yes, in the background after pick** (+1.2 to 2.7 s): PUT to `smallpdf-production-files…r2.cloudflarestorage.com` plus `task.smallpdf.com` | **At save only**: original to `doc2pdf.pdf24.org` plus an edit payload; output is built on the server | **No** (Download is a local blob in 56 ms) | **No** (matches its "no upload" claim) | — |
| Upload bytes vs file | 9,202 B for 7,956 B (multipart); 45,557 B for 44,297 B | 7,956 B for 7,956 B (raw PUT); 44,297 B for 44,297 B | 8,161 B (original) + 16,292 B (modify job) for 7,956 B | 0 | 0 | — |
| Page weight before pick | 1.27 MB | 1.30 MB | 2.06–2.09 MB | **8.02 MB** | 3.90 MB | — |
| Extra bytes after pick | +1.5 MB view, **+8 MB on Edit click** (WASM + 12 fonts); session total about 10.8 MB | about 4.8 MB (WebViewer and WASM load right away); 6.07 MB at save | about 0.04 MB (pdf.js) | about 0.05 MB | **+8.0 MB** (WebViewer); 11.9 MB total | — |
| Third-party hosts (whole session) | 14 (ads: doubleclick, criteo, openx, amazon, yahoo, adsrvr…) | 22 (GA, Bing, Clarity, Hotjar, Datadog, TrackJS, **pdftron.com** fonts…) | **215** (header-bidding ad stack, 1,194 requests) | 14 (Clarity **session replay**, GA, Termly, Bing…) | 32 (Heap, Facebook pixel, Sprig, G2, Matomo, Stripe…) | — |
| First page visible (from pick) | **1.81 s** (server PNG render) | ≤5 s cold (blank at 2 s); 0.74 s warm | **0.19 s** warm (pdf.js) | about 0.1–2 s (rendered by the 2 s shot) | **7.8 s cold** | — |
| Text editor interactive | about 8.5 s cold after clicking Edit (spinner, then boxes); 2.8 s warm | about 3 s after "Edit Text" | n/a | n/a | about 4 s after the tool click | — |
| Save → file | about 4 s to the "processed" dialog, then a local blob download | blocked (paywall) | 4.15 s (upload, job, poll, download) | 0.06 s | blocked | — |
| Unit of edit | **One box for the whole page** (title, paragraphs, labels, even table cells all in one galley); double-click enters the box, double-click again selects a word | Same as iLovePDF; Hindi split into several boxes; Arabic its own box | n/a | n/a | Same Apryse UI | — |
| Same font kept? | Yes for chars in the original font (Times-Roman, Carlito subset). On a missing glyph (₹ in WinAnsi Times) it **switches to Roboto and stays in Roboto** for the rest of the typed run | Same | n/a | n/a | — | — |
| Reflow | **Yes**, the whole paragraph rewraps, and content below moves down. Side effects: it **overlaps vector graphics and form widgets** (table borders cut through "Total amount due", the "Item" cell text dropped into the "Design" row, "Name:" moved under its field). The justified paragraph got a stray hard break after "thirty". The on-screen wrap differed from the saved file's wrap | Same; the on-screen preview briefly dropped "paragraph with several lines of" | n/a | n/a | — | — |
| Original text removed? | **Yes, really rewritten.** The content stream is regenerated with Apryse `/IceniObject … DP` marked content, and "synthetic" is gone | — | Not applicable; original untouched | Original untouched | — | — |
| Output fonts | Reuses `/F3 Times-Roman` (WinAnsi, `ž` as `\236`) and **adds `QAKDES+Roboto` CID subset** for ₹ onward. Fill colour changed from `0 g` to CMYK rich black `0.741 0.682 0.667 0.898 k` for the edited run | — | No new font: **the added text is a 496×97 RGB image (`/Im1`)**, so not searchable | FreeText annotation with **no /AP and DA `1 1 1 rg` (white)**: the text is **invisible** in pdfium (Chrome) and in poppler; ₹ dropped when regenerated ("couldn't find a font for U+20B9") | — | — |
| Text extractable? | Yes: "This is a REPLACED Quick ž ₹ much longer wording test paragraph…" | — | Added text no; original yes | Only via annotation /Contents | — | — |
| Size change | 7,956 → 21,231 B (+167%, mostly the Roboto subset) | — | 7,956 → 9,156 B | small (incremental update) | — | — |
| Privacy leak worth noting | Upload at pick even though the edit runs on the client | Full file copied to R2 while you are only viewing | ad stack of 215 hosts on the editor page | **Microsoft Clarity replay payloads contained the PDF's text layer** ("Service Agreement", "Provider", "non-refundable" found in decompressed `b.clarity.ms/collect` bodies) | FB pixel and Heap fire on pick (no file content seen) | — |

## Per-site notes

### iLovePDF (`ilovepdf.com/edit-pdf`)
- When you pick a file, plupload POSTs it to `apiNN.ilovepdf.com/v1/upload`. The pages are then shown as server PNGs (`/v1/pdfrender/...`), which is why the first page appears at 1.8 s. The Annotate mode works on those images.
- The "Edit" toggle (crown icon) loads Apryse WebViewer in an iframe (`#webviewer-1`, `trueedit_libpdf/c64268a/ui/index.html`). It also loads PDFNet WASM, `InfixServerWasm.br.mem/.wasm`, `pdfnet.res`, and 12 fallback webfonts (Arimo, Caladea, Carlito, Cousine, LiberationSerif, OpenSans, NotoSansArabic, Roboto, RobotoMono, Tinos, …). That is about 8 MB. Editing and saving happen in the browser: the save produced only an analytics event and `templates/download?taskId=-1`.
- Interaction: the first double-click enters the page-wide box, and a second double-click selects a word. A single click selects the box; pressing Backspace then **deletes the entire page's text in one keystroke**. I did this by accident in an exploratory session, and it is a nasty UX trap.
- Test on std14 (WinAnsi, non-embedded Times): typing "REPLACED Quick ž ₹ much longer wording" kept Times for "REPLACED Quick ž". It switched to embedded Roboto at "₹" and **never switched back**, so the rest of the typed run stayed sans-serif (see `ilovepdf-std14-after.png` and `ilovepdf-out-std14.png`). The paragraph reflowed correctly in the output.
- Test on justified Carlito (Identity-H subset): Q, ž and ₹ looked like Carlito on screen. Reflow pushed the paragraph into the table and the "Total amount due" line, and the table rules were not moved (`ilovepdf-justified-after.png`). The second save hit the Premium wall, so this file was not downloaded.
- Screenshots: `ilovepdf-editmode2.png`, `ilovepdf-e.png` (word selected), `ilovepdf-std14-after.png`, `ilovepdf-out-std14.png`, `ilovepdf-justified-sel.png`, `ilovepdf-justified-after.png`, `ilovepdf-save1.png` (free download dialog), `ilovepdf-save2.png` (Premium wall).

### Smallpdf (`smallpdf.com/edit-pdf`)
- Apryse WebViewer 11.13.0 is served from `smallpdf.com/static/webviewer/11-13-0/`, and fonts are fetched from `www.pdftron.com/webfonts/v2/`. Pages render in the browser, but the file is still uploaded at once: a raw PUT of the exact bytes to Cloudflare R2, then a `task.smallpdf.com/v1/tasks/external` job.
- "Edit Text" (crown icon) works fully in the editor, with the same behaviour as iLovePDF: same fallback-font stickiness and same reflow. **The paywall appears only at Download** ("Editing text is a Pro feature – Try 7 days free"). That is bait: you do the work first.
- Complex scripts (`smallpdf-scripts-after.png`): replacing a Hindi word broke the line. "यहाँ" wrapped inside a fixed-width box and its **chandrabindu was left floating on its own**. Typing Arabic "جديد" into the Arabic line rendered as **"ديدج", in reversed order and in a different font**. RTL editing is broken in this engine build.
- Screenshots: `smallpdf-edittext.png`, `smallpdf-std14-after-full.png`, `smallpdf-save1.png` (paywall), `smallpdf-scripts-editor.png`, `smallpdf-scripts-after.png`.

### PDF24 (`tools.pdf24.org/en/edit-pdf`)
- It uses a pdf.js viewer (`/static/mod/pdfjs/modern/pdf.mjs`) and nothing is uploaded on pick. The first page appears in 0.19 s (warm), the fastest in this group.
- The tools are Select, Insert text, freehand, shapes, image, stamp, signature and QR. **There is no way to edit or select existing text.** Double-clicking text does nothing.
- On Save there is a dialog with optional "Compress" and "Flatten" boxes. The browser then uploads the original PDF and a 16 KB modification job to `doc2pdf.pdf24.org`, polls `getStatus` 3 times, and downloads the result. That took 4.15 s in total.
- Output: the inserted text "Added Qž₹ text" is **rasterized into a 496×97 RGB image** placed with `cm` and `Do`, so it is not searchable or selectable. Original fonts are untouched.
- The page loads a large header-bidding ad stack: 215 third-party hosts and about 1,200 requests in one session.
- Screenshots: `pdf24-t2.png`, `pdf24-dbl.png`, `pdf24-inserted.png`, `pdf24-save.png`, `pdf24-out-std14.png`.

### PDFgear (`pdfgear.com/edit-pdf/`)
- It uses the Syncfusion EJ2 PDF Viewer from `cdn.syncfusion.com`. The landing page already weighs **8.0 MB before any file is picked**. The PDF is never uploaded, and Download builds a local blob in 56 ms.
- Double-clicking text only selects it. The blue "Edit PDF" button opens a modal, "Get PDFgear app to edit texts in PDF" with a Free Download button. **Online text editing does not exist.**
- Output of the Free Text tool: a `/FreeText` annotation with **no appearance stream and `DA 1.000 1.000 1.000 rg`**. pdfium (Chrome's viewer) and poppler both render the page **without the added text**. poppler also cannot lay out ₹ ("couldn't find a font for U+20B9").
- **Privacy:** Microsoft Clarity session recording (`b.clarity.ms/collect`) uploads the DOM, and that includes the Syncfusion text layer (`pdfviewer_text_0_17` spans). The decompressed payloads contained the document's own text. So "the file is not uploaded" is true, but its text leaves the browser anyway.
- Screenshots: `pdfgear-t10.png`, `pdfgear-dbl.png`, `pdfgear-editbtn.png`, `pdfgear-inserted.png`, `pdfgear-out-std14-full.png` (text missing).

### Xodo (`xodo.com/pdf-editor`)
- Apryse's own consumer product. `setInputFiles` on the hidden input did nothing; the file chooser had to be used. No PDF upload: only the Facebook pixel and Heap fire on pick.
- Cold first paint is **7.8 s**, because about 8 MB of WebViewer downloads after the pick.
- Edit Text is under the "•••" menu, then Edit Text, then the content-edit tool. The boxes appear together with a banner: **"Text edits are in preview mode. To save or download your changes, please upgrade."** The tool opened in a 53% zoom layout with three side panels.
- Screenshots: `xodo-t10.png`, `xodo-more.png`, `xodo-edittext2.png`.

### Adobe Acrobat online (`adobe.com/acrobat/online/pdf-editor.html`)
- The edge returned `403 Access Denied` (1 KB) to headless Chromium with a desktop UA. Per the instructions I did not try to get around it. To measure it, someone needs a real headed browser session. Screenshot: `adobe-landing.png`.

## What this means for BerryPDF (measured gaps we can beat)
1. **A truly free text edit.** No competitor here gives unlimited free saves of edited text. iLovePDF allows 1 per session; Smallpdf and Xodo paywall the export; PDF24 and PDFgear have no text editing.
2. **No upload.** Two of the three engines that can edit text upload the file anyway (iLovePDF at pick, Smallpdf in the background). Doing everything in the browser behind a strict CSP is a claim we can prove, and they cannot.
3. **Weight and time to edit.** Apryse costs about 8 MB and 3–9 s before the first text edit. A pdf.js render plus a light edit layer can show the first page in under 0.3 s (PDF24's pdf.js does 0.19 s) and allow editing within about 1 s.
4. **Edit unit.** Apryse puts the whole page in one galley, so one stray Backspace deletes the page. Paragraph-level boxes that respect tables and widgets would avoid the overlap bugs we saw.
5. **Missing glyphs.** Fall back only for the missing character, then go back to the original font. Embed a subset that matches the original family (Carlito→Carlito, Times→Liberation Serif/Tinos) instead of Roboto. Keep the original colour space.
6. **WYSIWYG between screen and file.** We saw both wrap differences and dropped words in the Apryse preview. Use one layout engine for both.
7. **Complex scripts.** Shaping must be right: a HarfBuzz WASM layer with bidi for Arabic and clusters for Devanagari. Apryse reversed the Arabic and detached a Devanagari mark.
8. **Output must render everywhere.** Write real content-stream text (not rasters like PDF24, and not FreeText without /AP like PDFgear). Check outputs in CI with pdfium (pypdfium2), pdf.js and qpdf.
9. **No session replay or ad stack on tool pages.** PDFgear's Clarity leaks document text, and PDF24 loads 215 ad hosts.

## Files
- Report: `micro-teardown.md`
- Outputs: `micro/ilovepdf-out-std14.pdf`, `micro/pdf24-out-std14.pdf`, `micro/pdfgear-out-std14.pdf`
- Raw logs: `micro/<site>.log.json`, `micro/<site>-run1.json`, `micro/<site>-run2.json`, `micro/pdfgear-clarity.json`
