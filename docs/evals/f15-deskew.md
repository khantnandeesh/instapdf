# Key checks: F15 Deskew

**Latest: Run 2 (2026-11-28, staging `bd8d90b`): PASS.** See [Run 2](#run-2). The verdict below is kept as the record of run 1.

**Verdict: FAIL.** One check is lost: options and control (check 3). The reference lets you limit the run to chosen pages with a page-range field; we have no quick way to leave pages out. The other four checks are two ties and two wins. No owner waiver is on record.

- Run: 2026-11-28, 08:49–09:06 UTC, by parity-evaluator. Lean key checks (five checks set by the lead), not an every-AC run. Lighthouse, axe and the SEO audit were not run in this pass.
- Candidate: staging https://web-staging-qzq5fa2g7q-uc.a.run.app/deskew-pdf, `/api/health` reported `9cc4ce0`. At 08:47 the route still said "coming soon"; all results are from after the new build was live.
- Reference: its deskew tool. **2 tasks used** (08:53 and 09:04 UTC), plus 4 page loads and one extra upload to view its manual mode (no run).
- File on both sides: `tilted.pdf` (9,504 B, 4 pages of real text, tilted +3.0°, −1.5°, 0° and +0.6°). Used as an input file only; I read no source.
- Harness: Playwright (headless Chromium), 1280×632 and 390×664. Tilt measured two ways: a projection-profile search on a 144 dpi render (it reads 3.0, −1.5, 0.0, 0.6 on the source) and the turn matrix written into each page. Text and structure checked with pypdfium2 and pikepdf (qpdf syntax check).
- Evidence (not in git): `/mnt/project-files/evals-cache/f15/` (`ref/`, `out/`, `scripts/`). Our key screenshots: `/mnt/project-files/designs/f15/eval/` (`1-loaded`, `2-dialog`, `3-result` at 1280 and 390, plus `0-landing-390`). Reference notes and hashes: `docs/evals/cache/f15/manifest.json`.

## Checks

| # | Check | Reference | Ours | Result |
|---|---|---|---|---|
| 1 | Result quality | Tilt after: 0.0°, 0.0°, 0.0°, 0.0°. Turn applied 3.011°, 1.484°, none, 0.600°, so 0.011° and 0.016° are left on pages 1 and 2. Straight page byte-identical to the source. Nothing clipped | Tilt after: 0.0°, 0.0°, 0.0°, 0.0°. Turn applied 3.000°, 1.500°, none, 0.600°; nothing measurable left. Straight page byte-identical to the source. Nothing clipped. Mean render difference from the reference's output 0.1–0.8 of 255 | tie |
| 2 | Text and file size | Text still text (27 text objects a page, words identical on all 4 pages). 10,886 B (+14.5%). qpdf clean | Text still text (same counts, words identical on all 4 pages). 9,909 B (+4.3%). qpdf clean | tie (ours 9% smaller) |
| 3 | Options and control | Automatic or manual, chosen up front, not mixable. Automatic: **"Only specific pages" range field**, "only strongly skewed pages" tick (off). Manual: one page at a time, slider and six step buttons (±0.1°, ±0.5°, ±1°), every page starts at 0.0°, nothing detected for you. No angle shown before the run | Every page measured on load and shown straightened with its turn as a badge (−3.0°, +1.5°, none, −0.6°). Click a page: large view with guide lines, slider −15° to +15°, ±0.1° buttons, "Use detected", previous/next. Hand-set and detected pages mix in one run (checked: page 3 set to +1.0° came out at 1.0°, page 4 set to 0 stayed at 0.6°). "Skip slight tilts" (under 1°) works: page 4 left at 0.6°, status "2 pages to straighten". **No page-range field and no one-click "leave this page"**: leaving a page out means opening it and walking the slider to exactly 0.0° | **loss** |
| 4 | Clicks and time, file to download | 4 clicks (file, Continue, run, Download). File chosen → Download showing, every click made the instant it could be: **2.89 s** (one run; the upload has to finish first). Task start → Download: 1.48 s | 3 clicks (file, Straighten, Download). File chosen → Download showing, same method: **2.55 s** median of 3 (2.51, 2.55, 2.57). Straighten → Download: **0.58 s** median of 3 (0.575, 0.579, 0.583). 0 non-GET requests | win |
| 5 | Phone layout at 390 | No sideways scroll. Automatic path fits one screen. Manual mode: step buttons and the run button are below the fold. No pages shown outside manual mode | No sideways scroll on landing, loaded, dialog or result. Pages two across with badges; Skip slight tilts and Straighten docked in view (button y=602 of 664); the dialog fits whole, slider and Done in view; Download at y=601 | win |

## Gaps

1. **G-1 (check 3, blocks).** Add a way to limit the run to chosen pages in one action. The reference has a page-range field ("1-10,13"). Today a user who wants pages 5–10 of a 100-page scan straightened has to open the other 94 pages one by one, and even one page is slow: the slider moves about 0.16° per pixel, so landing on exactly 0.0° takes the ±0.1° button (30 presses from −3.0°). Fix: a "Leave as is" button in the page dialog next to "Use detected" (and ideally on the tile), plus either a "Pages" range field in the options or select-and-skip in the grid. Or get a written waiver.
2. **G-2 (check 3, does not block).** The reference's manual mode has ±0.5° and ±1° step buttons; ours has only ±0.1° and the slider. Coarse steps would also ease G-1.
3. **G-3 (check 4, does not block).** Of our 2.55 s, about 1.7 s passes before Straighten can be clicked (first thumbnail at 1.0–1.5 s, badges at 1.55 s, for a 9.5 KB file) and 0.54 s is a fixed hold on "Done" before Download appears; the turn itself takes about 30 ms. We win this check by 0.3 s against a single reference run, which is thin. Cutting the hold and the start-up wait would make it safe.
4. **G-4 (look, does not block).** In the page grid the three straightened previews are visibly soft next to the sharp untouched page 3, at both widths (`1-loaded-1280.png`, `1-loaded-390.png`). Draw the preview from a fresh render at the turned angle, not a turned bitmap.
5. **G-5 (coverage).** Not compared: an image-only scan (the task file is real text, so neither side had to resample a picture), the reference's strong-skew-only tick switched on (both tasks ran with it off, its default), a page-range run, error states, Lighthouse, axe and SEO. A re-check of our side after a fix needs no new reference tasks.

## Run 2

**Verdict: PASS.** Check 3 (options and control) now passes; it was the only lost check. No waiver was needed.

- Run: 2026-11-28, 11:30–11:34 UTC, by parity-evaluator. Re-check of check 3 only. Checks 1, 2, 4 and 5 were not re-measured; the 10 files made in this run were still straightened correctly, with text intact and qpdf clean.
- Candidate: staging `/deskew-pdf`, `/api/health` reported `bd8d90b`.
- Reference: **no new tasks.** Its side is the cached run-1 evidence (`docs/evals/cache/f15/manifest.json`). That cache holds its page-range field and its options as seen on screen, not a page-range run, so the reference's range behaviour is compared from its options only.
- File: `tilted.pdf` (4 pages tilted +3.0°, −1.5°, 0°, +0.6°). Each output was checked page by page three ways: is the page's content byte for byte the source's, what turn was written into it, and the tilt measured on a 144 dpi render.
- Evidence (not in git): `/mnt/project-files/evals-cache/f15/run2/` (10 outputs, captures of the dialog and the range field at 1280 and 390, scripts).

| # | Check | Reference (cached) | Ours, run 2 | Result |
|---|---|---|---|---|
| 3 | Options and control | "Only specific pages" range field and a strong-skew-only tick in automatic mode; manual mode is separate and cannot be mixed with it; no way to see what will be turned before the run | **"Only these pages"** field in the top row (docked above the button at 390) and a **"Leave as is"** button in the page dialog next to "Use detected". Both do what they say (table below). The pages on screen and the status line follow at once ("1 page to straighten"), so the effect is seen before the run. Range, hand-set pages and Leave as is mix in one run | **PASS** (tie on the range field; ours adds odd / even / last, the live preview and the one-click skip) |

| Case (1280 unless said) | Pages turned | Pages left byte for byte as the source | OK |
|---|---|---|---|
| Only these pages = `1` | 1 (3.0°) | 2, 3, 4 (still −1.5°, 0°, 0.6°) | yes |
| `2-4` | 2 (1.5°), 4 (0.6°) | 1 (still 3.0°), 3 | yes |
| `odd` | 1 | 2, 3, 4 | yes |
| `last` | 4 | 1, 2, 3 | yes |
| `9` | none: the field is marked invalid, says the file has 4 pages, and Straighten is disabled | | yes |
| `3` (the straight page) | none: "Every page is straight", Straighten disabled | | yes |
| Leave as is on page 2 | 1, 4 | 2 (dialog value +1.5° → 0.0° in one click; badge gone), 3 | yes |
| Leave as is on page 1, then Use detected; Leave as is on page 2 | 1, 4 | 2, 3 (page 1 went 0.0° → back to −3.0°) | yes |
| `1` plus page 4 set by hand to +1.0° | 1, 4 (by 1.0°, as set) | 2, 3 | yes (a hand-set page counts outside the range, as the spec says) |
| `1-2` plus Leave as is on page 1 | 2 | 1, 3, 4 | yes |
| 390: `2` | 2 | 1, 3, 4 | yes |
| 390: Leave as is on page 1 | 2, 4 | 1, 3 | yes |

Every output: 4 pages, page sizes unchanged, words identical to the source on every page, qpdf clean, 0 non-GET requests. Typing a range takes under 0.1 s; Leave as is takes two clicks and Done. No sideways scroll at 390; "Leave as is" sits at y=589 and Done at y=635 of 664.

### Gaps, run 2

1. **G-1 (check 3): closed.**
2. **G-2 (does not block), still open.** The dialog still has only ±0.1° step buttons and the slider; the reference's manual mode also has ±0.5° and ±1°.
3. **G-6 (wording, does not block), new.** With a page number past the end, the same sentence ("“9”: this file has 4 pages") is on screen twice, under the field and in the status line. Once is enough.
4. G-3 to G-5 were not re-checked and stay open as written (none blocks). Lighthouse, axe and the SEO audit have still not been run on `/deskew-pdf`.
