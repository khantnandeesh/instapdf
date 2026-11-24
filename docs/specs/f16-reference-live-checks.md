# F16 reference editor: live checks (2026-11-24)

The owner asked for the 12 gaps in §3 of `f16-reference-recording-inventory.md` to be checked directly in a real browser, step by step. This doc records what the reference editor did. Everything here is **behaviour only**: hard rule 1 still applies, so no copy, icons or styling from the reference go into our product. Short UI strings are quoted only so the evaluator can recognise the same state.

**Setup.** Chrome on macOS, the free tier and no account. Two fixtures were committed to this repo and loaded into the editor's file input from a pinned commit:

- `tests/parity/editor/report-form-3p.pdf`: 3 pages. Page 1 has Hindi and English report lines (Liberation Serif and a FreeSerif Devanagari subset). Page 2 is a flat form with underline blanks, two boxes and a signature line. Page 3 has an appendix line with "invoice" and a Hindi line.
- `tests/parity/editor/font-coverage-1p.pdf`: 1 page with a JetBrains Mono subset line, a font the reference does not bundle.

Only **one** paid task (Apply) was used, so the 3 per hour limit was respected. Screenshots are in `assets/f16-pdf-editor/live/`, and the full set is in the project files under `designs/sejda-editor-teardown/live/`.

## 1. Results per check

### 1. Edit existing text, Apply, the result page and the downloaded file
- Editing is **per line**. A click turns one line into an editable box that uses the same family.
- **Devanagari breaks when the line is clicked, before any typing.** The box is rebuilt from the font's ToUnicode in visual order (रािश instead of राशि, िकया instead of किया), and the subset font then shows missing-glyph boxes (`01b`).
- After typing, a tooltip says complex scripts (Arabic, Devanagari) are not supported (`01d`).
- In the **output file**, the Hindi line is placed glyph by glyph in the original subset, and the new glyphs come from a different sans font. The vowel signs come loose and the word spacing is lost (`01g`). This is a corrupted line, shipped with no warning.
- English lines are rewritten with a **fresh subset of the same family**, which we already require (AC-11d). Each edited line is added as its own content stream. The file grew from 31,975 to 44,706 bytes.
- **₹ silently switched to a sans font** (Inter) inside a serif line, with no dialog, because the bundled Liberation Serif has no ₹.
- Result page (`01f`): rename, Download with more formats, cloud save, share, print, a preview, a list of next tools, "back to editing" (edits survive), start over and delete files.

### 2. Font Replacement dialog
- The dialog appears only when the original font is **not** one the reference bundles (here JetBrains Mono) and the typed characters are missing from the subset (`02a`).
- It shows the subset name with its prefix (`CAAAAA+JetBrainsMono-Regular`), a preview of the typed text, and **33 replacement fonts in a fixed order**. The first one, an Arabic serif (Amiri), is preselected for a monospaced Latin line. The two monospaced choices (Courier New and Liberation Mono) are 6th and 16th.
- An "always use this choice" checkbox applies to the rest of the document. The buttons are Replace and Keep original.
- **Keep original** leaves the missing letters in a browser fallback serif, so one line mixes a mono font and a serif (`02b`).

### 3. Find & Replace
- Fields: Find and Replace. Options: Match case and Include links (on by default). Buttons: Find, Replace and Replace all.
- Find **highlights the whole line** and not the word (`03b`). It reports matches for the current page only ("Found 3 matches on page 1").
- Replace all changed all 5 matches across 3 pages. It ends with a message that the end of the document was reached, but **gives no total**.
- Tiny leftover marks stay under the edited lines (`03d`).

### 4. Forms: detect fields, field settings and tab order
- Detect fields **runs on the server**: the file is processed remotely for about 4 s behind an "analyzing" overlay.
- On page 2 it found 4 text fields and 2 checkboxes (`04b`). The **signature line became a plain text field**. Names are taken from the labels with a random suffix (for example `full_name_6e4i`).
- Field toolbar: border colour, background colour, alignment, font size, text colour, properties, duplicate and delete. The properties dialog (`04c`) has name, default value, options, multi-select, a comb with N boxes, max length and required.
- The tab order dialog (`04d`) groups chips by page and offers sort by rows, sort by columns, restore original and custom drag.

### 5. New Signature
- **Type**: the name is prefilled from earlier use, with 7 colours and 13 handwriting styles. A note says it is not legally binding.
- **Draw**: a pad with colour choice and clear.
- **Upload**: three variants, original plus two background-removal strengths, made in the browser (`05c`).
- **Camera**: asks for camera permission (not granted in this test) and tells the user to sign on white paper.
- Saved signatures persist in the browser.

### 6. Text highlight, underline and strike-out
- Text highlight snaps to words and **works on unedited English and Hindi lines**.
- On an **edited** line, dragging to underline **moved the whole edited line** instead and left ghost marks (`06c`). Markup and edited text fight over the same gesture.
- Strike-out works, with a small bar for colour, hide and delete.

### 7. Multi-page: side panel, insert page, rotate and attachments
- The thumbnails panel has a "1 / N" counter that **does not follow scrolling**. Clicking a thumbnail jumps to the page and closes the panel. **Dragging thumbnails does not reorder pages.**
- Insert page here adds a blank page at once.
- **A page that has edits cannot be rotated or zoomed.** Toasts say so (`07c`).
- Attachments: a dialog with "new attachment", the file uploads, then a "click where to place it, Esc to cancel" hint. A paperclip icon is placed, with download and delete (`07g`).

### 8. Reload with unsaved changes
- Leaving the page shows the browser's "Leave site?" warning.
- After a forced reload and opening the same file again, **no recovery prompt appeared**. The recovery store in IndexedDB exists but stays empty.
- The page config explains why: recovery is enabled, but **recovery autosaving is switched off** on the web version. In practice there is no recovery.

### 9. Keyboard
- Ctrl/Cmd+Z undoes annotations and shapes, but **not a moved text line**.
- **No redo** (Cmd+Shift+Z does nothing).
- **Delete and Backspace do not delete** a selected object.
- **Arrow keys do not nudge.**
- **Copy and paste do not duplicate** an object.
- The last used styles (fill, border) are kept in local storage and reused by the next shape.

### 10. Phone and narrow screens
The window could not be set to a phone size, so a 390 px same-origin frame was used (a 384 px viewport, mouse input rather than touch), plus a 500 px window.
- The viewport meta **turns off pinch zoom** (`maximum-scale=1, user-scalable=0`). This is an accessibility failure.
- Below 996 px the tool labels hide, so the bar is icons only. The bar is still about 600 px wide, so **the document scrolls sideways** and tools fall off the right edge (`10b`, `10c`). The side-panel buttons wrap under the bar.
- There is no phone layout: no bottom bar and no overflow menu. A config flag only makes pages wide on small screens.

### 11. Limits and upgrade messages
These were read from the page without using up tasks:
- 3 tasks per hour ("free limit of 3 tasks per hour… upgrade… or break for…").
- 200 pages or 50 MB per document (landing copy).
- Smaller per-tool caps exist in the page: 30 files per hour, 5 MB per image, 50 pages, one file per task, 20 pages per conversion, 10 pages per OCR task, 20 links per task, 5 files per rename and 1 workflow.
- Results are kept for a limited time. The shared "recent files" list on the landing page shows "expires in N mins".
- An upgrade page is linked from every limit message.

## 2. Where we win (new from these checks)

1. **Devanagari is corrupted on click and in the output.** We read logical order, shape with HarfBuzz and never write a broken line (AC-74).
2. **Silent font switch for ₹ and missing glyphs.** We pick the closest font that covers the character and say so inline (AC-75).
3. **The replacement font list is unranked**, with an Arabic font preselected for a mono line. We rank by script, class and metrics (AC-75).
4. **Find highlights whole lines, and Replace all gives no total.** We highlight words, count across pages and show the total (AC-76).
5. **Detect fields uploads the file** and misses signature lines. Ours runs in the browser and makes signature fields (AC-77).
6. **Markup on edited lines moves the line.** Ours keeps markup and editing separate (AC-78).
7. **Pages with edits cannot be rotated or zoomed.** Ours always can (AC-79).
8. **No thumbnail reorder**, and the page counter does not track scrolling (AC-42, AC-80).
9. **No working recovery** (AC-45, AC-81).
10. **Weak keyboard**: no redo, no Delete, no nudge, no copy and paste, and undo misses text moves (AC-82).
11. **No phone layout**: sideways scroll, a cut-off toolbar and pinch zoom off (AC-48, AC-83).
12. **3 tasks per hour, 200 pages, 50 MB, and results that expire.** Ours is free with no task limit, works in the browser and keeps nothing on a server (AC-84).
