# Evaluation: F24 Font library and font matching

## Re-evaluation 2026-11-24 (staging f68ba1d)

- **Verdict: FAIL**
- Evaluated: 2026-11-24, 22:13–22:55 UTC, by parity-evaluator. No source code, builder notes or PR text were read.
- Candidate: https://web-staging-qzq5fa2g7q-uc.a.run.app/edit-pdf. `/api/health` reports version `f68ba1d058ee077f4feb8d89fe2fcdad6f70c939`. Staging now serves the full library: `/fonts/lib/manifest.json` counts 1,971 families, 7,933 faces (the first evaluation saw 54 families, Latin only). That is why three criteria that passed on Latin letters now fail on other alphabets.
- Sizes: 1280x800 and 390x844 (touch), device scale factor 2, headless Chromium 1243.
- Sejda evidence: reused from the first evaluation, plus one real task and four upload-only visits today (see "Sejda tasks spent").
- Our raw outputs, logs and scripts: `docs/evals/cache/f24-font-library/rerun/`. Our screenshots: `/mnt/project-files/designs/fonts/eval-rerun/`. New Sejda captures, logs, output and three side-by-side images (`05-clip-typed.png`, `05-cff-line-open.png`, `08-output-fidelity-clip.png`): `/mnt/project-files/evals-cache/f24/` (not in git).

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
