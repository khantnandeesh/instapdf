# Evaluation: F24 Font library and font matching

- **Verdict: FAIL**
- Evaluated: 2026-11-24 (17:13–18:05 UTC) by parity-evaluator
- Spec: `docs/specs/f24-font-library.md` (AC-270 to AC-309 reserved; 30 are written). **20 judged** (17 P0, 3 P1), 10 left out, listed with reasons under "ACs not judged".
- Reference: https://www.sejda.com/pdf-editor
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf (deployed from `main` `a0920ba` at 17:05 UTC; serves the in-app font copy: 54 families, 179 faces, Latin and Latin-ext slices only)
- Harness: Playwright (headless Chromium 1243), pikepdf, pypdfium2 (text, per-character font, renders), fontTools, reportlab, Pillow, axe-core 4.14.1, Lighthouse 12 (mobile). No source code, builder notes or PR text were read. One exception to note: the earlier Sejda-driving script from the 17:01 check (`scratchpad/sejda.cjs`) was read for Sejda selectors only.
- Fixtures: `tests/parity/editor/` (`chrome-justified-mixed.pdf`, `libreoffice-memo.pdf`, `std14-reportlab.pdf`, `latex-type1.pdf`, `latex-type1c.pdf`, `cid-bold-run.pdf`, `font-coverage-1p.pdf`), plus files generated for this eval from the fonts staging itself serves and from DejaVu Sans / Inter on the test machine: nine PDFs with 141 library faces under hidden names, `ac281-library-family.pdf`, `ac282-name-lies.pdf`, and own-font files (TTF, WOFF, WOFF2, OTF, a no-embedding font, a truncated font, a text file renamed `.ttf`, an empty `.otf`, a `.txt`).
- Screenshots (both sites, 1280x800 and 390x844, DSF 2): `/mnt/project-files/designs/fonts/eval/`. Side-by-side images (Sejda left): same folder, `01-…` to `08-…`, copied to `/mnt/project-files/comparisons/f24-font-library/` and, at half size, to `docs/evals/cache/f24-font-library/micro/`.
- Raw outputs, logs and the harness scripts: `docs/evals/cache/f24-font-library/`.

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
| T2 | 17:27:02 | 17:27:08.6 (6.6 s); downloaded 17:27:09.5 | The same edit. Task `Y3O3QH4Z-202611241827` | `cache/f24-font-library/sejda-t2-line-edit-dvorak.pdf` | 34,763 B, qpdf-clean. See below. |

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

## Harness notes

- **Sejda T1.** The output was lost to a wrong selector in the evaluator's script, so both tasks went on the same edit and no second scenario (for example `libreoffice-memo.pdf`) has a reference output. Checks without a Sejda reference run this round: the added-text font preview (AC-292), the font replacement dialog, first-screen fit at 1280x632, 1536x730 and 1920x969, and medians for M7.
- **Sejda timings** were taken with requests held to 1 per second, so its load time is an upper bound; only the Apply-to-ready time (one request) is comparable.
- **AC-284** uses the evaluator's own sample built with reportlab subsetting, not the builders' Chrome- and Word-style set.
- **AC-296** was checked with the `local-fonts` permission granted in headless Chromium; the prompt itself cannot be seen headless.
- **Phone width** was 390x844 as instructed for this round, not 375.
- **Touch keyboard.** Headless phone emulation has no on-screen keyboard, so the hint's position against a real keyboard was not checked.
- The cached Sejda log has its session token removed.
