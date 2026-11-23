# F3: Merge (files view + pages view, reorder, options)

Status: step 1 (Analyze) done. Next: Research.
Reference observed: `merge-pdf` on the live reference site, 2026-11-23, desktop 1280×900 and mobile 375 px. We uploaded synthetic fixtures only (two small PDFs, one PNG, and one more PDF through the page picker) and did **not** run a merge, so the result screen and the contents of the merged file are not observed. Anything about the output that we could not see is marked *unverified* and is our decision; the evaluator should confirm it on its first real Merge task.
Internal screenshots: `docs/specs/assets/f3-merge/` (reference only, never ship). Index in §9.

Our route: **`/merge-pdf`** (registry slug `merge-pdf`, `ref` `merge-pdf`, category Organize pages, `runtime: "client"`). The tool runs entirely in the browser (pdf-lib for writing, pdf.js for thumbnails), so nothing is uploaded (CLAUDE.md rule 4).

## 0. What Merge reuses from F1 and F2

Merge is built **on** the shared flow (`docs/specs/f1-shared-flow.md`), not beside it: `ToolFlow`, `FilePicker`, `DropOverlay`, `NoticeStack`, `PasswordDialog`, `PageGrid` / `PageTile`, `FileGrid` / `FileCard`, `ControlDock`, `ProcessingBar`, `ResultCard`, the intake validation and the leave guard. Merge adds:

1. a **reorderable** `FileGrid` (F1 left the `reorderable` prop unimplemented for F3),
2. a page **editing** layer on `PageGrid` (select, move, duplicate, remove, insert blank pages, insert pages from another file),
3. its own options panel (`optionsDensity: "full"`) and a `process()` that builds one PDF.

Registry changes (in `apps/web/src/tools/registry.ts`, builder owns the exact shape):

| Field | Value for Merge | Why |
|---|---|---|
| `status` | `beta` | Usable once this feature passes. The F2 catalogue, Popular row, header shortcuts and Recent list pick it up from the registry with no extra code. |
| `accept` | PDF plus images: `.pdf .jpg .jpeg .png .gif .bmp .webp .tif .tiff` and the matching MIME types | Same set as the reference's file input (observed `accept` list). |
| `maxFiles` | **50** (override of F1's 20) | Merging many files is the main use. Memory is bounded by the page and byte caps, which stay at F1 values. |
| `maxFileBytes` / `maxTotalBytes` / `maxTotalPages` | 100 MB / 500 MB / 1,000 (F1 defaults) | Unchanged. |
| `defaultView` | `files` | The reference opens Merge in the files view. |
| `requiredPermissions` | none | The reference loads an owner-restricted file into Merge without a prompt (F1 screenshot 22). |
| `actionLabel` / `progressLabel` | our own wording, e.g. "Merge PDFs" / "Merging" | |
| `optionsDensity` | `full` | Options panel is long (bottom sheet below 1024 px, per F1 U-4). |
| `outputName` | always one PDF, see §6 | Never a ZIP. |

Consequences for F2 (must ship in the same PR):

- `/merge-pdf` stops being a coming-soon page. F2 tests that use `/merge-pdf` as the example planned tool (F2 AC-23, AC-42, AC-43, AC-48) must switch to another planned slug (for example `/split-pdf`). F2's "reads counts from the registry" rule keeps the other F2 tests valid.
- Merge gains the Beta badge on its card and menu entry, appears in the header shortcuts (popular order), and is recorded in Recent when visited (F2 `RecordVisit`).

### 0a. Inherited shared ACs

These F1 ACs are **not** re-specified here. QA runs them again on `/merge-pdf` (fixtures from F1 §7 unless noted), and the evaluator scores them as part of F3.

| F1 AC | How it applies to Merge |
|---|---|
| AC-3, AC-4, AC-6, AC-8, AC-10, AC-11 | As written (drop, drop overlay, loading indicator, add more files appends, thumbnail slider, sources slot). |
| AC-5 | As written, and with every Merge option switched on (TOC, footer, double-sided, same size, flatten) plus an image input. No request body over 10 KB. |
| AC-12 to AC-17 | As written. The wrong-type message names the accepted kinds (PDF and images). |
| AC-18 | **Adapted:** 51 copies of `three-pages.pdf` load 50 and show a message giving the 50-file cap. |
| AC-19 | As written. |
| AC-20 to AC-27, AC-29 | As written (password prompts, skip, apply-to-all, "not password-protected" note). |
| AC-28 | **Adapted:** `owner-restricted.pdf` + `alpha.pdf` load with no prompt; merging gives a 6-page PDF that opens without a password. |
| AC-38, AC-39, AC-44, AC-45, AC-46, AC-47, AC-48, AC-51 | As written. "Back to options" (AC-45) must also keep page edits (§3c) and options. |
| AC-41 | **Adapted:** the download is the Merge output name from §6, a valid PDF. |
| AC-43 | **Adapted:** the result screen offers Rotate (and Merge itself); choosing Rotate opens it ready with the merged file loaded. |
| AC-52 to AC-57 | As written, in the pages view (lazy thumbnails, result preview, paste, share, privacy note). |
| AC-1, AC-2, AC-7, AC-9, AC-49, AC-50 | Replaced by Merge ACs below (AC-1, AC-2, AC-15, AC-17, AC-74, AC-75). |
| AC-30 to AC-37, AC-40, AC-42 | Not applicable (Rotate options, Rotate size bound, ZIP output). Per-page and per-file rotation in Merge are covered below. |

## 1. Purpose

Merge turns several documents into one. The visitor adds PDFs and pictures, puts them in the right order (by dragging, by keyboard, or by sorting on the name or date), and can go down to page level to pick, move, copy, turn or drop single pages, slip in blank pages, or pull just a few pages out of another file. A small set of options decides how the joined document is put together: what happens to existing bookmarks, whether a clickable contents page is added at the front, whether each page is stamped with the name of the file it came from, whether every file is padded so it starts on a right-hand page when printed on both sides, whether pages of different sizes are scaled to one width, and what happens to form fields. The result is always a single PDF, made on the visitor's device.

## 2. Inputs

| Aspect | Reference behavior (observed) | InstaPDF F3 decision |
|---|---|---|
| Local picker | Primary button, `multiple`, `accept` = PDF + PNG, GIF, JPG/JPEG, TIF/TIFF, BMP, WebP. Each file is uploaded right away. | Same accepted set, `multiple`. Nothing is uploaded. |
| Drag and drop | Whole page is a drop target. | F1 behavior (AC-3). Dropping onto the grid while it is in the ready state appends to the end, unless the drop lands on an insert point (§3c), then the files go there. |
| Initial order | The first batch is **sorted by file name** (natural, case-insensitive: `file2` before `file10`) as the thumbnails arrive; files added later are appended (observed in the page script and in screenshot 02: picked as alpha, bravo, charlie and shown in that order). | Same: every file of the **first** intake is placed in natural, case-insensitive name order. Later intakes are appended at the end (or at the chosen insert point), in their own natural name order. |
| Images | Accepted. Each image becomes one page (observed: a PNG shows as a one-page card on a portrait page with the picture centered). Free tier: 5 MB per image. | Each image becomes one page (§6). JPEG and PNG are embedded as is; GIF (first frame), BMP and WebP are decoded by the browser and embedded as PNG; TIFF is decoded with a permissively licensed decoder (for example UTIF.js, MIT; check before adding), one page per TIFF frame. Images obey the 100 MB per-file cap plus a **50-megapixel** decode cap per image (memory). |
| Multi-file | By design. Free tier: 50 pages / 50 MB per task, 3 tasks and 30 files per hour. | Up to 50 files, 1,000 pages and 500 MB per task. No hourly cap. |
| One file only | Not tested on the reference (we did not run tasks). | Allowed: the primary action is enabled with 1 file (options such as the footer or TOC still make sense). The status line says that more files can be added. |
| Cloud sources and URL | Dropbox, Google Drive, OneDrive in the Add-files and Add-pages menus. | Deferred (F1 D-5). |
| Encrypted, user password | F1 password modal. | F1 behavior (inherited AC-20 to AC-27). |
| Encrypted, owner-only | Loads without a prompt. | Same (no `requiredPermissions`). Output is not encrypted. |

## 3. Options and controls

### 3a. Workspace toolbar (both views)

| Control | Type | Default | Allowed values | Effect |
|---|---|---|---|---|
| View toggle | 2-way segmented control | **Files** | Files · Pages | Switches the workspace between file cards and page tiles. On Merge it is shown as soon as **one** file is loaded (F1 hides it for one file), because the pages view is where blank pages and extra pages are added. |
| Add files | split button with menu | – | Local files (cloud entries hidden, F1 D-5) | Appends whole files (all pages). |
| Add pages | split button with menu | – | From a file (opens the picker, one file at a time) · Blank page | "From a file" opens the page picker (§3d). "Blank page" inserts one blank page (§3c). |
| Sort | menu button | – | Name A–Z · Name Z–A · Last modified, oldest first · Last modified, newest first | Files view: reorders file cards. Pages view: stable-sorts pages by their source file's name or date, keeping page order inside each file. Name sort is natural and case-insensitive (reference uses natural sort on the lower-cased name). Date sort uses the `File.lastModified` of each source. Blank pages the user inserted travel with the page in front of them. |
| Thumbnail size | slider | F1 default | F1 range | F1 AC-10. |

Reference note: the reference's sort lives in a "Reorder" menu with exactly these four entries, and it works in both views (in the pages view it sorts pages by file name).

### 3b. Files view

One card per **segment**: a run of consecutive pages that come from the same source file (§3e). Before any page editing there is exactly one card per file.

| Control | Type | Effect |
|---|---|---|
| File card | first-page thumbnail, file name (full name in a tooltip), page count, and the source letter badge (A, B, C… as used in the pages view) | When a file is split into several segments the card also shows which pages it holds, for example "pages 2–3". |
| Drag to reorder | pointer drag (mouse and touch) | Moves the card (all its pages) to the drop position. Reference: drag works (screenshot 23). |
| Move earlier / Move later | two icon buttons in the card's action bar; disabled at the ends | Keyboard and touch alternative to drag (our addition: the reference cards are not focusable). |
| Keyboard reorder | with a card focused: Alt+Arrow Left/Up = earlier, Alt+Arrow Right/Down = later, Alt+Home / Alt+End = first / last | Focus stays on the moved card; the live region announces the new position ("bravo.pdf moved to position 1 of 3"). |
| Rotate left / right | icon buttons on the card | Adds −90° / +90° to every page of that segment. Reference has the same two buttons on file cards. |
| Enlarge | icon button | F1 `PagePreviewDialog` on the segment's pages, with previous / next. |
| Remove | icon button | Removes the segment's pages. Removing the last segment returns to the empty state. |

Reference has no page count on file cards (only the name without extension); we show the full name and the page count (F1 `FileCard`).

### 3c. Pages view

Every page of every segment, in output order, as one grid. Tiles are labeled with the source letter plus the page number in that source (A1, A2, B1…), and the tooltip / accessible name gives the file name ("Page 1 of alpha.pdf"). This labeling matches the reference (screenshot 06). Inserted blank pages have no number and the accessible name "Blank page".

| Control | Type | Default | Effect |
|---|---|---|---|
| Select | click a tile | none selected | Selects only that tile. Ctrl/Cmd+click toggles a tile; Shift+click selects the range from the last clicked tile. Keyboard: Space toggles the focused tile, Shift+Space extends the range. Reference: same mouse model (screenshots 08, 09). |
| Clear selection | button, shown when ≥ 1 page is selected, with the count ("3 selected") | – | Deselects all. Escape does the same when focus is in the grid. |
| Drag to reorder | pointer drag of a tile | – | Moves the tile; if the dragged tile is selected, **all selected tiles move together** and keep their relative order (reference uses a multi-sort plugin for this). |
| Keyboard move | Alt+Arrow keys / Alt+Home / Alt+End on the focused tile (moves the whole selection if the tile is selected) | – | Same as drag. Announced in the live region. |
| Move to position | per-page action → small dialog with a number field "1…N" and a confirm button | – | Moves the page (or the selection) so it starts at that position. An out-of-range or non-numeric value shows an inline error and keeps the dialog open; nothing moves (reference: field turns red and the dialog stays, screenshot 13). |
| Rotate left / right | per-page actions | 0 | −90° / +90° on that page, cumulative (as in Rotate). If the page is selected, applies to the whole selection (our addition). |
| Duplicate | per-page action | – | Inserts a copy right after the page (the copy has the same rotation). Reference: same (screenshot 11). |
| Remove | per-page action; also Delete/Backspace on the focused tile | – | Removes the page. If **other** pages are also selected, a confirm dialog asks whether to remove only this page or all selected pages (reference asks the same yes/no question, screenshot 09; its "No" removes just the clicked page). |
| Insert point | a small "+" button between every two tiles and at both ends (focusable, accessible name "Insert here, after A3") | – | Opens a menu: Add files here · Add pages here (picker) · Blank page here. Reference: same three choices (screenshots 14, 15). |
| Blank page (toolbar) | Add pages → Blank page | – | Inserts one blank page **after the last selected page**, or at the end when nothing is selected. (Reference: after the last selected page, or before the first page when nothing is selected; we prefer the end.) |
| Blank page size | – | – | Same size and orientation as the page in front of it (the page after it when inserted at the very start). Reference clones the neighbouring tile. |

### 3d. Page picker ("add pages from another file")

Reference: "Add pages" opens a single-file picker; the chosen file shows in a dialog of page tiles labeled with a new letter (D1, D2, D3); click / Shift / Ctrl select; one confirm button adds the selected pages; the view switches to pages view (screenshots 19–21).

Ours, same behavior:

- One file per pick (PDF or image). It goes through normal intake (type, size, password prompt).
- The dialog lists its pages with the same selection model as §3c, plus "Select all" and "Select none".
- The confirm button shows the count ("Add 2 pages") and is **disabled with nothing selected** (reference leaves it enabled). Cancel / Escape adds nothing and drops the file.
- The selected pages are inserted at the chosen insert point, or at the end when the picker was opened from the toolbar. They get the next free source letter. The workspace switches to the pages view and the inserted tiles are briefly highlighted.
- The picked file counts toward the file, byte and page caps only for the pages actually kept.

### 3e. One model, two views (deliberate difference from the reference)

Observed on the reference: the files view and the pages view keep **separate** lists, the task runs from whichever view is active, and the options panel ("More options") is **hidden in the pages view** (screenshot 26; the page script hides it on switch). Page edits are invisible in the files view (screenshot 17), and pages added through the picker show up there as extra whole-file cards (screenshot 24). After sorting files Z–A, the pages view still showed the old file order (screenshots 05, 06).

InstaPDF keeps **one ordered page list**. Both views render it:

- The pages view shows it page by page.
- The files view groups it into **segments**: maximal runs of consecutive pages from the same source. A blank page the user inserted belongs to the segment in front of it (or the one after it at the very start).
- Moving or removing a card moves or removes exactly that segment's pages.
- Switching views never changes the page list, and running from either view gives the **same** output.
- The options panel is available in both views.

When nothing has been edited at page level, segments are exactly the files and the behavior equals the reference's files view.

### 3f. Merge options (options panel)

All options are remembered on this device (`localStorage["instapdf:merge-options"]`) and restored on the next visit. The reference does the same per option (`settings.merge-pdf.*` keys observed). Labels below are our own.

| Control | Type | Default | Allowed values | What it does to the output | Reference |
|---|---|---|---|---|---|
| **Pad for double-sided printing** | checkbox | off | on / off | After every **segment** with an odd page count, add one blank page, the same size as that segment's last page. Also applies to the TOC section (§ below) so that every file starts on an odd (right-hand) page. The last segment is padded too. | Checkbox; its tooltip says a blank page goes after each document with an odd page count. |
| **Make all pages the same width** | checkbox | off | on / off | Every page is scaled (aspect ratio kept) so its displayed width equals the displayed width of the **first output page**. "Displayed" takes `/Rotate` into account. Content is scaled, not cropped. | Checkbox; tooltip: same width, based on the first page. |
| **First file is a cover** | checkbox | off | on / off | Only changes TOC placement: the TOC goes **after** the first segment's pages instead of at the very start, and the cover is **not listed** in the TOC. With TOC off it has no effect (the control stays enabled, with a hint saying so). | Checkbox; tooltip: TOC goes after the first document. Whether the reference lists the cover in its TOC is *unverified*. |
| **Add file name to the footer** | checkbox | off | on / off | Each page that came from a source file gets that file's full name (with extension) written in its bottom margin, small (8–9 pt), dark grey, left-aligned, inside the visible page box, reading upright on rotated pages. Not added to inserted blank pages, padding pages or TOC pages. | Checkbox. Position and size *unverified*. |
| **Bookmarks** | 4-way segmented control | **Keep all** | Keep all · Remove all · One per file · One per file, keep existing inside | See "Bookmark modes" below. | Same four choices, same default (`retain`). |
| **Contents page (TOC)** | 3-way segmented control | **None** | None · File names · Document titles | Adds a generated contents page (or pages) listing every file (segment order, first appearance of each source) with the output page number where it starts and a clickable link to that page. "Document titles" uses each PDF's Info `/Title`, falling back to the file name when a file has none (images always use the file name). TOC page size = the first output page's size. Long lists continue on further TOC pages. The TOC pages count toward the output page numbers. | Same three choices, same default. Appearance *unverified*. |
| **Form fields** | 4-way segmented control | **Merge, rename duplicates** | Remove · Merge · Merge, rename duplicates · Flatten | See "Form field modes" below. | Same four choices, same default (`merge_renaming`). |

**Bookmark modes** (titles for per-file entries are the file name **without** its extension):

| Mode | Output outline |
|---|---|
| Keep all | Every source's existing bookmarks, in segment order, at their original nesting. |
| Remove all | No outline (`/Outlines` absent or with no items). |
| One per file | Existing bookmarks dropped. One top-level entry per source file, in order of first appearance, pointing to the first output page from that file. |
| One per file, keep existing inside | One top-level entry per source file as above, with that file's existing bookmarks nested under it. |

Bookmarks follow page edits: a bookmark points to wherever its target page ended up. If its target page was removed, the bookmark is dropped and its children move up one level. If the target page was duplicated, the bookmark points to the first copy. When a source appears in several segments its bookmarks are not repeated. Inserted blank pages, padding and TOC pages get no bookmarks.

**Form field modes:**

| Mode | Output |
|---|---|
| Remove | No form fields and no widget annotations. Filled values disappear (not flattened). |
| Merge | All fields of all files in one form. Fields with the same full name become **one** field with several widgets (they share one value, the first file's value). |
| Merge, rename duplicates | All fields in one form. A field whose name is already taken by an earlier file is renamed `<name>_2`, `<name>_3`… so every field keeps its own value. |
| Flatten | Each field's current appearance is drawn into the page; no fields or widgets remain. |

Fields on removed pages are dropped; duplicated pages get renamed copies of their fields in the rename and merge modes the same way as a second file would.

## 4. States

All F1 states apply (U-6). Merge-specific additions:

| State | What the user sees |
|---|---|
| **Empty** | F1 drop card. Our copy says PDFs **and images** are accepted and gives the Merge caps (50 files, 100 MB each, 500 MB and 1,000 pages in total). |
| **Loading / password** | F1. A file waiting for a password appears as a locked card in its sorted position. |
| **Ready, files view** (default) | Reorderable cards, toolbar (view toggle, Add files, Add pages, Sort), options in the dock, primary enabled. Status line: "{pages} pages · {files} files". |
| **Ready, pages view** | Page grid with insert points, selection count and Clear selection when anything is selected, same dock and options. |
| **Dragging** | Pointer drag: a lifted tile follows the pointer and a drop indicator shows the target slot. Keyboard move: no overlay, live region announcement. |
| **Picker open** | Modal page picker (§3d). |
| **Move dialog open** | Modal "move to position" (§3c). |
| **Remove-selected confirm** | Modal with "Only this page" and "All {n} selected pages". |
| **Processing** | F1 progress bar, determinate by pages written. Grid inert. |
| **Done** | F1 result card: one PDF, preview of its first page, Download, Share, Continue with (Rotate, Merge), Start over, Back to options. |
| **Error** | F1 intake errors per file; F1 processing error panel with Retry. |
| **Limit reached** | F1 notices with the Merge caps (50 files). |
| **Session expired** | Not reachable (browser tool). |

## 5. Errors and limits

Copy the behavior, not the wording.

| Case | Reference | InstaPDF |
|---|---|---|
| Wrong type, corrupt, 0 bytes, too large, too many pages, too many files | F1 table | F1 behavior with Merge caps (50 files). |
| Image that cannot be decoded (bad bytes with `.png`, or a TIFF the decoder rejects) | Not tested | Treated like a corrupt file: error naming it; other files stay. |
| Image above 50 megapixels | Free tier: 5 MB per image | Error naming the file and the megapixel cap; other files stay. |
| Move to an invalid position | Inline red field, dialog stays | Inline error message tied to the field (`aria-invalid`), dialog stays, nothing moves. |
| Picker confirm with nothing selected | Button stays active (result not tested) | Button disabled. |
| Removing every page in the pages view | Not tested | Returns to the empty state (same as removing the last file). |
| TOC or footer text the standard PDF font cannot show (non-Latin names) | Not observed | The text must still appear correctly: embed a subset of a permissively licensed Unicode font, loaded only when needed. (Geist is already used under SIL OFL in F1; the font choice and license need the code-reviewer's check against CLAUDE.md rule 3.) |
| Processing failure | Generic retry message | F1 processing-error panel; page edits and options are kept. |

## 6. Output

- **Always one PDF**, never a ZIP.
- **File name:** `<first source file's base name>-merged.pdf`, for example `alpha-merged.pdf` when `alpha.pdf` is first in the output. Characters not allowed in file names are replaced with `-`. *Unverified against the reference* (no task was run); the evaluator records the reference's name on its first Merge run and we follow it if it differs.
- **Page order:** exactly the pages-view order (which the files view only groups), plus generated pages: TOC pages (at the start, or after the cover segment) and double-sided padding pages.
- **Pages from PDFs** are copied, not re-rendered: content streams, text, annotations (except form widgets in Remove / Flatten modes) and page boxes are kept. `/Rotate` = original + the user's rotation, mod 360.
- **Pages from images:** one page per image (per frame for TIFF). Page size A4, **portrait for portrait or square images and landscape for landscape images** (our choice; the reference showed a landscape PNG on a portrait page, screenshot 02). The image is centered, scaled to fit inside a 36 pt margin with its aspect ratio kept, and never scaled above its size at 72 dpi. JPEGs are embedded without re-encoding.
- **Options** change the output as described in §3f.
- **Document info:** Producer "InstaPDF"; Title, Author and other Info fields are not copied from the sources. No encryption, even when inputs were encrypted (F1 AC-29 note applies).
- **Size:** for PDF-only inputs with no TOC, footer or same-width option, the output is at most the sum of the input sizes × 1.1 + 50 KB. Resources shared by several pages of one source are written once.

## 7. Acceptance criteria

Fixtures (QA adds them to `tests/fixtures/`, generated by a script, no third-party content):

- `alpha.pdf`: 3 pages, A4 portrait (595×842), text "Alpha 1".."Alpha 3", Info Title "Alpha Report", outline: "Alpha intro" → p1 with child "Alpha detail" → p2; "Alpha end" → p3.
- `bravo.pdf`: 2 pages, US Letter landscape (792×612), text "Bravo 1", "Bravo 2", Title "Bravo Brief", outline "Bravo start" → p1.
- `echo.pdf`: 1 page A4, text "Echo 1", no Title, no outline.
- `file2.pdf`, `File10.pdf`: 1 page each, text "File 2" / "File 10".
- `charlie.png`: 400×300 px. `delta.jpg`: 300×400 px. `fox.tiff`: 2-frame TIFF, 200×200 px each. `broken.png`: text bytes with a `.png` name. `huge.png`: 8,000×8,000 px (64 MP), generated at runtime.
- `form-a.pdf`: 1 page, text field `name` = "Ann", checkbox `agree` = on. `form-b.pdf`: 1 page, text field `name` = "Ben".
- `résumé-日本.pdf`: 1 page, text "Unicode 1".
- F1 fixtures: `three-pages.pdf`, `sixty-pages.pdf`, `pre-rotated.pdf`, `user-pw.pdf`, `owner-restricted.pdf`, `notes.txt`.

All ACs run on `/merge-pdf` on staging. "Output" means the downloaded PDF, checked with a PDF library (page count, `/Rotate`, MediaBox, outline, AcroForm, annotations) and text extraction. Unless stated otherwise the files are picked in one batch with default options, and "run" means the primary action followed by Download. Tags: **(ref)** = behavior seen on the reference; **(ours)** = our decision or improvement (the evaluator does not compare it, but it must pass).

### Intake and files view

- **AC-1 (P0) (ref)** `/merge-pdf` shows the tool (not a coming-soon page). Its file input allows multiple files and accepts `.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.tif` and `.tiff`.
- **AC-2 (P0) (ref)** Picking `alpha.pdf` and `bravo.pdf` reaches the ready state in the **files view** with 2 cards in that order. Each card shows the file name and the page count (3 and 2) and the letter badges A and B.
- **AC-3 (P1) (ref)** Picking `File10.pdf`, `file2.pdf`, `bravo.pdf`, `alpha.pdf` in one batch (in that order) shows the cards as alpha, bravo, file2, File10 (natural, case-insensitive).
- **AC-4 (P1) (ref)** With `bravo.pdf` and `echo.pdf` loaded, adding `alpha.pdf` through Add files appends it: the order is bravo, echo, alpha.
- **AC-5 (P0) (ref)** Picking `charlie.png` with `alpha.pdf` shows a `charlie.png` card with 1 page and a rendered thumbnail. Running gives a 4-page PDF.
- **AC-6 (P1) (ours)** Picking `broken.png` with `alpha.pdf` shows an error naming `broken.png`, and `alpha.pdf` stays loaded.
- **AC-7 (P2) (ours)** Picking `huge.png` shows an error naming it and giving the 50-megapixel cap, within 3 s; the tab stays responsive.
- **AC-8 (P2) (ref)** Picking `fox.tiff` gives a card with 2 pages; running gives 2 pages, each with one image.
- **AC-9 (P0) (ref)** In the files view, dragging the `bravo.pdf` card in front of `alpha.pdf` (pointer drag) changes the card order to bravo, alpha. Running gives 5 pages with text in order Bravo 1, Bravo 2, Alpha 1, Alpha 2, Alpha 3.
- **AC-10 (P0) (ours)** Keyboard only: focusing the `alpha.pdf` card and pressing Alt+ArrowRight moves it after `bravo.pdf`. Focus stays on the `alpha.pdf` card, and a polite live region announces its new position. Running gives Bravo pages first.
- **AC-11 (P1) (ours)** Each card has Move earlier / Move later buttons; the first card's Move earlier and the last card's Move later are disabled. Activating Move later on the first of two cards swaps them.
- **AC-12 (P0) (ref)** With cards in the order bravo, alpha, echo: Sort → Name Z–A gives echo, bravo, alpha, and Sort → Name A–Z gives alpha, bravo, echo. Running after A–Z gives text order Alpha 1–3, Bravo 1–2, Echo 1.
- **AC-13 (P2) (ref)** Sort by last modified: three files dropped with `lastModified` values in the order 3, 1, 2 (QA builds the `File` objects in a drop event) are ordered 1, 2, 3 by "oldest first" and 3, 2, 1 by "newest first".
- **AC-14 (P1) (ref)** Rotate right on the `bravo.pdf` card turns its thumbnail and gives `/Rotate 90` on output pages 4 and 5 while pages 1–3 stay 0.
- **AC-15 (P0) (ref)** Remove on the `alpha.pdf` card leaves only `bravo.pdf`; running gives 2 pages. Removing the last card returns to the empty state.
- **AC-16 (P2) (ref)** Enlarge on a card opens a preview dialog of that file's page 1, and Next shows page 2.

### Pages view

- **AC-17 (P0) (ref)** With `alpha.pdf` and `bravo.pdf`, switching to the Pages view shows 5 tiles labeled A1, A2, A3, B1, B2 in that order. Each tile's accessible name includes its file name.
- **AC-18 (P1) (ours)** With only `alpha.pdf` loaded, the view toggle is shown and the Pages view shows 3 tiles.
- **AC-19 (P0) (ref)** Dragging tile B1 between A1 and A2 gives the tile order A1, B1, A2, A3, B2, and running gives text order Alpha 1, Bravo 1, Alpha 2, Alpha 3, Bravo 2.
- **AC-20 (P0) (ours)** Keyboard only: focusing tile B2 and pressing Alt+Home moves it to the first position; the live region announces it. Running gives Bravo 2 first.
- **AC-21 (P0) (ref)** Clicking A2 selects it (`aria-selected="true"` or equivalent); Ctrl+click (Cmd on macOS) on B1 adds it; Shift+click on A1 after clicking A3 selects A1–A3. A visible count shows the number selected, and Clear selection (or Escape) deselects all.
- **AC-22 (P1) (ours)** Space on a focused tile toggles its selection.
- **AC-23 (P1) (ref)** With A1 and A3 selected, dragging A3 to after B2 moves both: the order becomes A2, B1, B2, A1, A3.
- **AC-24 (P1) (ref)** Move to position: the move action on B2, entering 1 and confirming puts B2 first. Entering 99, 0 or "x" shows an inline error, keeps the dialog open and changes nothing.
- **AC-25 (P0) (ref)** The remove action on A2 removes it; running gives 4 pages and no "Alpha 2" text.
- **AC-26 (P1) (ref)** With A1 and B1 selected, the remove action on A3 opens a confirm dialog. "Only this page" removes just A3; repeating with "All selected" removes A1, B1 and the clicked page.
- **AC-27 (P0) (ref)** Duplicate on A1 inserts a copy right after it. Running gives 6 pages with text Alpha 1, Alpha 1, Alpha 2, Alpha 3, Bravo 1, Bravo 2.
- **AC-28 (P1) (ref)** Rotate right on tile B1 only gives `/Rotate` values [0, 0, 0, 90, 0].
- **AC-29 (P0) (ref)** The insert point between A3 and B1 → Blank page inserts a blank tile there. Running gives 6 pages; page 4 has no text and a 595×842 MediaBox (the size of the page in front of it).
- **AC-30 (P1) (ours)** Add pages → Blank page with nothing selected adds the blank page at the end (6th page, 792×612 like B2). With A1 selected it goes right after A1.
- **AC-31 (P0) (ref)** Add pages → From a file → `three-pages.pdf` opens a picker dialog with 3 tiles labeled with a new letter (C1–C3). Selecting C1 and C3 and confirming inserts them at the end and switches to the Pages view. Running gives 7 pages, the last two with text "Page 1" and "Page 3".
- **AC-32 (P1) (ref)** Opening the picker from the insert point between A1 and A2 inserts the chosen pages there (output: Alpha 1, Page 2, Alpha 2, …).
- **AC-33 (P1) (ours)** In the picker, the confirm button is disabled until a page is selected and shows the count when enabled. Select all selects every tile. Cancel or Escape closes the dialog and adds nothing.
- **AC-34 (P1) (ref)** The insert point between A1 and A2 → Add files here → `echo.pdf` inserts its page there; running gives Alpha 1, Echo 1, Alpha 2, Alpha 3, Bravo 1, Bravo 2.
- **AC-35 (P1) (ref)** In the Pages view, after moving B1 to the front, Sort → Name A–Z gives A1, A2, A3, B1, B2 (pages grouped by file, page order kept inside each file).

### One model, both views

- **AC-36 (P0) (ours)** After AC-19 (B1 between A1 and A2), the Files view shows 4 cards in order: alpha (1 page), bravo (1 page), alpha (pages 2–3), bravo (1 page). Running from the Files view and from the Pages view gives identical page order.
- **AC-37 (P1) (ours)** Sorting Z–A in the Files view and then opening the Pages view shows tiles in the new file order (B1, B2, A1, A2, A3). The views never disagree.
- **AC-38 (P0) (ours)** The options panel is available in the Pages view. Choosing a contents page (TOC) there and running produces it (same check as AC-48).
- **AC-39 (P1) (ours)** After AC-31, the Files view shows a card for `three-pages.pdf` with 2 pages.

### Options: defaults and basic output

- **AC-40 (P0) (ref)** On a first visit (empty `localStorage`) the options show: double-sided off, same width off, cover off, footer off, Bookmarks = Keep all, Contents = None, Form fields = Merge, rename duplicates.
- **AC-41 (P0) (ref)** With defaults, `alpha.pdf` + `bravo.pdf` gives 5 pages, text order Alpha 1–3, Bravo 1–2, MediaBoxes 595×842 (×3) then 792×612 (×2), all `/Rotate 0`.
- **AC-42 (P1) (ref)** Options are remembered: after setting Contents = File names and double-sided on, reloading the page shows the same settings.

### Bookmarks

- **AC-43 (P0) (ref)** Keep all: the output outline has top-level items "Alpha intro" → page 1 (with one child "Alpha detail" → page 2), "Alpha end" → page 3, "Bravo start" → page 4.
- **AC-44 (P0) (ref)** Remove all: the output has no outline items.
- **AC-45 (P0) (ref)** One per file: the outline is exactly two top-level items, "alpha" → page 1 and "bravo" → page 4, with no children.
- **AC-46 (P1) (ref)** One per file, keep existing inside: top-level "alpha" (children "Alpha intro" with its child "Alpha detail", then "Alpha end") and "bravo" (child "Bravo start").
- **AC-47 (P1) (ours)** Bookmarks follow edits (Keep all): after removing A3 and moving B1 to the front, the outline is "Alpha intro" → page 2 (child "Alpha detail" → page 3) and "Bravo start" → page 1; "Alpha end" is gone.

### Contents page (TOC)

- **AC-48 (P0) (ref)** Contents = File names with `alpha.pdf` + `bravo.pdf`: the output has 6 pages. Page 1 contains the text "alpha.pdf" and "bravo.pdf" in that order with the page numbers 2 and 5. Pages 2–6 are Alpha 1–3, Bravo 1–2.
- **AC-49 (P0) (ref)** The TOC page has one link annotation per file whose destination is output page 2 and output page 5 respectively.
- **AC-50 (P1) (ref)** Contents = Document titles with `alpha.pdf`, `bravo.pdf`, `echo.pdf`: the TOC lists "Alpha Report", "Bravo Brief" and "echo.pdf" (no Title, so the file name).
- **AC-51 (P1) (ref)** Cover on + Contents = File names with `alpha.pdf`, `bravo.pdf`, `echo.pdf`: output order is Alpha 1–3, TOC, Bravo 1–2, Echo 1 (7 pages). The TOC lists bravo.pdf → 5 and echo.pdf → 7, not alpha.pdf.
- **AC-52 (P1) (ours)** 50 one-page files with Contents = File names: all 50 entries appear across the TOC pages, every link goes to the right page, and the page count is 50 + the number of TOC pages.
- **AC-53 (P2) (ours)** The TOC page has the same MediaBox as the first content page.

### Footer with file name

- **AC-54 (P0) (ref)** Footer on, `alpha.pdf` + `bravo.pdf`: pages 1–3 each contain the text "alpha.pdf" and pages 4–5 contain "bravo.pdf", along with their original text.
- **AC-55 (P1) (ours)** With footer, TOC and double-sided all on, and a blank page inserted, the TOC pages, the padding pages and the inserted blank page contain no file-name text.
- **AC-56 (P2) (ours)** With `pre-rotated.pdf` (page 2 at `/Rotate 90`) and footer on, rendering output page 2 with pdf.js puts the footer text horizontal and within the bottom 15% of the rendered (rotated) page.
- **AC-57 (P2) (ours)** With `résumé-日本.pdf`, the footer text extracted from its page equals "résumé-日本.pdf".

### Double-sided padding

- **AC-58 (P0) (ref)** Double-sided on with `alpha.pdf` (3), `bravo.pdf` (2), `echo.pdf` (1): the output has 8 pages: Alpha 1–3, blank, Bravo 1–2, Echo 1, blank. Each blank page has no text and the MediaBox of the page before it.
- **AC-59 (P1) (ours)** Double-sided + Contents = File names with the same three files: every file's first page lands on an odd output page number (1-based) and the total is even.

### Same width

- **AC-60 (P0) (ref)** Same width on with `alpha.pdf` + `bravo.pdf`: every output page has a displayed width of 595 ± 0.5 pt, the Bravo pages' height is 459 ± 1 pt (612 × 595 / 792), and the text Bravo 1 and Bravo 2 is still extractable.
- **AC-61 (P2) (ours)** Same width with `bravo.pdf` first: the Alpha pages become 792 ± 0.5 pt wide and 1,120.7 ± 1 pt tall.

### Form fields

- **AC-62 (P0) (ref)** Default (merge, rename duplicates) with `form-a.pdf` + `form-b.pdf`: the output form has three fields: `name` = "Ann", `agree` = on, and `name_2` = "Ben". Each has a widget on its own page.
- **AC-63 (P1) (ref)** Merge: the output form has two fields, `name` (with two widgets, one per page, value "Ann") and `agree`.
- **AC-64 (P1) (ref)** Remove: the output has no form fields and no `/Widget` annotations.
- **AC-65 (P0) (ref)** Flatten: the output has no form fields and no `/Widget` annotations, and the text "Ann" and "Ben" is extractable from pages 1 and 2.

### Output, limits, accessibility

- **AC-66 (P0) (ours)** With `alpha.pdf` first, the download is named `alpha-merged.pdf`, is a single PDF (not a ZIP), and is not encrypted.
- **AC-67 (P1) (ours)** Image pages: `charlie.png` gives an 842×595 page and `delta.jpg` a 595×842 page. Each page draws exactly one image XObject, centered (± 1 pt) and inside the 36 pt margin. The JPEG's XObject uses `/DCTDecode`.
- **AC-68 (P0) (ours)** Combined edit check: with `alpha.pdf` and `bravo.pdf`, duplicate A1, rotate B2 right, insert a blank page between A3 and B1, remove A2, then drag B1 to the front. The output's page order and `/Rotate` values match the pages view exactly: Bravo 1 (0), Alpha 1 (0), Alpha 1 (0), Alpha 3 (0), blank (0), Bravo 2 (90).
- **AC-69 (P1) (ours)** Size: with `sixty-pages.pdf` + `alpha.pdf` and default options, the output size is at most (sum of input sizes) × 1.1 + 50 KB.
- **AC-70 (P1) (ours)** With 50 files loaded, adding one more shows a message giving the 50-file cap and the 51st file is not added.
- **AC-71 (P1) (ours)** `user-pw.pdf` + `alpha.pdf`: after unlocking with `test`, the merge gives 6 pages (Page 1–3 then Alpha 1–3) that open without a password.
- **AC-72 (P1) (ours)** The primary action is enabled with one file loaded, and the status line shows the page and file counts.
- **AC-73 (P1) (ours)** The full flow can be done with the keyboard alone: pick files, reorder a card, switch to the Pages view, move and remove a page, insert a blank page through an insert point, open and use the picker, set an option, run, download. Every dialog traps focus and returns it on close.
- **AC-74 (P1) (ours)** axe reports no critical or serious violations in: the Files view, the Pages view with a selection, the options panel (dock and bottom sheet), the page picker, the move dialog and the remove-selected confirm.
- **AC-75 (P1) (ours)** At 375 px wide, the Files view, the Pages view and the open options sheet have no horizontal scroll. In the ready state the primary action is visible without scrolling, and every card and tile action has a target of at least 44×44 px.
- **AC-76 (P1) (ours)** Pointer drags (cards and tiles) also announce the new position in the live region, and a drag can be cancelled with Escape (the item goes back where it was).
- **AC-77 (P0) (ours)** After this feature ships, F2's catalogue card and menu entry for Merge link to `/merge-pdf` with the Beta badge and no "Coming soon", and `/merge-pdf` no longer renders the coming-soon page. F2's planned-tool tests pass using another planned slug.

**Totals: 77 ACs: 32 P0, 37 P1, 8 P2.** Plus the inherited F1 ACs listed in §0a.

## 8. Decisions to review

1. **One page model for both views (§3e).** The reference keeps two lists and hides the options in its pages view; we keep one list, show segments in the files view and offer options in both views. This is a superset: with no page edits the behavior matches the reference's files view.
2. **Output name** `<first base name>-merged.pdf` is unverified; the evaluator should record the reference's name.
3. **Cover + TOC:** the cover is left out of the TOC. Unverified on the reference.
4. **Double-sided padding** pads the last file too and pads the TOC section. The first part follows the reference's tooltip; the second is ours.
5. **Image pages** follow the image's orientation (the reference put a landscape PNG on a portrait page) and are never upscaled beyond 72 dpi size.
6. **Toolbar blank page** with nothing selected goes at the end (the reference puts it at the start).
7. **Caps:** 50 files per task for Merge (F1 default 20); 50-megapixel decode cap per image.
8. **Unicode font** for footer and TOC text: the font and its license (OFL is not in the CLAUDE.md list; Geist was accepted under it in F1) need a call by the code reviewer or orchestrator.
9. **TIFF** needs a new decoder dependency (UTIF.js, MIT, to be verified), or TIFF is dropped from `accept` until a later feature.
10. **Bookmark titles** for per-file entries drop the extension; TOC and footer use the full file name.

## 9. Screenshot index (internal)

01 empty · 02 files view after picking alpha, bravo, charlie (sorted by name; PNG on a portrait page) · 03 file card hover actions · 04 sort menu · 05 after Z–A (files view) · 06 pages view still in the old order · 07 page hover actions · 08 one page selected · 09 remove-with-others-selected prompt · 10 after removing one page · 11 duplicate and per-page rotate · 12 move-to-position dialog · 13 invalid position · 14 insert-point menu · 15 insert-point "add pages" submenu with blank page · 16 blank page inserted · 17 files view ignores page edits · 18 options panel · 19 page picker · 20 picker with Shift / Ctrl selection · 21 after adding picked pages (switched to pages view) · 22 pages view sorted A–Z · 23 dragging a file card · 24 files view showing picked pages as extra whole-file cards · 25 options changed (remembered in local storage) · 26 pages view hides the options · 27, 28 mobile pages and files views.
