# F16: PDF editor (beat the reference editor)

Status: steps 1 (Analyze) and 2 (Research) done; step 3 (Design) done for phase E1 (see [UI (phase E1)](#ui-phase-e1), 2026-11-24). **Scope approved by the owner on 2026-11-23:** F16 includes existing-text editing (phases E2/E3), and is the top-priority feature. **Revised 2026-11-23 after deeper research (§3):** the edit engine is a Rust core (WASM in the browser, same code native on the server as a consented fallback), not PDFium. Approved by the owner on 2026-11-23.

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

#### Forms detail (E3 forms slice, 2026-11-24). Each refines the AC in brackets
Reference behaviour these beat (`f16-reference-live-checks.md` §4, recording 1:50–2:24): detection uploads the file and runs on the page in view only, refuses pages that already have fields, turns a signature line into a plain text field and names fields with a random suffix; the signature box comes with a blocking warning; fields cannot go on rotated pages.

Second live run (2026-11-24, one task, our `apps/web/tests/fixtures/forms/detect-mix.pdf`; screenshots in project files `designs/editor-forms/sejda-detect/`): detection took about 17 s behind a server "Analyzing your document" overlay and reported "Detected 13 form fields on page 1"; pages 2 and 3 were never looked at. The 13 kinds were right (4 text, a box row, a multi-line box, a 3-button radio group named from its question, 2 checkboxes, 2 lines), but the placement and settings were not:
- Text fields for drawn lines, underscores and dotted leaders were thin slivers about 6 pt tall **below** the line, not on it.
- The signature and date fields under their lines **covered the labels** "Signature" and "Date", and the signature line became a plain text field again.
- The row of 6 PIN boxes became an ordinary text field: "divide into boxes" was off and still showed the default 8, with max length 20.
- No field got a tooltip, and every name had a random suffix (`full_name_2u3c`, `member_type_1c8p`).

Fill
- **AC-230 (P0)** [AC-34] Every field type in an existing AcroForm is read with its full name, kind, value, default, options, flags and each widget's page and box: text (single line, multiline, comb, max length), dropdown (editable or not), list (single or multi-select), radio group (export value per button), checkbox, signature and push button (shown, not editable). Fields from inherited parents (`Parent`/`Kids`) are read as one field.
- **AC-231 (P0)** [AC-34] Filled values are written as `V` with a fresh appearance stream for each changed field, so pdf.js and PDFium show them without relying on `NeedAppearances`. Fields the user did not touch keep their original appearance byte for byte.
- **AC-232 (P1)** [AC-34] (improvement) Values outside WinAnsi (for example "Zoë Šťastná", "Ирина", "₹ 5,000") show correctly in the output appearance: the field's font is an embedded open font that covers them, never "?" or a blank box.
- **AC-233 (P1)** [AC-34] Read-only fields cannot be changed. Max length is enforced while typing. A required field left empty is flagged inline before download, without blocking it.

Create and edit
- **AC-234 (P1)** [AC-35] Each new field kind gives the right AcroForm structure: text `Tx` (multiline, comb with N boxes, max length), dropdown `Ch` combo, list `Ch` (multi-select), radio `Btn` group with one widget per option and its own export value, checkbox `Btn` with export value `Yes`, signature `Sig`. Properties: name, tooltip (`TU`), default value, required, read-only, font size (auto or fixed), alignment, text colour, border colour and width, background colour.
- **AC-235 (P1)** [AC-36] (improvement) Field names are checked as they are typed: an inline note flags a duplicate or a name with a dot, and suggests the next free name (`full_name_2`). "Repeat on all pages" makes one field with one widget per page, so a value typed once shows on every page.
- **AC-236 (P1)** [AC-35] Editing an existing field (rename, move, resize, new options) keeps its value and its other widgets. Deleting a field removes it from the AcroForm and every widget from its page.
- **AC-237 (P1)** [AC-63] (improvement) A new signature field has its own appearance (a dashed border and a "Sign here" label in the field), which pdf.js and PDFium both draw. No warning dialog is shown.
- **AC-238 (P1)** [AC-39] (improvement) Fields can be added on pages turned 90°, 180° and 270° and on pages whose crop box does not start at 0,0. Each lands where it was drawn and its text reads upright for the reader (`MK /R` matches the page turn).
- **AC-239 (P1)** [AC-37] Tab order offers sort by rows, sort by columns, restore original and custom order. The output's `/Annots` order on each page follows it, `/Tabs` is `/R` or `/C` for the two sorts, and the AcroForm `/Fields` list follows the same order.

Detect fields
- **AC-240 (P1)** [AC-38, AC-77] Detect fields runs on **every page** in the browser: no network request is made, the code loads only when Detect is used (its own worker chunk, so the editor's first load does not grow), progress shows page n of N, and it can be cancelled. On a desktop it takes under 0.5 s per page.
- **AC-241 (P1)** [AC-77] On `report-form-3p.pdf` it proposes exactly 7 fields, all on page 2: text fields `full_name`, `email_address`, `phone`, `date_of_birth` sitting on their lines, checkboxes `i_agree_to_the_terms` and `send_me_updates` over their boxes (overlap ≥ 80%), and a **signature** field `signature`. Each field's tooltip is its label. Pages 1 and 3 get none.
- **AC-242 (P1)** [AC-38] (improvement) It finds, on `detect-mix.pdf`: drawn lines, underscore runs (`_____`), dotted leaders (`.......`), empty boxes (multi-line when tall), a row of equal boxes as one **comb** field with max length equal to the number of boxes, check squares and `☐`, and circles as one **radio group** named from its question. A date label gives a tooltip with the date format.
- **AC-243 (P1)** [AC-38] (improvement) No proposals on separators that span the text column, underlined words, table cells that hold text, or page borders (`detect-mix.pdf` page 2 has all four).
- **AC-244 (P1)** [AC-38] (improvement) On a page that already has fields it proposes only new ones: a proposal overlapping an existing widget is dropped, and nothing blocks. The result line says how many fields were found on how many pages.
- **AC-245 (P2)** [AC-38] (improvement) Scanned pages with no text layer still get lines and boxes, named by kind (`text_1`, `checkbox_1`).
- **AC-246 (P1)** [AC-38] Proposals show as outlines the user accepts or rejects one by one or all at once. Accepting is one undo step and makes normal fields.

Output
- **AC-247 (P0)** [AC-46] Every output from fill, create and detect passes qpdf's check (via pikepdf) and draws its fields in pdf.js with appearance streams.

Build note: the field model, reader, writer, tab order and detection live in `apps/web/src/lib/forms/` and depend only on pdf-lib and pdfjs-dist. Field boxes use the editor's page frame (points, origin at the top-left of the unrotated visible page box, y down, keyed by page id), and `applyForms` is the one call the editor's download build makes after drawing objects.
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

Detailed for E1 in [UI (phase E1)](#ui-phase-e1) below; that section wins where they differ.

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
| **E1 Editor core** | Editor shell, pdf.js render worker + lazy engine load, overlay model, op log, undo/redo, autosave/recovery, add text, image, whiteout, shapes, annotate, sign (type/draw/upload), page ops, download, mobile toolbar, snapping, placement preview, z-order | 1–8, 23–27, 31–32, 41, 43–46, 48–52, 54–58, 60, 64–73, 78–98 | WASM size and two-engine alignment | L |
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

---

## UI (phase E1)

Designed 2026-11-24 by ux-designer. This is the build contract for **E1, the editor core**: add text, images, signatures and initials, markup and freehand annotations, whiteout, shapes, page navigation and page actions, undo/redo, autosave and download. Existing-text editing (E2) is out of scope; the layout keeps a slot for it (U-E3). Visual values (tokens, type, icons, contrast, motion rules) come from [`docs/design/berrypdf.md`](../design/berrypdf.md); the shared flow pieces come from F1 (`f1-shared-flow.md` § UI). The reference screenshots in `assets/f16-pdf-editor/` are used for behaviour only and never as a visual guide.

Wireframes (SVG, open in a browser): `assets/f16-pdf-editor/ui/`
- `01-landing-1280x720.svg`, `02-landing-390x844.svg`: the landing screen above the fold
- `03-editor-1280x720.svg`: desktop editor (rail, side panel, canvas, popover, view pill)
- `04-editor-768x1024.svg`: tablet (bottom dock with every tool)
- `05-editor-390x844.svg`: phone (top bar, context strip, priority dock + More)
- `06-phone-sheets.svg`: phone "More" and "Pages" sheets
- `07-selection-handles.svg`: selection frame, handles, rotation, snapping, readout
- `08-sign-dialog.svg`: signature and initials dialog

### U-E1. Principles (and the micro-check each one wins)

1. **Open and you're editing.** One action (Open PDF) and the file is editable in the same view. Tools are usable before page 1 has finished painting. Nothing is uploaded, and there's no Apply step and no result page. *(M1, M2, M3, M7, M10)*
2. **The canvas is the product.** Once a file is open the editor takes the whole viewport (focus mode). Chrome is one slim top bar plus one tool rail (desktop) or one dock (phone). *(M4, M11)*
3. **Icons, not words.** Every control is an icon with an accessible name and a tooltip (name and shortcut). Text appears only where a choice needs it: menus, sheets and the sign dialog. *(M11, owner rule)*
4. **Never overflow, never shift.** Every bar has a fixed control budget per width, and overflow goes into a sheet, never off-screen. Every async box (pages, thumbnails, font tiles) has its final size before its content arrives. Target CLS 0.00. *(M4, M11; beats `ref-03`)*
5. **Every action is reversible and undoable from where you are.** Delete is immediate, with undo instead of a confirm dialog; Ctrl/Cmd+Z works everywhere; undo scrolls to and flashes what it changed. *(M5)*
6. **What you see is what you get.** New text is previewed with the **same font file** that gets embedded (no "preview in one font, save in another", unlike the reference, §2a-bis). *(M5, M8)*
7. **Alive, not busy.** Short CSS transitions (≤ 300 ms) for tool switches, selection, placement, page changes and sheets. All of them are off under `prefers-reduced-motion`. *(M11)*

### U-E2. Layout

Breakpoints are the F1 ones (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). Design widths: 375/390 (phone), 768 (tablet), 1280 (desktop). The structural switch from dock to rail is at `lg` 1024.

#### Landing (empty state): above the fold (AC-85)

```
1280×720                                              390×844
┌──────────────────────────────────────────────┐      ┌──────────────────────────┐
│ ● BerryPDF  (All tools)            header 64 │      │ ● BerryPDF     All tools │ 56
│                 Edit PDF          h1 36/40   │      │        Edit PDF   28/32  │
│      ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐       │      │ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│      │          (pdf icon disc)      │       │      │ │    (pdf icon disc)   │  │
│      │       [   Open PDF   ]  56    │       │      │ │ [     Open PDF     ] │  │ ends y≈292
│      │   or drop it here · Ctrl+V    │       │      │ │      Blank page      │  │
│      │          Blank page           │       │      │ │     Up to 200 MB     │  │
│      │         Up to 200 MB          │       │      │ │ ⛨ Stays on this device│  │
│      │   ⛨ Stays on this device      │       │      │ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │ ends y≈428
│      └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ ≤520  │      │                          │
├──────────────────────── fold 720 ────────────┤      ├──────── fold 844 ────────┤
│ ToolSeo guide (how-to, FAQ, related)         │      │ ToolSeo guide            │
```

- This is the F1 empty state, unchanged in structure: `ToolIntro` (h1 only), `DropCard` with `FilePicker`, `LimitsNote` (short "Up to 200 MB", full limits as tooltip and sr-only) and `PrivacyNote`. The only additions are the paste hint on the drop line and a ghost **Blank page** button (A4, or Letter where the locale's region is US/CA; size choice lives in its tooltip menu).
- The drop card is `min-height: 280px` (phone) / `360px` (≥ 640), `max-height: calc(100dvh - var(--ip-header-h) - 160px)`, and centres its content. So at 1280×720, 1366×768, 1440×900 and 390×844 the h1, the whole card and the **Open PDF** button are above the fold, with the button's bottom edge at about y 350 (desktop) and y 292 (phone).
- The empty state shows no disabled editor chrome. The editor shell is a different screen (focus mode), so nothing on this screen needs reserved space for it.
- The `ToolSeo` guide stays below the fold (SEO checklist).

#### Focus mode (a file is open)

On open, the editor shell (`EditorShell`) becomes `position: fixed; inset: 0` over the page, `z` above the site header. The rest of the page gets `inert`, and the shell is labelled by the file name. A `history.pushState` entry is added, so the browser Back button closes the editor (after the leave check, U-E9) instead of leaving the site. The page's `h1` stays in the DOM for SEO; the shell has its own `h2`, the file name (visually the top-bar title). This keeps page scroll and canvas scroll from fighting, gives the canvas every pixel, and makes the height maths exact (`100dvh`).

##### ≥ 1024 (wireframe 03; 1280 shown)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│● contract.pdf ▾ │  ( Text │ Arimo ▾ │ −12+ │ B │ I │ ● )  │ ↶ ↷ │⛨ 0 B│[Download▾]│ top bar 56
├────┬──────────┬──────────────────────────────────────────────────────────────┤
│ ↖  │ Pages|Obj│   1                                   ⟲ ⟳ ⧉ ⊕ 🗑  (row 32)    │
│ E2 │ ┌──────┐ │   ┌──────────────────────────────────────────────┐           │
│ T  │ │  1   │ │   │  [Arimo▾│−16+│B I U│●│≡│⧉ 🗑]  popover       │           │
│ ✍  │ └──────┘ │   │  ┌────────────────────┐                      │           │
│ ▱  │ ┌──────┐ │   │  ◻ Signed by A. Rao| ◻                      │           │
│ ✎  │ │  2   │ │   │  └────────────────────┘                      │           │
│ ◇  │ └──────┘ │   │                                              │           │
│ 🖼 │   …      │   │                                              │           │
│ ▭  │          │   └──────────────────────────────────────────────┘           │
│    │          │  (◫ Saved)          ( ‹ 1 / 10 › │ − 100% + │ ⤢ )            │
│ ▤  │          │                                         view pill, floating  │
└────┴──────────┴──────────────────────────────────────────────────────────────┘
 rail 64        side panel 168 (toggle ▤)   canvas (scrolls, pages centred)
```

- **Top bar** (56, white, 1.5px sand bottom line), left to right:
  1. Berry mark (link home; the leave check applies).
  2. **File button**: the file name (truncated, max 280 px) + chevron. It opens a `Menu` with Open another PDF, Blank page, Clear from this device, Keyboard shortcuts, Close.
  3. **Tool options slot** (centre, flexible, max 560): the active tool's defaults (U-E4). When there's nothing to set (Select), it's empty.
  4. Undo and Redo `IconButton`s.
  5. **Privacy chip** (AC-3).
  6. **Download** (berry `Button` `md`, split chevron).
- **Tool rail** (64, white, sand right line): a vertical `role="toolbar"` of 44×44 tool buttons with 8 px gaps. The Pages panel toggle sits at the bottom. The rail is laid out for **10 slots**: 8 tools in E1, slot 2 reserved for E2 **Edit text**, and one spare for E3's **More** (link, form field, stamp, attachment, find & replace, redact). So later phases add buttons without a redesign. The reserved slot renders nothing in E1 (no disabled placeholder).
- **Side panel** (168, white): `SegmentedControl` **Pages | Objects** at the top, then a virtualised column of `PageThumb`s (120 px wide) in pink trays, with the current page ringed (2.5px berry + page number in Fredoka). It's open by default at ≥ 1280, closed at 1024–1279, and the choice is remembered in `localStorage`. Collapsing animates width 220 ms; the canvas re-centres without re-rendering pages (transform only).
- **Canvas** (`canvas` token #f4eef0, scrolls vertically): pages are centred with 24 px between them. Each page has a 32 px **page header row** above it: the page number on the left, and on the right **page actions** (rotate left, rotate right, duplicate, insert blank after, delete). These are visible at 60% opacity on the current page, at full opacity on hover or focus within, and hidden on other pages. The row's height is always reserved, so nothing shifts.
- **View pill** (floating, bottom centre of the canvas, white, sand border, `shadow-menu`): ‹ page n / N › (n is an editable number field) │ − zoom% + │ fit. The zoom % opens a menu with Fit width, Fit page, 50, 75, 100, 125, 150, 200 and 300%.
- **Save status chip** (floating, bottom left of the canvas): device icon + "Saved", with the tooltip "Changes are kept on this device". It shows "Saving…" for 300 ms minimum after an edit.
- Default zoom: 100% if the page fits the canvas width minus 48 px, otherwise Fit width.

##### 640–1023 (wireframe 04; 768 shown)

- Top bar 56: the same items, except the tool options move to the **context strip**, and the privacy chip shows just ⛨ "0 B".
- No rail and no side panel. A **bottom dock** (white, top sand line, 64 + safe area) holds **every** tool, centred (8 × 64 = 512 px in E1, 576 px with E2's Edit text; both fit in 640).
- **Context strip** (44, white, top sand line): sits directly above the dock and holds the active tool's options or the selected object's properties. It **overlays** the canvas, which has `padding-bottom` for the strip and dock, so it never pushes content.
- The view pill floats above the context strip. The page chip (▤ n/N, top right of the canvas) opens the **Pages sheet**.

##### < 640 (wireframes 05, 06; 390 shown, must work down to 320)

```
┌──────────────────────────────┐
│ ✕ contract.pdf    ↶ ↷ [⤓ Download] │ top bar 52
├──────────────────────────────┤
│                  ( ▤ 1/10 )  │ page chip
│ ┌──────────────────────────┐ │
│ │ page (fit width)          │ │ vertical scroll, pinch zoom
│ │   ◻ Signed by| ◻          │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ T │ Arimo ▾ │ −12+ │ B │ ● │ ⋯ │ context strip 44 (≤ 6 controls)
├──────────────────────────────┤
│ [T]   ✍    ▱    ▭    ✎    ⋯  │ dock 64 + safe area
└──────────────────────────────┘
```

- **Top bar** (52):
  - Close (✕, closes the editor to the landing).
  - File name (truncated; tap opens the File menu as a sheet).
  - Undo and Redo.
  - **Download**: a berry `Button` `sm` with icon + "Download". Below 360 px it becomes icon-only, keeping the accessible name "Download PDF" and the berry fill, so it stays the obvious primary action.
  - The privacy chip moves into the File sheet and the Download toast.
- **Dock: priority tools + More.** The dock shows `n = floor((viewport − 16) / 60) − 1` tools, capped at the tool count, followed by **More** (⋯). Priority order in E1: Text, Sign, Mark, Whiteout, Draw, Image, Shapes, Select. That gives 5 tools + More at 390 and 4 + More at 320. More opens the **More sheet**: a 4-column grid of the remaining tools with labels (labels are fine here: it's a menu), then Keyboard shortcuts and Clear from this device. If the active tool lives in More, the More button shows that tool's icon with a small ⋯ badge, so the active tool is always visible. Nothing ever scrolls sideways or clips (AC-48).
- **Context strip** (44): the same role as on tablet, with a budget of **at most 6 controls of 44 px with 6 px gaps (= 294 px)**, so it fits at 320. Extra properties go into the strip's ⋯ sheet.
- **Pages**: continuous vertical scroll at Fit width, the same as desktop (see open question 1). The page chip opens the **Pages sheet** (3-column thumbnails; tap goes to the page and closes; ⋯ per page opens the page actions menu; an Objects tab). The page header row is hidden on phones; page actions live only in the sheet.
- Pinch zooms around the pinch centre. Single-pointer alternatives (WCAG 2.5.1): − / + and Fit in the page chip's sheet header.

### U-E3. Tools (E1)

Icons are Phosphor Duotone. The engineer adds the names to `TOOL_ICONS`/interface icons in `apps/web/scripts/gen-tool-icons.mjs`; the generator fails on a missing name, and the first fallback is listed. Shortcuts are single keys, active only when focus is in the editor and not in a text field. They can be turned off in the Shortcuts dialog (WCAG 2.1.4).

| # | Tool | Icon (Phosphor) | Key | Sub-modes / defaults (tool options) | Create gesture | AC |
|---|---|---|---|---|---|---|
| 1 | Select | `cursor` | V | – | Click selects; drag on empty space = marquee multi-select; drag on an object = move. On touch, a drag on empty space pans. | 43, 56 |
| 2 | *(E2) Edit text* | `text-aa` | E | reserved slot, not rendered in E1 | – | – |
| 3 | Text | `text-t` | T | family, size, bold, italic, underline, colour, align | Click on the page = new box with a caret at the click point. Drag = box with a fixed width (wraps). The default size follows the nearest text line on the page (pdf.js text items within 48 pt), else 12 pt. | 23, 60 |
| 4 | Sign | `signature` | S | Signature / Initials | Opens the sign dialog (U-E7). Once there are saved ones, the tool options show them as chips: one tap arms the placement. | 31, 32, 55 |
| 5 | Mark | `highlighter-circle` | H | Highlight / Underline / Strike-out (`SegmentedControl`), colour | Drag across text (snaps to word boundaries from the pdf.js text layer, live preview), then release = annotation. On a page without a text layer, drag = area highlight (AC-95). | 27, 64 |
| 6 | Draw | `scribble-loop` (fallback `pencil-simple`) | P | Pen / Marker (marker = freehand highlight, 40% opacity, multiply), colour, width S/M/L (1, 2.5, 6 pt; marker 12 pt) | Pointer down, then draw. One stroke = one ink object. With a pen, touch never draws (it pans). Without a pen: one finger draws, two fingers pan/zoom. | 27, 63 |
| 7 | Shapes | `shapes` | R | Rectangle / Ellipse / Line / Arrow, stroke colour, fill (none default), stroke width | Drag to draw. Shift = square / circle / 45°. A click without a drag = default 120×80 pt (lines 120 pt). | 26 |
| 8 | Image | `image` | I | – | Opens the image picker at once (PNG, JPEG, WebP, GIF, SVG ≤ 25 MB). Also: **paste** an image (Ctrl/Cmd+V) or **drop** an image onto a page, which places it at the drop point (AC-93). It's placed at ≤ 50% of the page width, centred in the view, and selected. | 24, 62 |
| 9 | Whiteout | `eraser` | W | colour: **Page colour** (default; sampled from the rendered page under the box, AC-97) or a swatch | Drag a rectangle. A click without a drag = 120×24 pt. The tool options show ⚠ "Hides content; doesn't delete it" (visible text, the AC-25 warning; the full explanation is in the tooltip). | 25, 66 |

Tool behaviour common to all tools:
- **Sticky or one-shot.** After creating an object, Text, Image, Sign and Whiteout return to Select with the new object selected (one-shot: the most common job is one placement). Mark, Draw and Shapes stay armed (repetitive). Double-clicking a tool locks it (a small lock badge shows on the icon); Escape unlocks.
- **Clicking an existing object with any tool selects it** (tools only create on empty space). So the user never has to switch to Select to adjust something.
- **Defaults are sticky per session.** Changing a property on a selected object also becomes that tool's default for the next object (AC-96).
- **Document colours.** These are content, not UI tokens, and live in the editor config:
  - ink swatches: Black #000000, Blue #1a49c7, Red #c8102e, Green #12805c, Purple #5b2a86
  - marker swatches: Yellow #ffe14d, Green #7cf09a, Blue #7cd3ff, Pink #ff9ad5, Orange #ffb35c
  - plus **Custom** (native `<input type="color">`)
  - each swatch has a name (`aria-label`), and the selected one shows a check mark (not colour alone)
- **Fonts (E1).** Arimo (stand-in for Arial/Helvetica, Apache-2.0), Tinos (Times, Apache-2.0), Cousine (Courier, Apache-2.0), Carlito (Calibri, OFL), Caladea (Cambria, OFL). Each is self-hosted, lazy-loaded per family on first use, and embedded as a subset of the **same file** used for the preview (AC-91). The family menu shows each name in its own face, with the stand-in in muted text ("Arimo · Arial").

### U-E4. Tool options, selection and properties

**Tool options** (top-bar centre slot at ≥ 1024; context strip below) hold the defaults for the next object. They cross-fade (150 ms) on tool switch, and the slot's width is fixed, so the bar never jumps.

**Selection frame** (wireframe 07):
- Hover over an object: 1 px dashed outline `#4a63d9`.
- Selected: a 1.5 px solid `#4a63d9` outline plus a 1 px white outer halo. That's 5.15:1 on a white page, and the halo keeps it ≥ 3:1 on dark page art (WCAG 1.4.11).
- Handles are 10 px squares (12 px on coarse pointers) with a white fill and a blueberry border. The hit area is 24 px for a fine pointer and **44 px for a coarse pointer** (AC-48).

| Object | Handles | Rotate |
|---|---|---|
| Image, signature, initials | 4 corners, aspect locked (Shift frees it) | yes |
| Rectangle, ellipse, whiteout | 8 (corners + edges), free (Shift locks the aspect) | rect/ellipse yes, whiteout no |
| Line, arrow | 2 endpoints | via endpoints |
| Text box | left and right edge (width = wrap width); size changes via the font size | no (E1) |
| Ink stroke, markup | none (move and delete only) | no |

- The **rotate handle** is a 14 px circle on a 24 px stem above the top centre. It snaps to 0/90/180/270 within 5°, and Shift steps by 15°.
- **Snapping** (AC-64): while moving or resizing, edges and centres snap to the page edges, the page centre lines and other objects' edges and centres on the same page, within 6 screen px. Guides are 1 px dashed `--brand` with a white halo; they appear immediately and fade out in 100 ms on release. Holding Alt suspends snapping.
- **Live readout**: while dragging, a dark ink pill under the selection shows "x 210 y 300 · 160 × 130 pt". On release, a polite live-region message gives the final position.
- **Multi-select**: Shift+click or a marquee (Select tool). One frame goes around the group; move, nudge, duplicate and delete apply to all of them. The properties shown are the shared ones.

**Properties popover** (≥ 1024; `role="toolbar"`, `aria-label` "<object> properties"):
- **Look:** a white pill, 40 px tall, radius 14, 1.5 px sand border, `shadow-menu`.
- **Placement:** 8 px above the selection, flipping below when there's no room. It is clamped inside the canvas and follows the selection on scroll and zoom.
- **While dragging:** hidden (fades out over 100 ms); it comes back on release.
- **DOM order:** placed right after the selected object, so **Tab** goes from the object into the popover and Escape returns focus to the object. Left/Right arrows move between controls (roving tabindex).
- **Contents per object** (everything not listed goes into ⋯):

| Object | Popover controls (in order) | ⋯ menu |
|---|---|---|
| Text | Family ▾, Size (− field +), Bold, Italic, Colour, Delete | Underline, Align left/centre/right, Duplicate, Bring forward, Send backward |
| Image | Rotate 90°, Opacity (slider in a mini popover), Duplicate, Delete | Replace image, Reset aspect, Forward/backward |
| Signature / initials | Colour (re-tints typed/drawn), Duplicate, Delete | Forward/backward |
| Shape | Stroke colour, Fill colour, Width, Delete | Duplicate, Forward/backward |
| Markup | Kind (highlight/underline/strike), Colour, Delete | – |
| Ink | Colour, Width, Delete | Duplicate |
| Whiteout | Colour (Page colour / swatches), Delete | Duplicate |

Below 1024 the same controls appear in the **context strip** (the first 5 + ⋯), replacing the tool options while something is selected.

Each property change is **one undo step** and applies live (AC-96). The size field accepts typed values from 4 to 400 pt and steps by 1 (Shift by 4).

### U-E5. Pages: navigation and actions

- **Navigation**:
  - the view pill (‹ n / N ›, with the number field for a direct jump)
  - thumbnails (click = smooth scroll to the page, AC-8)
  - PageUp/PageDown and Home/End when the canvas has focus and no text is being edited
  - the current page = the page covering the canvas centre line; it updates the field, the thumbnail ring and `aria-current="page"` on its thumbnail
- **Rendering**:
  - every page gets its exact box size from `readPageSizes` before it renders (no layout shift)
  - pdf.js renders only visible pages ± 1, at `devicePixelRatio × zoom`, with the canvas capped at 16.7 Mpx (iOS)
  - off-screen canvases are released; thumbnails reuse the F1 `ThumbnailRenderer` and `createVisibilityWatcher`
- **Zoom** (AC-7):
  - buttons, Ctrl/Cmd + `+`/`−`/`0` (only when focus is in the editor), Ctrl+wheel and pinch
  - zoom is anchored at the cursor or pinch centre
  - during a gesture the page is scaled with a CSS transform; on release it re-renders sharp
  - the overlay is laid out in PDF points × scale (CSS px, never device px), and a `ResizeObserver` keeps it aligned at browser zoom 125%
- **Page actions** (AC-41): rotate left, rotate right, duplicate, insert blank page after (same size as this page), delete.
  - ≥ 1024: in the page header row and in each thumbnail's ⋯ menu
  - below 1024: in the Pages sheet's ⋯ menu
  - **Delete** is immediate, with an undo toast ("Page 3 deleted", **Undo**), and it's disabled on the last remaining page
  - rotating turns the page box with its overlay objects (CSS, 250 ms) and then re-renders
  - all page actions are undoable

### U-E6. Undo, redo, autosave, recovery

- **Undo and redo** (AC-43): the top-bar buttons, Ctrl/Cmd+Z, and Ctrl/Cmd+Shift+Z or Ctrl+Y.
  - each button's tooltip names the step ("Undo move signature · Ctrl+Z")
  - the history holds ≥ 100 steps (the whole session in memory; the op log in IndexedDB)
  - after an undo or redo, the canvas scrolls the affected object into view if needed, selects it and flashes its outline once (300 ms)
  - the live region says "Undid: move signature"
  - a disabled button uses the native `disabled` attribute
- **Autosave**: the op log is written to IndexedDB 500 ms after each change, and the Save status chip shows the result. If IndexedDB is unavailable (some private modes), the chip says "Not saved on device" (warning icon) and the leave check gets stricter (U-E9).
- **Recovery** (AC-45): when a file whose hash matches a saved session is opened, an info `Notice` appears in the canvas top area (floating, no shift): "Restore 12 changes from 10:42?" with **Restore** (focus lands here) and **Discard**. It's non-blocking: editing first counts as Discard after a confirm toast.
- **Clear from this device** (File menu) deletes the saved session and saved signatures after a `Dialog` confirm.

### U-E7. Sign dialog (signatures and initials)

Wireframe 08. Desktop uses `Dialog` (reused; 440 px). Phones use a full-height `Sheet`.

- **Signature | Initials** (`SegmentedControl`) at the top. Initials use a squarer pad and box (AC-87).
- **Saved on this device**: chips of saved items (tap = place; ✕ on each deletes it after an undo toast). This section is shown first when it isn't empty, so a returning user signs in 2 taps: Sign, then the chip.
- **Type | Draw | Upload** (`SegmentedControl`):
  - **Type**: a name field (prefilled with the last name used), 8 OFL handwriting faces as fixed-size preview tiles (the selected tile gets a berry edge and a tick), and 5 ink swatches. The fonts load when the dialog opens; tiles show the name in Fredoka until their font arrives, at the same size.
  - **Draw**: a 392×160 pad (phone: full width × 200) with a baseline, Pointer Events with pressure, smoothing, Clear and the ink swatches. The pad's scroll and touch-action are locked so the page doesn't scroll.
  - **Upload**: PNG or JPEG ≤ 25 MB, with **Remove background** (`Switch`, on by default; threshold-to-transparent) and a live preview.
- **Save on this device** checkbox (on by default).
- Footer: **Cancel** (soft) and **Place** (berry), in DOM and Tab order.
- **Placing**: with a mouse, a ghost follows the cursor and a click drops it. With touch or the keyboard, it drops at the centre of the visible part of the current page, selected and focused. The live region says "Signature placed on page 2. Arrow keys move it."

### U-E8. Download

- **Download** is always enabled (AC-44), even with no edits (it then saves the original with `Producer` set to BerryPDF). Ctrl/Cmd+S downloads too (AC-93).
- The click builds the PDF in a worker (pdf-lib, then a qpdf-WASM pass, both lazy-loaded on the first Download intent: pointerenter or focus of the button).
  - Under 400 ms: no progress UI.
  - Over 400 ms: the button keeps its width and shows a jam fill inside its face with `aria-busy` and the progressbar semantics (`ProgressBar` pattern).
- **Done**: the browser download starts. The button icon swaps to a tick for 1.5 s, and a success toast says "Downloaded · contract.pdf" with "0 B uploaded" (⛨). **The user stays in the editor** with history intact; further edits and a second download work.
- The split chevron opens **Save as**: a popover with a file-name field (default `<original>.pdf`), a "-edited" suffix switch, and Download.
- **Failure**: a danger `Notice` ("Couldn't build the PDF", **Try again**). Edits are untouched and the details are logged locally only.

### U-E9. States

| State | What the user sees |
|---|---|
| Empty | Landing (U-E2), above the fold. |
| Opening (pick → first page) | Focus mode opens in the same frame as the pick. The top bar shows the file name and the tools are already active. Page boxes appear at their real sizes as soon as `readPageSizes` resolves (sized placeholder trays with the small berry loader before that). Page 1 paints first; the rest render on visibility. Over 600 ms, a determinate thin jam line runs under the top bar (bytes read, then pages parsed). Target: page 1 visible < 1 s for a 10-page PDF (AC-90). |
| Ready / editing | As laid out above. |
| Password | F1 `PasswordDialog` over the landing (before focus mode). |
| Owner-restricted (no modify) | F1 `OwnerPermissionNotice` with the owner-password path. The editor opens read-only until it is cleared: tools are disabled with the tooltip "Locked by the file's owner". |
| Not a PDF / corrupt / empty | Back to the landing with the F1 danger notice; focus returns to Open PDF. |
| One page fails to render | That page's tray shows a broken-page icon and **Retry**; the other pages work. |
| Image rejected (type/size) | A danger toast naming the file and the limit; nothing is placed. |
| Font failed to load (offline) | The text keeps the last loaded family, plus an info toast "Using Arimo; <family> isn't available offline". |
| Out of memory / worker crash | A danger `Notice`: "This tab ran out of memory. Your changes are saved on this device." with **Reload**. After reload, recovery offers them back. |
| Drop a PDF while editing | F1 `DropOverlay` (replace mode), then `ReplaceFileDialog` (reused). Dropping an image places it instead (U-E3). |
| Leave with changes not yet downloaded | Reuse F1 `LeaveGuard` (Close, Back, logo, other links). Its copy says the changes stay on this device. If autosave is unavailable, the native `beforeunload` prompt is also armed. |
| Building download | U-E8. |
| Big file (> 500 pages on a phone) | An info toast "Large file: pages load as you scroll" (no limit, AC-5). |

### U-E10. Keyboard, focus order, ARIA

**Regions and focus order** (DOM order = Tab order; **F6** / Shift+F6 cycles regions):
1. Top bar: `header`, contains the editor `h2` (file name).
2. Tool rail or dock: `role="toolbar"` `aria-label="Tools"`, `aria-orientation` vertical (rail) or horizontal (dock), roving tabindex, arrows move, Enter/Space picks. Each tool is a `button` with `aria-pressed` and an `aria-keyshortcuts` attribute.
3. Side panel (`aside`, "Pages and objects"):
   - **Pages** is a `role="listbox"` of thumbnails ("Page 3 of 10").
   - **Objects** is the **object list** (AC-89), grouped by page. Rows read "Text: Signed by A. Rao", "Signature", "Rectangle", "Highlight: quarterly total". Enter selects and focuses the object on the canvas; Delete deletes it.
4. Canvas: `main`-like `region` "Document". Each page is a `region` labelled "Page n of N". The pdf.js text layer stays readable. Added objects are focusable elements (`tabindex="0"` on the current page, `-1` elsewhere) with `role="group"`, `aria-roledescription` (added text, signature, image, shape, highlight, drawing, whiteout) and an `aria-label` (the text content or a type + page). `aria-describedby` points to a hidden position line ("at 120, 340 pt, 160 by 40").
5. View pill.
6. Status chips.

**Shortcuts** (also listed in the Shortcuts dialog, opened with `?`; Mac shows ⌘):

| Keys | Action |
|---|---|
| V T S H P R I W (E2: E) | Pick a tool (single-key; can be turned off) |
| Esc | Leave text editing, then deselect, then unlock / return to Select |
| Tab / Shift+Tab (in canvas) | Next / previous object on the page, then the popover |
| Enter | Edit the focused text box; open the popover for others |
| Arrows / Shift+Arrows | Nudge 1 pt / 10 pt (one undo step per burst, AC-88) |
| Delete / Backspace | Delete the selection |
| Ctrl/Cmd+D, Ctrl/Cmd+C / V | Duplicate; copy/paste objects (paste of an image file places it) |
| Ctrl/Cmd+Z, Shift+Z, Ctrl+Y | Undo, redo |
| Ctrl/Cmd+S | Download |
| Ctrl/Cmd + `+` / `−` / `0` | Zoom in / out / fit width |
| PageUp/PageDown, Home/End | Previous/next page, first/last |
| F6 / Shift+F6 | Next / previous region |

**Live region** (polite, F1 `LiveRegion`): tool changes ("Text tool"), placement, move results, deletions ("Deleted signature. Ctrl+Z to undo."), undo/redo, page actions, download done, autosave failure (assertive).

**Contrast** (all from the measured table in `berrypdf.md`):
- tool icons `#3147b8` on white: 7.71:1
- active tool `tool-active-ink` on `tool-active-bg`: 8.80:1, plus `aria-pressed` and the filled pill shape (not colour alone)
- selection and handles `#4a63d9` on white: 5.15:1, with a white halo
- snap guides `--brand` on white: 4.78:1
- muted chips: 5.45:1
- white on berry Download: 4.78:1 (hover 4.53)
- privacy chip text (alert success) #1d5f2d on #e9f6ec: 6.92:1
- the focus ring (3 px blueberry, 3 px offset) is drawn in addition to the selection outline when focus is from the keyboard (`:focus-visible`)

**Forced colours**: the selection outline, handles and guides use `Highlight`, the active tool gets a 2 px `Highlight` border, and chips get a `ButtonText` border.

### U-E11. Motion (all CSS, ≤ 300 ms, all off under `prefers-reduced-motion: reduce`)

| What | Motion | Duration / easing |
|---|---|---|
| Tool switch | The active pill slides to the new tool (transform); tool options cross-fade | 200 ms standard / 150 ms |
| Selection appears | Outline fades in; handles scale 0.6→1 | 120 ms / 150 ms `pop` |
| New object placed | Scale 0.92→1 + fade | 200 ms `pop` |
| Object deleted | Fade + scale to 0.9 | 150 ms |
| Undo/redo target | One outline pulse (under reduced motion: a static outline for 600 ms) | 300 ms |
| Popover / context strip | Fade + scale 0.96→1 from the selection side / slide up 8 px | 150 ms enter |
| Snap guides | Appear instantly; fade out on release | 100 ms |
| Sheets (More, Pages, File, Sign on phone) | Slide up; scrim fades | 250 ms enter / 200 ms exit |
| Side panel collapse | Width + canvas re-centre (transform) | 220 ms |
| Page insert / delete | Height expand / collapse; neighbours FLIP-translate | 250 ms |
| Page rotate | The page box rotates 90°, then re-renders sharp | 250 ms |
| Zoom (buttons) | Transform tween, then sharp re-render | 150 ms |
| Thumbnails ready | Ease in (existing F1/BerryPDF motion) | 300 ms |
| Download | Jam fill inside the button (> 400 ms only); icon → tick | 0.5 s width (BerryPDF jam) / 200 ms |
| Sign dialog | Modal rise (existing `Dialog`) | 300 ms |

Dragging, resizing, drawing and pinching are never animated: they follow the pointer 1:1 on `requestAnimationFrame` (transforms only, no React render per move).

### U-E12. Component tree

Reused (no changes unless noted):
- `ui/`: `Button`, `IconButton` (tooltip with name + `Kbd` shortcut), `SegmentedControl`, `Slider` (opacity), `Switch`, `Dialog`, `Notice`, `ProgressBar`, `LiveRegion`, `Kbd`, `Spinner`, `VisuallyHidden`, `icons`
- `berry/`: `BerryLoader`
- `tool-flow/`: `ToolIntro`, `DropCard`, `FilePicker`, `DropOverlay`, `PasswordDialog`, `OwnerPassword*`, `ReplaceFileDialog`, `LeaveGuard`/`useLeaveGuard`, `NoticeStack`, `notes` (`LimitsNote`, `PrivacyNote`), `Thumbnail` (`PageThumb`, `ThumbContext`, `createVisibilityWatcher`)
- `lib/pdf/`: `openPdf`, `readPageSizes`, `ThumbnailRenderer`, `validation`

The editor does **not** use `ToolFlow`/`ControlDock`/`ResultCard`: it has no Apply step and no result screen. It does reuse their pieces above, so errors, passwords and limits look and read the same as every other tool.

New design-system primitives (`components/ui/`, owned here):
- `Popover`: anchored, flip and clamp, Escape returns focus.
- `Menu`: `role="menu"`, roving, type-ahead.
- `Sheet`: bottom sheet built on native `<dialog>`, drag-to-close handle, safe-area padding.
- `Toolbar`: roving tabindex helper.
- `ColorSwatches`: `radiogroup` + custom.
- `NumberStepper`: − field +, `spinbutton`.
- `Toast`: a `Notice` variant with an action, auto-hides after 6 s and pauses on hover or focus.

New editor components (`apps/web/src/tools/editor/`, lazy chunk):

```
EditorTool (route component; landing = F1 pieces; dynamic-imports EditorShell)
└─ EditorShell (focus mode, inert page, history entry, shortcuts, F6 regions)
   ├─ EditorTopBar: BerryMark link · FileMenu · ToolOptions slot · UndoRedo · PrivacyChip · DownloadButton (+ SaveAsPopover)
   ├─ ToolRail (≥1024) | ToolDock + MoreSheet (<1024)
   ├─ SidePanel (≥1024) | PagesSheet (<1024): Pages (ThumbList, PageMenu) · Objects (ObjectList)
   ├─ Canvas (scroll container, zoom/pinch controller, virtualiser)
   │  └─ PageView ×N: PageHeaderRow (PageActions) · PageRaster (pdf.js) · TextLayer (pdf.js) · OverlayLayer
   │     └─ ObjectView ×n (TextBox, ImageObj, SignatureObj, ShapeObj, InkObj, MarkupObj, WhiteoutObj)
   │        └─ SelectionFrame (Handles, RotateHandle, Readout) · SnapGuides
   ├─ PropertiesPopover (≥1024) | ContextStrip (<1024): FontPicker · NumberStepper · ColorSwatches · ⋯ Menu
   ├─ ViewPill (PageField, ZoomMenu) · PageChip (<1024) · SaveStatusChip
   ├─ SignDialog: SavedSignatures · TypePane · DrawPad · UploadPane
   ├─ RecoveryNotice · Toasts (NoticeStack) · ShortcutsDialog · LiveRegion
   └─ state: editorStore (op log, history, selection, tool defaults) → IndexedDB autosave; buildPdf worker (pdf-lib + qpdf-WASM)
```

### U-E13. Performance budget

| Budget | Value | How |
|---|---|---|
| Route first-load JS (landing, gzip) | **≤ 150 kB** (AC-86; the SEO checklist's phone cap is 170 kB) | Landing = F1 pieces only. `EditorShell` + pdf.js + the store are `next/dynamic` chunks. |
| Editor chunk (JS, excluding pdf.js worker, fonts, WASM; gzip) | ≤ 250 kB (AC-51) | pdf-lib and qpdf-WASM load on Download intent; the sign dialog, its fonts and the draw pad on Sign; each text family on first use. |
| Prefetch | On pointerenter/focus of Open PDF, on drag-enter, and on `requestIdleCallback` after LCP | So the chunk is usually cached by the time the file is picked. |
| Pick → focus mode visible | ≤ 100 ms | The shell renders from cached JS. |
| First page visible (10-page PDF, CI desktop) | **< 1 s** (AC-90) | Page 1 first at the visible scale; thumbnails after. |
| Tool switch / selection response | ≤ 50 ms (one frame + transition) | |
| Drag/resize/draw | 60 fps; no long task > 50 ms during interaction | Transforms on rAF; commit to the store on pointerup. |
| Download, `para-times.pdf` + 10 edits | < 3 s (AC-44); target < 1 s | Worker; qpdf pass only after pdf-lib. |
| CLS | ≤ 0.01 landing → editing (AC-92) | Sized page boxes, fixed bars, overlays. |
| Lighthouse mobile (landing) | ≥ 90 performance, 100 SEO (AC-52) | |
| Memory | Rendered canvases ≤ visible ± 1; thumbnails at 120 px × DPR | |

### U-E14. Micro-checks: what each choice is meant to win

| Check | Our design choice | Reference baseline (§2) |
|---|---|---|
| M1 Landing | h1 + one Open PDF button above the fold at all four owner viewports; editor JS prefetched on intent; no paragraphs | Long title and subtitle; toolbar pushed down (ref-03) |
| M2 Upload start | Click, drop, **paste**, Blank page; picking opens the editor in the same frame with **0 bytes sent** | Uploads the whole file on pick |
| M3 Loading | Real page boxes at once, page 1 < 1 s, truthful jam line only if > 600 ms | ~0.5 s to first page after an upload |
| M4 Display | DPR-sharp re-render after zoom, virtualised 300+ pages, exact rotation, no CLS | Zoom breaks at browser zoom ≠ 100%; "can't zoom pages with changes" |
| M5 Interaction | 1-click tools, auto-return to Select, click-any-object-to-select, snapping, handles, nudge keys, full undo/redo with "where" feedback, object list, preview font = output font, touch gestures | Single Undo button; preview font ≠ output font |
| M6 Options | Free: unlimited saves, signatures + initials saved on device, marker, area highlight on scans, page-colour whiteout, Ctrl+S | 3 tasks/hour; premium gates |
| M7 Processing | Download builds locally, no Apply/result round trip, < 1 s target, keep editing | Apply → 3.7 s; pick → download 13.6 s |
| M8 Output | Text as real text in the previewed font, standard annotations, `qpdf --check`, Producer set | Server rewrite |
| M9 Errors | F1 errors reused, per-page render retry, OOM with autosave, recovery, read-only owner-locked mode | Generic messages; "Too many attempts" |
| M10 Privacy/cost | Privacy chip "0 B uploaded" with how-to-verify, CSP, no limits, no login | Upload on pick; rationed saves |
| M11 Look/motion | One berry action, icon-only chrome, ≤ 300 ms motion, phone dock that never overflows | Desktop toolbar overflows on phones (ref-03) |

### U-E15. E1 acceptance criteria → UI element

| AC | UI element(s) |
|---|---|
| AC-1, AC-2 | No upload path in E1; `PrivacyChip`; CSP unchanged (`connect-src 'self'`) |
| AC-1b | Not applicable in E1 (no server fallback ships in E1); the consent UI is designed when the fallback is built |
| AC-3 | `PrivacyChip` (top bar; File sheet + Download toast on phones) → popover with "Nothing leaves this device" + "How to check" link |
| AC-4 | `DownloadButton`: no counters or limit copy anywhere |
| AC-5 | Virtualised `Canvas` + `ThumbList`; big-file toast without a limit |
| AC-6, AC-90 | Opening state (U-E9), performance budget (U-E13) |
| AC-7 | `ViewPill` zoom, Ctrl+wheel, pinch, PDF-point overlay layout (U-E5) |
| AC-8 | `SidePanel` Pages / `PagesSheet` thumbnails |
| AC-23 | Text tool + `TextBox` |
| AC-24 | Image tool, `ImageObj` with corner handles (aspect locked) + rotate handle |
| AC-25 | Whiteout tool; ⚠ "Hides content; doesn't delete it" in its tool options |
| AC-26 | Shapes tool (4 kinds), stroke/fill in tool options and popover |
| AC-27 | Mark tool (highlight/underline/strike + colour), Draw tool (pen + marker) |
| AC-31 | `SignDialog` Type (8 faces, 5 inks) / Draw / Upload (+ Remove background), place + resize |
| AC-32 | Saved signatures chips (IndexedDB), delete ✕, Clear from this device |
| AC-41 | `PageActions` (page header row, thumbnail ⋯ menu, Pages sheet) |
| AC-43 | `UndoRedo` buttons + shortcuts, history ≥ 100 |
| AC-44 | `DownloadButton`, stay in the editor, second download |
| AC-45 | Autosave + `RecoveryNotice` |
| AC-46 | Not UI (output check); the Download failure path covers build errors |
| AC-48 | Priority `ToolDock` + `MoreSheet`, ≤ 6-control `ContextStrip`, 44 px hit areas |
| AC-49 | U-E10 roles, object list, shortcuts, axe |
| AC-50 | U-E11 (every motion off under reduced motion) |
| AC-51, AC-52 | U-E13 |

#### Acceptance criteria added in design (E1)

Numbered after the recording ACs (53–73) and the live-check ACs (74–84). The design draft's snapping criterion is covered by AC-64 and is not repeated here.

- **AC-85 (P0)** *(added in design)* At 1280×720, 1366×768, 1440×900 and 390×844, the editor landing shows the `h1` and the whole **Open PDF** button without scrolling, and nothing from the SEO guide sits above them.
- **AC-86 (P1)** *(added in design)* The editor route's first-load JS (landing, gzip) is ≤ 150 kB. The editor shell, pdf.js and pdf-lib are not requested until the user shows intent (pointerenter/focus on Open PDF, a drag, or idle after LCP) or picks a file.
- **AC-87 (P0)** *(added in design)* The Sign tool creates **initials** as well as signatures, by type, draw or upload; saved initials are listed separately from signatures and placed the same way.
- **AC-88 (P1)** *(added in design)* With an added object focused: arrows move it 1 pt, Shift+arrows 10 pt, Delete/Backspace removes it, Ctrl/Cmd+D duplicates it and Escape deselects it; each change is announced in the live region and undoable (a burst of nudges is one step).
- **AC-89 (P1)** *(added in design)* The Objects list shows every added object per page with an accessible name; choosing one scrolls to it and moves focus to it on the canvas.
- **AC-90 (P1)** *(added in design)* Page 1 of a 10-page fixture (`ten-page.pdf`, add to fixtures) is visible < 1 s after picking, on the CI desktop profile.
- **AC-91 (P1)** *(added in design)* Added text is drawn in the editor with the same font file that is embedded in the output (the output's font name for that run matches the family chosen in the editor).
- **AC-92 (P1)** *(added in design)* CLS ≤ 0.01 from the landing through opening a file and the first page render; no control in the top bar, rail or dock moves when page content loads.
- **AC-93 (P1)** *(added in design)* Pasting an image (Ctrl/Cmd+V) places it on the current page; dropping an image onto a page places it at the drop point; Ctrl/Cmd+S downloads.
- **AC-94 (P1)** *(added in design)* Touch: with the Draw tool, one finger draws and two fingers pan/zoom; when a pen is used, touch input never draws.
- **AC-95 (P2)** *(added in design)* The Mark tool on a page without a text layer (`scan.pdf`) creates an area highlight annotation instead of doing nothing.
- **AC-96 (P1)** *(added in design)* Changing a property of a selected object applies live, is one undo step, and becomes that tool's default for the next object in the session.
- **AC-97 (P2)** *(added in design)* Whiteout's default colour matches the page colour sampled under the box (within ΔE 2 on a tinted-page fixture).
- **AC-98 (P1)** *(added in design)* At 320×568 and 390×844, no editor bar (top bar, context strip, dock) is wider than the viewport and none scrolls horizontally; the active tool is always visible (in the dock or as the More button's icon).

### U-E16. Open questions

1. **Phone paging.** §6 says "one page at a time with swipe" on phones. This design uses continuous vertical scroll at Fit width instead, because a horizontal swipe conflicts with drawing, dragging and marquee, and vertical scroll is what phone users expect from documents. Owner/orchestrator to confirm; §6 should be updated if accepted.
2. **E2 entry point.** Should E2's existing-text editing be a separate **Edit text** tool (the reserved rail slot), or should it merge into **Text** (click existing text = edit, click empty = add, as in §2a-bis)? A merge saves a tool and a click; a separate tool makes E1 → E2 risk-free and avoids accidental edits. The slot stays reserved until E2 design decides.
3. **Focus mode and the site header.** The editor covers the site header while a file is open (the berry mark in the top bar links home). The thread fixing the shared tool layout should confirm that this doesn't conflict with its header rules.
4. **AC-6 vs AC-90.** AC-6 (1.5 s, `para-times.pdf`) and AC-90 (< 1 s, 10 pages) overlap. The suggestion is to keep both: AC-6 as P0 parity, AC-90 as the "beat it" target.
5. **Signature faces.** Choose the 8 OFL handwriting families (candidates to check per font: Caveat, Dancing Script, Great Vibes, Homemade Apple (Apache-2.0), Kalam, Sacramento, Satisfy (Apache-2.0), Yellowtail (Apache-2.0)). Each one's licence must be confirmed before it's added.

## UI (phase E3 forms slice)

Designed 2026-11-24 in the forms thread. It builds on the E1 contract above: same rail, popover, context strip, snapping, undo and motion rules. Logic lives in `apps/web/src/lib/forms/`; the components go in `apps/web/src/tools/forms/` and plug into the editor shell after #25.

### U-F1. Entry points
- **Form tool** (Phosphor `textbox`, key **F**): its own rail slot between Sign and Mark (pending the lead's confirmation; otherwise under More). On phones it joins the dock priority list after Sign.
- **Filling never needs the Form tool.** With any tool, clicking a field of the file types into it (text, dropdown, list), toggles it (checkbox, radio) or opens the Sign dialog (signature field, which places the signature inside the field box). **Tab** and Shift+Tab move between fields in tab order, across pages.
- When the file has fields, a one-line chip in the top bar reads "12 fields" and opens a "Next empty field" jump. When required fields are empty at Download, the chip turns to "2 required empty". Download still goes ahead; the chip is a nudge, not a block (AC-233).

### U-F2. Form tool options (top-bar slot, or the context strip below 1024)
`SegmentedControl` of kinds (icons with tooltips): Text `textbox`, Multi-line `text-align-left`, Checkbox `check-square`, Radio `radio-button`, Dropdown `caret-circle-down`, List `list-bullets`, Signature `signature`. Then a divider and two buttons: **Detect** (`sparkle`) and **Tab order** (`list-numbers`).
- Create gesture: drag a box. A click without a drag gives the kind's default size (`defaultSize` in model.ts) centred on the click. Radio: each click while the new group is selected adds a button to the same group. Shift+click starts a new group.
- The tool stays armed (forms are repetitive). Escape returns to Select.
- While the Form tool is active, every field shows its outline and name tag (10 px, muted). Outside it, fields show only the light fill.

### U-F3. Field look on the canvas (editor only, never saved)
- Fill: `--blueberry` at 8% (a light blue), with a 1 px `--blueberry` 40% outline on hover. Required fields carry a 6 px berry dot at the top-right corner (not colour alone: it has a "Required" tooltip and an `aria-required`).
- Proposed fields (Detect): a 1.5 px dashed `--brand` outline, a 12% fill, and a small ✓ / ✕ pair at the top-right (24 px hit area, 44 px on coarse pointers).
- The first time a file with fields opens, an inline toast says "Field shading shows in the editor only". It shows once per device, never in a modal (AC-65).

### U-F4. Field properties popover (selected field, Form tool or Select)
| Kind | Popover controls (in order) | ⋯ menu |
|---|---|---|
| Text | Name (inline field), Required, Size (auto / −field+), Colour, Delete | Tooltip, Default value, Max length, Comb (N boxes, with N = max length), Multi-line, Align, Border, Background, Read-only, Repeat on all pages, Duplicate |
| Checkbox | Name, Required, Delete | Export value, Checked by default, Border, Background, Read-only, Repeat on all pages, Duplicate |
| Radio | Group name, This button's value, Add button, Delete | Required, Selected by default, Border, Background, Read-only |
| Dropdown / List | Name, Options (opens a small list editor: one per line, drag to reorder, default marked with a radio), Delete | Editable (dropdown), Multi-select (list), Size, Colour, Required, Read-only, Tooltip, Duplicate |
| Signature | Name, Required, Delete | Tooltip, Repeat on all pages, Duplicate |
- The name field checks as the user types (`checkName`). A duplicate, a dot or an empty name shows a one-line note under the field with the suggested name as a button ("Use full_name_2"). The note uses no colour alone: it has a ⚠ icon and text (AC-235).
- A multi-line hint: when a single-line text field is drawn taller than 2.5 lines of its font size, a quiet chip offers "Make multi-line".

### U-F5. Detect fields flow (AC-240, AC-244, AC-246)
1. Detect asks nothing. It runs at once on every page, and the button turns into a jam-progress ring with "Page n of N" and a ✕ that cancels. The editor stays usable: pages scroll and nothing is locked.
2. Results arrive per page, and outlines fade in (150 ms) as each page finishes.
3. A **review pill** floats above the view pill. It reads "13 fields on 2 pages", with ‹ › to step through proposals (scrolling to each and focusing its ✓), then **Add all** (berry) and **Discard**. Enter on a focused proposal accepts it and Delete rejects it.
4. Accepting one, or Add all, is one undo step and turns the proposals into normal fields (now selected and editable). When none are found, the pill says "No new fields found" and fades after 3 s.
5. On pages that already have fields, only new proposals appear. The pill counts only those (AC-244).

### U-F6. Tab order panel (AC-239)
- It opens as the side panel's third segment, **Pages | Objects | Tab order**, so it never covers the page. On phones it's a sheet.
- Buttons: **Rows**, **Columns** and **Original**. Under them is a list of chips grouped by page (name, kind icon and number), draggable, with keyboard support: Space picks a chip up, arrows move it, and Space drops it.
- **While the panel is open, every field on the canvas shows its number in a badge.** Clicking fields in sequence renumbers them from the one clicked ("click to set order"). This beats a list-only dialog: the order is visible where the fields are.

### U-F7. Phone (390 × 844)
The Form tool's options become the context strip: kinds as a scrollable-free 4 + ⋯ group, with Detect and Tab order in ⋯. The review pill is full width above the dock. Properties use the existing bottom sheet. No control is wider than the viewport (AC-98).

### U-F8. UI acceptance criteria
- **AC-248 (P0)** Fields of an opened file can be filled with any tool active: typing into text fields, picking in dropdowns and lists, and toggling checkboxes and radios. Tab and Shift+Tab follow the tab order across pages. The download carries the values (AC-231).
- **AC-249 (P1)** With the Form tool, a drag creates the chosen kind at the dragged box, and a click creates the default size. The field is selected with its properties popover open, and Delete, nudge keys, duplicate, snapping and undo work as for other objects.
- **AC-250 (P1)** The Detect review pill shows the count, steps through proposals, and accepts or discards one or all. Accept all is one undo step. Cancel during the run stops it and leaves no proposals.
- **AC-251 (P1)** With the Tab order panel open, every field shows its number on the canvas, and dragging a chip in the list renumbers the badges at once.
- **AC-252 (P1)** Field shading, outlines, name tags, badges and proposal outlines never appear in the downloaded file (render diff of an untouched page area against the source).
