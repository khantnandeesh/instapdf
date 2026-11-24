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

- AC-280 for added text placed on an existing line, AC-283 (twin table beyond the engine's own stand-in list), AC-285 (timing on a phone), AC-287 (x-height scaling), AC-288 (script-aware matching: the index holds Latin letters and digits only), AC-297 (keeping an uploaded font for later sessions).
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

### After the first evaluation (fourth PR)

The evaluation of 2026-11-24 (`docs/evals/f24-font-library.md`) failed on four P0 criteria, one critical accessibility issue and one output defect. What changed:

- **AC-305 (P0)** Typed text is never thrown away. When an edit can't be saved (no font has a character, the line would run past the page, the engine refuses it), the message says why and that the text is still in the box, and the box is open again with it and has the caret. Leaving the box with the same text neither tries again nor drops it; Enter tries again; changing the text, picking a font in the hint or adding your own font makes the next leave try again; Escape gives the line back as it was. While such a line is open, Download stops with a message instead of writing a file without it.
- **AC-306 (P0)** An edit that would push text past the rectangle the page clips its content to (every Chrome print has one) is refused like one that runs past the page edge, with "Replace with new text" on offer: the words are never written where no reader draws them. Only upright rectangular clips are followed; other clip shapes are not guessed at.
- **AC-307 (P0)** When no font here has a missing character, the hint says so and offers "Use your own font" in place, without ending the edit; a font added that way is offered at once.
- AC-300 now covers Hebrew, Arabic, Devanagari and Thai letters typed into a line that is drawn letter by letter: they are marked and named like any other missing character (the line keeps its own font).
- AC-298 now holds for embedded CFF programs whose subset keeps no advances of its own (`latex-type1c.pdf`) and for subsets with a wrong advance table (`reportlab-mono-subset.pdf`): the box sets every glyph by the width the PDF declares, as a PDF reader does. The same fix lets these fonts be matched to the library (they showed "No match yet").
- AC-286 on a phone: the notice names both fonts in full (two short lines at most); "Use your own font" stays inside "Change".
- The list of lines no longer points a screen reader at the line that is open in the box.
- Up to 100 fonts of a document are matched (was 24).
- **AC-308 (P0)** On a phone (the layout with the bottom tool dock) the hint does not float over the page: it is one slim row just above the dock, reading "Not in X" with at most two fonts, or "Use your own font" when no font here has the character. The missing character stays marked in the line. The page does not move. Tab from the box reaches the row's buttons and Tab from its last button comes back to the box.

Still open from that evaluation: AC-296 (looking the PDF's own font up on the device), a character the embedded program has under a code the PDF's own table does not list shows as present in the box and is saved in a stand-in font (the notice after saving says so), two font objects per stand-in (one per slice), `/fonts/editor/*.woff` caching, and focus after a mouse-opened edit.

Not in this PR: Hindi, Arabic and other joined scripts open in a stand-in font that can join their letters (the embedded program carries the glyphs but not the joining rules), with nothing marked as missing; lines turned on the page and right-to-left lines open in their own font but centred in the box, not on their baseline.
