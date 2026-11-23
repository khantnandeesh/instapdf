# F1: Shared flow (pick files → set options → run → result)

Status: steps 1 (Analyze), 2 (Research) and 3 (Design) done. Next: Build.
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
| Total size too large | Not observed (free tier caps each file at 50 MB) | Browser tools: **500 MB in total per task** (`maxTotalBytes` in the registry), which bounds memory. A file that would push the task past it is rejected with a message giving the cap; a smaller later file in the same batch can still be added. |
| Too many pages | Free tier on Rotate: 200 pages (the page says so), 50 on most tools | Browser tools: **1,000 pages in total per task** from the registry. Above the cap, the file that would cross it is rejected with a message. |
| Hourly task / file caps | 3 tasks and 30 files per hour for free users | None for browser tools (an improvement). Server tools: F6 and F19. |
| Processing failure (exception inside the worker) | Generic error asking the user to retry or contact support | Error panel with Retry and Start over. Files and options are kept. The error is logged to the console with no file content. |
| Leaving the page with files loaded | Not observed | Browser `beforeunload` confirmation while the state is ready or processing (P2) |

## 6. Output (Rotate)

- **One input file:** a single PDF that **keeps the original file name** (`<basename>.pdf`), downloaded directly. *Assumption:* the reference result was not seen because no task was run. The evaluator should confirm the reference's name on its first real Rotate task, and we follow it if it differs.
- **Two or more input files:** one rotated PDF per input, packed in a ZIP named `berrypdf-rotate.zip`. The entries keep the original file names. Duplicate names get ` (2)`, ` (3)` and so on.
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
- **AC-42 (P1)** With two inputs (`three-pages.pdf`, `sixty-pages.pdf`) the download is `berrypdf-rotate.zip`. It contains exactly two PDFs with the original names and 3 and 60 pages, each rotated as chosen.
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

## UI

Designed 2026-11-23 by ux-designer. This section is the build contract for the shared flow. Every later tool reuses these components and only adds its own options panel, per-page actions and `process()`. The look is InstaPDF's own, built on the owner's Mint Paper system (white page, sand wash, one mint action, grey page trays, one control dock; re-themed 2026-11-23, see `docs/design/mint-paper.md`). Do not use the reference screenshots as a visual guide; they are for behavior only.

> **Design system:** all visual values (tokens, category hues, Atkinson Hyperlegible type, shape, motion, measured contrast and the deviations list) live in [`docs/design/mint-paper.md`](../design/mint-paper.md) (the owner's Mint Paper system, light only; dark mode is pending the designer's definition); where this section names an older visual, that document wins.

### U-1. Design principles for this flow

1. **One screen, three zones.** Title, a workspace (drop card, then thumbnails, then the result), and a **control dock** that holds the tool options and the primary action. The dock is on screen from the first paint to the end of processing, so the primary action never moves and never appears out of nowhere.
2. **Two actions to the result.** Choose files → primary action. Options are optional (Rotate defaults to nothing pending, so the primary action still works; see U-6 for the "nothing to do" case). Download is one more click; focus lands on it.
3. **No layout shift.** Every box that will hold async content (thumbnails, file cards, notices, progress) has its final size before the content arrives. Notices float; they never push content. Target: CLS 0.00 on the tool route, excluding user-initiated changes.
4. **Quiet until needed.** Secondary controls (thumbnail size, view toggle, per-page actions) appear only when they do something.

### U-2. Design tokens

The tokens existed only as two colors, so this feature defines the full set. Implemented in `apps/web/src/styles/tokens.css` (imported by `apps/web/src/app/globals.css`) as `--ip-*` CSS custom properties and exposed to Tailwind v4 through `@theme inline`. Use the Tailwind utilities (`bg-surface-raised`, `text-fg-muted`, `bg-primary text-on-primary`, `outline-focus`, `shadow-paper`, `rounded-lg` ...) and never raw hex values in components.

Values, the token mapping, type, the measured contrast table and the deviations: see [`docs/design/mint-paper.md`](../design/mint-paper.md) (single source of truth).

**Spacing.** Tailwind's 4 px scale. Flow rhythm: 4 / 8 / 12 / 16 / 24 / 32 / 48. Page gutters: 16 (≤ 639), 24 (640–1023), 32 (≥ 1024). Grid gap 16 (12 below 640).

**Radius, elevation, motion.** See [`docs/design/mint-paper.md`](../design/mint-paper.md).

**Layout metrics.** `--ip-header-h` 57 px, `--ip-dock-w` 360 px, `--ip-dock-h` 176 px (< 640), `--ip-dock-h-md` 104 px (640–1023), `--ip-thumb-size` 160 px default, `--ip-tap-min` 44 px (every touch target is at least 44×44 px, including icon buttons).

**Z-index.** content 0 · sticky toolbar 10 · dock 20 · notice stack 30 · drop overlay 40 · dialog (native top layer, no z-index needed).

**Breakpoints.** Tailwind defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. The three design widths are 375 (base), 768 (`md`), 1280 (`xl`); the structural switch (dock becomes a side column) happens at `lg` 1024.

### U-3. Layout

The tool route renders `SiteHeader` (56 px: wordmark linking to `/`, "All tools" link; F2 owns the full header) and then `ToolFlow`.

#### 1280 px (≥ 1024 behaves the same)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ BerryPDF                                                     All tools   │ header 56
├──────────────────────────────────────────────────────────────────────────┤
│  Rotate PDF                                                              │ h1 2xl
│  Turn pages and save the rotation                                        │ fg-muted
│ ┌───────────────────────────────────────────────┐ ┌────────────────────┐ │
│ │ [Pages|Files]   ─○──── size     [+ Add files] │ │ OPTIONS            │ │ toolbar 52, sticky
│ │───────────────────────────────────────────────│ │ Apply to           │ │
│ │ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐            │ │ [All|Odd|Even]     │ │
│ │ │ ▯  │ │ ▯  │ │ ▯  │ │ ▯  │ │ ▯  │            │ │ [⟲ Left][⟳ Right]  │ │
│ │ └────┘ └────┘ └────┘ └────┘ └────┘            │ │ Reset              │ │
│ │   1      2      3      4      5               │ │                    │ │
│ │  ...  (grid scrolls with the page)            │ │ 3 pages · 1 file   │ │
│ │                                               │ │ [  Rotate PDF   ]  │ │ primary lg
│ └───────────────────────────────────────────────┘ └────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

- Container `max-w-[1280px]`, gutters 32. Two columns: workspace `minmax(0,1fr)`, dock `--ip-dock-w` (320), gap 24.
- The **dock** is `position: sticky; top: calc(var(--ip-header-h) + 24px)`, height `calc(100dvh - var(--ip-header-h) - 48px)`, max 640. Options at the top (scrolls inside if long), dock footer pinned to its bottom: a status line (`sm`, `fg-muted`, e.g. "3 pages · 1 file", or why the action is disabled) and the primary button (full width, 52 px).
- Workspace: `surface` canvas, `rounded-xl`, padding 24. Its toolbar is sticky at the top of the workspace (`top: var(--ip-header-h)`), `surface` background with a bottom `border`.
- Grid: `grid-template-columns: repeat(auto-fill, var(--ip-thumb-size)); gap: 16px; justify-content: start`. At 160 px the grid area (~864 px) fits 5 columns.
- Empty state: same two columns. The workspace holds the **drop card** (min height 420, centered content). The dock shows the Rotate options disabled and the primary disabled, so nothing moves when files arrive.
- Result state: the dock and workspace are replaced by one **result card**, centered, `max-w-[760px]`, two columns inside: preview (240 px box) left, details and actions right.

#### 768 px (640–1023)

```
┌────────────────────────────────────────────┐
│ BerryPDF                        All tools  │
├────────────────────────────────────────────┤
│ Rotate PDF                                 │
│ Turn pages and save the rotation           │
│ ┌────────────────────────────────────────┐ │
│ │ [Pages|Files]  ─○── size  [+ Add files]│ │
│ │ ┌───┐ ┌───┐ ┌───┐ ┌───┐                │ │ 4 columns at 160
│ │ └───┘ └───┘ └───┘ └───┘                │ │
│ └────────────────────────────────────────┘ │
├────────────────────────────────────────────┤ fixed dock, 76 + safe area
│ [All|Odd|Even] [⟲][⟳] Reset   [Rotate PDF] │
└────────────────────────────────────────────┘
```

- Gutters 24. Single column. The dock is `position: fixed; inset-inline: 0; bottom: 0`, `surface-raised`, top `border`, `shadow-md`, padding `12px 24px calc(12px + env(safe-area-inset-bottom))`. One row: compact options on the left, primary on the right (min width 200, 48 px). `DockStatus` is visually hidden at this width but stays in the DOM as the primary's `aria-describedby` (see U-11 item 6).
- `main` gets `padding-bottom: calc(var(--ip-dock-h-md) + env(safe-area-inset-bottom) + 16px)` so the last row of tiles is never hidden under the dock.
- Rotate's direction buttons are icon-only here (44×44, with `aria-label` and a visible tooltip on hover/focus).

#### 375 px (< 640)

```
┌───────────────────────────────┐
│ BerryPDF            All tools │
├───────────────────────────────┤
│ Rotate PDF                    │ h1 xl
│ Turn pages and save the rot…  │
│ [Pages|Files]    [+ Add files]│ toolbar (no size slider)
│ ┌───────────┐ ┌───────────┐   │
│ │     ▯     │ │     ▯     │   │ 2 columns, square tiles
│ └───────────┘ └───────────┘   │
│       1             2         │
├───────────────────────────────┤ fixed dock, 128 + safe area
│ [All|Odd|Even]   [⟲] [⟳] [↺]  │ row 1: 44
│ [        Rotate PDF         ] │ row 2: 48, full width
└───────────────────────────────┘
```

- Gutters 16, grid gap 12, `grid-template-columns: repeat(2, minmax(0, 1fr))`; tiles are square via `aspect-ratio: 1`. The size slider is hidden (it can't add value at 2 columns).
- Dock: two rows (options row 44, primary row 48 full width), padding 12/16 plus safe area, total `--ip-dock-h` 128. `main` padding-bottom accordingly. Reset becomes an icon button (↺, `aria-label="Reset rotation"`).
- At 375×667 the title, toolbar and first row of two tiles are above the fold together with the dock, and the primary is always visible (AC-49). Nothing is wider than the viewport: file names truncate with an ellipsis, the segmented control uses short labels ("All", "Odd", "Even").
- Empty state: drop card full width, min height 280. The "drop" and "paste" hints are shown only for `(pointer: fine)`; touch users see just the button and limits.
- Result: single column. Preview box 200 px centered, then details, then actions stacked full width.

### U-4. Component tree

Location: primitives in `apps/web/src/components/ui/` (design-system, owned by ux-designer, built by frontend-engineer in F1); flow components in `apps/web/src/components/tool-flow/`; Rotate's pieces in `apps/web/src/tools/rotate/`. No component library and no icon package: icons are small inline SVG components in `components/ui/icons.tsx` (our own drawings, 24×24, 1.75 stroke, `currentColor`, `aria-hidden`). This keeps the route well under the 150 KB first-load budget.

#### Primitives (`components/ui/`)

| Component | Props / slots | Notes |
|---|---|---|
| `Button` | `variant: "primary" \| "secondary" \| "ghost" \| "danger"`, `size: "sm" \| "md" \| "lg"` (36 / 44 / 52 px), `busy?: boolean`, `iconStart?`, `iconEnd?`, native button props | `busy` shows a spinner over the label and keeps the width (label stays in the DOM with `visibility:hidden`). Disabled uses the native `disabled` attribute: `surface-sunken` background, `fg-disabled` text. Secondary: `surface-raised` + `border-strong`. Ghost: transparent, `fg`, hover `surface-sunken`. |
| `IconButton` | `label: string` (required, becomes `aria-label`), `icon`, `size: "sm" \| "md"` (hit area always ≥ 44), `pressed?` (sets `aria-pressed`), `tooltip?: boolean = true` | Tooltip shows `label` on hover and focus after 300 ms; it is `aria-hidden` because the name is already set. |
| `SegmentedControl<T>` | `label: string`, `value: T`, `options: {value: T; label: string; shortLabel?: string}[]`, `onChange`, `disabled?` | `role="radiogroup"` with `aria-label`; each option is `role="radio"` + `aria-checked`, roving tabindex, arrow keys move and select. Selected: `primary-soft` fill, `on-primary-soft` text, weight 600 (non-color cue). Used for view toggle and Rotate scope. |
| `Slider` | `label`, `min`, `max`, `step`, `value`, `onChange`, `valueText?: (v) => string` | Native `<input type="range">` styled; `−`/`+` icon buttons either side step by `step`. `aria-valuetext` e.g. "Thumbnail size 160 pixels". |
| `Dialog` | `open`, `onClose(reason: "escape" \| "action")`, `title`, `description?`, `children`, `footer`, `initialFocusRef?`, `returnFocusRef?` | Native `<dialog>` with `showModal()`: top layer, inert background, Escape handled by `cancel` event. Focus moves to `initialFocusRef` on open and back to `returnFocusRef` (or the previously focused element; if that element is gone, to the `ToolFlow` heading) on close. `aria-labelledby` title, `aria-describedby` description. Width `min(440px, 100vw - 32px)`, `rounded-xl`, `shadow-lg`, backdrop `scrim`. No close-on-backdrop-click (prevents accidental skip). |
| `Notice` | `tone: "info" \| "success" \| "warning" \| "danger"`, `title?`, `children`, `onDismiss?`, `action?: {label, onClick}` | Icon + text + optional action + dismiss `IconButton` ("Dismiss"). `danger` and `warning` get `role="alert"`; `info`/`success` get `role="status"`. `soft` background, 4 px start border in the tone color, `fg` text (tone color only on the icon and border). |
| `ProgressBar` | `label: string`, `value?: number` (0–100; omit = indeterminate), `valueText?` | `role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow` (omitted when indeterminate), `aria-label`. Track `surface-sunken` pill 8 px; fill `primary` with `transform: scaleX()` (no width animation). Indeterminate: a 30% bar sliding, `--ease-in-out` 1.2 s loop, static 30% under reduced motion. |
| `Spinner` | `size: 16 \| 20 \| 24`, `label?` | SVG arc rotating 800 ms linear; when `label` is set it is `role="status"`. Under reduced motion it pulses opacity once per 1.2 s instead of spinning (0 ms durations would freeze it; this one exception is allowed because it carries state). |
| `VisuallyHidden` | children | Screen-reader-only text. |
| `LiveRegion` | `politeness: "polite" \| "assertive"`, `message` | One polite region per `ToolFlow` for state announcements (see U-7). |

#### Flow components (`components/tool-flow/`)

```
<ToolFlow tool={toolConfig} options={<RotateOptions/>} pageActions={RotatePageActions} process={rotate}>
├─ <ToolIntro/>                         h1 + summary
├─ <DropOverlay/>                        fixed, shown while dragging over the page
├─ <NoticeStack/>                        floating intake and limit notices
├─ <LiveRegion/>
├─ state ∈ {empty, loading, password, ready, processing, error}:
│   ├─ <Workspace>
│   │   ├─ empty:   <DropCard> <FilePicker/> <LimitsNote/> <PrivacyNote/> </DropCard>
│   │   └─ else:    <WorkspaceToolbar> <ViewToggle/> <ThumbSizeSlider/> <AddFilesButton/> </WorkspaceToolbar>
│   │               <OwnerPermissionNotice/>         (only if a required permission is denied)
│   │               <PageGrid> <PageGroup>* <PageTile/>* </PageGroup> </PageGrid>   (pages view)
│   │               <FileGrid> <FileCard/>* </FileGrid>                              (files view)
│   └─ <ControlDock>
│       ├─ <OptionsPanel> {options slot} </OptionsPanel>
│       ├─ <DockStatus/>                   status line / disabled reason
│       └─ <PrimaryAction/> | <ProcessingBar/> | <ProcessError/>
├─ state = done:  <ResultCard>
│                   <ResultPreview/> <ResultSummary/> <ResultActions> Download · Share </ResultActions>
│                   <ResultNotes/> (privacy, not-encrypted) <ContinueWith/> <ResultFooter> Start over · Back to options </ResultFooter>
│                 </ResultCard>
├─ <PasswordDialog/>                      user password, one file at a time
├─ <OwnerPasswordDialog/>                 deferred consumer (D-1, D-2)
├─ <ReplaceFileDialog/>                   single-file tools only
└─ useLeaveGuard(state ∈ {loading, password, ready, processing})
```

| Component | Props / slots | Behavior and look |
|---|---|---|
| `ToolFlow` | `tool: ToolFlowConfig` (see U-9), `options: ReactNode`, `pageActions?: ComponentType<PageActionProps>`, `pageTransform?: (pageRef) => {rotate: number}` (what the tile should display), `canRun?: () => true \| string` (string = reason shown in `DockStatus`), `process: (files, signal, onProgress) => Promise<ToolOutput>`, `initialFiles?: File[] \| ToolOutput` (continue-in-another-tool) | Owns the state machine, intake, password queue, notices, leave guard and paste listener. Renders the layout grid. `data-state` attribute on its root (`empty`, `loading`, `password`, `ready`, `processing`, `done`, `error`) for tests and CSS. Root is a drop target. |
| `ToolIntro` | `title`, `summary` | `h1` (`2xl`, `xl` below 640) and one `fg-muted` line. Same in every state, so the page never jumps. |
| `DropCard` | children | `surface-raised` card, 2 px dashed `border-strong`, `rounded-xl`. Center stack: file icon (48, `primary`), primary `Button lg` "Choose PDF files", hint line "or drop them here · paste with Ctrl+V" (`⌘V` on macOS; only for `pointer: fine`), then `LimitsNote` and `PrivacyNote`. Hover on the card: border turns `primary`. The whole card is not a button (avoids a giant ambiguous target); the button is the control. |
| `FilePicker` | `accept: string`, `multiple: boolean`, `onFiles(files: File[])`, `label`, `variant`, `sources?: ReactNode` (dropdown slot, AC-11) | Visible `Button` that clicks a visually hidden `<input type="file">` (keep the input in the DOM, `class="sr-only"`, `tabindex=-1`, so `setInputFiles` works). Resets `input.value` after each pick so the same file can be picked twice. `sources` slot: in F1 render nothing (AC-11 "no entries"); later a caret `IconButton` "More ways to add files" opening a menu. Prefetch: on `pointerenter`/`focus` of the button, start `import()` of the pdf.js loader so parsing starts warm. |
| `LimitsNote` | `tool` | `sm fg-muted`: "PDF only · up to 20 files, 100 MB each, 500 MB and 1,000 pages in total". Built from registry caps. |
| `PrivacyNote` | `runtime: "client" \| "server"`, `context: "intro" \| "result"` | Lock icon (`success`) + `sm` text. Client/intro: "Your files stay on this device. Nothing is uploaded." Client/result: "Done on this device. Your file was never uploaded." (AC-57). Server: different copy owned by F6; result variant not rendered for server (AC-57). |
| `DropOverlay` | `active: boolean`, `mode: "add" \| "replace"` | `position: fixed; inset: 0`, `drop-overlay` background, inner `inset: 12px` 2 px dashed `primary` border `rounded-xl`, centered icon and `lg` text "Drop to add files" / "Drop to replace the file". `aria-hidden`, `pointer-events: none`. Driven by a drag counter (`dragenter` ++ / `dragleave` --) so nested elements don't flicker; reset on `drop` and on `dragend`/window `blur`. Only reacts when `dataTransfer.types` includes `Files`. |
| `NoticeStack` | `notices: {id, tone, title, body, fileName?}[]`, `onDismiss(id)` | Fixed, anchored above the dock: bottom `calc(dock height + 12px)` below 1024; at ≥ 1024 bottom-left of the workspace column (`bottom: 24px`, inset to the workspace). Width `min(480px, 100vw - 32px)`. Newest on top, max 3 visible plus "+N more" button that expands. **Errors never auto-dismiss.** Info notices (e.g. "Loaded 20 of 21 files") also stay until dismissed or the next intake. Because it floats, adding or removing a notice never moves content. |
| `WorkspaceToolbar` | `start`, `end` slots | 52 px, sticky. Holds `ViewToggle` (only when > 1 file), `ThumbSizeSlider` (≥ 640 only, pages view only) and `AddFilesButton` (multi-file tools: secondary `sm` "Add files" with + icon; single-file tools: "Replace file"). |
| `ViewToggle` | `value: "pages" \| "files"`, `onChange` | `SegmentedControl` labeled "View", options "Pages" / "Files". Not rendered with one file; the toolbar's 52 px height is constant, so it appearing causes no shift. |
| `ThumbSizeSlider` | `value`, `onChange` | `Slider` 80–400, step 8, default 160. Writes `--ip-thumb-size` on the grid element (AC-10 measures tile width). Value is kept for the session in `sessionStorage`. |
| `PageGrid` | `groups: PageGroupModel[]`, `renderTile` | `role="list"`, `aria-label="Pages"`, `aria-describedby` a hidden hint "Use arrow keys to move between pages." Roving tabindex across tiles (U-7). Owns one `IntersectionObserver` (`rootMargin: "200px 0px"`, no more than one row of overscan, so AC-52 stays ≤ 30 rendered tiles at 1280×800) that asks the thumbnail renderer for visible tiles only, highest on screen first; tiles that leave the viewport by more than 3 screens release their bitmap. |
| `PageGroup` | `file: LoadedFile`, `children` | Only when > 1 file in pages view. Header row 40 px: file name (`sm` 500, truncate, full name in `title`), "· 60 pages" `fg-muted`, remove `IconButton` "Remove sixty-pages.pdf". Group spans all columns (`grid-column: 1 / -1`). |
| `PageTile` | `page: {fileId, index, width, height, label}`, `rotation: number` (display degrees, unbounded), `inScope: boolean`, `pendingDelta: number`, `thumb: ImageBitmap \| string \| null`, `actions?: ReactNode`, `tabIndex`, `onFocus` | `role="listitem"`. Square box `width: var(--ip-thumb-size); aspect-ratio: 1` (below 640: `width: 100%`). Inside, the page is drawn at its own aspect ratio, contained so its longest side equals the box, centered, on `paper` with `shadow-paper`. Rotation is `transform: rotate(<deg>)` on the page element; because the longest side is fixed, any multiple of 90° still fits the square box, so **rotating never changes the tile size**. Placeholder before render: same page box in `surface-sunken` with a soft opacity pulse; the box size comes from the page's viewport size, known as soon as the page is parsed, so the image arriving causes no shift. Below the box: page label (`xs`, `fg-muted`, `tabular-nums`), 20 px line. Badges top-start: `pendingDelta ≠ 0` shows a pill "+90°" (`primary-soft`/`on-primary-soft`, `xs` 600). `inScope`: 2 px `primary` outline inset 2 px around the box, plus a small check badge top-end (non-color cue). Focus: `focus` outline plus `shadow-md`. `actions` appear in a floating bar at the bottom of the box on hover, on focus-within, and always on touch (`hover: none`) devices. Accessible name: "Page 2 of 3, will rotate 90° clockwise" (or "...no change"). |
| `PageActionBar` | `children` (tool's per-page `IconButton`s) | `surface-raised` 90% with `shadow-md`, `rounded-md`, 4 px padding, buttons `sm` (32 visual / 44 hit via padding overflow). Default content shared by all tools: "Enlarge page" (opens `PagePreviewDialog`). |
| `PagePreviewDialog` | `page`, `rotation` | `Dialog` with a large render (fit to `min(80vh, 90vw)`), page label as title, Previous / Next buttons and arrow keys. Rendered at full DPR on demand. |
| `FileGrid` | `files: LoadedFile[]` | `role="list"`, `aria-label="Files"`, same column rules as `PageGrid`. (F3 adds drag reorder here; F1 leaves a `reorderable` prop unimplemented.) |
| `FileCard` | `file: LoadedFile` (`name`, `pageCount`, `size`, `status: "loading" \| "ready" \| "locked"`), `onRemove` | `role="listitem"`, square first-page box like `PageTile`, then name (`sm` 500, one line, ellipsis, `title` = full name) and meta "60 pages · 4.2 MB" (`xs fg-muted`). Remove `IconButton` top-end, always visible. Loading: placeholder box with centered `Spinner label="Reading <name>"` and meta "Reading…". Locked (waiting for password): lock icon in the box and meta "Password needed". |
| `ControlDock` | `options`, `status`, `action` | The structure from U-3. `role="region"`, `aria-label="<Tool name> options"`. Disabled while processing: wraps the options in a `fieldset disabled` so every control is disabled at once (AC-39). |
| `OptionsPanel` | `density: "compact" \| "full"`, `children` | `compact` (Rotate): rendered inline in the dock at every width. `full` (later tools with long panels): rendered in the dock column at ≥ 1024; below 1024 the dock shows an "Options" secondary button that opens the panel as a bottom sheet (`Dialog` variant `sheet`, max height 80dvh). Section headings inside are `sm` 600 `fg-muted` uppercase-free labels (no all-caps). |
| `DockStatus` | `text` | `sm fg-muted`, one line, `id` referenced by the primary's `aria-describedby`. Shows "3 pages · 1 file" when ready, the disabled reason otherwise ("Add a PDF to start", "Reading files…", "Waiting for a password"). Hidden visually at 640–1023 (still in the DOM for `aria-describedby`). |
| `PrimaryAction` | `label` (registry `actionLabel`), `disabled`, `onRun` | `Button primary lg`, full width in the dock column and below 640; min width 200 at 640–1023. |
| `ProcessingBar` | `label`, `value?` | Takes the **exact box** of `PrimaryAction` (same height, same width) so nothing moves. Contents: `ProgressBar` with a visible label above it inside the box: "Rotating… 42%" (`sm` 500, `tabular-nums`). Determinate from page count done / total. |
| `ProcessError` | `message`, `onRetry`, `onStartOver` | Replaces the dock footer. `Notice tone="danger"` text "Something went wrong while rotating. Your files and settings are still here.", then `Button primary` "Try again" and `Button ghost` "Start over" side by side. At < 1024 the dock grows upward (it is fixed, so content does not shift). Focus moves to "Try again". |
| `ResultCard` | `output: ToolOutput`, `tool`, `onStartOver`, `onBack` | `surface-raised` `rounded-xl` `shadow-sm`, padding 32 (20 below 640). Heading `h2` "Your PDF is ready" (multi: "Your files are ready") with an animated success check (`success`). |
| `ResultPreview` | `bytes` or `entries` | Single PDF: a fixed 240 px (200 below 640) square box; the first page of the **output bytes** rendered by the same thumbnail renderer, contained and centered on `paper` (landscape after a 90° rotation, AC-54). Placeholder pulse until rendered; box size is fixed so no shift. ZIP: the same box shows a stacked-pages icon, and below the summary a list (`ul`, max 6 rows, then "+N more") of entry names with page counts. |
| `ResultSummary` | `name`, `size` | File name (`lg` 600, break-all) and "1.2 MB · 3 pages" (`sm fg-muted`). |
| `ResultActions` | `download`, `share?` | `Button primary lg` "Download" with download icon (anchor with `download` attribute and an object URL, revoked on Start over / unmount). `Button secondary lg` "Share" only when `navigator.canShare?.({files:[file]})` is true (AC-56); feature-detect once on mount (render nothing until known; the slot has no reserved space because it sits after Download in a wrapping row, and the check is synchronous). |
| `ResultNotes` | `runtime`, `wasEncrypted` | `PrivacyNote context="result"` (AC-57). When any input was encrypted: `Notice tone="warning"` without dismiss, "This copy has no password. Anyone who has the file can open it." (AC-29). F11 later adds an action "Add a password" there. |
| `ContinueWith` | `outputType`, `tools` | `h3` `sm` 600 "Keep going with this file", then a wrapping list of `secondary sm` buttons, one per registry tool with `runtime: "client"`, status `beta`/`live`, accepting the output type (F1: just "Rotate"). Each is a button (it hands over in-memory bytes, then navigates). Not shown for ZIP outputs in F1. |
| `ResultFooter` | | Row: `Button ghost` "Start over" (left) and a text link-styled button "Back to options" (right, AC-45). Below 640 both full width, stacked. |
| `PasswordDialog` | `fileName`, `queuePosition?: {index, total}`, `showApplyToAll: boolean`, `error?: string`, `busy`, `onSubmit(password, applyToAll)`, `onSkip()` | See U-6 "Password needed". |
| `OwnerPermissionNotice` | `fileName`, `denied: Permission[]`, `onEnterPassword` | Inline `Notice tone="warning"` at the top of the workspace. No reserved space is needed: permissions are read during parsing, so the notice is already present in the first ready frame and never pops in later. Action "Enter owner password". |
| `OwnerPasswordDialog` | `fileName`, `denied: Permission[]`, `error?`, `onSubmit`, `onClose` | `Dialog` with a list of denied permissions using our labels (copy text, edit, organize pages, fill forms, print, sign), password field with show/hide, Unlock and Cancel; has a close button. Tested in F16/F17. |
| `ReplaceFileDialog` | `fileName`, `onConfirm`, `onCancel` | Single-file tools: "Replace <name>?" with "Replace" (primary) and "Keep current file". Not reachable on Rotate. |

#### Rotate pieces (`tools/rotate/`)

| Component | Content |
|---|---|
| `RotateOptions` (`density: "compact"`) | `SegmentedControl` label "Apply to", options All pages / Odd pages / Even pages (short labels "All" / "Odd" / "Even" below 1024). Then a button row: `Button secondary` "Rotate left" (⟲) and "Rotate right" (⟳); icon-only `IconButton`s below 1024 with those names. Then `Button ghost sm` "Reset" (icon-only "Reset rotation" below 640), disabled when nothing is pending. At ≥ 1024 the scope segmented control is full width and the two rotate buttons share a row 50/50. |
| `RotatePageActions` | `IconButton` "Rotate page N left" and "Rotate page N right", before the shared "Enlarge page". |
| `pageTransform` | Display angle = original `/Rotate` + pending delta, kept **unbounded** for animation (so 270 → 360 turns forward, not back to 0); the saved value is mod 360. |

### U-5. Copy (our own wording, English; keep strings in the tool config or a `copy.ts`, not inline)

| Key | Text |
|---|---|
| intro.rotate.title / summary | "Rotate PDF" / "Turn pages and save the rotation" (from the registry) |
| picker.button | "Choose PDF files" ("Choose PDF file" for single-file tools) |
| picker.hint | "or drop them here · paste with Ctrl+V" |
| privacy.intro | "Your files stay on this device. Nothing is uploaded." |
| privacy.result | "Done on this device. Your file was never uploaded." |
| status.empty / loading / password / ready | "Add a PDF to start" / "Reading files…" / "Waiting for a password" / "{pages} pages · {files} file(s)" |
| action.rotate | "Rotate PDF" (registry `actionLabel`) |
| progress.rotate | "Rotating… {n}%" |
| error.type | "{name} isn't a PDF, so it was skipped. This tool accepts PDF files." |
| error.corrupt | "{name} couldn't be opened. It may be damaged or not really a PDF." (also used for 0-byte files) |
| error.size | "{name} is larger than 100 MB, the limit for this tool." |
| error.pages | "{name} would take this task past 1,000 pages, so it was skipped." |
| error.count | "This tool takes up to 20 files at a time. We loaded the first 20." (lists skipped names, collapsed after 3) |
| error.process | "Something went wrong while rotating. Your files and settings are still here." |
| pw.title | "{name} is locked" |
| pw.body | "Enter its password to open it here. The password stays on this device." |
| pw.wrong | "That password didn't work. Check it and try again." |
| pw.applyAll | "Try this password on the other locked files" |
| pw.queue | "Locked file {i} of {n}" |
| pw.unlock / skip | "Unlock" / "Skip this file" |
| result.title | "Your PDF is ready" / "Your files are ready" |
| result.unencrypted | "This copy has no password. Anyone who has the file can open it." |
| result.continue | "Keep going with this file" |
| leave.prompt | browser default (custom text is ignored by browsers) |

### U-6. States

Every state keeps the same skeleton (header, `ToolIntro`, workspace, dock), so switching states swaps content inside fixed boxes. `ToolFlow[data-state]` reflects the state.

| State | Workspace | Dock | Focus / announcement |
|---|---|---|---|
| **Empty** | `DropCard` with `FilePicker`, hint, `LimitsNote`, `PrivacyNote`. No grid, no toolbar. | Options rendered but disabled (`fieldset disabled`); `DockStatus` "Add a PDF to start"; primary present and `disabled` (AC-1, AC-38). | Initial focus is the page default. First Tab after the skip link and header lands on "Choose PDF files". |
| **Dragging** (overlay on any state except processing and done) | `DropOverlay` fades in over everything. | unchanged | No announcement (pointer-only affordance; keyboard path is the picker). |
| **Loading** | Toolbar appears. Each file gets a `FileCard` in loading state (files view) or a `PageGroup` header with a `Spinner` and "Reading {name}…" and placeholder tiles sized from the parsed page count (pages view). The spinner is visible from the first frame after intake, before any thumbnail (AC-6). As soon as a file's page sizes are known its placeholders appear, then thumbnails fill in lazily. | Primary disabled; status "Reading files…". | Polite: "Reading 2 files". |
| **Password needed** | The locked file shows as a `FileCard`/group with a lock and "Password needed"; other files keep loading behind the dialog. | Primary disabled; status "Waiting for a password". | `PasswordDialog` opens; focus in the password input (AC-20). |
| **Ready** | Toolbar, grid (pages view by default for Rotate; files view default for tools with `defaultView: "files"`), optional `OwnerPermissionNotice`. Tiles in scope show the outline; pending rotations show rotated pages and the "+90°" badge. | Options enabled; status "3 pages · 1 file"; primary enabled. The primary becomes enabled when page counts are known, **not** when thumbnails finish (AC-52). | Polite: "three-pages.pdf ready, 3 pages". Focus stays where it was (on the picker button or the dialog's return target). |
| **Ready, nothing pending** (Rotate only) | Same as ready. | Primary stays **enabled** (the reference also lets you run); status adds "No changes yet". Running produces a file equal to the input in `/Rotate` values (AC-35 relies on this after Reset). | – |
| **Processing** | Grid stays visible, `inert` and at 60% opacity; per-page actions hidden. | `fieldset disabled` on options; `ProcessingBar` replaces the primary in the same box (AC-39). | Polite: "Rotating". Focus moves to the progress bar container (`tabindex=-1`) so it is not lost on the disabled button. |
| **Done** | Workspace and dock are replaced by `ResultCard` (crossfade). Preview, summary, Download, optional Share, notes, Continue with, Start over, Back to options. | – | Focus moves to **Download**, which has `aria-describedby` = the summary ("three-pages.pdf, 1.2 MB"). Polite: "Your PDF is ready". |
| **Processing error** | Grid back to full opacity, interactive. | `ProcessError` with "Try again" and "Start over". | Focus to "Try again"; message is `role="alert"`. |
| **Intake error / limit** (wrong type, corrupt, 0 bytes, too big, too many pages, too many files) | Whatever the state was before (empty stays empty: AC-12, AC-13). Valid files in the same batch still load (AC-15, AC-18). | Unchanged; primary is enabled only if ≥ 1 usable file exists (AC-47). | `Notice tone="danger"` (`warning` for the file-count cap, since files did load) in `NoticeStack`, `role="alert"`, naming the file. Focus does not move. Several problems from one batch become one notice listing each file, so screen readers get one alert, not six. |
| **Owner-restricted, permission needed** (deferred consumers) | `OwnerPermissionNotice` above the grid. | Primary disabled; status "This file needs its owner password for this tool". | – |
| **Session expired** (server tools, F6) | – | – | A `Dialog` "Your files were cleared" with "Add files again". Defined in F6. |

**Password needed, in detail (`PasswordDialog`).**

```
┌──────────────────────────────────────┐
│ [lock] user-pw.pdf is locked         │ title (lg 600, name truncated in the middle)
│ Locked file 1 of 2                   │ (only if > 1 locked) sm fg-muted
│ Enter its password to open it here.  │
│ The password stays on this device.   │
│                                      │
│ Password                             │ label
│ ┌──────────────────────────────┬───┐ │
│ │ ••••••                       │eye│ │ input 44, toggle IconButton
│ └──────────────────────────────┴───┘ │
│ (!) That password didn't work. Che…  │ error (danger), reserved line
│ [ ] Try this password on the other   │ only when another locked file is queued
│   locked files                       │
│                                      │
│ [Skip this file]          [ Unlock ] │
└──────────────────────────────────────┘
```

- Input `type="password"`, `autocomplete="off"`, `autocapitalize="off"`, `spellcheck=false`, `aria-invalid` and `aria-describedby` → error when wrong. The error line's height (20 px) is **reserved** under the input from the start, so showing it moves nothing.
- Show/hide: `IconButton` inside the input's end, `aria-pressed`, label "Show password" (stays the same label; `aria-pressed` conveys state). Switches `type` (AC-24); caret position kept.
- Enter submits. While checking: Unlock `busy`, input `readOnly`. Wrong: error appears, the input keeps the value with it **all selected** and focused, a 240 ms horizontal shake (±4 px, twice; none under reduced motion) (AC-21). Unlimited retries.
- Skip and Escape both remove the file (AC-25); focus returns to the next dialog in the queue, or to the control that started the intake (the picker button or `AddFilesButton`), or, if that's gone, the `ToolIntro` heading.
- Footer order in DOM: Skip, then Unlock (Unlock is the right-most, the primary). Below 400 px they stack, Unlock on top (`flex-direction: column-reverse`).

**Loading → Ready, no shift.** Order of paint for a file: (1) `FileCard`/group header with spinner, fixed size; (2) page count known → placeholder tiles with real aspect ratios; (3) thumbnails fade in per tile. Steps 2 and 3 never change box sizes. The grid region below the toolbar is given `min-height: calc(var(--ip-thumb-size) + 36px)` from the first loading frame.

### U-7. Keyboard, focus order and ARIA

**Landmarks.** `header` (site), `main` (id `main`, target of a "Skip to main content" link that is the first focusable element), inside main: `ToolIntro` heading `h1`, the workspace as `section aria-label="Your files"`, the dock as `region aria-label="Rotate options"`, the result as `section aria-labelledby` its `h2`.

**Focus order by state (DOM order = visual order at every width).**
- Empty: Skip link → header links → "Choose PDF files" → (dock: options disabled, skipped) → primary (disabled, skipped).
- Ready (all widths): Skip link → header → toolbar: View (radiogroup, 1 stop) → Thumbnail size (− , slider, +) → Add files → owner notice action (if any) → page grid (1 stop) → active tile's actions (Rotate left, Rotate right, Enlarge) → dock: Apply to (radiogroup, 1 stop) → Rotate left → Rotate right → Reset → primary → notices (each: action, Dismiss).
  The dock is after the workspace in the DOM at every width (at < 1024 it is `position: fixed` at the bottom, which matches reading order: content, then the bar at the bottom).
- Done: Download (focused on arrival) → Share → Continue-with buttons → Start over → Back to options. Shift+Tab reaches the heading region and header.
- Password dialog: input → show/hide → apply-to-all checkbox → Skip → Unlock; Tab wraps inside the dialog (native modal inert background, plus a wrap guard for browsers that let focus escape to the URL bar, which is acceptable per AC-48).

**Page grid keys (roving tabindex).** Arrow Left/Right: previous/next tile. Arrow Up/Down: same column, previous/next row (column count read from the computed grid). Home/End: first/last tile; Ctrl+Home/End also. Page Up/Down: ±3 rows. Moving focus scrolls the tile into view with `block: "nearest"`. When a tile has focus, its action buttons get `tabindex=0` (all other tiles' actions are `-1`), so Tab goes into the active tile's actions, then out to the dock. Enter or Space on a tile opens `PagePreviewDialog`. Tile shortcuts when the tile (not a button) is focused: `[` rotate this page left, `]` rotate right (tool-provided through `pageActions`, announced in the grid hint). Newly loaded files never steal focus.

**Global keys.** Ctrl/Cmd+V adds PDFs from the clipboard (ignored when the event target is an `input`, `textarea` or `contenteditable`, AC-55; non-file clipboard data is ignored silently). Ctrl/Cmd+O is **not** overridden (browser behavior wins). Escape closes the topmost dialog (Skip for the password dialog) or collapses the expanded notice stack.

**ARIA summary.**

| Element | Role / attributes |
|---|---|
| File input | visually hidden, `tabindex=-1`; the visible button is the control, its name is "Choose PDF files" |
| Drop overlay | `aria-hidden="true"` |
| View toggle, scope | `role="radiogroup"` + `aria-label`; options `role="radio"` + `aria-checked` |
| Thumbnail size | native range, `aria-valuetext` |
| Page grid / file grid | `role="list"` with `aria-label`; tiles `role="listitem"`; the focusable element inside each tile has `aria-label` "Page 2 of 3, will rotate 90° clockwise" and `aria-describedby` the grid hint |
| Loading file | `Spinner` `role="status"` with "Reading {name}" |
| Rotate buttons | native buttons with visible text (≥ 1024) or `aria-label` (icon-only) |
| Primary | native `button`, `disabled` when not ready, `aria-describedby` → `DockStatus` |
| Progress | `role="progressbar"`, `aria-label="Rotating"`, `aria-valuenow` |
| Notices | `role="alert"` (danger, warning), `role="status"` (info); dismiss button "Dismiss" + notice title in `aria-label` ("Dismiss: notes.txt isn't a PDF") |
| Dialogs | native `<dialog>` modal, `aria-labelledby`, `aria-describedby`; password error `aria-live` via `role="alert"` on the error line |
| State changes | one polite `LiveRegion`: "Reading 2 files", "three-pages.pdf ready, 3 pages", "Rotating", "Your PDF is ready", "All pages will rotate 90° clockwise" (after toolbar rotate), "Rotation reset" |
| Result preview | `img` (or canvas with `role="img"`) `aria-label="Preview of page 1 of the result"` |

**Contrast and visibility checks.** All text pairs are in U-2. Disabled controls use `fg-disabled` (exempt). Focus outline 3 px `focus` (Mint Paper `link` #0282e5) with 2 px offset: 3.94:1 on surface, 3.40:1 on band and page trays, 3.19:1 on sand (non-text, ≥ 3:1). The scope outline is the same link blue, 2 px, around the page's grey tray (3.40:1 against the tray). The page image sits on its tray with `shadow-paper` (a hairline ring and soft shadow). There is no dark mode until Mint Paper defines one. Measured values and deviations: [`docs/design/mint-paper.md`](../design/mint-paper.md). Target sizes: every interactive element ≥ 44×44 px at < 1024 and ≥ 32×32 visual with 44×44 hit area at ≥ 1024. Zoom to 200% and 400% (320 CSS px reflow) works: at 320 px the dock's options row wraps to two rows (dock grows; `main` padding uses the measured dock height via a `ResizeObserver` writing `--ip-dock-actual`).

### U-8. Micro-interactions

All CSS transitions on `opacity`/`transform`, durations from tokens, zero under reduced motion.

| Moment | Interaction |
|---|---|
| Hover/focus "Choose PDF files" | Background `primary` → `primary-hover` (`fast`); pdf.js loader prefetch starts. |
| Button press | `scale(0.98)` for `instant`; primary `primary-active`. |
| Drag enters page | Overlay fades in (`fast`), icon nudges up 4 px (`base`). Leaves: fade out (`fast`). |
| Files accepted | Placeholder tiles appear without animation (they define the layout); thumbnails fade in (`fast`) as they render. No staggered fly-ins (they slow perceived speed). |
| Primary becomes enabled | Color transition (`base`) from disabled to `primary`. No bounce. |
| Scope change | In-scope outlines and check badges fade in/out (`fast`). |
| Rotate (toolbar or per page) | Page element rotates by ±90° (`base`, `ease-out`) around its center; "+90°" badge text swaps, badge fades in/out when it becomes 0. Rapid clicks retarget the running transition (unbounded angle keeps direction right). Polite announcement. |
| Reset | All rotated pages animate back (`base`); Reset button turns disabled. |
| Remove file | Card/group fades out (`fast`) then is removed; the grid reflows once (user-initiated, not CLS). |
| Processing | Primary box crossfades into `ProcessingBar` (`fast`); fill animates `scaleX` (`fast`, linear) per update; updates throttled to one per animation frame. Grid dims to 60% (`base`). |
| Done | Workspace/dock fade out and `ResultCard` fades in (`base`). Success check draws its stroke (`slow`). Preview fades in when rendered. |
| Wrong password | Field shake (240 ms) and error text fade-in (`fast`). |
| Notice in/out | Fade + 8 px slide from the bottom (`base`); out: fade (`fast`). |
| Tile hover (pointer) | `shadow-md` and action bar fades in (`fast`). |
| Download click | Button shows a check icon for 1.5 s ("Downloaded" in the live region) without changing width. |

### U-9. Registry fields the UI reads (for the engineer)

The UI needs these per tool (names are a proposal; the engineer owns the type): `accept` (MIME + extensions), `multiFile`, `maxFiles` (20), `maxFileBytes` (100 MB), `maxTotalPages` (1,000), `maxTotalBytes` (500 MB), `defaultView: "pages" | "files"`, `requiredPermissions: Permission[]`, `actionLabel` ("Rotate PDF"), `progressLabel` ("Rotating"), `optionsDensity: "compact" | "full"`, `outputName(inputs)`, `runtime`, `status`. `ContinueWith` filters the registry by `runtime === "client"`, `status !== "planned"` and `accept` containing the output type.

### U-10. Performance and no-shift checklist

- Route JS: `ToolFlow`, primitives and Rotate options only. **pdf.js and pdf-lib are loaded with `import()`** on first intake (prefetched on hover/focus of the picker), and processing runs in a Web Worker. No UI libraries, no animation library, no icon package; icons are inline SVG.
- Fonts: Inter, self-hosted via `next/font/local` (one preloaded latin woff2, `swap`, metric-adjusted fallback, so no third-party request and no swap shift).
- Fixed boxes: tiles (square), placeholders (page aspect from viewport), file cards, preview box (240/200 square), dock (fixed or sticky with constant height per breakpoint), progress (same box as primary), password error line (reserved), toolbar (52 px constant even when the toggle is hidden).
- Floating, never in-flow: notices, drop overlay, dialogs, tooltips, page action bar.
- Thumbnail rendering: DPR-aware but capped at 2×; size = current `--ip-thumb-size`; re-render only after the slider stops (debounce 150 ms), with CSS scaling in between.

### U-11. Decisions for the engineer

1. **Empty-state dock:** the design renders the dock with the primary present and disabled (satisfies both AC-1 and AC-38 and prevents the dock from appearing later). If QA reads AC-1 as "absent", keep it disabled anyway; AC-1 allows either.
2. **Thumbnail renderer location:** pdf.js render in a worker with `OffscreenCanvas` where supported, falling back to main-thread canvas. Either is fine for the design as long as AC-52 holds.
3. **Hand-off store for Continue-with:** in-memory (module-level or `sessionStorage` key holding a `Blob` URL) is the engineer's call; the design only requires that the target tool opens directly in the ready state with no picker step (AC-43).
4. **`sessionStorage` for the slider value** is optional polish; drop it if it complicates SSR.
5. **Dark mode** is not shipped: Mint Paper does not define one yet, so the tokens are light only (no `data-theme` switch). It is pending the designer's definition; see [`docs/design/mint-paper.md`](../design/mint-paper.md).
6. **The 768 px `DockStatus`** is visually hidden; if testing shows users miss the disabled reason, show it as a one-line caption above the dock (fixed position, no shift).
