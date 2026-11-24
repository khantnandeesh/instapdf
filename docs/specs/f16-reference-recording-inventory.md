# F16 reference editor: screen-recording inventory (2026-11-24)

Source: a 3 min 54 s screen recording of the reference editor that the owner made on 2026-11-24, using a Hindi/English report PDF (DevanagariMT, TimesNewRomanPSMT and LMRoman fonts). Frames were taken every 2 s. Key frames are in `assets/f16-pdf-editor/recording/`, and the full set is in the project files under `designs/sejda-editor-teardown/`.

This doc records **behaviour only**. Hard rule 1 still applies: no copy, icons or styling from the reference go into our product. The **Spec** column says whether `f16-pdf-editor.md` already covered the item before this recording: **new**, **detail** (the area was covered, but this micro behaviour was not) or **covered**. The **Our answer** column links to the AC that now holds it.

## 1. Inventory

| Time | Area | What the reference does | Spec | Our answer |
|---|---|---|---|---|
| 0:00 | Landing | Upload button with a source menu, plus "or start with a blank document". | covered | §4 Start blank |
| 0:00 | Landing | A **recent files** panel shared by all tools, which lists earlier task results with an expiry time ("expires in 28 mins"). | new | AC-53, device-only recents |
| 0:08–0:16 | Open | Page 1 renders right away **while the upload is still running**: a thin progress bar at the top and an "uploading" badge. | detail | We have no upload; AC-6 already requires a fast first render |
| 0:16 | Toolbar | The main toolbar **sticks to the top** when the page scrolls. | detail | AC-54 |
| 0:16 | Page bar | Above each page: page number, delete, **per-page zoom in/out**, rotate left/right and "Insert page here". A side-panel button opens thumbnails. | detail | AC-41, AC-55 |
| 0:20 | Tooltips | Every tool has a one-line tooltip that says how to use it ("Add links by making an area selection on the page"). The Text tool's tooltip says it adds text and changes existing text. | detail | AC-56 |
| 0:22 | Text menu | A caret next to Text opens a menu that holds Find & Replace. | covered | AC-17 |
| 0:24–0:30 | New text | Clicking empty space adds a box with the placeholder "Type your text" **already selected**, so typing replaces it. The default style is bold italic sans. | detail | AC-57 |
| 0:26 | Text bar | Floating bar: bold, italic, size (a number field with steppers plus presets from 8 to 36), font, colour, link, move handle, duplicate, delete. | detail | AC-12, AC-58 |
| 0:32–0:36 | Fonts | "More fonts…" at the top, then about 45 open fonts, each shown with the proprietary font it stands in for in grey (for example Carlito for Calibri). | covered | §2a |
| 0:38 | Fonts | A second section lists **the document's own embedded fonts**, each with a ⚠ icon (they are subsets, so glyphs may be missing). Duplicates are shown twice (DevanagariMT ×2, TimesNewRomanPSMT ×2). | **new** | AC-59, deduplicated, with glyph coverage shown |
| 0:42 | Colour | Palette grid (about 10×7), a hex field, an **eyedropper**, and a "no colour" swatch. | **new** | AC-60 |
| 0:44–1:06 | Link on text | The link button on a text box opens Link properties: external URL (prefilled `https://example.com`), email, phone, internal page (number), Delete link, Close. Hovering the linked box shows "Link to https://example.com". | detail | AC-28, AC-61 |
| 1:06–1:10 | Selection | Clicking another object moves the selection to it. Link areas show a light-blue fill in the editor only. | covered | – |
| 1:16–1:20 | Move | The move handle's tooltip says to drag text with the mouse. Dragging works on the whole box. | covered | AC-13 |
| 1:20–1:22 | Duplicate | Duplicate puts a copy just below the original and selects it. | **new** | AC-58 |
| 1:28–1:48 | Link areas | The Links tool: drag an area, and the Link properties popover opens. The URL field **takes anything**: "youtube.com" without a scheme is saved as is, and so is "youtube.comkhhjbhjhbj". | detail | AC-61: validate and normalise |
| 1:50 | Forms menu | Three groups. **Add text and symbols**: text, ✗, ✓, ● (for flat forms). **Add new form fields**: Text (tooltip "single line"), Text multiline, Drop-down list, Radio button, Checkbox, Signature box, Detect fields. **Change existing**: Form edit mode (a toggle), Change tab order. **Share**: Publish for others to fill & sign. | detail | AC-62 (symbols); AC-35–38 |
| 1:56 | Forms | A toast reads "Form fields now in edit mode". New fields are drawn by **dragging a rectangle**. | detail | AC-35 |
| 2:00 | Signature field | A blocking modal warns that most browser PDF viewers don't show signature boxes. | **new** | AC-63: give the field a visible appearance so no warning is needed |
| 2:06 | Snapping | While a field is dragged, dashed **alignment guides** run across the page from the edges of other objects. | **new** | AC-64 |
| 2:08 | Field bar | Floating bar on a field: field settings, border and background colour, text alignment, font size, text colour and font, field style, duplicate, delete. A multiline field shows "Text" on three lines. | detail | AC-35 |
| 2:14 | Dropdown | A dropdown field shows "Option 1" by default. | detail | AC-35 |
| 2:18 | Info modal | A blocking first-time modal explains why fields are shaded blue: the shade is not saved. | detail | AC-65: inline hint instead |
| 2:24 | Detect fields | Error modal: "Page 1 already has form fields, so detection was skipped… remove the existing fields first". Detection runs **only on the page in view**. | **new** | AC-38 extended: all pages, merge with existing |
| 2:36 | Images menu | **Recently used images** (thumbnail) at the top, then New Image, Delete existing image, New Stamp. | **new** | AC-66 |
| 2:38–2:40 | Image | The image is placed by click and shows a **ghost that follows the cursor** first. Its bar: rotate, a layer/opacity menu, delete. | detail | AC-24, AC-67 |
| 2:44–2:48 | Stamp | Create stamp: Subject, Author, Date and time (a format menu), 7 colours, live preview, Save. | covered | AC-29 |
| 2:50 | Stamp | After Save, a ghost of the stamp follows the cursor until the user clicks to place it. | **new** | AC-67 |
| 2:54–2:58 | Sign | The Sign menu shows the **saved signature** and New Signature. A click places it; its bar: rotate, layer menu, delete. | covered | AC-31, AC-32 |
| 3:00 | Whiteout | The tooltip says "Press ESC to cancel". The user drags an area. | detail | AC-68 |
| 3:04–3:14 | Whiteout | The whiteout is really a rectangle: border width, **border colour and fill colour can be changed** (it turned yellow with a green border), duplicate, delete. Several whiteouts can overlap. | **new** | AC-25 extended |
| 3:08 | Layering | Form fields always draw above whiteout and shapes; there is no "bring forward" or "send back". | **new** | AC-69: z-order controls |
| 3:18 | Annotate | Menu: **Show annotations** toggle. Text: strike-out (3 colours), highlight (5 colours), underline (5 colours). Freehand: highlight and draw (5 colours each, black included). | detail | AC-27, AC-70 |
| 3:22 | Annotate | A tooltip on text highlight says that if it doesn't work, use the freehand highlight. This is an admission that text highlight fails on some files. | **new** (weak spot) | AC-71 |
| 3:28–3:32 | Draw | Draw mode: the tooltip says "Press ESC to exit draw mode". The stroke is smooth. | detail | AC-68 |
| 3:34–3:42 | Shapes | Menu: Ellipse, Rectangle, Line, Arrow. **A single click places a default-size shape**, and a drag sets the size. Bar: border width, border colour, fill colour, duplicate, delete. | detail | AC-26, AC-72 |
| 3:44–3:46 | Undo list | Undo changes dialog: one row per change with an icon, type, **time (hh:mm:ss)** and page, a checkbox per row, and Revert selected. | covered | AC-43, AC-73 |
| 3:50 | Undo | The Undo button has a tooltip. Undo is one step per click. | covered | AC-43 |

## 2. Weak spots seen in the recording (where we win)

1. **Blocking modals for information.** The signature box warning, the blue-shading explanation and the detect-fields error all block the page. We use inline hints and toasts (AC-63, AC-65).
2. **No link validation.** Any string is saved as a URL. We normalise the scheme and flag invalid input (AC-61).
3. **Embedded fonts are listed twice and only with a warning icon.** We deduplicate and show glyph coverage for the text in the box (AC-59).
4. **Detect fields works on one page and refuses pages that already have fields.** We detect on all pages and skip only the duplicates (AC-38).
5. **No z-order.** Form fields always sit above shapes and whiteout. We add bring forward and send back (AC-69).
6. **Text highlight fails on some files.** The tooltip itself points to the freehand fallback. Ours must work on every corpus file that has a text layer (AC-71).
7. **Whiteout is only a coloured rectangle.** It hides content but does not remove it. We match the rectangle and add true Redact (AC-47).

## 3. Not in this recording (ask the owner to record)

All of these were checked live on 2026-11-24, except item 6 (New Image upload): see `f16-reference-live-checks.md` and AC-74 to AC-84. The original list:

1. Editing **existing** text: a Hindi line and an English line, a change of font and size, then **Apply changes**, the result page and the downloaded file opened in another viewer.
2. The **Font Replacement** dialog: type a character the subset lacks (for example ₹ or a capital letter not used in the line).
3. The **Find & Replace** dialog, end to end.
4. The **field settings** dialog for each field type (name, required, options, comb, max length, radio groups), the **Change tab order** dialog and **Detect fields** on a page with blank lines and boxes.
5. **New Signature**: every tab (type, draw, upload, camera).
6. **New Image** upload, plus the image bar's layer/opacity menu opened.
7. A real **text** highlight, underline and strike-out on selected words, plus the Show annotations toggle.
8. The **thumbnails/side panel**, attachments, Insert page here, per-page zoom and rotate on a multi-page file.
9. **Reload with unsaved changes** (the recover prompt).
10. **Keyboard**: Ctrl/Cmd+Z, Delete, arrow-key nudge, copy and paste of an object.
11. **Phone**: the same file on a phone browser.
12. **Limits**: the message after the 3rd task in an hour, a file over 50 MB or 200 pages, and any upgrade prompt.
