# Key checks: F9 Bates numbering

**Verdict: FAIL.** One check is lost: options. The reference lets the number be coloured, lets the result file be named, and offers sizes from 6 to 60 pt; ours has none of these. Output, speed, steps, privacy and the phone layout are ours. No owner waiver is on record (the spec lists colour as "not in this version", which is not a waiver).

- Run: 2026-11-28, 13:13–13:32 UTC, by parity-evaluator. Lean key checks (six checks set by the lead), not an every-AC run.
- Candidate: staging https://web-staging-qzq5fa2g7q-uc.a.run.app/bates-numbering, `/api/health` reported `145061c`.
- Reference: its Bates tool, free tier. **2 tasks used**, at 13:14:56 and 13:16:18 UTC (slot 13:00–13:59), plus one page load at 13:13:43 and two file uploads. No sign-in or payment.
- Files: `alpha.pdf` (3 pages, A4) and `bravo.pdf` (2 pages, 792×612). Used as input files only; I read no source.
- Tasks: (1) prefix ACME, 6 digits, bottom right, from 1. Ours: both files in one run. Reference: `alpha.pdf` alone, because its free tier takes one file a task. (2) `bravo.pdf` with a line of our own (prefix, running number, file number), top centre, running number from 4, file number from 2, room made for the line, sans 14; red on the reference, which ours cannot do. Run at 390 on both.
- Harness: Playwright (headless Chromium), 1280×632 and 390×664. Outputs checked with pypdfium2 (text, character boxes, renders against the source) and pikepdf (boxes, fonts). `qpdf --check` was not available on this host; both sides' files open cleanly in pikepdf and PDFium.
- Evidence (not in git): `/mnt/project-files/evals-cache/f9-bates/` (`ref/`, `out/`, `shots/`, `scripts/`). Side by side, reference left: `/mnt/project-files/comparisons/f9-bates/` (`01-options-1280`, `02-result-1280`, `03-options-390`, `04-result-390`, `05-output-task2-page1`, `06-output-task1-page1`). Notes and hashes: `docs/evals/cache/f9-bates/manifest.json`.

## Checks

| # | Check | Reference | Ours | Result |
|---|---|---|---|---|
| 1 | Options | 20 preset lines (three shapes × 1, 3, 4, 5 or 6 digits, and number only) with editable label words; a custom line with running-number and file-number tokens; 6 positions; start number; file-counter start; margins left or increased; 3 fonts; **18 sizes, 6 to 60 pt; a colour picker; a name pattern for the result file** | 5 lines (number, with page, exhibit, exhibit and page, your own with 5 tokens); digits 1, 3, 4, 5, 6, 8; text before; starts at; files from; 6 positions; distance from the edge (3 steps) or an added strip; 6 fonts (3 faces, each with bold); 9 sizes, 8 to 24 pt; click pages to number only those; many files in one run. **No colour, no result name, no size under 8 or over 24.** The words "Exhibit" and "Page" in the presets cannot be changed (only by retyping the line as "Your own") | **FAIL** (lose) |
| 2 | Output correctness | Task 1: ACME 000001–000003, one on each page, real text, 21 pt from the right and 20 pt from the bottom, page otherwise untouched, +452 B. Task 2: ACME 000004 Doc 2, ACME 000005 Doc 2, red; the page keeps its size and its content is drawn at 90% to make the margin. Continuing across files works only by typing the next start number into a second task | Task 1: ACME 000001–000003 on `alpha.pdf` and 000004–000005 on `bravo.pdf` in one run; one number on every page; real, selectable text that reads back exactly; 30.5 pt from the right, 33 pt from the bottom; render difference against the source only inside the number's box. Task 2: the same two lines, centred; the page grows by a 48 pt strip at the top and the original area is pixel-identical to the source (nothing covered, nothing shrunk). Files are about 2.2–2.6 KB larger than the source (an embedded font subset) against the reference's 0.5–0.7 KB | **PASS** |
| 3 | Speed, click to Download | 1.92 s (task 1) and 1.59 s (task 2), after an upload of 0.3–0.4 s | First visit, one file: **1.53 s** median of 3 (1.52, 1.53, 1.70). Two files: 1.63 s median of 3. Later runs in the same visit: 0.79 s median of 3. At 390: 1.57 s. 60 pages 1.46 s; 250 pages 1.61 s. Button ready 0.23 s after choosing; every page shows its number after 1.5 s | **PASS** (tie on a first single file, win after) |
| 4 | Steps to finish (two files, numbered through) | Two tasks: choose a file, pick the line, type the prefix, pick the corner, run, download; then start over, choose the second file, type the next start number by hand, run, download. Two of the three free tasks an hour | Choose both files, type the prefix, run, download one ZIP. Bottom right and 6 digits are the defaults; the count carries over by itself and is shown on every page first | **PASS** (win) |
| 5 | Privacy | Uploads each file on choosing it (two POSTs), then a POST starts the task | **0 non-GET requests, 0 requests to another origin, 0 websockets** in 7 logged runs (HAR kept for one). CSP is `default-src 'self'`. Wording ("Your files stay on this device", "Done on this device. Never uploaded.") matches what was measured | **PASS** (win) |
| 6 | Phone layout at 390 | Landing fits. With a file in, the page is 405 px wide (sideways scroll) and the run button is at the end of a 1,200 px form. The colour panel opens off the right edge of the screen and cannot be reached | No sideways scroll on landing, loaded, options sheet or result. Position and the run button are docked in view (button y=602 of 664); the rest is under More options; Download at y=601. With "Your own" chosen, Font and Text size are below the sheet's fold and need a scroll inside it | **PASS** (win) |

Also seen on ours: a start number that is not a number keeps the button waiting; clicking a page numbers only that page; a locked file asks for its password, a damaged one offers Repair, a 1,001-page file and a text file are skipped with a plain reason.

## Lighthouse, axe, SEO

- Lighthouse mobile performance: **97** median of 3 (94, 98, 97). LCP 1.4–1.6 s, CLS 0, TBT 150–260 ms. Accessibility 100, best practices 100. Lab numbers; no field data exists.
- axe: 0 violations on landing, loaded, options sheet and result, at 1280 and 390.
- SEO: Lighthouse SEO 66 from one audit, `is-crawlable`: staging sends `x-robots-tag: noindex, nofollow` and `Disallow: /`, which is right for staging. One `h1`, a unique title, a canonical to the public host, `index, follow`, a sitemap entry, four JSON-LD types (WebApplication, BreadcrumbList, HowTo, FAQPage). The stated limit (20 files, 100 MB each, 1,000 pages) is true: a 1,001-page file is refused. Re-check on the public URL.
- First screen fit: run button and Download in view at 1366×657, 1280×632, 1536×730, 1920×969 and 390×664; the options end at y=577 at every desktop size, except with "Your own" (G-4).

## Gaps

1. **G-1 (check 1, blocks).** No colour for the number. The reference has a free colour picker; ours is always black. Add a colour (a few swatches and a custom value would do), or get a written waiver.
2. **G-2 (check 1, blocks with G-1).** No way to name the result. The reference prefixes each result's name from a pattern; ours hands back the original name (and a fixed ZIP name). Add a name field, at least a prefix or suffix.
3. **G-3 (check 1, blocks with G-1).** Sizes stop at 8 and 24 pt against 6 to 60 (missing: 6, 7, 13, 20, 22, 26, 28, 30, 45, 60). Widen the list. The preset words "Exhibit" and "Page" should also be editable without retyping the whole line.
4. **G-4 (first screen).** With Line set to "Your own" the panel's last row (Font, Text size) ends at y=697 on a 632 px screen, and on the phone it falls below the sheet's fold. The spec says the panel fits at 1280×632.
5. **G-5 (wording).** The FAQ names controls that do not exist: "First number" and "First file number" (the panel says "Starts at" and "Files from") and "Your own line" (the panel says "Your own"). The how-to says to select "Add Bates numbers"; the button reads "Number 5 pages". The FAQ's limit leaves out the 500 MB total that the page's own line gives.
6. **G-6 (preview).** At the default thumbnail size the previewed number is drawn to scale, about 2 px tall, so it cannot be read without enlarging the page. A readable echo of the first and last number beside the button would fix it.
7. **G-7 (file size).** Each numbered file gains about 2.2–2.6 KB for the embedded font, four to five times the reference's gain. Small, and embedding is the safer choice, but a digits-only subset would be smaller.
8. **G-8 (silent wait).** A bad start number disables the button with no message saying why that I could find.
9. **G-9 (spec).** The spec's table says "Limits: none"; the product caps a run at 20 files, 500 MB and 1,000 pages. The page's copy is right; the spec is not.
10. **G-10 (coverage).** Not compared: the reference's paid multi-file run, its error states, a turned or full-bleed page on both sides, and the long-file outputs page by page (only their timings were taken). `qpdf --check` not run. A re-check of our side needs no new reference tasks: the cache holds both tasks' outputs and the full option list.

## Run 2 (options re-check)

**Check 1, options: still FAIL (lose), now by a narrow margin. Overall verdict: FAIL.** Colour and the size range are fixed and proven in the output files; on those two alone the check would tie. What keeps it lost is the result name: the reference lets a free user set a prefix for the result file and ours has no naming at all. The spec lists it under "Not in this version", which is the builders' note, not an owner waiver. An owner waiver for G-2 written into this file, or a name field, turns this check into a tie or better and the overall verdict into PASS on the six key checks.

- Run: 2026-11-28, by parity-evaluator. Scope set by the lead: check 1 only. Checks 2, 4, 5 and 6, Lighthouse, axe and SEO were **not** re-run on this version and stand as measured in run 1.
- Candidate: staging, `/api/health` reported `742ade4af6ed2f938663167a1085f1508d93c350` (confirmed).
- Reference: **0 requests, 0 tasks.** Reference side taken only from the cache of run 1 (captured 2026-11-28, inside 30 days): the options captures and the two task outputs.
- Harness: Playwright (headless Chromium), 1280×632 and 390×664; `alpha.pdf` and `bravo.pdf` as input files only; no source read. Outputs read with pikepdf (fill colour and font size operators in the page content) and pypdfium2 (text, font size, character boxes, rendered ink at 3×).
- Evidence (not in git): `/mnt/project-files/evals-cache/f9-bates/run2/` (`out/`, captures, `run.log`, `analysis.log`, `timing.log`, `scripts/`). Side by side, reference left: `/mnt/project-files/comparisons/f9-bates/07-options-run2-1280.png`, `08-options-run2-390.png`, `09-output-run2-colour.png`.

### What the panel offers now

| Option | Reference (cache) | Ours at `742ade4` | Result |
|---|---|---|---|
| Colour | A free picker, any colour | A list of six: black, grey, red, blue, green, white. No custom value | Fixed for the common cases; short of the reference for any other colour (G-11) |
| Text size | 18 sizes, 6 to 60 pt | 16 sizes: 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 60 | Tie (same range) |
| Result name | A prefix field for the result's name | None. The file keeps its name; several files come as `berrypdf-bates-numbering.zip` | **Lose** (G-2, open) |
| Preset words | "Exhibit" and the case label are editable in place | Fixed; only by choosing "Your own" and retyping the line | Lose, minor (G-3, second half, open) |
| Fonts | 3 | 6 (3 faces, each with bold) | Win |
| Digits | 1, 3, 4, 5, 6 | 1, 3, 4, 5, 6, 8 | Win |
| Line tokens | 2 | 5 | Win |
| Room for the line | Margins grown by drawing the page at 90% | A strip added at that edge; the page is not shrunk | Win |
| Pages, files | All pages; one file free | Click pages to number only those; 20 files counted through | Win |

### Tasks run on staging

| # | Width | Settings | In the downloaded file |
|---|---|---|---|
| a | 1280 | `bravo.pdf`; your own line `ACME {bates} Doc {doc}`; from 4, files from 2; top centre; Sans **6**; **Red** | `ACME 000004 Doc 2`, `ACME 000005 Doc 2`; font size 6.0; fill `0.753 0.224 0.169 rg`; rendered ink rgb(192, 57, 43); line 4.3 pt tall, centred (gaps 367.8 / 368.2 pt) |
| b | 1280 | `alpha.pdf`; text before `ACME `; bottom right; Serif **60**; **Blue** | `ACME 000001`–`000003`; font size 60.0; fill `0.122 0.31 0.749 rg`; ink rgb(31, 79, 191); line 364 pt wide, 41 pt tall, wholly on the page (33 pt from the right) |
| c | 390 | `bravo.pdf`; your own line as in (a); top centre; added strip; Sans **60**; **Green** | Same two lines; font size 60.0; fill `0.118 0.49 0.263 rg`; ink rgb(30, 125, 67); page grew 612 → 717 pt so the 60 pt line has its own strip; centred |
| d | 390 | both files; text before `X-`; bottom left; Mono bold **6**; **Grey** | `X- 000001`–`000005` across both files in one ZIP; font size 6.0; fill `0.373 0.373 0.373 rg`; ink rgb(95, 95, 95) |
| e | 1280 | `bravo.pdf`; Exhibit, page; bottom centre; Sans bold 14; **White** | `Exhibit 1 ACME 000001 Page 1`, `… 000002 Page 2`; font size 14.0; fill `1 1 1 rg` (invisible on a white page, as asked) |

In all five: every page carries exactly one line, the text reads back as typed, the source's own text is intact, the files open cleanly in pikepdf and PDFium, the on-page preview showed the chosen colour before the run, 0 non-GET requests, 0 off-origin requests, no console errors, no sideways scroll (1280 and 390 wide).

Layout: with "Your own" and `{doc}` in the line the panel's last row (Font, Text size, Colour) ends at y=617 on a 632 px screen, so G-4 is closed at 1280. At 390 the same row ends at y=580 with Done at y=608, all in view inside the sheet; run button at y=601 of 664.

Speed, as a guard only (same method as run 1): click to Download, `alpha.pdf` with a colour set, first visit, 1.60 s median of 3 (1.72, 1.55, 1.60), against 1.53 s in run 1 and the reference's 1.92 s and 1.59 s. No change in standing.

### Why this is still a lose

The mission's options check compares what is offered with the reference's free and paid tiers, and one lost check blocks a pass unless the owner waives it in writing. Ours now offers more options than the reference in total, and the two gaps that mattered most to how the number looks are closed. But naming the result is a working control on the reference's free tier that ours does not have in any form, and no waiver is on record. I am not counting the missing custom colour or the fixed preset words as blocking on their own; with a name field (or a waiver for it) I would mark this check a tie at worst.

### Gap list after run 2

- **G-1: closed.** Colour works, in the preview and in the file. See G-11 for what is left.
- **G-2: open, blocks.** No result name. A single "Name starts with" field (prefix, empty by default so names stay as they are) would match the reference; a token for the first number of each file would beat it. Otherwise an owner waiver, recorded here.
- **G-3: sizes closed** (6 to 60 pt, proven at both ends). Still open, minor: the preset words "Exhibit" and "Page" cannot be changed without retyping the whole line.
- **G-4: closed at 1280×632** (panel ends at y=617). Not re-measured at the other desktop sizes.
- **G-11 (new, minor).** Colour is a fixed list of six; the reference takes any colour. A custom value (hex field or the browser's colour input) as a seventh entry closes it.
- **G-12 (new, cosmetic).** At 1280 with "Your own" chosen, the Line box is 116 px wide and its own label is cut off ("Your owr" under the arrow).
- **G-13 (note).** White is offered with no warning; on a white page the number is invisible in the file. A hint when white is chosen would save a wasted run.
- G-5 to G-10: not re-checked in this run.
