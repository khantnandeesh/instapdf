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
