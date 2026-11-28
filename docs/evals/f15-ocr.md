# Key checks: F15 OCR

**Verdict: FAIL.** One check is lost: options (12 languages against the reference's 61, and no way to replace an old text layer). One copy defect also has to go: the page says there is no page limit, and there is one. Quality ties; speed, limits, privacy and the phone layout are ours. No owner waiver is on record.

- Run: 2026-11-28, 11:35–12:02 UTC, by parity-evaluator. Lean key checks (six checks set by the lead), not an every-AC run.
- Candidate: staging https://web-staging-qzq5fa2g7q-uc.a.run.app/ocr-pdf, `/api/health` reported `bd8d90b`.
- Reference: its OCR tool. **2 tasks used**, at 12:00:49 and 12:01:26 UTC, plus one page load and one file upload at 12:00:14. No sign-in or payment was asked for.
- File on both sides: `scan.pdf` (67,092 B, 3 pages: an upright scanned picture, a typed page, and a scanned picture on a page turned 90°). Used as an input file only; I read no source.
- Harness: Playwright (headless Chromium), 1280×632 and 390×664. Outputs checked with pypdfium2 (text, character boxes, renders) and pikepdf (picture streams, qpdf syntax check). Word position: each word's box in the text layer against the ink of that word on a 216 dpi render.
- Evidence (not in git): `/mnt/project-files/evals-cache/f15-ocr/` (`ref/`, `out/`, `shots/`, `scripts/`). Our key screenshots: `/mnt/project-files/designs/f15/eval/` (`ocr-1-loaded`, `ocr-2-reading` / `ocr-2-options`, `ocr-3-result` at 1280 and 390). Notes and hashes: `docs/evals/cache/f15-ocr/manifest.json`.

## Checks

| # | Check | Reference | Ours | Result |
|---|---|---|---|---|
| 1 | Options | **61 languages**, one per run. Output: PDF and/or Text ticks. A "Replace text from a previous OCR" tick. A per-page quick mode: one page read on its own, with its own language | **12 languages** (11 of them also in the reference's list, plus Arabic, which it lacks). A second language in the same run. Output: searchable PDF, text file, or both. "Skip pages that already have text" (on). No way to replace an old text layer: with the switch off the typed page's words are in the file twice (checked) | **FAIL** (lose) |
| 2 | Result quality | Words exact on all 3 pages. Each word sits on its ink: left edge within 0.2 pt (median), but the box stops about 5.6 pt short of the word's end. Both pictures byte for byte the source's, render difference 0. 72,578 B (+8.2%). qpdf clean. Typed page not doubled. Text file: 60 words, all right | Words exact on all 3 pages, the turned page included. Same placement: left edge within 0.2 pt, box about 5.6 pt short at the end. Both pictures byte for byte the source's, render difference 0. 72,578 B (+8.2%), the same size to the byte though a different file. qpdf clean. Typed page untouched. Text file: 60 words, all right | **TIE** |
| 3 | Speed, click to Download | 6.25 s and 5.94 s (two tasks), after an upload that takes about 0.8 s | First visit: **3.59 s** median of 3 (3.59, 3.15, 3.71). Later visits: 2.39 s median of 3. At 390: 3.94 s. Button ready 0.23 s after choosing the file. Truthful page count and Cancel (stops in 0.4 s) | **PASS** (win) |
| 4 | Limits | 10 pages or 50 MB a task and 3 tasks an hour, as its page states | 20 files, 100 MB each, 1,000 pages in total, no task count. 60 pages read in 26 s. A 1,001-page file is refused with a clear message. Password, damaged and wrong-type files are named plainly | **PASS** (win) |
| 4b | Limits wording | States its limits | The page's own line says 1,000 pages, but the FAQ ("Is there a page limit?" → "No") and the meta description ("no page limit") say there is none. The spec says 50 files and no page limit | **FAIL** (untrue copy) |
| 5 | Privacy | Uploads the file on choosing it (two POSTs), then a POST starts the task | **0 non-GET requests and 0 requests to another origin** in 14 runs (HAR kept for one). Everything fetched is ours: the recogniser script, its WASM core and `eng.traineddata.gz` (2.95 MB, cached for a year). CSP has `connect-src 'self'`. Wording ("Your files stay on this device", "Done on this device. Never uploaded.", "Nothing is uploaded") matches what was measured | **PASS** (win) |
| 6 | Phone layout at 390 | Sideways scroll on landing and with a file in (page 482 and 457 px wide on a 390 px screen); the per-page button runs off the right edge. Run button in view (y=604) | No sideways scroll on landing, loaded, options sheet or result. Language and Read text docked in view (button y=602 of 664); the rest under More options, all in view; Download at y=601 | **PASS** (win) |

## Lighthouse, axe, SEO

- Lighthouse mobile performance: **median 96** of 7 valid runs (96, 99, 83, 90, 85, 97, 99; two more runs died with a trace error). LCP 1.6–2.5 s, CLS 0, TBT 80–650 ms. The three low runs came while the host was loaded: a control page that scored 98–99 scored 92 in the same minute. Accessibility 100, best practices 100. Passes, but TBT is the number to watch.
- axe: 0 violations on landing, loaded, options sheet and result, at 1280 and 390.
- SEO: Lighthouse SEO 66 from one audit, `is-crawlable`: staging sends `x-robots-tag: noindex, nofollow` and `Disallow: /`, which is right for staging. The page has one `h1`, a unique title, a canonical to the public host, `index, follow`, a sitemap entry and four JSON-LD types (WebApplication, BreadcrumbList, HowTo, FAQPage). The FAQPage data carries the untrue page-limit answer (G-2). Lab numbers only; no field data exists yet. Re-check on the public URL.
- First screen fit: main button and Download in view at 1366×657, 1280×632, 1536×730, 1920×969 and 390×664.

## Gaps

1. **G-1 (check 1, blocks).** Languages: 12 against 61. Someone with a Polish, Korean, Turkish, Swedish, Greek, Hebrew, Ukrainian, Thai, Vietnamese, Bengali, Tamil or Telugu scan cannot use ours. Add the missing 50 (the spec says a language is one line; they are fetched on first use, so the page weight does not change), or get a written waiver.
2. **G-2 (check 4b, blocks).** Make the copy true. Either lift the 1,000-page and 20-file caps on this tool, as the spec says (50 files, no page limit), or change the FAQ answer and the meta description to the real limit.
3. **G-3 (check 1, does not block alone).** No "replace the old text layer" choice. With "Skip pages that already have text" off, a page that has text gets a second copy of it (the typed page read back as the same sentence twice). Offer replace, or at least say so beside the switch.
4. **G-4 (wording).** A file whose pages all have text (`three-pages.pdf`) ends on "Your PDF is ready" with no word that nothing was read. The spec says such a file "says so".
5. **G-5 (look).** The result note ("Text was recognised on 2 of 3 pages…") covers the "Your PDF is ready" heading and the file line at 390, and "Back to editing" at 1280, until it is closed (`ocr-3-result-390.png`).
6. **G-6 (check 2, shared with the reference).** Each word's box in the text layer ends about one letter short, so a search highlight misses the last letter. The reference has the same flaw; fixing it would turn the tie into a win.
7. **G-7 (coverage).** Not compared: a real photographed or noisy scan (the task file is clean print, which both read perfectly), a non-English file, the reference's per-page mode and its replace tick, its error states, and a file over its 10-page limit. The Rich Results and Schema.org checks wait for a public URL. A re-check of our side needs no new reference tasks.
