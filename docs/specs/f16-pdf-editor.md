# F16: PDF editor (beat the reference editor)

Status: steps 1 (Analyze) and 2 (Research) done; step 3 (Design) outline included, to be detailed by `ux-designer` before Build. **Proposed scope change:** the backlog previously limited F16 to "add text, images, whiteout, annotate (no editing of existing text)". This spec brings existing-text editing back in, phased, because research shows it is feasible fully in the browser with permissive libraries and it is the reference product's main draw. Owner approval of the scope change is needed before Build.

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

| Area | Reference behaviour | Our decision |
|---|---|---|
| Edit existing text | Text tool: click a line, it becomes a `contenteditable` box for **that line only**. Floating bar: bold, italic, size, font family, colour, link, move, duplicate, delete. Edit is replayed on the server. | Match, then exceed: paragraph mode (§5, phase E3). |
| Font list | ~45 bundled open fonts, each labelled with the proprietary font it stands in for (e.g. Carlito for Calibri). "More fonts" says local fonts need the desktop app. | Match with our own self-hosted OFL set and copy. Local fonts via the Local Font Access API where the browser supports it (improvement). |
| Missing glyphs | "Font Replacement" dialog: original font lacks typed characters; choose a replacement; "Always use"; Keep original. Status "Original font replaced…" | Match, but automatic with a clear inline notice and a one-tap override. |
| Add text | Click empty page area; default Helvetica 10 pt black. | Match; default size follows nearby text. |
| Find & Replace | Dialog with match case, include links, Find, Replace, Replace all. | Match; replace preserves font when glyphs exist. |
| Links | Area select → URL, email, phone, internal page; edit and delete existing links. | Match. |
| Forms: fill | Click a field and type; light-blue shade on fields (not saved). | Match. |
| Forms: create | Text, multiline, dropdown, radio, checkbox, signature box; field name (duplicate warning), value, options, multiselect, comb ("divide into boxes"), max length, required, repeat on all pages; "Detect fields"; form edit mode; tab order (rows, columns, custom drag). | Match. |
| Publish to fill & sign | Saves to the user's Google Drive and shares a public link. | **Skip** (needs storage/accounts; privacy conflict). |
| Images | New image (move, resize, rotate), delete existing image, new stamp (subject, author, date styles, colour). | Match. |
| Sign | Type (≈13 handwriting styles, 7 colours), draw, upload image (original / two transparent variants), camera; saved signatures in browser storage. | Match; signatures stay in IndexedDB on device. |
| Whiteout | Area select draws a white rectangle. Warning: hides but does not remove content; not for redaction. | Match, plus a **true Redact** tool (phase E4). |
| Annotate | Text strike-out, highlight, underline (colour swatches); freehand highlight and draw; show/hide annotations. | Match. |
| Shapes | Ellipse, rectangle, line, arrow; border and fill colour. | Match. |
| Page ops in editor | Per page: delete, zoom in/out, rotate left/right; "Insert page here"; thumbnails panel. | Match, plus duplicate and reorder by drag. |
| Attachments | Add, update, delete file attachments. | Match (P2). |
| Undo | Single Undo button; "Undo changes" list with "Revert selected". | Exceed: Ctrl/Cmd+Z / Shift+Z, unlimited history. |
| Recovery | "Recover unsaved changes" prompt for a previously edited file. | Match, local only. |
| Save | "Apply changes" → result page (download, cloud save, share, continue in other tool, back to editing, delete files). | Download directly from the editor, no round trip; keep editing after download. |

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

### 2d. Competitors (summary; details in the research file)

Sejda, iLovePDF, Smallpdf, PDF24 and Adobe online all upload to a server. Smallpdf and Adobe keep existing-text editing behind Pro; PDF24 has none; PDFgear online has none (desktop only). Only Apryse WebViewer (commercial SDK, powers Xodo) edits paragraphs in the browser. **No free, browser-only product edits existing text with font matching and form creation.** That is the gap.

## 3. Architecture recommendation

All client-side. No server, no new GCP spend.

| Layer | Choice | Licence | Why |
|---|---|---|---|
| Edit engine | **PDFium compiled to WASM** (`@embedpdf/pdfium`, or our own build of PDFium if that fork's source is not public) in a Web Worker | BSD-3 style + MIT wrapper | Exposes page objects: read text objects and their fonts, `FPDFText_SetText`, remove/insert objects, `FPDFPage_GenerateContent`, form fields, and redaction primitives. It rewrites content streams for us, so we never hand-parse `TJ`. |
| Renderer | PDFium in the same worker (one engine for what you see and what you save), pdf.js kept for the existing thumbnail grid | Apache-2.0 | Avoids glyph-position mismatch between display and output. |
| Overlay UI | DOM/SVG layer per page (no canvas framework) | – | Accessible, crisp, simple hit-testing, animatable with CSS. |
| Document model | Operation log (command pattern) applied to an in-worker PDFium document; persisted to IndexedDB | – | Undo/redo, autosave, crash recovery, no upload. |
| Forms, links, attachments, page ops | `@cantoo/pdf-lib` where simpler than PDFium | MIT | Already our writer; maintained fork. |
| Fonts | fontkit (inspect embedded fonts, cmap coverage), harfbuzzjs (shaping + subsetting), self-hosted OFL set (Liberation, Carlito, Caladea, Noto incl. Devanagari, Amiri) | MIT / OFL | Font matching and complex scripts. |
| Final pass | qpdf-WASM (object streams, compression, structural check) | Apache-2.0 | Small, valid output. |
| OCR (scan → editable) | tesseract.js, small jobs only | Apache-2.0 | Phase E4. |

Feasibility verdicts:
- **Edit existing text (line/run level): feasible** with PDFium. Reuse the embedded font when it covers every new glyph (visually identical); otherwise switch the run to the matched OFL font, subset it, embed as CID/Identity-H with ToUnicode, and show a notice. Type3 or no-ToUnicode text is read-only with a whiteout-and-retype fallback.
- **Paragraph editing with reflow: feasible inside the paragraph's own box.** Build paragraph detection (baseline, leading, alignment, font) and re-break lines with harfbuzz advances; the box grows downward; we never move other page content in v1. Opt-in per edit, like a "reflow" toggle.
- **Font matching: feasible.** Strip subset prefix, read FontDescriptor flags and name; map to metric-compatible OFL families; fall back by serif/sans/mono flags.
- **Forms: fill and create feasible.** XFA: render via pdf.js and fill where an AcroForm fallback exists; pure XFA is read-only with a notice.
- **Complex scripts: feasible for new text** (harfbuzz shaping). Existing Devanagari/Arabic runs: replace the whole run with a newly shaped run. This beats the reference, which refuses.
- **True redaction: feasible** with PDFium redaction APIs, verified by tests (no text in extraction or raw streams; images cut; full rewrite).

Risks: PDFium WASM is ~4.6 MB (lazy-load on editor open, brotli, cache in a service worker; first paint uses pdf.js so the page appears at once); the EmbedPDF PDFium fork's source availability must be confirmed before adoption (fallback: build PDFium ourselves); memory on phones (render one page window at a time).

CSP: the editor route keeps `connect-src 'self'` and loads fonts/WASM from our own origin only.

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
- **AC-5 (P1)** `big-300p.pdf` (300 pages) opens and can be edited and downloaded without a page-limit message.

### Open and view
- **AC-6 (P0)** Opening `para-times.pdf` shows page 1 rendered within 1.5 s on the CI desktop profile (Lighthouse-style throttling off).
- **AC-7 (P1)** Zoom in/out (buttons, Ctrl+wheel, pinch) works and edits stay aligned to the page at 50%, 100%, 200% and with browser zoom at 125% (the reference breaks at browser zoom ≠ 100%).
- **AC-8 (P1)** Thumbnail panel shows every page and clicking one scrolls to it.

### Existing text (phase E2, E3)
- **AC-9 (P0)** In `para-times.pdf`, clicking line 2 with the Text tool makes it editable; changing "page" to "sheet" and downloading gives a PDF whose extracted text contains "sheet" and not the old line's "page", and the old line's glyphs are not drawn (render diff of that line area vs expected).
- **AC-10 (P0)** The edited text keeps font family, size and colour when the embedded font covers all glyphs (`subset-carlito.pdf`: change "thirty" to "tithe" → output font for that run is the original embedded font object).
- **AC-11 (P0)** Typing a character missing from a subset font (e.g. "Q" when absent) switches the run to the matched open font (Carlito for Calibri/Carlito) and shows an inline notice naming both fonts; the output renders the character.
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
- **AC-25 (P0)** Whiteout: dragging an area draws a white rectangle in the output; a warning says it hides but does not remove content.
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
- **AC-38 (P2)** (improvement) "Detect fields" proposes fields on underscore lines and boxes; the user accepts or rejects each.
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
| **E1 Editor core** | Editor shell, PDFium worker + lazy load, overlay model, op log, undo/redo, autosave/recovery, add text, image, whiteout, shapes, annotate, sign (type/draw/upload), page ops, download, mobile toolbar | 1–8, 23–27, 31–32, 41, 43–46, 48–52 | WASM size and two-engine alignment | L |
| **E2 Edit existing text (line)** | Line edit via PDFium text objects, font reuse + coverage check, OFL substitution + notice, style changes, move/delete, find & replace, scan/Type3 fallbacks | 9–13, 17–19 | Subset fonts, odd encodings | L |
| **E3 Paragraphs, links, forms** | Paragraph detection + reflow inside box, toggle; links; form fill + create, tab order, repeat on pages, rotated pages, XFA banner, detect fields, stamps, attachments | 14–16, 28–30, 34–40, 42 | Paragraph detection quality across real files | L |
| **E4 Beyond parity** | True redaction, Devanagari/Arabic shaping (new + replace run), OCR scan-to-editable (tesseract.js, small docs), camera signature, local fonts | 20–22, 33, 47 | Shaping correctness, redaction completeness | M–L |

Parity with the reference is reached at the end of E3; E1 alone already beats it on privacy, limits, speed and mobile for the most common jobs (fill, sign, add text, whiteout, annotate).

Prerequisites: Q2 real-world corpus should include the editor fixtures above plus a sample of real PDFs (Word, Google Docs, LaTeX, InDesign, scanned) for the "zero crashes" gate.

## 13. Decisions for the owner

1. Approve bringing existing-text editing back into F16 (E2/E3), against the earlier backlog note that excluded it.
2. Approve PDFium-WASM as the edit engine (adds ~4.6 MB lazy-loaded WASM; BSD-style licence), subject to confirming source availability of the chosen build.
3. Where F16 sits in the backlog: recommended right after F4/F5 (page-list model is reused) and before server tools, because it is browser-only and the highest-value tool.
