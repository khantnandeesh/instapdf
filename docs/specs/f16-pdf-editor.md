# F16: PDF editor (beat the reference editor)

Status: steps 1 (Analyze) and 2 (Research) done; step 3 (Design) outline included, to be detailed by `ux-designer` before Build. **Scope approved by the owner on 2026-11-23:** F16 includes existing-text editing (phases E2/E3), and is the top-priority feature. **Revised 2026-11-23 after deeper research (§3):** the edit engine is a Rust core (WASM in the browser, same code native on the server as a consented fallback), not PDFium. Approved by the owner on 2026-11-23.

Reference observed: `pdf-editor` on the live reference site, 2026-11-23, with synthetic fixtures only (Playwright, network recorded). Two "Apply changes" tasks were run (within the 3/hour rule in CLAUDE.md).
Companion research (competitors, libraries, licences): `docs/specs/f16-pdf-editor-research.md`.
Internal evidence (reference only, never ship): `docs/specs/assets/f16-pdf-editor/`.

---

## 0. Answer: does the reference editor run on its server?

**Yes. Every edit is applied on the reference site's server.** Verified by recording network traffic (`assets/f16-pdf-editor/network/sejda-edit-session.json`):

| Step | What the browser does | Network |
|---|---|---|
| Pick a file | Uploads the **whole PDF immediately**, before any edit | `POST /api/files/upload-check`, then `POST /api/files/upload` (multipart, `Content-Length` 8,509 bytes for a 7,956-byte fixture). Returns a server file id. |
| View and edit | Renders pages locally with a pdf.js build; each edit is held in memory as an operation | none (fonts and pdf.js assets only) |
| Apply changes | Sends a JSON list of operations (26 operation arrays: `editTextOperations`, `appendTextOperations`, `imageOperations`, `shapeOperations`, `appendFormFieldOperations`, `highlightTextOperations`, `appendLinkOperations`, `insertPageOperations`, `rotatePageOperations`, …) plus the browser's user agent and console logs | `POST /api/tasks` → task id; poll `GET /api/tasks/{id}/change` until `Completed` |
| Download | Fetches the rewritten PDF from the server | `GET /api/tasks/{id}/download/{name}` |

Consequences we can exploit:
1. Files leave the device on pick, even if the user never saves. The reference's own answer for privacy is a separate paid desktop app.
2. Each Apply is a "task" on the free tier (3 per hour), so iterating on edits is rationed ("One more free save left for the next N minutes").
3. Edits are line-level operations computed client-side and replayed by a server engine. Output check: the edited line's `Tj` was removed from the original content stream and a new `Tj` appended in the same font resource, so it is a real edit, not a whiteout overlay. A longer replacement simply ran past the right margin; nothing reflowed (`assets/…/ref-01`, `ref-02`).

---

## 1. Purpose

Let anyone change a PDF the way they expect a document editor to work: click text and change it, add text, images, signatures, shapes, links, highlights and form fields, and download the result. **Everything runs in the browser and the file never leaves the device**, with no per-hour or per-save limits. We match every reference editor capability and beat it on four axes the reference cannot copy without rebuilding its architecture:

1. **Private by construction.** No upload, provable by CSP and a visible "0 bytes sent" indicator.
2. **Unlimited.** No task, page-per-hour or save limits; the device does the work.
3. **Real text editing.** Paragraph-level editing with reflow inside the paragraph's box, glyph-exact font reuse, and an honest notice when a substitute font is used.
4. **Feel.** Opens instantly, saves instantly, full undo/redo history, autosave and recovery, touch-first on phones, minimal UI and tasteful motion.

## 2. Reference teardown

### 2a. Feature inventory (observed + crawl)

A second-by-second inventory from the owner's screen recording (2026-11-24) is in `f16-reference-recording-inventory.md`. It added AC-53 to AC-73 below.

| Area | Reference behaviour | Our decision |
|---|---|---|
| Edit existing text | Text tool: click a line, it becomes a `contenteditable` box for **that line only**. Floating bar: bold, italic, size, font family, colour, link, move, duplicate, delete. Edit is replayed on the server. | Match, then exceed: paragraph mode (§5, phase E3). |
| Font list | ~45 bundled open fonts, each labelled with the proprietary font it stands in for (e.g. Carlito for Calibri). "More fonts" says local fonts need the desktop app. A second section lists the document's embedded fonts with a warning icon, with duplicates. | Match with our own self-hosted OFL set and copy. Local fonts via the Local Font Access API where the browser supports it (improvement). |
| Missing glyphs | "Font Replacement" dialog: original font lacks typed characters; choose a replacement; "Always use"; Keep original. Status "Original font replaced…" | Match, but automatic with a clear inline notice and a one-tap override. |
| Add text | Click empty page area; default Helvetica 10 pt black. | Match; default size follows nearby text. |
| Find & Replace | Dialog with match case, include links, Find, Replace, Replace all. | Match; replace preserves font when glyphs exist. |
| Links | Area select → URL, email, phone, internal page; edit and delete existing links. | Match. |
| Forms: fill | Click a field and type; light-blue shade on fields (not saved). | Match. |
| Forms: create | Text, multiline, dropdown, radio, checkbox, signature box; field name (duplicate warning), value, options, multiselect, comb ("divide into boxes"), max length, required, repeat on all pages; "Detect fields"; form edit mode; tab order (rows, columns, custom drag). | Match. |
| Publish to fill & sign | Saves to the user's Google Drive and shares a public link. | **Skip** (needs storage/accounts; privacy conflict). |
| Images | New image (move, resize, rotate), delete existing image, new stamp (subject, author, date styles, colour). | Match. |
| Sign | Type (≈13 handwriting styles, 7 colours), draw, upload image (original / two transparent variants), camera; saved signatures in browser storage. | Match; signatures stay in IndexedDB on device. |
| Whiteout | Area select draws a white rectangle whose border width, border colour and fill colour can be changed. Warning: hides but does not remove content; not for redaction. | Match, plus a **true Redact** tool (phase E4). |
| Annotate | Text strike-out, highlight, underline (colour swatches); freehand highlight and draw; show/hide annotations. | Match. |
| Shapes | Ellipse, rectangle, line, arrow; border and fill colour. | Match. |
| Page ops in editor | Per page: delete, zoom in/out, rotate left/right; "Insert page here"; thumbnails panel. | Match, plus duplicate and reorder by drag. |
| Attachments | Add, update, delete file attachments. | Match (P2). |
| Undo | Single Undo button; "Undo changes" list with "Revert selected". | Exceed: Ctrl/Cmd+Z / Shift+Z, unlimited history. |
| Recovery | "Recover unsaved changes" prompt for a previously edited file. | Match, local only. |
| Save | "Apply changes" → result page (download, cloud save, share, continue in other tool, back to editing, delete files). | Download directly from the editor, no round trip; keep editing after download. |

### 2a-bis. Micro details of existing-text editing (observed 2026-11-23, Chrome-exported fixture with subset Identity-H fonts)

- The Text tool is active by default for documents without forms; for documents with forms the Forms tool is active instead.
- **Edit unit = one style run within a line**, not a whole line. In a justified line with a bold word, clicking the start gives only "This  agreement  is  made  between  the " (it stops at the bold "Provider"). Justification gaps show up as double spaces in the edit box.
- A line whose first glyph comes from a different font (the ₹ sign, drawn by a Type 3 fallback font) splits into separate edit boxes at the font change.
- Editing the ₹ run silently switched the whole run to a different-looking sans font in the preview, so it no longer matched "Total amount due:" (`assets/f16-pdf-editor/ref-07-font-switch.png`).
- Typing past the original width overlaps the next run; nothing moves out of the way.
- Editing a justified run drops the justification: "the Provider" became "theProvider" in the preview, because the gap was spacing, not a space character.
- The preview draws edited text with a bundled web font (Caladea here), so what you see while typing is not necessarily the embedded subset.
- Picking a file uploads it immediately (about 0.5 s to first page for a 44 KB file). Apply → completed took 3.7 s, and pick → downloaded took 13.6 s for the same file.

### 2a-ter. Fidelity test on the reference (2026-11-24, one saved task, `assets/f16-pdf-editor/ref-08-fidelity-before-after.png`)

On `chrome-justified-mixed.pdf` we made three edits: the heading "Service Agreement" → "Supply Quote" (letters missing from the subset), "made" → "signed" inside a justified line that has a bold word, and "45,000" → "59,999 Ž" on the ₹ line.

| Check | Reference result |
|---|---|
| Missing glyphs in the heading | **Handled well.** It embedded a fresh subset of the same family (`Caladea-Bold`), so the heading looks right. Same-family re-subsetting is therefore **parity**, not an improvement for us. |
| Untouched content | Lines 2–4 and the table are pixel-identical. Only the edited runs changed. |
| Justified line | **Lost a space:** "the Provider" became "theProvider". Justification spacing is not preserved. |
| ₹ line | **Wrong font.** It attributed the whole run "₹ 45,000 — including…" to the ₹ glyph's fallback font (Inter), so the run switched from serif to sans and no longer matches "Total amount due:". |
| Speed | 0.67 s pick to first page; 3.7 s apply to file ready (server). |
| Size | 44 KB → 52 KB (three new font subsets added). |

Where we beat it: keep the justification gaps (re-insert spacing in the `TJ` array), and attribute a run's font from the majority of its glyphs, never from a fallback glyph (AC-11g).

### 2b. Limits and gates (reference)

Free tier: 3 tasks/hour (each Apply is a task, with a countdown), 50 MB per file, 5 MB per image, single file per task, a page cap (crawl shows 50 and 200-page messages in different places), "Too many attempts" throttle. Paid: up to 500 MB, longer processing.

### 2c. Failure cases and weak spots (reference's own UI messages, crawl + observed)

- Scanned pages: "Changing existing text inside scans not supported".
- Complex scripts: "Complex script alphabets are not supported (eg: Arabic, Devanagari)"; "Right to left scripts are not fully supported". Observed: its text layer extracted our Hindi line with the vowel sign out of order (`िहंदी` for `हिंदी`), so a line edit there would corrupt it.
- Embedded subset fonts: "Embedded font, characters might be missing"; "This font … does not support this style change".
- Rotated pages: no form fields and no annotations on rotated pages.
- XFA forms and "unsupported features" banners; read-only fields need a double click.
- Browser zoom ≠ 100% "breaks the editor"; "Cannot zoom on pages that have changes"; "Text is too small to edit. Please zoom in".
- Line-only editing; longer text overflows the margin (observed).
- Whiteout is not redaction (their own warning).
- Mobile: the desktop toolbar is squeezed and overflows off-screen on a phone (`ref-03`); no touch-specific UI.
- Slow saves at busy times: "Taking longer than usual … up to 2 minutes".
- Sends console logs and user agent with every task.

### 2d. Competitors (summary; measured details in `f16-competitor-micro.md`)

Measured 2026-11-23 in real browsers. Adobe blocked automation, so it is not measured.

- **iLovePDF, Smallpdf and Xodo all run the same commercial engine (Apryse WebViewer).** They are the only ones besides the reference that edit existing text. iLovePDF gives 1 free save, then shows a Premium wall. Smallpdf and Xodo let you edit, but block the download behind Pro.
- **Two of the three still upload the file anyway.** iLovePDF uploads it on pick to make page images. Smallpdf uploads it in the background 1–3 s after pick.
- **The Apryse editor:**
  - Each page is one text box, and a stray Backspace deletes every line on the page.
  - When a glyph is missing, it switches to Roboto and stays in Roboto for the rest of the typed text.
  - It changes the text colour (gray to CMYK black).
  - Reflowed text overlaps tables, and the on-screen wrap differs from the saved file.
  - Arabic comes out reversed, and Devanagari vowel signs end up detached.
  - It downloads about 8 MB, so it takes 3–9 s before you can edit.
- **PDF24 and PDFgear can't edit existing text.** PDF24 saves added text as an image (not searchable). PDFgear's added text is invisible in Chrome's and poppler's renderers, and its session-recording script sent the PDF's text to a third party.
- **Conclusion:** no product gives unlimited free saves of edited existing text, and none does it with the file staying on the device. That is the gap we fill.

## 3. Engine decision (revised 2026-11-23, supersedes the earlier "PDFium as edit engine" decision)

**Bar set by the owner:** the best result wins. Edit existing text in place, in the same font, without complaining, at least as well as the reference, and give its premium features away free. Server processing is allowed when it gives a better result.

### 3a. How the reference actually does it (evidence: `f16-engine-research.md`)

- The editor engine is **closed source**: a Scala jar on top of their open SAMBox (Apache-2.0, a PDFBox fork) and sejda-sdk (AGPL). Editing existing text was open from Sept 2016 to Feb 2017, so the method is readable in history. We describe it in our own words only and copy nothing.
- The technique is **"redact and re-append"**:
  1. The browser (pdf.js) finds the text run and its font object id.
  2. The server replays the page's content stream and drops only the show-text operators whose glyphs fall in the edited box. Inside a `TJ` array it swaps the removed part for an equal-width spacing number, so neighbours do not move.
  3. It appends a new `BT … ET` block at the original position, reusing the **same font object** when that font covers every glyph.
  4. Coverage is checked properly: encode, check each glyph outline is non-empty, CID→GID is not 0, and decode(encode(text)) equals the text.
  5. If glyphs are missing, it never extends the subset. It falls back per character, in order: the original full font, then a similar family, then a chain of metric-compatible open fonts (Liberation, Carlito, Caladea, Noto…). One line can mix the original subset and fallback runs.
- That is why it "rarely complains": the dialog appears only when the embedded subset lacks a typed glyph.

### 3b. What our own prototype showed (`assets/f16-pdf-editor/prototype/`)

We prototyped the edit with PDFium (via pypdfium2, the same C++ engine as the WASM build) on four test files:

| Case | Result |
|---|---|
| Standard-14 fonts (reportlab), word swap in a line | Correct |
| LibreOffice export (subset TrueType, WinAnsi), "Friday" → "Monday" | Correct, original subset font reused, +400 bytes |
| Same file, inserted "(₹ 5,000 fee)" (glyphs not in the subset) | **Wrong.** PDFium's glyph lookup reported the glyphs present, and the output shows empty boxes |
| Chrome export (per-glyph text objects, Identity-H subsets, mixed bold/italic), heading edit | Line grouping and style runs worked. Two problems: **tofu boxes** for glyphs missing from the subset, and **PDFium's full-page content regeneration dropped Type 3 text elsewhere on the page** (the ₹ sign vanished from an untouched line) |

Lessons:
1. Recognising lines and style runs is solvable; we did it in about 100 lines.
2. The hard, engine-independent part is **fonts**: a reliable coverage check against the embedded font program itself (parse the font; do not trust the engine's lookup), plus per-run fallback.
3. **Never regenerate a whole page.** Rewrite only the affected operators, like the reference does. PDFium's whole-page regeneration is lossy (Type 3), so it can't be our writer.

### 3c. Options compared

| Option | Runs in browser | Runs on server | Fidelity ceiling | Licence | Verdict |
|---|---|---|---|---|---|
| PDFium page-object API (WASM / native) | yes (4.6 MB) | yes | Limited by whole-page regeneration (loses Type 3) and an unreliable subset check | BSD/Apache | **Not the writer.** Keep it as a test oracle and a possible renderer |
| PDFBox / SAMBox (Java) | no | yes (JVM cold starts on scale-to-zero) | High (it is what the reference uses) | Apache-2.0 | Viable server engine, but no browser and slow cold starts |
| TypeScript: pdf.js + pdf-lib + fontkit + our own content-stream rewriter | yes | yes (Node) | High | Apache/MIT | Viable, but slower on big files, and hand-written stream parsing in JS is fragile |
| **Rust core compiled to WASM and native** (lopdf for objects and content streams, ttf-parser/skrifa for coverage, harfrust for shaping, subsetter for fallback subsets, pdf-writer for new streams) | **yes** | **yes, same code** | **Highest**: exact control of every operator and font | MIT / Apache-2.0 (checked on crates.io today) | **Recommended** |
| MuPDF / PyMuPDF, iText, sejda-sdk | – | – | – | AGPL | Forbidden (CLAUDE.md rule 3) |

### 3d. Recommendation: "Berry engine", one Rust core, browser first with a server fallback

- **One codebase, two targets.** A Rust crate `berry-engine` compiled to WASM runs in a Web Worker (default, private, free to run) and natively in the worker service on Cloud Run (fallback). Both produce byte-identical results because they are the same code.
- **When the server is used:** only if the browser can't (out of memory on a phone, a file over about 150 MB, or the user explicitly asks), always with consent ("Process on our server? Deleted within 2 hours"). It uses the free, capped, queued worker pool from `docs/process/mission.md` (live queue position, no paywall), and its privacy copy says plainly that the file is uploaded and deleted. The default stays 100% on device, and that is our headline.
- **Pipeline per edit:**
  1. **Recognise:** parse the content stream with a text-state interpreter, giving glyphs with position, font, size, colour and render mode. Group them into runs, lines and paragraphs. pdf.js stays the on-screen renderer for instant first paint; the engine's own parse is the truth for edits, so display and output never disagree.
  2. **Coverage:** parse the embedded font program (ttf-parser / CFF), map Unicode to the glyph through ToUnicode or the encoding plus cmap, and check the outline is non-empty.
  3. **Font choice per run:** original subset if covered. Else, *better than the reference*: if the original font is an open family we ship (Carlito, Caladea, Liberation, Noto…) or one the user has locally, embed a fresh subset of the **same family**, so it is visually identical. Else use a metric-compatible substitute, and width-fit with `Tz` so the line keeps its length.
  4. **Rewrite surgically:** drop only the affected show-text operators (split `TJ` arrays with equal-width spacing), copy a shared Form XObject before editing it, and append the new text block in a separate content stream. Never re-serialise the whole page.
  5. **Shape:** HarfRust for Devanagari and Arabic, with ToUnicode so copy and search still work.
  6. **Verify every save:** run a render diff of untouched regions (they must be pixel-identical) and confirm the extracted text equals the expected text. If a check fails, roll back that edit and tell the user. That is our "never silently corrupt" guarantee.
- **Effort:** about 3–5 agent-weeks to reach reference parity on existing-text editing, and 4–6 more to beat it (paragraph reflow, same-family re-subsetting, shaping). The JS-only tools (add text, sign, annotate…) are not blocked by the engine.
- **What changes from the earlier decision:** PDFium is **no longer the edit engine**. It becomes a CI oracle (render diff, text extraction) and an optional renderer. The owner approved this revision on 2026-11-23, replacing the earlier PDFium approval.

Other layers are unchanged: a DOM/SVG overlay, an operation log in IndexedDB (undo/redo, recovery), `@cantoo/pdf-lib` for forms, links, attachments and page operations until the engine covers them, a qpdf-WASM final pass, tesseract.js for small OCR jobs, and self-hosted OFL fonts. CSP stays `connect-src 'self'`; the server fallback is a separate, consented flow on a separate route.

## 4. Inputs

| Aspect | Decision |
|---|---|
| Open | One PDF via picker or drop (shared F1 flow). Also "Start blank" (A4/Letter). |
| Size / pages | Up to 200 MB and 2,000 pages, limited only by device memory; warn above 500 pages on phones. No hourly limit. |
| Encrypted | F1 password modal; owner-restricted files use the F1 owner-password banner because the editor requires the modify permission. |
| Images to insert | PNG, JPEG, WebP, GIF (first frame), SVG; up to 25 MB each. |

## 5. Tools and options

Toolbar groups, in order (icons with short labels; labels hide on phones): **Select · Text · Sign · Draw · Shapes · Image · More (Link, Form field, Whiteout, Redact, Stamp, Attachment, Find & replace)**. Undo / Redo and Download live at the end. Page actions appear on the page in focus: rotate, delete, duplicate, insert blank, move.

Text properties (floating bar on selection): font family (with stand-in labels), size, bold, italic, underline, colour, alignment (paragraph mode), line spacing (paragraph mode), link, delete.

Edit modes for existing text:
- **Line** (default in E2): edits one text run/line in place.
- **Paragraph** (E3): click selects the detected paragraph; typing reflows within the paragraph width; the box may grow downward; an outline shows the paragraph bounds.

## 6. States

| State | What the user sees |
|---|---|
| Empty | Drop zone, one line of copy, "files stay on this device". |
| Loading | First page renders from pdf.js within 1 s for a 1 MB file; the edit engine loads in the background with a subtle progress ring on the Text tool. |
| Editing | Pages in a scrolling column (desktop) or one page at a time with swipe (phone). |
| Unsupported area | Hover/tap on scan or Type3 text shows an inline hint and offers "Make editable (OCR)" (E4) or whiteout-and-retype. |
| Saving | Instant for typical files; progress bar if > 1 s. Editing stays possible after download. |
| Recovered | On reopening the same file (hash match), offer to restore the last session from this device. |

## 7. Errors and limits

- Not a PDF / corrupt / empty: F1 errors.
- XFA-only form: banner, view and fill only where possible.
- Out of memory: message with a suggestion to close other tabs; autosave guarantees no loss.
- Substituted font: inline notice on the edited text, never a blocking dialog.

## 8. Output

A PDF with: edited text in content streams (not overlays) where the engine allows; new text as real text (selectable, searchable); annotations as standard annotation objects; form fields as AcroForm fields; full rewrite (no incremental save) after redaction; metadata `Producer` set to BerryPDF; file name `<original>.pdf` (option for `-edited` suffix).

## 9. Acceptance criteria

Fixtures (to add under `tests/fixtures/editor/`): `para-times.pdf` (standard 14 fonts, 3-line paragraph), `subset-carlito.pdf` (subset-embedded TrueType, Identity-H), `scripts-hi-ar.pdf` (Devanagari + Arabic, shaped, subset), `form-basic.pdf` (text + checkbox), `links.pdf`, `scan.pdf` (image only), `rotated-90.pdf`, `xfa-only.pdf`, `big-300p.pdf`, `type3.pdf`.

Priority: P0 = parity must-have; P1 = parity nice-to-have or key differentiator; P2 = later. `(improvement)` = beyond the reference (the evaluator does not hold the reference to these, but they must work).

### Privacy and limits
- **AC-1 (P0)** From opening a file to downloading the edited result, no request body larger than 10 KB is sent to any origin and nothing is sent to an upload endpoint (network log).
- **AC-2 (P0)** The editor page's CSP has `connect-src 'self'`; a test that tries `fetch` to another origin from the page is blocked.
- **AC-3 (P1)** (improvement) A visible indicator shows "0 bytes uploaded" (our wording) and links to how to verify it.
- **AC-4 (P0)** Downloading 5 times in a row within 10 minutes never shows a limit, countdown or upgrade message.
- **AC-1b (P0)** If the server fallback is used, it starts only after an explicit consent step that says what is uploaded and when it is deleted (≤ 2 h). Without consent, nothing leaves the device.
- **AC-5 (P1)** `big-300p.pdf` (300 pages) opens and can be edited and downloaded without a page-limit message.

### Open and view
- **AC-6 (P0)** Opening `para-times.pdf` shows page 1 rendered within 1.5 s on the CI desktop profile (Lighthouse-style throttling off).
- **AC-7 (P1)** Zoom in/out (buttons, Ctrl+wheel, pinch) works and edits stay aligned to the page at 50%, 100%, 200% and with browser zoom at 125% (the reference breaks at browser zoom ≠ 100%).
- **AC-8 (P1)** Thumbnail panel shows every page and clicking one scrolls to it.

### Existing text (phase E2, E3)
- **AC-9 (P0)** In `para-times.pdf`, clicking line 2 with the Text tool makes it editable; changing "page" to "sheet" and downloading gives a PDF whose extracted text contains "sheet" and not the old line's "page", and the old line's glyphs are not drawn (render diff of that line area vs expected).
- **AC-10 (P0)** The edited text keeps font family, size and colour when the embedded font covers all glyphs (`subset-carlito.pdf`: change "thirty" to "tithe" → output font for that run is the original embedded font object).
- **AC-11 (P0)** Typing a character missing from a subset font (e.g. "Q" when absent) switches the run to the matched open font (Carlito for Calibri/Carlito) and shows an inline notice naming both fonts; the output renders the character.
- **AC-11b (P0)** Fidelity guard: after any existing-text edit, every page region outside the edited runs renders pixel-identical to the input (PDFium and pdf.js render diff at 2×), including Type 3 text, images and vector art.
- **AC-11c (P0)** Neighbours stay put: editing one word inside a `TJ` array does not move any other glyph on the line by more than 0.1 pt, unless reflow is on.
- **AC-11d (P0)** Same-family re-subset (parity, the reference does this): when a subset lacks a glyph and the family is one we ship (Carlito, Caladea, Liberation, Noto) or a local font, the new text uses a fresh subset of that same family, and the run is visually indistinguishable from the original (glyph-shape diff below threshold).
- **AC-11e (P1)** (improvement) Substitute fonts are width-fitted (`Tz` within 90–110%) so the edited run keeps its original width when the text length is unchanged.
- **AC-11f (P0)** On the micro-benchmark corpus (`docs/process/editor-micro-checks.md`, the editor annex to the M1–M11 checks in `docs/process/mission.md`), our existing-text edit fidelity score is at least the reference's on every file, and higher in total.
- **AC-11g (P0)** (improvement) On `chrome-justified-mixed.pdf`, after "made" → "signed": the line keeps a visible gap before "Provider" (inter-word gap ≥ 50% of the original), and the "₹ … GST" run keeps Liberation Serif for every glyph except ₹ itself.
- **AC-12 (P1)** Bold, italic, size, family and colour changes on an existing line are reflected in the output.
- **AC-13 (P1)** Existing text can be moved by drag and deleted.
- **AC-14 (P1)** (improvement) Paragraph mode: in `para-times.pdf`, inserting 12 words into line 1 reflows the paragraph inside its original left/right bounds; no line exceeds the right bound (text positions in output); the box grows downward and the line count increases.
- **AC-15 (P1)** (improvement) Paragraph mode keeps alignment (left/justified/centred detected from the source) and leading within ±5%.
- **AC-16 (P2)** (improvement) Reflow toggle: the user can switch a paragraph edit back to line mode.
- **AC-17 (P1)** Find & replace: "invoice" → "bill" with Replace all changes every occurrence on all pages (count shown) and preserves font where glyphs exist; match case and include-links options work.
- **AC-18 (P1)** Clicking text on `scan.pdf` shows a hint that the text is an image and offers whiteout-and-retype (E2) or OCR (E4); nothing breaks.
- **AC-19 (P2)** `type3.pdf` text is shown as not editable with the same fallback.

### Complex scripts (phase E4)
- **AC-20 (P1)** (improvement) Adding new Hindi text "नमस्ते दुनिया" renders correctly shaped (render diff vs a HarfBuzz reference) and copy-paste from the output returns the same string.
- **AC-21 (P1)** (improvement) Adding new Arabic text renders right-to-left with joined letters; extraction returns the logical string.
- **AC-22 (P2)** (improvement) Replacing an existing Devanagari line in `scripts-hi-ar.pdf` replaces the whole run with correctly shaped text.

### Add content
- **AC-23 (P0)** Clicking empty page space with the Text tool adds a text box; typed text appears in the output at that position (±2 pt) as real, extractable text.
- **AC-24 (P0)** Image: inserting a PNG places it; move, resize (corner, aspect locked by default) and rotate are reflected in the output.
- **AC-25 (P0)** Whiteout: dragging an area draws a white rectangle in the output; a warning says it hides but does not remove content. Fill colour, border colour and border width can be changed.
- **AC-26 (P0)** Shapes: rectangle, ellipse, line, arrow with stroke and fill colour appear in the output.
- **AC-27 (P0)** Annotate: highlight, underline and strike-out of selected text create standard markup annotations of the chosen colour over the right words; freehand draw and freehand highlight create ink annotations.
- **AC-28 (P1)** Links: area select → URL, email (`mailto:`), phone (`tel:`) and internal page; output has Link annotations with the right actions; existing links in `links.pdf` can be edited and deleted.
- **AC-29 (P1)** Stamp: create a stamp with subject, optional author and date format, and colour; place it; it appears in the output.
- **AC-30 (P2)** Attachments: add, replace and delete a file attachment.

### Sign
- **AC-31 (P0)** Create a signature by typing (at least 8 handwriting-style OFL fonts, at least 5 colours), drawing (mouse, pen or finger), or uploading an image (with a transparent-background option); place and resize it; it appears in the output.
- **AC-32 (P1)** Saved signatures persist on this device only (IndexedDB) and can be deleted.
- **AC-33 (P2)** Camera capture of a paper signature with background removal.

### Forms
- **AC-34 (P0)** Filling `form-basic.pdf`'s text field and checkbox gives an output whose AcroForm values are set and visible in another viewer (appearance streams generated).
- **AC-35 (P1)** Creating text, multiline text, dropdown (options one per line, multiselect), radio group, checkbox and signature fields produces AcroForm fields with the given names, defaults, required flag, max length and comb setting.
- **AC-36 (P1)** A duplicate field name shows a warning; "repeat on all pages" creates one field with one widget per page.
- **AC-37 (P1)** Tab order can be set by rows, columns or custom drag, and the output's widget order follows it.
- **AC-38 (P2)** (improvement) "Detect fields" proposes fields on underscore lines and boxes on **all pages**; on a page that already has fields it proposes only the new ones (no duplicates, no error); the user accepts or rejects each.
- **AC-39 (P1)** Form fields and annotations can be added on `rotated-90.pdf` (the reference refuses).
- **AC-40 (P2)** `xfa-only.pdf` shows a banner explaining limited support and does not crash.

### Pages
- **AC-41 (P1)** Per page: rotate left/right, delete, duplicate, insert blank page after; output page count and `/Rotate` match.
- **AC-42 (P2)** (improvement) Drag a thumbnail to reorder pages.

### History, save, recovery
- **AC-43 (P0)** Undo (button and Ctrl/Cmd+Z) reverts the last edit; Redo (Ctrl/Cmd+Shift+Z) re-applies it; at least 100 steps.
- **AC-44 (P0)** Download produces the edited PDF in under 3 s for `para-times.pdf` with 10 edits, without leaving the editor; further edits and a second download work.
- **AC-45 (P1)** Closing the tab with unsaved edits and reopening the same file on the same device offers to restore them; accepting restores every edit.
- **AC-46 (P1)** Output passes `qpdf --check` and renders without errors in pdf.js and PDFium for every fixture.

### Reference recording details (2026-11-24, `f16-reference-recording-inventory.md`)
- **AC-53 (P2)** (improvement) A "Recent" list on the empty state shows files edited on this device (name, page count, time), from local storage only, with a one-tap "Clear". Nothing is listed from any server.
- **AC-54 (P0)** The editor toolbar stays visible (sticky) while pages scroll, on desktop and phone.
- **AC-55 (P1)** The page in focus shows its page number and page actions (rotate, delete, duplicate, insert page after); thumbnails open from a side rail.
- **AC-56 (P1)** Every tool has a short tooltip (desktop) or first-use hint (touch) that says how to use it in one line, with its keyboard shortcut.
- **AC-57 (P0)** A new text box opens with its placeholder selected, so the first keystroke replaces it; an empty box is removed when it loses focus; placeholder text is never written to the output.
- **AC-58 (P1)** Text, image, shape and field objects have Duplicate: the copy appears offset by one line below the original (or at the same spot on the next page with Alt) and is selected. The size control takes a typed value and offers presets from 8 to 72.
- **AC-59 (P1)** (improvement) The font menu has an "In this document" section with each embedded font listed once (by family and style). Each font shows whether it covers the characters in the selected box; if it does not, choosing it uses the same-family re-subset (AC-11d) or tells the user which characters will fall back.
- **AC-60 (P1)** The colour picker has a palette, a hex field, "no colour" (for fills) and recent colours; an eyedropper is offered where the browser supports the EyeDropper API.
- **AC-61 (P1)** (improvement) Link fields are checked: a URL without a scheme gets `https://`, email and phone are checked for format, the internal page must exist; invalid input shows an inline error and is not saved. Hovering a link shows its destination.
- **AC-62 (P1)** Quick symbols ✓ ✗ ● (and text) can be placed with one click for filling flat, non-fillable forms; their size follows the nearby text.
- **AC-63 (P1)** (improvement) A signature field gets a visible appearance in the output (border and "Sign here" label), so it shows in Chrome, Edge and Firefox viewers without any warning dialog.
- **AC-64 (P1)** While an object or field is moved or resized, it snaps to the edges and centres of other objects and the page, with guides shown; Alt (or a second finger) turns snapping off.
- **AC-65 (P1)** (improvement) Information about the editor (field shading not saved, whiteout not removing content, font fallback) is shown inline or as a toast; no information-only modal blocks the page.
- **AC-66 (P2)** The Image and Sign menus show the last 5 images and signatures used on this device for one-click reuse; each can be removed.
- **AC-67 (P1)** After choosing an image, stamp, signature or symbol, a semi-transparent preview follows the pointer until a click or tap places it; Esc cancels.
- **AC-68 (P0)** Esc cancels any draw, area-select or placement mode and returns to Select; the mode shows a short hint that says so.
- **AC-69 (P1)** (improvement) Objects have Bring forward / Send backward (menu and Ctrl/Cmd+] / [), and the output's drawing order follows it.
- **AC-70 (P1)** Annotate has a Show/Hide annotations toggle (view only, not saved). Highlight, underline and strike-out each offer at least 5 colours, plus recent colours.
- **AC-71 (P0)** (improvement) Text highlight, underline and strike-out work on every corpus file that has a text layer (including Devanagari lines), with the markup covering the selected glyphs (±1 pt). No "use freehand instead" fallback is needed.
- **AC-72 (P1)** Shapes: a single click places a default-size shape; a drag sets the size; Shift keeps the aspect ratio (or 45° for lines and arrows). Border width, border colour and fill colour can be set.
- **AC-73 (P1)** The history panel lists each change with its type, page and time; any set of changes can be reverted at once, and the revert itself can be undone.

### Live checks on the reference (2026-11-24, `f16-reference-live-checks.md`)
- **AC-74 (P0)** (improvement) Clicking an existing Devanagari line never changes how it looks. The edit box shows the logical string (राशि, not रािश), rendered with the document's font where it covers the text and a shaped OFL Devanagari font where it does not. Until E4 ships, a Devanagari line opens read-only with a one-line hint, and the output never has detached vowel signs or lost word spaces (render diff vs a HarfBuzz reference on `report-form-3p.pdf` page 1).
- **AC-75 (P0)** (improvement) When the original font can't draw a typed character (₹, or a capital missing from a subset), we never switch fonts silently. Replacement fonts are ranked by script coverage, class (serif, sans, mono, script) and width metrics, and the best match is preselected. For `font-coverage-1p.pdf`, typing "QZ" proposes a monospaced font first. Only the missing characters switch (AC-11g), an inline notice names both fonts, and "Keep original" is never offered when it would leave the line in a browser fallback font.
- **AC-76 (P1)** (improvement) Find highlights the matched words, not whole lines. It shows "n of N" across all pages with next and previous. Replace all reports the total it replaced, can be undone in one step, and leaves no marks under edited lines.
- **AC-77 (P1)** (improvement) Detect fields runs in the browser (no upload). On `report-form-3p.pdf` page 2 it finds the 4 blanks, the 2 boxes and the signature line, and makes the last one a **signature** field. Field names are readable and have no random suffix (`full_name`, then `full_name_2` if taken).
- **AC-78 (P1)** (improvement) Text markup (highlight, underline, strike-out) works on lines that were edited, and a drag with a markup tool never moves an edited line.
- **AC-79 (P1)** (improvement) Pages with edits can be rotated, zoomed and reordered, and every overlay keeps its place on the page.
- **AC-80 (P2)** The thumbnails panel stays open while used (it is pinnable), its page counter follows scrolling, and thumbnails can be dragged to reorder (AC-42).
- **AC-81 (P1)** (improvement) Recovery autosaves to this device (IndexedDB) within 2 s of each edit. Reopening the same file after a reload, crash or closed tab offers "Restore n edits" (AC-45). Nothing is ever sent to a server.
- **AC-82 (P0)** Keyboard on a selected object: Delete and Backspace remove it; arrows nudge it 1 pt (10 pt with Shift); Ctrl/Cmd+C, V and D copy, paste and duplicate it; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. Undo covers every change, moved text lines included (AC-43).
- **AC-83 (P0)** (improvement) Phone layout at 390×844: no sideways page scroll, a bottom tool bar with an overflow menu, the page fitted to the width, and pinch zoom left on (no `user-scalable=0` and no `maximum-scale=1`).
- **AC-84 (P1)** (improvement) Limits: there is no task limit per hour. Browser editing is limited only by the device: a 500-page or 200 MB file opens and edits, with a progress note if it is slow. There is no expiry, because nothing is stored on a server.

### Redaction (phase E4)
- **AC-47 (P1)** (improvement) Redact: marking "ZEBRA-7731" and applying removes it from extracted text and from decompressed content streams; images under the area are cut; output is a full rewrite with no earlier revision.

### Mobile and accessibility
- **AC-48 (P0)** At 390×844 the toolbar fits without horizontal scroll (icons, overflow menu) and every tool works by touch (tap to place, drag handles ≥ 44 px).
- **AC-49 (P1)** All tools reachable by keyboard; overlay objects have accessible names; axe reports no critical violations.
- **AC-50 (P1)** Motion respects `prefers-reduced-motion`.

### Performance
- **AC-51 (P1)** The editor engine (WASM) is not downloaded until the editor opens a file; editor route JS (excluding WASM) ≤ 250 KB gzip.
- **AC-52 (P1)** Lighthouse mobile performance ≥ 90 on the editor's empty state.

## 10. Improvements (research step)

| Idea | Seen at | User benefit | Cost | Decision |
|---|---|---|---|---|
| Browser-only editing, provable by CSP | Xodo (browser-only tools), our Q1 CSP | Privacy; no upload wait | L | **adopt** (core) |
| Paragraph reflow within the box | Apryse WebViewer (commercial) | Real document-style editing | L | **adopt** (E3) |
| Reflow on/off toggle | Apryse | Safe fallback to line mode | S | adopt (AC-16) |
| Visible font-substitution notice | none (reference uses a dialog) | Honest, non-blocking | S | adopt (AC-11) |
| Devanagari/Arabic shaping | none free | India-first audience | M | adopt (E4) |
| True redaction | Adobe Pro, Stirling | Safe for sensitive data | M | adopt (E4) |
| Unlimited undo/redo + autosave recovery | Stirling 2 (version history) | No lost work | M | adopt |
| Page reorder inside editor | PDFgear | One tool for small fixes | S | adopt (P2) |
| Local fonts via Local Font Access API | – | Exact fonts on Chrome/Edge | S | adopt (P2), feature-detected |
| "Clear from this device" button | iLovePDF "delete now" | Control over local storage | S | adopt |
| Publish for others to fill & sign | reference | Collect signatures | L | skip (needs storage, conflicts with privacy) |
| Share for comments, @-mentions | Adobe | Collaboration | L | skip (server + accounts) |
| Native mobile apps | iLovePDF, Smallpdf | – | L | skip (responsive touch editor instead) |

## 11. UI outline (for `ux-designer` to detail at step 3)

Follow the latest BerryPDF Design System: minimal, little text, tasteful motion.
- One compact floating toolbar (icons, tooltips on desktop, labels hidden on phones; overflow "More"). Contextual property bar appears next to the selection and nothing else.
- Page canvas centred; thumbnails in a collapsible side rail (desktop) or bottom sheet (phone).
- Motion: tool switch slide, selection outline fade, reflow animated line by line (150–200 ms), page insert/delete collapse; all disabled under reduced motion.
- Status chip bottom-left: "On this device · 0 bytes uploaded". Download button top-right, always enabled.
- Phone: one page at a time, pinch zoom, long-press to select text, bottom tool dock.

## 12. Phased plan

Each phase is a separate backlog item that passes the full pipeline and evaluator gate before the next starts.

| Phase | Scope | ACs | Key risk | Rough size |
|---|---|---|---|---|
| **E0 Engine spike** | `berry-engine` Rust crate: content-stream interpreter (glyph positions), run/line grouping, embedded-font coverage check, surgical show-text removal with `TJ` splitting, append block, same-family re-subset, WASM + native builds, fidelity guard. Run on the Parity Lab corpus against the reference | 11b, 11c, 11f (engine level) | Font edge cases (Type 3, no ToUnicode, CFF, vertical) | M (1–2 weeks) |
| **E1 Editor core** | Editor shell, pdf.js render worker + lazy engine load, overlay model, op log, undo/redo, autosave/recovery, add text, image, whiteout, shapes, annotate, sign (type/draw/upload), page ops, download, mobile toolbar, snapping, placement preview, z-order | 1–8, 23–27, 31–32, 41, 43–46, 48–52, 54–58, 60, 64–73, 78–84 | WASM size and two-engine alignment | L |
| **E2 Edit existing text (line)** | Line edit via `berry-engine` text runs, font reuse + coverage check, OFL substitution + notice, document fonts menu, style changes, move/delete, find & replace, scan/Type3 fallbacks | 9–13, 17–19, 59, 74–76 | Subset fonts, odd encodings | L |
| **E3 Paragraphs, links, forms** | Paragraph detection + reflow inside box, toggle; links; form fill + create, tab order, repeat on pages, rotated pages, XFA banner, detect fields, stamps, attachments | 14–16, 28–30, 34–40, 42, 53, 61–63, 77 | Paragraph detection quality across real files | L |
| **E4 Beyond parity** | True redaction, Devanagari/Arabic shaping (new + replace run), OCR scan-to-editable (tesseract.js, small docs), camera signature, local fonts | 20–22, 33, 47 | Shaping correctness, redaction completeness | M–L |

E0 and E1 can run in parallel (E1 needs no engine). Parity with the reference is reached at the end of E3; E1 alone already beats it on privacy, limits, speed and mobile for the most common jobs (fill, sign, add text, whiteout, annotate).

Prerequisites: Q2 real-world corpus should include the editor fixtures above plus a sample of real PDFs (Word, Google Docs, LaTeX, InDesign, scanned) for the "zero crashes" gate.

## 13. Owner decisions (2026-11-23)

1. **Approved:** existing-text editing is in F16 (E2/E3).
2. **Approved (revised, owner OK 2026-11-23):** the edit engine is a Rust core (`berry-engine`) that runs as WASM in the browser and natively on the server as a consented fallback. PDFium is no longer the engine; it becomes a test oracle. Reason: our prototype showed PDFium's whole-page regeneration drops Type 3 text and its glyph check is unreliable for subset fonts (§3b).
3. **Approved:** the editor is top priority. E0 (engine spike) and E1 (editor core) start first, in parallel.
4. **Approved direction:** every premium editor feature of the reference is free here, and server processing is allowed when it gives a better result, always with consent.
