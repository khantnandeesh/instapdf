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

- One PDF, the page list order exactly. Name: `<first source's base name>_organized.pdf`, where the first source is the **first file loaded** that still has a page in the output (not the file of the current first page), so moving, rotating, sorting or reversing pages never changes the name (eval G-6). *Reference:* the hidden output-name field holds `<first>_merged.pdf` before the run, even with one file (`organize-log.json`). We use a name that says what happened (§8 decision 9). Combine & reorder keeps Merge's `<first>_merged.pdf`.
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
- **AC-402 (P0) (ours)** On Extract, typing `1-3, 5, 10-` selects tiles 1, 2, 3, 5, 10, 11 and 12 (`aria-selected="true"`, no others). Typing `-2` selects 1 and 2. After blur the field reads `1-3, 5, 10-12` when one file is loaded. With two or more files loaded, open ranges (`10-`) and keywords (`last`, `odd`, `even`) stay as typed, so each file reads them against its own length.
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
- **AC-499 (P0) (ours)** Running with no edits gives one PDF named `twelve_organized.pdf` with 15 pages (Twelve 1–12, Page 1–3), all `/Rotate 0`, not encrypted. The name follows the first file loaded, not the current first page: after Sort ▾ → Reverse (B3 first) the output is still `twelve_organized.pdf`; only when every page of `twelve.pdf` is removed does it take the next loaded file's name (`three-pages_organized.pdf`).
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

**Step 2 (Research, 2026-11-26):** decision 14 is **changed in part**: full undo/redo for the page workspace joins this feature (Improvements I-10, AC-549, AC-550), and the Rotate range field stays out (I-22). Decisions 2, 3, 6 and 13 gained supporting evidence, and decision 7 is kept (Improvements R-4). No other decision is overturned. Separately, §6's claim that unused resources are not copied does not hold for files with shared or inherited resource dicts with today's engine; I-1 (AC-536, AC-537) makes it true.

Update after step 2 (2026-11-26): undo/redo joins this feature (I-10), the Rotate range field stays out. Decision 7 stands (Extract and Delete keep the original file name) because Rotate already does, so every one-file page tool names its output the same way. The multi-file range issue raised in Improvements is resolved in AC-402: open ranges and keywords stay symbolic when two or more files are loaded. Resource pruning (I-1) and link and bookmark fixes (I-2, I-3) go into the shared copy engine, so Merge gains them too; Merge's own tests must stay green.

Update after step 3 (2026-11-26): the UX decisions in UI §P-11 (1 to 15) are all accepted. AC-402 reads `aria-pressed` for Extract tiles; AC-550 places Undo/Redo in the bottom bar; AC-420, AC-429 and AC-430 open More options for the parts list; Extract and Delete primaries carry live counts. Long titles may wrap on phones (decision 14): the H1 keeps the search keyword. The three Merge layout bugs found while designing (selection bar overlap at 1366x657, sideways scroll at 640–710px, squeezed toolbar at 320px) are fixed in this feature.

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

Research, 2026-11-26 (step 2). How it was done:

- **Live, synthetic files only.** Headless Chromium from the container, at least 1.3 s between actions, on the public tool pages of iLovePDF (Split, Remove pages, Organize), PDF24 (Split, Remove pages, Rearrange), Smallpdf (Split/Extract workspace) and PDFgear (Split). One real task on each, with our synthetic `probe.pdf` (R-1): iLovePDF split "fixed 5" and remove `2-12`; PDF24 split "5 pages per PDF"; Smallpdf extract pages 1 + 3; PDFgear split "every 5". The outputs were checked with qpdf (through pikepdf) and rendered with PDFium. **Nothing ran on the reference site.**
- **Docs only (†):** Adobe Acrobat online asks for sign-in before it splits or organizes, so we read only its public pages. Stirling-PDF was read from its docs and source (to learn, never copied), and PDFsam (alternate mix) from its docs. Sources are listed at the end.
- **Our engine:** the repo's `mergePdf` (F5's output engine and the natural F4 copy path), run in Vitest on synthetic fixtures, plus a prototype pruning pass (I-1).
- **Evidence (never in git):** `/mnt/project-files/evals-cache/f4-f5-page-tools/research/`: screenshots `*.png`, page text `*.txt`, competitor outputs in `outputs/`, our scripts, fixtures, logs and per-file inspections in `fidelity/` (`inspect-*.txt`, `log.txt`, `prune-log.txt`, `probe-log.txt`). No competitor text, assets or code is reused.

### R-1. Output fidelity: measured

**Probe** (`fidelity/probe.pdf`, made by `make-probe.mjs`): 12 A4 pages, 530 KB. Each page draws its own 43 KB image. All 12 images and the font sit in **one `/Resources` dictionary shared by every page**, a common producer pattern. Page 1 has four internal links: an explicit destination to p3, an explicit one to p10, a named destination "chap2" to p5, and a GoTo action to p4. The outline is Intro → p1; Middle → p5 at y 421, red and bold, open, with child Detail → p6 at y 300; and End → p10 `/FitH 300`. Page 3 has a text field. Info has a Title and an Author.

Split into 1–5, 6–10, 11–12 (Smallpdf: extract pages 1 and 3):

| Engine | Part 1–5 size | Link to a page not in the part | Named-destination link, target kept | Bookmark view (y 421, FitH 300) | Bookmark colour / bold | Info Title, Author | Form field | Names |
|---|---|---|---|---|---|---|---|---|
| **BerryPDF today** (`mergePdf`) | 524 KB (a one-page part is 522 KB, 98% of the input) | kept as a dead hotspot, `Dest [null /XYZ …]` | **dead** (name tree not copied) | **lost**: every item becomes `/XYZ null null null` | lost | **lost** (Producer only) | kept | – |
| BerryPDF + pruning prototype | **221 KB** (one-page part 45 KB, 8.5%) | (I-2) | (I-2) | (I-3) | (I-3) | (I-4) | kept | – |
| PDF24 (server, "split in the cloud") | 220 KB | **removed** | rewritten to an explicit destination, works | kept | lost | kept | kept | `probe-01-05.pdf` in `probe.zip` |
| iLovePDF (server, `/v1/upload`) | 525 KB | hotspot kept with no target | works (name tree copied) | kept | kept | lost | kept | `probe-1.pdf` in `ilovepdf_split.zip` |
| Smallpdf (Producer "Pdftools SDK"; no request body over 50 KB seen, so most likely in the browser) | 88 KB for 2 pages | hotspot kept with no target | dead | – (only Intro is left) | – | lost | kept | `probe-pages.pdf` |
| PDFgear (pdf-lib in the browser) | 524 KB | **every** internal link, even to p3, points at orphan copies of pages that pdf-lib's copier dragged in | dead | outline dropped | – | lost | **dropped** (orphaned widget) | `page1-5.pdf` in `probe.zip` |

Our own 60-page fixtures (`fidelity/log.txt`, `prune-log.txt`):

| Resources layout | One-page part, today | 60 one-page parts, today | One-page part, with pruning |
|---|---|---|---|
| per page | 98 KB (3.6%) | 5.9 MB (2.2× input; each part carries the one shared embedded font) | 98 KB |
| one dict shared by all pages | **2.66 MB (98.8%)** | **159 MB (59× input)** | 98 KB |
| inherited from the page tree | **2.66 MB (98.8%)** | **159 MB (59× input)** | 98 KB |

The pruning prototype keeps, for each page, only the resources whose names occur as name tokens in that page's content streams. Forms without their own `/Resources` are scanned recursively. The method is conservative: it can keep too much, but never too little. All 180 one-page parts rendered **pixel-identical** to their source pages (PDFium at 72 dpi, 0 differing pixels, `diff.py`). The pass took 10–26 ms for 60 pages, including parsing.

What this means:

1. §6 says "unused resources are not copied". That is **not true of today's engine** when a file shares one resource dict across its pages or inherits it from the page tree: then every part carries every image of the whole file. AC-438, AC-461 and AC-475 pass only because the F1 fixtures give each page its own dict. → I-1.
2. Today's engine already avoids PDFgear's worst failure: it pre-seeds the copier so links never drag in other pages. It still leaves dead link hotspots, breaks named-destination links, flattens bookmark views and drops the document info. → I-2 to I-4.
3. **No server engine is justified (rule 4).** The best server output, PDF24's, is matched in the browser by pdf-lib plus I-1 to I-4: same sizes to within 1 KB (`probe-log.txt`), and better on bookmark styles. Smallpdf and PDFgear already run client-side.
4. Every tool tested drops the tag structure (`StructTreeRoot`), and ours does too (I-20). All of them copy shared font programs whole (I-21).

### R-2. Quick read of the field (UX)

- **Split.** iLovePDF: Range (Custom from/to rows + Add Range, Fixed "page ranges of N", Smart AI), Pages (extract all, or select pages, with "merge into one PDF"), Size. Its range cards preview each part, but its Fixed preview kept saying "12 PDFs" after we typed 5 and only applied the value on submit (`ilovepdf-split-fixed5.png`). PDF24: a mode dropdown (Pages per PDF, Even/Odd, Halve pages, By file size, Custom with scissors and a "Split after pages" field), a zoom slider, a file-name option `filename-01-03.pdf` / `01-03.pdf`, and a button that counts live ("Split 1 PDF", `pdf24-split-custom.png`). PDFgear: scissors plus "Split every N", and the button relabels live to "Split into 3 PDFs" (`pdfgear-split-every5.png`). Smallpdf: one workspace with Split/Extract, Add, rotate, delete, scissors, "Split after every N pages", sort and list/grid. Acrobat online: up to 19 dividers (20 files), sign-in required †. Stirling: split by page numbers, page count, document count, size, chapters, sections and QR-code divider sheets †. **Nobody has a separate "choose a mode" screen.**
- **Extract / Delete.** iLovePDF Remove: click toggles, Shift for ranges, a range field synced both ways, removed tiles crossed out in place, primary disabled until something is picked (`ilovepdf-remove-typed.png`). Smallpdf Extract: a checkbox per tile, a tri-state "N pages selected" select-all, a "Separate PDFs" toggle (`smallpdf-extract-picked.png`). Stirling page syntax accepts `all` and `an+b` formulas †.
- **Organize.** iLovePDF: file list with letters, "Reset all", add, sort (`ilovepdf-organize-loaded.png`). PDF24 Rearrange: drag, zoom slider, sort "No sorting / From back to front" (`pdf24-organize-loaded.png`). Stirling page editor: checkboxes, select all or by page numbers, Undo/Redo buttons, zoom, duplicate, insert blank, split markers, "download selected pages" †. Its rearrange modes include Reverse, Duplex Sort ("all fronts then all backs"), Odd-Even Split/Merge and booklet order †. Acrobat online: drag, rotate, delete, and an undo in the top bar per its help page (seen in a search snippet; the page refused our fetch) †.
- **Alternate & mix.** No browser competitor among the six has it. PDFsam (desktop) does: per-file reverse, a "pace" (pages per turn) and per-file page ranges; its page does not say how leftovers are handled †. Stirling's Odd-Even Merge works on two halves of one file †.

### R-3. What competitors paywall (these tasks)

| Product | Paywalled or gated | BerryPDF |
|---|---|---|
| iLovePDF | Split by size and Smart (AI) split are premium (crown, `ilovepdf-split-size.png`, `-smart.txt`). Split takes 1 file per task even on premium; Organize 5 files free, 20 premium; 100 MB per task free † | Split takes 20 files (AC-407); split by size is F7, free |
| Smallpdf | Free plan has a small daily task limit (support page: 2 per day) † | No limit (browser) |
| Acrobat online | Sign-in required to split, organize, delete or add pages; 1,500 pages, 100 MB (organize) † | No account |
| PDF24 / PDFgear | Free (ads); PDF24 uploads and deletes after 1 hour | Free, nothing uploaded |
| Reference (§2a) | 1 file per task, 200/50-page caps, 3 tasks/hour | Already planned free in §2a. Nothing adopted below needs a server, so all of it stays free. |

### R-4. Evidence on the §8 decisions

- **D2 (no mode screen):** supported. All four tools we ran keep modes beside the pages.
- **D3 (click toggles on Extract/Delete):** supported (iLovePDF Remove, Smallpdf Extract).
- **D6 (typed ranges = one file per range):** supported by iLovePDF (one file per Custom range) and PDFgear ("1-3, 4-7 will export 2 PDF documents" †). PDF24 and Stirling read typed numbers as cut points ("split after"). Still provisional until §8b.
- **D7 (keep the original name):** mixed. iLovePDF names `probe_removed.pdf` and Smallpdf `probe-pages.pdf` (suffix); PDF24 keeps the base name. **Not overturned**; the lead may revisit.
- **D13 (mark, don't hide):** supported (iLovePDF crosses removed pages out in place).
- **D14:** changed in part. Full undo/redo is adopted (I-10); the Rotate range field stays out (I-22). Recorded in §8a.

### Improvements list

| # | Idea | Seen at | User benefit | Cost | Adopt/skip | Reason |
|---|---|---|---|---|---|---|
| I-1 | **Prune unreferenced resources** of every copied page (shared or inherited dicts) before copying | PDF24 ✓ and Smallpdf ✓ (R-1); qpdf's `--remove-unreferenced-resources` does the same † | One page of a big file is a small file, not the whole file again (59× in our test) | M | **Adopt** → AC-536, AC-537 | A pure pdf-lib pass in the worker, prototyped and pixel-identical (R-1). It lives in the shared copy path, so Organize, Alternate and Combine & reorder (and Merge) gain it too. If a content stream cannot be decoded, that page keeps all its resources. |
| I-2 | **Clean links**: remove link annotations whose target page is not in the output; rewrite named-destination links and GoTo actions to explicit destinations on the output page | PDF24 ✓ both; iLovePDF and Smallpdf leave dead hotspots; PDFgear breaks every internal link | No dead clickable areas; cross-references inside a part keep working | S | **Adopt** → AC-538, AC-539 | Today the copier seeds dropped pages as `null`, which leaves a clickable area that goes nowhere. Name lookup already exists in `outline.ts`. |
| I-3 | **Bookmarks keep their view** (XYZ position and zoom, FitH, Fit…), **colour, bold/italic and open/closed state** | iLovePDF ✓ all; PDF24 view only | A bookmark lands where it did in the source and looks the same | S | **Adopt** → AC-540 | `writeOutline` always writes `/XYZ null null null`. Carry the destination's tail and `/C`, `/F` and the `/Count` sign. |
| I-4 | **Carry document info** (Title, Author, Subject, Keywords, Creator, CreationDate) and the opening layout (`/PageLayout`, `/ViewerPreferences`) when every output page comes from one source PDF | PDF24 ✓; iLovePDF, Smallpdf and PDFgear drop it | Parts keep their title and author in viewers, search and document systems | S | **Adopt** → AC-541 | Outputs built from several sources keep Merge's rule (Producer only). ModDate is the run time, Producer "BerryPDF". |
| I-5 | **Form fields follow their page** (kept and fillable where the page is in the output, absent elsewhere) | PDF24, iLovePDF, Smallpdf ✓; PDFgear drops the field; Stirling's PDFium path drops the AcroForm † | A filled form stays fillable after split or extract | S (tests) | **Adopt** → AC-542 | The engine already does this; the AC guards the failure seen at PDFgear. |
| I-6 | Range keywords **`odd`, `even`, `last`** (also `5-last`) in the §0a syntax | PDF24 Even/Odd mode; Stirling `all`, `2n-1` †; qpdf uses `z` for the last page † | Delete the last page of 20 files of different lengths in one go; type odd/even directly | S | **Adopt** → AC-543, AC-544 | A pure parser change. See the multi-file note under "For the UX step". |
| I-7 | **Primary action states the outcome** ("Split into 7 files"), live | PDFgear, PDF24 | One glance confirms what will happen | S | **Adopt** → AC-545 | `PrimaryAction` gets a label override; the parts list stays. |
| I-8 | Organize **Select ▾ → Odd pages / Even pages** (by position) | Stirling select by numbers †; PDF24 Even/Odd; Smallpdf select-all | Rotate or remove every other page of a scan in two clicks | S | **Adopt** → AC-546 | Selection helpers already planned in §0b. |
| I-9 | Organize **Sort ▾ → Two-sided scan order**: one file holding all fronts, then all backs in reverse, becomes F1, B1, F2, B2… | Stirling Duplex Sort † (and its issue #209) | Fixes the most common single-sided-scanner result without splitting it into two files for Alternate | S | **Adopt** → AC-547, AC-548 | A pure page-list helper; on a selection it acts only on the selected positions, like Reverse (§3e). |
| I-10 | **Full undo/redo** (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y, toolbar buttons) for every page-list edit | Stirling page editor ✓ †; Acrobat online undo †; iLovePDF has only "Reset all" | Any step is reversible, and long organizing sessions are safe | M | **Adopt** → AC-549, AC-550 | Decision 14 left it to step 2. The page list is immutable, so history is a stack of snapshots. It lives in the shared workspace (Organize, Combine & reorder, Merge). F3 AC-79's undo notice stays. |
| I-11 | Split by file size | iLovePDF (premium), PDF24, Acrobat desktop † | Fit email or upload limits | M | Skip | A separate backlog tool (F7). |
| I-12 | Split by bookmarks / chapters | Stirling †, Acrobat desktop † | One file per chapter | M | Skip | F7. |
| I-13 | AI "smart" split by document type | iLovePDF (premium) | Splits batch scans of invoices etc. | L | Skip | Needs a model or server; rule 5. |
| I-14 | Split into N documents | Stirling † | "Make 3 files" | S | Skip | Every N pages covers it; a fifth mode adds UI. |
| I-15 | Formula page syntax (`2n+1`, `3n`) | Stirling † | Every third page etc. | S | Skip | Expert-only; I-6 covers the common cases. |
| I-16 | Typed cut points ("split after 3, 7") | PDF24 Custom, Stirling † | Another way to set cuts | S | Skip | Clashes with typed ranges meaning parts (D6); the marks already set cut points. |
| I-17 | "Merge ranges into one PDF" / "Separate PDFs" toggles | iLovePDF, Smallpdf | One switch for both outcomes | S | Skip | Extract gives one file; Split Custom gives one per range. |
| I-18 | Zero-padded numbers in names (`probe-01-05.pdf`) | PDF24 | Sorts right in plain name order | S | Skip | Explorer, Finder and Files sort naturally; it would change the (ref) names in AC-420 onwards. Could come back later as a pattern token. |
| I-19 | Keep a bookmark whose page is gone as a title with no target | iLovePDF, PDF24 | Keeps the chapter heading | S | Skip | Clicking it does nothing. Merge's promote rule keeps every remaining bookmark working. |
| I-20 | Keep the tag structure per output | none of the four tested | Accessible output | L | Skip (gap) | Needs pruning and remapping the structure tree. Outputs stay untagged, as Merge's do; `/Lang` and page labels are kept. |
| I-21 | Re-subset fonts per part | none | Smaller parts for font-heavy files | L | Skip | Font programs shared by all pages are copied whole everywhere. No permissive subsetter in the worker today. |
| I-22 | Range field on Rotate (D14) | Stirling † | Rotate typed pages | S | Skip | Rotate has shipped and its ACs would reopen; per-tile rotation covers exceptions. Revisit with F8. |
| I-23 | Per-file page ranges in Alternate | PDFsam † | Mix only part of a file | M | Skip | Extract first; a field per card is a lot of UI. |
| I-24 | Server engine for any of the six | iLovePDF, PDF24, Acrobat (upload) | – | L | Skip | Not clearly better (R-1, point 3), so rule 4 rules it out. |
| I-25 | Halve pages | PDF24 | Split scanned spreads | M | Skip | F7 (split down the middle). |

### Improvement acceptance criteria

The evaluator does not compare these with the reference, but they must work. Extra fixtures (QA script, synthetic):

- `shared-res.pdf`: 12 A4 pages, text "Shared 1".."Shared 12" in Helvetica. Page n draws its own 120×120 RGB image (incompressible, about 43 KB). Every page's `/Resources` is **one** indirect dict holding all 12 images and the font.
- `inherited-res.pdf`: the same, but the dict sits on the page-tree root and the pages have no `/Resources`.
- `links.pdf`: 12 A4 pages "Link 1".."Link 12". Page 1 links: L1 `[p3 /XYZ 0 400 0]`, L2 `[p10 /XYZ 0 400 0]`, L3 named "chap2" (in `/Names /Dests` → `[p5 /XYZ 0 500 null]`), L4 a GoTo action `[p4 /Fit]`, L5 a URI link to `https://example.org/`. Outline: "Intro" → p1; "Middle" → `[p5 /XYZ 0 421 null]` with `/C [1 0 0]`, `/F 2`, closed (`/Count -1`), and child "Detail" → `[p6 /XYZ 0 300 null]`; "End" → `[p10 /FitH 300]`. Text field "name" = "Ada" on page 3. Info: Title "Links fixture", Author "QA", Subject "Fixture", Keywords "alpha beta". `/PageLayout /TwoColumnRight`.
- `duplex-scan.pdf`: 6 pages "Front 1", "Front 2", "Front 3", "Back 3", "Back 2", "Back 1". `duplex-scan-odd.pdf`: 5 pages "Front 1", "Front 2", "Front 3", "Back 2", "Back 1".

- **AC-536 (P0) (ours) (improvement)** Split, Every page, on `shared-res.pdf`: each of the 12 entries is under 15% of the input's size, and the 12 together are at most 1.25× the input. Each entry renders the same as its source page (pdf.js or PDFium at 72 dpi, no differing pixels), its text is "Shared n", and `qpdf --check` passes.
- **AC-537 (P1) (ours) (improvement)** Pruning holds on every tool and layout. Split, Every page, on `inherited-res.pdf` meets AC-536's limits. Each of these gives one file under 15% of the input's size: Extract page 1 of `shared-res.pdf`; Delete pages 2–12 of it; Organize with it after removing pages 2–12.
- **AC-538 (P0) (ours) (improvement)** Extract `1-5` of `links.pdf`: page 1 has exactly four link annotations. L1 goes to output page 3, L3 to output page 5 (an explicit destination, or a name the output's own `/Dests` resolves), L4 to output page 4, and the URI link is unchanged. Nothing is left of L2. pdf.js resolves every internal link to the page stated.
- **AC-539 (P1) (ours) (improvement)** Split, Every page, on `links.pdf`: every entry holds exactly one page object (no copies of other pages reached through links, bookmarks or fields), and entry 1 has only the URI link. Delete page 10: page 1 keeps L1, L3, L4 and the URI link, and has no L2.
- **AC-540 (P1) (ours) (improvement)** Extract `5-10` of `links.pdf`: "Middle" → page 1 at `/XYZ 0 421`, colour `[1 0 0]`, style flag 2 (bold), still closed; its child "Detail" → page 2 at `/XYZ 0 300`; "End" → page 6 with `/FitH 300`. In Organize with only `links.pdf`, after moving page 12 to the front, "End" → page 11 with `/FitH 300`.
- **AC-541 (P1) (ours) (improvement)** Split (each mode), Extract and Delete on `links.pdf`, and Organize with only `links.pdf`, give outputs whose Title, Author, Subject, Keywords and CreationDate equal the source's, with `/PageLayout /TwoColumnRight`, Producer "BerryPDF" and a ModDate at run time. Organize with `links.pdf` + `three-pages.pdf`, and Alternate, copy no Title or Author.
- **AC-542 (P1) (ours) (improvement)** Extract page 3 of `links.pdf`: the output's form has a text field "name" with the value "Ada", its widget is on page 1, and a PDF library can set it to "Bo" and read that back. Split Custom `1-2, 3-12`: entry 1 has no form fields, and entry 2 has "name".
- **AC-543 (P1) (ours) (improvement)** Delete with `twelve.pdf` + `three-pages.pdf`, typing `last`: each file marks only its own last page. The run gives `twelve.pdf` (11 pages, no "Twelve 12") and `three-pages.pdf` (2 pages, no "Page 3"). After blur the field still reads `last`.
- **AC-544 (P2) (ours) (improvement)** On Extract with `twelve.pdf`: `even` selects 2, 4, …, 12; `odd, 12` selects 1, 3, …, 11 and 12; `10-last` selects 10–12; `EVEN` works like `even`. `lst` shows the inline error naming `lst`, as AC-403 does.
- **AC-545 (P2) (ours) (improvement)** On Split with `twelve.pdf`, the primary action's visible label and accessible name state the parts count (12 files), and they update together with the parts list: Every N = 5 → 3 files; Custom `2-5` → 1 file. With an invalid N, the label shows no count and the action stays disabled.
- **AC-546 (P1) (ours) (improvement)** Organize with `twelve.pdf` + `three-pages.pdf`: Select ▾ → Even pages selects positions 2, 4, …, 14 (A2, A4, …, A12, B2), and Odd pages selects positions 1, 3, …, 15. After Even pages, rotating the selection right and running gives `/Rotate 90` on output pages 2, 4, …, 14 and 0 on the rest.
- **AC-547 (P1) (ours) (improvement)** Organize with `duplex-scan.pdf`: Sort ▾ → Two-sided scan order gives Front 1, Back 1, Front 2, Back 2, Front 3, Back 3 in the grid and in the output. Undo restores the scan order.
- **AC-548 (P2) (ours) (improvement)** With `duplex-scan-odd.pdf` it gives Front 1, Back 1, Front 2, Back 2, Front 3. With `twelve.pdf` + `duplex-scan.pdf` and only B1–B6 selected, it reorders only those six positions (A1–A12 stay first and unchanged).
- **AC-549 (P1) (ours) (improvement)** Organize with `twelve.pdf`, six edits: move A12 to the front, rotate A1 right, duplicate A2, insert a blank page after A3, remove A5, Sort ▾ → Reverse. Ctrl/Cmd+Z six times steps back through each state to A1–A12 unrotated (each intermediate grid checked). Ctrl/Cmd+Shift+Z six times (Ctrl+Y on Windows/Linux too) redoes all six, and running then gives the same output as before the undos. A new edit after an undo clears the redo steps. With focus in a text field (rename, move-to-position), Ctrl/Cmd+Z edits the text, not the page list.
- **AC-550 (P1) (ours) (improvement)** Undo and Redo buttons sit in the workspace toolbar on Organize and Combine & reorder. They are disabled when there is nothing to undo or redo, work by touch at 390×844, and every undo or redo is announced in the polite live region naming the step. History covers every page-list edit, including adding files or pages, and keeps at least 50 steps. It survives switching between the Files and Pages views and Back to options, and Start over clears it. F3 AC-79 still passes.

**Totals with improvements: 109 ACs (AC-400 to AC-550): 52 P0, 54 P1, 3 P2.** The improvements add 15: 2 P0, 10 P1, 3 P2. AC-551 to AC-559 stay reserved. Plus the inherited ACs in §0e.

### For the UX step (step 3)

- **Undo/Redo** (I-10) need a place in Organize's toolbar, which already holds Select, Sort, Remove and Add. On phones the reference's toolbar wraps to four rows; ours must not. Undo and Redo are good candidates for icon buttons with tooltips.
- **Live count in the primary action** (I-7): the label length varies ("Split into 1 file" up to "Split into 1,000 files") within the ≤ 48 px control rule, with singular/plural copy.
- **Keywords in the range field** (I-6): a short hint or tooltip (`last`, `odd`, `even`), no extra text on screen.
- **Multi-file canonical form (spec issue for the lead).** §0a closes open ranges on blur (`10-` → `10-12`, AC-402 "for the first input"). But §3a applies the field to every file (AC-408). With files of different lengths, the rewrite silently changes the meaning for the others: `10-` on a 15-page file becomes 10–12. The same applies to `last`. Recommendation: keep `a-` and keywords symbolic whenever two or more files are loaded.
- **Two-sided scan order** (I-9) needs a one-line tooltip saying what it expects (all fronts, then all backs in reverse). Alternate's one-file status line can point to it.
- **Odd/Even in Organize** (I-8) select by position, while tiles show letter labels (A1, B2). Make "by position" clear without adding text.
- **ZIP results on phones (not adopted):** competitors offer only the ZIP. Consider whether the result card's entry list should let a phone user open one part without unzipping.

Sources (web, 2026-11-26): [iLovePDF: separate PDF pages](https://ilovepdf.com/blog/how-to-separate-pdf-pages) · [iLovePDF pricing](https://www.ilovepdf.com/pricing) · [PDF24 split PDF](https://tools.pdf24.org/en/split-pdf) · [Smallpdf split PDF](https://smallpdf.com/split-pdf) · [Smallpdf support (free limit)](https://smallpdf.com/support) · [PDFgear split PDF](https://www.pdfgear.com/split-pdf/) · [Adobe Acrobat online: split PDF](https://www.adobe.com/acrobat/online/split-pdf.html) · [Adobe Acrobat online: rearrange PDF](https://www.adobe.com/acrobat/online/rearrange-pdf.html) · [Adobe help: organize pages (Acrobat on the web)](https://helpx.adobe.com/ae_en/acrobat/web/edit-pdfs/organize-documents/organize-pages.html) · [Stirling-PDF docs: page operations](https://docs.stirlingpdf.com/Tools/Guides/Page-Operations/) · [Stirling-PDF docs: page editor](https://docs.stirlingpdf.com/Tools/Workspace/Page-Editor/) · [Stirling-PDF issue #209 (duplex sort)](https://github.com/Stirling-Tools/Stirling-PDF/issues/209) · [Stirling-PDF SplitPDFController (source, read only)](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/app/core/src/main/java/stirling/software/SPDF/controller/api/SplitPDFController.java) · [PDFsam: mix PDF](https://pdfsam.org/mix-pdf/) · [qpdf CLI manual (`--remove-unreferenced-resources`, `--split-pages`)](https://qpdf.readthedocs.io/en/latest/cli.html)

## UI

Step 3 (UX), 2026-11-26. This section designs all six tools as **two families that share one look**:

- **F4 (Split, Extract pages, Delete pages)** is the Rotate skeleton (`ToolFlow` + F1 `PageGrid` + `ControlDock`).
- **F5 (Organize, Combine & reorder, Alternate & mix)** is the Merge workspace (`MergeTool` + `page-edit/*`).

Nothing new is invented where one of these already has a piece.

The mockups are in `/mnt/project-files/designs/f4-f5-page-tools/mockups/` (outside git), named `<state>-<width>x<height>.png`. They were made by overlaying the designed controls on the live dev app (`/rotate-pdf`, `/merge-pdf`) with headless Playwright, using the real tokens, classes and fixtures (`twelve.pdf`, `three-pages.pdf`, `odd.pdf`, `separator.pdf` …). That means:

- every measurement below is from a real layout, not a drawing;
- every state is shot at **1366x657 and 390x664** (P-13);
- the key states are also shot at 1280x720, 390x844 and 320x640, at device scale 2.

No reference text, layout or asset was copied. The reference captures were only looked at to check behaviour.

### P-1. Design principles for the page tools

1. **The grid is the preview.** Every option shows its effect on the page tiles before the run:
   - Split shows parts, cuts and left-out pages.
   - Extract shows picked pages.
   - Delete shows marked pages.
   - Organize shows the order itself.
   - Alternate shows the result order in its Pages view.

   No separate "preview" panel, and no mode screen.
2. **The primary says the outcome.** "Split into 3 files", "Extract 5 pages", "Delete 3 pages". When it can't run, it falls back to the plain verb ("Split PDF") and is disabled. The reason is shown once, where the problem is: the field bubble for a bad range, or the status line for a missing file.
3. **One row of options once a file is in.** After upload, the options fold into the strawberry-cream bottom bar (`ControlDock layout="bar"`):
   - From 640px every F4 tool's options fit in **one 76px row**.
   - On phones they fit in **two rows (130px)**.
   - Anything rarer (names, bookmarks, the per-file list) sits behind "More options".
4. **Marks, not removal.** Delete dims and marks a page instead of hiding it, and every mark is one click to undo. Split shows left-out pages in place, dashed and dimmed.
5. **Same control, same place, all six tools:**
   - mode or quick-pick on the left of the bar, then the field, then More options;
   - status, then the primary on the right;
   - the page size slider and Add files in the workspace toolbar;
   - Undo | Redo in the bar's left slot on the editing tools.
6. **Text only where it decides something.** Syntax help is the field's placeholder plus a hint bubble on focus. "Two-sided scan order" explains itself in a tooltip. Odd and even positions read "1st, 3rd, 5th…" with a small page-strip glyph. There are no paragraphs and no descriptions under options.
7. **Normal controls.**
   - Every control is 44px tall (the primary is 52).
   - Icon-only controls are 44×44 with a tooltip that matches their accessible name.
   - Icons are the Phosphor bold set from `gen-tool-icons.mjs`, drawn bare: no boxed or tinted backgrounds behind them.

### P-2. Tokens: additions to F1 U-2, F3 M-2 and `docs/design/berrypdf.md`

No new colours. Add these to `apps/web/src/styles/tokens.css`:

| Token | Value | Use |
|---|---|---|
| `--ip-mark-size` | 28px | Visible circle of a Split mark (scissors). The hit area is 44×44 (`--ip-tap-min`), centred in the gap between two tiles. |
| `--ip-cut-line` | `var(--ip-slot-bar)` (3px) | The cut line drawn the full tray height when a mark is on. It reuses Merge's insert bar width, so a cut and an insert point look related. |
| `--ip-part-disc` | 24px | Part-number disc in More options' Files list. (On the tiles a part starts with an 8px tone dot in the number line, `.ip-part-dot`.) |
| `--ip-dim-left-out` | 0.38 | Opacity of the page image on a Split tile that is in no part. |
| `--ip-veil-marked` | 0.55 | Opacity of the cream veil over the page image of a Delete tile marked for removal. The image is also `grayscale(1)` with a 1px field-line edge, and the label is struck with a 2px line; all static, never animated (visual review 2026-11-26; was a 0.32 opacity, which almost vanished on cream). |
| `--ip-stepper-field-w` | 56px | Number field inside `NumberStepper`. Two 44px buttons sit around it, so it is 152px wide with 4px gaps. |
| `--ip-mix-card-min` | 330px | Minimum column of the wide Alternate card. This gives 3 per row at 1366 and 1 per row below 640. |
| `--ip-bubble-gap` | 8px | Gap between a bar field and its floating hint or error bubble. |

**Part tones (Split).** Parts alternate between **two** tones:

- odd parts use `page-tray` (#fdeef1, today's tray);
- even parts use `surface` (#fff) with a 1.5px `border-card` inset.

BerryPDF reserves hue for categories (`berrypdf.md` → Colour), and five rotating hues would read as five kinds of thing. The non-colour cues carry the meaning:

- the part disc;
- the cut line;
- the part number in the accessible name.

This is a change from §3b's "5 rotating hues" (P-11, decision 5).

**New contrast pairs (WCAG 2.1, measured; light only, because dark mode is not shipped per `berrypdf.md` → Dark mode)**

| Pair | Ratio | Where |
|---|---|---|
| `brand` on `page-tray` / `surface` / `band` (non-text) | 4.25 / 4.78 / 4.35 | Split mark (on) fill, cut line, Extract picked ring |
| white on `brand` (icon) | 4.78 | scissors on a Split mark that is on |
| `field-line` #a2848a on `surface` / `page-tray` (non-text) | 3.39 / 3.01 | Split mark (off) edge, the dashed edge of a left-out tile, Extract's empty pick ring |
| `brand-strong` on `page-tray` / `surface` | 6.03 / 6.78 | part-disc number, scissors on a mark that is off |
| white on `danger` (icon) | 7.89 | Delete's trash badge |
| `danger` on `page-tray` / `band` (non-text) | 7.02 / 7.19 | trash badge against the tile |
| `leaf` on `page-tray` (non-text) / white on `leaf` | 4.74 / 5.33 | Extract pick tick |
| `muted` on `band` | 4.97 | struck-through page number on a marked Delete tile |
| `mp-alert-danger-ink` on `surface`; `danger` border | 9.39; 7.89 | field error bubble |
| `mp-tool-ink` on `sand` / `surface` | 6.35 / 7.71 | Undo / Redo in the bar; Select / Sort / Remove in the toolbar |
| `ink` on `sand` | 11.15 | bar status line |

**Watch-out:** `muted` on `sand` is **4.49:1**, which fails. The bar status must stay `ink`, as `ControlDock` already does (`[&_p]:text-ink`). Nothing in the bar may use `text-muted`.

Every picked, marked, cut, left-out or invalid state also has a non-colour cue: a tick, a trash badge, a scissors icon with a line, a dashed edge, or an icon plus text in the bubble.

### P-3. Layout

#### Height budget and first-screen check (measured on the mockups)

The budget is `berrypdf.md` rules 1–10:

- header 64 (72 from 768);
- head 76, which holds only the `h1`;
- `--ip-work-h` = clamp(320, 100dvh − header − 76 − 20, 640);
- once loaded, toolbar 64 + pages area + bar (`--ip-dock-actual`).

"Empty" is the side panel (F4, ≥ 1024) or the empty bar (F5, and every tool below 1024). The numbers are the primary's top and bottom edges in CSS px.

| Viewport | F4 empty (side panel) | Loaded, all six (bar) | Pages area (loaded) | Fits |
|---|---|---|---|---|
| **1366x657** (hard case) | panel 148–637, primary 560–612 (310 wide) | bar 581–657 (76), primary 593–645 (260 wide) | toolbar 129–193, pages 193–560 | yes, all 27 states |
| 1280x632 | primary 535–587 | bar 556–632, primary 568–620 | 193–535 | yes |
| 1536x730 | primary 633–685 | bar 654–730, primary 666–718 | 193–633 | yes |
| 1920x969 | primary 711–763 (panel capped at 640) | bar 893–969, primary 905–957 | 193–872 | yes |
| 1280x720 (DSF 2) | in view | bar 644–720 | 193–620 | yes |
| 1024x768 | in view | bar 692–768 | 478 tall | yes |
| 768x1024 | bar 946–1024 (78) | same | – | yes |
| 640x900 | bar 822–900 (78) | same | – | yes, after the two fixes in P-3 "640–1023" |
| **390x664** | F4 bar 534–664 (130), primary 598–650 | F4 same; Organize and Alternate 586–664 (78); Combine 532–664 (132) | – | yes, all 27 states |
| 390x844 (DSF 2) | F4 bar 714–844 | F4 same; Organize 766–844 | – | yes |
| 360x640 | F4 primary 574–626 (270 wide) | Organize primary 236 wide | – | yes |
| 320x640 (DSF 2) | F4 bar 510–640 | Organize 562–640 | – | yes, after the 320 fix below |

There is no horizontal overflow at any of these sizes (`scrollWidth − clientWidth = 0`, measured). The page is the only scroller: the pages list grows the document, and the fixed bar never scrolls. The only `data-ip-scroll` regions are the existing ones plus `overlay` (the More options dialog body).

#### F4 at 1280 (≥ 1024 behaves the same), empty

This is the Rotate empty layout. The F1 drop card is on the left. On the right is the 360px side panel (`ControlDock layout="side"`, height `--ip-work-h`), with numbered steps (`mp-step`) and the sticky primary at its foot. Shots: `split-1-empty-1366x657.png`, `extract-1-empty-…`, `delete-1-empty-…` (mockups); the build shot `build/split-1-empty-1366x657.png` (P-14).

- **Split**
  - **1 Split**: 2×2 `ChoiceTiles` (`SegmentedControl look="tiles"`) for Every page · Every N pages · Spreads · Custom. Each has a 30px duotone page-strip glyph, the same drawing style as Rotate's `ScopeIcon`.
  - A second step slot appears only for modes that need input, at a fixed height so nothing shifts:
    - Every N: **2 Pages per file** with the `NumberStepper`.
    - Custom: **2 Parts** with the range field.
  - "More options" is a soft button.
  - The footer shows the status "Add a PDF to start" and the disabled "Split PDF".
- **Extract**: **1 Pages to keep** is three tiles (Odd · Even · Custom, reusing the Rotate scope glyphs) with the range field under them.
- **Delete**: **1 Pages to delete** is the range field alone.

Each panel's content is ≤ 474px high, so it fits the 489px work height at 1366x657 and the 464px at 1280x632.

#### F4 at 1280, loaded (one bar row)

The title drops to the compact head. The toolbar (64) holds the size slider on the left and "Add files" on the right. The tiles take the screen. The bar is one 76px row, `max-w-[1216px]` centred:

| Tool | Left (options, `dock-bar:` forms) | Right |
|---|---|---|
| Split | mode pills (`ChoiceTiles` in `dock-bar:flex-row`, labels only) · Every N: "Pages per file" + `NumberStepper` · Custom: range field (300px) · "More options" (soft, icon + label) | status · primary (260) |
| Extract | Odd · Even · Custom pills · range field · More options | status · primary |
| Delete | range field · (spacer) · More options | status · primary |

From 1024 to 1279 the bar tightens:

- Split's pill reads "Every N";
- the field is 190px;
- More options is a 44×44 icon button with a tooltip.

Shots: `split-2-ready-every`, `split-3-everyn`, `split-4-custom-marks`, `split-5-custom-typed`, `extract-2-ready`, `delete-2-ready` (each `-1366x657`).

#### F4 at 768 (640–1023), loaded

The bar is used from the first paint, as `ControlDock` already does below 1024. It is one 78px row:

- **Split**: a native `Select` "Split" (150px) for the mode · the field (flex) or the stepper · a 44px More options icon button | primary. Below 1024 the pills don't fit beside a field. This was measured: at 640 the four pills, the field and the primary overlap. The native select is one tap on touch.
- **Extract**: Odd · Even · Custom pills · field (flex) · More icon | primary.
- **Delete**: field (flex) · More icon | primary.
- The status line is `sr-only` below 1024 (existing).

#### F4 at 375 (< 640)

The bar has two rows (130px):

- **Row 1**:
  - Split: the `Select` (130px, or flex with the stepper) and the field (flex).
  - Extract: three compact pills and the field.
  - Delete: the field alone.
- **Row 2**: a 52×52 soft More options button, then the primary at flex. The primary is 300px at 390 and 270px at 360.

Tiles run two per row. Each tile's Enlarge sits in the tray's **bottom-right corner** as a 36px white circle (not the centred action pill), so it never covers the page. Shots: every `*-390x664.png`.

**320 fix:** "Split into 1,000 files" needs 176px of text. The primary's padding drops from 28 to 16px below 360 (`max-[359px]:px-4`), so the longest label fits the 230px button at 320.

#### F5: Organize, Combine & reorder, Alternate & mix

**Empty state.**

- Organize and Alternate have **no side panel**. They have no options before a file is in:
  - Organize has none at all;
  - Alternate's options are per file.

  The drop card fills the pages slot (height `100dvh − header − head − bar − 20`), and the bar shows from the first paint with the status "Add files to start" and the disabled primary. Shots: `organize-1-empty`, `alternate-1-empty`.
- Combine & reorder keeps Merge's empty side panel (Merge options).

**Organize toolbar** (in the `toolbarStart` / `toolbarEnd` slots):

| Width | Toolbar |
|---|---|
| ≥ 1280 | Files│Pages · Select ▾ · Sort ▾ · Remove ▾ · size slider … Add files · Add pages ▾ (`organize-2-ready-1366x657`) |
| 1024–1279 | the same, with Select, Sort and Remove as 44px icon-only menu buttons (tooltips) |
| 768–1023 | icon-only Select / Sort / Remove · slider … one **Add ▾** menu (Merge's phone add menu: Add files, Add pages, blank page) |
| < 768 | Files│Pages · **⋯ "Page tools"** (one menu with Select, Sort and Remove sections) · **+ Add ▾** |
| < 360 | as < 768, with Add icon-only |

The reference's toolbar wraps to four rows on phones; ours is one row at every width, measured at 320, 360, 390, 640, 768, 1023, 1024, 1280 and 1366.

**Undo | Redo** sit in the bar's left slot: a joined `mp-toolbar` pair of `mp-btn--tool` (the Rotate left│right pattern).

- From 1024 they show labels.
- Below 1024 they are 44px icon buttons.
- On phones the pair (86px) shares the single 78px bar row with the primary ("Save PDF", 266px at 390).
- On Combine & reorder, the phone bar is [Options (flex) · Undo│Redo] over the primary, which is Merge's two-row bar.

They are not in the workspace toolbar because that toolbar is full at every width (P-11, decision 2). Shots: `organize-2-ready-*`, `combine-1-ready-*`.

**Selection bar.** Merge's floating `SelectionBar` is placed `bottom: calc(var(--ip-dock-actual) + 12px)`, centred over the pages at **every** width. Today's `lg:bottom-6 lg:left-[calc(50%-var(--ip-dock-w)/2)]` is left over from the side-panel layout. At 1366x657 it overlaps the bottom bar: the selection bar runs 577–633 and the bar starts at 581. See `organize-5-selection-*`.

**Alternate.**

- **Files view.** The Files view (default) shows **wide cards** (`SegmentCard variant="mix"`), 3 per row at 1366 and 1 per row below 640. Each card has:
  - a 112px thumbnail tray with the letter badge and remove ×;
  - the name and page count;
  - Normal│Reverse (`SegmentedControl look="tabs"`, max 220px);
  - `NumberStepper` + "per turn";
  - Repeat (`Switch`, one-page files only, on its own row);
  - move earlier / later.

  On phones the card uses grid areas: thumbnail (72px) beside name, count and move arrows, with the settings full width underneath.
- **Pages view.** The Pages view is the **read-only result** (`EditablePageGrid readOnly`): tiles labelled A1, B1, A2…, click opens the preview, and there is no drag, insert, add tile or selection.
- **Bar.** The bar has the status and "Mix PDFs". There is no Undo│Redo (P-11, open question 3).

Shots: `alternate-2-files`, `alternate-3-separator`, `alternate-4-preview`, `alternate-5-one-file`.

#### 640–1023: two fixes found while measuring

1. **Merge's pages-view toolbar overflows today** between 640 and about 710px. At 640 it measures `scrollWidth` 686, because the size slider + Add files + Add pages don't fit. This breaks "no sideways scroll" on `/merge-pdf` and would break `/combine-reorder-pdf`. The fix is the same one Organize needs: below 1024 the shared toolbar shows **one Add ▾ menu** (the phone menu) instead of Add files + Add pages.
2. **At 320, Merge's Sort button is squeezed to 20px wide** and the Add button runs 14px past the toolbar's edge. Toolbar icon buttons need `shrink-0`, and the Add button goes icon-only below 360.

#### Result (F1 `ResultCard`, all six)

One PDF: unchanged (Rotate's card).

**ZIP (Split, and several inputs on Extract or Delete):**

- **Left well (240px)**: the entry list, up to 4 rows (3 on phones), then "Show all {n}". Each row shows the name, page count and a 36px Download icon button (`Download twelve-3.pdf`). On a phone, getting one part takes one tap, with no unzipping.
- **Right**: the name, then "{size} · {n} files", then **Download** straight after (moved up so Start over and Back stay in view at 1366x657), then the privacy line.
- "Show all" expands the list in place, so the document grows and the page scrolls. It is not a nested scroller.
- **Continue with** is hidden for a ZIP (F1 AC-43 adapted).

Shot: `split-9-result-*`.

#### Sticky search and filter bars

Not applicable. None of the six has a list the user searches or filters. Organize's Select ▾ acts on the grid; it is not a filter.

### P-4. Component tree (reuse first)

#### New primitives (`components/ui/`)

- **`NumberStepper`**: [− IconButton] [text input, `inputmode="numeric"`, 56px] [+ IconButton]. Props: `value`, `min` (1), `max` (9,999), `label`, `error`.
  - ArrowUp / ArrowDown step by 1, and PageUp / PageDown by 10.
  - − is `aria-disabled` at `min`.
  - Free typing is allowed. The value is validated on input after 300ms and on blur, and an invalid value gets the same bubble as the range field.
  - Used by Split (Every N) and Alternate (per turn).
- **`FieldBubble`**: the floating hint or error above a bar field: white, 1.5px `danger` edge with the alert icon for errors, or `border-card` without an icon for hints, with a 6px tail. It is absolutely positioned (`bottom: 100% + --ip-bubble-gap`), so it never moves the layout. In the side panel the same text is a line under the field, in a reserved 20px slot.

#### Shared F4 pieces (`components/page-select/`, new folder)

- **`RangeField`**: an `ip-field` text input (height 44) with a trailing **×** IconButton (Clear selection / Clear parts, shown only when there is something to clear) and the `FieldBubble`.
  - It uses `lib/page-ranges.ts` (§0a).
  - The "Differs per file" placeholder applies when several files differ (§3a).
  - The × replaces §3a's separate Clear selection button, so the bar does not need an extra control.
- **`usePageSelection`**: the §0a selection layer as a hook (click, Shift+click, Ctrl/Cmd+click, Space, Shift+Space, Escape), feeding `decoratePage`.
- **`SplitMarks`**: the focusable mark buttons rendered in the grid gaps (P-6).
- **`PartsList`**: the Split files list inside More options. It is virtualised in the dialog body (an `overlay` scroller) above 50 rows.
- **`MoreOptionsDialog`**: `Dialog` (default variant ≥ 640, centred, about 440px wide, content-sized; `sheet` variant below 640). It holds:
  - Split: `PartsList`, "Name pattern", "Remove bookmarks" (`Switch`);
  - Extract: name pattern and bookmarks;
  - Delete: bookmarks only.

  The trigger shows a "{n} changed" chip, the F3 Options chip.

#### Changes to existing shared code

| Piece | Change | Why |
|---|---|---|
| `tool-flow/types.ts` `PageDecoration` | Add optional `picked`, `marked`, `part` (number + first-of-part flag), `leftOut`. | Extract, Delete and Split draw on the F1 tile. Rotate passes none. |
| `PageGrid` / `PageTile` | Optional `onTileActivate` (replaces the default "open preview" on the tile button) and `tilePressed` (`aria-pressed`). A `renderGap(file, index)` slot draws Split marks between tiles. Enlarge moves to the tray corner when the tile has no other action. | Extract and Delete toggle on click; Split's tiles keep opening the preview. |
| `ControlDock` | A `more` slot (More options button + chip). A `start` slot (left of the options, for Undo│Redo). `emptyLayout="bar"` (no side panel when empty). | Organize, Alternate and the F4 bar. |
| `ToolFlow` | `primaryLabel?: () => string` (live count), `emptyLayout`, pass-through of the slots above. | I-7 / AC-545. |
| `ResultCard` | ZIP: entry rows with a per-entry Download (the part blobs are kept after zipping; they are already in memory), and Download first. | P-3 Result; phones. |
| `page-edit/SelectionBar` | Position from `--ip-dock-actual` at every width. | The overlap bug (P-3). |
| `page-edit/SegmentGrid` / `SegmentCard` | `variant="mix"` with a `settings` slot. | Alternate. |
| `page-edit/EditablePageGrid` | `readOnly` (no drag, insert points, add tile, selection or More menu; click = preview). | Alternate's result view. |
| `tools/merge/MergeTool` | Parameterised by slug (§3f), with history (I-10) and an Add ▾ menu below 1024. | F5. |

#### Per tool

```
SplitTool / ExtractTool / DeleteTool  (tools/<slug>/)
└─ ToolFlow tool=flowTool(slug) primaryLabel=… decoratePage=… onPageKey=…
   ├─ renderOptions(ctx)      → <XOptions layout="side|bar">   (Step + ChoiceTiles | Select, RangeField | NumberStepper)
   ├─ PageGrid (F1)           → PageTile + decorations, SplitMarks (Split), Enlarge in the corner
   ├─ ControlDock             → options · more=<MoreOptionsButton/> · status · Primary
   ├─ MoreOptionsDialog       → PartsList (Split) · NamePatternField · Switch "Remove bookmarks"
   └─ ResultCard              → EntryList with per-entry download (ZIP)

MergeTool slug="organize-pdf" | "combine-reorder-pdf" | "alternate-mix-pdf" | "merge-pdf"
├─ toolbarStart → ViewToggle · OrganizeMenus (Select ▾ Sort ▾ Remove ▾ | ⋯ Page tools) · Sort ▾ (others)
├─ toolbarEnd   → Add files · Add pages ▾ (≥1024) | Add ▾ (<1024)
├─ renderWorkspace
│   ├─ Files: SegmentGrid (Organize/Combine) | SegmentGrid variant="mix" (Alternate cards)
│   └─ Pages: EditablePageGrid | EditablePageGrid readOnly (Alternate)
├─ SelectionBar (fixed position)
└─ ControlDock start=<HistoryButtons/> (not Alternate) · Options (Combine/Merge only) · status · Primary
```

New icons (Phosphor, MIT, bold weight, added to `UI_ICONS` in `scripts/gen-tool-icons.mjs`):

| Icon | Use |
|---|---|
| `scissors` | marks |
| `trash` | Delete badge, Remove ▾ |
| `arrow-u-up-left` | Undo; already the `ResetIcon` glyph |
| `arrow-u-up-right` | Redo |
| `selection-all` | Select ▾ |
| `selection-inverse` | Invert |
| `sliders-horizontal` | More options |
| `dots-three` | Page tools |
| `download-simple` | per-entry download |

The page-strip glyphs (mode tiles, odd/even items) are inline SVGs drawn in the `ScopeIcon` style. Nothing sits in a boxed or tinted background.

### P-5. Options per tool (all §3 controls, every form)

| Control | Side panel (empty, ≥ 1024) | Bar row (≥ 1024) | Bar 640–1023 | Phone (< 640) |
|---|---|---|---|---|
| Split mode | 2×2 tiles with glyphs | 4 content-width pills, labels only ("Every N") | `Select` ("Every N") | `Select` ("Every N", row 1) |
| Split N | step 2, "Pages per file" + stepper | stepper, with "Pages per file" from 1280 | stepper | stepper (row 1) |
| Split / Extract / Delete range | step 1 or 2, field (full width) + under-line error | field 300px (190 below 1280), a fixed width that never shrinks + bubble | field (flex) + bubble | field (flex) + bubble; Extract below 400: its own row under the pills. The bubble stays inside the screen (16px) |
| Extract quick pick | 3 tiles with glyphs | 3 pills | 3 pills | 3 compact pills (row 1) |
| More options | bare icon + label | bare icon + label from 1440 (icon-only below, with a tooltip) | 44px bare icon | 44px bare icon (row 2) |
| Status | above the primary | left of the primary | `sr-only` | `sr-only` |
| Primary | 310px, sticky at the panel foot | 260px | 200px+ | flex (row 2) |

**Split mode switch.** Switching mode keeps the file and recomputes the parts at once (AC-439):

- the tiles recolour;
- the discs and cut lines update;
- the primary count changes.

Choosing Custom from another mode starts from the current parts written into the field (§3b).

**Range field hint.** Placeholders:

- Split: "1-4, 5-10"
- Extract: "1-3, 5, 8-last"
- Delete: "2, 5-7, last"

On focus, while the field is empty, the hint bubble says "Also: odd, even, last". It leaves on the first keystroke. An error takes the same slot, and the error wins.

**Errors** name the item (P-12). The primary falls back to its plain label and is disabled. The status keeps the counts. There is no second copy of the message.

"Keep at least one page" (Delete, every page marked) also uses the bubble, because it is the field's value that empties the file, even when the marks came from clicks (`delete-3-all-*`).

**More options dialog** (`split-7-more-1366x657.png`, `-390x664.png`):

- **Files {n}**: one row per part: number disc · name (a button; activating it swaps in an inline input, Enter saves, Escape cancels) · ".pdf" · page range.
- **Name pattern**: a field. Its tokens are in the field's tooltip, not on screen.
- **Remove bookmarks**: a `Switch`.
- **Done**.

Changes apply immediately. Done only closes the dialog. Escape and the backdrop close it too.

#### Several files (F4)

- The toolbar shows the Files│Pages view toggle (F1, from two files).
- In the Pages view each file's pages run under its own small header (existing `PageGrid` sections).
- The field applies to all files. A click changes one file. When the files differ, the field empties and shows "Differs per file" (§3a).
- No new mockup; this is the F1 layout.

### P-6. Grid decorations

| Tool | Tile at rest | Tile hover / focus (fine pointer) or always (touch) | Tile active state |
|---|---|---|---|
| Split | Tray in its part tone; the **first** tile of each part starts its number line with an 8px dot in the part tone (the label already says "Part n"; visual review 2026-11-26: a numbered disc on the page covered its text) | The mark after the tile shows as a white 28px circle, `field-line` edge, `brand-strong` scissors | Mark on: `brand` fill, white scissors rotated 90°, a 3px `brand` cut line the full tray height in the gap |
| Split, left-out page (Custom) | Dashed `field-line` tray edge, page at 0.38, no disc; marks on either side hidden (and absent from the DOM) | – | – |
| Extract | Plain tray | An empty 24px ring (`field-line` edge) at the top-right | Picked: 2px `brand` ring on the tray plus the `leaf` tick disc (the F1 leaf tick) in the ring's place |
| Delete | Plain tray | A ghost trash badge (white circle, `danger` icon) at the top-right | Marked: page at 0.32 + grayscale, `band` tray with a 1.5px `brand-tint-border` edge, a solid `danger` trash badge with a white icon, page number struck through |

**Mark geometry.** The grid gets `px-2` so a mark in the gap after the last tile of a row never overflows the tray. The mark sits on that row's right edge, and the cut continues at the start of the next row (no line is drawn there).

**Touch.** Marks and rings are always visible on touch, because there is no hover. The marks are 28px circles in a 44px hit area, so they do not crowd two tiles per row (`split-2-ready-every-390x664.png`).

**Tile click.**

- Split: opens the preview, the F1 default. This keeps the `viewport-fit.spec.ts` "Page 1 of" path.
- Extract and Delete: toggles, with Enlarge in the corner (§3c, §3d).
- Organize and Combine: Merge's tiles, unchanged.
- Alternate (Pages view): preview.

### P-7. States (each with its shots; `<x>` = 1366x657 and 390x664)

| State | What it looks like | Shots |
|---|---|---|
| Split, empty | Drop card + side panel (≥ 1024) or bar with `Select` + disabled "Split PDF" (< 1024) | `split-1-empty-<x>` |
| Split, loading / password | F1 skeleton tiles at their final aspect box; F1 password dialog. The bar is already in its loaded form, disabled | F1 (unchanged) |
| Split, ready (Every page) | 12 part dots, a cut line after every page, "Split into 12 files" | `split-2-ready-every-<x>` |
| Split, Every N | Stepper = 5, three parts, "Split into 3 files" | `split-3-everyn-<x>` |
| Split, Custom by marks | Marks after 4 and 10 on; field `1-4, 5-10, 11-12`; hovered mark shown off | `split-4-custom-marks-<x>` |
| Split, Custom typed with gaps | `1-3, 8-9, 12`: pages 4–7, 10, 11 dashed and dimmed; status "6 of 12 pages in 3 files" | `split-5-custom-typed-<x>` |
| Split, invalid | Field `1-4, 13`: bubble `"13": this file has 12 pages`, `aria-invalid`, primary "Split PDF" disabled; the grid draws no parts (plain tiles, no part labels) and no marks until the text parses (visual gate round 2) | `split-6-invalid-<x>` |
| Split, More options | Dialog / sheet with Files (first row renamed to `intro`), Name pattern, Remove bookmarks | `split-7-more-<x>` |
| Split, processing | F1 processing card over the grid (berry loader, "Splitting… 42%"); the bar is disabled and its primary becomes the jam progress bar in the same box | `split-8-processing-<x>` |
| Split, done (ZIP) | P-3 Result | `split-9-result-<x>` |
| Extract, empty | Side panel with Odd · Even · Custom + field | `extract-1-empty-<x>` |
| Extract, ready, nothing picked | Rings on hover/touch; "Extract pages" disabled; status "Pick the pages to keep" | (as `extract-2` without picks) |
| Extract, picked | 2–5 and 9 picked; field `2-5, 9`; "Extract 5 pages"; status "5 of 12 pages" | `extract-2-ready-<x>` |
| Extract, invalid | `2-x`: bubble `"x": not a page number` | `extract-3-invalid-<x>` |
| Delete, empty | Side panel with the field | `delete-1-empty-<x>` |
| Delete, marked | 2, 4, 6 marked; ghost badge on hover; "Delete 3 pages"; status "9 of 12 pages kept" | `delete-2-ready-<x>` |
| Delete, every page | `1-`: all marked, bubble "Keep at least one page", primary disabled | `delete-3-all-<x>` |
| Organize, empty | Drop card in the pages slot; bar with the disabled "Save PDF" | `organize-1-empty-<x>` |
| Organize, ready | A1–A12, B1–B3; Undo on, Redo off | `organize-2-ready-<x>` |
| Organize, Select ▾ open | All · None · Invert │ "1st, 3rd, 5th…" · "2nd, 4th, 6th…" with page-strip glyphs | `organize-3-select-menu-<x>` |
| Organize, Sort ▾ open | Name A to Z … Reverse order · Two-sided scan order + tooltip | `organize-4-sort-menu-<x>` |
| Organize, selection | Two tiles picked (F3 ring + tick); selection bar above the bottom bar | `organize-5-selection-<x>` |
| Organize, Remove ▾ open | Remove selected · Keep only twelve.pdf · Keep only three-pages.pdf · Remove all | `organize-6-remove-menu-1366x657` (on phones it is the Remove section of Page tools) |
| Combine, ready | Merge's pages view first, Merge's options, Undo│Redo | `combine-1-ready-<x>` |
| Alternate, empty | Drop card + bar with the disabled "Mix PDFs" | `alternate-1-empty-<x>` |
| Alternate, two files | Wide cards, defaults | `alternate-2-files-<x>` |
| Alternate, separator | `twelve.pdf` 4 per turn + `separator.pdf` with Repeat on | `alternate-3-separator-<x>` |
| Alternate, Pages view | Read-only result A1, B1, A2, B2… | `alternate-4-preview-<x>` |
| Alternate, one file | Primary disabled; status "Add one more file to mix"; an info callout at the top of the workspace (both views, dismissible, gone once a second file is in) one line, "All fronts, then all backs in one file?" with "Open in Organize" as an inline link (visual gate round 2: the boxed button made it about 135px tall at 320). Inline, not a floating notice: it stays while one file is in, so floating it would cover the tools row or the card the whole time (visual gate, 2026-11-26) | `alternate-5-one-file-<x>` |
| Alternate, per-turn invalid | Bubble on that card's stepper: "Use a whole number from 1"; primary disabled | (as `split-6`, on the card) |
| Error / limit / wrong type | F1 notices (floating `NoticeStack`) and the F1 error panel with Retry; every setting kept | F1 (unchanged) |

### P-8. Keyboard flow, focus order and ARIA

**Tab order once loaded:**

1. header;
2. toolbar: slider, Add files (F5: the view toggle and menus first);
3. grid: **one** Tab stop, roving;
4. inside the active tile: its Enlarge, then (Split) the mark after it;
5. bar: mode → field → its × → stepper → More options → Undo │ Redo → primary.

DOM order follows this visual order (the bar is last in the DOM). The empty side panel follows the same order, top to bottom.

| Keys | Where | Does |
|---|---|---|
| Arrows, Home / End, PageUp / PageDown | grid | Move the tile focus (F1) |
| Enter | Split tile, Alternate result tile | Open the preview |
| Space / Enter | Extract / Delete tile | Toggle pick / mark |
| Enter | Parts / pages field, Pages per file, a card's pages per turn | Runs, as the primary would, with the text exactly as typed (a paste then Enter at once included, eval G-3); while the text is invalid it shows its message and does not run |
| Shift+Space, Shift+click | Extract / Delete | Extend from the last toggled tile |
| Ctrl/Cmd+click | Extract / Delete | Toggle (same as click) |
| Delete / Backspace | Delete tile | Toggle the mark (AC-470) |
| Escape | Extract / Delete grid | Clear the selection or marks (AC-406) |
| Ctrl/Cmd+A | Extract grid; Organize grid | Pick all (Extract); select all (Organize, AC-491) |
| Tab from a Split tile | grid | Its Enlarge, then "Split after page n" (AC-425); Enter / Space toggles it; Shift+Tab goes back |
| ArrowUp / ArrowDown | stepper | ±1 |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y | Organize, Combine (and Merge) | Undo / redo (AC-549); ignored while a text field has focus |
| Alt+Arrow | Alternate cards, Organize tiles | Move (F3) |

**ARIA**

- **Mode and quick pick.** Split's mode is a `radiogroup` "Split" (tiles or pills), or a native `select` with an accessible name "Split". Extract's quick pick is a `radiogroup` "Pick".
- **Range field.** Accessible name "Parts" / "Pages to keep" / "Pages to delete". `aria-describedby` points to the sr-only hint "For example 1-3, 5, 8-last. You can also type odd, even or last." and, when present, the error. `aria-invalid="true"` while invalid. The error bubble has `role="alert"`, once per new error, not per keystroke.
- **Clear ×.** "Clear selection" (Extract, Delete) or "Clear parts" (Split).
- **Tiles.**
  - Split: "Page 5, part 2 of 3"; a left-out page is "Page 6, not in any part" (AC-424).
  - Extract: a button with `aria-pressed`, "Page 2 of 12".
  - Delete: a button with `aria-pressed`, "Remove page 2" (AC-465).
  - The grid hint (`#ip-grid-hint`) adds "Space picks, Shift+Space picks a range" on Extract and Delete.
- **Marks.** A `button` "Split after page 4" with `aria-pressed`. A hidden mark is not in the DOM.
- **Live region** (polite, debounced 500ms):
  - Split: "3 files";
  - Extract: "5 of 12 pages picked";
  - Delete: "Page 2 marked. 11 of 12 pages kept" / "Page 2 kept";
  - Undo / Redo: "Undone: rotate" / "Redone: move".
- **Primary.** The visible label is the accessible name, so it updates with the count (AC-545). When disabled, `aria-describedby` points to the status text.
- **More options.** `aria-haspopup="dialog"`; with changes its name is "More options, 2 changed". The dialog is labelled by its title, and focus goes to its first control on open (`berrypdf.md` → Modals, rule 5) and returns to the trigger on close.
- **Undo / Redo.** A `group` "History", using `aria-disabled` instead of `disabled`, so focus stays on Undo after the last undo. `aria-keyshortcuts="Control+Z"` / `"Control+Shift+Z"`.
- **Organize menus** (`Menu`, popover, `role="menu"`).
  - Odd and even items are named "Odd positions: 1st, 3rd, 5th…" / "Even positions: 2nd, 4th, 6th…". The visible text is inside the name (2.5.3), and the page-strip glyph is `aria-hidden`.
  - "Two-sided scan order" has `aria-describedby` → its tooltip.
- **Alternate cards.** Each card is a `listitem` "odd.pdf, A, 5 pages". It contains a `radiogroup` "Order of odd.pdf", a stepper "Pages per turn from odd.pdf", a `switch` "Repeat separator.pdf", and "Move odd.pdf earlier / later". The result view is a `list` "Result order"; each tile is "A1, page 1 of odd.pdf".

**Focus moves.**

- After a mode switch, focus stays on the mode control.
- After Clear ×, it goes to the field.
- After "Remove all" (Organize), it goes to the drop card's button (F3).
- After the result card opens, it goes to Download (F1).
- After Escape in the More options dialog, it returns to the trigger.

Focus rings are `:focus-visible` only: 2px `brand`, 2px offset. Fields use their own edge.

### P-9. Drag and drop

- **F4 has no drag.** Page order is not an F4 option (§3a). Dropping files anywhere adds them (F1 `DropOverlay`).
- **Organize and Combine**: F3 M-7 unchanged (tiles, cards, insert bar, ghost, touch long-press).
- **Alternate**: card drag and Alt+Arrow moves as F3 cards. The wide card uses the same ghost (`--ip-lift-scale`) and the same 3px insert bar between cards. The result view does not drag.

### P-10. Micro-interactions

Tokens and presets come from `docs/design/motion.md`. Everything is transform, opacity, or colour ≤ 200ms; nothing animates layout; everything is interruptible. Under reduced motion it is opacity only, or instant.

| # | Interaction | Motion | Reduced |
|---|---|---|---|
| P1 | Mode switch / quick pick / typed range → tiles update | Tray tones, rings and badges are colour transitions, 120ms. Part discs and ticks fade + scale 0.9 → 1 in 120ms `--ease-out` (no overshoot). Cut lines `scaleY(0 → 1)` from the centre, 200ms `--ease-out`. No stagger, so a 1,000-page grid changes in one frame. | Colour and opacity only |
| P2 | Mark hover (fine pointer) | The off-mark fades in, 120ms, as the pointer enters the tile or the gap | Instant |
| P3 | Mark toggle | Press scale 0.94 at 120ms; fill 120ms; cut line P1 | No scale |
| P4 | Extract pick / Delete mark | Pick: ring colour 120ms; the tick fades in and scales 0.8 → 1, 120ms. Delete: page opacity 1 → 0.32 in 200ms (grayscale switches at once); the badge goes from ghost to solid in 120ms; the number strike appears with it | Opacity only |
| P5 | Primary count | The text changes on the same frame (no rolling number). The button keeps its slot width, so nothing shifts | Same |
| P6 | Field bubble (hint or error) | Hint: fade + y 4 → 0, 120ms, after a 300ms focus delay. Error: the same, on the first invalid value after the 300ms input pause. The field shakes 4px, 240ms, only on blur or on pressing a disabled primary (motion.md S10) | Fade only, no shake |
| P7 | More options | ≥ 640: dialog S11. < 640: sheet S13. Rows of the parts list are never staggered | Fade 120ms |
| P8 | Organize Sort / Reverse / Two-sided / Odd-Even select | Sort and reverse: T9 FLIP of the visible tiles, 200ms `--ease-move`; above 40 moving tiles, a 120ms crossfade. Select: colour only (P4 timings) | Instant |
| P9 | Undo / Redo | The inverse of the original move: FLIP T9, remove T10 (as built), insert T4 | Instant |
| P10 | Selection bar | Enter y +8 → 0 + fade 200ms; exit fade 120ms. It sits above the bottom bar, so it never covers the primary | Fade 120ms |
| P11 | Alternate setting change | The card updates in place (no motion). The Pages view, when shown, crossfades its tiles in 120ms (it is a new order, not a move) | Instant |
| P12 | Processing / result / per-entry download | T11 / T12 / T13. The per-entry icon does the T13 arrow → tick swap on its own 36px button | Per T11–T13 |
| P13 | View toggle, files arriving, thumbnails | T4–T7 unchanged | As built |

**No-shift checklist:**

- The bar holds its final height from the first frame (76 / 78 / 130).
- The side panel's step-2 slot is reserved per mode.
- Bubbles, menus, tooltips, the selection bar and notices float.
- Marks live in the existing grid gap.
- Discs and badges are absolute.
- The primary's width is fixed per breakpoint.
- The result list expands in place below the fold only after "Show all".

### P-11. Decisions and open questions for the lead

1. **`aria-pressed`, not `aria-selected`, on Extract tiles.** The tiles are toggle buttons in a list, not options in a listbox, and `aria-selected` is not valid on `button`. AC-402 and §0a should read `aria-pressed="true"`. Delete already uses `aria-pressed` (AC-465).
2. **Undo│Redo live in the bottom bar's left slot, not the workspace toolbar.** The toolbar is full at every width. The bar slot is empty on Organize and Combine and is in the thumb zone on phones. AC-550's "workspace toolbar" should read "the bottom bar".
3. **Live counts on Extract ("Extract 5 pages") and Delete ("Delete 3 pages")**, extending I-7 beyond Split. AC-545 covers Split only, so QA needs one more check per tool. The longest measured label, "Split into 1,000 files", is 176px of text and fits the 260px bar slot. On phones the padding change keeps it inside 230px at 320.
4. **Split's tile click opens the preview** (§3b says "no action"). This gives keyboard and touch users a way to see a page, and it keeps the `viewport-fit.spec.ts` "Page 1 of" path working.
5. **Two alternating part tones instead of 5 hues** (§3b), per BerryPDF's colour rule. Disc, cut line and accessible name carry the part.
6. **Split's parts list lives in More options**, not in the dock. In a one-row bar a list can't fit, and the grid plus the primary already preview the parts live. AC-420, AC-429 and AC-430 need "open More options" as a step.
7. **ZIP result card:** the entry list moves into the preview well with a per-entry download, and Download comes first. This changes F1 `ResultCard`. Rotate and Merge have no ZIP today, so their screens look the same, but their e2e result specs must stay green.
8. **SelectionBar position fix** in shared `page-edit` code (overlap at 1366x657 on `/merge-pdf` today). Merge's e2e that reads the bar's position, if any, follows it.
9. **No side panel when empty on Organize and Alternate** (`ControlDock emptyLayout="bar"`). The panel would hold only a disabled button.
10. **Organize's action reads "Save PDF"** ("Saving"). Its output is a single edited copy, so "Organize PDF" as a verb would read oddly on the button. **Combine & reorder's reads "Combine PDF"** ("Combining"; lead override, 2026-11-26): the button names the tool the visitor is on (P-13).
11. **Alternate's one-file callout offers "Open in Organize"** (inline at the top of the workspace since the 2026-11-26 visual gate), handing the file over the way Continue with does. Organize's Two-sided scan order then fixes it (I-9).
12. **`viewport-fit.spec.ts`** opens previews with the `/^Page 1 of/` tile button. On Extract and Delete the tile toggles instead, so the spec must click "Enlarge page 1" on those two routes.
13. **Merge toolbar fixes** (P-3): one Add ▾ menu below 1024 (today `/merge-pdf` scrolls sideways from 640 to about 710 in the Pages view), and `shrink-0` plus an icon-only Add below 360. These are real bugs on a shipped route; fixing them here, in shared code, is the cheapest route.
14. **Long `h1`s wrap on phones.** "Combine & reorder PDF pages" wraps at 390, and "Alternate & mix PDF" at 360. Both still fit, because the head grows but the bar is fixed. Once a file is in (and on the result), the head is compact below 1024 px: 22px, 19px below 360 px, and a long title wraps to a second compact line; it is never cut with an ellipsis (visual gate round 2). A shorter `h1` (for example "Combine PDF pages") would keep the head to one line, but it trades against the SEO keyword. This is the lead's call, with SEO.
15. **New Phosphor UI icons** (P-4), MIT, generated like the existing ones.

**Open questions (no blocker):**

1. **Spreads tooltip.** "Spreads" is a short label. The tile carries a tooltip, "Page 1 alone, then pairs: 2-3, 4-5…". Is that enough, or should the side-panel tile show it as a second line? Recommendation: tooltip only.
2. **Status for Split.** The status keeps "{pages} pages · {files} files" instead of §4's "{n} files", because the primary already says the count. With pages left out it reads "6 of 12 pages in 3 files".
3. **Alternate undo.** Alternate has no Undo│Redo. Card moves and settings are few, and removal keeps F3's undo notice. If the evaluator counts consistency with Organize, the same `HistoryButtons` drop in at no layout cost (the bar's left slot is free).
4. **Extract "Select all".** AC-456 picks all 12 by clicks. Ctrl/Cmd+A covers keyboards. A visible "All" pill would make a fourth pill; not proposed.

### P-12. Performance: first-load JS per route (gzip, kB; entry / entry + preloads)

`apps/web/scripts/first-load-budget.mjs` gets these rows (cloud build +2, as today):

| Route | Budget | Basis |
|---|---|---|
| `/split-pdf` | **145 / 155** | Rotate (141 / 151) + `lib/page-ranges` (~1.5) + `RangeField` / `FieldBubble` / `NumberStepper` (~1.5) + `SplitMarks` and decorations (~1) |
| `/extract-pdf-pages` | **143 / 153** | Rotate + range parser + field + selection hook |
| `/delete-pdf-pages` | **143 / 153** | same as Extract |
| `/organize-pdf` | **150 / 160** | Merge's budget. Organize drops `MergeOptions` from the first load and adds its menus and history (~2) |
| `/combine-reorder-pdf` | **150 / 160** | the Merge code on another route |
| `/alternate-mix-pdf` | **148 / 158**; cloud build **151 / 160** (lead, 2026-11-26) | Merge workspace minus `MergeOptions`; `EditablePageGrid readOnly` behind `next/dynamic`, prefetched on hover / focus of "Pages". Cloud entry +3, not +2: it shares every first-load chunk with Organize and differs only in its page chunk (150.6 kB after the F4 and tile-rule merges) |
| `/merge-pdf` | stays **150 / 160** | history, the Add ▾ change and the selection bar fix must fit |

The phone total stays ≤ 170 KB JS.

**Kept out of the first load:**

- `MoreOptionsDialog` and `PartsList`: `next/dynamic`, prefetched on hover or focus of More options.
- The ZIP writer and every copy job: in the processing worker (§0a).
- pdf.js: on first intake (F1).

No new dependency: the parser, the stepper and the virtualiser are in-house.

### P-13. Copy (our own wording)

The strings live in `tools/<slug>/copy.ts`, and the shared ones in `components/page-select/copy.ts`. `{n}` values use `toLocaleString("en")` ("1,000"), and singular / plural forms are separate strings, never "file(s)".

**Shared F4**

| Key | Text |
|---|---|
| Field name, Split / Extract / Delete | Parts · Pages to keep · Pages to delete |
| Placeholder, Split / Extract / Delete | 1-4, 5-10 · 1-3, 5, 8-last · 2, 5-7, last |
| Placeholder when files differ | Differs per file |
| Hint bubble (focus, empty) | Also: odd, even, last |
| Hint (sr-only description) | For example 1-3, 5, 8-last. You can also type odd, even or last. |
| Clear button | Clear selection (Extract, Delete) · Clear parts (Split) |
| Error: not a number | "{item}": not a page number |
| Error: page 0 | "0": pages start at 1 |
| Error: past the end (one file) | "{item}": this file has {count} pages |
| Error: past the end (every file) | "{item}": past the last page of every file |
| Error: reversed range | "{item}": start is after end |
| Error: nothing left (Delete) | Keep at least one page · Keep at least one page of {file} |
| Notice: a file skipped (Extract) | {file} has none of these pages, so it's skipped. |
| More options button, chip | More options · {n} changed |
| Dialog | More options · Files · Name pattern · Remove bookmarks · Done |
| Name pattern tooltip | {name} file name · {pages} page range · {n} file number · {first} · {last} · {date} |
| Rename button (sr) | Rename {name} |
| Empty status | Add a PDF to start |

**Split**

| Key | Text |
|---|---|
| Step 1 / step 2 heads | Split · Pages per file · Parts |
| Modes | Every page · Every N pages (bar 1024–1279: Every N) · Spreads · Custom |
| Spreads tooltip | Page 1 alone, then pairs: 2-3, 4-5… |
| Stepper (sr) | Pages per file · Fewer pages per file · More pages per file |
| Stepper error | Use a whole number from 1 |
| Mark (sr) | Split after page {n} |
| Tile (sr) | Page {n}, part {p} of {total} · Page {n}, not in any part |
| Primary | Split into {n} files · Split into 1 file · Split PDF (when it can't run) |
| Progress | Splitting |
| Status (with left-out pages) | {used} of {total} pages in {n} files |
| Live | {n} files · 1 file |

**Extract pages**

| Key | Text |
|---|---|
| Step head | Pages to keep |
| Quick pick | Odd · Even · Custom |
| Tile (sr) | Page {n} of {total} |
| Primary | Extract {n} pages · Extract 1 page · Extract pages (disabled) |
| Progress | Extracting |
| Status | {k} of {n} pages · Pick the pages to keep |
| Live | {k} of {n} pages picked |

**Delete pages**

| Key | Text |
|---|---|
| Step head | Pages to delete |
| Tile (sr) | Remove page {n} |
| Primary | Delete {n} pages · Delete 1 page · Delete pages (disabled) |
| Progress | Deleting |
| Status | {kept} of {n} pages kept · Pick pages to delete |
| Live | Page {n} marked. {kept} of {total} pages kept · Page {n} kept |

**Organize** (Merge's `copy-edit.ts` strings for tiles, picker, move and remove, through the `labels` prop)

| Key | Text |
|---|---|
| Toolbar | Select · Sort · Remove · Page tools (phone) · Add (below 1024) |
| Select ▾ | Select all · Select none · Invert selection · 1st, 3rd, 5th… · 2nd, 4th, 6th… |
| Select ▾ (sr names) | Odd positions: 1st, 3rd, 5th… · Even positions: 2nd, 4th, 6th… |
| Sort ▾ | Name A to Z · Name Z to A · Oldest first · Newest first · Reverse order · Two-sided scan order |
| Two-sided tooltip | For a scan of all fronts, then all backs in reverse |
| Remove ▾ | Remove selected · Keep only {file} · Remove all |
| History | Undo · Redo · group "History" |
| Live | Undone: {step} · Redone: {step} (steps: move, rotate, duplicate, blank page, remove, sort, reverse, add files, add pages) |
| Primary / progress | Save PDF · Saving |
| Empty status | Add files to start |

**Combine & reorder**: Merge's copy, except the primary / progress: **Combine PDF · Combining** (lead override, 2026-11-26: the button names the tool the visitor is on), plus Undo│Redo as for Organize.

**Alternate & mix**

| Key | Text |
|---|---|
| Card | Normal · Reverse · per turn · Repeat |
| Card (sr) | Order of {file} · Pages per turn from {file} · Repeat {file} · Move {file} earlier · Move {file} later |
| Stepper error | Use a whole number from 1 |
| Result view (sr) | Result order · {label}, page {n} of {file} |
| Primary / progress | Mix PDFs · Mixing |
| Status | {pages} pages · {files} files · Add one more file to mix |
| One-file callout | All fronts, then all backs in one file? · Open in Organize (inline link) |
| Empty status | Add files to start |

**Result (ZIP)**

| Key | Text |
|---|---|
| Meta | {size} · {n} files |
| Show all | Show all {n} |
| Per-entry download (sr) | Download {name} |

### P-14. Screenshot index

All shots are in `/mnt/project-files/designs/f4-f5-page-tools/mockups/`. The primary is in view in every shot that has one, and horizontal overflow is 0 in all of them.

| Viewport | States |
|---|---|
| **1366x657** (27) | `split-1-empty` · `split-2-ready-every` · `split-3-everyn` · `split-4-custom-marks` · `split-5-custom-typed` · `split-6-invalid` · `split-7-more` · `split-8-processing` · `split-9-result` · `extract-1-empty` · `extract-2-ready` · `extract-3-invalid` · `delete-1-empty` · `delete-2-ready` · `delete-3-all` · `organize-1-empty` · `organize-2-ready` · `organize-3-select-menu` · `organize-4-sort-menu` · `organize-5-selection` · `organize-6-remove-menu` · `combine-1-ready` · `alternate-1-empty` · `alternate-2-files` · `alternate-3-separator` · `alternate-4-preview` · `alternate-5-one-file` |
| **390x664** (27) | the same 27 states |
| 1280x720, 390x844 (DSF 2) | `split-1-empty` · `split-4-custom-marks` · `split-9-result` · `extract-2-ready` · `delete-2-ready` · `organize-1-empty` · `organize-2-ready` · `organize-5-selection` · `combine-1-ready` · `alternate-2-files` · `alternate-4-preview` |
| 320x640 (DSF 2) | the same 11, plus `organize-3/4/6` |

Build shots of the shipped code are in `/mnt/project-files/designs/f4-f5-page-tools/build/`: every state at 1280x720, 390x844 and 320x640, plus `split-1-empty-1366x657.png`, the side panel at the hard case (More options right under the steps, fully above the pinned status; e2e `split.spec.ts` "Fit the first screen" checks the same boxes).

The 1280x632, 1536x730, 1920x969, 1024x768, 1023x700, 768x1024, 640x900 and 360x640 checks in P-3 were measured on the same overlays. They are kept out of the folder to keep it small.

These are mockups: overlays on the live Rotate and Merge pages, using real classes and tokens. Pixel details such as the exact glyph drawings and part-tone insets are for the engineer to match. The measured boxes and the rules above are binding.
