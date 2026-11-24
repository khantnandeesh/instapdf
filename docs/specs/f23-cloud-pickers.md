# F23: Cloud sources (Google Drive, Dropbox, OneDrive pickers)

Status: step 1 (Analyze) first draft; step 2 research in `f23-cloud-pickers-research.md`; step 3 (UX) `## UI` added 2026-11-24 (AC-165 to AC-169).
Reference observed: `merge-pdf` and `pdf-editor` on the live reference site, 2026-11-24, desktop 1280×900 and phone 390×844. We opened every cloud entry, accepted the reference's third-party prompt, and closed each provider's sign-in window **without signing in**. We ran **no** processing task. We uploaded one 580-byte synthetic PDF once, only to open the "Add files" and "Add pages" menus. The one server-side URL fetch was not run (see §0d), so the server's error for a fetched non-PDF address is *unverified*. The result-screen "save to" behavior comes from the reference's public result page template and its script, not from a live save.
Internal screenshots: `docs/specs/assets/f23/` (reference only, never ship). Index in §9.

Closes: evaluation `docs/evals/f3-merge.md` M2 **lose** (gap G-1); F1 deferral D-5 and AC-11 (`docs/specs/f1-shared-flow.md`, "Cloud sources" and "Source dropdown" rows, `FilePicker` `sources` slot).

## 0. How the reference does it (evidence)

### 0a. Where the cloud entries appear

| Place | Entries (in this order) | Screenshot |
|---|---|---|
| Empty state of every tool page: a caret on the right of the big upload button (split button) | Dropbox, Google Drive, OneDrive, Web address (URL) | 02 (1280), 21 (390) |
| PDF editor landing | Same four entries | 41, 43 |
| Merge, ready state, toolbar "Add files" menu | Local files, Dropbox, Google Drive, OneDrive (**no URL entry**) | 30, 32 |
| Merge, ready state, "Add pages" menu | Local files, Dropbox, Google Drive, OneDrive, then a separator and Blank page. A file chosen here opens the page picker first. | 31 |
| Result screen, Download split button menu | Save as, Save to Dropbox, Save to OneDrive, Save to Google Drive. There is also a separate Google Drive icon button next to Download. | F3 eval cache `sejda-t3-result.png` |
| Landing pages, hidden until connected | A "Recent files" block that lists files in the reference's own folder in the user's Google Drive, with an invite to connect Drive | (DOM only, not visible) |

All 51 tool pages in the crawl (`docs/discovery/raw/*.html`) carry the same Dropbox, Google Drive, OneDrive and URL entries. Non-tool pages (home, help, pricing and so on) carry none.

Details seen on the menu:
- The caret is a separate button. Its only accessible name is the generic "Toggle Dropdown" text, and it sets `aria-expanded`. Entries are links with `href="javascript://"`, not `role="menuitem"`.
- At 1280 px on the empty state, the Google Drive and OneDrive icons are **missing** the first time the menu opens (only the Dropbox and URL icons draw). The same happens at 390 px. The ready-state "Add files" menu shows all icons.
- At 390 px the caret target is 36×51 px and each entry is 363×37 px (below a 44 px touch target).
- No third-party request happens on page load. Provider scripts load only after an entry is chosen and the user accepts the prompt below.

### 0b. What each entry does when clicked

**Step 1, every provider: a privacy prompt (first use only).** A modal asks whether loading content from the named external service (Dropbox, Google or Microsoft) is acceptable, since it may see the visitor's IP address and set cookies. It has Cancel and Continue (screenshots 03, 07, 22). Continue stores a per-provider choice in `localStorage` (`optOut.<provider> = false`) and the prompt doesn't show again. Cancel closes the modal and nothing else visible happens, but the page throws an unhandled promise rejection and reports it to its own error endpoint (`POST /errors/js`).

**Step 2, by provider:**

| | Dropbox | Google Drive | OneDrive |
|---|---|---|---|
| Script loaded into the reference's page | `www.dropbox.com/static/api/2/dropins.js` (Chooser) | `www.google.com/jsapi`, `www.gstatic.com/charts/loader.js`, `apis.google.com/js/client.js` + gapi `client` and `picker` modules, `accounts.google.com/gsi/client` (Google Identity Services) | `js.live.net/v7.2/OneDrive.js` (file picker SDK v7.2) |
| Frames added to the reference's page | none seen | a hidden `content.googleapis.com/static/proxy.html` iframe (gapi). The Picker itself is an iframe from Google (not reached: needs sign-in) | none seen before sign-in |
| Window opened | Popup on `www.dropbox.com/chooser…` which redirects to Dropbox sign-in (`/dropins/login`), about 735×552 (screenshot 04) | Popup on `accounts.google.com` (OAuth token client, `display=popup`) asking to sign in "to continue to" the reference's app (screenshot 08). After sign-in the Picker opens as an overlay iframe in the page. | Popup that first loads a redirect page on the reference's own origin (`/one-drive-auth`) and then goes to `login.microsoftonline.com` (implicit flow, `response_type=id_token token`) (screenshot 10) |
| Access asked for | Chooser access only (no app token). The Chooser returns temporary direct links (link type "direct", valid about 4 hours). | `drive.file` + `drive.install` scopes (per-file access to what the user picks) | `Files.Read.All`, `User.Read`, `openid`, `profile` (reads **all** the user's files) |
| Picker options set | multiselect only where the tool allows several files; extension filter from the tool's accepted types (Merge: `.pdf .png .gif .jpg .jpeg .tif .tiff .bmp .webp`) | List view; folders shown but not selectable; three tabs: My Drive, "Recent folder" (last folder used, remembered in `localStorage`), and shared drives. The view is PDFs only, images only, or all documents, depending on the tool's types. Multi-select only where the tool allows several files. | `action: download`, multi-select only where the tool allows several files, extension filter from the tool's types |
| Native cloud docs | n/a | On Merge (all-documents view) a Google Doc, Sheet or Slides file is accepted and converted with Google's PDF export link | n/a |
| Cancel / close the window | Nothing happens (no message) (screenshot 06) | Closing the sign-in window made a **second** sign-in window open (a silent attempt, then a consent attempt). Cancelling the Picker clears the remembered folder and forces an account chooser next time. | Nothing happens (no message) (screenshot 11) |
| Popup blocked | Native `alert()` saying the popup was blocked | Native `alert()` saying the authentication popup was blocked | not handled (generic `alert()`) |
| Script blocked or failed | Native `alert()` that it couldn't connect to the provider | Native `alert()` suggesting the browser or an add-on is blocking Google's scripts | Native `alert()` that it couldn't connect |

Single versus multiple: the picker allows multi-select only on tools whose page says multiple files are allowed for free users (Merge, Organize, Alternate & mix, Visually combine, JPG to PDF, Rename). On most tools free users can pick **one** file (multi-select is a paid feature), and on Editor, Sign, Forms, OCR and Bookmarks it is always one.

### 0c. How the file gets in: the reference's **server** fetches it

After a pick, the reference's page posts the file's link to its own server (`POST /api/files` with `{url}`), and the server downloads the file. The browser never downloads the bytes.
- **Dropbox:** the server gets the temporary direct link.
- **Google Drive:** the page adds the user's **Google access token** to the link it sends (`oauth_bearer=` query parameter) and also sets it as a bearer header. So the reference's server receives the user's Drive token. The token is also kept in the browser, encrypted, in `localStorage` and reused while it is valid.
- **OneDrive:** the server gets Microsoft Graph's pre-authenticated download URL. For other link shapes the page also adds the **access token** to the URL.
- While the server fetches, the upload bar is **indeterminate** (no percentage). The file then appears like an uploaded file.
- Limits are the server's: the free tier's 50 MB / 50 pages per task, 3 tasks per hour, and a files-per-hour cap (HTTP 429 opens the upgrade prompt and the file fails with a "free limit on files per hour" reason). After a 429, any further link submitted within 10 s is dropped.
- A 400 from the server shows the server's own text as the failure reason. A Drive file with restricted access, or a type the tool doesn't take, gets a red banner at the top.

### 0d. Web address (URL) entry

A modal with one text field (placeholder shows an example address), Cancel and Continue, and a close ×. Focus goes to the field when it opens (screenshot 12).
- Continue runs these checks in the browser. If the text has no `://`, `http://` is put in front (and written back into the field). It is rejected with a red "invalid address" label above the field and a shake when: it starts with `file:` or `\`, or contains `:\` (a Windows path); it has no host; its host is the reference's own host; the scheme is not http or https (`ftp://` rejected); or the path is just `/` (`example.com` rejected). An empty field becomes `http://` and is rejected (screenshot 13).
- The red label hides after the **second** key typed after an error. Enter submits. Escape and Cancel close the modal. The typed value **stays** when the modal is reopened.
- A valid address whose name ends in a type the tool doesn't take (for example `…/index.html` on Merge) is rejected in the browser with a full-width red banner listing the accepted types. No request is sent (screenshot 15).
- A valid address that passes these checks goes to the server like a cloud link (`POST /api/files {url}`), and the page URL gets a `?` pushed into history. We did **not** run this (it would make the reference's server fetch a third-party address), so its error for a fetched non-PDF is *unverified*.
- Pages also accept a `?files=[{"downloadUrl": …}]` query parameter that opens files from addresses (used for integrations).

### 0e. Save back to the cloud (result screen; from the template and script, not run live)

| Provider | How it saves |
|---|---|
| Dropbox | Dropbox Saver: Dropbox's servers download the result from the reference's server URL. Confirmation and failure are native `alert()`s. |
| OneDrive | The page downloads the result into the browser, puts it in a hidden file input, and the OneDrive SDK uploads it (popup, "replace" on name conflict). Native `alert()`s. |
| Google Drive | The page gets a token and sends it to the reference's server (`POST /api/tasks/<id>/save-gdrive`), and the server uploads the result into a folder named after the reference in the user's Drive. Success shows a toast with a "show folder" link. Failure shows a modal with the server's reason or "too many requests". |

### 0f. Conflicts between the reference's approach and our CSP

Our policy (`apps/web/src/lib/security/csp.ts`) is the verifiable form of "browser tools upload nothing". Every part of the reference's approach would break it, or be broken by it:

| # | Reference does | Our directive | Conflict |
|---|---|---|---|
| C-1 | Injects provider SDK `<script>`s into the tool page (dropbox.com, google.com, apis.google.com, accounts.google.com, gstatic.com, js.live.net) | `script-src 'self' 'wasm-unsafe-eval' <hashes>` | Blocked. Allowing them would run third-party code **in our origin**, with full access to the user's files in memory. That alone would make the privacy claim unverifiable. |
| C-2 | gapi makes XHR calls to `content.googleapis.com` / `www.googleapis.com` (Drive metadata); a browser download would need `dl.dropboxusercontent.com`, `graph.microsoft.com`, `*.microsoftpersonalcontent.com` or `*.sharepoint.com`, `www.googleapis.com` | `connect-src 'self'` | Blocked. Any host we add here is a host the page *could* send data to. For Google, the download and upload APIs share the host `www.googleapis.com` (upload is under `/upload/`), so a host-only allowance would also allow uploads. CSP path matching (`https://www.googleapis.com/drive/v3/files/`) could narrow it, but paths are ignored after a redirect. |
| C-3 | gapi proxy iframe; Google Picker iframe (`docs.google.com`); OneDrive SDK may use iframes | `frame-src` falls back to `default-src 'self'` | Blocked. |
| C-4 | Provider sign-in and choosers run in **popups** that report back to the opener (`postMessage` to `window.opener`, `window.closed` polling). The reference's console already shows "Cross-Origin-Opener-Policy would block the window.closed call" from the providers' own pages. | `Cross-Origin-Opener-Policy: same-origin` | With `same-origin`, a popup that navigates to another origin loses its `opener`. Dropbox Chooser results, the Google token client callback and the OneDrive redirect bounce would never reach the page. `same-origin-allow-popups` keeps openers for popups we open, but it is a policy change to weigh. |
| C-5 | Provider icons and Picker thumbnails from provider CDNs | `img-src 'self' blob: data:` | Our own menu icons must be self-hosted (and follow each provider's brand rules). Images inside a provider window are not our page's concern. |
| C-6 | The reference's server receives the link and, for Google and OneDrive, the **access token** | Rule 4 / privacy claim | Not allowed for us: our server must never see file bytes, links or tokens. GCP cost stays at zero extra. |
| C-7 | A `localStorage` copy of the Google token | – | Tokens should stay in memory only (see AC-129). |
| C-8 | URL import goes through the server (CORS) | `connect-src 'self'`, no server | A client-only fetch of an arbitrary address needs `connect-src https:` (which voids the claim) and only works for hosts that send CORS headers. See decision D-1. |

The competitor-researcher owns the design that resolves C-1 to C-5 (for example: running provider code in a separate, sandboxed origin or popup that hands only the bytes back through `postMessage`, so the tool page's policy barely changes). This spec only fixes the **observable** rules in §5 and the ACs.

## 1. Purpose

Let a visitor bring files into any BerryPDF tool straight from Google Drive, Dropbox or OneDrive, without saving them to the device first, and (later) save the result back. The file goes from the provider to the visitor's browser and is processed there like a local file. BerryPDF's servers never see the file, its link or the sign-in token, and nothing about the tool's privacy promise changes. The feature sits behind a flag, and a same-origin mock provider lets tests and builds run without real keys.

## 2. Inputs

| Aspect | Reference (observed) | BerryPDF F23 |
|---|---|---|
| Providers | Dropbox, Google Drive, OneDrive | Same three. Menu order: **Google Drive, Dropbox, OneDrive** (most used first; UX may change). A provider whose keys are not configured is **hidden**, never shown broken. |
| Where | Upload caret on every tool; "Add files" and "Add pages" in Merge; editor landing | Every place the shared `FilePicker` appears: the empty state, every "Add files" or "Add" menu in the ready state (Merge, Organize and later tools), and "Add pages from a file" (opens the page picker after the download, same as a local file). |
| Accepted types | Picker filter from the tool's accepted types; Drive view by type | Same. Each picker is asked for the registry's `accept` list. A file that still doesn't match goes through the normal intake message (F1 AC-12). |
| Multi-file | Multi-select only where free users may add several files | Follows the registry's `multiple` (for example Rotate allows 20 files, so multi-select is on). Free, no paywall. |
| Size and pages | Server free tier: 50 MB, 50 pages, files per hour | Registry caps (100 MB per file, 500 MB per task, 1,000 pages, 50 files on Merge). The size the provider reports is checked **before** downloading. No hourly cap. |
| Encrypted PDFs | Server-side password prompt | Same local password dialog as a local file (F1 AC-20 to AC-29). |
| Google Docs, Sheets, Slides | Converted with Google's PDF export, Merge only | On every tool that takes PDF, a native Google file is offered and arrives as `<title>.pdf` through Google's own export. Google limits exports to about 10 MB; a bigger export fails with a named message. *P2, depends on the design.* |
| Web address (URL) | Modal plus server fetch | **Not in F23 by default.** See decision D-1. |
| Folder pick | Not allowed | Not allowed. |

## 3. Options (controls)

| Control | Type | Default | Allowed values | Effect |
|---|---|---|---|---|
| Feature flag | build/runtime config (builder names it; for example `cloudSources`) | `off` in production until the evaluator passes F23; `mock` in CI and e2e | `off`, `mock`, `live` (live is per provider: only providers with configured client IDs) | `off`: F1 behavior exactly (no menu, CSP unchanged). `mock`: same-origin mock provider for every entry. `live`: real providers. |
| "More ways to add" trigger | icon button or split caret beside Choose files, with an accessible name that says what it does | closed | – | Opens the sources menu |
| Sources menu | menu (`role="menu"`, items `role="menuitem"`) | – | the configured providers | Choosing an entry opens that provider's picker at once (no extra modal, see §5 "Consent") |
| Provider picker | the provider's own window, or the mock dialog | – | files of the accepted types; one or many per registry `multiple` | Returns the chosen files; BerryPDF downloads them in the browser |
| Download item | slot or card for each file being fetched: name, provider icon, a progress ring or bar with a percentage, and a cancel button | – | – | Shows progress; cancel stops that download |
| Retry | button in a per-file or per-provider error | – | – | Repeats the failed step (open the picker, or download again) |
| Disconnect | small text button in the menu once a provider was used this session | – | – | Forgets the in-memory token for that provider (P2) |
| Save to (result screen) | entries in the result screen's secondary actions: Save to Google Drive, Dropbox, OneDrive | – | configured providers | Uploads the output **from the browser** to the provider (P2; may ship as a second phase) |

## 4. States

| State | Reference | BerryPDF |
|---|---|---|
| Empty | Upload button with a caret; menu closed | Choose files plus the "more ways to add" trigger; nothing third-party loaded |
| Menu open | Four entries; two icons missing on first open | Three provider entries with icons that are all drawn (self-hosted), keyboard navigable |
| Consent | Modal per provider before any third-party load | No modal. One line in the menu says, in our own words, that the provider opens in its own window and the file comes straight to this device. Choosing the entry is the consent. |
| Signing in / picking | Provider popup; the page shows nothing | The page shows a quiet "Waiting for Google Drive…" status with Cancel. Closing the provider window returns to the previous state. |
| Downloading | Indeterminate bar while the server fetches | Each file has its own determinate progress (bytes received of the size the provider reported). Thumbnails start as soon as a file finishes, without waiting for the batch. |
| Ready | Normal ready state | Normal ready state; each cloud file's card can show a small provider badge (UX decides) |
| Processing / done | Normal | Normal (no difference: the file is local by now) |
| Error | Native `alert()`s, or a red top banner | Inline, named, dismissible messages with a recovery action (Retry, Try again, Choose another file). Never `alert()`. |
| Limit reached | Upgrade prompt on files-per-hour (429) | No hourly limit. Size, page and file-count caps as for local files, checked before download where possible. |
| Session expired | Server files deleted after 2 h; "re-upload" | Not applicable to files (they are local). A provider token that expires during a later pick triggers a fresh sign-in inside the provider window. |

## 5. Errors and limits

Behavior to copy or beat (our own wording everywhere):

| Case | Reference | BerryPDF |
|---|---|---|
| User cancels the picker or closes the sign-in window | Nothing (Dropbox, OneDrive); Google opens a **second** sign-in window | Back to the previous state, focus on the trigger, no message, **no second window**, no console error |
| User declines the reference's privacy prompt | Nothing visible; a JS error is reported | n/a (no prompt). |
| Popup blocked | `alert()` (Dropbox, Google) | Inline message naming the provider, with a "Try again" button (a fresh click, so the browser allows the window) |
| Provider script or service unreachable | `alert()` | Inline message naming the provider and suggesting another way in; Choose files and drop keep working |
| Access not granted (user denies the permission) | not observed | Inline message saying access wasn't given, with Try again |
| Wrong type | Red top banner listing the accepted types | Same named intake message as a local wrong-type file (F1 AC-12) |
| File larger than the cap | Server free-tier limit, upgrade prompt | Rejected **before downloading** (provider-reported size), message names the file and the cap |
| Too many files or pages | Upgrade prompts | Same caps and messages as local intake (F1 AC-17, AC-18) |
| Download fails mid-way (network or provider error) | Upload failed modal with retry | That file shows a failed state with Retry; other files continue |
| File not accessible (restricted, removed, quota) | Red banner for restricted Drive files | Named message; other files stay |
| Encrypted PDF | Password modal | Local password dialog, same as local files |
| Corrupt or empty file | Server error | Same as local intake (F1 AC-13, AC-14) |

Limits: no hourly or daily cap (no server involved). No GCP cost: no server endpoint is added. Any provider-side quota is the provider's, and its error is shown by name.

## 6. Output

- Cloud sources change **nothing** in the output. A file picked from a provider is processed exactly like the same file picked locally: same page count, order, rotation, text and output name (`<original name>`-based, as each tool's spec says). The original name from the provider is kept, including the extension. A Google native document arrives as `<title>.pdf`.
- Single file or ZIP follows each tool's own rule.
- Save to cloud (P2): the uploaded file in the provider is byte-identical to what Download gives, with the same name. It goes into the folder the user picks in the provider's save dialog, or a folder named "BerryPDF" when the provider has no save dialog. An existing file with the same name is **not** overwritten silently.

## 7. Acceptance criteria

Fixtures: the F1/F3 fixtures (`alpha.pdf` 3 pages, `bravo.pdf` 2 pages, `echo.pdf`, `charlie.png`, `notes.txt`, `user-pw.pdf`, `corrupt.pdf`). The **mock provider** (flag `mock`) serves them same-origin from a test-only path and simulates provider states: cancel, popup blocked, access denied, unreachable, slow download (throttled), mid-download failure, a 403 file, a file reporting 101 MB, a native Google document, and the save dialog. It records each picker request (provider, `multiple`, accepted types) where the test can read it, and it uses a fixed fake token string `MOCK-TOKEN-F23` so tests can search for it in traffic. "(ref)" means the reference has the behavior; "(beat)" means we go beyond it.

### Flag and entry points

- **AC-120 (P0)** With the flag `off`, no tool page shows a sources trigger or any provider name, and the `Content-Security-Policy` header on `/merge-pdf` and `/rotate-pdf` is identical to the pre-F23 policy.
- **AC-121 (P0) (ref)** With the flag `mock`, the empty state of `/merge-pdf` and `/rotate-pdf` shows a sources trigger next to Choose files. Opening it lists Google Drive, Dropbox and OneDrive as `menuitem`s, each with a visible name and a drawn icon (every icon image has `naturalWidth > 0` on first open).
- **AC-122 (P0) (ref)** On `/merge-pdf` in the ready state (alpha loaded), the add-files control offers the same three providers, and picking `bravo.pdf` from Dropbox there appends it after alpha.
- **AC-123 (P1) (ref)** On `/merge-pdf`, "Add pages from a file" offers the three providers; picking `bravo.pdf` from Google Drive opens the page picker showing its 2 pages, and inserting them puts them at the chosen position.
- **AC-124 (P1) (beat)** With the flag `live` and only one provider configured (the others have no client ID), the menu shows only that provider.
- **AC-125 (P0) (beat)** Loading `/merge-pdf` with the flag `mock` or `live` makes zero requests to any origin other than our own until a provider entry is chosen.

### Privacy and policy

- **AC-126 (P0) (beat)** Full mock run on `/merge-pdf` (open the menu, pick alpha and bravo from Google Drive, merge, download): every request to our origin is a `GET` for a static asset or page; there are **0** non-GET requests to our origin, and no request URL, header or body sent to our origin contains `MOCK-TOKEN-F23`, a provider file ID, or bytes of the fixture.
- **AC-127 (P0) (beat)** The tool page's CSP with the flag `mock` or `live` still has `frame-ancestors 'none'`, no `'unsafe-inline'` or `'unsafe-eval'` in `script-src`, and no wildcard or scheme-only source (`*`, `https:`, `http:`) in `script-src`, `connect-src` or `frame-src`. Every non-self host in it is listed in this spec's provider allow-list (added in step 2).
- **AC-128 (P0) (beat)** With the flag `mock`, no `<script>` element whose `src` is outside our origin exists in the tool page's document at any time during a pick (checked after each step).
- **AC-129 (P1) (beat)** After a mock pick and a page reload, `localStorage`, `sessionStorage`, IndexedDB and `document.cookie` contain no `MOCK-TOKEN-F23`.
- **AC-130 (P1) (beat)** Choosing a provider entry opens the provider window directly, with no consent modal in between (one click from the open menu to the picker). The menu shows one line saying that the provider opens in its own window and the file comes straight to this device.
- **AC-131 (P2) (beat)** After a file is added from a provider, the tool's privacy note still says the file was not uploaded to us, and names the provider it came from.

### Picking and downloading

- **AC-132 (P0) (ref)** Mock Google Drive, pick `alpha.pdf`: the tool reaches the ready state with a card named `alpha.pdf`, 3 pages, and a rendered first-page thumbnail.
- **AC-133 (P0) (ref)** On `/merge-pdf`, the mock picker is opened with multi-select on; picking alpha, bravo and echo in one go adds 3 cards, ordered by the same rule as a local first batch (F3 §2).
- **AC-134 (P0) (beat)** The picker's multi-select follows the registry: on `/rotate-pdf` (up to 20 files) the recorded picker request has `multiple: true`; on a tool registered with `multiple: false` it has `multiple: false` and only one file can be chosen.
- **AC-135 (P0) (ref)** The recorded picker request's accepted types equal the tool's registry `accept` list (Rotate: PDF only; Merge: PDF plus the image types).
- **AC-136 (P0) (ref)** While `alpha.pdf` downloads from the throttled mock, its slot shows the file name and a progress value that rises from 0 to 100 (`aria-valuenow` changes at least twice) before the thumbnail appears.
- **AC-137 (P1) (beat)** Picking 3 files where one is throttled: the two fast files show thumbnails before the slow one finishes.
- **AC-138 (P1) (beat)** Pressing Cancel on a downloading item removes it; the other picked files still load, and no card is left for the cancelled file.
- **AC-139 (P1) (ref)** Mixed sources on `/merge-pdf`: alpha (local), bravo (Google Drive), echo (Dropbox) and `charlie.png` (OneDrive) merge into one PDF whose page count is the sum of the inputs and whose extracted text follows the card order.
- **AC-140 (P0) (ref)** Output equivalence: rotating `alpha.pdf` 90° clockwise on `/rotate-pdf` after picking it from the mock gives an output with the same page count, the same `/Rotate` values and the same extracted text as the same task on the locally picked file.
- **AC-141 (P2) (ref)** Mock Google Drive returns a native Google document "Plan": it arrives as `Plan.pdf` with its pages rendered; an export over the provider's limit shows a named message.

### Errors and limits

- **AC-142 (P0) (beat)** Closing the mock provider window without picking returns to the previous state, focus goes back to the sources trigger, no message is shown, no second provider window opens, and the console has no error.
- **AC-143 (P0) (beat)** When the mock simulates a blocked popup, an inline message names the provider and offers "Try again"; clicking it opens the provider window. No native dialog (`alert`, `confirm`) appears.
- **AC-144 (P1) (beat)** When the mock simulates an unreachable provider, an inline message names the provider; Choose files still opens the file chooser, and a drop still adds a file. No native dialog appears.
- **AC-145 (P1)** When the mock simulates denied access, an inline message says access wasn't given, with Try again.
- **AC-146 (P0) (ref)** Picking `notes.txt` with `alpha.pdf` from the mock shows the same wrong-type message as a local pick, naming `notes.txt`; alpha stays loaded.
- **AC-147 (P0) (beat)** A mock file that reports 101 MB is rejected with a message naming it and "100 MB", and the mock records **no** download request for it.
- **AC-148 (P1) (ref)** Picking 51 files from the mock on `/merge-pdf` loads 50 and shows the same over-the-cap message as local intake (F1 AC-18 adapted).
- **AC-149 (P0) (ref)** Picking `user-pw.pdf` from the mock opens the password dialog named `user-pw.pdf`; the right password unlocks it as for a local file.
- **AC-150 (P1) (beat)** A mid-download failure on one of two files marks only that file as failed, with Retry; Retry downloads it without opening the picker again, and the file then loads.
- **AC-151 (P1) (ref)** A mock file that answers 403 shows a message that the file can't be opened from the provider, naming it; other files stay.
- **AC-152 (P1)** Picking `corrupt.pdf` from the mock shows the same corrupt-file message as local intake (F1 AC-13).

### Accessibility, phone and polish

- **AC-153 (P1) (beat)** Keyboard: the trigger has `aria-haspopup="menu"` and `aria-expanded`; Enter or ArrowDown opens the menu with focus on the first item; arrows move; Escape closes it and returns focus to the trigger; Enter on an item opens that provider.
- **AC-154 (P1) (beat)** Live region: starting a download announces the file and provider, and finishing announces that the file was added (text appears in an `aria-live` region).
- **AC-155 (P1) (beat)** At 390×664, the sources trigger and every menu item are at least 44 px tall, and the open menu fits within the viewport with no horizontal scroll.
- **AC-156 (P1) (beat)** At 390×664 on the empty state, the sources trigger is visible without scrolling (M12).
- **AC-157 (P1)** axe reports no violations with the menu open, while downloading, and with a provider error shown.
- **AC-158 (P1)** After a successful pick, focus moves to the first new card (or the tool's first focus target in the ready state), not back to the trigger.
- **AC-159 (P1)** Lighthouse mobile performance on `/merge-pdf` with the flag on stays at 90 or more (median of 3), and the provider code is not in the page's first-load JavaScript.

### Save to cloud (result screen, second phase)

- **AC-160 (P2) (ref)** With the flag `mock`, the result screen offers Save to Google Drive and OneDrive for configured providers. Dropbox save is not offered (product decision 2026-11-24: the Dropbox Saver needs a public URL; see research §4).
- **AC-161 (P2) (ref)** Saving to the mock records an uploaded file whose name equals the Download name and whose bytes equal the downloaded file, and a confirmation names the provider (with a link to the folder where the provider supports it).
- **AC-162 (P2) (beat)** During the save, 0 non-GET requests go to our origin and no request to our origin contains `MOCK-TOKEN-F23`.
- **AC-163 (P2) (beat)** A cancelled or failed save shows an inline, named message; Download still works; no native dialog appears.
- **AC-164 (P2) (beat)** Saving when a file with the same name already exists in the mock folder does not overwrite it silently (the new file gets a different name, or the user is asked).

### UI (step 3)

- **AC-165 (P1) (beat)** Cloud row: with the flag `mock`, the empty state of `/rotate-pdf` and `/merge-pdf` shows, under the upload button, one 44×44 px button per configured provider (accessible name "Choose from <provider>", same text as `title`). One click opens that provider's window directly (no menu in between). The row is in the server HTML at its final height: the Layout Instability API reports **0** layout shift on the drop card from page load to 3 s after hydration, with and without a stored last-used source.
- **AC-166 (P1) (beat)** Last used: after a successful mock pick from Dropbox and a reload, `localStorage["berrypdf:cloud-last"]` is exactly `"dropbox"`, the row's first button shows the visible label "Dropbox" (accessible name ends with "(last used)"), and one click on it opens the Dropbox window. A cancelled pick does not change the value; a local pick sets `"device"` and shows no label; a stored provider that is no longer configured is ignored. The key holds nothing but that word.
- **AC-167 (P1) (beat)** Phone sheet: at 390×664 and 360×640, every source menu (empty-state caret, the working "+ Add") opens as a sheet whose bottom edge is above the dock's top edge; the primary action stays fully visible and uncovered (`elementFromPoint` at its centre is the primary); every row is at least 48 px tall; Escape or a tap outside closes it and focus returns to its trigger. On Merge, "Pages from a file" opens its source list in place, with "Back" as the first item.
- **AC-168 (P1) (beat)** `/cloud/<provider>` window: on load the `h1` is the provider name and (Google, Dropbox) the one berry button is focused; the privacy line "… straight to this browser. We never see them or your sign‑in." is visible; at 480×640 and 390×664 the button and the privacy line are on screen without scrolling. While downloading, each file has a `progressbar` with `aria-valuenow`. After the hand-off the window closes by itself. When the tool tab stops answering, the window shows the "lost its tool" state within 5 s. Escape cancels and closes. axe reports no violations in the before, downloading, done and error states.
- **AC-169 (P2) (beat)** Save button: on the result screen Download stays the only berry fill and keeps the initial focus; next to it one `line` split reads "Save to Drive" (or "Save to OneDrive") after a pick from that provider, otherwise "Save to…" opening the provider menu. During the save it shows "Saving… N%" without changing width; on success a floating success alert names the provider and the final file name with an "Open in Drive" or "Open in OneDrive" link. At 1366×657 and 390×664, Download and the Save control are both fully visible without scrolling.

## 8. Decisions to review

- **D-1 Web address (URL) import.** The reference has it, but the evaluation's M2 lose names only the three cloud providers. A client-only fetch of any address needs `connect-src https:` (which voids our CSP claim) and still fails on hosts without CORS headers. Options: (a) leave it out of F23 and record why in the M2 comparison; (b) accept only share links from the three providers and turn them into a provider pick; (c) build it with the server worker (F6+) with SSRF hardening and honest "uploaded" copy. Analyst's suggestion: (a) now, (b) as a P2 follow-up.
- **D-2 No consent modal.** The reference asks before loading each provider's script because the script runs inside its page. If step 2 keeps provider code out of our page (in the provider's own window or a sandboxed origin), opening the provider's window is consent enough (AC-130). If the design has to load provider code into our page, AC-130 must change to a short prompt like the reference's, and C-1 has to be justified.
- **D-3 COOP.** Popup-based pickers need the opener link. `same-origin-allow-popups` on tool pages (or on a dedicated picker route) is probably needed; it is a policy change and belongs in the step 2 design and in the privacy page text.
- **D-4 Recent files from Drive** (the reference's hidden "Recent files" block, which reads its own Drive folder). Out of scope for F23.
- **D-5 Save to cloud** (AC-160 to AC-164) can ship as a second phase. M2 needs only the pickers.
- **D-6 Provider app review.** Google's `drive.file` scope with the Picker avoids the restricted-scope security audit; OneDrive should ask for the narrowest scope that works (the reference asks `Files.Read.All`); the Dropbox Chooser needs no token. Production client IDs and verified domains are owner tasks (secrets per CLAUDE.md rule 6; client IDs are public but still configured, not committed).


### 8a. Decisions made (lead/PM, 2026-11-24)

- **D-1:** no Web address entry in F23 (option a). Provider share links are a P2 follow-up. Recorded as a known gap in the M2 comparison.
- **D-2:** no consent modal. Provider code never runs on a tool page; the click on a provider is the user's action. The `/cloud/<provider>` window shows a one-line disclosure *before* the provider script loads.
- **D-3:** tool pages keep the strict CSP and COOP `same-origin` byte for byte (a test asserts it). Only `/cloud/<provider>` routes get a per-provider CSP (hosts in research §2.1) and COOP `same-origin-allow-popups` (Dropbox, Google) or `same-origin` (OneDrive). Files return over `BroadcastChannel('cloud:<random uuid per request>')`; the tool page validates message shape, size and type, drops anything unexpected, and runs received files through the same intake checks as a local file.
- **D-4:** Drive "recent files" out of scope.
- **D-5:** Save to Google Drive and Save to OneDrive ship in this PR (browser upload). Dropbox save is skipped (the Saver needs a public URL); this is a recorded gap against the reference. The save button always names its destination, and the result screen's "never uploaded" line changes once a save happens so it stays true.
- **D-6:** narrowest scopes: Google `drive.file`, OneDrive `Files.Read` (+ `Files.ReadWrite` only when saving, requested at save time), Dropbox Chooser needs no token. Public client IDs come from `NEXT_PUBLIC_*` env/config; nothing secret is needed client-side.
- **Licenses (CLAUDE.md rule 3):** the rule covers code we ship or bundle. Dropbox's `dropins.js` and Google's `api.js` / `gsi/client` are loaded at runtime from the provider's own origin inside the isolated `/cloud` window: that is use of their service, not a dependency. `@azure/msal-browser` (MIT) is bundled, pinned to an exact version and listed normally. /privacy gets a short "Third-party services" note naming Dropbox Chooser, Google Picker / Identity Services and Microsoft sign-in.
- **Flag:** `NEXT_PUBLIC_CLOUD_SOURCES=1` turns the feature on; each provider shows only when its public ID is set. `/cloud/mock` (flag-gated, never in production builds without the flag) returns fixture files through the same protocol for CI.

## 9. Screenshot index (internal, `docs/specs/assets/f23/`)

01 Merge empty 1280 · 02 upload caret menu 1280 (two icons missing) · 03 third-party prompt for Dropbox · 04 Dropbox sign-in popup · 05 page while the Dropbox popup is open · 06 after closing the Dropbox popup (no message) · 07 third-party prompt for Google · 08 Google sign-in popup · 09 after closing it · 10 Microsoft sign-in popup · 11 after closing it · 12 URL modal · 13 URL modal, invalid address · 14 right after submitting a `.html` address · 15 wrong-type banner for that address · 20 Merge empty 390 · 21 upload caret menu 390 · 22 third-party prompt 390 · 23 URL modal 390 · 30 Merge "Add files" menu 1280 · 31 "Add pages" menu 1280 · 32 "Add files" menu 390 · 40/41 editor landing and menu 1280 · 42/43 editor landing and menu 390.

## UI

Step 3 (UX), 2026-11-24. Visual values come from `docs/design/berrypdf.md`. This section covers layout, components, states, copy, keyboard and motion. It follows the product decisions of 2026-11-24:
- The tool page keeps its strict CSP, and no consent modal appears on it.
- Each provider opens in its own same-origin `/cloud/<provider>` window: a popup of about 480×640 on desktop, a new tab on phones. The window hands the files back over BroadcastChannel.
- Providers: Google Drive, Dropbox, OneDrive. There is no web-address entry.
- The last used source is remembered.
- Save goes to Drive and OneDrive only.
- Everything is hidden when the flag is off or a provider has no key.

**Mockups** are real renders. Each one starts from a snapshot of the running app (real CSS, sprite, Fredoka, thumbnails) with the F23 pieces injected.
- HTML: `docs/specs/assets/f23/mockups/` (`NN-*.html`, the `cloud-*.html` window pages, and `css/f23.css`, which is the proposed component stylesheet).
- Tooling: `capture-base.cjs` snapshots `pnpm dev`, and `build.cjs` builds the mockups and renders the PNGs at 2× into `/mnt/project-files/designs/cloud-pickers/`. The provider marks in the mockups are simplified placeholders (see U-10).

### U-1. Principles

1. **Cloud is one tap from arrival, never a detour.** The reference hides cloud behind a caret, then a consent dialog, then a popup. We show the three provider marks under the upload button: one tap opens the provider, and the caret menu is still there for keyboard, screen reader and repeat use. The last used provider gets its name beside its mark.
2. **The tool page never changes shape.** The cloud row is in the server HTML at its final height. Waiting and errors float (NoticeStack). Download cards use the size of the card they become. Result: no layout shift.
3. **The primary action never leaves the screen.** On phones every source menu is a sheet that rises from the top edge of the dock and never covers it.
4. **Honest and short.** There is one privacy line at the point of choice ("Files come straight to this device.") and one in the provider window. Everything else goes in tooltips or sr-only text.
5. **Same pattern everywhere.** The same split, row, menu, sheet and download card appear in every tool, in Merge's Add menus and in the editor later.

### U-2. Entry points

| # | Where | Control | Contents | Mockup |
|---|---|---|---|---|
| E1 | Empty state of every tool (DropCard) | **Split upload button**: the main half picks from the device; the **caret** (52 px) opens the source menu. Under it, the **cloud row**: one button per provider, with the last used one first and labelled | Menu: Google Drive, Dropbox, OneDrive + footnote | 01, 02, 03 |
| E2 | Working toolbar, "Add files" (or "Replace file" on single-file tools), ≥ 640 px | Tool-style split: "+ Add files" and a 36 px caret | Same menu | 04 |
| E3 | Merge "Add pages" menu, ≥ 640 px | Existing MenuButton, now with a group | Group "From a file": This device, Google Drive, Dropbox, OneDrive · separator · Blank page · footnote | 05 |
| E4 | Working toolbar below 640 px, **every tool** (today only Merge has it) | One "+ Add" button (44 px) that opens the **sheet** | Group "Files": This device + providers. Merge adds group "Pages": "Pages from a file ›" (in-place submenu: Back, This device + providers) and "Blank page". Single-file tools title the group "Replace with" | 06, 07 |
| E5 | Result screen | "Save to Drive" `line` split next to Download (U-8) | Google Drive, OneDrive | 18–21 |
| E6 | `/edit-pdf` landing (**later**, after PR #25 merges) | Same as E1 on the editor's landing card. Inside the editor, "Open" or "Add" in its toolbar gets the E2 split | Same | none yet |

Order is fixed: Google Drive, Dropbox, OneDrive, so muscle memory holds. A menu that reordered itself would break that. Only the cloud row puts the last used provider first. Providers without a key are absent everywhere. With no provider configured, there is no caret, no row and no Save control, and the DOM and CSP are exactly as before F23 (AC-120).

### U-3. Layout and first-screen fit

**Budget.** No new row is added to the page head. The cloud row lives **inside** the drop card: 44 px plus a 12 px gap. The card has room for it.
- **1366×657:** `--ip-work-h` = 657 − 64 − 76 − 20 = 497. The card grows from about 300 to 356 px inside that area, and the options panel and its primary action are unchanged (mockup 03-1366x657).
- **390×664:** the card's bottom sits at 457 px and the dock's top at 534 px, so 77 px are left. Nothing is covered (03-390x664).
- **360×640:** about 50 px are left (computed from the same rows).

| Viewport | Empty state (E1) | Working (E2–E4) | Result (E5) |
|---|---|---|---|
| ≥ 1024 (1280×720, 1366×657, 1920×969) | Card is centred in the drop area as today. Split ≈ 366 px wide (main + 52 px caret). Row centred under it. Menu is a popover anchored bottom-end to the caret, min 248 px wide, 40 px rows (44 px on coarse pointers), and it flips above when there is no room (`Menu.position`) | Tools row: `[+ Add files][⌄]` sits where Add files is today. Merge keeps `Add pages ⌄` after it. Pages area and bottom bar unchanged | Save split sits right of Download on the same row (44 px tall, centred on the 56 px Download) |
| 768 (640–1023) | Same card above the bottom dock. Menu is a popover | Same as desktop toolbar, page scrolls, dock fixed | Same row; wraps under Download if narrow |
| < 640 (390×664, 360×640, 412×839) | Split spans the card (main + 52 px caret, both 56 px tall). Row of 44 px targets. The caret opens the **sheet** | Toolbar: Tabs, Sort, "+ Add" (44 px). "+ Add" opens the **sheet** | Download full width, then the Save split full width (main grows, caret 52 px), then Share |

**Sheet (< 640 px).**
- Placement: `position: fixed`, 8 px from the sides, `bottom = --ip-dock-actual + 8px`, radius 20, white, 1.5 px sand border, `shadow-menu`, padding 8.
- Rows are 48 px, with group labels of 13/18 600 muted.
- Scrim: berry backdrop at 16% over the page **above** the dock only. The dock and its primary stay uncovered and live.
- Height: `max-height: calc(100dvh - var(--ip-dock-actual) - 72px)`. It scrolls inside if needed (the Merge sheet is 8 rows, about 410 px, and fits 360×640).

**Sticky search bars.** Not applicable: F23 adds no long searchable list (the providers' own pickers handle browsing).

### U-4. Components

New, in `apps/web/src/components/cloud/` with one local stylesheet, `cloud.css` (proposal: `mockups/css/f23.css`). **Nothing goes in `globals.css`**, and nothing loads on pages that don't import it.

```
useCloudSources()            providers configured for this build (flag + NEXT_PUBLIC_* ids), last-used read/write
openCloudSource(p, opts)     sync window.open + BroadcastChannel protocol (research §3.1); returns File[] | 'cancelled' | error
SourceSplit                  caret beside FilePicker's main button (fills FilePicker's existing `sources` slot)
  └─ SourceMenu              Menu with provider items, optional groups, footnote; popover ≥ 640, sheet < 640
CloudRow                     the one-tap provider buttons under the upload button (server-rendered)
ProviderMark                 inline SVG mark per provider (official artwork, see U-10)
CloudNotices                 waiting / blocked / unreachable / denied / offline → NoticeStack entries
DownloadCard                 placeholder card or tile with jam progress, Stop, Retry (FileGrid, SegmentGrid, PageGrid)
SaveToCloud                  result-screen split + menu + progress + alerts
app/cloud/[provider]/page    the window: CloudWindow (header, card, states), per-route CSP/COOP (research §2)
```

Changes to existing pieces:
- **`ui/Menu.tsx`**:
  - add `{ group: string, items }` entries (rendered as `role="group"` with `aria-label`, plus a visible label);
  - add a `footnote` prop, rendered **outside** the `role="menu"` element inside the same popover and wired through `aria-describedby`, because a `<p>` inside `role="menu"` is not a valid child;
  - add a trailing icon slot;
  - add `presentation="auto"`: a sheet below 640 px, positioned over the dock;
  - add an in-place submenu (`aria-haspopup="menu"` item that swaps the list, with "Back" first);
  - existing behaviour (popover, arrows, type-ahead, Escape/Tab) is unchanged.
- **`FilePicker`**: the `sources` slot holds `SourceSplit`. The main button loses its end radius only when the slot is filled. The row renders after the picker inside `DropCard`.
- **`ToolFlow`**: `phoneAddMenu` becomes the default for every tool when any provider is on (E4). File arrivals from the cloud go through the same `intake()` as local files (same caps, messages, password dialog and focus rule, AC-146 to AC-158). Download cards are entries with `status: "downloading" | "failed"`.
- **`Notice`**: an inline action variant (the action button sits on the alert's row, before the close). Waiting, blocked, unreachable, denied and saved alerts use it.
- **`ResultCard`**: the `SaveToCloud` slot sits after Download. `PrivacyNote context="result"` names the provider when any input came from the cloud (AC-131).

### U-5. States

| State | Tool page | Cloud window | Mockup |
|---|---|---|---|
| Closed (rest) | Split + row. With a last used cloud provider, its mark carries its name (chip) and comes first | none | 03 |
| Menu open | Popover (≥ 640) or sheet (< 640). The caret's chevron turns up. First item focused | none | 01, 02, 04–07 |
| Opening / waiting | Floating info alert with a spinner: "Waiting for Google Drive…" and an inline Cancel. The drop card, Choose files and drop keep working. Picking another provider replaces the wait (the old window gets `cancel`) | Before tap: provider mark, `h1`, berry button "Open Google Drive" (focused), privacy line, close × (Google and Dropbox need this tap for their SDK). OneDrive: "Connecting…" with no tap. Google: "Signing in…" + "Finish in the Google window." | 08, 09, 11, 12 |
| Picking | Same wait alert | The provider's own picker fills the window under our 52 px header (provider UI, not ours) | 12 |
| Popup blocked | `window.open` returned `null`: a warning alert (blueberry): "Your browser blocked the Google Drive window." / "Allow pop-ups for this site." + **Try again** (focused, a fresh gesture). No window | none | 13 |
| Cancelled | Nothing visible. The wait alert disappears and focus returns to the control that started it (once the tab regains focus). No second window. Cards of unfinished files are removed | Closes itself (× , Escape, Cancel, or the provider's cancel) | none |
| Downloading | On the first `progress`, the wait alert goes and the flow enters its loading state: from empty it goes straight to the working layout (pages get the screen). One **DownloadCard** per file at its final size: a white page with the provider mark, a 12 px jam bar + "42%", the name, "1.4 of 3.3 MB" (muted), and × "Stop downloading". Status: "Getting 2 files from Google Drive…". Primary disabled with the same rule as local loading. Files that finish turn into thumbnails in place (300 ms ease-in) while others still load | "Getting 3 files": one row per file (name, meta, jam). Skipped files say why in brick red. "Keep this window open until it closes by itself." + Cancel | 14, 15, 10 |
| Too big / wrong type / too many | Same grouped danger alert as local intake ("2 files were skipped" + one line per file, same strings). Too big is checked **before** download, so there is never a card for it | Row says "Over 100 MB, skipped" / "Wrong type, skipped" | 16, 10 |
| Not accessible (403) | In the same skipped alert: "budget.pdf can't be opened from Google Drive. Check that you can open it there." | Row "Can't open, skipped" | 16 |
| Download failed mid-way | That card turns failed: a brick error icon on the page, a `line` **Retry** button, meta "Download stopped" in brick red, × "Remove". The others continue. Retry re-downloads without the picker (AC-150) | Row "Stopped" + Retry if the window is still open | 14 |
| Provider unreachable | Danger alert: "Couldn't reach Dropbox." / "Files on this device still work." + Try again | Card: "Couldn't reach Dropbox" + Try again | 16 |
| Access denied | Warning alert: "OneDrive access wasn't given." / "We can only open files you allow." + Try again | Card: "Access wasn't given" + Try again | 16, 12 |
| Offline | `navigator.onLine === false` at the click: no window opens. Info alert: "You're offline." / "Google Drive needs a connection. Files on this device still work." Mid-download loss = the failed card | none | 17 |
| Tool tab gone | none | Heartbeat lost: "This window lost its tool" + Close window | 12 |
| Success | Cards become normal cards. Live: "<name> ready, N pages". Focus moves to the first new card (quiet focus after a pointer pick). The last used source is written. No extra toast | Tick + "Added to Merge PDF", then it closes after 600 ms. If the browser refuses `close()` after 1.5 s: "You can close this window." | 12 |

### U-6. Copy (our own words; strings in `components/cloud/copy.ts`)

| Key | Text |
|---|---|
| Caret (aria-label = title) | "Choose from Google Drive, Dropbox or OneDrive" (built from the configured list). Toolbar: "Add files from …"; single-file tools: "Replace from …"; result: "Save to another cloud" |
| Row button | aria "Choose from Dropbox", title "Dropbox". Chip: visible "Dropbox", aria "Choose from Dropbox (last used)", title "Last used" |
| Menu item | "Google Drive" + sr-only ", opens a new window"; "This device"; "Blank page"; "Pages from a file"; group labels "From a file", "Files", "Pages", "Pages from", "Replace with"; "Back" |
| Menu footnote | "Files come straight to this device." (save menu: "Goes from this device to your cloud.") |
| Waiting | "Waiting for Google Drive…" · Cancel |
| Blocked | "Your browser blocked the Google Drive window." · "Allow pop-ups for this site." · Try again |
| Unreachable | "Couldn't reach Dropbox." · "Files on this device still work." · Try again |
| Denied | "OneDrive access wasn't given." · "We can only open files you allow." · Try again |
| Offline | "You're offline." · "Google Drive needs a connection. Files on this device still work." |
| Not accessible | "{name} can't be opened from Google Drive. Check that you can open it there." |
| Too big / type / count / corrupt | The F1 intake strings, unchanged |
| Card | "{x} of {y} MB" · "{n}%" · "Download stopped" · Retry · "Stop downloading {name}" / "Remove {name}" |
| Status | "Getting {n} file(s) from Google Drive…" |
| Live region | "Opening Google Drive in a new window" · "Downloading {name} from Google Drive" · F1 `fileReady` · "Download of {name} stopped" |
| Result privacy (AC-131) | "Done on this device, straight from Google Drive. Never uploaded." |
| Window | title `{Provider} · BerryPDF`; `h1` "{Provider}"; "Open Google Drive" / "Open Dropbox"; "Connecting…"; "Signing in…" + "Finish in the Google window."; privacy "Files go from {Provider} straight to this browser. We never see them or your sign‑in." (non-breaking hyphen); "Getting {n} files"; "Done"; "Over 100 MB, skipped"; "Wrong type, skipped"; "Can't open, skipped"; "Keep this window open until it closes by itself."; Cancel; "Added to {Tool}"; "This window closes by itself."; "You can close this window."; "Access wasn't given" + "We can only open the files you pick and allow."; "Couldn't reach {Provider}" + "Check your connection and try again."; "This window lost its tool" + "The BerryPDF tab that opened it was closed or reloaded. Close this window and start again from the tool." + "Close window"; × aria "Cancel and close" |
| Save | "Save to Drive" · "Save to OneDrive" · "Save to…" · "Saving… {n}%" · "Saved" · alert "Saved to Google Drive as {name}." + "Open in Drive" · "Couldn't save to Google Drive." / "Download still works." + Try again · window "Saving to Google Drive" + "Goes from this browser straight to your Drive. We never see it." |

### U-7. Keyboard, focus, ARIA, screen readers

- **Tab order in the empty state**: `h1` → Choose files → caret → row (chip first, then each mark; three tab stops) → options → primary.
  - The row is `role="group"` `aria-label="Cloud storage"`, made of real `<button>`s with names.
  - The marks are `aria-hidden` SVGs.
- **Caret (menu button pattern)**:
  - It has `aria-haspopup="menu"`, `aria-expanded` and `aria-controls`.
  - Enter, Space or ↓ opens the menu with focus on the first item; ↑ opens it on the last.
  - In the menu: ↑/↓ wrap, Home/End, type-ahead (G, D, O, T, B); Enter or Space activates.
  - Escape closes and returns focus to the caret; Tab closes and moves on.
  - The menu is `aria-describedby` the footnote.
- **Activation opens the window inside the key or click handler** (user activation), synchronously, before any `await`. The live region says "Opening Google Drive in a new window".
- **Submenu (sheet)**: "Pages from a file" has `aria-haspopup="menu"`. Enter or → swaps the list in place with focus on "This device". "Back", ← or Escape returns, with focus on "Pages from a file".
- **Focus while a window is open**: the page doesn't move focus, because the window has it.
  - On cancel, focus goes back to the opener control when the tab regains focus (`window` `focus` event), never while the popup is in front.
  - On success it goes to the first new card (AC-158).
  - On blocked it goes to "Try again" (a direct result of the user's click). Asynchronous errors don't move focus: their alerts use `role="alert"` (danger and warning) or `role="status"` (info and waiting).
- **DownloadCard**:
  - Stays `role="listitem"` with `aria-busy="true"`.
  - Contains `role="progressbar"`: `aria-label="Downloading plan.pdf"`, `aria-valuenow`, `aria-valuetext="42%, 1.4 of 3.3 MB"`. Updates are announced through the live region at most every 25%.
  - Its main action is disabled. Stop/Remove and Retry join the card's roving focus.
  - Failed cards add `aria-describedby` pointing to "Download stopped".
- **Cloud window**:
  - On load, focus is on the berry button (an Enter key press is the gesture the SDK needs).
  - Tab order: button → close ×. Escape = cancel and close. The `h1` is the provider name.
  - While downloading, the card is `aria-busy` with one progressbar per row and a polite live region ("alpha.pdf done").
  - Done state: the `h1` is focused, then the window closes.
- **Save split**: Download (initial focus, unchanged) → "Save to Drive" → caret "Save to another cloud" → Share. The busy state has `aria-busy`, and its label carries the percent.
- **Sheet**: the `role="menu"` sits in a top-layer popover. A tap on the scrim closes it. The dock behind stays interactive and outside the scrim.

### U-8. Phone behaviour

- **Targets**: caret 52×56, row and chip 44, sheet rows 48, toolbar "+ Add" 44, Save caret 52×44, window buttons 56.
- **Window as a tab**: `window.open` without features opens a tab.
  - When the tab closes after the hand-off, the browser returns to the tool tab. This needs real-device checks on iOS Safari and Android Chrome (**[U]**, research §7.4).
  - If the browser keeps the user in the closed tab's place, the done card says "You can close this window."
- **Background throttling**: while the tool tab is hidden, its timers are throttled. It must not treat late heartbeats as "closed" while `document.hidden`; it re-checks on `visibilitychange`.
- **Google sign-in** opens a nested tab on phones (**[U]**). The window's "Finish in the Google window." line covers it.
- **Phone first screen with the cloud row**: 03-390x664, with 77 px to spare above the dock.

### U-9. Motion (CSS only, every entrance ≤ 400 ms, all off under `prefers-reduced-motion`)

- Caret chevron turns 180° in 200 ms. The popover menu scales in over 150 ms (existing `mp-menu`). The sheet pops in with the small overshoot in 300 ms.
- Row marks get the band disc on hover (200 ms) and press to 0.92 (120 ms). The row has **no** entrance animation: it is part of the card's existing pop-in.
- Waiting spinner: one turn per 0.8 s. Under reduced motion it becomes a still ring that pulses, like the F1 U-4 busy indicator.
- Download card: the jam width eases over 500 ms (existing). On arrival the placeholder cross-fades to the thumbnail in 300 ms (`mp-thumb-in`), at the same size.
- Cloud window card pops in over 380 ms. The done tick pops in 400 ms after a 160 ms delay, then the window closes after 600 ms.
- Save label swaps keep a fixed min-width (no reflow). The "Saved" tick pops in over 200 ms and the label returns to "Save to Drive" after 3 s.
- **Open item (not F23):** the shared floating alert drops in over 0.9 s (BerryPDF motion.md), which is longer than the owner's 400 ms cap. F23 reuses it unchanged; a design-system fix should shorten it for every notice.

### U-10. Provider marks, contrast, forced colours

- **Marks**: each provider's official mark from its brand kit (Google Drive product icon, Dropbox glyph, OneDrive icon).
  - Inline SVG in `ProviderMark`, so it draws on first paint and needs no extra request or `img-src` change.
  - Full colour at 20 px (menus), 22 px (row) and 56 px (window), on **no** tile or box (owner rule). They are the only multi-colour icons in the product; we keep them because the providers' brand rules ask for unaltered marks and because colour is how people recognise them.
  - The builder confirms each brand kit's terms and records them in THIRD-PARTY-NOTICES as trademarks (not code).
  - The mockups use simplified placeholders.
- **Contrast** (on top of the measured table in berrypdf.md):

| Pair | Ratio |
|---|---|
| Menu text (ink on white / brand-strong on band when focused) | 12+ / 6.0 |
| Footnote, group labels, card meta (muted on white / page tray) | 5.45 / 4.85 |
| "Download stopped" and skipped rows (danger on tray / white) | 7.2 / 7.89 |
| Chip text (ink on band) | 12.0 |
| Caret chevron (white on brand) | 4.78 |
| Line button label and edge (brand-strong / brand on white) | 6.78 / 4.78 |
| Tool split (blueberry ink) | 7.71 |
| Focus ring (`link` on white / band) | 5.15 / 4.9 |

  The caret's white seam is decorative. The marks are logos, and each comes with its name in text, as a label or an accessible name.
- **Forced colours**: the chip and row buttons get a 1 px `ButtonText` border; the sheet and menu keep the existing popover border; the scrim is hidden; the marks stay as images.
- **Dark mode**: not shipped (light only, as the rest of the product).

### U-11. Beats the reference (for the M2 / M5 / M9 / M11 / M12 evaluation)

| Check | Reference | BerryPDF |
|---|---|---|
| Clicks to a provider on arrival | caret → provider → consent → popup (3) | mark → window (1); caret → provider → window (2) |
| Accessible name of the trigger | "Toggle Dropdown" | "Choose from Google Drive, Dropbox or OneDrive" |
| Icons on first open | Drive and OneDrive missing | inline SVG, always drawn |
| Phone targets | 37 px rows | 48 px rows, 44 px marks |
| Cancel / blocked / failure | silence, a second sign-in window, or `alert()` | silent cancel with focus restored; inline named alerts with Try again |
| Progress | indeterminate (server fetch) | per-file percent and MB, on the page and in the window |
| Privacy | the reference's server gets the link and the token | "Files come straight to this device." Verifiable: the tool page CSP is unchanged |
| First screen | menu over the fold area; no cloud hint | cloud row inside the card; primary visible in every state (screenshots at 1366×657 and 390×664) |

Side-by-side: `22-menu-reference-vs-berrypdf.png`.

### U-12. Notes for the engineer

- The **cloud row is server-rendered** with all configured providers, each button holding the mark plus a hidden name.
  - A hashed pre-paint `<head>` script (same pattern as `recentPrepaintScript`) reads `berrypdf:cloud-last` and sets `<html data-cloud-last="dropbox">`.
  - `cloud.css` then shows that provider's name and moves it first (`order: -1`).
  - The result is no hydration difference and no shift (AC-165, AC-166). Store only the provider word; `"device"` after a local pick.
- Before `window.open`, compute everything synchronously: nonce, channel, URL with `accept` and `multiple` from the registry. Only one cloud window per tab at a time.
- `cloud.css` is imported by the cloud components, so it ships only on tool routes and `/cloud/*`, never in the site-wide CSS budget (AC-55 of F2).
- The `/cloud/<provider>` page uses the BerryPDF tokens and Fredoka from our origin. It shows no site header nav and no footer, just a 52 px top row (mark, "BerryPDF · {Provider}", ×).
- Mock provider (`/cloud/mock`): the same window chrome and states as the real ones, plus the test buttons (Pick, Cancel, Fail one, Slow), so the visual states are testable in CI.
- Viewport fit: add the empty state with the row, the open sheet, a downloading card and the result with Save to `e2e/ui/viewport-fit.spec.ts` for both mock tools.

### U-13. Screenshots (`/mnt/project-files/designs/cloud-pickers/`, 2× renders)

| File | Shows |
|---|---|
| `01-first-screen-source-menu-1280x720.png`, `-1366x657.png` | Merge empty state, caret menu open (first visit: marks without labels) |
| `02-first-screen-source-sheet-phone-390x844.png`, `-390x664.png` | Phone empty state, the same menu as a sheet above the dock |
| `03-first-screen-last-used-chip-1366x657.png`, `-390x664.png` | Rotate empty state, last used Dropbox as a labelled chip; fit check |
| `04-add-files-menu-1280x720.png`, `-1366x657.png` | Working toolbar "Add files" split with menu |
| `05-merge-add-pages-menu-1280x720.png`, `-1366x657.png` | Merge "Add pages" with the "From a file" group |
| `06-phone-add-sheet-390x664.png`, `-390x844.png` | Phone "+ Add" sheet (Files / Pages groups) |
| `07-phone-add-sheet-pages-from-390x664.png` | "Pages from a file" submenu in place |
| `08-waiting-with-google-popup-1440x900.png`, `-1366x657.png` | Waiting alert on the tool page + the `/cloud/google` popup (before the tap) |
| `09-cloud-window-google-before-480x640.png`, `-390x664.png` | Window before the tap (desktop popup, phone tab) |
| `10-cloud-window-google-downloading-480x640.png`, `-390x664.png` | Window while downloading (done, 42%, skipped) |
| `11-cloud-window-dropbox-before-480x640.png` | Dropbox window before the tap |
| `12-cloud-window-states.png` | OneDrive connecting, Google signing in, provider picker, done, access denied, tool tab gone, saving |
| `13-popup-blocked-1366x657.png`, `-390x664.png` | Popup blocked alert with Try again |
| `14-downloading-on-tool-page-1366x657.png`, `-1280x720.png` | Download cards on Merge: arrived, 42%, failed with Retry; status line; primary disabled |
| `15-downloading-on-tool-page-phone-390x664.png` | The same on a phone |
| `16-provider-errors-1366x657.png` | Unreachable, access denied, skipped files (too big, 403) |
| `17-offline-phone-390x664.png` | Offline alert (with last-used chip) |
| `18-result-save-to-drive-1366x657.png`, `-390x664.png` | Result with "Save to Drive" next to Download |
| `19-result-save-menu-1366x657.png` | Save menu (Google Drive, OneDrive) |
| `20-result-saving-1366x657.png` | Saving 64% (busy) |
| `21-result-saved-1366x657.png`, `-390x664.png` | Saved + success alert with "Open in Drive" |
| `22-menu-reference-vs-berrypdf.png` | Side by side: the reference's upload menu vs ours |

The reference captures stay in `docs/specs/assets/f23/` and `sejda/` (internal only, never shipped).
