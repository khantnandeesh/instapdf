# F3: Merge (files view + pages view, reorder, options)

Status: step 1 (Analyze) done; §8 decisions resolved by the orchestrator; step 2 (Research) done (§ Improvements); step 3 (UX) done (§ UI). Next: build.
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

| Aspect | Reference behavior (observed) | BerryPDF F3 decision |
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
| Sort | menu button | – | Name A–Z · Name Z–A · Last modified, oldest first · Last modified, newest first · **Reverse order** (AC-78, improvement I-1) | Files view: reorders file cards. Pages view: stable-sorts pages by their source file's name or date, keeping page order inside each file. Name sort is natural and case-insensitive (reference uses natural sort on the lower-cased name). Date sort uses the `File.lastModified` of each source. Blank pages the user inserted travel with the page in front of them. **Reverse order** reverses the order of the segments (§3e) in both views and keeps the page order inside each segment; choosing it twice restores the previous order. |
| Thumbnail size | slider | F1 default | F1 range | F1 AC-10. |

Reference note: the reference's sort lives in a "Reorder" menu with exactly the four sort entries (Reverse order is ours), and it works in both views (in the pages view it sorts pages by file name).

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

BerryPDF keeps **one ordered page list**. Both views render it:

- The pages view shows it page by page.
- The files view groups it into **segments**: maximal runs of consecutive pages from the same source. A blank page the user inserted belongs to the segment in front of it (or the one after it at the very start).
- Moving or removing a card moves or removes exactly that segment's pages.
- Switching views never changes the page list, and running from either view gives the **same** output.
- The options panel is available in both views.

When nothing has been edited at page level, segments are exactly the files and the behavior equals the reference's files view.

### 3f. Merge options (options panel)

All options are remembered on this device (`localStorage["berrypdf:merge-options"]`) and restored on the next visit. The reference does the same per option (`settings.merge-pdf.*` keys observed). Labels below are our own.

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

| Case | Reference | BerryPDF |
|---|---|---|
| Wrong type, corrupt, 0 bytes, too large, too many pages, too many files | F1 table | F1 behavior with Merge caps (50 files). |
| Image that cannot be decoded (bad bytes with `.png`, or a TIFF the decoder rejects) | Not tested | Treated like a corrupt file: error naming it; other files stay. |
| Image above 50 megapixels | Free tier: 5 MB per image | Error naming the file and the megapixel cap; other files stay. |
| Move to an invalid position | Inline red field, dialog stays | Inline error message tied to the field (`aria-invalid`), dialog stays, nothing moves. |
| Picker confirm with nothing selected | Button stays active (result not tested) | Button disabled. |
| Removing every page in the pages view | Not tested | Returns to the empty state (same as removing the last file). |
| TOC or footer text the standard PDF font cannot show (non-Latin names) | Not observed | The text must still appear correctly: embed a subset of a permissively licensed Unicode font, loaded only when needed. (Geist is already used under SIL OFL in F1; the font choice and license need the code-reviewer's check against CLAUDE.md rule 3.) |
| TOC or footer text in Arabic (or another script that needs contextual shaping: Syriac, Thaana, N'Ko) | Not observed | **Known limitation (build, PR #7 review):** pdf-lib cannot shape these scripts, so each such character is written as "?" (the rest of the name is kept). Covered: Latin, Greek, Cyrillic, Vietnamese, Devanagari, Hebrew, Thai, Japanese, Korean, Simplified Chinese (Noto Sans families, SIL OFL 1.1, fetched only when needed). Hebrew uses a simplified bidi for file names on a left-to-right line: a right-to-left run starts at a Hebrew letter and takes in the spaces, `-`, `_`, `.`, `,`, brackets and digits that follow while another Hebrew letter or a number comes after them; the run is drawn reversed, each number keeps its own order (digits, with a single `-`, `.` or `,` between two digits joining them into one number as Unicode bidi rule W4 does: `12-3`, `2024-01-05`, `1,000`), and brackets inside it are mirrored; trailing punctuation before Latin text or the end (e.g. `.pdf`) stays left to right. Nested embeddings, explicit bidi controls and right-to-left paragraphs are not supported. Thai marks are positioned by the font's advances only (no mark positioning). Revisit with a shaping engine (e.g. HarfBuzz WASM, MIT) in a later feature. |
| Processing failure | Generic retry message | F1 processing-error panel; page edits and options are kept. |

## 6. Output

- **Always one PDF**, never a ZIP.
- **File name:** `<first source file's base name>-merged.pdf`, for example `alpha-merged.pdf` when `alpha.pdf` is first in the output. Characters not allowed in file names are replaced with `-`. *Unverified against the reference* (no task was run); the evaluator records the reference's name on its first Merge run and we follow it if it differs.
- **Page order:** exactly the pages-view order (which the files view only groups), plus generated pages: TOC pages (at the start, or after the cover segment) and double-sided padding pages.
- **Pages from PDFs** are copied, not re-rendered: content streams, text, annotations (except form widgets in Remove / Flatten modes) and page boxes are kept. `/Rotate` = original + the user's rotation, mod 360.
- **Pages from images:** one page per image (per frame for TIFF). Page size A4, **portrait for portrait or square images and landscape for landscape images** (our choice; the reference showed a landscape PNG on a portrait page, screenshot 02). The image is centered, scaled to fit inside a 36 pt margin with its aspect ratio kept, and never scaled above its size at 72 dpi. JPEGs are embedded without re-encoding.
- **Options** change the output as described in §3f.
- **Document info:** Producer "BerryPDF"; Title, Author and other Info fields are not copied from the sources. No encryption, even when inputs were encrypted (F1 AC-29 note applies).
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

- **AC-1 (P0) (ref)** `/merge-pdf` shows the tool (not a coming-soon page). Its file input allows multiple files and accepts `.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.tif` and `.tiff`. (`.tif` and `.tiff` only if §8a decision 9 is met.)
- **AC-2 (P0) (ref)** Picking `alpha.pdf` and `bravo.pdf` reaches the ready state in the **files view** with 2 cards in that order. Each card shows the file name and the page count (3 and 2) and the letter badges A and B.
- **AC-3 (P1) (ref)** Picking `File10.pdf`, `file2.pdf`, `bravo.pdf`, `alpha.pdf` in one batch (in that order) shows the cards as alpha, bravo, file2, File10 (natural, case-insensitive).
- **AC-4 (P1) (ref)** With `bravo.pdf` and `echo.pdf` loaded, adding `alpha.pdf` through Add files appends it: the order is bravo, echo, alpha.
- **AC-5 (P0) (ref)** Picking `charlie.png` with `alpha.pdf` shows a `charlie.png` card with 1 page and a rendered thumbnail. Running gives a 4-page PDF.
- **AC-6 (P1) (ours)** Picking `broken.png` with `alpha.pdf` shows an error naming `broken.png`, and `alpha.pdf` stays loaded.
- **AC-7 (P2) (ours)** Picking `huge.png` shows an error naming it and giving the 50-megapixel cap, within 3 s; the tab stays responsive.
- **AC-8 (P2) (ref)** *(conditional on §8a decision 9: deferred if no permissive TIFF decoder)* Picking `fox.tiff` gives a card with 2 pages; running gives 2 pages, each with one image.
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

### 8a. Orchestrator resolution (2026-11-23)

- **Decisions 1–7 and 10:** accepted as written.
- **Decision 8 (Unicode font):** accepted. A font under SIL OFL 1.1 (for example a Noto Sans subset) may be used for footer and contents (TOC) text, consistent with Geist in F1. It must be **lazy-loaded**: fetched only when the footer or contents option is used and a run starts (or when the text needs glyphs outside the standard font, if the engineer keeps the standard font for Latin-1 text). It must never be part of the initial page load of `/merge-pdf`. Its license file goes into the third-party notices.
- **Decision 9 (TIFF), conditional:** TIFF is accepted **only if** the decoder's license is verified as permissive (MIT, BSD, Apache-2.0, ISC or MPL) when it is added at build time. If the check fails, or no such decoder is found, then:
  - `.tif` and `.tiff` are dropped from the accepted types (AC-1's accept list loses them, and the empty-state copy does not mention TIFF);
  - AC-8 and the TIFF parts of §2, §5 and §6 become **deferred** (not tested), and the engineer records the deferral in the PR and in `docs/process/backlog.md`;
  - a `.tiff` file is then rejected as an unsupported type, like any other wrong type (F1 behavior).

## 9. Screenshot index (internal)

01 empty · 02 files view after picking alpha, bravo, charlie (sorted by name; PNG on a portrait page) · 03 file card hover actions · 04 sort menu · 05 after Z–A (files view) · 06 pages view still in the old order · 07 page hover actions · 08 one page selected · 09 remove-with-others-selected prompt · 10 after removing one page · 11 duplicate and per-page rotate · 12 move-to-position dialog · 13 invalid position · 14 insert-point menu · 15 insert-point "add pages" submenu with blank page · 16 blank page inserted · 17 files view ignores page edits · 18 options panel · 19 page picker · 20 picker with Shift / Ctrl selection · 21 after adding picked pages (switched to pages view) · 22 pages view sorted A–Z · 23 dragging a file card · 24 files view showing picked pages as extra whole-file cards · 25 options changed (remembered in local storage) · 26 pages view hides the options · 27, 28 mobile pages and files views.

## Improvements

Research, 2026-11-23. iLovePDF, Smallpdf and PDF24 were blocked by this session's network proxy, so we could not inspect them live. Claims marked † come from the competitors' own help or blog pages found through web search. Claims marked ‡ come from the researcher's prior knowledge and were **not** re-checked live (*unverified*). Nothing was run on any competitor, and no competitor text, assets or code is reused (Stirling-PDF has mixed licensing, so we take ideas only).

Quick read of the field: everyone does drag-to-reorder of file cards. iLovePDF sorts by name and offers a separate page-organize step with "+" insert points for blank pages † and a "mix" mode that interleaves pages from several files †. PDF24 has a file mode and a separate page mode †. Smallpdf and Adobe Acrobat online have a file list plus a page-level view and undo while organizing ‡. Stirling-PDF sorts by file name (natural sort) and by date †, and has a "remove digital signature" toggle on merge ‡. PDFgear's online merge runs in the browser ‡. Our spec already covers most of this (two views, sort, insert points, picker, TOC, footer), so the list below keeps to a few cheap extras; the spec already has 77 ACs.

| # | Idea | Seen at | User benefit | Cost | Adopt/skip | Reason |
|---|---|---|---|---|---|---|
| I-1 | **Reverse order** entry in the Sort menu (reverses the current segment order in one step) | Stirling-PDF ‡, smaller merge tools † | Files that arrive newest-first (scans, mail exports) are fixed with one click instead of many drags | S | **Adopt** → AC-78 | Pure list operation on the existing page model; no new UI beyond a menu item. |
| I-2 | **Undo after remove**: removing a card or page(s) shows a short notice with an Undo button that puts them back exactly where they were | Adobe Acrobat online ‡, Smallpdf ‡ (undo while organizing) | Recovers from a mis-tap, which is common on phones where remove sits next to rotate | S | **Adopt** → AC-79 | With one page list (§3e) this is a snapshot restore of the list before the remove; single level only, no full undo/redo stack. |
| I-3 | **Duplicate-file notice**: when a file with the same name, size and last-modified date as one already loaded is added, say so (it is still added) | Not seen at the six ‡; common upload pattern | Catches the common "picked the same file twice" mistake before the merge is run | S | **Adopt** → AC-80 | A comparison at intake plus an F1 info notice. It does not block, because a repeated file can be intentional. |
| I-4 | Interleave ("mix") pages of several files, e.g. fronts + backs of a duplex scan | iLovePDF † | Rebuilds double-sided scans | M | Skip | This is the reference's separate Alternate & mix tool, planned in F5. |
| I-5 | Per-file page range typed on the card ("1-3, 5") | PDF24 page mode †, smaller tools † | Take part of a file without opening the page view | M | Skip | The pages view and the picker (§3c, §3d) already do this; a second way adds UI and tests to an already large spec. Revisit with Split/Extract. |
| I-6 | Full undo/redo stack (Ctrl+Z / Ctrl+Shift+Z) for every edit | Adobe Acrobat online ‡, Stirling-PDF ‡ | Undo any step, not just removals | M | Skip | I-2 covers the risky case. A full history belongs with Organize (F5), which shares this page model. |
| I-7 | Remove digital signatures on merge | Stirling-PDF ‡ | Avoids broken-signature warnings in the output | S | Skip | pdf-lib copying already leaves the signature invalid; a dedicated option adds little. Revisit with the signature tools. |
| I-8 | Merge on the server for very large jobs | iLovePDF, Smallpdf, PDF24, Adobe (all upload) ‡ | Works on weak devices | L | Skip | Goes against browser-first (rule 4) and costs money (rule 5). Our caps fit in the browser. |
| I-9 | Add a whole folder (directory picker / folder drop) | PDF24 desktop ‡ | Merge a folder of scans in one go | M | Skip | Patchy browser support for directory pick on mobile; drag of many files already works. Revisit later. |
| I-10 | "Continue with Compress" right after the merge | iLovePDF, Smallpdf ‡ | Merged files are often too big to email | S | Skip (for now) | Compress is a server tool that is not built yet; F1's Continue-with list picks it up automatically once it exists. |

### Improvement acceptance criteria

The evaluator does not compare these with the reference, but they must work.

- **AC-78 (P2) (ours) (improvement)** With cards in the order alpha, bravo, echo, Sort → Reverse order gives echo, bravo, alpha; choosing it again restores alpha, bravo, echo. In the Pages view after AC-19 (A1, B1, A2, A3, B2), Reverse order reverses the segments, not the pages inside them: the tile order becomes B2, A2, A3, B1, A1. Running gives that order.
- **AC-79 (P1) (ours) (improvement)** Removing the `bravo.pdf` card (of alpha, bravo, echo) shows a polite notice with an Undo button for at least 8 s; activating Undo restores the card in position 2 with the same rotation, and running gives 6 pages in the order Alpha 1–3, Bravo 1–2, Echo 1. The same works in the Pages view after "All selected" removes A1 and B1 (both come back in their old positions). Undo is reachable by keyboard and focus returns to the restored item. A later edit replaces the notice (single level of undo).
- **AC-80 (P2) (ours) (improvement)** With `alpha.pdf` loaded, adding the same `alpha.pdf` again (same name, size and last-modified time) adds a second card and shows a dismissible info notice naming `alpha.pdf` and saying it was added twice. Adding `bravo.pdf` shows no such notice.

**Totals with improvements: 80 ACs: 32 P0, 38 P1, 10 P2.** Plus the inherited F1 ACs listed in §0a.

Sources (web search, 2026-11-23): [iLovePDF: organize PDF pages](https://www.ilovepdf.com/blog/organize-pdf-pages) · [iLovePDF: organizing, splitting and merging guide](https://ilovepdf.com/blog/organize-split-merge-pdf-files-ultimate-guide) · [PDF24 help: merge PDF files](https://help.pdf24.org/en/how-to-merge-pdf-files-with-pdf24/) · [Stirling-PDF merge sort-by-date fix (#4461)](https://git.laurivan.com/Mirrors/Stirling-PDF/src/commit/fd95876d8fc3f3951525cbf7c836a2736dd60eb2) · [Stirling-PDF repository](https://github.com/Stirling-Tools/Stirling-PDF) · [IONOS: merging PDFs](https://www.ionos.com/digitalguide/online-marketing/online-sales/merging-pdfs/)

## UI

Designed 2026-11-23 by ux-designer. This is the build contract for `/merge-pdf`. It extends the F1 design system (`docs/specs/f1-shared-flow.md`, `## UI`, "U-x") and F2 (`docs/specs/f2-home.md`, `## UI`, "H-x"): same tokens, primitives, focus ring, motion rules, breakpoints and control dock. Only what Merge adds or changes is written here. The look is BerryPDF's own; the reference screenshots in §9 are for behavior only and are never a visual guide.

### M-1. Design principles for Merge

1. **Two actions to the result, still.** Choose files → "Merge PDFs". The first batch arrives already sorted by name (§2), the options have safe defaults, and the primary is enabled from one file on. Everything else (reorder, page edits, options) is optional and never stands between the user and the button.
2. **One list, two lenses.** The files view and the pages view are two renderings of the same ordered page list (§3e). Switching views keeps scroll position on the focused item, never changes order and never resets selection.
3. **Every pointer gesture has a button and a key.** Drag works with mouse and touch, but each drag has a visible button alternative (Move earlier / Move later, Move to position) and a keyboard shortcut (Alt+arrows), and each move is announced.
4. **No layout shift from editing chrome.** Insert points, the selection bar, drag ghosts, menus, notices and the undo notice float or sit in reserved space. The only reflow is the one the user asked for (an item moved, added or removed), and that reflow is animated with transforms (FLIP), not by animating size or position properties.
5. **Undo instead of "are you sure".** Removing is one click and can be undone (AC-79). The single confirm dialog left is the one the spec requires (remove one page while others are selected, AC-26), and its safer choice has focus.

### M-2. Tokens: additions to F1 U-2 and F2 H-2

Add to `apps/web/src/styles/tokens.css` (same file, same `--ip-*` naming, exposed through `@theme inline` where a utility is needed). No new colors except one paper-text token.

| Token | Value | Use |
|---|---|---|
| `--ip-on-paper-muted` | `#535A6E` in **both** themes | "Blank page" label and icon drawn on a blank page thumbnail. Pages are always white (`paper`), so dark-mode `fg-muted` (`#A2A8BA`, 2.37:1 on white) must not be used there. |
| `--ip-insert-size` | 24px | Visible circle of an insert point ("+"). Hit area is 44×44 (F1 `--ip-tap-min`). |
| `--ip-slot-bar` | 3px | Width of the drop / insert indicator bar drawn in the grid gap. |
| `--ip-lift-scale` | 1.03 | Scale of the dragged ghost. |
| `--ip-selbar-h` | 56px | Height of the floating selection bar (M-4). |
| `--ip-z-drag` | 35 | Drag ghost: above notices (30), below the drop overlay (40). Menus and dialogs use the native top layer (`popover` / `<dialog>`), so they need no z-index. |
| `--ip-z-selbar` | 25 | Floating selection bar: above the dock (20), below notices (30). |
| `--ip-sheet-max-h` | 85dvh | Options bottom sheet below 1024 px (F1 said 80dvh; 85 fits all seven options at 375×667 with one scroll). |

**New contrast pairs (WCAG 2.1, measured)**

| Pair | Light | Dark | Where |
|---|---|---|---|
| `on-paper-muted` on `paper` | 6.87 | 6.87 | "Blank page" label on blank thumbnails |
| `border-strong` on `paper` (non-text) | 3.82 | 3.82 | dashed outline inside a blank page thumbnail |
| `primary` on `surface` (non-text) | 7.01 | 6.64 | drop / insert indicator bar, selection outline |
| `primary` on `surface-raised` (non-text) | 7.57 | 6.10 | selection outline on cards, focus inside menus |
| `border-strong` on `surface` / `surface-raised` (non-text) | 3.54 / 3.82 | 3.85 / 3.54 | insert point circle outline, end "Add" tile dashed border |
| `primary` on `primary-soft` (icon) | 6.53 | 5.43 | insert point "+" when hovered / focused / open |
| `on-primary-soft` on `primary-soft` | 8.79 | 8.97 | source letter badge on a selected tile, "2 changed" chip |
| `fg` on `primary-soft` | 15.27 | 12.62 | selection bar count text |

Every selected, dragged, invalid or "changed" state also has a non-color cue (check mark, outline width, icon, text).

### M-3. Layout

The shared skeleton is F1 U-3: `ToolIntro`, the workspace (`section aria-label="Your files"`, `surface` canvas, sticky 52 px toolbar), and the `ControlDock` (sticky 320 px column at ≥ 1024, fixed bottom bar below). Merge uses `optionsDensity: "full"`: at ≥ 1024 the options live in the dock column; below 1024 the dock holds an **Options** button that opens a bottom sheet (M-4 `MergeOptionsSheet`).

#### 1280 px, files view (≥ 1024 behaves the same)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ BerryPDF  [▦ All tools ▾]  Merge  Rotate                                       │ header 56
├────────────────────────────────────────────────────────────────────────────────┤
│ Merge PDF                                                                      │ h1 2xl
│ Join PDFs and images into a single document                                    │ fg-muted
│ ┌────────────────────────────────────────────────────┐ ┌─────────────────────┐ │
│ │ [Files|Pages]  [⇅ Sort ▾]  [+ Add files] [Add pages ▾] │ │ Options             │ │ toolbar 52, sticky
│ │────────────────────────────────────────────────────│ │ Contents page       │ │
│ │ ┌A──────────×┐ ┌B──────────×┐ ┌C──────────×┐ ┌ ─ ─ ─ ─┐│ │ [None|Names|Titles] │ │
│ │ │    ▯       │ │    ▭       │ │    ▯       │ │   +    ││ │ ( ) First file is a │ │
│ │ │ [⟲][⟳][⤢]  │ │ [⟲][⟳][⤢]  │ │ [⟲][⟳][⤢]  │ │ Add    ││ │     cover           │ │
│ │ └────────────┘ └────────────┘ └────────────┘ │ files  ││ │ Bookmarks           │ │
│ │ alpha.pdf      bravo.pdf      charlie.png    └ ─ ─ ─ ─┘│ │ [Keep all       ▾]  │ │
│ │ 3 pages·1.2 MB 2 pages·80 KB  Image·1 page             │ │ Page layout         │ │
│ │ [←]  1 of 3 [→][←]  2 of 3 [→][←]  3 of 3 [→]          │ │ ( ) File name in    │ │
│ │                                                    │ │     footer          │ │
│ │                                                    │ │ ( ) Same width      │ │
│ │                                                    │ │ ( ) Double-sided    │ │
│ │                                                    │ │ Form fields         │ │
│ │                                                    │ │ [Merge, rename… ▾]  │ │
│ │                                                    │ │ Reset options       │ │
│ │                                                    │ │─────────────────────│ │
│ │                                                    │ │ 6 pages · 3 files   │ │
│ │                                                    │ │ [   Merge PDFs    ] │ │ primary lg 52
│ └────────────────────────────────────────────────────┘ └─────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

- Two columns as F1 (workspace `minmax(0,1fr)`, dock 320, gap 24). Grid columns `repeat(auto-fill, var(--ip-thumb-size))`, gap 16: 5 cards per row at 160 px.
- **Toolbar** (left to right): `ViewToggle` (Files · Pages, shown from **one** file, §3a) → `SortMenu` (icon + "Sort" + chevron) → spacer → `Add files` (secondary sm, + icon; a plain button, since cloud sources are hidden, F1 D-5) → `Add pages` (secondary sm menu button: "From a file…", "Blank page"). The thumbnail size slider is shown in the pages view only (F1), between Sort and the spacer.
- **File card** (`SegmentCard`, M-4): box, name line, meta line, then a 44 px **position row**: `[← Move earlier]  [Move later →]` (the "1 of 3" text is gone *(changed 2026-11-23 per owner: minimal text)*). Every card has the same height (box + 20 + 16 + 44 + gaps), so cards never jump. Top-start of the box: source letter badge; top-end: Remove (F1). Bottom of the box: floating action bar (Rotate left, Rotate right, Enlarge), shown on hover, focus-within and always on touch.
- **End tile**: the last grid cell is a dashed "Add files" tile the same size as a card box. It opens the file picker directly (one click). Its position is always last, so adding files moves it once (user-initiated).
- Options column scrolls inside the dock when taller than the dock (at 900 px viewport height it fits without scrolling).

#### 1280 px, pages view

```
│ ┌────────────────────────────────────────────────────┐ ┌─────────────────────┐ │
│ │ [Files|Pages] [⇅ Sort ▾] ─○── size  [+ Add files] [Add pages ▾]│ (same dock)        │ │
│ │────────────────────────────────────────────────────│ │                     │ │
│ │ ⊕┌──────✓┐⊕┌───────┐⊕┌───────┐⊕┌───────┐⊕┌───────┐⊕ │ │                     │ │ ⊕ = insert point
│ │  │   ▯   │ │   ▯   │ │   ▯   │ │  ▭    │ │  ▭    │  │ │                     │ │     (hover / focus)
│ │  │[⟲][⟳][🗑][⋯]│     │       │ │       │ │       │  │ │                     │ │
│ │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘  │ │                     │ │
│ │     A1        A2        A3        B1        B2      │ │                     │ │ label xs 500
│ │  ┌ ─ ─ ─ ┐                                         │ │                     │ │
│ │  │  +    │ Add                                     │ │                     │ │ end "Add" tile
│ │  └ ─ ─ ─ ┘                                         │ │                     │ │
│ └────────────────────────────────────────────────────┘ │ 5 pages · 2 files   │ │
│        ┌─────────────────────────────────────────┐     │ [   Merge PDFs    ] │ │
│        │ 2 selected  [⟲] [⟳] [🗑 Remove]  [Clear] │     └─────────────────────┘ │ floating selection bar
│        └─────────────────────────────────────────┘                             │
```

- One flat grid in output order (no per-file group headers: pages from different files interleave). Tile label below the box: source letter + page number (`A1`), `xs` 500 `fg`, `tabular-nums`; blank pages: "Blank".
- **Insert points** sit centered in the 16 px gap at the vertical middle of the page box: one before the first tile, one after every tile. Visible circle 24 px (`surface-raised`, 1 px `border-strong`, `+` 14 px `fg-muted`); hit area 44×44 overlapping the tile edges (the tile's own controls are at its center and bottom, so they never collide). With a fine pointer they are invisible until the pointer is within the gap strip (a 24 px wide hover zone per gap) or the insert point has focus or its menu is open. When shown, a 3 px `primary` slot bar is drawn the full box height in the gap.
- **Selection bar** (`SelectionBar`): floating, centered over the workspace column, `bottom: 24px` at ≥ 1024 (notices stack above it while it is shown). Only present with ≥ 1 selected page.

#### 768 px (640–1023), both views

```
┌──────────────────────────────────────────────┐
│ BerryPDF  [▦ All tools ▾]  Merge Rotate      │
├──────────────────────────────────────────────┤
│ Merge PDF                                    │
│ Join PDFs and images into a single document  │
│ ┌──────────────────────────────────────────┐ │
│ │[Files|Pages] [⇅ Sort▾] [+ Add files][Add pages▾]│ │ toolbar (pages view adds the size slider)
│ │ ┌A────×┐ ┌B────×┐ ┌C────×┐ ┌ ─ ─ ┐       │ │ 4 per row at 160
│ │ │  ▯   │ │  ▭   │ │  ▯   │ │ +   │       │ │
│ │ └──────┘ └──────┘ └──────┘ └ ─ ─ ┘       │ │
│ │ alpha.pdf bravo.pdf charlie.png          │ │
│ │ [←]1 of 3[→] …                           │ │
│ └──────────────────────────────────────────┘ │
│      ┌──────────────────────────────────┐    │ selection bar (pages view), above the dock
│      │ 2 selected [⟲][⟳][🗑]   [Clear]  │    │
│      └──────────────────────────────────┘    │
├──────────────────────────────────────────────┤ fixed dock, 76 + safe area
│ [⚙ Options · 2 changed]          [Merge PDFs]│
└──────────────────────────────────────────────┘
```

- Gutters 24, single column, fixed one-row dock (F1). Toolbar at 768: view toggle (~150), Sort (~96), slider (pages view, ~170), Add files (~120), Add pages (~130): 616 + gaps fits the 672 px toolbar; between 640 and 767 the slider is dropped and Sort becomes icon-only (container query on the toolbar, not the viewport, so it also holds at 200% zoom).
- Dock row: `MergeOptionsButton` (secondary md, gear icon, label "Options", plus a `primary-soft` chip "2 changed" when any option differs from the defaults) on the left; primary (min width 200) on the right. `DockStatus` visually hidden (F1).
- Selection bar: `bottom: calc(var(--ip-dock-actual) + 12px)`, notices stack above it.

#### 375 px (< 640), both views

```
┌───────────────────────────────┐
│ BerryPDF          [▦ Tools ▾] │
├───────────────────────────────┤
│ Merge PDF                     │ h1 xl
│ Join PDFs and images into a…  │
│ [Files|Pages]   [⇅]  [+ Add ▾]│ toolbar 52: one Add menu, icon-only Sort
│ ┌A─────────×┐ ┌B─────────×┐   │ 2 columns, square boxes
│ │     ▯     │ │     ▭     │   │
│ │ [⟲][⟳][⤢] │ │ [⟲][⟳][⤢] │   │ 3 × 44 action bar, always visible (touch)
│ └───────────┘ └───────────┘   │
│ alpha.pdf      bravo.pdf      │
│ 3 pages·1.2 MB 2 pages·80 KB  │
│ [←] 1 of 2 [→] [←] 2 of 2 [→] │ 44 px position row
├───────────────────────────────┤ fixed dock, 128 + safe area
│ [⚙ Options      · 2 changed ] │ row 1: 44, full width
│ [        Merge PDFs         ] │ row 2: 48, full width
└───────────────────────────────┘
```

Pages view at 375:

```
│ [Files|Pages]   [⇅]  [+ Add ▾]│
│⊕┌─────────○┐⊕┌─────────●┐⊕   │ ○/● selection check, always visible on touch
│ │    ▯     │ │    ▯     │    │
│ │[⟳][🗑][⋯]│ │[⟳][🗑][⋯]│    │ 3 × 44 per-page bar
│ └──────────┘ └──────────┘    │
│     A1           A2          │
│⊕┌──────────┐⊕┌ ─ ─ ─ ─ ┐     │
│ │    ▯     │ │  + Add  │     │ end tile
│ └──────────┘ └ ─ ─ ─ ─ ┘     │
│     A3                       │
│ ┌───────────────────────────┐ │ selection bar, above the dock
│ │ 1 selected [⟳][🗑]  [Clear]│ │
│ └───────────────────────────┘ │
├───────────────────────────────┤
│ [⚙ Options                  ] │
│ [        Merge PDFs         ] │
└───────────────────────────────┘
```

- Gutters 16, workspace padding 12, gap 12: each box is about 153 px. Three 44 px buttons plus 4 px gaps and 4 px padding is 148 px, so every action is a full 44×44 target (AC-75). No horizontal scroll at 375 in any state.
- Toolbar: `ViewToggle` short labels ("Files" / "Pages"), Sort icon-only (`aria-label="Sort"`, tooltip on focus), and **one** "Add" menu button (+ icon and the word "Add") with "Files…", "Pages from a file…", "Blank page". The slider is hidden (F1).
- Insert points are always visible on touch (`hover: none`), as 24 px circles in the gap, so they are discoverable without hover.
- The primary is visible without scrolling in every ready state (dock is fixed, AC-75). At 375×667, the title, toolbar and the first row of cards are above the fold.
- Dialogs (picker, move, confirm) use the F2 `fullscreen` variant for the picker and the default centered variant (width `min(440px, 100vw - 32px)`) for move and confirm.

#### Page picker dialog (all widths)

```
1280 / 768 (Dialog wide: min(880px, 100vw - 64px), max-height 85dvh)
┌──────────────────────────────────────────────────────────────┐
│ Add pages from three-pages.pdf                          [×]  │ title lg 600, name middle-truncated
│ Pick the pages to add. They go after A3.                     │ sm fg-muted ("at the end" from the toolbar)
│ [Select all] [Select none]                  2 of 3 selected  │ 44 row
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ┌────✓┐ ┌─────┐ ┌────✓┐                                  │ │ grid scrolls inside, tiles 120 px
│ │ │  ▯  │ │  ▯  │ │  ▯  │                                  │ │
│ │ └─────┘ └─────┘ └─────┘                                  │ │
│ │   C1      C2      C3                                     │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                  [Cancel]  [ Add 2 pages ]   │ footer, Add = primary
└──────────────────────────────────────────────────────────────┘

375 (Dialog fullscreen, F2): title bar with [×], helper line, the Select all / none row,
2-column grid filling the height, sticky footer [Cancel] [Add 2 pages] (both 48, 50/50).
```

#### Move-to-position dialog and remove confirm

```
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ Move A3                              │   │ Remove pages?                        │
│ Now at position 3 of 9.              │   │ A3 is one of 3 selected pages.       │
│ New position (1–9)                   │   │                                      │
│ ┌──────────────────────────────────┐ │   │ [Cancel] [Only this page]            │
│ │ 3                                │ │   │          [Remove all 3 selected]     │ danger
│ └──────────────────────────────────┘ │   └──────────────────────────────────────┘
│ (!) Enter a number from 1 to 9.      │ reserved 20 px error line
│                   [Cancel]  [ Move ] │
└──────────────────────────────────────┘
```

Below 400 px both footers stack (primary or danger on top, F1 rule).

### M-4. Component tree

Reuse first. New primitives go to `components/ui/`, shared editing pieces that Organize (F5) will reuse go to `components/page-edit/`, and Merge-only pieces to `tools/merge/`.

```
app/merge-pdf/page.tsx (server)  → <RecordVisit slug="merge-pdf"/> + <MergeTool/>
<MergeTool>                                         tools/merge/MergeTool.tsx (client)
└─ <ToolFlow tool renderOptions renderWorkspace toolbar process …>      F1, extended (M-11 #1)
   ├─ <ToolIntro/> <DropOverlay mode="add"|"insert"/> <LiveRegion/>     F1
   ├─ empty:  <DropCard> <FilePicker/> <LimitsNote/> <PrivacyNote/> </DropCard>   F1, Merge copy
   ├─ ready/loading/processing:
   │   ├─ <WorkspaceToolbar>                                            F1
   │   │    <ViewToggle/> <SortMenu/> <ThumbSizeSlider/> <AddFilesButton/> <AddPagesMenu/> | <AddMenu/> (< 640)
   │   ├─ files view: <SegmentGrid>                                     page-edit
   │   │                 <SegmentCard/>* <AddTile kind="files"/>
   │   │               </SegmentGrid>
   │   ├─ pages view: <EditablePageGrid>                                page-edit
   │   │                 <InsertPoint/> (<EditablePageTile/> <InsertPoint/>)* <AddTile kind="pages"/>
   │   │               </EditablePageGrid>
   │   ├─ <SelectionBar/>                                               page-edit (pages view, ≥ 1 selected)
   │   ├─ <DragLayer/>                                                  page-edit, lazy (M-10)
   │   └─ <ControlDock options={<MergeOptions/>}>                       F1
   │        ≥ 1024: <MergeOptions/> inline · < 1024: <MergeOptionsButton/> → <MergeOptionsSheet/>
   │        <DockStatus/> <PrimaryAction/> | <ProcessingBar/> | <ProcessError/>
   ├─ done: <ResultCard/>                                               F1
   ├─ <NoticeStack/>  (+ undo and duplicate notices, M-6)               F1, extended
   ├─ <PasswordDialog/> <PagePreviewDialog/> <LeaveGuard/>              F1
   ├─ <PagePickerDialog/>          lazy                                 page-edit
   ├─ <MoveToPositionDialog/>      lazy                                 page-edit
   └─ <RemoveSelectedDialog/>      lazy                                 page-edit
```

#### New primitives (`components/ui/`)

| Component | Props | Notes |
|---|---|---|
| `Menu` / `MenuButton` / `MenuItem` / `MenuSeparator` | `MenuButton`: `label`, `icon?`, `iconOnly?`, `variant` (Button variants), `size`; `Menu`: `items: {id, label, icon?, disabled?, onSelect}[] \| "separator"`, `placement: "bottom-start" \| "bottom-end"` | WAI-ARIA menu button pattern: trigger `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`; popup `role="menu"` with `role="menuitem"` buttons. Enter/Space/ArrowDown opens on the first item, ArrowUp on the last; arrows move, Home/End, type-ahead on the first letter, Escape closes and returns focus to the trigger, Tab closes and moves on. Rendered with the native `popover="auto"` attribute (top layer, light dismiss, no z-index fights) and positioned by a few lines of JS from the trigger's rect: below, flipped above when there is not enough room (it opens upward from the end "Add" tile near the dock). `surface-raised`, `rounded-lg`, `shadow-lg`, 4 px padding, items 44 px high (36 at ≥ 1024 with a fine pointer), `sm` 500, 20 px icon, hover/focus `surface-sunken`, separator 1 px `border`. Min width 200, max `calc(100vw - 32px)`. Opening and closing: opacity + 4 px translate (`fast`). No library. |
| `Select` | `label`, `value`, `options: {value, label}[]`, `description?`, `onChange`, `id` | Native `<select>` (best on mobile, free accessibility), 44 px, `rounded-md`, 1 px `border-strong`, `surface-raised`, custom chevron (`appearance: none` + `ChevronDownIcon`), focus ring F1. Visible `<label>` above (`sm` 500); `description` below (`xs fg-muted`, `aria-describedby`), its height reserved for two lines so changing the choice moves nothing. |
| `Switch` | F2 H-5, unchanged | Used for the four on/off options; each gets a description (`aria-describedby`), now screen-reader text plus a `title` tooltip instead of a visible line *(changed 2026-11-23 per owner: minimal text)*. |
| `Dialog` | add `variant: "sheet"` | Below 1024: anchored to the bottom, full width, `rounded-t-xl`, max height `--ip-sheet-max-h`, slide-up (`base`, transform) and fade. A 4 px × 36 px grabber is drawn for affordance only (no swipe-to-dismiss in F3; Escape, the close button and "Done" close it). Body scrolls; header and footer stay. |

#### Shared editing components (`components/page-edit/`, reused by Organize in F5)

| Component | Props | Behavior and look |
|---|---|---|
| `PageListModel` (not a component; `lib/page-list.ts`) | ordered `PageRef[]` (`{uid, sourceId, sourceIndex \| "blank", rotation, size}`), sources map (`letter`, `name`, `lastModified`, `size`) | Pure functions with unit tests: `segments()`, `move(uids, toIndex)`, `remove`, `duplicate`, `insert`, `sortBy(name \| date, dir)`, `reverseSegments()`, `snapshot()` / `restore()` (for undo). Both views render from it. Source letters: A–Z, then AA, AB… (50 files + picker files can exceed 26). |
| `SegmentGrid` | `segments`, `onMove`, `onRemove`, `onRotate`, `onPreview` | Replaces F1 `FileGrid` for Merge (F1 `FileGrid` stays for Rotate). `role="list"`, `aria-label="Files in merge order"`, `aria-describedby` the hint "Use arrow keys to move between files. Alt with an arrow key moves the file." Same column rules as F1. Roving tabindex across the card buttons (F1 U-7 keys). Hosts pointer drag (M-7). |
| `SegmentCard` | `segment` (`source`, `pageRange`, `pageCount`, `blankCount`, `rotation`, `status`), `position`, `total` | Extends F1 `FileCard` visuals. `role="listitem"`. Box: first page thumbnail (with the segment's rotation applied via transform, F1 rule: rotating never changes the box). **Main control** is a full-box button (like F1 `PageTile`), accessible name "alpha.pdf, 3 pages" (+ ", pages 2–3" for partial segments, + ", rotated 90°" when rotated); click / Enter opens `PagePreviewDialog` on the segment's pages. Top-start: `SourceBadge`. Top-end: Remove `IconButton` "Remove alpha.pdf" (F1). Floating action bar (bottom of the box, F1 `PageActionBar` style): Rotate left, Rotate right, Enlarge ("Rotate alpha.pdf left", …). Below the box: name (`sm` 500, ellipsis, `title`), meta (`xs fg-muted`, `tabular-nums`): "3 pages" (size dropped *(changed 2026-11-23 per owner: minimal text)*), "pages 2–3 of 3", "Image · 1 page", "3 pages (1 blank)". Position row (44 px): `IconButton` "Move alpha.pdf earlier" (chevron-left) · `xs fg-muted` "1 of 3" (`aria-hidden`; the list conveys position) · `IconButton` "Move alpha.pdf later"; disabled at the ends (AC-11). Rotation badge (F1 "+90°" pill) sits next to the letter badge. Loading and locked: F1 `FileCard` states, in the file's sorted position (§4). |
| `SourceBadge` | `letter`, `selected?` | `xs` 600, `h-5 min-w-5 px-1`, `rounded-sm`, `surface-raised` 90% with `shadow-sm`, `fg` text (17.7:1); on a selected tile `primary-soft` / `on-primary-soft`. `aria-hidden` (the letter is in the accessible name). |
| `EditablePageGrid` | `pages`, `selection`, `onSelectionChange`, `onMove`, `onAction`, `onInsert` | Replaces F1 `PageGrid` for Merge: **one** flat list in output order (no file sections). `role="list"`, `aria-label="Pages in merge order"`, `aria-describedby` hint "Arrow keys move between pages. Space selects. Alt with an arrow key moves the page. Shift+F10 opens page actions." Keeps F1 lazy thumbnails (one `IntersectionObserver`, ≤ 1 row overscan, AC-52 of F1) and roving tabindex. Hosts pointer drag and rubber-band-free selection (no lasso in F3). |
| `EditablePageTile` | `page`, `label` ("A1" / "Blank"), `selected`, `active`, `rotation`, `inserted?` (highlight) | Extends F1 `PageTile` (same square box, page drawn contained, rotation by transform, placeholder pulse). Main control: full-box `button` with **`aria-pressed`** = selected (M-8 explains why not `aria-selected`), accessible name "A1, page 1 of alpha.pdf" / "Blank page", + ", rotated 90°" when rotated. Selected look: 2 px `primary` outline inset 2 px + check badge top-end (`primary` circle, `on-primary` check) + letter badge in `primary-soft`: three cues, one not color. Unselected on touch (`hover: none`) and on hover/focus: an empty 20 px ring at top-end (`border-strong` 1.5 px on `surface-raised` 90%) so multi-select is discoverable. Clicking the ring toggles (additive, like Ctrl+click); it is `aria-hidden` and not focusable because Space on the tile does the same. Rotation badge "+90°" top-start (F1). Action bar (bottom, floating): ≥ 640: Rotate left, Rotate right, Remove, More (⋯); < 640: Rotate right, Remove, More (rotate left moves into More). When the box is narrower than 136 px (slider at 80–128) the bar shows only More (container query). Blank page: white `paper` box at the neighbour's size with a 1 px dashed `border-strong` inset 8 px, a 24 px blank-page icon and "Blank page" in `on-paper-muted` `xs`. `inserted`: a `primary-soft` glow overlay fades out over 1.2 s (opacity only). |
| `PageMoreMenu` | `page`, `selectionCount` | `Menu` from the tile's More button. Items: (Rotate left, < 640 only) · Duplicate · Move to position… · Move earlier · Move later · separator · Blank page after · Pages from a file after… · Files after… · separator · Enlarge. When the tile is selected and others are too, item labels say so ("Duplicate 3 pages", "Move 3 pages to position…") so the scope is never a surprise (§3c: actions on a selected tile apply to the selection). |
| `InsertPoint` | `after: PageRef \| null`, `onChoose(kind)` | `MenuButton` rendered as the 24 px circle (M-3). Accessible name "Insert here, after A3" / "Insert here, at the start". Menu: "Files here…" · "Pages from a file here…" · "Blank page here" (§3c). While its menu is open the circle is `primary-soft` with a `primary` "+" and the slot bar shows. Not a Tab stop of its own: it is reachable in the active tile's Tab sequence (M-8), so a 1,000-page grid adds no Tab stops. |
| `AddTile` | `kind: "files" \| "pages"` | Last grid cell, the size of a card/tile box, `rounded-lg`, 2 px dashed `border-strong`, `surface` fill, + icon 24 `primary`, `sm` 500 "Add files" / "Add". Files view: a button that opens the file picker directly. Pages view: a `MenuButton` with the same three items as `InsertPoint` ("at the end"). Hover: border `primary`, fill `primary-soft` (`fast`). Its label row (20 px) and position row keep it aligned with the cards. |
| `SelectionBar` | `count`, `onRotate(dir)`, `onRemove`, `onClear` | Fixed, floating (M-3), `surface-raised`, `rounded-xl`, `shadow-lg`, height `--ip-selbar-h`, padding 6/8. Contents: count "{n} selected" (`sm` 600, `tabular-nums`, `min-w` for 4 digits so it never jitters) → `IconButton` "Rotate selected pages left" / "… right" → `Button ghost sm` with trash icon "Remove" (icon-only < 640, `aria-label="Remove selected pages"`; no confirm, undo notice instead) → `Button ghost sm` "Clear" (AC-21 "Clear selection"; `aria-label="Clear selection"`). `role="toolbar"`, `aria-label="Selected pages"`, arrow keys move inside (roving), and it is placed in the DOM right after the grid (before the dock) so Tab order matches reading order. Appears/disappears with opacity + 8 px translate (`base`); nothing else moves. |
| `DragLayer` | – | Portal for the drag ghost and the slot bar during pointer drags (M-7). Lazy chunk. |
| `PagePickerDialog` | `source` (the picked file, already through intake), `insertAfter`, `onConfirm(indexes)`, `onCancel` | `Dialog wide` (≥ 640) / `fullscreen` (< 640). Grid of 120 px tiles (2 columns < 640) with labels "D1"…; same selection model and keys as the page grid (click / Ctrl / Shift / Space / Shift+Space / Ctrl+A), no action bars, no drag. Header row: `Button ghost sm` "Select all", "Select none", and "{n} of {total} selected" (`sm`, `tabular-nums`, `aria-live="polite"` off: announced through the flow `LiveRegion` only on Select all / none to avoid chatter). Footer: `Button secondary` "Cancel", `Button primary` "Add {n} pages" ("Add 1 page"; "Add pages" and `disabled` when 0, with `aria-describedby` → "Select at least one page." line). Initial focus: the first tile. Thumbnails lazy inside the scroll container (its own `IntersectionObserver` root). |
| `MoveToPositionDialog` | `subject` ("A3" or "3 pages"), `current`, `total`, `onMove(pos)` | `Dialog` default. Input `type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done"`, label "New position (1–{total})", prefilled with the current position, all selected, focused. Enter or "Move" validates: not an integer in 1…total → error line "Enter a whole number from 1 to {total}." (reserved 20 px, `danger`, alert icon), `aria-invalid="true"`, `aria-describedby` → error, input keeps focus with its text selected; nothing moves (AC-24). Valid → closes, focus returns to the moved tile, live announcement. |
| `RemoveSelectedDialog` | `clicked`, `count`, `onOnlyThis`, `onAll` | `Dialog` default. Title "Remove pages?", body "{A3} is one of {3} selected pages." Footer: `ghost` "Cancel", `secondary` "Only this page", `danger` "Remove all {3} selected" (AC-26 wording "All selected" stays recognizable). Initial focus: "Only this page" (least destructive of the two actions; undo exists for both). |

#### Merge pieces (`tools/merge/`)

| Component | Content |
|---|---|
| `MergeTool` | Owns the page list, selection, undo snapshot, options state (`localStorage["berrypdf:merge-options"]`), and passes `renderWorkspace` / toolbar items to `ToolFlow`. |
| `SortMenu` | `MenuButton` (icon `sort`, label "Sort", icon-only < 768) with items: "Name A to Z", "Name Z to A", "Oldest first", "Newest first", separator, "Reverse order". These are actions, not a persistent state, so they are `menuitem`s (no checkmarks). After choosing: the list animates to its new order (FLIP, `base`), focus returns to the Sort button, polite announcement "Sorted by name, A to Z" / "Order reversed". With one segment the menu still opens, but the items are disabled with the menu's first line "Add more files to sort" (`xs fg-muted`, not focusable). |
| `AddPagesMenu` (≥ 640) / `AddMenu` (< 640) | See M-3. "From a file…" opens a single-file picker (`multiple` off, same `accept`); "Blank page" follows §3c (after the last selected page, else at the end) and switches to the pages view if needed, then focuses the new blank tile. |
| `MergeOptions` | The options panel (M-5). Same component inside the dock column and inside the sheet. |
| `MergeOptionsButton` | < 1024 dock row: `Button secondary md` with gear icon, "Options", and the `primary-soft` chip "{n} changed" (hidden when 0; the chip slot has a fixed `min-w` so the button never changes width). `aria-haspopup="dialog"`, `aria-expanded`. Accessible name "Options, 2 changed". |
| `MergeOptionsSheet` | `Dialog variant="sheet"`, title "Merge options", close `IconButton`. Body: `MergeOptions`. Footer (sticky): `Button ghost` "Reset options" · `Button secondary` "Done" · `Button primary` "Merge PDFs". The primary in the sheet runs directly (close sheet → run), which saves a tap after changing options. Initial focus: the first control. |

### M-5. Options panel (all options from §3f)

Order follows how often people need them and keeps related controls together. Defaults per AC-40. Every option is saved on change.

| Group (heading `sm` 600 `fg-muted`) | Control | Labels (our copy) | Description line (`xs fg-muted`, always visible) |
|---|---|---|---|
| Contents page | `SegmentedControl` full width | "None" · "File names" · "Document titles" (short at < 360 px container: "None" · "Names" · "Titles") | None: "No contents page." Names: "Adds a clickable list of files at the front." Titles: "Like file names, but uses each PDF's title when it has one." |
| | `Switch` "First file is a cover" | | "Puts the contents page after the first file and leaves the cover out of the list." When Contents = None the switch stays enabled and the line reads "Only used with a contents page." (§3f) |
| Bookmarks | `Select` | "Keep all" · "Remove all" · "One per file" · "One per file, keep existing inside" | Changes with the value: "Keeps each file's bookmarks as they are." / "The merged file has no bookmarks." / "Adds one bookmark per file, named after it." / "One bookmark per file, with that file's bookmarks inside it." |
| Page layout | `Switch` "Add file name to the footer" | | "Writes the file's name small at the bottom of each of its pages." |
| | `Switch` "Make all pages the same width" | | "Scales pages to the width of the first page. Nothing is cropped." |
| | `Switch` "Pad for double-sided printing" | | "Adds a blank page after each file with an odd page count, so every file starts on a front side." |
| Form fields | `Select` | "Merge, rename duplicates" · "Merge" · "Flatten" · "Remove" | "Keeps every field. Repeated names get a number." / "Fields with the same name share one value." / "Turns fields into plain page content." / "Removes all form fields." |
| – | `Button ghost sm` "Reset options" | | Disabled when all are at defaults. Announces "Options reset". |

- Dock column (≥ 1024): groups separated by 20 px, no dividers. At 1280×800 the whole panel is 600 px tall and fits the 640 px dock with the footer, so the dock does not scroll at common laptop heights; below that it scrolls inside (F1).
- Sheet (< 1024): the same panel, 16 px side padding, groups separated by a 1 px `border` divider for scanning. At 375×667 it is one short scroll.
- **Compact vs full on mobile:** the dock bar never shows individual options below 1024 (they don't fit a 44 px row without truncating labels). It shows the "Options" button with the changed count, which is the compact summary; the sheet is the full panel. Changes in the sheet apply immediately (no Apply/Cancel pair); "Done" just closes.
- While processing the whole panel is in the F1 `fieldset disabled`; the Options button stays enabled so the user can still read the settings (the sheet opens with disabled controls).

### M-6. States

All F1 U-6 states apply. Additions and changes:

| State | Workspace | Dock | Focus / announcement |
|---|---|---|---|
| **Empty** | F1 drop card. Button "Choose files"; hint "or drop them here"; limits "PDFs and images, up to 50 files", with the full limits as tooltip and screen-reader text (M-12) *(changed 2026-11-23 per owner: minimal text)*. | Options button / panel disabled; status "Add files to start"; primary disabled. | F1. |
| **Loading** | Files view (default). Cards appear immediately in **sorted** position for the first batch (natural name order, §2), each in F1 loading state (spinner, "Reading…"), so the order the user will get is visible from the first frame and nothing re-sorts when files finish. Images show "Reading…" then their decoded thumbnail. | Primary disabled, status "Reading files…". | "Reading 3 files". |
| **Password** | Locked card in its sorted position, F1 locked look. F1 `PasswordDialog`. | F1. | F1. |
| **Ready, one file** | One card, toolbar with view toggle (AC-18), end tile "Add files" reads "Add more files" at this count. | Primary enabled; status "3 pages · 1 file · add more to merge". | "alpha.pdf ready, 3 pages". |
| **Ready, files view** | Cards with position rows, end tile. | Status "{pages} pages · {files} files" (`files` = distinct sources). | – |
| **Ready, pages view** | Flat tile grid, insert points, end tile. | Same. | On switching: focus stays on the toggle; the grid scrolls so the first page of the previously focused card is in view. |
| **Selection** (pages view) | Selected tiles show outline, check and tinted badge; `SelectionBar` floats. | Unchanged. | "2 selected" (debounced 300 ms while Shift-extending). |
| **Menu open** (sort, add, more, insert) | Native popover, page stays interactive behind it (light dismiss). | – | Focus on the first item. |
| **Pointer drag** | Ghost under the pointer, source slot at 40% opacity with a dashed outline, slot bar at the target gap, auto-scroll near the top (below the sticky toolbar) and bottom (above the dock) edges. | Unchanged. | Start: "Moving A3. Press Escape to cancel." Drop: "A3 moved to position 1 of 5." (AC-76) Cancel: "Move cancelled." |
| **Keyboard move** | No ghost; the moved item animates to its new slot (FLIP) and keeps focus. | – | "bravo.pdf moved to position 1 of 3." / "3 pages moved to positions 4 to 6 of 9." At an end: "alpha.pdf is already first." (no move). |
| **OS files dragged over a ready grid** | Over the grid: no full overlay; the slot bar shows at the nearest gap and a small label "Drop to add here" follows above it (insert at that point, §2). Elsewhere on the page: F1 `DropOverlay` "Drop to add at the end". | – | None (pointer only; keyboard uses Add). |
| **Picker open** | `PagePickerDialog`. While the picked file is parsing, the dialog is already open with the title, placeholder tiles (count known after parse) and a spinner in the count slot; a locked file shows the F1 `PasswordDialog` first, then the picker. Wrong type / corrupt: no dialog, F1 error notice. | – | Focus: first tile when ready. |
| **Move dialog** / **Remove-selected confirm** | M-4. | – | M-4. |
| **Undo available** (AC-79) | `NoticeStack` info notice: "Removed bravo.pdf." / "Removed 3 pages." with action **Undo** and Dismiss. `role="status"`. Stays **10 s**, paused while the pointer is over it or focus is inside it (WCAG 2.2.1), then fades. A newer remove replaces it; any other edit (move, rotate, insert, sort, option changes don't count) dismisses it (single level). | Unchanged. | Focus moves to the next item (the one that took the removed item's place, or the previous one at the end; to the end tile if nothing is left before it). Announcement: "bravo.pdf removed. Undo is available, press Ctrl+Z." **Ctrl/Cmd+Z** triggers Undo while the notice is shown (ignored in text fields). Undo restores the list, focuses the first restored item and announces "bravo.pdf restored at position 2". |
| **Duplicate file added** (AC-80) | Info notice: title "alpha.pdf was added twice", body "If that was a mistake, remove the copy." Action **"Remove the copy"** (removes the newly added one, with the normal undo notice) and Dismiss. Not auto-dismissed. Several duplicates in one batch become one notice listing them (F1 rule). The copy's card shows normally (no special styling). | – | `role="status"`, no focus move. |
| **Removed last item** | Back to the F1 empty state (drop card), undo notice still offered: Undo returns to the ready state with everything back. | – | Focus to "Choose files". |
| **Processing** | F1: workspace inert, 60% opacity; menus close; any drag is cancelled; selection bar hidden; open sheet stays open but disabled. | `ProcessingBar` "Merging… 42%" (pages written / total). When the Unicode font is needed (footer or contents on), the first phase reads "Preparing fonts…" with an indeterminate bar, then switches to the determinate one in the same box. | "Merging". |
| **Done** | F1 `ResultCard`: preview of output page 1 (the TOC page when contents is on), "alpha-merged.pdf", "1.4 MB · 6 pages", Download (focused), Share, privacy note, not-encrypted note when any input was locked, Continue with (Rotate, Merge), Start over, Back to options (keeps page edits, selection cleared, options and view). | – | F1. |
| **Processing error** | F1 `ProcessError`; page list and options kept. If the font failed to load: "Couldn't load the font for file names. Check your connection and try again." | – | F1. |
| **Limit / intake errors** | F1 notices with Merge caps and image messages: "{name} couldn't be read as an image." / "{name} is larger than 50 megapixels, the limit for images." / "This tool takes up to 50 files at a time. We loaded the first 50." | – | F1. |

### M-7. Drag and drop (pointer and touch)

**No drag library.** A small in-house module `components/page-edit/drag.ts` (Pointer Events, about 3–4 KB min+gzip) covers both grids. dnd-kit (MIT) and SortableJS (MIT) would work license-wise but each adds 12–20 KB gzip and their own focus/announcement models that duplicate ours. The module is a lazy chunk (M-10).

- **Mouse / pen:** `pointerdown` on a card or tile box (not on its buttons) → lift after 4 px of movement. Click without movement keeps its normal meaning (select in the pages view, preview in the files view).
- **Touch:** press and hold **350 ms** without moving more than 8 px → lift (a short `navigator.vibrate(10)` where supported). Moving earlier than that is a normal scroll. Cards and tiles use `touch-action: pan-y` at rest; once lifted, `touchmove` is cancelled (listener registered with `{ passive: false }`) so the page doesn't scroll under the finger, and auto-scroll takes over near the edges. Tap = the normal click meaning. The **always-visible alternatives** are Move earlier / Move later on every card, and Move earlier / Move later / Move to position in each tile's More menu; QA's AC-75 mobile checks use these.
- **While lifted:** a ghost (a snapshot of the box, `scale(var(--ip-lift-scale))`, `shadow-lg`, `cursor: grabbing`, `position: fixed`, `z-index: var(--ip-z-drag)`) follows the pointer with `transform` only. Multi-page drags show a stack of 2 offset layers and a count badge "3" (`primary`/`on-primary`). The source slot(s) stay in place at 40% opacity with a dashed `border-strong` outline: the grid does **not** reflow during the drag (no shift, no jitter). The target slot shows the 3 px `primary` slot bar in the gap nearest the pointer (left/right half of the hovered box decides before/after; rows are respected).
- **Drop:** the list updates once; items animate from old to new positions with FLIP transforms (`base`, `ease-out`; 0 ms under reduced motion). Focus goes to the moved item's main control (to the first one for a multi-move).
- **Cancel:** Escape, `pointercancel`, window blur or dropping outside the grid → the ghost animates back (`fast`) and nothing changes (AC-76).
- **Files view:** dropping a segment next to another segment of the same source joins them into one card (segments are maximal runs, §3e); the announcement says so: "alpha.pdf moved to position 1 of 2. Joined with its other pages."
- **Auto-scroll:** within 64 px of the top of the visible grid area (below the sticky toolbar) or of the bottom (above the dock), scroll by up to 16 px per frame, scaled by distance.

### M-8. Keyboard flow, focus order and ARIA

**Focus order, ready, files view (all widths).** Skip link → header → toolbar: View (radiogroup, 1 stop) → Sort → Add files → Add pages (≥ 640) or Add (< 640) → file grid (1 stop, roving) → active card's controls: Remove, Rotate left, Rotate right, Enlarge, Move earlier, Move later → end tile "Add files" → dock: options (≥ 1024, in panel order) or Options button (< 1024) → Reset options → primary → notices (action, Dismiss).

**Focus order, ready, pages view.** … → View → Sort → Thumbnail size (−, slider, +; ≥ 640) → Add files → Add pages → page grid (1 stop) → active tile's controls: action bar buttons (Rotate left, Rotate right, Remove, More), then its **insert point after it** ("Insert here, after A3"); for the first tile the "Insert here, at the start" point comes **before** the tile in the Tab sequence → end tile "Add" → selection bar (when shown; `role="toolbar"`, 1 stop, arrows inside) → dock → notices.

Only the active tile's buttons and insert point have `tabindex=0` (F1 rule), so the grid costs at most 6 Tab stops whatever its size.

**Grid keys (both views; roving tabindex, F1 U-7 navigation unchanged).**

| Keys (focus on a card or tile main control) | Files view | Pages view |
|---|---|---|
| Arrows, Home/End, Page Up/Down | Move focus (F1) | Move focus (F1) |
| Shift + Arrow / Home / End | – | Move focus and extend the selection from the anchor |
| Space | Open preview | Toggle selection of the focused tile (AC-22); sets the anchor |
| Shift+Space | – | Select the range anchor → focused tile |
| Enter | Open preview | Toggle selection (it is a toggle button) |
| Ctrl/Cmd+A | – | Select all pages |
| Escape | – | Clear selection (AC-21); if nothing is selected, no effect |
| **Alt+ArrowLeft / Alt+ArrowUp** | Move the card one position earlier | Move the tile (or the selection, if the tile is selected) one position earlier |
| **Alt+ArrowRight / Alt+ArrowDown** | One position later (AC-10) | One position later |
| **Alt+Home / Alt+End** | Move to first / last | Move to first / last (AC-20) |
| Delete / Backspace | Remove the card (undo notice) | Remove the page; confirm dialog if others are selected (§3c) |
| `[` / `]` | Rotate the card left / right | Rotate the page (or selection) left / right |
| Shift+F10 or the Menu key | – | Open the tile's More menu |
| Ctrl/Cmd+Z | Undo the last remove while the undo notice is shown | Same |

Alt+arrow moves are one position per press, by **list position**, not by visual row, so Up/Down mean "earlier/later" and match the screen-reader's list order. All Alt shortcuts call `preventDefault()` (Alt+ArrowLeft is "Back" in Chromium and Firefox on Windows/Linux; see M-11 #2). The grid hints (`aria-describedby`) name these keys, and the shortcuts are listed in a "Keyboard shortcuts" disclosure below the grid (`Button ghost sm`, collapsed by default, `Kbd` chips), so sighted keyboard users can find them.

**Single-character shortcuts** (`[`, `]`) only fire when a card or tile main control has focus, which satisfies WCAG 2.1.4.

**Dialogs and menus.** Picker: first tile → Select all → Select none → Cancel → Add (Tab wraps, native modal). Move: input → Cancel → Move. Confirm: Only this page (initial) → Remove all → Cancel. Sheet: first control … → Reset → Done → Merge PDFs. Every dialog returns focus to its opener; if the opener is gone (e.g. the tile was removed), to the item now at that position, else the grid's first item, else the `ToolIntro` heading (F1 fallback). Menus: focus returns to the trigger on Escape and after choosing an item, except where the item moves focus on purpose (Blank page → the new tile; picker/move dialogs → the dialog).

**ARIA summary (additions to F1 U-7).**

| Element | Role / attributes |
|---|---|
| File grid / page grid | `role="list"` with `aria-label` "Files in merge order" / "Pages in merge order", `aria-describedby` the key hint |
| Card main control | `button`, name "alpha.pdf, 3 pages[, pages 2–3][, rotated 90°]", `aria-describedby` hint |
| Tile main control | `button` with **`aria-pressed`** for selection, name "A1, page 1 of alpha.pdf[, rotated 90°]" / "Blank page". We use `aria-pressed` instead of `aria-selected` because `aria-selected` is only valid on `option`/`gridcell`/`row`/`tab`, and an `option` may not contain the per-page buttons (axe `nested-interactive`, AC-74). This is the "equivalent" AC-21 allows; QA asserts `aria-pressed="true"`. |
| Insert point | `button` `aria-haspopup="menu"`, name "Insert here, after A3" |
| Sort / Add / More | menu button pattern (M-4 `Menu`) |
| Selection bar | `role="toolbar"`, `aria-label="Selected pages"`; count text is not live (the flow `LiveRegion` announces changes, debounced) |
| Move earlier / later | `IconButton`s with names including the file ("Move alpha.pdf later"), native `disabled` at the ends |
| Options | `Switch` (`role="switch"`), `Select` (native), `SegmentedControl` (radiogroup); each with `aria-describedby` → its description line |
| Options button (< 1024) | `aria-haspopup="dialog"`, `aria-expanded`, name "Options, 2 changed" |
| Move dialog input | `aria-invalid`, `aria-describedby` → error line (`role="alert"` on the error) |
| Undo / duplicate notices | F1 `Notice tone="info"` → `role="status"`; action buttons "Undo" / "Remove the copy"; Dismiss "Dismiss: Removed bravo.pdf" |
| Drag ghost, slot bars, insert hover zones, selection ring | `aria-hidden="true"` |
| Live messages | One polite `LiveRegion` (F1). Messages: reading/ready (F1), "Sorted by name, A to Z", "Order reversed", "{x} moved to position {n} of {total}", "Moving {x}. Press Escape to cancel.", "Move cancelled.", "{n} selected", "Selection cleared", "{x} removed. Undo is available, press Ctrl+Z.", "{x} restored at position {n}", "Blank page added after A3", "2 pages added after A3", "Rotated {x} right", "Options reset", "Merging", "Your PDF is ready". Repeated identical messages get the F1 trailing-space trick so they are re-read. |

**Contrast.** All text uses the F1 U-2 / F2 H-2 pairs plus M-2. Selection outline, slot bar and insert point outline are ≥ 3:1 non-text against their backgrounds (M-2). The blank-page label uses `on-paper-muted` (6.87:1 on white in both themes). Disabled Move buttons use `fg-disabled` (exempt) and native `disabled`.

**Target size and reflow.** Every card and tile action is 44×44 below 1024 (M-3 math). At ≥ 1024 with a fine pointer, `sm` buttons are 32 visual with 44 hit areas (F1). At 320 CSS px (400% zoom) the grid becomes 2 columns of about 132 px: tile action bars drop to "More" only (container query, M-4), card position rows keep their two 44 px buttons and hide the "1 of 3" text, and the toolbar wraps Add into an icon button. No horizontal scroll.

### M-9. Micro-interactions

All on `opacity`/`transform`, token durations, 0 ms under reduced motion (F1 U-8).

| Moment | Interaction |
|---|---|
| First batch arrives | Cards appear in their sorted slots with no motion (F1: placeholders define layout); thumbnails fade in (`fast`). |
| Sort / Reverse | Items glide to their new positions (FLIP, `base`, `ease-out`). One animation per action; rapid repeats retarget. |
| Keyboard move | The moved item glides one slot (`fast`); neighbours glide too. Focus ring stays on the item throughout. |
| Drag lift | Ghost scales to 1.03 and gains `shadow-lg` (`instant`); source dims to 40% (`fast`). Slot bar fades in at each new gap (`instant`). |
| Drop / cancel | FLIP to the new slots (`base`) / ghost returns (`fast`). |
| Select / deselect | Outline and check badge fade/scale in (`fast`, check scales from 0.6). Selection bar slides up 8 px and fades in (`base`) on the first selection; count text swaps without motion. |
| Insert point hover | Circle fades in (`fast`) and scales 0.8 → 1; slot bar fades in. |
| Insert blank page / picked pages | New tiles appear in place; the rest glide (FLIP, `base`). New tiles get the `primary-soft` glow that fades out over 1.2 s (opacity). Focus on the first new tile. |
| View switch | Crossfade between the two grids (`fast`). No slide (it would suggest a different list). |
| Remove | Item fades and scales to 0.96 (`fast`), then the rest glide (FLIP, `base`). Undo: restored items fade in in place with the glow. |
| Rotate (card or tile) | F1 rotation animation (`base`) with the "+90°" badge. |
| Options sheet | Slides up from the bottom (`base`, `ease-out`), scrim fades (`fast`). "2 changed" chip fades in. |
| Option toggled | F2 `Switch` thumb transform (`fast`). Description line text swaps with no motion (height reserved). |
| Move dialog invalid | F1 shake (240 ms, ±4 px) on the input, error fades in. |
| Processing / done | F1. |

### M-10. Performance: `/merge-pdf` first-load JS under 150 KB gzip

| Piece | When it loads | Notes |
|---|---|---|
| Next/React runtime | first load | About 100–105 KB (shared with every route). |
| Shared flow + primitives (`ToolFlow`, dock, notices, `Dialog`, `Menu`, `Select`, `Switch`, icons) | first load | Shared with `/rotate-pdf`; `Menu` and `Select` add about 2 KB. |
| `MergeTool`, `MergeOptions`, `SegmentGrid`/`SegmentCard`, `EditablePageGrid`/`EditablePageTile`, `SelectionBar`, `lib/page-list.ts` | first load | About 10–14 KB. If the route measures above 140 KB, move `EditablePageGrid`, `SelectionBar` and `PageMoreMenu` behind `next/dynamic`, prefetched on hover/focus of the "Pages" toggle and loaded on idle after the first ready state. |
| **pdf.js** (`pdfjs-dist`, Apache-2.0) | `import()` on first intake, prefetched on hover/focus of "Choose files" / drag-enter (F1) | Thumbnails and page sizes. Never on first load. |
| **pdf-lib** (MIT) + the merge engine (`lib/pdf/merge.ts`: page copy, outlines, TOC, footer, padding, same-width, forms, image embedding) | Inside the processing Web Worker, loaded when the user runs | Never in the main bundle (F1 worker pattern). |
| **Drag module** `components/page-edit/drag.ts` (in-house, no dependency) | `import()` on idle (`requestIdleCallback`, fallback 1 s timeout) after the first ready state, and immediately on the first `pointerdown` on a card/tile if not loaded yet (the lift waits for it; 4 KB is imperceptible) | No third-party drag library. |
| `PagePickerDialog`, `MoveToPositionDialog`, `RemoveSelectedDialog`, `MergeOptionsSheet` | `next/dynamic`, loaded on first open (prefetched on hover/focus of their triggers) | Each 1–3 KB. |
| **Unicode font** (SIL OFL 1.1, e.g. a Noto Sans subset, §8a decision 8) | Fetched **by the worker only when a run starts with the footer or contents option on** (or, if the engineer keeps the standard font for Latin-1, only when a name needs other glyphs). Never on page load, never on toggling the option. | Served as a static file from our origin, cached immutable. ProcessingBar shows "Preparing fonts…" during the fetch (M-6). License text added to the third-party notices. |
| TIFF decoder (e.g. UTIF.js, MIT, if §8a decision 9 passes) | `import()` on the first TIFF in an intake | Never on first load. |
| GIF/BMP/WebP/PNG/JPEG thumbnails | Browser-native `createImageBitmap` (no pdf.js) | Downscaled to the thumbnail bucket. |

No-shift checklist additions: card height fixed (position row reserved); insert points, slot bars, ghost, selection bar, menus, sheet and notices float; option descriptions reserve two lines; Options chip has a fixed slot; Move dialog error line reserved; first batch placed in sorted slots before parsing finishes (no re-sort jump).

### M-11. Decisions and open questions for the engineer

1. **ToolFlow extension points.** F1's `ToolFlow` renders `FileGrid`/`PageGrid` from its file list and does not implement `optionsDensity: "full"` (no sheet yet), notice actions with timeouts, or the Ctrl+Z hook. Proposal: add `renderWorkspace?(ctx)` (replaces the grids), `toolbarItems?` (slots between the view toggle and Add files), `onIntake?(files, insertAt)` (so Merge places new files by name or at an insert point), the sheet in `ControlDock` for `full` density, and `FlowNotice.action` + `timeoutMs`. Rotate keeps the defaults, so F1 tests stay green. The engineer owns the exact API.
2. **Alt+ArrowLeft and browser Back.** On Windows/Linux Chromium and Firefox, Alt+Left is history Back. `preventDefault()` on `keydown` at the focused control should stop it; QA must verify on all three Playwright engines. If any engine still navigates, keep the shortcut (AC-10 needs it) and also guard with a `popstate` sentinel while the task is in progress (the F2 leave guard covers link clicks only).
3. **`aria-pressed` for selection** (M-8): please make the AC-21/AC-22 tests assert `aria-pressed="true"`; that is the "equivalent" AC-21 allows and keeps axe clean.
4. **Undo scope.** I kept undo to removals (AC-79). Sort and Reverse can wipe a careful manual order in one click; the same snapshot would make them undoable for almost no cost. Recommend extending the undo notice to sort/reverse ("Sorted by name. Undo") in this feature if the engineer agrees; otherwise note it for F5.
5. **iOS long-press.** Safari shows its own callout/selection on long-press: set `-webkit-touch-callout: none` and `user-select: none` on cards/tiles, and `draggable="false"` on thumbnail images/canvases. If the 350 ms hold still conflicts with scrolling on a real device, the buttons remain the supported path; tell me and I'll adjust the timing.
6. **Image thumbnails** need a path in the F1 thumbnail renderer that is not pdf.js (`createImageBitmap` with `resizeWidth`), and a page size for image pages (the A4 output page from §6, so the tile shows the output shape, not the raw image).
7. **Source letters beyond Z** use AA, AB… (M-4). Confirm the label format doesn't break tests that expect single letters (none of the ACs go past E).
8. **Tokens** in M-2 are mine to own; the engineer can add them to `tokens.css` in the feature PR, or I can add them in a follow-up `docs`/`style` commit before the build starts. Say which.
9. **Bundle check:** report the `next build` first-load size for `/merge-pdf` in the PR; the fallback split in M-10 applies above 140 KB.

### M-12. Copy (our own wording; keep strings in `tools/merge/copy.ts`)

| Key | Text |
|---|---|
| intro.title / summary | "Merge PDF" / "Join PDFs and images into a single document" (registry) |
| picker.button / hint / limits | "Choose files" / "or drop them here" / "PDFs and images, up to 50 files"; the full limits ("PDF, JPG, PNG, GIF, BMP, WebP or TIFF · up to 50 files, 100 MB each, 500 MB and 1,000 pages in total · you can also paste them with Ctrl+V") are the tooltip and screen-reader text *(changed 2026-11-23 per owner: minimal text)* |
| action / progress | "Merge PDFs" / "Merging… {n}%"; font phase "Preparing fonts…" |
| status | "Add files to start" · "Reading files…" · "{p} pages · {f} files" · "{p} pages · 1 file · add more to merge" |
| toolbar | "Files" · "Pages" · "Sort" · "Add files" · "Add pages" · "Add" |
| sort items | "Name A to Z" · "Name Z to A" · "Oldest first" · "Newest first" · "Reverse order" · "Add more files to sort" |
| add items | "Files…" · "Pages from a file…" · "Blank page" (insert-point: "Files here…" · "Pages from a file here…" · "Blank page here") |
| card | "Move {name} earlier" · "Move {name} later" · ~~"{i} of {n}"~~ (removed *(changed 2026-11-23 per owner: minimal text)*) · "pages {a}–{b} of {n}" · "Image · 1 page" · "{n} pages ({b} blank)" |
| tile | "Blank page" · More menu: "Duplicate" · "Move to position…" · "Move earlier" · "Move later" · "Blank page after" · "Pages from a file after…" · "Files after…" · "Enlarge" |
| selection | "{n} selected" · "Remove" · "Clear" |
| picker dialog | "Add pages from {name}" · "They go after {A3}." / "They go at the end." *(changed 2026-11-23 per owner: minimal text)* · "Select all" · "Select none" · "{n} of {t} selected" · "Add {n} pages" / "Add 1 page" / "Add pages" · "Select at least one page." |
| move dialog | "Move {A3}" / "Move {n} pages" · "Now at position {i} of {t}." · "New position (1–{t})" · "Enter a whole number from 1 to {t}." · "Move" |
| confirm | "Remove pages?" · "{A3} is one of {n} selected pages." · "Only this page" · "Remove all {n} selected" |
| undo | "Removed {name}." / "Removed {n} pages." · "Undo" |
| duplicate | "{name} was added twice" · "If that was a mistake, remove the copy." · "Remove the copy" |
| options | M-5 labels and descriptions · "Options" · "{n} changed" · "Merge options" · "Reset options" · "Done" |
| errors | "{name} couldn't be read as an image." · "{name} is larger than 50 megapixels, the limit for images." · "This tool takes up to 50 files at a time. We loaded the first 50." · "Couldn't load the font for file names. Check your connection and try again." |

### M-13. BerryPDF re-theme (2026-11-23)

After the BerryPDF design system landed on `main` (`docs/design/berrypdf.md`), Merge follows it exactly as Rotate does; where this section and M-1…M-12 disagree on a visual value, this section and the design doc win. Behaviour, ARIA and every AC are unchanged.

- **Files view cards and pages view tiles** are BerryPDF page trays (`mp-tray`, pink, 14 px radius, page number / label below in Fredoka `mp-tray__n`). The letter badge and the "+90°" badge are white pills with berry text; Remove is a soft round icon button at the tray's top corner; the floating action bar is the Rotate tool's white pill (sand outline, soft icon buttons). A selected tile gets the tray's 2.5 px berry ring and a leaf-green tick (BerryPDF in-scope look) instead of the outline + primary check; the letter badge on the tile is dropped because the label under the tray already says it (*changed 2026-11-23 per owner: minimal text*). The add tile is a dashed pale-berry tray with a round tinted plus.
- **Toolbar**: Sort and Add pages are blueberry editing tools (`mp-btn--tool`), like Add files.
- **Menus**: `mp-menu` (white, 1.5 px sand, radius 14, scale-in 0.15 s), rows radius 9 with band hover and berry text.
- **Options panel**: each group heading is a numbered step (`mp-step`); Contents page is three ChoiceTiles with small page icons; the selects take the BerryPDF Input look with the visible label hidden where the step heading already names it (Bookmarks, Form fields); descriptions become screen-reader text + tooltip (*changed 2026-11-23 per owner: minimal text*). Reset options is a soft button.
- **Bottom sheet** (< 1024 px): white, 24 px top corners, the modal's blurred berry backdrop, rises in (0.3 s overshoot), sand hairlines between header, body and footer.
- **Dialogs** (page picker, move to position, remove selected): BerryPDF Modal; quiet action on the left, the one berry fill on the right. The remove-selected confirm is Cancel (ghost) · Only this page (outline) · Remove all {n} selected (berry), with focus on "Only this page" as before. Picker tiles are small trays in a cream well.
- **Notices**: BerryPDF Alerts, top centre, dropping in (shared flow); Undo and duplicate notices keep their timer and action.
- **Motion** (CSS only, all off under reduced motion): cards and tiles rise in staggered (360 ms, 30 ms apart, capped at 300 ms); once the grid settles (700 ms) a card or tile that moves rises straight into its new place, which is the reorder feedback beside the existing drag FLIP; thumbnails ease in (shared `mp-thumb-in`); inserted tiles keep their one-off glow; the selection bar and sheet pop in; nothing loops.
- **Chunk warm-up** (2026-11-24, SEO phone budget ≤ 170 KB JS in the first second): the files-view grid and the menu chunks load at the first pointer, key, focus or drag event on the page, or after 4 s, instead of on the first idle callback; the pages-view chunk still loads 1.5 s after the first ready state.
- **Names**: the output fallback name is `berrypdf-merged.pdf`, the Producer is "BerryPDF", options are stored under `berrypdf:merge-options` (Merge has not shipped, so nothing to migrate).
