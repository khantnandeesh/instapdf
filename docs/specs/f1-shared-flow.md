# F1: Shared flow (pick files → set options → run → result)

Status: steps 1 (Analyze) and 2 (Research) done. Next: UX.
Reference observed: rotate-pdf-pages, merge-pdf and pdf-editor on the live reference site, 2026-11-23. We uploaded synthetic fixtures only and did **not** run any task, so the processing and result screens are taken from the discovery crawl and are marked *unverified* below.
Internal screenshots: `docs/specs/assets/f1-shared-flow/` (reference only, never ship).

## 0. Vehicle tool: Rotate

The shared flow has no page of its own, so every AC below runs on **`/rotate-pdf`** (our route; the reference slug is `rotate-pdf-pages`). Why Rotate:

- It runs fully in the browser (pdf-lib), so it exercises the browser-first path in CLAUDE.md rule 4 without needing the worker.
- Its options are small (scope plus direction), so the ACs test the flow and not tool logic.
- Its output is easy to check by machine: the `/Rotate` value of each page, page count, page order and extracted text.
- On the reference site it shows every shared piece: the upload button with its source dropdown, the drop target, password prompts, the page-thumbnail grid, the primary action bar, and the free-tier banners.

Consequence for the plan: F1 ships a complete (small) Rotate tool. F4 then reuses it rather than rebuilding it. Merge (F3) is the first tool to use the multi-file **files view** in depth (sorting and drag-reordering files); F1 builds that component and tests the basic version of it on Rotate with several files.

## 1. Purpose

Every page-level tool follows the same path. The visitor brings one or more PDFs, sees them as thumbnails, can unlock them if they are protected, chooses options, presses one primary button, watches progress, and gets a result they can download or hand straight to another tool. F1 builds this path once, as reusable components driven by the tool registry (accepted types, file and page caps, single or multi-file, the permission each tool needs, the action label, and the output naming). Each later tool then only supplies its own options panel and a `process()` function. For browser tools the file never leaves the device. Server tools (F6 onward) plug into the same path and add an upload and a session.

## 2. Inputs

| Aspect | Reference behavior (observed) | InstaPDF F1 decision |
|---|---|---|
| Local picker | Large primary button opens the OS file dialog. `accept=".pdf"` on Rotate. On Merge it also accepts `.png,.gif,.jpg,.jpeg,.tif,.tiff,.bmp,.webp`. `multiple` is set even on Rotate. | Same. The accepted types come from the tool registry. Rotate accepts `.pdf` / `application/pdf` only. |
| Drag and drop | The whole page is a drop target (`data-allows-drop`). | Same. A drop anywhere on the tool page adds files and shows a visible drop overlay while dragging. Drop also works in the ready state (adds files on multi-file tools, replaces the file on single-file tools after a confirm). |
| Multi-file | Rotate: free users get a banner saying only one file per task is allowed, and only the first file is kept (screenshot 10). Paid users can use several files. Merge: several files by design. | Rotate allows **up to 20 files** per task. Browser tools have no free-tier gate. Each file is rotated separately (see Output). |
| Cloud sources | Dropdown on the upload button: Dropbox, Google Drive, OneDrive. | **Deferred (P2).** The dropdown slot exists in the component, but these entries are hidden until a later feature. |
| URL import | Dropdown entry opens a modal with one text field, Cancel and Continue. A bad address gets an inline red validation message and the modal stays open (screenshot 04). | **Deferred (P2)** for the same reason. A URL fetch needs the server worker (CORS), so it belongs with F6. |
| Blank document | Some tools offer "start with a blank document". | Out of scope (only for the editor and forms tools). |
| Encrypted, user password | A modal titled with the file name. It has a masked text field with a show/hide eye toggle, a checkbox to reuse this password for all files, and Continue. There is no Cancel and no close button. A wrong password reopens the modal with the field cleared. An "incorrect password" label exists in the DOM, but we never saw it shown (screenshots 11, 12, 12b). The password is sent to the server. | Same modal content, with these fixes: an inline error is always visible after a wrong password; the typed value stays selected so it can be retyped; there is a **Skip file** action that removes the file; and Escape does the same as Skip. All checks happen locally, and the password is never sent anywhere. |
| Encrypted, owner password only (restricted permissions, empty user password) | **Rotate: no prompt.** The file loads and works normally (screenshot 14). **Editor:** an inline banner says the file has limited permissions, with a link that opens an owner-password modal. That modal lists the denied permissions (copying, editing, organizing pages, form filling, printing, signing), has a field with an eye toggle, shows an error on a wrong password, and has a close button (screenshots 29, 30, 31). | Each tool in the registry declares `requiredPermissions`. **Rotate declares none**, which matches the reference: restricted files load and process without a prompt. F1 still builds the owner-password banner and modal, and they appear only when a tool needs a permission that the file denies. Its first real consumer is F16 (Editor) or F17 (Sign); its ACs are listed under "Deferred ACs" below. |

Technical note for builders: pdf-lib cannot decrypt. Opening a password-protected or owner-restricted file in the browser needs a decryption step under a permissive license (for example a WASM build of qpdf, which is Apache-2.0). pdf.js can render encrypted files for thumbnails, but it cannot write them. Check the license before adding anything (CLAUDE.md rule 3).

## 3. Options (controls)

### 3a. Shared controls (every tool)

| Control | Type | Default | Allowed values | Effect |
|---|---|---|---|---|
| Choose files | primary button plus hidden `<input type=file>` | – | types from the registry; `multiple` if the tool allows it | Adds files |
| Source dropdown | split-button caret | closed | Dropbox, Google Drive, OneDrive, URL | **P2 / hidden in F1** |
| Drop zone | whole page | – | files | Adds files |
| Thumbnail size | range slider with −/+ icons | middle (the reference uses 165 px) | about 80–400 px | Only changes the size of the thumbnail grid |
| View toggle | 2-state segmented control (pages / files) | pages for 1 file; files for tools that are multi-file by design | pages, files | Switches between a grid of every page and one card per file. Only shown when more than one file is loaded. |
| File card | card: first-page thumbnail, file name (full name in tooltip), page count | – | – | Shows what is loaded |
| Remove file | icon button on the card or page group | – | – | Removes that file from the task |
| Add more files | secondary button | – | – | Opens the picker again (multi-file tools) |
| Page tile | page thumbnail plus page number label; hover/focus toolbar (enlarge preview, plus the tool's per-page actions) | – | – | Preview. Per-page actions are tool-specific. |
| Password modal | masked input plus show/hide toggle, a "use for remaining files" checkbox (unchecked), Continue, Skip | – | any string | Unlocks the file locally, or skips it |
| Primary action | large button in a sticky bottom bar | disabled until at least one usable file is loaded | – | Runs the tool. The label comes from the registry (Rotate: our own wording, e.g. "Rotate PDF"). |
| More options | link next to the primary action | collapsed | – | Opens extra options when the tool has any. Rotate has none, so it is hidden. |
| Download | primary button on the result screen | – | – | Saves the output |
| Continue in another tool | list or menu on the result screen | – | browser tools in the registry that accept the output type | Opens that tool with the output already loaded |
| Start over | secondary button on the result screen | – | – | Clears everything and returns to the empty state |
| Back to options | link on the result screen | – | – | Returns to the ready state with the same files and options (improvement; P2) |

### 3b. Rotate controls (the vehicle; the full option review happens in F4)

Observed on the reference (screenshots 05–09):

| Control | Type | Default | Allowed values | Effect on output |
|---|---|---|---|---|
| Scope | 3-way segmented control | All pages | All pages · Odd pages only · Even pages only | Picks which pages the toolbar rotate buttons act on. Odd/even use 1-based page numbers within each file. The selected pages are highlighted. |
| Rotate left / right (toolbar) | 2 icon buttons | – | −90° / +90° per click, cumulative | Adds to the rotation of every page in the scope |
| Per-page rotate left / right | 2 icon buttons in the page tile's hover toolbar | – | −90° / +90° per click, cumulative | Changes only that page |
| Reset | button | – | – | Puts every page back to its original rotation |

The thumbnails show the pending rotation right away. Rotation is stored modulo 360 and added to the page's existing `/Rotate`.

## 4. States

| State | What the user sees | Notes |
|---|---|---|
| **Empty** | Tool title and one-line description (our own text), the Choose-files button, a note on accepted type and limits, and a privacy note that files stay on the device for browser tools. | Reference: screenshot 01 |
| **Loading** (the "uploading" state, for browser tools) | A loading indicator for each file while it is read and parsed and its thumbnails render. The primary action stays disabled. | Nothing goes over the network. The reference uploads right away (calls to `upload-check` and then `upload`); we deliberately do not. |
| **Password needed** | The password modal for each encrypted file, one at a time, in the order they were added | |
| **Ready** | The thumbnail grid (pages view, or files view when there are several files), tool options, and the primary action enabled | Reference: screenshot 05 |
| **Processing** | The primary action is disabled and a progress indicator (`role=progressbar`, determinate where possible) is shown. Options cannot be changed. | Browser tools run in a Web Worker so the UI stays responsive. |
| **Done** | The result screen: output name and size, Download, Continue in another tool, and Start over | *Unverified on the reference* (we ran no task). Discovery says the reference result screen has Download, save to cloud, and continue in another tool. |
| **Error** | A dismissible error message for each problem file, or a processing-error panel with Retry (keeps the files and options) and Start over | See §5 |
| **Limit reached** | A message for files over the cap or page counts over the cap. Rejected files are named. Valid files stay loaded. | Browser tools have no hourly or task cap. Hourly caps, upgrade prompts and countdowns belong to the server tools and F19. |
| **Session expired** | **Server tools only.** After 2 hours the uploaded files are deleted and a modal asks the user to upload again. | Not reachable on browser tools such as Rotate. Built and tested with F6 (Compress). |

## 5. Errors and limits

Copy the behavior only, never the wording.

| Case | Reference behavior | InstaPDF behavior |
|---|---|---|
| Wrong file type (e.g. `.txt` forced through the picker or dropped) | Red banner at the top saying PDF files are required. Stays in the empty state (screenshot 16). | Same. The message names the file and the accepted types. Other valid files in the same batch are still added. |
| Corrupt or unreadable "PDF" | Red banner naming the file, and the page is left in a broken, empty pages view with the action button still active (screenshot 15). | Error naming the file. The file is not added, and the state goes back to whatever it was before (empty if nothing else was loaded). The primary action is never enabled with zero usable files. |
| Zero-byte file | Not tested | Treated as corrupt |
| Wrong user password | The modal reopens with the field cleared | Inline error, the modal stays open, unlimited retries, Skip is available |
| More files than the tool allows | Free tier on Rotate: an upgrade banner and only the first file kept (screenshot 10) | Files beyond the registry cap (Rotate: 20) are rejected with a message giving the cap. The first 20 are kept. |
| File too large | Free tier: 50 MB per file, with an upgrade banner | Browser tools: **100 MB per file** cap from the registry. A larger file is rejected with a message giving the cap, and other files stay loaded. |
| Too many pages | Free tier on Rotate: 200 pages (the page says so), 50 on most tools | Browser tools: **1,000 pages in total per task** from the registry. Above the cap, the file that would cross it is rejected with a message. |
| Hourly task / file caps | 3 tasks and 30 files per hour for free users | None for browser tools (an improvement). Server tools: F6 and F19. |
| Processing failure (exception inside the worker) | Generic error asking the user to retry or contact support | Error panel with Retry and Start over. Files and options are kept. The error is logged to the console with no file content. |
| Leaving the page with files loaded | Not observed | Browser `beforeunload` confirmation while the state is ready or processing (P2) |

## 6. Output (Rotate)

- **One input file:** a single PDF that **keeps the original file name** (`<basename>.pdf`), downloaded directly. *Assumption:* the reference result was not seen because no task was run. The evaluator should confirm the reference's name on its first real Rotate task, and we follow it if it differs.
- **Two or more input files:** one rotated PDF per input, packed in a ZIP named `instapdf-rotate.zip`. The entries keep the original file names. Duplicate names get ` (2)`, ` (3)` and so on.
- **What changes in the PDF:** only the `/Rotate` entry of each affected page, set to `(original + delta) mod 360`. Page count, page order, content streams, extractable text, page boxes, document metadata and bookmarks are unchanged. Pages are not rasterized.
- **Encrypted inputs:** the output is saved **without encryption** (it opens without a password). The result screen says so and offers "Protect" in the continue-in-another-tool list once F11 exists. *Assumption, to be confirmed against the reference by the evaluator.*
- Output size stays within the input size plus 10% (no re-encoding bloat).

## 7. Acceptance criteria

Fixtures (QA creates them in `tests/fixtures/`): `three-pages.pdf` (3 portrait pages with the text "Page 1".."Page 3"), `sixty-pages.pdf`, `pre-rotated.pdf` (3 pages, page 2 already has `/Rotate 90`), `user-pw.pdf` (user password `test`, AES-256), `user-pw-2.pdf` (also `test`), `owner-restricted.pdf` (empty user password, owner password `owner123`, modify, assemble and print denied), `corrupt.pdf` (text bytes with a .pdf extension), `empty.pdf` (0 bytes), `notes.txt`, `too-many-pages.pdf` (1,001 pages), and a file over 100 MB generated by the test at runtime.

All ACs run on `/rotate-pdf`.

### Picking files

- **AC-1 (P0)** The empty state shows one Choose-files control whose file input accepts `.pdf` and allows multiple selection. No thumbnails are shown and the primary action is absent or disabled.
- **AC-2 (P0)** Choosing `three-pages.pdf` with the picker reaches the ready state and shows 3 page thumbnails labeled 1, 2, 3.
- **AC-3 (P0)** Dropping `three-pages.pdf` (a `drop` event with a DataTransfer) anywhere on the tool page in the empty state reaches the same ready state as AC-2.
- **AC-4 (P1)** While a file is dragged over the page, a visible drop overlay or highlight appears. It disappears on dragleave or drop.
- **AC-5 (P0)** From picking the file to downloading the result, the browser sends no network request whose body contains file bytes (no request body larger than 10 KB to any origin, and nothing to an upload endpoint).
- **AC-6 (P1)** While a file is being parsed, a per-file loading indicator is visible and the primary action is disabled. With `sixty-pages.pdf`, the indicator can be seen before the first thumbnail renders.
- **AC-7 (P1)** Choosing `three-pages.pdf` and `sixty-pages.pdf` together loads both. A files/pages view toggle appears, and the files view shows 2 cards, each with a first-page thumbnail, the file name and the page count (3 and 60).
- **AC-8 (P1)** In the ready state, "add more files" (picker or drop) appends a second file without removing the first.
- **AC-9 (P1)** Removing one of two loaded files leaves only the other. Running then produces a single PDF (not a ZIP) from the remaining file.
- **AC-10 (P2)** The thumbnail-size slider changes the rendered thumbnail width, and the change is measurable on the tile element.
- **AC-11 (P2)** The upload control has a sources dropdown slot. In F1 it shows no cloud or URL entries, or shows them disabled and labeled as coming soon.

### Validation and limits

- **AC-12 (P0)** Choosing `notes.txt` (forced through `setInputFiles`) shows an error naming the file. The page stays in the empty state and no thumbnail appears.
- **AC-13 (P0)** Choosing `corrupt.pdf` shows an error naming the file and returns to the empty state. The primary action is not enabled.
- **AC-14 (P1)** Choosing `empty.pdf` behaves like AC-13.
- **AC-15 (P1)** Choosing `notes.txt` and `three-pages.pdf` together shows the error for `notes.txt` and still loads `three-pages.pdf` (ready, 3 thumbnails).
- **AC-16 (P1)** Choosing a file larger than 100 MB is rejected with a message giving the 100 MB cap, before any parsing (within 2 s, and the tab does not freeze).
- **AC-17 (P1)** Choosing `too-many-pages.pdf` (1,001 pages) is rejected with a message giving the 1,000-page cap.
- **AC-18 (P1)** Choosing 21 copies of `three-pages.pdf` loads 20 and shows a message giving the 20-file cap.
- **AC-19 (P1)** Loading `sixty-pages.pdf`, which is above the reference's free page cap, works without any limit or upgrade message. The same goes for running 4 tasks in a row within one hour.

### Encrypted PDFs

- **AC-20 (P0)** Choosing `user-pw.pdf` opens a modal dialog (`role=dialog`) that shows the file name and has a masked password input with keyboard focus.
- **AC-21 (P0)** Entering a wrong password and confirming keeps the modal open and shows a visible incorrect-password message. No thumbnails appear.
- **AC-22 (P0)** Entering `test` and confirming closes the modal and shows 3 thumbnails (the ready state).
- **AC-23 (P0)** Rotating `user-pw.pdf` (after unlocking) all pages +90° produces a PDF that opens **without a password** and has 3 pages, each with `/Rotate 90`.
- **AC-24 (P1)** The show/hide toggle switches the password field between masked and plain text.
- **AC-25 (P1)** Choosing Skip, or pressing Escape, in the password modal removes that file. With no other files the page goes back to the empty state.
- **AC-26 (P1)** Choosing `user-pw.pdf` and `user-pw-2.pdf` together, ticking "use for remaining files" and entering `test` once unlocks both. Only one prompt is shown.
- **AC-27 (P1)** Without that box ticked, the same pair shows two prompts in turn, each with its own file name.
- **AC-28 (P0)** `owner-restricted.pdf` loads on Rotate **without** any password prompt (matching the reference), and rotating all pages +90° produces a 3-page PDF with `/Rotate 90` on every page that opens without a password.
- **AC-29 (P2)** The result screen for an encrypted input states that the output is not password-protected.

### Primary action, progress, output (Rotate)

- **AC-30 (P0)** With `three-pages.pdf`, scope All pages, one click on rotate right, then the primary action: the output has 3 pages, in order "Page 1", "Page 2", "Page 3" (extracted text), each with `/Rotate 90`.
- **AC-31 (P0)** Rotate left once on all pages gives `/Rotate 270` on every page.
- **AC-32 (P0)** The per-page rotate right on page 2 only gives `/Rotate` values of [0, 90, 0].
- **AC-33 (P1)** Scope Odd pages only plus rotate right gives [90, 0, 90]. Scope Even pages only plus rotate right gives [0, 90, 0].
- **AC-34 (P1)** Rotate right twice gives 180 on every page (cumulative). Four times gives 0.
- **AC-35 (P1)** Reset after any rotations gives an output whose `/Rotate` values equal the input's.
- **AC-36 (P1)** With `pre-rotated.pdf`, rotating all pages right gives [90, 180, 90] (the existing rotation is kept and added to).
- **AC-37 (P1)** After a rotation click and before running, the thumbnail of each affected page is shown visibly rotated (its CSS transform or rendered aspect ratio changes).
- **AC-38 (P0)** The primary action is disabled while the state is empty, loading, or waiting for a password, and it is enabled in the ready state.
- **AC-39 (P1)** While processing, a `role=progressbar` element is shown and the primary action and options are disabled. Checked with `sixty-pages.pdf` and a 4× CPU throttle so the state can be observed.
- **AC-40 (P2)** The output file size is at most the input size × 1.1 + 10 KB.

### Result screen

- **AC-41 (P0)** After processing, a result screen appears with a Download control. Clicking it downloads a file named `three-pages.pdf` that is a valid PDF.
- **AC-42 (P1)** With two inputs (`three-pages.pdf`, `sixty-pages.pdf`) the download is `instapdf-rotate.zip`. It contains exactly two PDFs with the original names and 3 and 60 pages, each rotated as chosen.
- **AC-43 (P1)** The result screen offers "continue in another tool". Choosing Rotate there opens the tool already in the ready state with the previous output loaded (3 thumbnails already shown rotated, no file picker step). Rotating right again and running gives `/Rotate 180` on every page.
- **AC-44 (P0)** Start over returns to the empty state. No thumbnails remain, and picking a new file works normally.
- **AC-45 (P2)** "Back to options" returns to the ready state with the same file and pending rotations.

### Errors and robustness

- **AC-46 (P1)** If processing throws (QA injects the failure through a test-only fault hook that is not in the production build; the evaluator skips this AC), an error panel with Retry and Start over appears. Retry keeps the file and options and can then succeed.
- **AC-47 (P1)** All error messages are dismissible, and none of them leaves the primary action enabled without a usable file.

### Accessibility and responsive

- **AC-48 (P1)** The whole flow (pick a file through a keyboard-activated control, rotate, run, download, start over) can be done with the keyboard alone. Modals trap focus and return it to the trigger when they close.
- **AC-49 (P1)** At a 375 px wide viewport, the empty, ready (3 thumbnails) and result states have no horizontal scroll, and the primary action is visible without scrolling in the ready state.
- **AC-50 (P1)** axe reports no critical or serious violations in the empty, password-modal, ready and result states.
- **AC-51 (P2)** With files loaded (ready state), trying to close or reload the tab triggers the browser's leave-page confirmation.

**Totals: 51 ACs: 17 P0, 28 P1, 6 P2.**

### Deferred ACs (specified here, tested in the feature named)

- **D-1 (F16/F17)** When a tool needs a permission that the file denies, an inline notice appears with an "enter owner password" action. The modal lists the denied permissions.
- **D-2 (F16/F17)** A wrong owner password shows an inline error. The correct one (`owner123`) removes the notice and enables the action.
- **D-3 (F6)** Server tools: an upload progress percentage for each file. After 2 hours the session-expired modal offers to upload again and drops the stale files.
- **D-4 (F6/F19)** Server-tool free limits (size, pages, tasks per hour with a countdown) and their messages.
- **D-5 (later, P2)** Cloud pickers (Dropbox, Google Drive, OneDrive) and URL import with inline validation of a bad address.

## 8. Screenshot index (internal)

01 empty · 02 source dropdown · 03/04 URL modal and invalid address · 05 ready (pages view) · 06 per-page hover toolbar · 07 all rotated · 08 odd scope plus cumulative rotation · 09 reset · 10 second file refused by the free tier · 11–13 user-password modal (prompt, wrong, accepted) · 14 owner-restricted file on Rotate (no prompt) · 15 corrupt file · 16 wrong type · 20–23 Merge empty, files view, pages view · 25–27 Merge file hover, add-files menu, reorder menu · 28–31 Editor limited-permission banner and owner-password modal.

## Improvements

Researched 2026-11-23. **Source caveat:** ilovepdf.com, smallpdf.com and tools.pdf24.org could not be reached from the research session (the network allowlist blocked them), so we could not inspect those sites live. Items marked † come from the competitors' own help pages found through web search. Items marked ‡ come from the researcher's prior knowledge of the product and were not re-checked live. Nothing was run on any competitor, and no competitor text, assets or code is reused (Stirling-PDF is "open-core" with mixed licensing, so we take ideas only).

| # | Idea | Seen at | User benefit | Cost | Adopt/skip | Reason |
|---|---|---|---|---|---|---|
| I-1 | Lazy (viewport-based) thumbnail rendering: the ready state and primary action don't wait for every thumbnail | Adobe Acrobat online, iLovePDF, Smallpdf ‡ (progressive grids) | Big files (up to our 1,000-page cap) become usable in seconds instead of freezing the tab; less memory on phones; helps the Lighthouse ≥ 90 mobile gate | M | **Adopt** → AC-52, AC-53 | Browser-only. Without it the 1,000-page cap from §5 is not realistic on mobile. |
| I-2 | Preview of the output's first page on the result screen | Smallpdf ‡, Adobe Acrobat online ‡ | Confirms the rotation is right before downloading, which helps most on mobile, where opening the PDF is awkward | S | **Adopt** → AC-54 | Reuses the pdf.js thumbnail renderer and runs locally. |
| I-3 | Paste a PDF from the clipboard (Ctrl/Cmd+V) to add it | PDF24 ‡ | Copy the file in Explorer/Finder and paste it, with no dialog | S | **Adopt** → AC-55 | One `paste` listener feeding the same intake path as drop. No new dependency. |
| I-4 | Native Share of the result (send it to WhatsApp, mail or Files) on mobile | PDFgear mobile app ‡, Smallpdf mobile app ‡ (in-app share) | One tap to send the result on a phone. Our web equivalent uses the Web Share API with files, with no server link | S | **Adopt** → AC-56 | Browser-only, and the button only appears where `navigator.canShare({files})` is true. |
| I-5 | Say "processed on your device, nothing uploaded" on the result screen too, not just the empty state | Positioning of browser-local rivals; competitors that upload delete files later and say so on the result screen (iLovePDF, Smallpdf ‡) | Trust: it confirms the privacy promise at the moment it matters | S | **Adopt** → AC-57 | Copy only. This is our main advantage over the upload-based competitors. |
| I-6 | Portrait/Landscape page filter in the rotate scope | iLovePDF † (sidebar: All / Portrait / Landscape) | Fix only the sideways pages in a mixed scan | S | Skip (for F1) | This is a Rotate option, not part of the shared flow. Handed to F4's option review as a recommended adopt. |
| I-7 | Select pages (click, Shift-click) and then rotate only the selection | Adobe Acrobat online ‡, Stirling-PDF ‡ | Faster than rotating one page at a time on large files | M | Skip (for F1) | The selection model is shared with Delete/Extract/Organize. Build it with the first of those so it is designed once. |
| I-8 | Undo/redo of pending page edits (Ctrl+Z) | Adobe Acrobat online ‡, Stirling-PDF ‡ | Recover from a mistaken click | M | Skip | Reset (AC-35) and per-page rotate cover the Rotate case. Revisit with Organize. |
| I-9 | Share link, QR code or email the result | iLovePDF ‡, Smallpdf ‡ | Hand the file to another device | M | Skip | Needs uploading and storing the output, which goes against browser-first (rule 4) and adds storage cost. I-4 covers the mobile need locally. |
| I-10 | Save the result to Google Drive / Dropbox | iLovePDF ‡, Smallpdf ‡, PDF24 ‡ | Cloud users skip the download | M | Skip | Already deferred as D-5 (needs OAuth app review). Not for F1. |
| I-11 | Download starts automatically when processing finishes | iLovePDF ‡ | Saves one click | S | Skip | Browsers block or prompt for repeated automatic downloads, it is surprising on mobile, and it conflicts with previewing (I-2) and Continue-in-another-tool. |
| I-12 | Offline use (PWA / service worker) for browser tools | PDFgear and PDF24 desktop apps ‡ (offline) | Works on bad connections and proves nothing is uploaded | M | Skip (for F1) | Worth doing as a later `chore:` across all browser tools. Caching rules risk stale deploys, which is out of scope for the first feature. |
| I-13 | Auto-detect sideways pages (OCR orientation) | Adobe Acrobat ‡, PDF24 ‡ | One-click fix for scans | L | Skip | Needs OCR on the worker (server cost and an upload). Candidate for the OCR feature. |
| I-14 | Sort files A–Z / Z–A in the files view | iLovePDF ‡ (Merge) | Order many files quickly | S | Skip (for F1) | Matters for Merge. Hand to F3. |

### Improvement ACs

These run on `/rotate-pdf` like the others. The evaluator does not compare them with the reference, but they must pass.

- **AC-52 (P1) (improvement)** With `sixty-pages.pdf` loaded in a 1280×800 viewport, the primary action is enabled before every thumbnail has rendered: at the moment it becomes enabled, at most 30 page tiles hold a rendered image (canvas or `img` with a source). The other tiles show a placeholder of the right size, so scrolling does not jump.
- **AC-53 (P1) (improvement)** After scrolling to the end of the grid from AC-52, the thumbnail for page 60 renders within 2 s. Pending rotations applied before scrolling (rotate right on all pages) show on tiles that render later. Running still gives `/Rotate 90` on all 60 pages.
- **AC-54 (P2) (improvement)** For a single output, the result screen shows a preview of the output's first page, rendered locally from the output bytes. After AC-30 (all pages +90° on portrait `three-pages.pdf`), the preview is landscape (rendered width > height). For a ZIP output, the result screen lists the entry names instead.
- **AC-55 (P2) (improvement)** In the empty state, a `paste` event on the document whose clipboard holds `three-pages.pdf` reaches the same ready state as AC-2. Pasting plain text does nothing and shows no error. A paste whose target is a text input (for example the password field) is never treated as a file.
- **AC-56 (P2) (improvement)** When `navigator.canShare({ files })` returns true, the result screen shows a Share control. Activating it calls `navigator.share` with exactly one `File` (the output, with the same name as the Download, of type `application/pdf` or `application/zip`). When the API is missing or returns false, no Share control is rendered. QA stubs the API with an init script.
- **AC-57 (P2) (improvement)** The result screen of a browser tool shows a short note that the file was processed on this device and not uploaded. The note is absent for server tools (checked in F6).

**Improvement totals: 6 ACs: 2 P1, 4 P2.** Grand total with §7: 57 ACs (17 P0, 30 P1, 10 P2).
