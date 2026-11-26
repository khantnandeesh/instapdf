# F4 + F5: Page tools (Split, Extract pages, Delete pages, Organize, Combine & reorder, Alternate & mix)

Status: step 1 (Analyze) done. Next: step 2 (Research, fills "Improvements") and step 3 (UX, fills "UI"), then the lead resolves §8.
Reference observed: `split-pdf`, `extract-pdf-pages`, `delete-pdf-pages`, `organize-pdf`, `visually-combine-reorder-pdf` and `alternate-mix-pdf` on the live reference site, 2026-11-26, at 1280×720 and 390×844, headless, paced at 1 action per 1.2 s or slower. We uploaded synthetic fixtures only and **ran no task**: the scripts refused to click any submit button. Result screens, downloaded file names, ZIP versus separate files and what the output files contain are therefore *unverified*. Each is marked so below with our decision, for the evaluator's first real run to confirm (list in §8b).
Evidence (never in git): `/mnt/project-files/evals-cache/f4-f5-page-tools/spec/`, indexed in its `NOTES.md`. File names in this spec, such as `split-06-select-4-10.png`, refer to that folder.

Our routes (registry slugs already present as `planned`; all `runtime: "client"`, category Organize pages):

| Our slug | Reference slug | Backlog |
|---|---|---|
| `/split-pdf` | `split-pdf` | F4 |
| `/extract-pdf-pages` | `extract-pdf-pages` | F4 |
| `/delete-pdf-pages` | `delete-pdf-pages` | F4 |
| `/organize-pdf` | `organize-pdf` | F5 |
| `/combine-reorder-pdf` | `visually-combine-reorder-pdf` (serves the reference's Merge page: same title, task type `merge`, `m-combine-empty.png`) | F5 |
| `/alternate-mix-pdf` | `alternate-mix-pdf` | F5 |

All six run entirely in the browser: pdf.js renders, pdf-lib writes, the work runs in the existing processing Web Worker, and nothing is uploaded (CLAUDE.md rule 4). Rotate (`/rotate-pdf`) shipped in F1 and is unchanged. §0c lists what it shares with these tools.

## 0. What these tools reuse

They are built **on** the existing code, not beside it. Nothing below is re-specified here.

| Existing piece | Used by | How |
|---|---|---|
| `components/tool-flow/*` (`ToolFlow`, `FilePicker`, `DropOverlay`, `NoticeStack`, `PasswordDialog`, `PageGrid`/`PageTile`, `FileGrid`, `ControlDock`, `ResultCard`, `LeaveGuard`, intake validation) | all six | The F1 flow: pick → options → run → result, password prompts, caps, errors, Continue with, Start over, Back to options. |
| F1 extension points (`decoratePage`, `renderPageActions`, `onPageKey`, `renderOptions`, `canRun`, `readyNote`, `readyStatus`) | F4 tools | Selection state, the removal mark (Delete), split marks and part bands (Split) are page decorations plus per-page actions on the F1 `PageGrid`. The grid gains a selection layer and, for Split, a focusable mark between two tiles (§3a). |
| `lib/page-list.ts` (ordered page list, segments, `moveBlock`, `removePages`, `duplicatePages`, `insertPages`, `rotatePages`, `sortPages`, `reverseSegments`, labels) | F5 tools | The single page model behind every F5 view. F5 adds a few pure helpers to it (§0b). |
| `components/page-edit/*` (`EditablePageGrid`, `SegmentGrid`, `view-model`, `dialogs`: page picker, move to position, remove-selected confirm; drag and keyboard moves) | Organize, Combine & reorder; `SegmentGrid` also for Alternate's file cards | As in Merge. Organize passes its own `labels` (the grids take a `labels` prop) instead of Merge's `copy-edit.ts` wording. |
| `tools/merge/*` and `lib/pdf/merge.ts` (`mergePdf`: sources + page list + options → one PDF, bookmarks mapping, blank pages, images) | all F5 tools | The F5 output engine. Organize and Alternate call it with fixed options (§3e, §3g). Combine & reorder **is** the Merge tool on another route (§3f). |
| `lib/pdf/outline.ts` (`readOutline`, `mapBookmarks`, `writeOutline`), `lib/pdf/zip.ts`, `lib/pdf/naming.ts` (`baseName`, `uniqueNames`, `zipName`, `mergedName`) | F4 tools | Bookmarks carried into each output, ZIP for several outputs, file names. |
| Cloud sources slot (F23) | all six | Nothing to do. The source dropdown already shows the cloud pickers when its flag is on, and these tools must not depend on it. |

### 0a. New shared pieces (F4 builds them, F5 and Rotate may reuse them)

1. **`lib/page-ranges.ts`** (pure, unit tested): parse and format page lists. Syntax: comma- or space-separated items; an item is `n`, `a-b`, `a-` (to the last page) or `-b` (from page 1). Whitespace around items and dashes is ignored, and an en dash counts as a dash. Pages are 1-based. `format()` gives the canonical text: ascending, merged runs, `", "` between items, and closed ranges (`10-12`, not `10-`). Errors name the bad item and say why: not a number, page 0, past the last page, start after end (`5-3`).
2. **Selection layer on `PageGrid`** for the F4 "pick pages" tools (Extract, Delete): click toggles a page, Shift+click selects the range from the last clicked page, Ctrl/Cmd+click toggles as well, Space toggles the focused tile, Shift+Space extends the range. `aria-selected` sits on each tile and the selected count is announced. This is deliberately different from Merge/Organize, where a plain click selects only that page (§8 decision 3).
3. **Range field ↔ grid sync** (Extract, Delete, Split's Custom mode): a change on either side updates the other. The field is rewritten in canonical form on blur, and on every grid change.
4. **Worker job kinds** `split`, `extract` and `delete` in `lib/pdf/jobs.ts` / `processing.worker.ts`. All three are one operation: "copy these source page indexes, in this order, into a new document, and map the outline onto it". Split runs it once per part.

### 0b. New helpers on the page list (F5)

`selectAll`, `invertSelection` (UI state, not list operations), `reverseRange(pages, uids)` (§3e), `keepOnlySource(pages, sourceId)`, and `interleave(sources, settings)` (§3g), which builds Alternate's page list. All are pure and unit tested.

### 0c. Shared with Rotate (F1)

- Rotate's per-page rotation logic (`lib/pdf/rotation.ts`) is what Organize's per-page rotate uses (through `rotatePages`). `/Rotate` = original + delta, mod 360.
- Rotate keeps its All/Odd/Even scope. It does **not** gain the range field in this feature. That is a candidate improvement for step 2, and the parser in §0a makes it cheap.
- Rotate's result screen gains the six tools in "Continue with" automatically, because `continueTargets()` reads the registry (AC-412).

### 0d. Registry changes (`apps/web/src/tools/registry.ts`; the builder owns the exact shape)

| Field | Split | Extract | Delete | Organize | Combine & reorder | Alternate & mix |
|---|---|---|---|---|---|---|
| `status` | `beta` | `beta` | `beta` | `beta` | `beta` | `beta` |
| `accept` | PDF only | PDF only | PDF only | PDF + images (Merge's list) | PDF + images | PDF + images |
| `maxFiles` | 20 | 20 | 20 | 50 | 50 | 50 |
| `maxFileBytes` / `maxTotalBytes` / `maxTotalPages` | F1: 100 MB / 500 MB / 1,000 | same | same | same | same | same |
| `defaultView` | `pages` | `pages` | `pages` | `pages` | `pages` | `files` |
| `requiredPermissions` | none | none | none | none | none | none |
| `optionsDensity` | `full` (modes + parts list) | `compact` | `compact` | `compact` | `full` (Merge options) | `compact` |
| `outputName` | §6a | §6b | §6c | §6d | Merge's (`<first>_merged.pdf`) | §6e |

`actionLabel` and `progressLabel` are our own short wording (for example "Split PDF" / "Splitting").

Consequences that must ship in the same PRs:

- F2 tests and `e2e/f3/edge.spec.ts` use `/split-pdf` as their example of a **planned** tool (`e2e/f2/home.spec.ts`, `leave-guard.spec.ts`, `menu.spec.ts`, `axe.spec.ts`, `recent.spec.ts`, `pages.spec.ts`, `e2e/f3/edge.spec.ts`). They must switch to a slug that stays planned (for example `/split-pdf-by-bookmarks`). F2's "read counts from the registry" rule keeps the rest valid.
- Each tool needs its `seoContent` entry checked against the real behaviour and limits below (`src/tools/seo.ts` already has stubs for all six), an `opengraph-image.tsx`, and its route folder added to `AREAS` in `apps/web/scripts/ci/affected.mjs`.

### 0e. Inherited shared ACs

These are **not** re-specified. QA runs them again on each route named, with the F1/F3 fixtures, and the evaluator scores them as part of this feature.

**F1 ACs on `/split-pdf`, `/extract-pdf-pages`, `/delete-pdf-pages`:**

| F1 AC | How it applies |
|---|---|
| AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10, AC-11, AC-12 to AC-19, AC-20 to AC-22, AC-24 to AC-27, AC-29, AC-39, AC-44, AC-46 to AC-57 | As written. AC-5 is checked with every option in use. On Extract and Delete, AC-2's tiles start unselected. |
| AC-1 | Replaced by AC-400. |
| AC-9 | **Adapted:** removing one of two files leaves the other, and the run's output follows §6 for one input. |
| AC-23, AC-28 | **Adapted:** the unlocked or owner-restricted file runs through the tool (Extract page 1, Delete page 1, Split every page), and every output opens without a password. AC-411 covers the restricted case on all three. |
| AC-38 | **Adapted:** the primary action is also disabled while the tool has nothing to do: no pages picked (Extract), no pages marked or every page marked (Delete), or an invalid range or number (all three). |
| AC-41, AC-42 | **Adapted:** download names and ZIP rules per §6. |
| AC-43 | **Adapted:** the result screen lists the other page tools. Continuing from a Split ZIP offers no PDF tools (its output is a ZIP). Continuing from Extract into Delete opens Delete ready with the extracted file. |
| AC-45 | As written. Back to options keeps the mode, the selection or marks, the ranges, the part names and the options. |
| AC-30 to AC-37, AC-40 | Not applicable (Rotate options and the Rotate size bound). |

**F1 + F3 ACs on `/organize-pdf`:** the F1 ACs as F3 §0a lists them for Merge, plus F3 AC-17, AC-19 to AC-35, AC-36, AC-37, AC-39, AC-68, AC-73 to AC-76 and AC-79 (pages view, editing, picker, one model, keyboard, a11y, phone, undo), run with `alpha.pdf` + `bravo.pdf`. Adaptations: the first batch is **not** sorted by name (§2), so pick `alpha.pdf` before `bravo.pdf`. Running means Organize's primary action, and output names follow §6d. Not applicable: F3 AC-1 to AC-16 and AC-40 to AC-67 (Merge's files-first intake, image card details and Merge options). Organize has no Merge options (§3e).

**F3 ACs on `/combine-reorder-pdf`:** **all** F3 ACs (AC-1 to AC-80) run on this route unchanged, except AC-2, which is replaced by AC-510 (the workspace opens in the Pages view). F3's own inherited F1 table applies as written.

**F1 + F3 ACs on `/alternate-mix-pdf`:** F1 AC-3 to AC-6, AC-8, AC-11 to AC-17, AC-19 to AC-22, AC-24 to AC-27, AC-29, AC-39, AC-44 to AC-57 as written (AC-18 adapted to the 50-file cap). F3 AC-9, AC-10, AC-11, AC-15, AC-16, AC-76 and AC-79 (card drag, keyboard move, Move earlier/later buttons, remove, enlarge, drag announcements, undo) run on Alternate's file cards with `odd.pdf` + `even.pdf`.

## 1. Purpose

These six tools cover "I need different pages than the ones I have". **Split** cuts one or more PDFs into several smaller files: one per page, one per fixed number of pages, one per two-page spread, or exactly where the visitor says, by clicking between pages or typing ranges. **Extract pages** keeps only the pages the visitor picks, in one new file. **Delete pages** drops the pages the visitor marks and keeps the rest. **Organize** gives the full page workbench in one grid: drag pages into a new order, turn, copy or drop them, add blank pages or pages from other files, select in bulk, reverse, and save one PDF. **Combine & reorder** is our Merge tool opened straight into its page view, for people who think "pages" before "files". **Alternate & mix** weaves several files together page by page, for example the fronts and the backs from a single-sided scanner, with each file read forwards or backwards and taking a chosen number of pages per turn. Every result is made on the visitor's device, and pages are copied, never re-rendered.

## 2. Inputs

| Aspect | Reference (observed) | BerryPDF decision |
|---|---|---|
| Accepted types | Split, Extract, Delete, Organize: `.pdf` only. Alternate: `.pdf` on the first pick, but its "add more" input also takes images (png, gif, jpg, tif, bmp, webp). Combine & reorder = Merge (PDF + images). (`final-log.json`) | F4: PDF only. F5: PDF + images (Merge's list and intake). One page model, so images cost nothing extra. Each image is one page; in Alternate it is a one-page file (§3g). |
| Several files | Split, Extract, Delete: free users get **one file per task** (upgrade banner, `limit-split-two-files.png`). Paid users get a files/pages view toggle. Organize and Alternate: several files by design. | All six take several files. F4: up to 20, each processed on its own (§6). F5: up to 50 in one output. |
| Initial order | Organize kept the pick order (twelve picked before three → A, B, `organize-02-loaded.png`). Alternate shows the pick order with numbered cards. Merge sorts by name. | Organize and Alternate keep the **pick order** of each batch; later batches are appended. Combine & reorder sorts the first batch by name (it is Merge). |
| Drag and drop, paste | Whole page is a drop target. | F1 behaviour. |
| Cloud and URL | Dropbox, Google Drive and OneDrive in the upload menus (also in Organize's Add files / Add pages menus). | The F23 source slot, no extra work. Not a dependency. |
| Encrypted (user password) | F1 password dialog. | F1 (inherited). |
| Owner-restricted | Loads without a prompt on Extract and Organize (`restricted-extract.png`, `restricted-organize.png`). | Same on all six (no `requiredPermissions`). Outputs are not encrypted. |
| Page caps (free) | Split, Extract, Delete, Alternate: 200 pages per document, 50 MB, 3 tasks per hour (stated in the empty state). Organize: 50 pages; a paywall banner appears as soon as more than 50 pages are loaded (`organize-09-sixty.png`). With a 250-page file on Split and Delete no warning appeared before running (`limit-split-250pages.png`), so the cap is applied at run time (*unverified*). | 1,000 pages, 100 MB per file, 500 MB per task, no hourly cap, no banner (§2a). |

### 2a. Reference paywall → free on BerryPDF (mission goal 2)

| Reference free-tier limit (these tools) | BerryPDF, free |
|---|---|
| One file per task on Split, Extract, Delete (batch is paid) | 20 files per task, each processed separately (AC-407) |
| 200 pages per document (Split, Extract, Delete, Alternate); 50 pages (Organize, Combine) | 1,000 pages per task (AC-410, AC-482) |
| 50 MB per file; 5 MB per image (Combine) | 100 MB per file, 500 MB per task; images capped by megapixels (F3), not bytes |
| 3 tasks per hour, 30 files per hour | No hourly cap (browser tools) |
| Files view / pages view toggle on F4 only for paid users with several files | Shown whenever two or more files are loaded (F1) |

## 3. Options and controls

### 3a. Shared F4 controls (Split, Extract, Delete)

| Control | Type | Default | Allowed values | Effect |
|---|---|---|---|---|
| Page grid | F1 `PageGrid`, pages view; files view when ≥ 2 files | – | – | Shows every page. Per-tile actions: Enlarge (all three) and the tool's own action (Delete: Remove toggle). No reorder and no rotation on F4 tiles (the reference shows only enlarge on hover). |
| Range field | text field with the §0a syntax; inline error tied to it (`aria-invalid`, `aria-describedby`) | empty | §0a syntax | Extract: pages to keep. Delete: pages to remove. Split (Custom): the parts. Two-way synced with the grid. **Reference:** the field is filled from clicks, but typing does not highlight tiles (one-way, `extract-06-typed.png`), and a bad value shows nothing until the run (`split-10-select-invalid.png`). We validate as the user types (after a short pause) and on blur. |
| Clear selection | button, shown when anything is selected or marked | – | – | Clears tiles and field. Escape does the same when focus is in the grid. |
| Several files: one field for all | – | – | – | Typing in the field applies the same pages to **every** file. A page number past a file's end is ignored for that file; it is an error only when it is past the end of every file. Clicking a tile changes only that file; when the files then differ, the field is emptied and shows a short "differs per file" placeholder, and typing again applies to all. |
| More options → Remove bookmarks | checkbox | off | on/off | On: the output(s) have no outline. Off: each output keeps the bookmarks whose target page it contains, pointing to that page's new position; a bookmark whose target is gone is dropped and its children move up one level (Merge's rule). Reference: a checkbox with the same meaning on all three. |
| More options → File names | text pattern (Split, Extract only) | Split: `{name}-{pages}`; Extract: `{name}` | tokens `{name}` (base name), `{pages}` (e.g. `1-4` or `5`), `{first}`, `{last}`, `{n}` (part number, Split), `{date}` (YYYYMMDD) | Names each output; `.pdf` is added. Characters not allowed in file names become `-`. Duplicate names get ` (2)`, ` (3)`… (`uniqueNames`). Reference: a pattern field with its own tokens (base name, page, file number, timestamp). |
| Remembered options | – | – | – | Split's mode, N and pattern; Extract's pattern; and the bookmark checkbox on all three are kept in `localStorage["berrypdf:<slug>-options"]`. Selections and marks are never remembered. |

### 3b. Split (`/split-pdf`)

Reference flow: after upload it shows a separate **choose a mode** screen with four cards and a Continue button (`split-pdf-02-loaded.png`). Continue picks the first card. Three cards open the page screen, but the "every even page" card **runs the task immediately** (`js/split-pdf.min.js`). On the page screen, scissors marks between pages set the cuts, colour bands show the parts, and a "file names (n)" panel lists each part with its pages and a rename dialog (`split-06-select-4-10.png`, `split-14-rename-modal.png`).

Ours: no extra screen. The mode is an option in the dock, the grid is visible at once, and a parts list previews the outcome live. Nothing runs until the primary action is pressed.

| Control | Type | Default | Allowed values | What it does to the output |
|---|---|---|---|---|
| **Mode** | 4-way segmented control | **Every page** (the reference's preselected card) | Every page · Every N pages · Spreads · Custom | Every page: one file per page. Every N pages: files of N pages; the last has the rest. Spreads: page 1 alone, then pairs 2–3, 4–5, …, and the last page alone if it is left over (the reference's "split at every even page": 12 pages → 7 files). Custom: the parts are the ranges in the range field (below). |
| N (Every N pages) | integer field with −/+ steppers | **2** (the reference card shows "×2", its field gets 4 when chosen; §8 decision 4) | 1 … 9,999 | Part size. 0, negative, decimal or empty shows an inline error and disables the primary action. Reference: 0 is silently ignored (`split-13-everyx-0.png`). N ≥ page count → one part. |
| Split marks | a focusable toggle button between every two tiles of the same file (accessible name "Split after page 4", `aria-pressed`) | reflects the mode | on/off | In Custom mode, toggling a mark on splits the part that holds both pages; toggling it off joins the two neighbouring parts when they are contiguous. In the other modes the marks show the mode's cuts, and toggling one switches to **Custom** with the current parts as the starting ranges, then applies the toggle. Marks between pages that are in no part are hidden. Tile click: no action (the reference does nothing either). |
| Range field (Custom) | §3a | empty → one part = the whole file | §0a syntax | **One part per range, in the typed order, kept as typed** (not merged or sorted): `1-3, 8-9, 12` → 3 parts. Pages in no range are left out of every output and shown dimmed with a "not included" state. Overlapping ranges are allowed, and a page then appears in both parts. When the marks change, the field is rewritten as the list of parts. *Reference:* its help text promises the same one-file-per-range result, but its live preview treats typed ranges as cut points (pages between ranges become extra parts). *Unverified*; the evaluator's run decides (§8b). |
| Part bands | decoration | – | – | Tiles of the same part share a band colour (5 rotating hues, with a non-colour cue too: the part number in the tile's label and accessible name, e.g. "page 5, part 2 of 3"). The reference colour-codes the same way. |
| Parts list | list in the dock: count, then one row per part with its name and page range | – | – | Live preview of the outputs, in output order. Clicking a name edits it inline (Enter saves, Escape cancels). The reference hides its list once there are more than 20 marks; ours is virtualised and always shown. |
| More options | §3a | | | Remove bookmarks, File names. |

### 3c. Extract pages (`/extract-pdf-pages`)

| Control | Type | Default | Allowed values | What it does to the output |
|---|---|---|---|---|
| Quick pick | 3-way segmented control | **Custom** | Odd · Even · Custom | Odd/Even select those pages in the grid **and** write them into the field (the reference hides and clears the field instead, and the tiles show nothing: `extract-07-odd.png`). Any later click or edit switches it back to Custom. Odd/even are 1-based within each file. |
| Page selection | §0a selection layer + range field | nothing selected | – | The selected pages go into **one** PDF per input file, in **document order** without repeats (typing `9, 2-3` gives 2, 3, 9; §8 decision 6). |
| More options | §3a | | | Remove bookmarks, File names. |

The primary action is disabled with no page selected, and the status line says how many pages will be kept ("5 of 12 pages"). Selecting every page is allowed.

### 3d. Delete pages (`/delete-pdf-pages`)

Reference: each tile has a large Remove button; one click makes the tile **disappear** and adds its number to a "type an interval" field (`delete-04-after-p2.png`). There is no way back except reloading. After 5 removals a hint suggests typing an interval (`delete-05-after-5.png`). Tile clicks do not select (`delete-08-others-selected-prompt.png`). Running with nothing removed shows an error after pressing the button (`js/delete-pdf-pages.min.js`).

Ours:

| Control | Type | Default | Allowed values | What it does to the output |
|---|---|---|---|---|
| Remove toggle | button on every tile (always visible on touch, on hover/focus with a fine pointer), `aria-pressed` | off | on/off | Marks the page for removal. The tile **stays** in place, dimmed with a clear removal mark, so the visitor sees what goes and can take it back with one more click. Delete or Backspace on a focused tile toggles too. Tile click, Shift+click and Space follow §0a, so a click anywhere on the tile toggles the mark. |
| Range field | §3a | empty | §0a syntax | Pages to remove, synced with the marks. |
| More options | §3a | | | Remove bookmarks. |

Status line: "{kept} of {total} pages kept". The primary action is disabled with nothing marked, and also when **every** page of a file is marked, with an inline message naming that file and saying at least one page must stay.

### 3e. Organize (`/organize-pdf`)

Reference: one page grid with letter-prefixed labels (A1, B3), no files view and no options. Toolbar: Add files ▾, Add pages ▾ (local, cloud, blank page), Composer (a side panel listing one loaded file's pages to drag in again, used ones dimmed), Selection ▾ (select all, deselect all, invert, delete selected), Reorder ▾ (reverse order), Add blank page, Delete ▾ (delete all, keep only one file). Per tile: enlarge, rotate left/right, duplicate, move, remove. A "+" mark between tiles opens Add files / Add pages (`organize-02-loaded.png`, `organize-03-menu-*.png`, `organize-06-hover.png`, `organize-07-addmark-menu.png`, `organize-08-composer.png`). Reverse order works on the whole list, or on a selection only if it is consecutive; otherwise an error asks to fix the selection (`organize-05-reverse-nonconsecutive.png`). One action button saves.

Ours: Merge's workspace (one page list, `EditablePageGrid` with insert points, the picker, move dialog, selection bar, undo, files view as segments) with Organize's toolbar and **no** Merge options panel. Everything F3 §3c–§3e specifies applies. Organize adds:

| Control | Type | Default | Effect |
|---|---|---|---|
| Default view | – | **Pages** | The workspace opens in the pages view. The files view toggle is shown from one file (Merge's rule). |
| Select ▾ | menu | – | Select all (also Ctrl/Cmd+A with focus in the grid) · Select none (also Escape) · Invert selection. |
| Reverse | toolbar button (in a "Sort ▾" menu next to Merge's sorts: Name A–Z, Name Z–A, Last modified ×2, Reverse) | – | Nothing selected: reverses the whole list. A selection: reverses the order of the selected pages **among their own positions**, so a consecutive block is mirrored in place, and a scattered selection swaps its pages end for end while the other pages stay put (the reference refuses this case). |
| Remove ▾ | menu | – | Remove selected · Keep only {file} (one entry per source) · Remove all. Each shows the F3 undo notice. Remove all returns to the empty state with Undo. |
| Add pages → From a loaded file | menu entry per loaded source | – | Opens the F3 page picker on that source, with pages already in the list marked "in use" (not disabled: a second copy is allowed). This replaces the reference's side "composer" panel (§8 decision 8). |
| Per-tile actions | F3 | – | Enlarge, rotate left/right, duplicate, move to position, remove, insert after (blank / pages / files). |

Output engine: `mergePdf` with fixed options: bookmarks **Keep all** (following edits), no contents page, no footer, no padding, no same-width, form fields **Merge, rename duplicates**. *Reference bookmark handling unverified.*

### 3f. Combine & reorder (`/combine-reorder-pdf`)

The reference serves its Merge page at this address, and its Merge page says the old visual combine tool now lives in Organize. Ours is the **Merge tool** on its own route, with:

- the workspace switching to the **Pages view** as soon as the first file is in (Merge opens in the files view);
- everything else exactly Merge's: first-batch name sort, both views, every Merge option and its remembered values (`berrypdf:merge-options`, shared with `/merge-pdf`), and Merge's output name;
- its own title, `h1`, one-line description, SEO entry and guide (keyword "combine and reorder PDF pages"), canonical to itself.

`MergeTool` currently binds `flowTool("merge-pdf")`. It becomes parameterised by slug (the builder picks the shape), so both routes render the same component.

### 3g. Alternate & mix (`/alternate-mix-pdf`)

Reference: a list of numbered file cards, each showing the file name without extension and no thumbnail or page count, with "pick pages in: regular / reverse order" and "switch document after reading [1] pages". Cards drag to reorder and have a remove ×. Beside the list: Add more files ▾, Sort A–Z, Sort Z–A. One action button (`alternate-02-loaded.png`). A one-page file is flagged by the page script to be repeated (`js/alternate-mix-pdf.min.js`); its effect on the output is *unverified*.

Ours: file cards on the files view (F3 `SegmentGrid` cards: thumbnail, name, page count, move earlier/later, remove, enlarge, drag, keyboard moves), each card with:

| Control | Type | Default | Allowed values | Effect |
|---|---|---|---|---|
| Order | 2-way segmented control on the card | **Normal** | Normal · Reverse | Reverse reads that file from its last page to its first (for backs scanned in reverse). |
| Pages per turn | integer field with −/+ | **1** | 1 … 9,999 | How many pages this file gives each time it is its turn. 0, decimal or empty → inline error, primary disabled. A value above the file's page count is allowed (it gives everything in one turn). |
| Repeat (one-page files only) | checkbox on the card | **on** | on/off | On: the page is used again in every round (for a separator or cover sheet between groups). Off: used once. Shown only on files with exactly one page (images included). |
| Sort ▾ | menu in the toolbar | – | Name A–Z · Name Z–A | Reorders the cards (natural, case-insensitive). |
| Result preview | the Pages view | – | – | The pages view shows the **resulting** page order (tiles A1, B1, A2, B2…), read-only: no drag, remove or insert. It updates on every setting change. The reference has no preview. |

**Interleave rule** (`interleave()`, our definition; the reference's handling of uneven files is *unverified*): go through the cards in order, round after round. On its turn a file gives its next `pages-per-turn` pages (in its chosen order), or fewer if it has fewer left. A file that is used up is skipped. A one-page file with Repeat on is never used up. **Before** each turn, if every file without Repeat is used up, stop. So leftover pages of a longer file follow at the end, and a repeated page never trails the last real page.

Output engine: `mergePdf` on the interleaved page list, with bookmarks **Remove all** (bookmarks from interleaved files would be out of order), form fields **Merge, rename duplicates**, and nothing else. It needs at least **two** cards (a single one-page file with Repeat does not count as two): with one file the primary action is disabled and the status line asks for another file.

## 4. States

All F1 states apply (U-6). Additions:

| State | Split | Extract | Delete | Organize / Combine | Alternate |
|---|---|---|---|---|---|
| **Empty** | F1 drop card; copy gives the caps (20 files, 100 MB each, 1,000 pages) and says nothing is uploaded | same | same | F3 drop card (PDFs and images, 50 files) | same as Organize |
| **Loading / password** | F1 | F1 | F1 | F3 (locked card or tile in place) | F1, locked card |
| **Ready** | Grid with marks and bands, mode control, parts list, primary enabled. Status: "{n} files" from the mode | Grid, quick pick, field. Primary disabled until a page is picked. Status: "{k} of {n} pages" | Grid with remove toggles, field. Primary disabled until a page is marked. Status: "{kept} of {n} pages kept" | F3 ready states (pages view default) | Cards with per-file settings, primary enabled from 2 files. Status: "{pages} pages · {files} files" |
| **Invalid input** | Field or N shows an inline error; primary disabled | field error | field error, or "keep at least one page" | – | per-turn error on the card |
| **Processing** | F1 progress, determinate by parts written | F1 | F1 | F3 | F1 |
| **Done** | F1 result card: ZIP (entry list) or one PDF (preview), Download, Continue with (PDF only), Start over, Back to options | one PDF (or ZIP for several inputs) | same as Extract | one PDF | one PDF |
| **Error** | F1 intake and processing errors | same | same | same | same |
| **Limit reached** | F1 notices with our caps; never an upgrade prompt | same | same | same | same |
| **Session expired** | Not reachable (browser tools) | same | same | same | same |

## 5. Errors and limits

Copy the behaviour, never the wording.

| Case | Reference | BerryPDF |
|---|---|---|
| Wrong type | Red top banner asking for PDFs; stays empty (`wrongtype-alternate.png`) | F1: error naming the file and the accepted kinds; other files still load. |
| Corrupt PDF | Red top banner naming the file, then an empty grey grid with the action button still active (`corrupt-extract.png`) | F1: error naming the file, back to the previous state, primary never enabled with no usable file. |
| Two files on Split/Extract/Delete | Upgrade banner, only the first file kept | Both load (AC-407). |
| Over the free page cap | Organize: paywall banner over 50 pages. Others: no warning before the run (*unverified* at run time) | No cap below 1,000 pages; above it, F1's rejection message. |
| Invalid range text | No feedback until the run (`split-10-select-invalid.png`) | Inline error naming the bad item and the reason (§0a); primary disabled. |
| Split N = 0 or not a number | Ignored silently | Inline error; primary disabled. |
| Nothing picked (Extract) / nothing marked (Delete) | Delete: error banner after pressing the button. Extract: *unverified* | Primary disabled, with a short hint in the status line. |
| Every page marked (Delete) | *Unverified* | Primary disabled; inline message naming the file. |
| Several files, a range that hits no page of one file (Extract) | – (single file only) | That file is skipped. A notice names it. If no file is left, the primary is disabled. |
| Reverse with a scattered selection (Organize) | Error banner asking for consecutive pages | Works (§3e). |
| Alternate with one file | Action stays enabled (*unverified* result) | Primary disabled; status asks for another file. |
| Processing failure | Generic retry message | F1 error panel with Retry; mode, selection, marks, ranges, names and per-file settings are kept. |

## 6. Output

Common to all: pages are **copied** with pdf-lib, not re-rendered. Content streams, text, annotations, form widgets and page boxes are kept, and `/Rotate` is the original value plus any user rotation (Organize, Combine), mod 360. Producer is "BerryPDF". No encryption, even for encrypted inputs (F1 AC-29 note). Unused resources are not copied: an output holding one page of a 60-page file is a fraction of its size.

### 6a. Split

- One output per part, named by the pattern (default `{name}-{pages}`): `twelve-1-4.pdf`, `twelve-5.pdf`. *Reference:* its live parts list names a part after its **last** page (`twelve-4.pdf` for pages 1–4, `split-06-select-4-10.png`); the downloaded names are *unverified*. We put the whole range in the name (§8 decision 5).
- **Several parts → one ZIP**, flat, entries in output order. One input: `<base>-split.zip` (for example `twelve-split.zip`). Several inputs: `berrypdf-split.zip`, with every input's parts in one flat list (names carry the base name). **Exactly one part → a single PDF**, not a ZIP. *Reference ZIP versus separate downloads, and its ZIP name, are unverified.*
- Each part keeps the bookmarks that point into it (§3a), unless Remove bookmarks is on.

### 6b. Extract pages

- One PDF per input with the selected pages in document order. Default name: the pattern `{name}` → the **original file name** (`twelve.pdf`). This follows the reference's default pattern; the downloaded name is *unverified* (§8 decision 7).
- Several inputs: a ZIP `berrypdf-extract.zip` with one PDF per input that still has pages (F1 duplicate-name rule).

### 6c. Delete pages

- One PDF per input without the marked pages, in the original order. Name: the original file name (the reference offers no pattern on Delete; downloaded name *unverified*).
- Several inputs: a ZIP `berrypdf-delete.zip`.

### 6d. Organize

- One PDF, the page list order exactly. Name: `<first source's base name>_organized.pdf`. *Reference:* the hidden output-name field holds `<first>_merged.pdf` before the run, even with one file (`organize-log.json`). We use a name that says what happened (§8 decision 9). Combine & reorder keeps Merge's `<first>_merged.pdf`.
- Bookmarks kept and following edits; blank pages as in Merge (size of the page in front).

### 6e. Alternate & mix

- One PDF with the interleaved order (§3g). Name: `<first card's base name>_mixed.pdf` (*reference unverified*). No outline. Pages keep their sizes and rotation.

## 7. Acceptance criteria

Fixtures (QA generates them in `tests/fixtures/` with a script, no third-party content):

- `twelve.pdf`: 12 A4 portrait pages, text "Twelve 1".."Twelve 12". Outline: "Intro" → p1; "Middle" → p5 with child "Detail" → p6; "End" → p10.
- `mixed-sizes.pdf`: 4 pages: 595×842 "Mixed 1"; 792×612 "Mixed 2"; 420×595 "Mixed 3"; 595×842 with `/Rotate 90` "Mixed 4".
- `odd.pdf`: 5 pages "Page 1", "Page 3", "Page 5", "Page 7", "Page 9". `even.pdf`: "Page 2".."Page 10" ascending. `even-reversed.pdf`: "Page 10", "Page 8", …, "Page 2".
- `short.pdf`: 2 pages "Short 1", "Short 2". `separator.pdf`: 1 page "Separator".
- `big-250.pdf`: 250 pages "Big 1".."Big 250" (above the reference's 200-page cap).
- From F1/F3: `three-pages.pdf` ("Page 1".."Page 3"), `sixty-pages.pdf`, `user-pw.pdf`, `owner-restricted.pdf`, `corrupt.pdf`, `notes.txt`, `alpha.pdf`, `bravo.pdf`, `charlie.png`.

"Output" means the downloaded file(s), checked with a PDF library (page count, `/Rotate`, MediaBox, outline, encryption) and text extraction. ZIPs are unpacked and checked per entry. "Run" means pressing the primary action and then Download. **(ref)** = behaviour seen on the reference; **(ours)** = our decision or improvement (the evaluator does not compare it, but it must pass). Unless stated otherwise, one file is picked and options are at their defaults.

### F4 shared (Split, Extract, Delete)

- **AC-400 (P0) (ref)** `/split-pdf`, `/extract-pdf-pages` and `/delete-pdf-pages` each show the tool (not a coming-soon page). Their file input accepts `.pdf` and allows multiple files.
- **AC-401 (P0) (ours)** On each of the three, picking `twelve.pdf` reaches the ready state with 12 thumbnails labelled 1–12 and the primary action in view, with **no** intermediate "choose a mode" screen. On Split the mode control shows Every page selected and the status says 12 files.
- **AC-402 (P0) (ours)** On Extract, typing `1-3, 5, 10-` selects tiles 1, 2, 3, 5, 10, 11 and 12 (`aria-selected="true"`, no others). Typing `-2` selects 1 and 2. After blur the field reads `1-3, 5, 10-12` for the first input.
- **AC-403 (P0) (ours)** On each of the three, each of `abc`, `0`, `13`, `5-3` and `2-x` in the range field shows an inline error naming the bad item, sets `aria-invalid="true"` on the field and disables the primary action. Replacing it with `2` clears the error.
- **AC-404 (P1) (ours)** On Extract and Delete: clicking tile 2 and then tile 4 selects (or marks) both, and clicking 4 again unselects it. Clicking 6, then Shift+clicking 9 adds 6–9. Space on a focused tile toggles it, and Ctrl/Cmd+click behaves like a click.
- **AC-405 (P0) (ref)** On Extract: clicking tile 2, Shift+clicking tile 5 and clicking tile 9 puts `2-5, 9` in the range field.
- **AC-406 (P1) (ours)** After selecting pages, Clear selection (and Escape with focus in the grid) unselects every tile and empties the field.
- **AC-407 (P0) (ours)** On each of the three, picking `twelve.pdf` and `three-pages.pdf` together loads both (no single-file or upgrade message), and the files/pages view toggle is shown.
- **AC-408 (P1) (ours)** With `twelve.pdf` and `three-pages.pdf` on Extract, typing `1-2` selects pages 1–2 of **both** files. Clicking page 3 of `three-pages.pdf` then changes only that file, and the field becomes empty with its "differs per file" placeholder. Typing `1` again selects page 1 in both and nothing else.
- **AC-409 (P1) (ref)** The Remove bookmarks checkbox sits under More options on all three and is off on a first visit. After setting Split to Every N pages with N = 3, a custom name pattern and Remove bookmarks on, a reload shows the same settings.
- **AC-410 (P1) (ours)** `big-250.pdf` loads on Delete with no limit or upgrade message. Removing page 1 and running gives 249 pages, the first with text "Big 2".
- **AC-411 (P0) (ref)** `owner-restricted.pdf` loads with no password prompt on all three. Extracting page 1 gives a 1-page PDF, deleting page 1 gives a 2-page PDF, and Split's every-page mode gives 3 one-page PDFs. All of them open without a password.
- **AC-412 (P1) (ours)** After this feature ships, Rotate's result screen lists Split, Extract pages, Delete pages, Organize, Combine & reorder and Alternate & mix under Continue with. Choosing Delete pages opens it in the ready state with the rotated file loaded (3 thumbnails).

### Split

- **AC-420 (P0) (ref)** Default mode with `twelve.pdf`: the parts list shows 12 parts. Running gives `twelve-split.zip` with exactly 12 entries `twelve-1.pdf` … `twelve-12.pdf`, in that order, each 1 page whose text is "Twelve n".
- **AC-421 (P0) (ref)** Every N pages shows N = 2 and 6 parts. Setting N = 5 shows 3 parts. Running gives entries `twelve-1-5.pdf` (5 pages), `twelve-6-10.pdf` (5) and `twelve-11-12.pdf` (2), with texts in page order.
- **AC-422 (P1) (ours)** N = `0`, `-1`, `2.5`, `x` or empty shows an inline error and disables the primary action. N = 12 and N = 20 each show 1 part.
- **AC-423 (P0) (ref)** Spreads gives 7 parts. Running gives page counts [1, 2, 2, 2, 2, 2, 1], with the first page texts of the parts being Twelve 1, 2, 4, 6, 8, 10 and 12.
- **AC-424 (P0) (ref)** In Custom mode, turning on the marks after page 4 and after page 10 shows `1-4, 5-10, 11-12` in the field and 3 parts in the list. Tiles 1–4, 5–10 and 11–12 carry parts 1, 2 and 3 in their accessible names. Running gives `twelve-1-4.pdf` (4 pages), `twelve-5-10.pdf` (6) and `twelve-11-12.pdf` (2).
- **AC-425 (P1) (ours)** Each mark is a button reachable by Tab, named "Split after page n", with `aria-pressed`. Enter or Space toggles it. After AC-424, toggling the mark after page 4 off makes the field read `1-10, 11-12`.
- **AC-426 (P0) (ours)** Custom with `1-3, 8-9, 12` typed shows 3 parts. Tiles 4–7, 10 and 11 show the "not included" state, and their marks are hidden. Running gives 3 entries with 3, 2 and 1 pages and the texts Twelve 1–3, Twelve 8–9 and Twelve 12.
- **AC-427 (P1) (ours)** Custom with `1-4, 3-6` gives 2 parts. The output's first entry has Twelve 1–4 and the second has Twelve 3–6.
- **AC-428 (P1) (ours)** In Every N pages with N = 4, toggling the mark after page 6 switches the mode to Custom, and the field reads `1-4, 5-6, 7-8, 9-12`.
- **AC-429 (P0) (ref)** The parts list shows the part count and, for each part in output order, its file name and page range, and these match the run's ZIP entries exactly (checked after AC-424).
- **AC-430 (P1) (ref)** Renaming the first part in the parts list to `intro` gives the entry `intro.pdf`. Renaming it to `a/b` gives `a-b.pdf`.
- **AC-431 (P1) (ref)** The file-name pattern defaults to `{name}-{pages}`. With `{name}_part{n}` and Every N = 4 the entries are `twelve_part1.pdf`, `twelve_part2.pdf` and `twelve_part3.pdf`.
- **AC-432 (P1) (ours)** With the pattern `{name}` and Every N = 4 the entries are `twelve.pdf`, `twelve (2).pdf` and `twelve (3).pdf`.
- **AC-433 (P0) (ours)** Bookmarks with Custom `1-4, 5-10, 11-12`: part 1's outline is exactly "Intro" → page 1; part 2's is "Middle" → page 1 (child "Detail" → page 2) and "End" → page 6; part 3 has no outline items.
- **AC-434 (P1) (ref)** With Remove bookmarks on, no entry of AC-433's run has outline items.
- **AC-435 (P0) (ours)** Every page on `mixed-sizes.pdf` gives 4 entries with MediaBoxes 595×842, 792×612, 420×595 and 595×842 and `/Rotate` 0, 0, 0 and 90. Each entry's text is extractable ("Mixed n"), and no page is drawn as an image.
- **AC-436 (P0) (ours)** A run with exactly one part (Custom `2-5`) downloads a single PDF `twelve-2-5.pdf` with 4 pages (Twelve 2–5), not a ZIP.
- **AC-437 (P0) (ours)** `twelve.pdf` + `three-pages.pdf` with Every N = 2 gives `berrypdf-split.zip` with 8 entries: `twelve-1-2.pdf` … `twelve-11-12.pdf`, then `three-pages-1-2.pdf` and `three-pages-3.pdf`.
- **AC-438 (P1) (ours)** Every page on `sixty-pages.pdf`: every entry is under 25% of the input's size, and the 60 entries together are at most the input size × 3.
- **AC-439 (P1) (ours)** Switching between the four modes never clears the file or its thumbnails, and the parts count updates on each switch (12, 6, 7, 1 for `twelve.pdf` with N = 2 and an empty Custom field).

### Extract pages

- **AC-450 (P0) (ours)** With `twelve.pdf` loaded, nothing is selected, the quick pick shows Custom, and the primary action is disabled until a page is selected.
- **AC-451 (P0) (ref)** Selecting 2–5 and 9 (AC-405) and running gives one PDF named `twelve.pdf` with 5 pages: Twelve 2, 3, 4, 5, 9.
- **AC-452 (P0) (ref)** Odd selects tiles 1, 3, 5, 7, 9 and 11 and fills the field with `1, 3, 5, 7, 9, 11`. Running gives 6 pages: Twelve 1, 3, …, 11.
- **AC-453 (P0) (ref)** Even selects 2, 4, …, 12. Running gives 6 pages: Twelve 2, 4, …, 12.
- **AC-454 (P1) (ours)** After Odd, clicking tile 2 adds it, and the quick pick shows Custom.
- **AC-455 (P1) (ours)** Typing `9, 2-3` gives output pages Twelve 2, 3, 9 (document order), and after blur the field reads `2-3, 9`.
- **AC-456 (P1) (ours)** Selecting all 12 pages and running gives 12 pages.
- **AC-457 (P0) (ours)** Extracting `5-6, 10`: the outline is "Middle" → page 1 (child "Detail" → page 2) and "End" → page 3, with no "Intro".
- **AC-458 (P1) (ref)** With Remove bookmarks on, the same run has no outline items.
- **AC-459 (P0) (ours)** Extracting pages 2 and 4 of `mixed-sizes.pdf` gives MediaBoxes 792×612 and 595×842 with `/Rotate` 0 and 90, and the text Mixed 2 and Mixed 4.
- **AC-460 (P1) (ours)** `twelve.pdf` + `three-pages.pdf`: `1-2` gives `berrypdf-extract.zip` with `twelve.pdf` (2 pages) and `three-pages.pdf` (2 pages). `3-5` gives Twelve 3–5 and Page 3. `10-12` shows a notice naming `three-pages.pdf` as skipped, and the run gives the single PDF `twelve.pdf` with 3 pages.
- **AC-461 (P1) (ours)** Extracting page 1 of `sixty-pages.pdf` gives a file under 25% of the input's size.
- **AC-462 (P1) (ref)** With the file-name pattern `{name}-extract` the output is `twelve-extract.pdf`.

### Delete pages

- **AC-465 (P0) (ref)** Every tile has a remove toggle named "Remove page n". Activating it on page 2 keeps tile 2 visible but marked (`aria-pressed="true"`, a visible removal mark), and the status reads 11 of 12 pages kept. Running gives `twelve.pdf` with 11 pages and no text "Twelve 2".
- **AC-466 (P0) (ours)** Activating page 2's toggle again unmarks it. With nothing marked, the primary action is disabled.
- **AC-467 (P0) (ref)** Typing `1-3, 10-` marks pages 1, 2, 3, 10, 11 and 12. Running gives 6 pages: Twelve 4 … Twelve 9.
- **AC-468 (P0) (ref)** Marking 2, 4 and 6 by their toggles puts `2, 4, 6` in the field.
- **AC-469 (P0) (ours)** Typing `1-` marks every page, disables the primary action and shows a message that at least one page must stay.
- **AC-470 (P1) (ours)** Shift+click on tile 9 after marking tile 6 marks 6–9. Delete or Backspace on a focused tile toggles its mark, and the polite live region announces the change.
- **AC-471 (P0) (ours)** Deleting page 5: the outline is "Intro" → page 1, "Detail" → page 5 (moved up a level) and "End" → page 9.
- **AC-472 (P1) (ref)** With Remove bookmarks on, the output has no outline items.
- **AC-473 (P0) (ours)** Deleting page 1 of `mixed-sizes.pdf` gives 3 pages with MediaBoxes 792×612, 420×595 and 595×842, `/Rotate` 0, 0 and 90, and the text Mixed 2–4.
- **AC-474 (P1) (ours)** `twelve.pdf` + `three-pages.pdf` with `1` gives `berrypdf-delete.zip` with `twelve.pdf` (11 pages) and `three-pages.pdf` (2 pages). Typing `1-3` instead disables the primary action and names `three-pages.pdf` as having no page left.
- **AC-475 (P1) (ours)** Deleting pages 2–60 of `sixty-pages.pdf` gives a file under 25% of the input's size.

### F5 shared (Organize, Combine & reorder, Alternate & mix)

- **AC-480 (P0) (ref)** `/organize-pdf`, `/combine-reorder-pdf` and `/alternate-mix-pdf` each show the tool. Their file input allows multiple files and accepts `.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.tif` and `.tiff`.
- **AC-481 (P0) (ref)** `owner-restricted.pdf` loads with no prompt on all three. Organize gives a 3-page PDF, and Alternate with `owner-restricted.pdf` + `short.pdf` gives 5 pages. Both open without a password.
- **AC-482 (P1) (ours)** `sixty-pages.pdf` loads in Organize with no limit or upgrade message, and running gives 60 pages.
- **AC-483 (P1) (ours)** On each of the three, picking 51 copies of `three-pages.pdf` loads 50 and shows a message giving the 50-file cap.

### Organize

- **AC-490 (P0) (ref)** Picking `twelve.pdf` and then `three-pages.pdf` in one batch shows the Pages view with 15 tiles A1–A12, B1–B3 (pick order, no name sort). No Merge options (contents page, footer, double-sided) are present.
- **AC-491 (P0) (ref)** Select all selects all 15 tiles and shows the count. Ctrl/Cmd+A with focus in the grid does the same. Select none and Escape clear it.
- **AC-492 (P0) (ref)** With A1 and A2 selected, Invert selection leaves the other 13 selected and A1, A2 unselected.
- **AC-493 (P0) (ref)** Reverse with nothing selected gives B3, B2, B1, A12 … A1. Running gives that text order (Page 3, Page 2, Page 1, Twelve 12 … Twelve 1).
- **AC-494 (P0) (ref)** Reverse with A2–A4 selected gives A1, A4, A3, A2, A5 … (the rest unchanged).
- **AC-495 (P1) (ours)** Reverse with A1, A3 and A5 selected gives A5, A2, A3, A4, A1, A6 … (the reference refuses a scattered selection).
- **AC-496 (P1) (ref)** Remove ▾ → Keep only `twelve.pdf` leaves A1–A12. The undo notice's Undo brings B1–B3 back at the end.
- **AC-497 (P1) (ref)** Remove ▾ → Remove all returns to the empty state and shows an Undo notice. Undo restores all 15 tiles in order.
- **AC-498 (P0) (ref)** After removing A5, Add pages → From a loaded file → `twelve.pdf` opens the page picker with 12 tiles, every one marked "in use" except A5. Picking A5 and confirming puts it at the end. Running gives 15 pages, the last with the text "Twelve 5".
- **AC-499 (P0) (ours)** Running with no edits gives one PDF named `twelve_organized.pdf` with 15 pages (Twelve 1–12, Page 1–3), all `/Rotate 0`, not encrypted.
- **AC-500 (P1) (ours)** After moving A12 to the front, the output outline is "Intro" → page 2, "Middle" → page 6 (child "Detail" → page 7) and "End" → page 11.
- **AC-501 (P1) (ours)** With only `twelve.pdf` loaded the view toggle is shown, and the Files view shows one card with 12 pages. After moving A12 to the front it shows 2 cards (page 12; pages 1–11).
- **AC-502 (P1) (ours)** `charlie.png` + `twelve.pdf` gives 13 tiles; running gives 13 pages, the first holding one image.

### Combine & reorder

- **AC-510 (P0) (ref)** On `/combine-reorder-pdf`, picking `bravo.pdf` and `alpha.pdf` in one batch shows the **Pages** view with tiles A1, A2, A3, B1, B2 (alpha first, name order) and Merge's options in the dock.
- **AC-511 (P0) (ref)** Dragging B1 between A1 and A2 and running gives `alpha_merged.pdf` with the text order Alpha 1, Bravo 1, Alpha 2, Alpha 3, Bravo 2.
- **AC-512 (P1) (ours)** Merge options are shared: turning on double-sided on `/merge-pdf` shows it on at `/combine-reorder-pdf` after navigating there. Contents = File names there gives the contents page of F3 AC-48.
- **AC-513 (P1) (ours)** The page's `h1`, `<title>` and description differ from `/merge-pdf`'s, and its canonical URL is `/combine-reorder-pdf`.

### Alternate & mix

- **AC-520 (P0) (ref)** Picking `odd.pdf` then `even.pdf` shows two cards in that order. Each card has a thumbnail, its name, "5 pages", Order = Normal and Pages per turn = 1. No Repeat control is shown.
- **AC-521 (P0) (ref)** Running with defaults gives one PDF named `odd_mixed.pdf` with 10 pages: Page 1 … Page 10 in order.
- **AC-522 (P0) (ref)** `odd.pdf` + `even-reversed.pdf` with Order = Reverse on the second card gives Page 1 … Page 10.
- **AC-523 (P0) (ref)** `twelve.pdf` (Pages per turn 3) + `three-pages.pdf` (1) gives 15 pages: Twelve 1–3, Page 1, Twelve 4–6, Page 2, Twelve 7–9, Page 3, Twelve 10–12.
- **AC-524 (P0) (ours)** `twelve.pdf` + `short.pdf` (1 each) gives 14 pages: Twelve 1, Short 1, Twelve 2, Short 2, Twelve 3 … Twelve 12.
- **AC-525 (P0) (ours)** `twelve.pdf` (4) + `separator.pdf` shows a Repeat control, on, on the separator card only. Running gives 14 pages: Twelve 1–4, Separator, Twelve 5–8, Separator, Twelve 9–12 (no trailing separator).
- **AC-526 (P1) (ours)** The same with Repeat off gives 13 pages: Twelve 1–4, Separator, Twelve 5–12.
- **AC-527 (P1) (ours)** `separator.pdf` first, then `twelve.pdf` (4), Repeat on, gives 15 pages: Separator, Twelve 1–4, Separator, Twelve 5–8, Separator, Twelve 9–12.
- **AC-528 (P0) (ref)** Dragging the `even.pdf` card in front of `odd.pdf` gives the output Page 2, Page 1, Page 4, Page 3, … Page 10, Page 9. Doing it instead with Alt+ArrowUp on the focused `even.pdf` card does the same and is announced in the live region.
- **AC-529 (P1) (ref)** Sort ▾ → Name A–Z orders the cards even, odd. Name Z–A orders them odd, even.
- **AC-530 (P0) (ours)** With `odd.pdf` + `even.pdf`, the Pages view shows 10 tiles labelled A1, B1, A2, B2, …, A5, B5 with no drag handles, remove or insert controls. After setting Pages per turn = 2 on the first card it shows A1, A2, B1, A3, A4, B2, A5, B3, B4, B5.
- **AC-531 (P0) (ours)** With only `odd.pdf` loaded, the primary action is disabled and the status asks for another file. Adding `even.pdf` enables it.
- **AC-532 (P1) (ours)** Pages per turn = `0`, `x`, empty or `1.5` shows an inline error on that card and disables the primary action. A value of 99 is accepted.
- **AC-533 (P1) (ours)** `odd.pdf`, `even.pdf` and `short.pdf` (1 each) give 12 pages: Page 1, Page 2, Short 1, Page 3, Page 4, Short 2, Page 5, Page 6, Page 7, Page 8, Page 9, Page 10.
- **AC-534 (P1) (ours)** `mixed-sizes.pdf` + `short.pdf`: output pages 1, 3, 5 and 6 keep MediaBoxes 595×842, 792×612, 420×595 and 595×842 with `/Rotate` 0, 0, 0 and 90. The output has no outline items.
- **AC-535 (P1) (ours)** Picking `charlie.png` then `twelve.pdf` (Pages per turn 4): the image card shows Repeat, on. Running gives 15 pages: image, Twelve 1–4, image, Twelve 5–8, image, Twelve 9–12.

**Totals: 94 ACs (AC-400 to AC-535): 50 P0, 44 P1.** F4: 57 (shared 13, Split 20, Extract 13, Delete 11; 30 P0, 27 P1). F5: 37 (shared 4, Organize 13, Combine & reorder 4, Alternate 16; 20 P0, 17 P1). Plus the inherited ACs in §0e.

## 8. Decisions to review

1. **F4 tools take several files** (20, each processed on its own) where the reference allows one per task for free users. One range field applies to all files, and tile clicks change one file (§3a).
2. **No mode screen on Split**: modes live in the dock with a live parts list. The reference's extra step, and its card that runs immediately, are dropped.
3. **Click toggles** on Extract and Delete (pick-many tools, and it works on touch), while Organize/Merge keep "click selects only this page". The two models are deliberately different.
4. **Split N defaults to 2** (the reference's card example). Its field gets 4 when that mode is chosen.
5. **Split names** carry the full page range (`twelve-1-4.pdf`). The reference's preview uses the last page only (`twelve-4.pdf`). Alternative: copy the reference.
6. **Typed Split ranges = one file per range**, pages outside the ranges left out, overlaps allowed. Extract outputs pages in **document order** without repeats. Both need the evaluator's run.
7. **Extract and Delete keep the original file name** (reference default pattern). Alternative: add a suffix (`-extracted`, `-edited`) so a download never shadows the original.
8. **Organize's composer panel** is replaced by the page picker on an already loaded file ("in use" marks). No drag from a side panel.
9. **Organize output name** `<first>_organized.pdf` (reference field: `<first>_merged.pdf`).
10. **Combine & reorder = Merge on its own route**, opening in the Pages view and sharing Merge's remembered options. Alternative: a 308 redirect to `/merge-pdf` (simpler, but loses the route and its search query). SEO rule check: the preset (pages view first) changes what the tool does, so it is not a thin duplicate.
11. **F5 tools accept images** (Organize's reference takes PDF only).
12. **Alternate**: interleave rule, Repeat on by default for one-page files (the reference flags them automatically), bookmarks dropped, at least two files, and the read-only result preview in the Pages view.
13. **Delete marks pages instead of hiding them**, so every removal can be undone with one click.
14. **Not in this feature:** a full undo/redo history for Organize (F3 I-6 deferred it to F5), the range field on Rotate, and split by bookmarks, size or text (separate backlog tools). Step 2 may adopt the first two.

### 8a. Lead resolution (2026-11-26)

Decisions 1 to 14 are accepted as written, for now. Step 2 (Research) may overturn any of them with evidence, marked adopt or skip in "Improvements". Decisions 6 and 12 (typed Split ranges, Alternate's interleave and leftover rules) stay provisional until the evaluator's first real reference run (§8b) confirms them. If the reference behaves differently, we either match it or record in the eval why ours is better.

### 8b. Needs a real reference task (evaluator's first run; at most 3 per hour, booked with the lead)

In priority order, so the highest-value ones fit in the first booked slots:

1. **Split, Custom with typed `1-3, 8-9, 12`** on `twelve.pdf`: one file per range or cut points? Download form (ZIP or separate), ZIP name, entry names, bookmarks per part.
2. **Alternate, `twelve.pdf` (step 1) + `short.pdf`** plus a run with a one-page file: leftover handling, whether a one-page file repeats (and whether it trails the end), output name, bookmarks.
3. **Extract `9, 2-3`** on `twelve.pdf`: page order, output name, bookmarks kept or not.
4. **Delete page 5** on `twelve.pdf`: output name, outline handling; then (if a slot remains) **Delete all pages** to see its error.
5. **Organize** with two files and one rotation: output name (form says `<first>_merged.pdf`), bookmarks, blank page size.
6. **Split every page on `big-250.pdf`**: whether the 200-page cap is enforced at run time and how.
7. **Split "every even page"** card (it runs at once): confirm the 1, 2–3, 4–5 … grouping.

## 9. Screenshot index (internal, outside git)

`/mnt/project-files/evals-cache/f4-f5-page-tools/spec/`: `split-pdf-01-empty` · `split-pdf-02-loaded` (mode screen) · `split-03-burst` · `split-04-burst-more` · `split-05-select-empty` · `split-06-select-4-10` · `split-07-select-click-page7` · `split-08-select-more` · `split-09-select-typed` · `split-10-select-invalid` · `split-11-everyx-default` · `split-12-everyx-5` · `split-13-everyx-0` · `split-14-rename-modal` · `extract-02-loaded` · `extract-03-p2` · `extract-04-shift-ctrl` · `extract-05-more` · `extract-06-typed` · `extract-07-odd` · `delete-02-loaded` · `delete-03-hover` · `delete-04-after-p2` · `delete-05-after-5` · `delete-06-more` · `delete-07-selected` · `delete-08-others-selected-prompt` · `organize-01-empty` · `organize-02-loaded` · `organize-03-menu-0…5` · `organize-04-selected` · `organize-05-reverse-nonconsecutive` · `organize-06-hover` · `organize-07-addmark-menu` · `organize-08-composer` · `organize-09-sixty` · `alternate-01-empty` · `alternate-02-loaded` · `alternate-03-hover` · `alternate-05-three-files` · `alternate-06-one-file` · `limit-split-250pages` · `limit-split-two-files` · `limit-delete-250pages` · `limit-alternate-65pages` · `restricted-extract` · `restricted-organize` · `corrupt-extract` · `wrongtype-alternate` · phone (390×844): `m-split-choices`, `m-split-burst`, `m-extract`, `m-delete`, `m-organize`, `m-alternate`, `m-combine-empty`. Page scripts: `js/*.min.js`. DOM and state logs: `*-log.json`, `*-controls.json`, `*.html`.

Phone notes (reference, for step 3): one tile per row; Split's file-name panel covers half the screen above its action; Organize's toolbar wraps to four rows and its hint text overlaps the zoom slider; no horizontal scroll on any of them.

## Improvements

## UI
