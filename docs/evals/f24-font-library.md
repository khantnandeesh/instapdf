# Evaluation: F24 Font library and font matching

## Re-evaluation 2026-11-25, fifth (staging 6e82ac3)

- **Verdict: FAIL** (narrowly: one P0 criterion, AC-312, fails on what happens after "Use your own font" in the mixed case. Both cases the fourth evaluation blocked on are fixed.)
- Evaluated: 2026-11-25, 05:10–06:45 UTC, by parity-evaluator. No source code, builder notes or PR text were read.
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf. `/api/health` reports version `6e82ac353ad0778dda906b406ca26a230c9507d2`. `/fonts/lib/manifest.json` counts 1,972 families, 7,937 faces.
- Sizes: 1280x800 and 390x844 (touch), device scale factor 2, headless Chromium 1243. AC-312 also at 320x640 (touch). The baseline check of AC-298 at device scale factors 1 and 2 (the bar), and for information at 3 (390), 1.25 and 1.5 (1280).
- Sejda evidence: all from the cache (`/mnt/project-files/evals-cache/f24/`, notes in `docs/evals/cache/f24/manifest.json`). **No new Sejda task was run.**
- Our scripts: `docs/evals/cache/f24-font-library/eval-5/scripts/` (`run.sh` lists the order). Our outputs, logs, Lighthouse runs and the capture sets (`shots/a298.tar`, `shots/v298.tar`): `/mnt/project-files/evals-cache/f24-font-library/eval-5/` (not in git). Our screenshots: `/mnt/project-files/designs/fonts/eval-5/`. Fixtures: those of `eval-4/fixtures/` and `tests/parity/editor/`.

### Summary

| Gate | Bar | Result | OK |
|---|---|---|---|
| P0 ACs | all pass | **22 / 23 judged** (AC-312 fails, on one continuation of its flow) | **no** |
| All ACs | at least 90% | 25 / 27 judged (93%), counting AC-296 as the deferred fail it still is | yes |
| Lighthouse performance (mobile) | at least 90 | 100 / 100 / 99 (median 100) | yes |
| axe critical issues | none | 0 critical. 0 violations in the 8 states of the last run at both sizes; 1 **serious** one (not critical) in 4 of the 9 new mixed-case states, see gap 3 | yes |
| Micro-checks | no lose unless owned elsewhere or waived | M2 lose (owned by F23 per the lead's note, as before); rest win | yes, with M2 as noted |

Fixed since the fourth verdict (both re-run, not taken on trust):

- **AC-298, the baseline.** On the ten lines of the last run, at 1280 and 390, device scale 1 and 2, in 3 of 3 fresh sessions each (120 sessions), the opened box's ink is within **0.28 CSS px** of the page's vertically (was 0.9–1.0 on eight line-and-size cases). The whole-pixel shift that best matches the page is 0 on all 40.
- **AC-312, the two cases of the last verdict.** " ř ⸘" on "in full." now gives "Not in this font: ř ⸘ · Tinos · STIX Two Text · No font has ⸘. · Use your own font", the status "Tinos draws ř. No font here has ⸘. Use your own font, or remove it.", and Enter is refused in 0.15–0.28 s with "This font has no “⸘”." (was 1.0–1.8 s, naming ř as well). The phone row reads "ř [Tinos]  ⸘ no font [Your font]" and fits at 320.

What blocks now:

1. **AC-312: after the person's own font is added in the mixed case, the editor again says a font draws a letter it does not have, and in one case does not offer the added font and goes silent for 2 to 5 seconds.** Not tested before this round (the fourth run added a font only in the single-letter case, which still passes). Details in the criterion row and gap 1.

### Criteria

The editor rows (AC-286, AC-298 to AC-304, AC-310 to AC-313) were run at both sizes. The library, matcher and output rows were run at 1280 only, except AC-283, AC-290, AC-294 and AC-295 (both sizes). "Same as the fourth run" means the same script gave the same log once times are masked (`logs/difflog.txt` pattern, `scripts/difflog.py`), and the numbers quoted were read from this run.

| AC | Pri | Result | Evidence |
|---|---|---|---|
| AC-271 | P0 | PASS | `/licenses` (2.9 MB): 1,972 distinct licence links; the served `index/families.08543aad.json` has 1,972 families; no id missing either way and no family name missing from the page; "Selawik (font library) · self-hosted · OFL-1.1" is listed and `licences/selawik.txt` opens with the version and release address (`logs/ac271.log`) |
| AC-275 | P0 | PASS | Index file `max-age=31536000, immutable`; `manifest.json` 300 s. POST 400, PUT 404. CSP `font-src 'self'; connect-src 'self'; form-action 'self'`. 0 non-GET requests in every session of this run |
| AC-280 | P0 | PASS | Same as the fourth run (`logs/s9.log`): "them" → "us all" adds no font object. Same-length edits on 14 named-only lines add none (`outputs/s283-ac283-named-only-1280.pdf`, 11,713 → 11,872 B) |
| AC-281 | P0 | PASS | Same as the fourth run (`logs/d.log`, 113 lines identical; `logs/s288c.log` same-family part) |
| AC-282 | P0 | PASS | Same as the fourth run (`logs/d.log`). Gap 6 below still stands |
| AC-283 | P0 | PASS | 14 of 14 named-only fonts at both sizes and the 3 standard-font lines: the box opens in the twin in 21–69 ms, box width equals line width, "time" → "emit" leaves the width unchanged, the last origin moves 0.0 pt and "END" stays at 500.0 pt in the output; menu rows "… · Same widths" ready 0.55 s after the menu opens, 0 signature files. Segoe UI's own widths not checked, as before |
| AC-284 | P0 | PASS | The fourth run's sample (152 faces of 53 families, names hidden) run again: true family first for **152 of 152**, all "Exact", 8–16 s per 16-font file (`logs/score.log`) |
| AC-286 | P0 | PASS | Same as the fourth run (`logs/s5.log`, `s6.log`). But see gap 1 (c): when two stand-ins are used the notice names one |
| AC-288 | P0 | PASS | Same as the fourth run: all 11 same-script and 11 cross-script lines of `ac288-scripts2.pdf` give the same faces (`logs/s288c.log`) |
| AC-290 | P0 | PASS (as the spec words it) | Landing: no font or library request at either size; JS by load 141 KB. Files with embedded fonts: no `/fonts/` request in the 6 s after opening. Named-only files: the twins' Latin files 0.3–1.5 s after opening, no index, no signature file. First page drawn in 246–517 ms in its 12 runs (`logs/g6.log`) |
| AC-291 | P0 | PASS | Same as the fourth run (`logs/c-d.log`, `c-p.log`): the menu loads the preview fonts in view |
| AC-292 | P0 | PASS | Same as the fourth run (`logs/s9.log`, Playfair Display). See gap 1 (b) for one letter that is shown in a font other than the one saved |
| AC-293 | P1 | PASS | Same as the fourth run |
| AC-294 | P0 | PASS | Same as the fourth run at both sizes; no request with the file in any own-font session of this run (0 non-GET) |
| AC-295 | P0 | PASS | Same as the fourth run at both sizes |
| AC-296 | P1 | FAIL (deferred) | Not re-run. The spec still lists it as open |
| AC-298 | P0 | PASS | **Baseline (the part that failed).** `scripts/v298.cjs`, 3 fresh sessions per line, read two ways (`v298.py`: ink centroid of the capture; `v298b.py`: centroid and best whole-pixel shift on the line's own rows only, so neighbouring lines cannot dilute it). The ten lines of the fourth run, vertical offset in CSS px, identical in 3 of 3 sessions: at 1280 ×1 0.00 to −0.28, 1280 ×2 0.00 to −0.14, 390 ×1 0.00 to −0.16, 390 ×2 0.00 to −0.11 (largest: "Spaced out words here"). The eight cases that were 0.9–1.0 off are now 0.00–0.06 ("Results don’t match…", "Office ligatures…", Georgia, Segoe UI, "A footnote mark follows.", the mono line on a phone). In the 39-line run at ×2 every line is within 0.5; **two sit exactly on it** (one device pixel high): "non-refundable" at 1280 ×2 (−0.50; 0.01 at ×1) and "Times New Roman Italic…" at 390 ×2 (−0.50; 0.00 at ×1), gap 4. Ink off by more than a device pixel on opening: 0.0–7.6% at 1280 and 0.0–11.1% at 390 (was up to 31.9% and 35.3%); of the lines that were 15–35%, seven are now 0.0%, the Type 1 stand-in line is 7.6% and two phone lines are 11% ("and it stays…", and the one-character line "1"). Font, start, length, colour: as before. No other font is shown at any moment (39 of 39 timelines). For information, outside the bar: ×3 at 390 within 0.35 on the ten lines; at 1280 ×1.5 one of 14 lines is 0.66 high and at ×1.25 one of 14 is 0.79 high (one device pixel each), gap 4. A Type 1 line opens in a stand-in (spec) |
| AC-299 | P0 | PASS | 0 animations and opacity 1 from the first frame on 39 of 39 lines at both sizes; `getAnimations()` empty at 50, 600 and 2,000 ms. Selection "Caret" everywhere. Caret within 7.3 px of the click on 38 of 39 lines at 1280 and 2.4 px on 38 of 39 at 390; the one out is gap 7 (Type 1 file, 174 and 57 px until the stand-in arrives), as before |
| AC-300 | P0 | PASS | Marked 13–69 ms after typing on embedded and named-only lines, named with fonts or "No font here has it" in 0.4–3.3 s; focus stays in the box. Enter: " ⸘" refused in 0.19–0.26 s, " ř" saved in 0.36–0.68 s, " नया" in 0.69–0.84 s, " नया ใหม่" in 0.68–0.76 s (`logs/s300q-d.log`, `s300q-p.log`) |
| AC-301 | P0 | PASS | At most three fonts (two on a phone), closest first and in use: "Tinos, STIX Two Text, Fenix"; Greek "Tinos, STIX Two Text, Arimo"; picking one redraws at once and is written on Enter (`pick` runs of `logs/s312o.log`: ř and ⸘ both in `BERRYA+DejaVuSans` after DejaVu Sans is picked). After an own font is added in a mixed case the font marked "in use" is not the one that draws every letter: counted under AC-312 |
| AC-302 | P1 | PASS | Same as the fourth run |
| AC-303 | P1 | PASS | `font-kerning: none`, `font-variant-ligatures: none` on all 39 boxes at both sizes |
| AC-304 | P0 | PASS | Footnote line: the mark stays drawn. No neighbour ink hidden on 38 of 39 lines at each size; the 77 and 51 px counted on the mark's own row are the anti-aliasing noted last time. Hint: under, beside or over as before (`logs/s8-d.log`: 3 under, 2 beside, 3 over), one opaque 26 px row, Tab and Shift+Tab work, status text present. After an own font is added the row's buttons stand outside its paper (gap 2) |
| AC-310 | P0 | PASS | Same as the fourth run at both sizes (`logs/s3a-*.log`, `s3c-*.log`, `s4.log`). In every refusal of the AC-312 run the text stayed in the box with the caret (42 of 42) |
| AC-311 | P0 | PASS | Same as the fourth run (`logs/s3c-*.log`, `s3d-*.log`) |
| AC-312 | P0 | **FAIL** (narrow) | **Passes, before a font is added** (54 sessions: "in full." and a named-only Arial line, 9 texts, at 1280, 390 and 320; `logs/s312n-summary.log`). Embedded line, " ř ⸘", " ⸘ ř", " Ω ⸘": the hint names both letters, offers Tinos and STIX Two Text, says "No font has ⸘." and offers "Use your own font"; status "Tinos draws ř. No font here has ⸘. Use your own font, or remove it."; Enter refused in 152–281 ms with "This font has no “⸘”. Your text is still in the box." (box open, caret in it). " नया ⸘ ok": "Noto Serif Devanagari draws न य ा k. No font here has ⸘."; refused in 562–612 ms (575–694 ms in the heavier loop of `s300q`; it was 4.8 s), naming only ⸘. " ř ⸘ Ω ⸙": "Tinos draws ř Ω. No font here has ⸘ ⸙." Phone and 320: "ř [Tinos] ⸘ no font [Your font]", one 40 px row above the dock, nothing outside the screen, no letter cut. Named-only line: only ⸘ is listed (the twin draws ř and Ω), and the message names only ⸘. Single letters: " ř" and " Ω" saved in 0.21–0.52 s, " ⸘" and " ⸘ ⸙" "No font here has it. Use your own font" as before. No font is fetched for a letter none has. **Fails after "Use your own font"** (`own-dejavu.ttf`, which has ⸘ and ř; `logs/s312n.log`, `s312o.log`, `s312p.log`, `s312q.log`; `ac312-own-ř_⸘-enter-added-1280.png`, `ac312-deva-own-added-नया_⸘_ok-1280.png`): **(a)** in every mixed case, at all three sizes, the status then reads "Not in this font: ř ⸘. **Tinos draws them.**" (or "Noto Serif Devanagari draws them.", "Tinos draws ř ⸘ Ω."), with Tinos still marked in use. Tinos has no ⸘: the file gets ř from `BERRYA+Tinos` and ⸘ from `BERRYF+DejaVuSans`. The phone row pairs "ř ⸘ Ω" with an unpressed DejaVu Sans while the status says Tinos. **(b)** Until Enter the box draws ⸘ in a system font (its stack is the document font, Tinos, Times), not in the font that will be saved. **(c)** For " नया ⸘ ok" the added font is **not offered**: the hint shows three Devanagari fonts (two on a phone), "No font has ⸘" is gone, DejaVu Sans is nowhere, on both line kinds at all three sizes. The criterion says "a font added that way is offered at once". **(d)** For that text Enter then closes the box and shows the old line, with no message and Undo off, for **4.1–5.3 s** on the embedded line (4 of 4 runs) and 2.1–2.4 s on the named-only line (4 of 4) before the text appears (0.64–0.78 s for " नया ok" with no font added). The text is saved in the end and Download waits for it, so nothing is lost. In the single-letter case the added font is offered in 0.27–0.39 s, marked in use, drawn in the box, and saved in 0.2–0.3 s: that part passes, as before |
| AC-313 | P0 | PASS | Row 366x40 px at y 722 above the dock (296x40 at y 518 at 320), the same on every line tried; "Missing: ř" with at most two fonts, or the paired form of AC-312; page and scroll unchanged; Tab reaches the fonts (`logs/s8-p.log` same as the fourth run) |
| AC-305, AC-306 | P0 | informational | Same as the fourth run (`logs/s10.log`). Ink not re-measured. AC-307, AC-308 not run |

Not judged: AC-270, AC-272, AC-273, AC-274 (crawler, not visible on staging); AC-285, AC-287, AC-297 (the spec lists them as not built).

### Regression checks

- **Downloaded files carry no extra font files.** All 100 files downloaded in this run were compared with their sources (`scripts/outfonts.sh`, `fonts.py`; `logs/outfonts.log`): every source font object is unchanged in every file, no font the source only names gained a font program (14 of 14 still without one in the named-only files), all pass the syntax check, page counts unchanged. What is added is only the subset for the letters typed: 350–2,752 B for library fonts; 12.9–13.2 KB for one or two letters of the person's own font (gap 9).
- **Gap 6 of the third list (page and box in the same font):** named-only Georgia and Segoe UI differ by 0.0% of ink beyond a device pixel on opening at both sizes, and by 0.00 CSS px vertically (they were ±1.0).
- JS by load 141 KB. First page 214–517 ms in 39 runs (one cold run 940 ms).

### Sejda tasks spent

**None of the two allowed.** No request was made to sejda.com. Every reference number below is from the cache (tasks T1, T2, T2b of the earlier rounds). The cache holds no Sejda run with a letter no font has; none was needed, because AC-312 is judged against our own criterion and M9 already rests on what Sejda does with a missing letter (nothing is said, or a blocking dialog).

### Micro-checks

| Check | Sejda (cache) | BerryPDF now | Result |
|---|---|---|---|
| M1 Landing | 17 / 28 words before the action | 3 words; Open PDF in view at all 7 viewports | win |
| M2 Upload start | click, drop, 3 clouds, URL | click, drop, paste, blank page | **lose**, owned by F23 (lead's note) |
| M3 Loading | 4.96 s pick to text | first page 214–517 ms in 39 runs (one 940 ms) | win |
| M4 Display | 600 px page at 390 | fits the width; named-only fonts drawn in their twins | win |
| M5 Interaction | one run at a time; on CFF a blocking dialog on the first letter | whole line, own fonts, hint, Tab and Enter; CFF "O" saved 323 ms after Enter | win |
| M6 Options | 36 fonts, no search, no own fonts | 1,972 families, search, own file, installed fonts, twins "Same widths" | win |
| M7 Processing | 6.0 s, 6.5 s, 6.6 s | Download to file 1,095–1,161 ms at 1280 (median 1,149), 1,015–1,131 ms at 390 (median 1,056) | win |
| M8 Output fidelity | CFF: whole line redrawn in non-embedded Helvetica, moved in the reading order | CFF: line keeps Charter, one letter from a Charis SIL subset; source fonts untouched in all 100 outputs | win |
| M9 Errors | two blocking dialogs; nothing about missing letters | plain messages, text kept, the letters no font has are named; but see AC-312 (a wrong status after an own font is added) | win |
| M10 Privacy | 10,645 B and 30,583 B uploaded on pick | 0 non-GET requests in every session, own-font sessions included | win |
| M11 Look | floating toolbar over the text | closed outline, one hint row, slim phone row, no fade; the line no longer steps on opening | win |
| M12 First screen fit | 1366x657: 45% of the screen; 390x664: 46% | 75% / 73% / 77% / 74% / 76% at the five viewports; Download in view | win at the two viewports with a reference |

### Lighthouse and axe

- Lighthouse 12.8.2 mobile on `/edit-pdf`: performance 100 / 100 / 99 (median 100), accessibility 100, best practices 100, LCP 1.4–1.6 s, CLS 0, TBT 50–100 ms. SEO 66 because staging is noindex.
- axe 4.14.1: 0 violations in landing, editor open, line open, missing-letter hint, refused line kept open, second hint, stand-in notice and the Change menu, at both sizes (`logs/axe.log`). New states (`scripts/axe2.cjs`, `logs/axe2.log`: mixed hint, mixed refusal, own font added, at 1280, 390 and 320): 0 at 1280; at 390 and 320 one **serious** violation in the hint and the refusal, `label-content-name-mismatch`: the button shows "Your font" and is named "Use your own font" (gap 3). No critical issue.

### Gap list

Blocking:

1. **AC-312 (P0): finish the mixed case after "Use your own font".** Re-check with `scripts/s312n.cjs` (OWN=1), `s312o.cjs`, `s312p.cjs` and `s312q.cjs`.
   - (a) Say which font draws which letter after a font is added, as is done before: "Tinos draws ř. DejaVu Sans draws ⸘." Today the status says "Tinos draws them." and the phone row and the status disagree.
   - (b) Draw the letter in the box with the font that will be saved (the added font is not in the box's stack until it is picked).
   - (c) Offer the added font when it is the only one with a letter, even when three library fonts are listed for other letters (" नया ⸘ ok": DejaVu Sans is not shown at any size). The notice after saving names one stand-in ("Using Tinos.") when two were written.
   - (d) Answer Enter as fast as without the added font. " नया ⸘ ok" with an added font: 4.1–5.3 s (embedded) and 2.1–2.4 s (named-only) with the box closed, the old line on screen and nothing shown; " नया ok" without it: 0.64–0.78 s. At the least keep the box, or show that the save is under way.
   - If the owner accepts this state as it is, that needs a waiver in writing; (c) is against the criterion's own words.

Open, not blocking:

2. **Hint row after a font is added (1280).** The row's paper keeps its old width: "STIX Two Text", or "Tiro Devanagari Hindi" and "Martel", stand outside it on the page (`ac312-own-ř_⸘-enter-added-1280.png`). At 320 the font name is cut without an ellipsis ("Noto Serif D") and the second font in the message runs off its edge. In the phone message after a refusal the letter before the first font ("ř") is not visible at 390.
3. **axe, serious:** phone button "Your font" has the name "Use your own font"; make the name contain the visible words.
4. **AC-298, one device pixel.** "non-refundable" (1280 ×2) and "Times New Roman Italic…" (390 ×2) open exactly 0.50 CSS px high, on the bar. At 1280 ×1.5 "Times New Roman Italic…" is 0.66 high and at ×1.25 "Please bring…" is 0.79 high (one device pixel; scales the bar does not name, common on Windows laptops). Re-check with `OUT=… DSFS=1.5,1.25 scripts/v298.cjs` and `v298b.py`. The owner or lead should say whether fractional scales belong in the bar.
5. **Enter in the Devanagari mix sits on the 0.6 s bar:** 562–612 ms (694 ms once in the heavier loop). The Latin and Greek mixes take 0.15–0.28 s.
6. **Menu and line disagree** (`ac282-name-lies.pdf`, line 3: menu "Adamina · Close", the edit saves Besley). As before.
7. **First stand-in by shape still takes about 2.6 s** (`latex-type1.pdf`, first line: caret 174 px from the click at 1280, 57 px at 390, until the font arrives). On embedded lines the hint's fonts appear 2.1–3.3 s after the letter.
8. **Screen-reader text of the accent line** still reads "cafe´ naıve". **Names read oddly** ("ArialMT isn’t in this file"). **Stale message** after a kept-open line is saved by leaving it. As before.
9. **Fonts:** each built-in twin file is still requested twice; `BERRYA+` / `BERRYB+` pairs per slice (three objects for " Ω ⸘ ok"); one letter of an own font costs 12.9 KB (the subset keeps the font's hinting programs).
10. **"Use your own font" from the keyboard:** Tab then Enter opened the file dialog at 1280 in every run this time, but not at 390 in one run (`logs/s3c-p.log`).
11. **Carried over, not re-checked:** AC-296; "Replace with new text" font objects and reading order; focus on `body` after a mouse-opened edit is saved; horizontal scaling shown as spacing; the NUL after a saved Devanagari word in PDFium (seen again: "नया￾"); heavier apostrophe and dash in the Type 1 stand-in.

### Not checked

- AC-285, AC-287, AC-297, AC-307, AC-308 and AC-296 were not run. AC-305 and AC-306 were opened and saved but their ink was not re-measured.
- AC-283: Segoe UI's own widths against Selawik's (no copy of the font).
- An own font that has ⸘ but not ř, and an own font added before the letter is typed, were not tried; only `own-dejavu.ttf` (TTF) was used in the mixed case.
- The phone row against a real on-screen keyboard; the Local Font Access prompt; a real screen reader (the status text was read from the page).
- First-screen fit on Sejda at 1280x632, 1536x730 and 1920x969 (no reference run, as before). No new side-by-side images were made: the Sejda side is unchanged and the earlier ones in `/mnt/project-files/comparisons/f24/` still apply.
- Width 375 px: the phone runs were at 390 and 320.
- `docs/evals/cache/f24-font-library/manifest.json` was not updated (this round's brief limits edits to this file and `eval-5/scripts/`); output hashes are in `eval-5/outputs/sha256.txt` in the project files.

---

## Re-evaluation 2026-11-25, fourth (staging 6fbd651)

- **Verdict: FAIL** (narrowly: two P0 criteria fail on one case each; everything the third evaluation blocked on is fixed)
- Evaluated: 2026-11-25, 03:25–04:25 UTC, by parity-evaluator. No source code, builder notes or PR text were read.
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf. `/api/health` reports version `6fbd65172e90bfc98f9591b3b5639afb338a5471`. `/fonts/lib/manifest.json` counts 1,972 families, 7,937 faces.
- Sizes: 1280x800 and 390x844 (touch), device scale factor 2, headless Chromium 1243. Lines low on the page were run at 1280x1100 or 1280x1500. The baseline check of AC-298 was repeated at device scale factor 1 as well.
- Sejda evidence: all from the cache (`/mnt/project-files/evals-cache/f24/`, notes in `docs/evals/cache/f24/manifest.json`). **No new Sejda task was run.**
- Our scripts: `docs/evals/cache/f24-font-library/eval-4/scripts/` (`run.sh` lists the order). Our outputs, logs, Lighthouse runs, comparison captures and fixtures: `/mnt/project-files/evals-cache/f24-font-library/eval-4/` (not in git). Our screenshots: `/mnt/project-files/designs/fonts/eval-4/`.

### Summary

| Gate | Bar | Result | OK |
|---|---|---|---|
| P0 ACs | all pass | **21 / 23 judged** (AC-298 and AC-312 fail, each on one case) | **no** |
| All ACs | at least 90% | 24 / 27 judged (89%), counting AC-296 as the deferred fail it still is | **no** |
| Lighthouse performance (mobile) | at least 90 | 100 / 99 / 99 (median 99) | yes |
| axe critical issues | none | 0 violations of any level in 8 states at both sizes | yes |
| Micro-checks | no lose unless owned elsewhere or waived | M2 lose (owned by F23 per the lead's note); rest win | yes, with M2 as noted |

Fixed since the third verdict (all re-run, not taken on trust):

- **AC-271:** `/licenses` links 1,972 licence texts and the served index has 1,972 families; the two sets are equal, and Selawik is on the page.
- **AC-288:** a serif Devanagari, Bengali or Hebrew document font, and Amiri, now get the serif face of another script.
- **AC-298 (a), (c):** "caf é" keeps its gap in the box; a named-only Georgia or Segoe UI is drawn in the same font on the page and in the box.
- **AC-299:** no animation on any of 39 lines at either size.
- **AC-300:** on named-only lines a letter the stand-in cannot draw is marked and named as typed, and Enter answers in 0.4–0.7 s.
- **AC-304:** the raised footnote mark stays drawn while its line is open.
- Gap 8: the menu of a named-only file is ready in 0.5 s with no signature files fetched.

What blocks now:

1. **AC-298 (one part left): the opened box sits one whole CSS pixel above or below the page's text on some lines.** Font, start, length and letter shapes now match everywhere (0.0% of ink off once aligned). But the line steps 1 px vertically on a click, the same in 3 of 3 fresh sessions. This is the "rises about 1 CSS px" of the last verdict (its AC-298 item (d), gap 13), now measured at both sizes, and it also hits the named-only Georgia and Segoe UI lines that gap 6 was about.
2. **AC-312 (new case, not tested before): a letter no font has, typed together with a letter library fonts do have.** On an embedded line, " ř ⸘" gives the hint "Not in this font: ř ⸘ · Tinos · STIX Two Text · Fenix" and the screen-reader text "Tinos draws them". No font here has ⸘, the hint does not say so, and "Use your own font" is not offered. Enter is then refused with "This font has no “ř” “⸘”", with the same three fonts still on offer.

### Criteria

The editor rows (AC-286, AC-298 to AC-304, AC-310 to AC-313) were run at both sizes. The library, matcher and output rows were run at 1280 only, except AC-283, AC-290, AC-294 and AC-295 (both sizes).

| AC | Pri | Result | Evidence |
|---|---|---|---|
| AC-271 | P0 | PASS | `/licenses` (prerendered, 2.9 MB): 1,972 distinct `/fonts/lib/licences/<id>.txt` links; the served `index/families.08543aad.json` has 1,972 families; no id missing either way, no family name missing from the page. "Selawik (font library) · self-hosted · OFL-1.1" is listed; `licences/selawik.txt` opens with the version and release address |
| AC-275 | P0 | PASS | Index file `max-age=31536000, immutable`; `manifest.json` 300 s. POST 400, PUT 404. CSP `font-src 'self'; connect-src 'self'; form-action 'self'`. 0 non-GET requests and one host in every session |
| AC-280 | P0 | PASS | "them" → "us all": no hint, no notice, output has the source's 5 font objects unchanged and no new one. Same-length edits on 14 named-only lines add no font object (`outputs/s283-ac283-named-only-1280.pdf`). Edits only, as before |
| AC-281 | P0 | PASS | Lora, Merriweather, Montserrat: ř, á from the same family, no notice. Carlito + " Ωμέγα Жизнь": "Carlito (in use), Arimo, Advent Pro", saved with no stand-in notice. Eleven document fonts of other scripts take a new letter of their own script from the same family (`outputs/s288c-same.pdf`: `BERRYA+Amiri`, `NotoKufiArabic`, `NotoNastaliqUrdu`, `NotoSerifDevanagari` and so on) |
| AC-282 | P0 | PASS | Named Lora, drawn in Roboto → Roboto; named Roboto, drawn in Playfair → Playfair Display; named Inter, drawn in DejaVu Serif → Besley; named Arial, Calibri, Segoe UI, Times New Roman, Georgia or Helvetica but drawn in Playfair, Lora or Roboto → the font that looks like it, never the twin. Gap 5 below still stands |
| AC-283 | P0 | PASS | All 14 named-only fonts: menu "Arimo / Tinos / Cousine / Carlito / Caladea / Gelasio / Selawik · Same widths", ready 0.5 s after the menu opens, 0 signature files. The box opens in the twin in 22–66 ms on every line at both sizes (Georgia and Segoe UI included now). "time" → "emit": box width equals line width on 14 of 14 lines at both sizes and on the 3 standard-font lines; last origin moves 0.0 pt and "END" stays at 500.0 pt in the outputs. A typed ř is saved in the twin's subset with "… isn’t in this file. Using Arimo." Segoe UI's real widths were not checked, as before |
| AC-284 | P0 | PASS | New sample generated today from the served library: 152 faces of 53 families, names and style flags hidden: true family first for **152 of 152**, all "Exact", 9–17 s per 16-font file |
| AC-286 | P0 | PASS | Only the missing letters change font in the output. Desktop: "Liberation Serif isn’t complete in this file. Using Tinos. Change · Use your own font". Phone: "Liberation Serif isn’t complete. Using Tinos." with Change; "Add a font file" inside Change. No modal |
| AC-288 | P0 | PASS | `fixtures/ac288-scripts2.pdf`, a letter of another script typed into each line: Noto Serif Devanagari → **Noto Serif Bengali**; Noto Serif Bengali → **Noto Serif Thai**; Noto Serif Hebrew → **Noto Naskh Arabic**; Amiri → **Noto Serif Hebrew**; Nastaliq → Noto Serif Hebrew; the sans fonts and Kufi → Noto Sans of the script. The output carries those subsets (`outputs/s288c-cross.pdf`). Latin serif and sans lines as before (Noto Serif Devanagari / Noto Sans Devanagari, Noto Naskh Arabic and so on). Shape matching inside a script is not built (spec) |
| AC-290 | P0 | PASS (as the spec now words it) | Landing: no font or library request at either size; JS by load 141 KB. Files with embedded fonts (`chrome-justified-mixed`, `libreoffice-memo`, `latex-type1c`): **no** `/fonts/` request in the 6 s after opening. Files that only name fonts: the twins' Latin files load 0.3–1.5 s after opening (Arimo, Tinos, Cousine, Carlito, Caladea), and for Georgia and Segoe UI also `lib/manifest.json`, the family list, the Selawik and Gelasio family files and their Latin files. No index, no signature file. First page drawn in 248–464 ms either way. See gap 9 (each built-in twin file is fetched twice) |
| AC-291 | P0 | PASS | Menu open: the preview fonts on screen; scrolling loads the rows that come into view (17 of 354 files) |
| AC-292 | P0 | PASS | Playfair Display for added text: 18 of 18 letters identical in outline and advance to the served `latin-400-normal.3afd64d1.woff` |
| AC-293 | P1 | PASS | Search over all families; one scroll region (380 / 5110); "In this document", "Standard", "On this device", "All fonts", and "Closest matches" from Change |
| AC-294 | P0 | PASS | TTF, WOFF, WOFF2 and an OTF (CFF) accepted; `.txt`, a fake `.ttf`, an empty `.otf` and a truncated TTF refused with the same plain messages; no request with the file. Both sizes |
| AC-295 | P0 | PASS | `fsType` 2 refused: "This font’s licence settings don’t allow putting it in a PDF." `fsType` 4 accepted. Both sizes |
| AC-296 | P1 | FAIL (deferred) | Not re-run. The spec still lists it as open; the lead's note says it does not block |
| AC-298 | P0 | **FAIL** (narrow) | Fixed: "café naıve" opens with its gap (1.9% of ink off at 1280, was 18.6%; `ac298-cafe-before-open-1280.png`); the footnote line is unchanged (0.0%); named-only Georgia and Segoe UI are the same font on the page and in the box (0.0% of ink off once aligned; was 22.5% and 7.9%; `gap6-georgia-before-open-1280.png`); the other `latex-type1c.pdf` lines 0.0–4.4%. No other font is shown at any moment. **Still wrong: the baseline.** On these lines the box's text sits exactly 1.0 CSS px below (+) or above (−) the page's, measured by ink centroid, identical in 3 of 3 fresh sessions (`logs/v298-shift.log`): at 1280 ×2 "Results don’t match…" (`latex-type1c.pdf`) +1.0, "Office ligatures…" (`cid-bold-run.pdf`) +1.0, Georgia +1.0; at 1280 ×1 the same three, plus "A footnote mark follows." +0.9 and Segoe UI −1.0; at 390 (×1 and ×2) Georgia −1.0, Segoe UI +1.0, "The quick brown fox…" (`reportlab-mono-subset.pdf`) +1.0. Other lines are within 0.5 px. In the 39-line run 15–32% of such a line's ink is off by more than a device pixel on opening (`logs/cmp3-d.log`, `cmp3-p.log`, `shift-d.log`, `shift-p.log`; `ac298-1px-step-results-line-zoom-1280.png`). The criterion says "on the same baseline". Also open: the phone lines "Please bring…" and "and it stays…" are 0.4–0.6 px high with 20% of ink off after alignment; a Type 1 line opens in a stand-in (spec) |
| AC-299 | P0 | PASS | 0 animations and opacity 1 from the first frame on 39 of 39 lines at both sizes; `getAnimations()` on the box is empty at 50, 600 and 2,000 ms. Selection type "Caret" everywhere. Caret within 7.3 px of the click on 38 of 39 lines at 1280 and within 2.4 px on 38 of 39 at 390. The one line out is gap 4 (first line of a Type 1 file, 174 px at 1280 and 57 px at 390 until its stand-in arrives) |
| AC-300 | P0 | PASS | **Named-only lines** (`ac283-named-only.pdf` Arial and Georgia, `std14-reportlab.pdf`), both sizes: " ⸘" is underlined and named 0.27–0.64 s after typing with "No font here has it. Use your own font"; Devanagari and Thai are underlined in 25–45 ms and their fonts offered in 1.0–1.4 s; status text present; focus stays in the box. Enter answers in 0.45–0.70 s for " ⸘" (refusal, text kept), 0.51–0.72 s for " नया" (saved in Noto Sans / Noto Serif Devanagari), 0.52–0.69 s for " नया ใหม่", 0.34–0.67 s for " ř" (saved in the twin). It was 3.4–7.8 s. Embedded lines as before: eleven other alphabets and ⸘ marked. See gap 2 for the mixed case (2.4–2.8 s) |
| AC-301 | P0 | PASS | At most three fonts, closest first and in use: Latin "Tinos, STIX Two Text, Fenix"; Greek and Cyrillic "Tinos, STIX Two Text, Arimo"; Hebrew "Tinos, Noto Serif Hebrew, Frank Ruhl Libre"; Carlito line "Carlito, Arimo, Advent Pro". A font taken automatically is forgotten after Escape. The false offer in the mixed case is counted under AC-312 |
| AC-302 | P1 | PASS | Families of the same kind with the alphabet are offered for the scripts tried (Greek, Cyrillic, Hebrew, Arabic, Devanagari, Thai, Tifinagh, Georgian, Cherokee, Ogham) |
| AC-303 | P1 | PASS | `font-kerning: none`, `font-variant-ligatures: none` on all 39 boxes at both sizes |
| AC-304 | P0 | PASS | "A footnote mark ¹follows." open: the mark is drawn, 0.0% of the line's ink off at 1280 and 1.6% at 390 (`ac304-footnote-mark-before-open-1280.png`). Clicking the mark opens that same line. No neighbour ink is hidden on any of the 39 lines (the 228 and 139 px counted for the mark's row are anti-aliasing inside the opened line: as many pixels are gained as lost and the shapes match). Hint: under on a middle line, beside on "in full.", over on the first body line; one opaque 26 px row; Tab and Shift+Tab work; status text present |
| AC-310 | P0 | PASS | Refusal keeps the text and says so; leaving with the same text neither retries nor drops; Enter retries; changed text saves on leaving; Escape restores from the box and from elsewhere; Download with the line open writes no file and says why; another line cannot replace it. Both sizes |
| AC-311 | P0 | PASS | " for Dvořák" on line 1 refused with "Replace with new text"; " for", " a", "b", "c" inside the clip are saved. Replace writes the line once, bold and italic kept |
| AC-312 | P0 | **FAIL** (narrow, new case) | Passes when every missing letter has no font: " ⸘" and " ⸘ ⸙" give "No font here has it. Use your own font" on embedded and named-only lines at both sizes; DejaVu Sans is offered at once after the file is read (no request) and the next leave saves ⸘. **Fails when such a letter is typed with one that library fonts have, on an embedded line** (`chrome-justified-mixed.pdf`, "in full.", both sizes; `logs/s312m.log`, `ac312-mix-embedded-ř_⸘-enter-1280.png`): " ř ⸘", " ⸘ ř", " Ω ⸘" → hint "Not in this font: ř ⸘ · Tinos · STIX Two Text · Fenix", status "Tinos draws them."; nothing says no font has ⸘ and "Use your own font" is not in the hint. Enter is refused after 1.0–1.8 s (4.8 s for " नया ⸘ ok") with "This font has no “ř” “⸘”" (for " नया ⸘ ok" the message also lists "o" and "k"). Named-only lines get the hint right for Latin and Greek ("Not in this font: ⸘ · No font here has it") but fail the same way for " नया ⸘ ok" ("Noto Sans Devanagari draws them"), and their refusal also names ř or Ω, which the stand-in does draw. The text is never lost (AC-310 holds) |
| AC-313 | P0 | PASS | Row 366x40 px at y 722, above the dock (774), the same on 8 lines; "Missing: ř" with at most two fonts; page and scroll unchanged; Tab → fonts → leaves and saves |
| AC-305, AC-306 | P0 | informational | `scripts-chrome.pdf`: two Hindi and two Arabic lines open and a typed word is saved. Ink not re-measured. AC-307, AC-308 not run |

Not judged: AC-270, AC-272, AC-273, AC-274 (crawler, not visible on staging); AC-285, AC-287, AC-297 (the spec lists them as not built).

### Regression checks

- **Downloaded files carry no extra font files.** For 13 outputs the source's font objects were compared with the output's (`scripts/fonts.py`): every source font is unchanged in every file, and no font the source only names gained a font program. That includes the named-only files whose pages are now drawn with twins on screen (`s283-ac283-named-only-1280.pdf`: 14 of 14 fonts still without a program, 11,713 → 11,872 B). What is added is only the subset for the letters typed (350–2,752 B each). All outputs pass the syntax check; page counts unchanged.
- JS by load 141 KB (140 last time). First page 203–433 ms in 21 runs.

### Sejda tasks spent

**None of the two allowed.** No request was made to sejda.com. Every reference number below is from the cache (first evaluation, re-run and third evaluation: tasks T1, T2, T2b).

### Micro-checks

| Check | Sejda (cache) | BerryPDF now | Result |
|---|---|---|---|
| M1 Landing | 17 / 28 words before the action | 3 words; Open PDF in view at all 7 viewports | win |
| M2 Upload start | click, drop, 3 clouds, URL | click, drop, paste, blank page | **lose**, owned by F23 (lead's note) |
| M3 Loading | 4.96 s pick to text | first page 203–433 ms in 21 runs | win |
| M4 Display | 600 px page at 390 | fits the width; named-only fonts drawn in their twins | win |
| M5 Interaction | one run at a time; on CFF a blocking dialog on the first letter | whole line, own fonts, hint, Tab and Enter; CFF "O" saved 172 ms after Enter | win |
| M6 Options | 36 fonts, no search, no own fonts | 1,972 families, search, own file, installed fonts, twins "Same widths" | win |
| M7 Processing | 6.0 s, 6.5 s, 6.6 s | Download to file 977–1,085 ms at 1280 (median 1,000), 969–1,162 ms at 390 (median 1,132) | win |
| M8 Output fidelity | CFF: whole line redrawn in non-embedded Helvetica, moved in the reading order | CFF: line keeps Charter, one letter from a 0.9 KB Charis SIL subset; source fonts untouched in all 13 outputs | win |
| M9 Errors | two blocking dialogs; nothing about missing letters | plain messages, text kept; but see AC-312 (a wrong hint in the mixed case) | win |
| M10 Privacy | 10,645 B and 30,583 B uploaded on pick | 0 non-GET requests in every session | win |
| M11 Look | floating toolbar over the text | closed outline, one hint row, slim phone row, no fade | win |
| M12 First screen fit | 1366x657: 45% of the screen; 390x664: 46% | 75% / 73% / 77% / 74% / 76% at the five viewports; Download in view | win at the two viewports with a reference |

### Lighthouse and axe

- Lighthouse 12.8.2 mobile on `/edit-pdf`: performance 100 / 99 / 99 (median 99), accessibility 100, best practices 100, LCP 1.4–1.5 s, CLS 0, TBT 50–120 ms. SEO 66 because staging is noindex.
- axe 4.14.1: 0 violations in landing, editor open, line open, missing-letter hint, refused line kept open, second hint, stand-in notice and the Change menu, at both sizes.

### Gap list

Blocking:

1. **AC-298 (P0): the opened line steps one CSS pixel up or down.** Put the box's baseline where the page draws it on every line, not only to the nearest half pixel. Re-check with `scripts/v298.cjs` and `v298.py` (ten lines, both sizes, device scale 1 and 2): today "Results don’t match the proof" (`latex-type1c.pdf`), "Office ligatures" (`cid-bold-run.pdf`), named-only Georgia and Segoe UI, "A footnote mark follows." (scale 1) and the mono line on a phone are off by 0.9–1.0 px; the target is 0.5 px or less on all of them. If the owner accepts a 1 px step, that needs to be written into the criterion or waived in writing.
2. **AC-312 (P0): say which letters no font has when they are typed with letters that have one.** For " ř ⸘" on an embedded line the hint and the screen-reader text claim the offered font draws both. Name the letters no font here has, offer "Use your own font" for them next to the fonts for the rest, and make the refusal name only the letters that really cannot be drawn (today it lists ř, Ω, "o" and "k" as well). Enter then takes 1.0–4.8 s with the box closed and nothing shown; it should answer as fast as the single-letter case (0.5 s). Re-check with `scripts/s312m.cjs` and " नया ⸘ ok" in `scripts/s300q.cjs`.

Open, not blocking:

3. **Screen-reader text of the accent line.** The line list and the box label still read "cafe´ naıve" (last list, 3a).
4. **First stand-in by shape still takes 2.5 s.** `latex-type1.pdf`, first line: the caret is 174 px from the click at 1280 (57 px at 390) until the font arrives. On embedded lines the hint's font buttons still appear 1.0–3.1 s after the letter.
5. **Menu and line disagree.** `ac282-name-lies.pdf`, line 3: the menu says "Adamina · Close", the line edit offers and saves Besley. The two-fonts-with-one-name case of the last list (gap 7) was not re-examined in depth.
6. **Names read oddly:** "Times NewRomanPSMT", "Courier NewPSMT", "SegoeUI", and "ArialMT isn’t in this file" in the notice.
7. **Stale message.** After a kept-open line is saved by leaving it, "The line you were editing couldn’t be saved…" stays (both sizes).
8. **"Replace with new text".** Seven Tinos font objects are written, four of them the same 2,410 B subset (was eight); the new line moves to the end of the reading order; justification is lost (known).
9. **Fonts fetched twice.** Each built-in twin file (`/fonts/editor/*.woff`, still not hashed) is requested twice when a named-only file opens. Two identical subsets are written when two named fonts share a twin (Arial and Helvetica: two `BERRYA+Arimo` of 996 B), and `BERRYA+` / `BERRYB+` pairs remain per slice.
10. **"Use your own font" from the keyboard** opened the file dialog in three of four runs (Tab then Enter straight after typing did not, once).
11. **Phone:** "Please bring the signed copies…" and "and it stays…" open about half a pixel high with a fifth of their ink off after alignment.
12. **Carried over, not re-checked:** AC-296; focus lands on `body` after a mouse-opened edit is saved; horizontal scaling shown as spacing; the NUL after a saved Devanagari word in PDFium; heavier apostrophe and dash in the Type 1 stand-in.

### Not checked

- AC-285, AC-287, AC-297, AC-307, AC-308 and AC-296 were not run. AC-305 and AC-306 were opened and saved but their ink was not re-measured.
- AC-283: Segoe UI's own widths against Selawik's (no copy of the font).
- AC-288 with `ac288-scripts.pdf` (the menu's "Similar" rows): that fixture of the third evaluation was not kept; `ac288-scripts2.pdf` was used for both the same-script and the cross-script runs.
- AC-284 on the builders' 484-face set.
- The phone row against a real on-screen keyboard; the Local Font Access prompt.
- First-screen fit on Sejda at 1280x632, 1536x730 and 1920x969 (no reference run, as before). No new side-by-side images were made: the Sejda side is unchanged and the earlier ones in `/mnt/project-files/comparisons/f24/` still apply.
- Width 375 px: the phone runs were at 390, as in the earlier rounds.
- The Lighthouse runs first made with a certificate flag I should not have added were discarded; the three reported were made with the same flags as the third evaluation.

---

## Re-evaluation 2026-11-25 (staging 97b0be6)

- **Verdict: FAIL**
- Evaluated: 2026-11-25, 01:43–02:20 UTC, by parity-evaluator. No source code, builder notes or PR text were read.
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf. `/api/health` reports version `97b0be6de3d1848e9df88dfd869878174e37fe83`. `/fonts/lib/manifest.json` counts 1,972 families, 7,937 faces.
- Sizes: 1280x800 and 390x844 (touch), device scale factor 2, headless Chromium 1243. Lines low on the page were run at 1280x1100 or 1280x1500.
- Sejda evidence: reused from the cache, plus one new real task today (the CFF line; see "Sejda tasks spent").
- Our scripts: `docs/evals/cache/f24-font-library/eval-3/scripts/`. Our outputs, logs, Lighthouse runs and the new fixtures: `/mnt/project-files/evals-cache/f24-font-library/eval-3/` (not in git). Our screenshots: `/mnt/project-files/designs/fonts/eval-3/`. Side-by-side images (Sejda left): `/mnt/project-files/comparisons/f24/`. New Sejda captures, logs and output: `/mnt/project-files/evals-cache/f24/` (`sejda-e3-*`, `e3-*`; not in git). Sejda notes and hashes: `docs/evals/cache/f24/manifest.json`.

### Summary

| Gate | Bar | Result | OK |
|---|---|---|---|
| P0 ACs | all pass | **17 / 23 judged** (AC-271, AC-288, AC-298, AC-299, AC-300, AC-304 fail) | **no** |
| All ACs | at least 90% | 20 / 27 judged (74%), counting AC-296 as the deferred fail it still is | **no** |
| Lighthouse performance (mobile) | at least 90 | 100 / 99 / 99 (median 99) | yes |
| axe critical issues | none | 0 violations of any level in 8 states at both sizes | yes |
| Micro-checks | no lose unless owned elsewhere or waived | M2 lose (owned by F23 per the lead's note); rest win | yes, with M2 as noted |

Selawik is served: the families index lists `selawik` (weights 300, 400, 600, 700), its four WOFF files return 200 with one-year immutable caching, `licences/selawik.txt` opens with the version and release address, and a PDF that names Segoe UI gets "Selawik · Same widths".

What was fixed since the last verdict: AC-281 and AC-301 (other alphabets are offered closest first), AC-282 (the Inter / DejaVu Serif case), the CFF ligature, tab-gap and leader faults of AC-298, "Replace with new text" (styles kept, text once), the remembered font after Escape, "No font here has it" for Georgian and Armenian, the phone row wording, Courier's match. AC-283 is built and passes for all eight fonts. The matcher scored 152 of 152.

What blocks now:

1. **AC-271:** the notices page lists 1,971 of the 1,972 served families. Selawik is missing from `/licenses`.
2. **AC-300:** on a line whose font the PDF only names (Arial, Helvetica, Times, and so on, not embedded), a letter no twin can draw is not marked or named while typing. After Enter the box closes for 3.4–7.8 s with no feedback, then the edit is either saved in another font or the box comes back with a refusal.
3. **AC-298 / AC-304:** two lines of `latex-type1c.pdf` still change when opened: "café" closes its gap, and the raised footnote mark disappears under the box.
4. **AC-299:** the edit box now fades in (a 120 ms opacity animation) on every opening. The last two evaluations measured none.
5. **AC-288:** a serif document font in Devanagari, Bengali, Hebrew or Arabic gets a sans face when letters of another script are typed, though the library has a serif face for that script.

### Criteria

The editor rows (AC-286, AC-298 to AC-304, AC-310 to AC-313) were run at both sizes. The library, matcher and output rows were run at 1280 only, except AC-283 (both sizes).

| AC | Pri | Result | Evidence |
|---|---|---|---|
| AC-271 | P0 | **FAIL** | `/licenses` links 1,971 licence texts; the served index has 1,972 families. The one missing is `selawik` (0 mentions on the page; the page is prerendered and served from cache). `/fonts/lib/licences/selawik.txt` itself is there and correct, and the family file carries `source` (name, version, address) |
| AC-275 | P0 | PASS | Index, family and font files hashed, `max-age=31536000, immutable`; `manifest.json` 300 s. POST 404, PUT 403. CSP `font-src 'self'; connect-src 'self'; form-action 'self'`. 0 non-GET requests and one host in every session |
| AC-280 | P0 | PASS | "them" → "us all" stays in `BAAAAA+LiberationSerif`, no new font object, no hint. A same-length edit on a named-only line keeps the original font reference too. Edits only, as before |
| AC-281 | P0 | PASS | Lora, Merriweather, Montserrat: ř, á from the same family, no notice. Carlito line + " Ωμέγα Жизнь": "Carlito (in use), Arimo, Advent Pro", saved without a stand-in notice. Kufi, Nastaliq, Amiri, Noto Sans Arabic, both Devanagari, both Hebrew, Bengali, Tamil and Thai document fonts take a new letter of their own script from the same family (`outputs/s288c-same.pdf`) |
| AC-282 | P0 | PASS | Named Lora, drawn in Roboto → Roboto. Named Roboto, drawn in Playfair → Playfair Display. Named Inter, drawn in DejaVu Serif → Besley, with the notice "Inter isn't complete in this file. Using Besley." New: named Arial, Helvetica, Calibri, Segoe UI, Times New Roman or Georgia but drawn in Playfair, Lora or Roboto → the font that looks like it, never the twin (`fixtures/ac282b-*.pdf`). One exception is gap 7 |
| AC-283 | P0 | PASS | `fixtures/ac283-named-only.pdf` (14 fonts named, none embedded; widths declared are the twin's) and `ac283-named-std14.pdf`. Menu: Arial, Helvetica → "Arimo · Same widths"; Times New Roman, Times → Tinos; Courier New, Courier → Cousine; Calibri → Carlito; Cambria → Caladea; Georgia → Gelasio; Segoe UI → Selawik; bold and italic cuts get the twin's bold and italic. The box opens in the twin (27–50 ms for the five built-in twins; Georgia and Segoe UI show the page through the box until the library file arrives). "time" → "emit": box width equals the line width on all 14 lines at both sizes, the line's last origin moves 0.000 pt and "END" stays at 500.0 pt in the output. A typed ř is saved in `BERRYA+Arimo`, `Tinos`, `Cousine`, `Carlito`, `Caladea`, `Gelasio`, `Selawik` (and `-Bold`, `-Italic`), with "… Using Arimo." and so on. Segoe UI's real widths were not checked (the font may not be held), as the spec says. See gaps 8 and 9 |
| AC-284 | P0 | PASS | New sample from the served library: 152 faces of 53 families (regular, bold, italic), names and style flags hidden, subset by reportlab: true family first for **152 of 152**, all "Exact", 9–18 s per 16-font file. The builders' set was not run |
| AC-286 | P0 | PASS | Output: only ř, á, k change font. Desktop: "Liberation Serif isn't complete in this file. Using Tinos. Change · Use your own font". Phone: "Liberation Serif isn't complete. Using Tinos." with Change; "Add a font file" inside Change. No modal |
| AC-288 | P0 | **FAIL** (narrow) | Typed into a Latin line, every script gets a face of its script and of the line's style: Liberation Serif → Noto Serif Devanagari, Noto Naskh Arabic, Tinos (Hebrew), Noto Serif Bengali, Noto Serif Tamil, Noto Serif Thai, Noto Serif Georgian, Noto Serif Armenian; Carlito → Noto Sans Devanagari, Noto Sans Arabic, Noto Sans Hebrew and so on; named-only Georgia → Noto Serif Devanagari, Noto Naskh Arabic. A document font in Kufi, Nastaliq or Naskh keeps its style for Arabic. **Fails when the document font is itself a serif font of another script** (`fixtures/ac288-scripts2.pdf`): Noto Serif Devanagari + Bengali → Noto Sans Bengali; Noto Serif Bengali + Thai → Noto Sans Thai; Noto Serif Hebrew + Arabic → Noto Sans Arabic; Amiri + Hebrew → Noto Sans Hebrew. The library has Noto Serif Bengali, Noto Serif Thai, Noto Naskh Arabic and Noto Serif Hebrew. Noto Serif Thai + Bengali → Noto Serif Bengali is right. Shape matching inside a script is not built (spec) |
| AC-290 | P0 | PASS | No library or editor font request on landing or after `chrome-justified-mixed.pdf` opens. JS by load 140 KB at both sizes. A PDF that names Arial, Times, Courier, Calibri or Cambria loads those five built-in twins after it opens (a match is needed) |
| AC-291 | P0 | PASS | Menu open: the 4 preview fonts on screen; scrolling loads the rows that come into view (17 files) |
| AC-292 | P0 | PASS | Playfair Display for added text: 18 of 18 letters identical in outline and advance to the served `latin-400-normal.3afd64d1.woff` |
| AC-293 | P1 | PASS | Search over all families; one scroll region (380 / 5110); "In this document", "Standard", "On this device", "All fonts", and "Closest matches" from Change |
| AC-294 | P0 | PASS | TTF, WOFF, WOFF2, OTF accepted; `.txt`, a fake `.ttf`, an empty `.otf` and a truncated TTF refused with the same plain messages; no request with the file |
| AC-295 | P0 | PASS | `fsType` 2 refused: "This font's licence settings don't allow putting it in a PDF." `fsType` 4 accepted |
| AC-296 | P1 | FAIL (deferred) | Not re-run. The spec still lists it as open; the lead's note says it does not block |
| AC-298 | P0 | **FAIL** | Fixed on `latex-type1c.pdf`: line 1 opens as "The effect of finite stiffness on the flow is efficient." with 0.0% of its ink off by more than 1 px; the contents line keeps its tab gap and leader; "Wide scaled line" is within 4.4%. Named-only Arial, Courier New, Calibri, Cambria lines open with 0.0–0.4% off. **Still wrong:** (a) "café naıve": the page draws "caf é" with a gap, the box closes it to "café" (18.6% of the line's ink moves; `ac298-cff-footnote-cafe-before-open-1280.png`); the line's label still reads "cafe´ naıve". (b) "A footnote mark ¹follows.": the raised mark is no longer drawn while the line is open (see AC-304). (c) Named-only Georgia and Segoe UI: the page view draws them in a different fallback than the twin the box uses, so the line changes shape on opening (22.5% and 7.9% of ink at 1280; lining figures become old-style figures in Georgia; `ac298-georgia-segoe-type1-before-open-1280.png`). (d) Phone: an opened line sits about 1 CSS px higher than on the page on "Please bring the signed…" and "and it stays…" (`ac298-phone-before-open-390.png`) |
| AC-299 | P0 | **FAIL** | Caret within 7.3 px of the click on 38 of 39 lines at 1280 and within 2.4 px on 39 of 39 at 390; selection type "Caret"; keyboard opening unchanged. **But the box now runs a CSS animation on every opening:** `ed-fade`, opacity 0 → 1 over 120 ms, on all 39 lines at both sizes (0 animations in the last two evaluations). The criterion says nothing is animated on opening. Also still there: the first line of a Type 1 file is drawn 174 px from the click for 2.7 s while its stand-in is found (gap 10) |
| AC-300 | P0 | **FAIL** | Embedded fonts: Hebrew, Arabic, Devanagari, Bengali, Tamil, Thai, Greek, Cyrillic, Georgian, Armenian and ⸘ are underlined and named, typing never blocked, status text present. **Named-only fonts are not covered:** in `ac283-named-only.pdf` (Arial) and `std14-reportlab.pdf`, typing " नया ใหม่ ⸘" marks nothing, shows no hint and no status text at either size. After Enter the box closes and the old text shows for 3.4 s (" नया", then saved in Noto Sans Devanagari with a notice), 3.4 s (" ⸘") or 7.8 s (" नया ⸘ ok"); in the last two cases the box then comes back with "This font has no …". The text is not lost (AC-310 holds) |
| AC-301 | P0 | PASS | At most three fonts, closest first and in use: Latin "Tinos, STIX Two Text, Fenix"; Greek and Cyrillic "Tinos, STIX Two Text, Arimo"; Hebrew "Tinos, Noto Serif Hebrew, Frank Ruhl Libre"; Carlito line "Carlito, Arimo, Advent Pro". A picked font is first on the next line; a font taken automatically is forgotten after Escape (Thai then ₹ → "Tinos (in use)"). See gap 11 |
| AC-302 | P1 | PASS | Families of the same kind with the alphabet are offered for all ten scripts tried |
| AC-303 | P1 | PASS | `font-kerning: none`, `font-variant-ligatures: none` on all 39 boxes at both sizes |
| AC-304 | P0 | **FAIL** (narrow) | Hint placement unchanged and right: under on a middle line, beside on "in full.", over on the first body line; one opaque 26 px row; Tab and Shift+Tab work. **The box's paper hides a neighbouring line's text in one case:** the footnote mark "1" (a line of its own in the list) vanishes while "A footnote mark follows." is open; 228 of 3,110 neighbour ink pixels are lost when the mark's own line is opened at 1280, 139 of 1,961 at 390. Zero neighbour ink lost on the other 37 lines |
| AC-310 | P0 | PASS | Refusal keeps the text and says so; leaving with the same text neither retries nor drops; Enter retries; changed text saves on leaving; Escape restores from the box and from Download; Download with the line open writes no file and says why; another line cannot replace it. Both sizes |
| AC-311 | P0 | PASS | " for Dvořák" on line 1 refused with "Replace with new text"; " for" and " abc" inside the clip are saved. Replace writes the line inside the print area (ends at 508.0 pt; clip 524.8 pt) |
| AC-312 | P0 | PASS | "No font here has it. Use your own font"; DejaVu Sans is offered at once after the file is read (no request) and the next leave saves ⸘ in `BERRYA+DejaVuSans` |
| AC-313 | P0 | PASS | Row 366x40 px at y 722, above the dock (774), the same on 8 lines; "Missing: ř" with at most two fonts; page and scroll unchanged; Tab → fonts → leaves and saves. On-screen keyboard not checked (headless) |
| AC-305, AC-306 | P0 | informational | `scripts-chrome.pdf`: two Hindi and two Arabic lines open and a typed word is saved. Ink was not re-measured this round. AC-307, AC-308 not run |

Not judged: AC-270, AC-272, AC-273, AC-274 (crawler, not visible on staging); AC-285, AC-287, AC-297 (the spec lists them as not built).

### Sejda tasks spent

One real task of the two allowed, finished at 02:04:53 UTC. Requests were held to 1 per second.

| # | Apply (UTC) | Task | Result |
|---|---|---|---|
| T2b | 02:04:45, created 02:04:46, ready 02:04:52 (6.0 s) | `latex-type1c.pdf`: click "Results don't match the proof (see 1– 3).", End, type "O", "Replace" in the Font Replacement dialog, "Remove" in the "Unused text edits" dialog. Task `DHJINKFM-202611250304` | 8,473 B, 3 pages, qpdf-clean. The whole line is redrawn in Helvetica, not embedded (the page is Charter), and the task carries a warning that a font could not be resolved. The line moves to the end of the reading order |

Needed for M5, M8 and M9 on an embedded CFF font, which the cache did not hold. Upload-only visits (no Apply accepted): 02:00 (stopped at the "Unused text edits" dialog; no task) and the visit that became T2b.

The same edit on BerryPDF (`outputs/m8-cff-ours.pdf`, `08-output-fidelity-cff.png`): the line stays in `CharterBT-Roman`, only "O" comes from `BERRYA+CharisSIL` (880 B), reading order kept, Enter to saved 0.2 s, Download to file 1.0 s, 0 non-GET requests.

### Micro-checks

Sejda numbers are reused from the cache unless marked new.

| Check | Sejda | BerryPDF now | Result |
|---|---|---|---|
| M1 Landing | 17 / 28 words before the action | 3 words; Open PDF in view at all 7 viewports | win |
| M2 Upload start | click, drop, 3 clouds, URL | click, drop, paste, blank page | **lose**, owned by F23 (lead's note) |
| M3 Loading | 4.96 s pick to text | first page 225–480 ms (two of 21 runs 920 and 998 ms) | win |
| M4 Display | 600 px page at 390 | fits the width | win |
| M5 Interaction | one run at a time; on CFF the clicked line collapses and a blocking dialog opens on the first letter (new) | whole line, own fonts, hint, Tab and Enter | win |
| M6 Options | 36 fonts, no search, no own fonts | 1,972 families, search, own file, installed fonts, twins labelled "Same widths" | win |
| M7 Processing | 6.0 s (T2b, new), 6.5 s, 6.6 s | Download to file 858–939 ms at 1280 (median 893), 865–1105 ms at 390 (median 1000) | win |
| M8 Output fidelity | CFF (new): whole line redrawn in non-embedded Helvetica, moved in the reading order. Clip task: text in the margin, italic lost | CFF: line keeps Charter, one letter from a 0.9 KB subset. Clip task: refused in place; "Replace with new text" keeps bold and italic, text once, inside the print area, set at 68% size, justification lost, line moved to the end of the reading order | win (gap 12) |
| M9 Errors | Two blocking dialogs on the CFF task; nothing about missing letters | Plain messages; refusals keep the text | win |
| M10 Privacy | 10,645 B (new) and 30,583 B uploaded on pick | 0 non-GET requests | win |
| M11 Look | floating toolbar over the text | closed outline, one hint row, slim phone row | win |
| M12 First screen fit | 1366x657: 45% of the screen; 390x664: 46% | 75% / 73% / 77% / 74% / 76% at the five viewports; Download in view | win at the two viewports with a reference |

### Lighthouse and axe

- Lighthouse 12.8.2 mobile on `/edit-pdf`: performance 100 / 99 / 99, accessibility 100, best practices 100, LCP 1.4–1.9 s, CLS 0, TBT 60–110 ms. SEO 66 because staging is noindex.
- axe 4.14.1: 0 violations in landing, editor open, line open, missing-letter hint, refused line kept open, second hint, stand-in notice and the Change menu, at both sizes.

### Gap list

1. **AC-271 (P0): Selawik is not on the notices page.** `/licenses` is prerendered and lists 1,971 families; the served index has 1,972. Rebuild the page from the published index (or revalidate it when the library is published) and add a check that the two counts are equal.
2. **AC-300 (P0): mark missing letters on named-only lines.** On a line in Arial, Helvetica, Times, Courier and so on (not embedded), letters the twin cannot draw (Devanagari, Thai, ⸘) get no underline, no hint, no status text. Flag them as on embedded lines and offer the fonts before Enter. After Enter, keep the box open (or show progress) while fonts are looked up: today it closes and shows the old text for 3.4–7.8 s. Re-check with `fixtures/ac283-named-only.pdf`, line 1, " नया ใหม่ ⸘".
3. **AC-298 / AC-304 (P0): two CFF lines.** `latex-type1c.pdf`: (a) "caf é" is drawn as "café" in the box (the é moves left by about 3 CSS px); set the letter after the accent where the page has it, and read the line as "café naïve" for screen readers. (b) The raised footnote mark is hidden while "A footnote mark follows." is open; draw the mark in the box or keep the paper off it.
4. **AC-299 (P0): the box fades in.** `ed-fade` (opacity 0 → 1, 120 ms) runs on `line-input` on every opening. Remove it, or have the owner change the criterion if the fade is wanted.
5. **AC-288 (P0): style for a document font of another script.** A serif Devanagari, Bengali, Hebrew or Naskh document font gets Noto Sans for letters of a different script. Read serif or sans off the font (name, descriptor flags or stroke contrast) for every script. Re-check with `fixtures/ac288-scripts2.pdf` and `outputs/s288c-cross.pdf`.
6. **AC-298: Georgia and Segoe UI are drawn differently on the page and in the box.** The page view uses one fallback for a named-only Georgia or Segoe UI and the box uses Gelasio or Selawik, so the line changes on a click and changes back after saving. Draw the page with the twin too, as already happens for Arial, Times, Courier, Calibri and Cambria.
7. **AC-282 edge: two fonts with one name.** When a PDF has a named-only Helvetica and an embedded font also called Helvetica but drawn in Playfair, the embedded one is saved with Arimo and the menu shows one row. Key fonts by object, not by name. `fixtures/ac283-embedded.pdf`, line 2.
8. **Menu waits and downloads on named-only fonts.** Every row reads "Matching…" for about 10 s and 249 signature files are fetched before "Arimo · Same widths" appears, though a twin needs no matching. Names read oddly: "Times NewRomanPSMT", "Courier NewPSMT", "SegoeUI", and the notice says "ArialMT isn't complete in this file" for a font that is not in the file at all.
9. **Menu and line disagree.** `ac282-name-lies.pdf`, line 3: the menu says "Adamina · Close", the line edit offers and saves Besley.
10. **First stand-in by shape still takes 2.7 s.** `latex-type1.pdf`, first line: the caret is 174 px from the click until the font arrives. On embedded lines the hint's font buttons still appear 1.5–3.5 s after the letter.
11. **Stale message.** After a kept-open line is saved by leaving it, "The line you were editing couldn't be saved…" stays (both sizes). The Escape case is fixed.
12. **"Replace with new text".** Eight Tinos font objects are written, four of them the same 2,410 B subset; the new line is set at 68% size and moves to the end of the reading order; justification is lost (known). On an Arabic line the offer reads "Replacing it sets your text in Arimo", a font with no Arabic.
13. **Phone: an opened line rises about 1 CSS px** ("Please bring the signed copies…", "and it stays…").
14. **Output text.** A Devanagari word saved from the library reads back with a NUL character after it in PDFium ("नया" + U+0000) in `outputs/s300p-4.pdf`.
15. **Type 1 stand-in.** `latex-type1.pdf`, "Results don't match…": the apostrophe and the dash are drawn heavier than the rest of the line in the box.
16. **Carried over, not re-fixed:** AC-296; two font objects per stand-in (`BERRYA+Tinos`, `BERRYB+Tinos`); `/fonts/editor/*.woff` still `max-age=0` and not hashed; focus lands on `body` after a mouse-opened edit is saved; horizontal scaling shown as spacing.

### Not checked

- AC-285, AC-287, AC-297, AC-307, AC-308 and AC-296 were not run. AC-305 and AC-306 were opened and saved but their ink was not re-measured.
- AC-283: Segoe UI's own widths against Selawik's (no copy of the font). The test PDFs declare the twin's widths, so the check shows the twin is used and the line does not move, not that Selawik equals Segoe UI.
- AC-284 on the builders' 484-face set; the 55- and 88-font files of the last round were not re-run.
- AC-288: a document font with a hidden name in Kufi or Nastaliq style; shape matching inside a script.
- The phone row against a real on-screen keyboard; the Local Font Access prompt; "Use your own font" from the keyboard opened the file dialog in three of four runs here.
- First-screen fit on Sejda at 1280x632, 1536x730 and 1920x969 (no reference run, as before). Medians of three for Sejda's M7 come from three different tasks.
- Width 375 px: the phone runs were at 390, as in the earlier rounds.

---

## Re-evaluation 2026-11-24 (staging f68ba1d)

- **Verdict: FAIL**
- Evaluated: 2026-11-24, 22:13–22:55 UTC, by parity-evaluator. No source code, builder notes or PR text were read.
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf. `/api/health` reports version `f68ba1d058ee077f4feb8d89fe2fcdad6f70c939`. Staging now serves the full library: `/fonts/lib/manifest.json` counts 1,971 families, 7,933 faces (the first evaluation saw 54 families, Latin only). That is why three criteria that passed on Latin letters now fail on other alphabets.
- Sizes: 1280x800 and 390x844 (touch), device scale factor 2, headless Chromium 1243.
- Sejda evidence: reused from the first evaluation, plus one real task and four upload-only visits today (see "Sejda tasks spent").
- Our raw outputs, logs and scripts: `/mnt/project-files/evals-cache/f24-font-library/rerun/`. Our screenshots: `/mnt/project-files/designs/fonts/eval-rerun/`. New Sejda captures, logs, output and three side-by-side images (`05-clip-typed.png`, `05-cff-line-open.png`, `08-output-fidelity-clip.png`): `/mnt/project-files/evals-cache/f24/` (not in git).

### Summary

| Gate | Bar | Result | OK |
|---|---|---|---|
| P0 ACs | all pass | **17 / 21 judged** (AC-281, AC-282, AC-298, AC-301 fail) | **no** |
| All ACs | at least 90% | 20 / 25 judged (80%) | **no** |
| Lighthouse performance (mobile) | at least 90 | 99 / 99 / 100 (median 99) | yes |
| axe critical issues | none | 0 violations of any level in 8 states at both sizes | yes |
| Micro-checks | no lose unless owned elsewhere or waived | M2 lose (owned by F23 per the lead's note); M8 tie with defects; rest win | yes, with M2 as noted |

What was fixed since the first verdict: AC-286 (phone notice), AC-300 (Hebrew, Arabic, Devanagari, Thai are flagged), AC-304 (hint placement), the axe critical issue, typed text dropped on a failed edit (AC-310), text written outside the clip (AC-311), the fixed-pitch matcher misses, and matching beyond 24 fonts. AC-310 to AC-313 all pass.

What blocks now:

1. **AC-281, AC-301:** for Greek, Cyrillic and Hebrew letters the fonts offered and embedded are the first three families of the same kind in alphabetical order, not the closest. The document's own family is skipped even though the library has it with those letters.
2. **AC-282 (regression):** a font named Inter but drawn in DejaVu Serif gets Inter for its missing letters.
3. **AC-298:** embedded CFF fonts now load, but the first line of `latex-type1c.pdf` opens without its ff and ffi letters, and three more lines of that file change shape in the box.

### Criteria

The editor rows (AC-286, AC-298 to AC-304, AC-310 to AC-313 and the outline) were run at both sizes; "opening another line" in AC-310 at 1280 only. The library, matcher and output rows (AC-271 to AC-295, AC-305, AC-306) were run at 1280 only.

| AC | Pri | Result | Evidence |
|---|---|---|---|
| AC-271 | P0 | PASS | `/licenses` names all 1,971 served families, each with a link to `/fonts/lib/licences/<id>.txt` (5 sampled, all 200). Licences in the index: OFL-1.1, Apache-2.0, UFL-1.0 |
| AC-275 | P0 | PASS | `/fonts/lib/` index, family and font files carry a hash and `max-age=31536000, immutable`; `manifest.json` 300 s. POST and PUT return 404. CSP `font-src 'self'; connect-src 'self'; form-action 'self'`. 0 non-GET requests and one host in every session |
| AC-280 | P0 | PASS | "them" → "us all": stays in `BAAAAA+LiberationSerif`, no new font object, no hint (`outputs/s9-ac280.pdf`). Edits only, as before |
| AC-281 | P0 | **FAIL** | Latin still passes: Lora, Merriweather, Montserrat and Carlito subsets get ř, á, M, ₹ from the same family. **Greek and Cyrillic do not:** " Ωμέγα Жизнь" typed into a Carlito line (`libreoffice-memo.pdf`, fresh session) is offered "Advent Pro, Akt, Alegreya Sans" and saved in `BERRYA+AdventPro`, with the notice "Carlito isn't complete in this file. Using Advent Pro." The served Carlito has `greek-400-normal` and `cyrillic-400-normal` files (200). `outputs/s6-libreo.pdf`, `ac281-301-other-alphabet-libreo-*.png` |
| AC-282 | P0 | **FAIL** | `ac282-name-lies.pdf`: named Lora, drawn in Roboto → Roboto (pass); named Roboto, drawn in Playfair → Playfair Display (pass). **Named Inter, drawn in DejaVu Serif:** the menu says "Adamina · Close", but the hint offers "Inter (in use), Arimo, Adamina", ř and á are saved in `BERRYA+Inter`, and no stand-in notice is shown. In the first evaluation the name was offered second. `outputs/d-ac282-name-lies-output.pdf`, `ac282-name-lies-line2-typed-1280.png` |
| AC-284 | P0 | PASS | Same 141-face sample: true family first for 133. The other 8 are Noto Sans JP / KR / SC / Thai, whose Latin letters are the same outlines as the Noto family named instead, so 133 of 133 that can be told apart (94.3% if those count as misses). Courier Prime and Roboto Mono now match. `reportlab-mono-subset.pdf` → "Roboto Mono · Exact". 55- and 88-font files: every row matched (34 s and 52 s) |
| AC-286 | P0 | PASS | Output: only ř, á, k change font (`outputs/s3c-B5-fits-1280-dl1.pdf`). Desktop: "Liberation Serif isn't complete in this file. Using Tinos. Change · Use your own font". Phone: "Liberation Serif isn't complete. Using Tinos." on two lines with Change; "Add a font file" is inside Change. No modal. `ac286-notice-*.png`, `ac286-change-menu-390.png` |
| AC-290 | P0 | PASS | No library request on landing or after a file opens. JS by load 142 KB at both sizes |
| AC-291 | P0 | PASS | Opening the menu loads 4 preview fonts; scrolling loads the rows that come into view (17 files) |
| AC-292 | P0 | PASS | Playfair Display for added text: 17 of 18 letters have identical outlines and advances to the served `latin-400-normal.3afd64d1.woff`; "i" is the same composite as last time |
| AC-293 | P1 | PASS | Search over all families; one scroll region; groups "In this document", "Standard", "On this device", "All fonts", and "Closest matches" from Change |
| AC-294 | P0 | PASS | TTF, WOFF, WOFF2, OTF accepted; `.txt`, a fake `.ttf`, an empty `.otf` and a truncated TTF refused with the same plain messages; no request |
| AC-295 | P0 | PASS | `fsType` 2 refused: "This font's licence settings don't allow putting it in a PDF." |
| AC-296 | P1 | FAIL (deferred) | Not re-run. The spec still lists it as open; the lead's note below says it does not block |
| AC-298 | P0 | **FAIL** | Fixed: all 12 lines of `latex-type1c.pdf` open in the document's own CFF font (`data-face="own"`), no system font; `reportlab-mono-subset.pdf` opens in place. **Still wrong on the CFF file:** line 1 opens as "The eect of finite stiness on the flow is ecient." (ff and ffi are not drawn, word gaps widen); "1.2 Introduction . . . 7" loses its tab gap and its leader ends 75 px early; "café naıve" shows the accent as a separate letter; "Wide scaled line" is drawn unscaled with wider gaps; on "A footnote mark follows." the outline's top edge runs through the letters. Saving line 1 keeps the ligatures in the file (`outputs/s7-cff.pdf`), so this is a display fault, not data loss. Also still there: "Team memo" narrows its word gap when opened. `ac298-cff-*.png` |
| AC-299 | P0 | PASS | Caret within 7 px of the click on 28 of 30 lines; keyboard opening unchanged. On the first line opened in a file with non-embedded or Type 1 fonts the stand-in takes about 2.1 s, and until then the caret is drawn 59–174 px from the click (it is at the right character and moves into place). Listed as gap 9 |
| AC-300 | P0 | PASS | Hebrew, Arabic, Devanagari, Thai, Greek, Cyrillic, CJK, emoji all underlined and named, typing never blocked, focus stays, `role="status"` text. `ac300-script-*.png` |
| AC-301 | P0 | **FAIL** | Latin: Tinos (in use) then Arimo, picking redraws at once, remembered: pass. **Other letters are not "closest first":** Greek in a Liberation Serif line offers "Alegreya, Alegreya SC, Alyamama"; Hebrew "Bellefair, Bona Nova, Bona Nova SC"; Arabic "Alkalami, Alyamama, Amiri". Each list is the first three serif families with that alphabet in A–Z order of the served index. Tinos, which the menu labels "Exact" for this font and which has Greek, Cyrillic and Hebrew files, is not offered; the output uses `BERRYA+BonaNova` or `Alegreya`. **A font used automatically in an abandoned edit is remembered:** after typing a Thai letter and pressing Escape, ₹ is offered "Maitree (in use), Tinos, Arimo"; after a Greek letter in the Carlito file, "M ř" is offered "Advent Pro (in use), Carlito, Arimo" |
| AC-302 | P1 | PASS | Same-kind families with the alphabet are offered for all six alphabets (their order is the AC-301 fault) |
| AC-303 | P1 | PASS | `font-kerning: none`, `font-variant-ligatures: none` on all 30 boxes |
| AC-304 | P0 | PASS | Middle line: hint under the box, over no text. "in full.": beside. First body line: over, covering the bottom edge of the heading (allowed). One opaque 26 px row; Tab reaches the fonts and Shift+Tab returns; status text present. `hint-*.png` |
| AC-310 | P0 | PASS | After a refusal the message says why and "Your text is still in the box", the box is open with the text and the caret. Leaving with the same text: no new attempt, text kept (message dismissed first, so a retry would show). Enter: tries again. Changed text, then leaving: saved. Font added: next leave saves. Escape, from the box and from the Download button: line restored, and a download then equals the source text. Download with the line open: 0 files, "The line you're editing couldn't be saved, so it isn't in the file yet…". Opening another line: kept, with a message. `ac310-*.png`, `logs/s3c-*.log` |
| AC-311 | P0 | PASS | Clip right edge 524.8 pt, page edge 595.9 pt. " for Dvořák" on line 1 would end at about 552 pt: refused with "Replace with new text". " for" (ends 519.3 pt) and " abc" on line 2 are saved and fully drawn in PDFium. Replace writes the whole line inside the clip. Its side effects are gap 4 |
| AC-312 | P0 | PASS | "No font here has it. Use your own font" in the hint; the file is read without a request; DejaVu Sans is offered at once and the next leave saves with `BERRYA+DejaVuSans` for ⸘ only (`outputs/s3c-B4-nofont-1280-dl1.pdf`). See gap 6 for letters the library does have |
| AC-313 | P0 | PASS | Row 366x40 px at y 722–762, 12 px above the dock (774), the same for 8 lines; page rectangle and scroll unchanged before and after; at most two fonts; while a message shows, the row is inside the message and returns when it is dismissed; Tab → first font → second font → leaves the edit and saves; Shift+Tab returns to the box. On-screen keyboard not checked (headless) |
| Edit box outline | — | PASS | Middle line of the first paragraph: outline covers 99.6–100% of all four edges at both sizes; 0 dark pixels lost in the lines above and below |
| AC-305, AC-306 | P0 | informational: pass | `scripts-chrome.pdf`: two Hindi and two Arabic lines open with 0–2.5% of ink off by more than 1 px; a typed word is saved; the Arabic line grows to the left. AC-307 and AC-308 not run |

Not judged: AC-270, AC-272, AC-273, AC-274 (crawler, not visible on staging); AC-283, AC-285, AC-287, AC-288, AC-297 (the spec lists them as not built). AC-283 and AC-288 are P0 in the spec, so F24 is not complete against its spec until they are built and judged. One informational result for AC-283: in `std14-reportlab.pdf` the menu matches Courier to "Bitcount · Very close", not Cousine.

### Sejda tasks spent

One real task of the two allowed. Requests were held to 1 per second.

| # | Apply (UTC) | Task | Result |
|---|---|---|---|
| T1 | 22:24:35, ready 22:24:42 (6.5 s) | `chrome-justified-mixed.pdf`: click the last run of line 1, End, type " for Dvořák". Task `DU1RDCDH-202611242324` | 34,228 B, qpdf-clean. "for Dvořák" is drawn in full at 503–556 pt, past the print area (524.8 pt) and inside the page. "Client" loses its italic. The run moves to the end of the reading order. Nothing was said about ř |
| T2 | not spent | `latex-type1c.pdf`: edit "Results don't match…" | No task was created. Two attempts stopped before Sejda accepted Apply (a hidden button, then Sejda's "Unused text edits" dialog). A third attempt was blocked by the tool permission system, so there is **no Sejda output for a CFF line** |

Upload-only visits (no Apply): 22:22 (clip rehearsal), 22:31 (CFF rehearsal), 22:34 and 22:36 (the two T2 attempts). What they show on the CFF file: the clicked line collapses into overlapping letters at its left end, and typing "O" opens a blocking "Font Replacement" dialog with five fonts (`05-cff-line-open.png`).

### Micro-checks

Sejda numbers are reused from the first evaluation unless marked new.

| Check | Sejda | BerryPDF now | Result |
|---|---|---|---|
| M1 Landing | 17 / 28 words before the action | 3 words; Open PDF in view at all 7 viewports | win |
| M2 Upload start | click, drop, 3 clouds, URL | click, drop, paste, blank page | **lose**, owned by F23 (lead's note) |
| M3 Loading | 4.96 s pick to text | first page 217–404 ms (one run 863 ms) | win |
| M4 Display | 600 px page at 390 | fits the width | win |
| M5 Interaction | one run at a time; on CFF the line collapses (new) | whole line, own fonts, hint, Tab and Enter | win |
| M6 Options | 36 fonts, no search, no own fonts | 1,971 families, search, own file, installed fonts | win |
| M7 Processing | 6.5 s (T1, new), 6.6 s (first run) | Download to file 786–902 ms, median 826 | win |
| M8 Output fidelity | Mid-line insert: unreadable overlap (first run). End of line (T1): readable, in the margin, italic lost | Both edits refused in place with the text kept. "Replace with new text": readable, inside the print area, but bold, italic and justification lost and the old line still in the text layer. Edits that fit: only missing letters change font | **tie** (one task each way; gap 4) |
| M9 Errors | Blocking font dialog; "Unused text edits" dialog; nothing about missing letters | Plain messages; refusals keep the text | win |
| M10 Privacy | 30,583 B uploaded on pick | 0 non-GET requests | win |
| M11 Look | floating toolbar over the text | closed outline, one hint row, slim phone row | win |
| M12 First screen fit | 1366x657: 45% of the screen; 390x664: 46% | 75% / 73% / 77% / 74% / 76% at the five viewports; Download in view | win at the two viewports with a reference |

### Lighthouse and axe

- Lighthouse mobile on `/edit-pdf`: performance 99 / 99 / 100, accessibility 100, best practices 100, LCP 1.4 s, CLS 0, TBT 60–120 ms. SEO 66 because staging is noindex.
- axe 4.14.1: 0 violations in landing, editor open, line open, missing-letter hint, refused line kept open, second hint, stand-in notice and the Change menu, at both sizes. The stale `aria-activedescendant` is gone.

### Gap list

1. **AC-281 / AC-301 (P0): rank by closeness for every alphabet.** For letters outside Latin the candidates are the first three same-kind families in A–Z order. Put the document's own family first when the library has it with the letter (Carlito → Carlito Greek), then the matched family (Liberation Serif → Tinos Greek, Cyrillic, Hebrew), then the rest by the matcher's order. Re-check with `outputs/s6-libreo.pdf` and `outputs/s6-chrome.pdf`.
2. **AC-282 (P0): do not use the name when the outlines differ.** `ac282-name-lies.pdf`, third line: the line edit puts Inter first and saves with it while the menu says "Adamina · Close". Use the outline match first, as the first two lines do, and show the stand-in notice.
3. **AC-298 (P0): CFF lines that change when opened.** In `latex-type1c.pdf`: draw glyphs the text layer has no letter for (ff, ffi) instead of dropping them, and fix the line's screen-reader label, which reads "The eect of…"; keep tab gaps and leaders; keep horizontal scaling; keep accents where the page has them. "Team memo" in `libreoffice-memo.pdf` still narrows its word gap.
4. **"Replace with new text" (M8).** It rewrites the whole line in one upright Tinos face (bold "Provider" and italic "Client" are lost, justification is lost), leaves the old line in the file's text layer so extraction returns the line twice, writes two identical Tinos subsets, and then shows "The new text runs into text below it…" though the result looks fine. Keep each run's style, remove the old text, and say what will change before doing it. `outputs/s3c-B3-replace-1280-dl1.pdf`.
5. **AC-301: a font chosen automatically in an edit that was abandoned is remembered.** Remember a font only when the user picks it or the edit is saved.
6. **"No font here has it" is shown for letters the library has.** Georgian, Tifinagh, Cherokee, Braille and Ogham have families in the served index (`noto-sans-georgian/georgian-400-normal` exists). Offer them or change the wording.
7. **Outline through the text.** On a line with a raised footnote mark the top edge is drawn through the line's own letters (`ac298-cff-footnote-line-open-1280.png`).
8. **Stale messages.** After Escape the message "…Your text is still in the box." stays though the text is gone. After a line is saved on leaving, "The line you were editing couldn't be saved…" stays.
9. **First stand-in takes about 2.1 s.** Until it arrives the caret is drawn 59–174 px from the click (`ac299-first-line-pending-1280.png`). The hint's font buttons also appear 1.5–2.5 s after the letter on first use.
10. **Phone row wording.** "Not in ř á k" reads as if the letters were a place. Suggest "Missing: ř á k" or "Not in this font: ř á k" when it fits.
11. **Menu labels.** Courier (standard, not embedded) is matched to Bitcount, not Cousine. On a phone the Change menu lists the stand-in "Tinos" under "In this document" as "No match yet".
12. **Carried over, not re-fixed:** AC-296; two font objects per stand-in (`BERRYA+Tinos`, `BERRYB+Tinos`; three for Bona Nova); `/fonts/editor/*.woff` still `max-age=0` and not hashed; focus lands on `body` after a mouse-opened edit is saved.

### Not checked

- No Sejda output for a CFF line (T2 was not spent).
- AC-307, AC-308, AC-285, AC-287, AC-297 and AC-296 were not run. AC-283 and AC-288 were not judged.
- The phone row against a real on-screen keyboard.
- Keyboard activation of "Use your own font" opened the file dialog in one of five headless runs. The page calls the file input in both the keyboard and the mouse path, so this looks like a harness limit, but it was not confirmed on a real browser.
- First-screen fit on Sejda at 1280x632, 1536x730 and 1920x969 (no reference run, as before).

---

## First evaluation 2026-11-24 (staging a0920ba)

- **Verdict: FAIL**
- Evaluated: 2026-11-24 (17:13–18:05 UTC) by parity-evaluator
- Spec: `docs/specs/f24-font-library.md` (AC-270 to AC-309 reserved; 30 are written). **20 judged** (17 P0, 3 P1), 10 left out, listed with reasons under "ACs not judged".
- Reference: https://www.sejda.com/pdf-editor
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf (deployed from `main` `a0920ba` at 17:05 UTC; serves the in-app font copy: 54 families, 179 faces, Latin and Latin-ext slices only)
- Harness: Playwright (headless Chromium 1243), pikepdf, pypdfium2 (text, per-character font, renders), fontTools, reportlab, Pillow, axe-core 4.14.1, Lighthouse 12 (mobile). No source code, builder notes or PR text were read. One exception to note: the earlier Sejda-driving script from the 17:01 check (`scratchpad/sejda.cjs`) was read for Sejda selectors only.
- Fixtures: `tests/parity/editor/` (`chrome-justified-mixed.pdf`, `libreoffice-memo.pdf`, `std14-reportlab.pdf`, `latex-type1.pdf`, `latex-type1c.pdf`, `cid-bold-run.pdf`, `font-coverage-1p.pdf`), plus files generated for this eval from the fonts staging itself serves and from DejaVu Sans / Inter on the test machine: nine PDFs with 141 library faces under hidden names, `ac281-library-family.pdf`, `ac282-name-lies.pdf`, and own-font files (TTF, WOFF, WOFF2, OTF, a no-embedding font, a truncated font, a text file renamed `.ttf`, an empty `.otf`, a `.txt`).
- Screenshots (both sites, 1280x800 and 390x844, DSF 2): `/mnt/project-files/designs/fonts/eval/`. Side-by-side images (Sejda left): same folder, `01-…` to `08-…`, copied to `/mnt/project-files/comparisons/f24-font-library/` and, at half size, to `/mnt/project-files/evals-cache/f24-font-library/micro/`.
- Raw outputs, logs and the harness scripts: `/mnt/project-files/evals-cache/f24-font-library/`.

## Summary

| Gate | Bar | Result | OK |
|---|---|---|---|
| P0 ACs | all pass | 13 / 17 (AC-286, AC-298, AC-300, AC-304 fail) | **no** |
| All ACs | at least 90% | 15 / 20 (75%) | **no** |
| Lighthouse performance (mobile) | at least 90 | 91 (median of 85 / 91 / 97) | yes |
| axe critical issues | none | **1 critical** (`aria-valid-attr-value`, while a line is open) | **no** |
| Micro-checks (mission) | no "lose" unless waived | M2 lose (carried over from F3 and F16, no waiver on record); M8 tie with a defect on our side | **no** |

By priority: **P0 13/17**, **P1 2/3**. No owner waiver is on record in `docs/evals/`.

What works well: the line opens in the PDF's own embedded TrueType fonts with no flash of another font, a missing Latin letter is flagged as it is typed with fonts to pick from, only the missing letters change font in the output, the matcher is not fooled by a wrong font name, own fonts are read without any upload, and nothing loads before it is needed.

What blocks: four P0 criteria, one critical accessibility issue, and an output defect on the reference task (the typed word is cut off in the saved file).

## Sejda runs (budget: 2 real tasks, all before 18:00 UTC)

All on 2026-11-24, UTC. Requests to Sejda were queued at 1 per second. No account, payment or personal data.

| # | Apply (UTC) | Ready | Task | Cached output | Result |
|---|---|---|---|---|---|
| T1 | 17:15:47 | not captured | `chrome-justified-mixed.pdf`: click the first run, End, type " for Dvořák". Task `TEF5LIU1-202611241815` | none (screenshots `sejda-t1-*.png`) | **Output lost.** The result's Download button is inside an iframe and the script looked in the page. A second visit could not fetch it (the task is tied to the first visit: status 404). It counts as a task. |
| T2 | 17:27:02 | 17:27:08.6 (6.6 s); downloaded 17:27:09.5 | The same edit. Task `Y3O3QH4Z-202611241827` | `/mnt/project-files/evals-cache/f24/first-eval-sejda-t2-line-edit-dvorak.pdf` (moved out of git 2026-11-25) | 34,763 B, qpdf-clean. See below. |

Upload-only visits (no Apply): one rehearsal (17:14), one for the phone and desktop captures of the line edit and the font menu (17:28–17:31), one for the first-screen measurements (17:56–17:57), and two attempts to reopen the T1 result. Nothing was sent to Sejda after 17:57:08.

Same edit on both sites (`08-output-fidelity.png`):

| | Sejda T2 | InstaPDF (`ours-same-task-line-edit-dvorak.pdf`) |
|---|---|---|
| Time from Apply / Download to file | 6.6 s, then a result page | 0.86–0.92 s, stays in the editor |
| Upload | 30,583 B POST as soon as the file is picked | 0 non-GET requests, one origin |
| Unit edited | The run "This agreement is made between the" only | The whole line |
| Typed text in the output | Drawn over the bold word "Provider": both unreadable | "for" is drawn; **"Dvořák" is not visible** (see gap 1) |
| Reading order (PDFium) | The edited run moves to the end of the page text | Kept |
| Font for the typed text | A second Liberation Serif subset (10.5 KB) for the whole run | Original subset reused for covered letters; ř, á, k from Tinos (two subsets, 1.0 and 1.2 KB) |
| Told about the missing letters | No | Yes, while typing, with Tinos and Arimo to pick |
| File size | 34,763 B (+4,748) | 33,969 B (+3,954) |

## AC results

| AC | Pri | Sejda result | InstaPDF result | Pass |
|---|---|---|---|---|
| AC-271 | P0 | n/a | `/licenses` names all 54 served families with licence and copyright line; `/fonts/lib/licences/<id>.txt` returns the licence text for 54 of 54. The served catalogue carries the licence per family (53 OFL-1.1, 1 Apache-2.0). Source and version per entry are not visible from staging and were not checked | PASS |
| AC-275 | P0 | n/a | Every `/fonts/lib/` font, index, signature and family file sampled has a hash in its name and `cache-control: public, max-age=31536000, immutable`; `manifest.json` is 300 s. POST and PUT to `/fonts/lib/…` return 404. CSP: `font-src 'self'; connect-src 'self'; form-action 'self'`. 0 non-GET requests in every session. The bucket origin is not switched on, so its CSP entry could not be checked | PASS |
| AC-280 | P0 | Redraws the run in a new subset | Edit part only: "them" → "us all" on `chrome-justified-mixed.pdf` stays in `BAAAAA+LiberationSerif`, no new font object, no hint, no notice. (Added text on an existing line is marked "not in this PR") | PASS |
| AC-281 | P0 | n/a | `ac281-library-family.pdf` (Lora, Merriweather, Montserrat subsets): typed ř and á come from the same family (`BERRYA+Lora` …), no stand-in notice. The embedded á outline and advance are identical to the library file. Same on `libreoffice-memo.pdf` (Carlito) | PASS |
| AC-282 | P0 | Lists fonts by PostScript name only | `ac282-name-lies.pdf`: named Lora but drawn in Roboto → "Roboto · Exact", ř from Roboto; named Roboto, drawn in Playfair → Playfair Display; named Inter, drawn in DejaVu Serif → "IBM Plex Serif · Close". The name is offered second, never used first | PASS |
| AC-284 | P0 | No matching | Own sample, 141 library faces (regular, bold, italic) subset by reportlab under hidden names: true family first for 130. Five more are Noto Sans KR / SC / Thai, whose Latin letters are the same outlines as Noto Sans JP / Noto Sans, so they cannot be told apart: **130 of 136 = 95.6%** (92.2% if those five count as misses). The six real misses are all of Courier Prime and Roboto Mono, which never get a match (gap 8). The builders' 484-face set was not run | PASS (narrow) |
| AC-286 | P0 | Silent; a blocking dialog in the earlier check | Output: only ř, á, k change font; the rest of the line keeps the embedded font. No dialog (0 modal elements). Desktop notice: "Liberation Serif isn't complete in this file. Using Tinos. Change · Use your own font". **At 390 px the notice reads "Using Tinos for missing characters · Change": the PDF's font is not named on screen (only in screen-reader text), and "Use your own font" is not offered** | **FAIL** |
| AC-290 | P0 | n/a | No font index, matcher or library font request on the landing page, after a file opens, or when a line opens with nothing missing. JS by load 142 KB (budget 170), LCP 1.4–1.6 s, CLS 0 | PASS |
| AC-291 | P0 | Menu fonts preloaded | Opening the menu loads 4 preview files (the rows on screen); scrolling loads the next rows; 13 of 354 library files after open, scroll and search. Only `latin` and, when ř is typed, `latin-ext` slices are fetched | PASS |
| AC-292 | P0 | Preview is a web font; output differed (earlier check) | Playfair Display picked for added text: the embedded subset's outlines match the previewed file `latin-400-normal.…woff` for 16 of 17 letters and all advances (the 17th, "i", is the same composite under subset glyph names). Same for Lora | PASS |
| AC-293 | P1 | Flat list of 36 fonts plus the document's, no search | Search over all 54 families; one scroll region (`380/2602`); groups "In this document" (each row shows its match, e.g. "Tinos · Exact"), "Standard", "On this device", "All fonts". "Closest matches" appears only when the menu is opened from the stand-in notice's Change (Tinos Exact, PT Serif, IBM Plex Serif, Lora, Noto Serif) | PASS |
| AC-294 | P0 | No upload; "More fonts…" points to the desktop app | TTF, WOFF, WOFF2 and OTF accepted and applied (output embeds `DejaVuSans`). `.txt`, a text file named `.ttf` and an empty `.otf`: "That file isn't a font we can read. Use a TTF, OTF, WOFF or WOFF2 file." Truncated TTF: "That font couldn't be read." No request of any kind when a file is chosen | PASS |
| AC-295 | P0 | n/a | `fsType` 2: "This font's licence settings don't allow putting it in a PDF." and nothing is added. `fsType` 4 (preview and print) is accepted | PASS |
| AC-296 | P1 | n/a | With the permission granted, "Show installed fonts" lists 28 families and one can be picked and saved. Without the API the control is absent and "Add a font file" remains. **The PDF's own font is not looked up on the device** (the spec's build status says so) | **FAIL** |
| AC-298 | P0 | Run opens in place; looked the same on this file | Embedded TrueType (12 lines, 4 files): the box is filled only once the document font is ready (20–75 ms, text transparent until then), start and end within 1 device px at DSF 2, neighbours untouched. **`latex-type1c.pdf` (embedded Type 1C / CFF): all 12 lines open in the system "Times New Roman" (`data-face="none"`), 88% of the ink moves** (`ours-cff-line-open-1280.png`). Smaller: "Team memo" keeps its ends but the gap between the words widens and the letters tighten; the mixed bold/italic line drifts up to about 1.5 CSS px inside the line | **FAIL** |
| AC-299 | P0 | Click opens the run | Click: caret within 0.1–6.6 px of the click on 18 lines. Keyboard (listbox, arrows, Enter): caret at the end, 0 characters after it. Selection type "Caret", 0 animations | PASS |
| AC-300 | P0 | Nothing said | Latin, Greek, Cyrillic, CJK, emoji: underlined in place and named ("Not in this font: ř á k"), typing never blocked, focus stays in the box, `role="status"` text for screen readers. **Hebrew, Arabic, Devanagari and Thai typed into a Liberation Serif line are not underlined and not named.** On Enter the whole edit is then thrown away with "This font has no …" (gap 3) | **FAIL** |
| AC-301 | P0 | No fonts offered | Two fonts offered (Tinos pressed, then Arimo), at most three in every case seen. Picking Arimo redraws ř at once (`bp-arimo`), the status says "Arimo draws it", the output has `BERRYA+Arimo` for ř only, and the next line in the same document font opens with Arimo pressed first. For Greek, Cyrillic and CJK no font is offered: staging has no slice with them (see AC-302) | PASS |
| AC-303 | P1 | Browser text layout | `font-kerning: none`, `font-variant-ligatures: none` on every box; box width equals the line's width (≤ 1 px) on 18 lines, justified lines included | PASS |
| AC-304 | P0 | No hint | The box never covers a neighbour (0 changed ink pixels outside the line on 18 lines). The hint is one opaque row (26 px), reachable with Tab without closing the box, Enter picks. **But it is placed over the box even when the space under the box is empty, and then hides the line above**: on "in full." it covers "in force until both" (`ours-hint-under-1280.png`); on a middle line it covers 20 px of the line above; at 390 px it covers the heading | **FAIL** |

### ACs not judged

| AC | Pri | Why |
|---|---|---|
| AC-270, AC-272, AC-273, AC-274 | P0, P1, P0, P1 | Crawler and catalogue-build behaviour. It cannot be seen on staging, and the evaluator may not read or run the code. What staging shows is consistent: 54 families, no duplicates, every licence on the list |
| AC-302 | P1 | Not testable yet: needs library faces with Greek, Cyrillic and other alphabets. Staging serves Latin slices only; the bucket library is published but not switched on |
| AC-283, AC-285, AC-287, AC-288, AC-297 | P0, P1, P1, P0, P1 | The spec marks them "Not in this PR". AC-280 was judged for edits only, for the same reason |

AC-276 to AC-279, AC-289 and AC-305 to AC-309 are reserved numbers with no text.

## Micro-comparison (M1–M12)

Fixture `chrome-justified-mixed.pdf`; task: open the first body line, type " for Dvořák" at its end, save. Timings are single runs on Sejda (two-task budget), three on ours.

| Check | Sejda | InstaPDF | Numbers | Result | Captures |
|---|---|---|---|---|---|
| M1 Landing | Title, subtitle, then Upload | Open PDF first | 3 words before the action (Sejda 17 / 28, from the F16 eval, not recounted) | win | `01-landing-*.png` |
| M2 Upload start | Click, drop, Dropbox, Google Drive, OneDrive, URL | Click, drop, paste, blank page | unchanged | **lose** (carried over; no waiver) | `01-landing-*.png` |
| M3 Loading | Uploads, then renders | Renders in the tab | First page 217–406 ms over 21 runs; Sejda 4.96 s pick to text (with requests held to 1 per second) | win | `03-file-open-*.png` |
| M4 Display | Page 580 px wide in a 390 px viewport | Page fits the width | Sejda `scrollWidth` 600 at 390 | win | `03-file-open-390.png` |
| M5 Interaction | One font run at a time; typing runs into the next run | Whole line in its own fonts; missing letter flagged while typing; font picked with Tab and Enter | Same 13 keystrokes on both | win | `05-missing-letter-typed-*.png` |
| M6 Options | 36 fonts in a flat list, the document's fonts by PostScript name, no search, no own fonts | 54 families, search, match labels, own font file, installed fonts | 36 vs 54 | win | `06-font-menu-*.png` |
| M7 Processing | Apply, wait, result page, Download | Download in place | 6.6 s vs 0.86–0.92 s | win | `07-result-1280.png` |
| M8 Output fidelity | New text printed over "Provider"; reading order broken | Reading order and embedded font kept, but **"Dvořák" is clipped out of the page** | both qpdf-clean | **tie** (both outputs lose text; ours is gap 1) | `08-output-fidelity.png` |
| M9 Errors | "More fonts…" says local fonts need the desktop app; nothing about a missing letter | Plain messages for a wrong, broken or no-embedding font file; missing letters named | see AC-294, AC-295 | win | `ours-own-font-*.png` |
| M10 Privacy | 30,583 B uploaded on pick | 0 B; fonts read in the tab | 0 non-GET requests in all sessions | win | — |
| M11 Look | Floating toolbar over the heading; 600 px page on a phone | One compact hint row; quiet notice | — | win | `05-…`, `06-…` |
| M12 First screen fit | 1366x657: page 91% of width, 49% of height (45% of the screen); 390x664: 46%, with sideways scroll; Apply in view | 1366x657: 87% x 82% (72%); 1280x632: 73%; 1536x730: 65%; 1920x969: 55%; 390x664: 96% x 80% (76%); Download in view everywhere | measured on both sites at two viewports only | win at the two viewports measured on both; the other three have no reference run this round | `sejda-m12-*.png`, `ours-editor-open-*.png` |

## Lighthouse (mobile, simulated throttling) and axe

- Lighthouse on `/edit-pdf`: performance 85 / 91 / 97 (median **91**), accessibility 100, best practices 100. LCP 1.4–1.6 s, CLS 0, TBT 180–580 ms. The runs shared the machine with other test browsers, which explains the spread. SEO is 66 because staging is noindex.
- axe at 1280 and 390 px across landing, editor open, line open, missing-letter hint, stand-in notice and the Change font menu:
  - **1 critical: `aria-valid-attr-value`.** While a line is open, the listbox "Text on page 1" has `aria-activedescendant="ed-p0-l1"`, but that option is removed from the list during the edit. Seen in the "line open" and "missing-letter hint" states at both sizes.
  - Moderate: `landmark-banner-is-top-level` (already in the F16 list).

## Gap list (actionable, in priority order)

1. **Output: text typed past the page's clip is invisible (M8).** Chrome-printed PDFs clip the content to the print area. After " for Dvořák" on a full-width line, the saved file shows "…shown below, for l" in PDFium and in our own page view; "Dvořák" is in the text layer but not drawn. The editor shows the full text while typing and gives no warning. Draw the edited line outside the clip (or widen it), or warn before saving. Re-check with `cache/f24-font-library/ours-same-task-line-edit-dvorak.pdf`.
2. **AC-300 (P0): Hebrew, Arabic, Devanagari and Thai letters typed into a Latin line are not flagged.** No underline, no hint, no status text. Flag them like Greek and Cyrillic.
3. **A line whose missing letters have no font is thrown away on Enter.** Greek, Cyrillic, CJK, emoji and the four scripts above: the toast says "This font has no …", the line returns to its old text, Undo stays disabled, and no font or "Use your own font" is offered. Keep the typed text (stay in the box or make it restorable) and offer the font choices there.
4. **AC-304 (P0): the hint hides the line above when there is room below.** Place it under the box whenever no ink is there (judge by the text actually drawn, not the neighbour's tall box), and when it must go over, keep it off the neighbouring text. On a phone it currently covers the heading.
5. **AC-298 (P0): embedded CFF fonts open in a system font.** `tests/parity/editor/latex-type1c.pdf` (Type 1C `FontFile3`): every line shows `data-face="none"` and "Times New Roman". Load the wrapped CFF program, or at least fall back to the closest library font as for Type 1.
6. **axe critical: stale `aria-activedescendant`.** Clear it, or keep the option in the list, while its line is being edited.
7. **AC-286 (P0): the phone notice names only the stand-in.** Show both fonts at 390 px as on desktop, and keep "Use your own font" reachable from it.
8. **Matcher: Courier Prime and Roboto Mono never match.** All six faces stay at "No match yet" (60 s wait, two runs). Also, in one document with more than about 22 fonts, the fonts after the 22nd stay at "No match yet" for good (150 s wait, 54- and 87-font files).
9. **AC-296 (P1): look the PDF's font up on the device** after the permission prompt.
10. **M2 (lose): no cloud or URL import.** Unchanged since F3 and F16: add the sources or record the owner's waiver in this file.
11. **Box layout drift.** "Team memo" (`libreoffice-memo.pdf`) changes its letter and word spacing when opened; the mixed bold/italic justified line moves up to about 1.5 CSS px inside the line. Place glyphs by the PDF's own advances.
12. **`/fonts/editor/*.woff` are not content-hashed and are sent with `max-age=0`.** These are the files used for the Standard rows and the Tinos / Arimo stand-ins. Outside AC-275's `/fonts/lib/` wording, but the same rule should apply.
13. **Two font objects per stand-in.** One for the `latin` slice and one for `latin-ext` (for example `BERRYA+Tinos` with ř, `BERRYB+Tinos` with á and k). Merge them into one subset.
14. **Focus after a mouse-opened edit lands on `body`.** After a keyboard-opened edit it returns to the listbox, which is right.

## Where InstaPDF is better than Sejda

- The whole line is edited in the PDF's own fonts; Sejda edits one run and prints over the next one.
- A missing letter is named while typing and the stand-in can be chosen; Sejda says nothing.
- Only the missing letters change font, in subsets of about 1 KB; Sejda re-embeds a 10.5 KB subset for the run.
- The matcher reads outlines, so a wrong font name does not mislead it; Sejda lists PostScript names only.
- 54 searchable families, own font files and installed fonts, all read in the tab; Sejda has a flat list of 36 and sends users to its desktop app for local fonts.
- Nothing is uploaded, and saving takes under a second against 6.6 s plus a result page.

## Owner waiver

None on record. M2 is therefore counted as a loss.

Note from the lead (2026-11-24, after this evaluation): AC-296 is P1 and deferred to a follow-up; it does not block the re-evaluation.

Note from the lead (2026-11-24, after this evaluation): M2 is owned by the cloud pickers feature (F23). Its code merged in #32 and stays behind a flag until the owner creates the OAuth apps, so it is blocked on owner setup, not waived, and is not F24's to fix.

## Harness notes

- **Sejda T1.** The output was lost to a wrong selector in the evaluator's script, so both tasks went on the same edit and no second scenario (for example `libreoffice-memo.pdf`) has a reference output. Checks without a Sejda reference run this round: the added-text font preview (AC-292), the font replacement dialog, first-screen fit at 1280x632, 1536x730 and 1920x969, and medians for M7.
- **Sejda timings** were taken with requests held to 1 per second, so its load time is an upper bound; only the Apply-to-ready time (one request) is comparable.
- **AC-284** uses the evaluator's own sample built with reportlab subsetting, not the builders' Chrome- and Word-style set.
- **AC-296** was checked with the `local-fonts` permission granted in headless Chromium; the prompt itself cannot be seen headless.
- **Phone width** was 390x844 as instructed for this round, not 375.
- **Touch keyboard.** Headless phone emulation has no on-screen keyboard, so the hint's position against a real keyboard was not checked.
- The cached Sejda log has its session token removed.
