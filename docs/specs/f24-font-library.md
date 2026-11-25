# F24 Font library and font matching

Status: draft, 2026-11-24. Owner-facing proposal with the decisions still open: https://claude.ai/artifact/LpohT5mV2VooC7hh4HTGRg

**Goal (owner, 2026-11-24).** New and edited text should use the font that is in the uploaded PDF. When that font cannot draw a character, use the closest font we can legally offer, or one the user supplies. BerryPDF should have the best fonts of any PDF editor.

## 1. Reference behaviour

Captured live on 2026-11-24 with `font-coverage-1p.pdf` (images and the full list in the project files under `designs/fonts/sejda/`), plus the earlier checks in `f16-pdf-editor.md` §2a and `f16-reference-live-checks.md`:

- The font menu is one flat list of 38 entries: 35 bundled open fonts (some labelled with the commercial font they stand in for) and, at the end, the document's own fonts by PostScript name. No search, no grouping, no ranking by closeness to the page.
- "More fonts…" opens a dialog saying local fonts are not available online and pointing to the desktop app. There is no font upload.
- A character missing from the document's font opens a blocking "Font Replacement" dialog listing 33 fonts, unranked (earlier check; not re-captured on 2026-11-24).
- A missing ₹ silently switched the whole run to a sans face (earlier check).
- The preview while typing uses a bundled web font, not the font that is saved (earlier check).

## 2. The font ladder

Each step is used only for the characters the step before it cannot draw.

1. **Embedded font.** The font program inside the PDF, when it covers the character (built for edits; extended here to added text near existing text).
2. **Same family from the library.** Matched by name and alias, then confirmed by comparing the outlines of the characters both fonts have.
3. **The user's own font.** From the device (Local Font Access, Chromium desktop) by PostScript name, or an uploaded TTF, OTF, WOFF or WOFF2. Read in the browser only; never uploaded. The font's embedding-permission flag (`OS/2.fsType`) is respected.
4. **Metric-compatible twin.** A curated table (Arial → Liberation Sans, Calibri → Carlito, and so on).
5. **Closest look.** A fingerprint of the embedded font's outlines ranked against a precomputed index of the library: a coarse pass over every face that covers the script, then a per-glyph pass over the top 20.

## 3. Library

- **Sources.** Open catalogues only: Fontsource (Google Fonts and others), google/fonts, Noto, the metric-compatible sets, SIL, and per-font checked entries from The League of Moveable Type, Velvetyne and Font Library. 2,093 families and 8,673 faces passed the gate on 2026-11-24 from the first source alone.
- **Licences.** OFL-1.1, Apache-2.0, UFL-1.0, CC0-1.0, MIT, Unlicense. Commercial fonts and "free for personal use" fonts are never crawled or served. GUST Font License (TeX Gyre) and Bitstream Vera (DejaVu) wait for the owner's decision.
- **Pipeline.** Crawl (at most 1 request a second) → licence gate → de-duplicate → fingerprint (`berry-fontmatch`, the same Rust code as in the browser) → publish static, content-hashed files.
- **Storage.** A public, read-only Cloud Storage bucket: `index/names.bin`, `index/features.bin`, `index/sig/<face>.bin`, `fonts/<sha>.woff2`, `licenses.json`. About 2 GB. Estimated ₹10 to ₹60 a month; needs the owner's OK as a paid resource. The CSP gains that one origin for `font-src` and `connect-src` (downloads only).

## 4. Engine contract

`FontRequest` stays the one way to ask for a font. Proposed additions (diff to the lead before building, based on main after PR #33): `fontFingerprint(fontObject)`, `sameDesign(fontObject, face)`, `addFont` accepting OpenType/CFF and a source tag, and matcher-ranked `FontRequest.families`.

## 5. Acceptance criteria

AC-270 to AC-309 are reserved for this feature.

**Library**

- **AC-270 (P0)** A font enters the catalogue only with a licence on the list in §3; anything else is rejected with a recorded reason.
- **AC-271 (P0)** Every catalogue entry keeps its licence, source and version, and the third-party notices page lists every family the app can serve.
- **AC-272 (P1)** A family that appears in two sources is stored once (newest version).
- **AC-273 (P0)** The crawler reads only the listed catalogues and sends at most 1 request a second to any host.
- **AC-274 (P1)** A crawl that returns fewer than 500 families fails instead of publishing a shrunken catalogue.
- **AC-275 (P0)** Font and index files are served from content-hashed paths with one-year immutable caching; nothing is uploaded to that origin, and the CSP test proves uploads stay blocked.

**Matching**

- **AC-280 (P0)** Text typed with characters the embedded font covers is saved in the same font object (unchanged from AC-10), for added text placed on an existing line as well as for edits.
- **AC-281 (P0)** When the PDF's font is a library family and its subset lacks a typed character, the character comes from that same family and the run is visually indistinguishable (glyph-shape difference below threshold).
- **AC-282 (P0)** A font whose name matches a library family but whose outlines differ is not treated as the same family.
- **AC-283 (P0)** For Arial, Helvetica, Times New Roman, Courier New, Calibri, Cambria, Georgia and Segoe UI with no device font, the metric-compatible twin is chosen and the line width is unchanged when the text length is unchanged.
- **AC-284 (P0)** Matcher accuracy on the generated test set (library faces subset the way Chrome and Word do, names hidden): the true family is ranked first in at least 95% of cases.
- **AC-285 (P1)** A visual match is found within 300 ms after its data has loaded, on a mid-range phone.
- **AC-286 (P0)** Only the missing characters switch font; the rest of the line keeps the embedded font. An inline notice names both fonts. No blocking dialog.
- **AC-287 (P1)** A substitute is scaled to the original's x-height and width-fitted within 90 to 110%.
- **AC-288 (P0)** Hindi, Arabic, Hebrew and the other supported scripts get a face of the matching script and style (serif or sans; Naskh, Kufi or Nastaliq).

**Editor**

- **AC-290 (P0)** No font index or library font loads before the font menu opens or a match is needed; the editor's first-screen budgets are unchanged.
- **AC-291 (P0)** A font file loads only when previewed or used, and only the script slice the text needs.
- **AC-292 (P0)** The file used for the preview is the file embedded in the output (extends AC-91).
- **AC-293 (P1)** The font menu searches every family and shows "In this document", "Closest matches", "On this device" and "All fonts", with one scroll region.
- **AC-294 (P0)** Upload accepts TTF, OTF, WOFF and WOFF2, rejects anything else or a broken file with a plain message, and makes no network request with the file.
- **AC-295 (P0)** A font that forbids embedding is refused with a plain message.
- **AC-296 (P1)** Where Local Font Access exists, the PDF's font is looked up on the device after one permission prompt; elsewhere the control is absent and upload is offered.
- **AC-297 (P1)** An uploaded font can be kept on the device for later sessions and removed again.

## 6. Open questions

1. Owner: open licences only (recommended), the bucket cost, and the two extra licence families.
2. Real-world rate at which embedded subsets cover an edit: to be measured on the Q2 corpus (our own fixtures are too few).
3. Whether the library and the editor work ship as one PR or two (lead).

## Build status (first PR)

Delivered and tested:

- AC-270, AC-272 to AC-274: catalogue crawler and licence gate (`apps/web/scripts/font-library/`).
- AC-271: every family of the in-app library is on the third-party notices page, with its licence text published at `/fonts/lib/licences/<id>.txt`.
- AC-275: `/fonts/lib/*` on our own address; content-hashed files are immutable for a year, `manifest.json` for five minutes. With `FONTS_ORIGIN` set at build the same paths pass through to the fonts bucket; without it the in-app copy (54 families, Latin, regular and bold, about 11 MB) is served.
- AC-281, AC-282, AC-284: matcher (`crates/berry-fontmatch`, 99.6% first on the 484-face sample) and its use in the browser (`src/lib/font-library/match.ts`).
- AC-286: the stand-in notice with "Change" and "Use your own font"; "Change" undoes the edit and makes it again with the chosen font.
- AC-290 to AC-293: the font menu. It has one more section than planned, "Standard" (the five built-in faces with the names they stand for).
- AC-294, AC-295: your own font file (TTF, OTF, WOFF, WOFF2), kept in the page's memory only.
- AC-296 (part): installed fonts can be listed and picked where the browser allows it. Looking the PDF's font up on the device automatically is not built.

Not in this PR:

- AC-280 for added text placed on an existing line, AC-285 (timing on a phone), AC-287 (x-height scaling), AC-297 (keeping an uploaded font for later sessions). (AC-283 and AC-288 were built in the sixth PR, below.)
- The engine takes TrueType outlines only for stand-ins: an OTF (CFF) font of your own works for added text but not yet for existing text.
- The recognise-only tier, and a catalogue source for the GUST (TeX Gyre) and Bitstream Vera (DejaVu) families.

Licences served: OFL-1.1, Apache-2.0, MIT, UFL-1.0 (Ubuntu), CC0-1.0, and (once a catalogue source lists them) the GUST Font License and Bitstream Vera. The owner allowed the last four on 2026-11-24 and CLAUDE.md rule 3 names them. Unlicense is not on the list.

Review follow-ups (not blocking): arrow-key movement in the font list; parse large user fonts off the main thread; a timeout on the match worker.

## Fonts bucket and the full library (second PR)

- **Bucket.** `<project>-fonts` (Terraform, `infra/main.tf`): public, read by name only, one for staging and prod. The only writer is the `Publish font library` workflow's own identity. Details and cost in `infra/README.md` "Fonts bucket".
- **Full build.** `build-library.mjs --source npm` builds every family of the gated catalogue (2,092 on 2026-11-24: every weight, style and script slice except numbered CJK slices) from its `@fontsource` package on the npm registry, checked against the registry's sha512, about two seconds a family. A family whose package is missing, fails its check or fails the gate again is skipped and reported.
- **Serving.** The staging deploy builds with `FONTS_ORIGIN` when the bucket has a `manifest.json`; `/fonts/lib/*` is then passed through to the bucket and the image carries no fonts. `FONTS_ORIGIN` is checked (a Cloud Storage bucket address only) and only the library's own paths are passed through. Caching comes from the objects' own metadata, set at upload (a year for content-addressed files, five minutes for `manifest.json`).
- **Notices.** With the bucket, the notices page lists every library family with its licence and links to its licence text at `/fonts/lib/licences/<id>.txt`.
- Checked by hand against a six-family library with every weight and script slice (Roboto, Inter, Noto Sans, Noto Sans Devanagari, Noto Sans JP, ABeeZee) served through the passthrough: menu, matching, typing Devanagari with a library font and the download all work, and no request leaves our address.

## Editing a line in the PDF's own font (third PR)

Owner, 2026-11-24: on a click the line's font changed to another one while typing and changed back on Enter ("why show font B at all?"); a letter the font lacks should be told while typing, with fonts to choose from; the flow must be well structured.

**Reference.** Checked live on 2026-11-24 (17:01 UTC, headless Chromium, `tests/parity/editor/chrome-justified-mixed.pdf`, nothing applied or downloaded; images `designs/fonts/sejda/line-edit-1-opened.png` to `line-edit-5-after.png` in the project files):

- Sejda edits one font run at a time, not a line: hovering the first line outlines only "This agreement is made between the", and the bold word after it is a separate piece.
- A click opens that piece in place under a floating toolbar. On this file (embedded Liberation Serif subset) the text looked the same after the click, so the font swap our research records (`f16-pdf-editor-research.md`) did not show here; it is recorded there for files whose font Sejda can't use.
- Typing " for Dvořák" at the end of the piece ran over the bold word that follows: the two overlap and can't be read, and they stay that way after clicking away. The text after the piece does not move.
- Nothing was said about ř, which the subset doesn't have: no mark, no message, no fonts offered while typing.

We keep what is useful (the edit happens in place) and go further: the whole line is one box drawn in the document's own fonts, so nothing changes on screen and what follows moves along as you type; a missing character is told as it is typed; and the font chosen for it applies at once.

**How.** The engine hands over a document font's embedded program and where it keeps each character (`fontProgram`). `lib/font-library/embedded-face.ts` adds what a browser needs and a PDF leaves out (character map, name and metrics tables; an OpenType file around a bare CFF program), and the result is loaded as a font of the page only (`tools/editor/doc-face.ts`): nothing is fetched or sent, and it goes when another file is opened. Where a program can't be used (not embedded, Type 1, Type 3), the closest library font stands in, as before.

- **AC-298 (P0)** A line opens in an edit box that draws every part of it in the font that part has in the PDF (a bold or italic word keeps its own font), in its colour, over the page's own paper colour, on the same baseline and start and at the same length as on the page. No other font is shown in its place at any moment: until the font is ready the page's own drawing shows through the box.
- **AC-299 (P0)** A click opens the line with the caret where the click landed; the keyboard opens it with the caret at the end. Nothing is selected or animated on opening.
- **AC-300 (P0)** A typed character the line's font can't draw is underlined where it stands and named under the box as it is typed. Typing is never blocked and focus never leaves the box.
- **AC-301 (P0)** Next to the name of the missing characters the closest fonts that have them are offered (at most three, the closest first and already in use). Picking one draws the characters with it in the box at once and writes the file with it on Enter; it is remembered for that document font.
- **AC-304 (P0)** The box and its paper never cover a neighbouring line's text, and the hint is one compact opaque row, starting at the missing character: under the box whenever no text is drawn where it would stand (judged by the text itself and the hint's real size), else over it. Inside a paragraph it then covers part of the line above (the one already read), never the box or the line that follows. The fonts in it are reachable with Tab without ending the edit, and a screen reader is told when a character is missing.
- **AC-302 (P1)** For characters of another alphabet (Greek, Cyrillic, Hebrew, Arabic, Devanagari, Thai) the fonts offered and tried include library families of the same kind that have that alphabet.
- **AC-303 (P1)** The edit box lays glyphs out as a PDF does (no kerning or ligatures of the browser's own), and its text is fitted to the line's length on the page (justified text).

Checked in `e2e/f24/line-edit-font.spec.ts` (the box's ink is compared with the page's, pixel for pixel in place) and `lib/font-library/embedded-face.test.ts`.

Not in this PR: Hindi, Arabic and other joined scripts open in a stand-in font that can join their letters (the embedded program carries the glyphs but not the joining rules), with nothing marked as missing; lines turned on the page and right-to-left lines open in their own font but centred in the box, not on their baseline; a CFF font is covered by a made-up program in the tests because the corpus has no PDF with one.

## Joined scripts in the edit box (fourth PR)

Hindi, Arabic and other joined scripts: a PDF's subset has the glyphs but usually not the rules that join them (Chrome's and LibreOffice's subsets carry no GSUB or GPOS), so no browser can set such text in the document's own font. The engine already knows how the edit will be drawn, so it says so: `previewLine` makes the edit, reads the line back, rolls it back and returns every glyph the line then draws, with its outline from the embedded program and its place on the page. The box draws those outlines over its own text, which stays (unseen) for the caret, selection and input methods.

- **AC-305 (P0)** A Hindi or Arabic line opens in the box exactly as it is on the page (same glyphs, same place), in the document's own font.
- **AC-306 (P0)** While typing, the box shows the line as Enter will write it: the same glyphs and places (a new word in the document's font where its program can shape it, in the stand-in the engine embeds otherwise). A right-to-left line keeps its right end and grows to the left.
- **AC-307 (P0)** An edit the engine would refuse (for example punctuation next to punctuation in an Arabic line) shows the typed text in a font that joins letters, so typing is never hidden; nothing is written until Enter, which reports the refusal as before.
- **AC-308 (P1)** The caret stands where the drawn text ends (the unseen text is spread to the drawn glyphs' length), and the box and its paper cover the drawn glyphs without reaching a neighbouring line.

Checked in `crates/berry-engine/tests/line_preview.rs` (the preview is exactly what the edit draws and changes nothing) and `e2e/f24/line-edit-joined.spec.ts` (the box's ink against the page's, on opening and after Enter).

Not in this PR: turned pages and turned lines keep the stand-in font, and so do a font the engine can't read outlines from (Type 1, Type 3, not embedded) and stroked text (render modes 1, 2, 5, 6); slanted text (a skewed text matrix, such as a synthetic italic) is drawn upright, and a CID-keyed CFF font whose matrix sits in its FDArray is drawn at the top-level scale; the caret inside a word is placed by the unseen text, so it can sit a little off the drawn letters; text typed past the page's edge scrolls inside the box while the drawn glyphs do not; each keystroke makes and rolls back a full edit (fine for a line, and requests never queue up: only the latest text is asked for).

### After the first evaluation (fifth PR)

The evaluation of 2026-11-24 (`docs/evals/f24-font-library.md`) failed on four P0 criteria, one critical accessibility issue and one output defect. What changed:

- **AC-310 (P0)** Typed text is never thrown away. When an edit can't be saved (no font has a character, the line would run past the page, the engine refuses it), the message says why and that the text is still in the box, and the box is open again with it and has the caret. Leaving the box with the same text neither tries again nor drops it; Enter tries again; changing the text, picking a font in the hint or adding your own font makes the next leave try again; Escape gives the line back as it was. While such a line is open, Download stops with a message instead of writing a file without it.
- **AC-311 (P0)** An edit that would push text past the rectangle the page clips its content to (every Chrome print has one) is refused like one that runs past the page edge, with "Replace with new text" on offer: the words are never written where no reader draws them. Only upright rectangular clips are followed; other clip shapes are not guessed at.
- **AC-312 (P0)** When no font here has a missing character, the hint says so and offers "Use your own font" in place, without ending the edit; a font added that way is offered at once.
- AC-300 now covers Hebrew, Arabic, Devanagari and Thai letters typed into a line that is drawn letter by letter: they are marked and named like any other missing character (the line keeps its own font).
- AC-298 now holds for embedded CFF programs whose subset keeps no advances of its own (`latex-type1c.pdf`) and for subsets with a wrong advance table (`reportlab-mono-subset.pdf`): the box sets every glyph by the width the PDF declares, as a PDF reader does. The same fix lets these fonts be matched to the library (they showed "No match yet").
- AC-286 on a phone: the notice names both fonts in full (two short lines at most); "Use your own font" stays inside "Change".
- The list of lines no longer points a screen reader at the line that is open in the box.
- Up to 100 fonts of a document are matched (was 24).
- **AC-313 (P0)** On a phone (the layout with the bottom tool dock) the hint does not float over the page: it is one slim row just above the dock, reading "Not in X" with at most two fonts, or "Use your own font" when no font here has the character. The missing character stays marked in the line. The page does not move. The row is always at the same spot, directly above the dock (above the on-screen keyboard while one is open; not checked on a real device yet). While a message is showing, the row is not shown as well: its fonts or "Use your own font" sit in the message, and the row is back when the message goes. Tab from the box reaches the row's buttons, Shift+Tab from the first comes back to the box, and Tab past the last leaves the edit.
- A line kept open because it couldn't be saved is not dropped by opening another line (a message says why) and Escape gives it up from anywhere; Download pressed while its save is under way waits for the outcome. On a phone, messages now sit directly above the dock (or above the options strip when it has something in it).

- The edit box's outline is always a closed rectangle: on tightly set lines its top and bottom edges are drawn just inside the neighbouring lines' text instead of being left out (owner, 2026-11-24, from a screen recording). Sejda draws no outline round the line being edited.

### After the re-evaluation (sixth PR)

The re-evaluation of 2026-11-24 on staging `f68ba1d` failed on AC-281, AC-301, AC-282 and AC-298, and AC-283 and AC-288 were not built. What changed, by its gap list:

- **AC-281, AC-301 (gap 1).** Fonts for letters outside Latin are tried closest first: the document's own family when the library has it with the letter (Carlito stays Carlito for Greek and Cyrillic), then the matched family (Liberation Serif takes Tinos for Greek, Cyrillic and Hebrew), then the next closest by shape, and only then other families that have the alphabet. A built-in family (Latin only in the app's own copy) takes its other alphabets from the library's copy of the same family.
- **AC-282 (gap 2).** Shapes come before names everywhere: a font that carries a library family's name but is drawn differently opens, saves and is listed with the font that looks like it, and the stand-in notice shows.
- **AC-298 (gap 3).** A line opens exactly as the page has it when its text alone doesn't say where things go:
  - Glyphs a TeX font names `ff`, `ffi` and `ffl` are read as those ligatures (they were dropped from the line's text and from its screen-reader label).
  - Each word is set where the page has it: a gap the text has no characters for (a tab, dot leaders, the word gaps of a TeX line, justified text) goes before its word; letter spacing and a wider or narrower setting are spread between the word's letters. Where most single spaces are short by the same amount (justified text) that amount is the line's word spacing, so a space typed later is as wide as its neighbours.
  - An accent drawn as a glyph of its own over a letter (TeX's `\'e`) stays over that letter. Which letter is read off the glyph order and widths; a dotless i or j takes the accent before it.
  - Runs and words are placed by their own text: the engine counts a ligature as one character, which shifted a bold run or a word's start by one after "ti" or "ffi".
  - Known limit: a wider setting (horizontal scaling) is shown as wider spacing of the same letter shapes; the saved file keeps the page's own scaling.
- **AC-283 (P0), now built.** Arial and Helvetica take Arimo, Times and Times New Roman take Tinos, Courier and Courier New take Cousine, Calibri takes Carlito, Cambria takes Caladea and Georgia takes Gelasio: first in the menu ("Arimo · Same widths"), first as the stand-in, and at once in the edit box for a font the PDF only names (no matching, so nothing to wait for). A font the PDF carries gets its twin first only when its shapes agree with its name (AC-282 holds). Narrow, Condensed, Black, Rounded and Math cuts have no twin. **Segoe UI has none in the library yet**: its twin, Selawik, is not in the catalogue we crawl (Fontsource), so Segoe UI goes by shape; it is the one family of this criterion still open.
- **AC-288 (P0), now built.** For Hindi, Arabic, Hebrew, Bengali, Tamil, Thai and the library's other scripts the faces offered are made for the script and in the font's own style: serif for a serif font and sans for a sans; for Arabic a Naskh, Kufi or Nastaliq face by the font's name (else Naskh for a serif and a plain sans otherwise). A document font in such a script, which the shape index (Latin letters and digits) cannot place, is listed with these faces as "Similar" instead of "No match yet"; its script is read off the letters it has. Shape matching inside a script is not built.
- **"Replace with new text" (gap 4, micro-check M8).** The old line is taken out of the file by the engine (nothing is covered up, and copying or searching finds the text once), and the typed text is set in its place with each part's style: a bold word stays bold and an italic word italic, in its own size and colour, each stretch of one style a text box of its own on the line's baseline, all set smaller by the same amount (down to 60%) when the text is longer than the line. A text far too long goes in one box that wraps, as before; a line the engine cannot take out is covered with a whiteout, as before. One step to undo. The message says what will happen before it does ("Replacing it sets your text in Tinos."), and "The new text runs into text below it" is said only when the text wrapped or outgrew its room. Justified spacing is not kept (the new text is set at its natural spacing).
- **Gap 5.** A font taken automatically for a missing letter is forgotten when the edit is given up with Escape.
- **Gap 6.** Georgian, Tifinagh, Cherokee, Braille, Ogham and the other alphabets the library has are offered their families instead of "No font here has it".
- **Gap 7.** The outline goes around a line that holds a raised footnote mark (it was drawn through the line's letters to spare the mark).
- **Gap 8.** A message about the line being edited ("Your text is still in the box", "couldn't be saved") goes as soon as that line is saved or given up.
- **Gap 9.** The fonts of a page are made ready in idle time after the page's text is read, and a font the PDF only names opens in its twin without matching, so the first line opened is drawn in its font at once. The warm-up loads nothing of the font library (AC-290 holds); a font that needs the closest library font by shape is still made on the first click.
- **Gap 10.** The phone row reads "Missing: ř á k".
- **Gap 11.** Courier is listed with Cousine (its twin). A font too small to compare by shape that carries a library family's exact name (a stand-in we embedded earlier) is listed with that family instead of "No match yet".

Still open: AC-296; two font objects per stand-in (one per slice); `/fonts/editor/*.woff` caching; focus after a mouse-opened edit; horizontal scaling shown as spacing.

Still open from the first evaluation: AC-296 (looking the PDF's own font up on the device), a character the embedded program has under a code the PDF's own table does not list shows as present in the box and is saved in a stand-in font (the notice after saving says so), two font objects per stand-in (one per slice), `/fonts/editor/*.woff` caching, and focus after a mouse-opened edit.

## Segoe UI's twin (seventh PR)

AC-283 named eight fonts and seven had a twin: Selawik, Segoe UI's, is in no catalogue we read. It now comes from its maker.

- **Source.** Microsoft's own release, `microsoft/Selawik` 1.01 (`Selawik_Release.zip`), SIL OFL 1.1 with the reserved name Selawik. The archive, each font file taken from it and the licence text are pinned by sha256 in `apps/web/scripts/font-library/extras.mjs`; a download that fails or differs stops the publish, so the library never loses the family quietly.
- **Published as released.** The release's own WOFF files, whole (one file a weight, listed with the characters it has): no slicing and no conversion, because a font with a reserved name may keep it only unchanged. Light 300, Regular 400, Semibold 600 and Bold 700; no italics exist. Semilight is left out (its file gives weight 300, the same as Light).
- **Recorded.** The family manifest carries `source` (name, version, release address), and `licences/selawik.txt` opens with the version and release address above the licence text. The notices page lists it with the rest of the library.
- **Where.** Only the published library (`publish-fonts.yml` passes `--extras`). The small in-app copy (development, tests, CI) stays offline and has no Selawik; there Segoe UI falls to the closest shapes as before.
- Not checked by us: Segoe UI's own widths (we may not hold the font). The twin rests on Microsoft's statement that Selawik is its metric-compatible stand-in; its README notes kerning is not matched.

## After the third evaluation (eighth PR)

The evaluation of 2026-11-25 on staging `97b0be6` failed on AC-271, AC-288, AC-298, AC-299, AC-300 and AC-304. What changed, by its gap list:

- **AC-300 (gap 2).** A font the PDF only names has nothing in the file to ask, so nothing was marked. The edit box now keeps the record of what the stand-in (the twin, or the closest font) can draw: a letter it lacks is underlined and named as typed, with the fonts that have it, exactly as on an embedded line. Because the font is chosen before Enter, Enter answers in well under a second (175 to 630 ms measured with the full library; it was 3.4 to 7.8 s).
- **AC-298 (gap 3a).** In a word with an accent drawn over one of its letters, what the word is longer by on the page now stands before the accented letter ("caf é"), not spread between all its letters.
- **AC-304 (gap 3b).** Text of another line that stands inside the row being edited (a raised footnote mark, a subscript) is drawn again over the box's paper, as the page had it when the box opened.
- **AC-299 (gap 4).** The line edit box has no entrance animation (the lead's decision: it sits on the page's own text, and a fade showed both at once). `docs/design/motion.md` E4 says so.
- **AC-288 (gap 5).** Serif or sans of a document font is read from the library's entry of that name, then from the name, then from the PDF's flag, which fonts of other scripts often leave unset. A serif Devanagari, Bengali or Hebrew font, and Amiri, now get the serif face of another script.
- **Gap 8.** A named-only font with a twin is no longer sent to the shape matcher (no index, no signature files): its menu row is ready at once. The notice after such an edit says "Courier isn't in this file. Using Cousine." instead of "isn't complete".
- **AC-271 (gap 1).** The notices page is built into the site image from the published family list, so a publish made after a deploy is missing from it until the next deploy. Open: an owner decision on letting the publish workflow start a staging deploy.

Gap 6 (the page drew a named-only Georgia or Segoe UI in whatever the device has, the box in the twin): the page now draws such fonts in their twins too. The page renderer is given a copy of the file to which an update is appended that attaches the twin's font file to each font the file only names (`lib/pdf/twin-display.ts`); the renderer and its worker are unchanged. The copy is for the screen only: the engine, the saved file and the download never see it. It covers simple fonts with the standard Windows encoding and no font file, in files without a password; any other font stays as the device draws it. So no letter ever goes missing, a font gets its twin only when the twin's Latin file has every letter the font can draw in the file: its own table of widths leaves the others out, or every page's text has been read and none uses them (so in a long file a standard font with no table of widths gets its twin once all pages have been read). Undo, redo and a full rewrite make the update again for that version, checked to hold the same font under the same number; a version seen before costs no second parse. The code and the twin files load only for a file that has such fonts.

Reading of AC-290 for this: a file that only names a font whose twin is in the library needs that match to draw its pages, so the twin's Latin file (and the library's family list) loads when the pages' text has been read, not when the menu opens. A file with no such font still loads nothing of the library before the menu opens or a line is edited.

Still open: gaps 7, 9 to 16; AC-296.

### After the fourth evaluation (ninth PR)

The fourth evaluation (staging 6fbd651) failed on two cases: AC-298 (the open box's text one CSS pixel above or below the page's on some lines) and AC-312 (two missing letters typed together, one of which no font has).

- **AC-298, the baseline.** The browser places a line's baseline in whole pixels from the box's padding and line height, and paints text on whole CSS pixels; the page's canvas draws on device pixels. Padding alone could therefore leave the text up to a pixel off, and a correction measured once made it worse on some lines. Now the text itself is moved onto the whole pixel under the page's baseline (`--ed-rise` on the box's parts, which changes no layout), and on screens with more than one device pixel per CSS pixel the box is moved by the part of a pixel that is left. It is measured again whenever the font, the zoom or the box changes. Bar: the ink of the open box within 0.5 CSS px of the page's, on the five lines of the evaluation, at 1280 and 390 (e2e; measured 0.0 to 0.11).
- **AC-312, letters no font has among letters some font has.** The hint offers the fonts for the letters that can be drawn (two of them beside the box, one on a phone), says "No font has ⸘." naming the letters, and offers "Use your own font". A screen reader hears which font draws which letters and which letters none has. Enter is answered at once (bar: under 0.6 s once the fonts' lists are known) with a message that names only the letters no font has; the text stays in the box. The same check of the fonts' own lists of characters, over the same fonts (the closest ones and the fonts the person added), serves the hint and the save, so no font is fetched and tried for a letter none has. On a phone the row pairs each letter with its answer and never cuts a letter off: "ř" beside its font, "⸘ no font" beside "Your font"; it fits at 320.

Still open: gaps 7, 9 to 12, 14 to 16; AC-296; the items listed as open in the fourth verdict; text typed straight into an emptied box (outside the line's own parts) is placed by padding alone, so it can sit up to a pixel off until the line is opened again.


### After the fifth evaluation (tenth PR)

One cause sat behind what was left of AC-312: the hint, the edit box and the save each worked out
"which font draws the missing letters" for themselves, and each assumed one font. They now share
one answer, `planCover` in `tools/editor/font-service.ts`:

- The font in use draws every missing letter it has. The font with the most of the rest draws the
  rest (a font the person added counts), and so on until nothing is left or no font has any.
- **Hint.** Every font of the plan is offered, even one whose single letter no other font has. When
  two fonts share the letters, each stands beside its own ("ř Tinos  ⸘ DejaVu Sans"), both are
  marked in use, and the status reads "Tinos draws ř. DejaVu Sans draws ⸘.". Picking another font
  makes it the first font and the plan is worked out again.
- **Box.** The box's font list is the plan, in order, so each letter is drawn before Enter in the
  font the file gets.
- **Save.** The plan the box showed is kept with the person's choice. On Enter the fonts of the
  plan are registered together, in order (the engine takes the first registered font that has a
  letter), and the edit is tried once. Only if the engine can't use one of them are other fonts
  tried one at a time. The notice names every font used ("Using Tinos and DejaVu Sans.").
- **Row.** The desktop hint is up to 380 px (560 px with two answers) and wraps inside its paper
  instead of letting a font stand outside it. On a phone the row stays one line: a long font name
  gives way with an ellipsis, the letters never do.
- **Order.** `rankStandIns` gives the box and the save the same order of fonts, so a save made before
  the box has recorded a choice picks as the box would.
- **Name.** The phone's short "Your font" button is named "Your font: use your own font", so its
  name holds the words on it.

Still open: if the font the PDF asks for by name is registered as the second font of a plan, the
engine prefers it for letters both fonts have, so the hint can name the first font for a letter the
second one draws. It needs a picked font that is not the named one plus a letter only the named one
adds; not seen in the corpus.

### After the sixth evaluation (eleventh PR)

AC-312 still failed on one case: a line whose font the PDF only names (ArialMT, Times), after the
person added a font of their own. The box draws such a line in the font's twin, and letters the
twin has are not "missing" there, so the hint never names them. The save did not know about the
twin: it gave those letters to the font the person had added.

- **Twin first.** For a font the PDF only names, the twin stands at the head of the save's plan,
  before any picked font: every letter the twin has is saved in the twin, as the box draws it.
- **Later lines.** Once another font is registered with the engine, the twin is registered for
  the new letters of each edit of that font before the edit is tried, so the added font can't
  take a letter silently. Each letter is registered once.
- The notice names the twin too ("Using Tinos and Own Test Sans.").
