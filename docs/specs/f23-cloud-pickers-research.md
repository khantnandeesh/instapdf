# F23 Cloud sources: competitor and technical research

Date: 2026-11-24. Owner: competitor-researcher. Scope: open files from Dropbox, Google Drive and OneDrive in every tool (the shared `FilePicker` `sources` slot, ToolFlow's compact bar, Merge's Add menu and the phone "+ Add" menu), optional save-back, and "From URL". The site-analyst covers Sejda's UI behavior in detail in parallel. This file covers the competitor survey and the technical design.

Tags: **[V]** verified (official doc quoted, network capture, or our own harness run) · **[A]** my analysis · **[U]** unverified (needs a real provider account, a real device, or a doc I could not reach).

How the evidence was gathered:
- Competitor pages were loaded with Playwright (system Chrome 158, headless, no sign-in), one page load per site, and the cloud buttons were clicked. Sejda got one page load, and the clicks only opened provider popups. Captures are in the session scratchpad. That folder is not durable, so the key facts are copied into this file.
- **Local harness [V].** A small Node server served test pages with our exact production CSP (`csp.ts` without hashes) and chosen COOP values, on two origins (`localhost:8787` and `127.0.0.1:8787`). It loaded the real provider SDKs with fake app keys and client IDs, first in `Content-Security-Policy-Report-Only` mode to list every host needed, then in enforcing mode with only that list. It also opened test windows to check `window.opener`, `BroadcastChannel` and `window.close()` under each COOP value.
  - Chrome 158 and Playwright's Firefox build were both run. WebKit could not launch on this host because of missing system libraries, so **Safari results are [U]**.
- With fake credentials the providers show error pages, so nothing past the provider's sign-in screen was run. The end-to-end success callbacks are **[U]** until the owner creates real credentials (section 6).

---

## TL;DR

1. **Every competitor loads provider SDKs straight into the tool page** and processes files on its servers. Nobody gets cloud files under a strict CSP. Sejda shows an extra consent dialog before loading each provider's script [V]. A browser-only cloud import with a provable "nothing is uploaded" claim would be new in this field [A].
2. **Our CSP and COOP block all three SDKs as they stand [V]:**
   - Dropbox Chooser needs `script-src www.dropbox.com`, and its popup loses `window.opener` under COOP `same-origin`.
   - Google needs `apis.google.com`, `accounts.google.com` and a `docs.google.com` frame. Its popup needs COOP `same-origin-allow-popups`, per Google's doc.
   - OneDrive v8 needs a `onedrive.live.com` frame or popup and a form POST.
3. **Recommended:** the candidate design. Tool pages keep today's policy unchanged. Each provider gets a same-origin **`/cloud/<provider>` window** with its own narrow CSP/COOP. The window downloads the picked files and hands them to the tool tab as `File` objects over a per-request **`BroadcastChannel`**, then closes itself.
   - Measured: a 200 MB `File` posts in about 0.3 ms (it is passed by reference) and arrives intact in both Chrome and Firefox [V].
   - Catch: when the window's COOP differs from the tool page's, the opener link is cut. The tool page then sees `win.closed === true` straight away, so it needs a heartbeat instead [V].
4. **Per provider:**
   - **Google:** Picker plus Google Identity Services (GIS) token client, scope `drive.file` only. It is non-sensitive, so there is no security assessment and no 100-user cap; brand verification takes about 2–3 business days [V].
   - **Dropbox:** the Chooser. It needs no production approval [V].
   - **OneDrive:** File Picker v8 in an iframe plus `@azure/msal-browser` v5 (MIT, bundled), so **no third-party script runs at all** [V docs, harness].
   - Dropbox and Google need **one extra tap inside the window**, because their SDKs must be called from a user gesture [V docs].
5. **Save-back:**
   - Google Drive (`drive.file`, resumable upload) and OneDrive personal (Graph) are feasible browser-only. Adopt them in phase 2.
   - Dropbox **Saver needs a public HTTP(S) URL that Dropbox's servers fetch** [V], so skip it. Dropbox API upload works but needs production approval. Defer it.
6. **"From URL": skip.** Most hosts send no CORS headers, and fetching on the server breaks the client-only rule [A].
7. **Cost: ₹0** on every provider [V]. Use a separate Google Cloud project **with no billing account**, because Google plans to charge for Drive API use over quota from later in 2026 [V].

---

## 1. Competitors

| | Placement (desktop / phone) | Providers | How it's built (network) | Save back | Privacy wording; where the file goes |
|---|---|---|---|---|---|
| **Sejda** (reference) | Chevron on the main upload button opens a menu: Dropbox, Google Drive, OneDrive, Web Address (URL) [V]. A consent dialog appears before each provider's script loads, naming the provider and saying it may see the user's IP and set cookies, with "No, cancel" / "Yes, continue" [V screenshot] (paraphrased; Sejda text must not be reused) | Dropbox, Google Drive, OneDrive, URL [V] | Dropbox: `dropins.js`, Chooser popup with `link_type=direct`, `multiselect=true`, PDF and image extensions [V]. Google: `www.google.com/jsapi`, `apis.google.com/js/client.js` + picker, GIS token popup with **`drive.file` + `drive.install`** [V]. OneDrive: **legacy `js.live.net/v7.2/OneDrive.js`**, own `/one-drive-auth` page, implicit `id_token token` flow on `/common` with **`Files.Read.All`** [V]. URL: a modal with one field [V] | "Save to Dropbox" under Download ([merge help text](https://www.sejda.com/merge-pdf), see `docs/discovery/pages/merge-pdf.md`) [V]. Other providers [U] | "Files stay private. Automatically deleted after 2 hours." [V crawl]. Processing is on the server, so cloud files end up there. Whether the link or the bytes travel [U] |
| **iLovePDF** | Two round icon buttons under the big select button, on desktop and phone [V screenshots] | Google Drive, Dropbox (no OneDrive) [V] | Dropbox Chooser, direct links, multiselect, `.pdf` [V]. Google: `platform.js` + GIS + picker, scope **full `drive` + `userinfo.email`** (a restricted scope) [V]. The status line reads "Getting files from Dropbox" [V HTML] | Back to Drive or Dropbox from the download step ([blog](https://www.ilovepdf.com/blog/how-to-use-ilovepdf-google-drive-dropbox)) [V] | "automatically deleted after 2 hours" ([blog](https://www.ilovepdf.com/blog/how-to-use-ilovepdf-google-drive-dropbox)) [V]. Processed on the server |
| **Smallpdf** | Split button "Choose files" plus chevron menu: From device, From Smallpdf, From Dropbox, From Google Drive, From OneDrive [V]. Opening the menu preloads all three SDKs [V] | Dropbox, Google Drive, OneDrive, own cloud [V] | Dropbox Chooser, direct, multiselect [V]. Google: GIS with `drive.file` + `drive.install` [V]. OneDrive: v7.2 SDK, `/handle-onedrive` page, `Files.Read.All` on `/common` [V]. Remembers the last upload source in storage (`last_upload_source` in page code) [V] | "Save to Dropbox / Google Drive / OneDrive / Smallpdf", "Select a folder" (UI strings in page code) [V] | "encrypted using TLS and automatically deleted from our servers after one hour" [V page text] |
| **PDF24** | Small Drive and Dropbox icons at the bottom right of the drop zone [V screenshot]. The first click lazy-loads the SDK, then a small dialog asks for a second click ("Start file import") so the popup gets a fresh user gesture [V] | Google Drive, Dropbox [V] | Google: `api.js` + GIS, scope **`drive.file` only** [V]. Download is `www.googleapis.com/drive/v3/files/{id}?alt=media` with a bearer token (public `common.js`) [V]. Browser-based tools fetch the file in the browser. Server tools send `{url, bearer}` (the user's Drive token) to PDF24's worker server (comments in `common.js`) [V] | Not found [U] | "deleted from our server no later than one hour after their last use" [V page text] |
| **Adobe Acrobat online** | Needs an Adobe sign-in. Storage is added through "Add an account" and shows under "Other storage" in Documents ([help](https://helpx.adobe.com/acrobat/web/manage-cloud-storage/manage-third-party-storage/access-google-drive-files.html), [Google Drive connector](https://helpx.adobe.com/au/document-cloud/help/google-drive-storage-connector.html)) [U: helpx and adobe.com return 403 to automated clients, so this comes from search snippets] | Google Drive, OneDrive, Dropbox, Box, SharePoint ([online accounts](https://helpx.adobe.com/acrobat/using/online-accounts.html)) [U] | n/a (403 to headless browsers) | Open and save through the connectors [U] | Online tools upload to Adobe cloud storage ([FAQ](https://helpx.adobe.com/document-cloud/faq/free-online-pdf.html)) [U] |

PDFgear and Stirling-PDF were not surveyed for this feature (out of the requested scope). Stirling is self-hosted and has no consumer cloud pickers [U].

**What to take from this [A]:**
- The common placement is **a chevron or menu on the main pick button** (Sejda, Smallpdf) or **small provider icons next to it** (iLovePDF, PDF24). Both work on phones.
- Sejda and Smallpdf still use the **legacy OneDrive v7.2 SDK with `Files.Read.All`**, which can read every file. v8 with picker-scoped access is newer and narrower.
- `drive.file` is the standard Google scope (PDF24, Smallpdf, Sejda). iLovePDF's full `drive` scope is restricted and heavier to justify.
- Sejda's consent interstitial costs one click on each first use. Because our provider code never loads into the tool page (section 3), we don't need that dialog on the tool page. Legal sign-off on not needing it is **[U]**.
- To beat Sejda on M2/M10, the clicks must at least tie: Sejda takes chevron → provider → "Yes, continue" → popup. Our privacy line can be stronger and verifiable: "Files go from Dropbox straight to this browser."

---

## 2. Why the SDKs clash with our policy (harness evidence)

Production policy today (from `apps/web/src/lib/security/csp.ts`): `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' <hashes>; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'`, plus `Cross-Origin-Opener-Policy: same-origin` and `X-Frame-Options: DENY`. It is checked by `apps/web/e2e/q1/csp.spec.ts`.

### 2.1 Exact hosts per provider (report-only run, then an enforcing run that allowed only these) [V harness unless marked]

| Directive | Dropbox Chooser | Google (top-level picker; GIS token client for save) | OneDrive (MSAL v5 + File Picker v8) |
|---|---|---|---|
| `script-src` | `https://www.dropbox.com/static/api/2/dropins.js` | `https://accounts.google.com/gsi/client` (save only). Picking loads no Google script since 26 Nov (onepick, §3.1); before that, `apis.google.com/js/api.js` and `apis.google.com/_/scs/` for gapi and the Picker module | none beyond `'self'`: MSAL is an npm package we bundle |
| `frame-src` | none for `Dropbox.choose()` | Since 26 Nov, `https://accounts.google.com/gsi/` only, for the GIS token client on save ([GIS CSP doc](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy)). Picking no longer frames anything: see the onepick note in §3.1. The embedded Picker frame (docs.google.com) showed "Sign in to your Google Account" wherever Google's cookies don't reach a third-party frame, even with no CSP at all and with `authuser` set to the token's account [V 26 Nov, owner's Chrome] | `https://onedrive.live.com/picker/` (personal). Work/school: `https://*.sharepoint.com` ([v8 doc](https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/)) [A] |
| `form-action` | — | — | `https://onedrive.live.com/picker/` (+ `https://*.sharepoint.com`): the picker is started with a form POST [V harness, v8 doc] |
| `connect-src` (download) | the direct-link host. The doc only says `https://...` with CORS [V]. The usual host is `https://dl.dropboxusercontent.com` **[U]**; check on the first real pick | `https://www.googleapis.com/drive/v3/files/` (`files.get?alt=media`, [downloads doc](https://developers.google.com/workspace/drive/api/guides/manage-downloads)), and `https://accounts.google.com/gsi/` per the GIS doc (the token client didn't need it in the harness) | `https://login.microsoftonline.com` (token endpoint; MSAL made no call before the popup [V]), `https://graph.microsoft.com` (`?select=@microsoft.graph.downloadUrl`), and the download-URL hosts: `https://*.files.1drv.com` (doc example, [get-content](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0)), `https://my.microsoftpersonalcontent.com` **[U]** (community reports), `https://*.sharepoint.com` (work) **[U]** |
| `style-src` | `dropins.js` injects an inline `<style>`, which is blocked. It only styles Dropbox's own button; `Dropbox.choose()` still opened its popup [V] | (Superseded 26 Nov: picking is now Google's own top-level page, so none of this applies; only GIS for save remains, and its inline `<style>` is cosmetic.) GIS/gapi inject an inline `<style>`, which is blocked. **The Picker's default modal draws unpositioned without inline styles** [V screenshot]. Fix: host it with the documented [`PickerBuilder.toUri()`](https://developers.google.com/workspace/drive/picker/guides/web-picker) in our own iframe, styled by our stylesheet. It rendered correctly with `style-src 'self'` [V]. The callback through `toUri` is documented but untested with real credentials [U] | none |
| `img-src` | none (we don't show Dropbox thumbnails) | none (Google's picker is a top-level Google page, not one of ours) | none |
| COOP on the page that calls the SDK | `same-origin-allow-popups` or `unsafe-none`. Under `same-origin` the Chooser popup had `window.opener === null`; under the other two it was kept [V] | `same-origin-allow-popups` when FedCM is off ([GIS COOP doc](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#cross_origin_opener_policy)) [V doc]. The harness couldn't confirm it: Google's error page for a fake client cuts the opener under every value, and `popup_closed` fired after about 1 s each time [U] | Any. MSAL v5 returns popup results through a same-origin **redirect bridge page over BroadcastChannel**, designed for apps with COOP `same-origin`. **The bridge route itself must have no COOP** ([redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge)) [V doc]. `loginRedirect` needs no popup at all. Picker v8 *as a popup* posts `initialize` to `window.opener`, which was kept under `same-origin-allow-popups` [V]. As an iframe, COOP doesn't matter |
| Needs a user gesture | Yes: "only call this function from within a user-triggered event handler" ([Chooser doc](https://docs.dropboxapi.com/dropbox-api/docs/pre-built-components/chooser)) | Save only: `requestAccessToken` "from a user-driven event" ([token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)). Picking (onepick) is a plain navigation and needs none; the window still waits for a tap so the privacy line is read first | No, with `loginRedirect` plus the picker in an iframe [A] |

CSP host-source paths (e.g. `https://apis.google.com/_/scs/`) matched as prefixes in the enforcing run, with no violations other than the inline `<style>` noted above [V].

### 2.2 COOP and window handoff experiment [V Chrome 158 and Firefox, harness `handoff.mjs`]

The tool page had COOP `same-origin` and opened `/cloud` with `window.open` on a click. The `/cloud` page then sent a 200 MB `File`.

| `/cloud` COOP | `window.opener` in `/cloud` | Tool page sees `win.closed` | BroadcastChannel `File` 200 MB | `postMessage` + transfer | `/cloud` can `window.close()` itself |
|---|---|---|---|---|---|
| `same-origin` (matches) | kept | `false` (can watch it) | arrives, posted in 0.3 ms | works (50 MB `ArrayBuffer` transferred) | yes |
| `unsafe-none` | **null** | **`true` immediately** (handle is dead) | arrives | n/a | yes |
| `same-origin-allow-popups` | **null** | **`true` immediately** | arrives | n/a | yes |
| `same-origin`, but the window first navigated cross-origin and back (OAuth redirect) | **null** (cut for good) | `true` immediately | arrives | n/a | yes |

**Conclusions [A]:**
- Any window that relaxes COOP, or that goes through an OAuth redirect, is cut off from the tool tab. **BroadcastChannel is the one handoff that works in all four cases.** Both browsers clone `File`/`Blob` by reference, so no second copy of the bytes is made.
- The tool tab **can't use `win.closed`** to detect cancel. Use messages plus a heartbeat.
- BroadcastChannel is in Safari and iOS Safari from 15.4 and COOP from 15.2 ([MDN BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel), [MDN COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy); [V] from MDN's browser-compat-data). The handoff itself wasn't run in WebKit here **[U]**.

---

## 3. Architectures compared

| Option | Privacy claim | Works with the SDKs | Phone | Effort | Verdict |
|---|---|---|---|---|---|
| **A. Relax CSP/COOP globally on tool pages** | **Broken.** Third-party script would run in the page that holds the user's files, and `connect-src` would gain provider upload hosts. A compromised or malicious script could upload a local file to *any* Dropbox or Drive account. `csp.spec.ts`'s core assertion goes away | Yes (what competitors do) | Yes | S | **Reject** |
| **B. Same-origin `/cloud/<provider>` window, per-route CSP/COOP, BroadcastChannel handoff** (candidate) | **Kept.** Tool pages keep `connect-src 'self'` and `script-src 'self'`, byte for byte. Provider code runs only in a window that never receives local files (except save-back, which is the intent). Opener cut ⇒ no DOM access to the tool tab [V]. Same origin ⇒ the window *can* read origin storage. Today that holds only preferences (`localStorage`/`sessionStorage` keys in `MergeTool.tsx`, `ToolFlow.tsx`; no file bytes) [V grep]. **Rule: never persist file bytes in origin storage** | Yes for all three [V harness up to the provider's sign-in] | Popups open as tabs; `window.open` must be called synchronously in the tap ([MDN user activation](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation)). Google adds a nested popup, which becomes a third tab on phones **[U]**. Return to the tool tab when the cloud tab closes **[U]** | M | **Adopt** |
| **C. Same-origin iframe with a relaxed CSP inside the tool page** | Broken. A same-origin iframe can script its parent (and read its files), so its relaxed `connect-src` becomes a way out. Sandboxing it without `allow-same-origin` gives an opaque origin, which breaks providers' origin and domain checks | Popups opened from an iframe inherit the top page's COOP `same-origin`, so they are cut too [A]. User activation doesn't pass into child frames [A] | — | M | **Reject** |
| **D. Provider REST APIs + our own file-browser UI (no provider pickers)** | Best: `script-src 'self'` everywhere, even in `/cloud/*`; only `connect-src` grows | Google: listing files needs `drive.readonly`, a **restricted** scope with restricted-scope verification ([scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)); a security assessment only if data is stored or sent through servers [V]. Dropbox: needs **production approval** once 50 users link (two-week deadline; 500-user cap in development) ([developer guide](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide)) [V]. OneDrive: Graph `Files.Read` is fine | Best: one window, no nested popups, OAuth by redirect | L | **Skip for now** (later for Dropbox if the extra tap hurts M5) |
| **E. Server proxy (our worker fetches from the provider)** | Breaks "nothing uploaded"; costs money; SSRF risk | Yes | Yes | M | **Reject** (rule 4/5) |

### 3.1 The recommended flow per provider (option B) [A]

All three providers use the same protocol. On click, the tool tab calls `window.open('/cloud/<p>?req=<nonce>&accept=pdf&multiple=1', ..., 'popup,width=…')` *synchronously*. If that returns `null`, it shows "Allow pop-ups for BerryPDF" with a retry button. The window then:
1. posts `ready`, then a `heartbeat` every 1 s;
2. posts `progress {name, loaded, total}` per file while it streams the downloads;
3. posts `files {files: File[]}`, waits for `ack`, and calls `window.close()`;
4. on cancel or `pagehide`, posts `cancel`.

The channel is `cloud:<nonce>`, a random UUID per request, and both sides check it. The tool tab treats about 3 s without a heartbeat as "closed" and returns silently to where it was.

- **Dropbox** `/cloud/dropbox`, COOP `same-origin-allow-popups`:
  - The window loads `dropins.js` and shows one button, "Choose from Dropbox", focused, with a privacy line. A tap calls `Dropbox.choose({linkType:'direct', multiselect, extensions:['.pdf'], sizeLimit})`, which opens a nested popup.
  - On success, the window fetches each direct link right away (links expire after 4 h [V Chooser doc]).
  - Taps: menu → Dropbox → Choose = **ties Sejda** (chevron → Dropbox → Yes, continue).
  - `dropins.js` also has undocumented `iframe:true` and `createChooserWidget` options, which would remove the tap. With a fake key the Chooser page answered `X-Frame-Options: SAMEORIGIN` [V]. Undocumented, so **don't rely on it [U]**.
- **Google** `/cloud/google`, COOP `same-origin-allow-popups`. **Superseded for picking on 26 Nov 2026 by Google's top-level picker ("onepick")** [V staging, owner's Chrome, real account]:
  - The window navigates itself (no popup, no iframe, no Google script) to `https://accounts.google.com/o/oauth2/v2/auth?client_id=…&response_type=token&scope=drive.file&redirect_uri=<origin>/cloud/google&prompt=consent&trigger_onepick=true&state=google.<nonce>`. Google shows its account chooser, a consent for "the files that you're about to pick", and the full Drive picker, all as top-level pages, so **third-party cookies don't matter**.
  - Insert redirects to `/cloud/google#access_token=…&token_type=Bearer&expires_in=3599&picked_file_ids=<id>,…&state=…`. `files.get` (name, type, size) and `alt=media` work with that token (a 210 KB PDF came back byte for byte, starting `%PDF-`) [V].
  - `trigger_onepick` is documented for desktop and mobile apps ([overview](https://developers.google.com/workspace/drive/picker/guides/overview-desktop)); it worked for our Web client with the implicit flow. The OAuth client needs `<origin>/cloud/google` as an authorised redirect URI (staging added 26 Nov; add prod's with the real domain).
  - Code: `adapters/onepick.ts`. Only a random nonce and the window's own URL go in sessionStorage. On return, `history.replaceState` puts the window's URL back (no reload) before anything stores or sends the hash (the app router has already copied the URL into memory; nothing keeps it). Any `#access_token=…` on the bare URL is cleared, even one whose state isn't ours, and so is any `#error=…`. The state is checked and a mismatch refused. The token stays in memory; files download in the window and only their bytes reach the tool tab. `/cloud/google` sends `Referrer-Policy: no-referrer`.
  - Picker parameters ([overview, "OAuth 2.0 parameters"](https://developers.google.com/workspace/drive/picker/guides/overview-desktop)): `mimetypes=<the tool's accepted types>` (PDF tools also get Docs, Sheets and Slides, exported as PDF) and `allow_multiple=true` only for tools that take several files. [V 26 Nov] Google carried both through: the picker listed only PDFs and was titled "Select items". Built by `onepickParams` in `adapters/google.ts`; the mock uses the same builder and logs what it sent.
  - Closing the picker without picking comes back as `#error=access_denied&state=…` [V 26 Nov], the same answer as declining consent, so both are a quiet cancel (AC-142), never "Access wasn't given".
  - Shared drives: `files.get` and `alt=media` carry `supportsAllDrives=true` ([shared drives](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives)). If site storage is blocked (no nonce can be kept), the window says it can't reach Google instead of leaving.
  - Risk [A]: this uses the implicit flow, which Google calls legacy (below). If Google ever refuses it for Web clients, the fallback is the code flow, which for a Web client needs the client secret, so a small stateless token exchange on the server. That would need the owner's OK (CLAUDE.md rule 4, budget).
  - Save still uses the GIS token client (a popup, which works without third-party cookies) and the multipart upload below.
  - The embedded-Picker design that follows is kept for the record. It is **superseded**: picking now uses Google's picker with a type filter and the implicit redirect flow, which the bullets below advise against.
  - The window loads `api.js` and GIS and shows "Continue with Google". A tap calls `requestAccessToken({prompt:''})` (the doc's pattern for returning users, [web picker](https://developers.google.com/workspace/drive/picker/guides/web-picker)), which opens a nested popup.
  - The Picker then appears in our own iframe via `toUri()`, with `setMimeTypes('application/pdf')` (and images for image tools), multiselect, `setOrigin`, and `setAppId(<project number>)`.
  - Download: `GET https://www.googleapis.com/drive/v3/files/{id}?alt=media` with the bearer token, streamed.
  - (Superseded) Native Google Docs files aren't PDFs (export is capped at 10 MB [V downloads doc]); filter them out in the Picker view. Now: they are offered to PDF tools and exported as PDF (AC-141).
  - The token lives only in memory: up to its lifetime, the tool tab may hold it and pass it to the next `/cloud/google` window over the channel, which skips the extra tap on repeat picks. Never persist it [A].
  - (Superseded by onepick, see the risk note above) Don't use the direct implicit endpoint (a redirect flow with no extra tap). Google calls it "strongly discouraged… provided only for legacy support" ([implicit flow](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow)) [V].
- **OneDrive** `/cloud/onedrive`, any COOP:
  - On load, `msal.loginRedirect()` (or a cached session) runs, then the window comes back to itself. No gesture is needed.
  - The v8 picker loads in an iframe by form POST to `https://onedrive.live.com/picker/_layouts/15/FilePicker.aspx` with `access_token`, which the doc says is required for iframes. Messaging uses `postMessage` + `MessagePort` (`initialize` → `activate`, then the `authenticate`, `pick` and `close` commands). Tokens come from `acquireTokenSilent` for the picker's resource.
  - Download: Graph `GET /drives/{driveId}/items/{id}?select=@microsoft.graph.downloadUrl`, then a plain `fetch(downloadUrl)` with **no** `Authorization` header. `/content` can't be used from JavaScript because its 302 breaks the CORS preflight [V [CORS doc](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/working-with-cors)]. Download URLs "might expire within minutes" [V], so fetch immediately.
  - Taps: menu → OneDrive (+ sign-in on first use) = **wins against Sejda**.
  - Work/school accounts use a different `baseUrl` (`https://{tenant}-my.sharepoint.com`) and SharePoint tokens [V v8 doc]. **Ship personal accounts first.**

### 3.2 Large files, memory, multi-select, cancel [A unless marked]
- Stream each download (`response.body.getReader()`) into `Blob` parts so progress is truthful (M3), then build `new File(parts, name, {type})`. Large Blobs are backed by the browser's blob store, not the JS heap, and BroadcastChannel passes them by reference (200 MB measured [V]).
- The `/cloud` window releases its copy when it closes. That's why it posts, waits for `ack`, and closes at once.
- Enforce our existing per-tool size limit *before* downloading: Chooser `sizeLimit` [V doc], Picker `sizeBytes` in the response, Graph `size`.
- Drive and Graph download URLs support `Range` [V docs]. Not needed in v1.
- Multi-select:
  - Dropbox: `multiselect: true` [V doc].
  - Picker: `Feature.MULTISELECT_ENABLED` (runs in the harness [V]).
  - OneDrive v8: `selection.mode: 'multiple'` per the [schema](https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/v8-schema) **[U]**.
  - Downloads run 2 at a time, each with its own progress row; a failed file is reported by name and the others still arrive.
- Cancel:
  - Dropbox has a `cancel` callback [V].
  - The Picker sends `action: CANCEL`.
  - OneDrive v8 sends the `close` command [V doc].
  - Plus `pagehide` and the heartbeat.
  - The tool tab treats cancel as "nothing happened", with no error toast.

---

## 4. Save back to the cloud

| Provider | Path | Feasible browser-only? | Effort | Recommendation |
|---|---|---|---|---|
| Dropbox Saver | `Dropbox.save(url)`: "Dropbox will connect to the supplied URL directly"; "supports HTTP and HTTPS URIs"; the transfer must finish within 15 min ([Saver doc](https://docs.dropboxapi.com/dropbox-api/docs/pre-built-components/saver)) [V] | **No.** We only have `blob:` URLs. A public URL would mean uploading the result to our bucket | — | **Skip** |
| Dropbox API | OAuth PKCE with no secret ([OAuth guide](https://docs.dropboxapi.com/dropbox-api/docs/oauth)) [V], App folder permission. Upload `content.dropboxapi.com/2/files/upload` with the documented browser no-preflight form (`Content-Type: text/plain; charset=dropbox-cors-hack`, `reject_cors_preflight=true`, [request formats](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/request-response-formats.md)) [V]. Per-call size limit / upload sessions: **[U]** (not in the fetched pages) | Yes | M (+ production approval after 50 users [V]) | **Defer** (phase 3) |
| Google Drive | Same OAuth client and `drive.file` scope (it covers files the app creates [A, per [scope doc](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)]). Resumable upload `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable` (for >5 MB; session URIs last a week, [uploads doc](https://developers.google.com/workspace/drive/api/guides/manage-uploads)) [V]. Folder choice through a Picker folder view **[U]** | Yes | M | **Adopt, phase 2** |
| OneDrive | Graph upload (`PUT …/content` for small files, `createUploadSession` for large); scope `Files.ReadWrite` or app-folder scope **[U]**. Or let the v8 picker choose the folder | Yes | M | **Adopt, phase 2 (personal accounts)** |

Data path for save-back [A]: on "Save to Drive", the tool tab synchronously opens `/cloud/google?mode=save&req=…`. It sends the result `File` over the channel only after the window posts `ready`, and only on that request's channel. The window uploads, shows progress, and posts `saved {link}`. The `/cloud/*` `connect-src` gains only the upload host. Tool pages are unchanged.

## 5. "From URL" import

- **Client-only is not possible for most links [A].** The fetch would need `connect-src` to allow any host (on some page), *and* the target server would have to send `Access-Control-Allow-Origin`. Ordinary web servers, mail attachments and most CDNs don't.
- Sejda's URL field (a modal with one input [V]) works because Sejda processes on its servers anyway.
- Fetching on our worker would make the tool upload-based and cost money (rules 4 and 5).
- **Skip.** A cheap later option: recognise pasted Dropbox, Drive and OneDrive *share links* and send them into that provider's flow **[U]**.

---

## 6. What the owner must create (all free)

| Provider | Create | Settings | Scope (minimal) | Limits and verification | Cost |
|---|---|---|---|---|---|
| **Dropbox** | An app in the App Console ("Scoped access"; for a Chooser-only app the permission type doesn't matter [A]). The **app key** is public (`data-app-key`) | Chooser/Saver domains: the prod domain and the staging host ("provide the domain names where your app is hosted", [Chooser doc](https://docs.dropboxapi.com/dropbox-api/docs/pre-built-components/chooser)) [V] | none (the Chooser hands out direct links) | "using them doesn't require production approval" ([developer guide](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide)) [V]. The 500-user / 50-user limits apply to *linked* OAuth users. The Chooser doesn't link accounts to our app, so the cap shouldn't apply to Chooser-only use [A/U]. Save-back via API would need production approval [V] | Free |
| **Google** | A **separate Google Cloud project with no billing account** (Drive API use over quota "is planned to incur charges… later in 2026", [limits](https://developers.google.com/workspace/drive/api/guides/limits)) [V]. Enable **Google Drive API**. Create an **OAuth 2.0 Web client ID** with Authorized JavaScript origins for prod and staging (GIS, for save) and the **Authorized redirect URIs** `https://<prod>/cloud/google` and `https://<staging>/cloud/google` (onepick). Since 26 Nov no API key, Picker API or project number (App ID) is needed: those were for the embedded Picker | Consent screen: External, *In production*, scope `drive.file` only. **Don't** add `drive.install` (Sejda and Smallpdf do; it's for Drive "Open with" integration [A]) | `https://www.googleapis.com/auth/drive.file` (non-sensitive: "only require basic OAuth App Verification", [scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)) [V] | The 100-user cap applies only to apps showing the unverified-app screen, which comes with sensitive or restricted scopes ([FAQ](https://support.google.com/cloud/answer/13463817), [audience](https://support.google.com/cloud/answer/15549945)) [V]. **Brand verification** (name and logo on the consent screen) needs a homepage and privacy policy on a **domain verified in Search Console** ([requirements](https://support.google.com/cloud/answer/13464321)) and takes "2-3 Business days… not guaranteed" [V]. *Testing* status allows 100 test users and consents expire after 7 days [V]; use it for staging | Free (standard Drive API use costs nothing [V]) |
| **Microsoft** | An **Entra tenant** (registering apps outside a directory is deprecated, [breaking changes](https://learn.microsoft.com/en-us/entra/identity-platform/reference-breaking-changes)) [V]. Whether a free tenant needs an Azure sign-up with a card **[U]**. Then an **app registration**: account types "any organizational directory **and** personal Microsoft accounts", platform **SPA** | Redirect URIs `https://<prod>/cloud/onedrive` and the staging equivalent | Personal accounts: `OneDrive.ReadOnly` at token time, with Graph `Files.Read` on the registration ([v8 doc](https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/)) [V]. `Files.Read` is the least-privileged scope for download ([get-content](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0)) [V]. Work: SharePoint `MyFiles.Read` [V] | **Publisher verification** (free; needs a verified Microsoft AI Cloud Partner Program account and a DNS-verified domain). Without it, users in tenants with risk-based step-up consent can't consent to multitenant apps registered after Nov 2020 ([publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)) [V]. Needed for work/school; personal accounts are unaffected [A] | Free ("Microsoft doesn't charge developers for publisher verification") [V] |

Env/config [A]: `NEXT_PUBLIC_DROPBOX_APP_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_ONEDRIVE_CLIENT_ID`. (`NEXT_PUBLIC_GOOGLE_API_KEY` and `NEXT_PUBLIC_GOOGLE_APP_ID` were dropped on 26 Nov with the embedded Picker.)
- They are public identifiers, not secrets. Keep them in GitHub Actions *variables*, not in git, to stay consistent with rule 6.
- A provider whose variables are unset is hidden. The build and CI need none of them.

**Licenses:**
- [V npm registry]: `@azure/msal-browser` 5.30.0 **MIT** (bundled). `dropbox` JS SDK 10.66.0 **MIT** (only if Dropbox API save-back is built; plain `fetch` is enough). `@types/google.picker` and `@types/google.accounts` **MIT** (dev only). `@googleworkspace/drive-picker-element` 0.7.3 **Apache-2.0** (optional; not recommended, because it loads Google scripts itself **[U]**).
- **Decision for the owner:** `dropins.js`, `accounts.google.com/gsi/client` and `apis.google.com/js/api.js` (+ the picker module) are **proprietary scripts hosted and served by the providers** under their API terms. They are never bundled, vendored or redistributed. My reading [A]: rule 3 covers dependencies we ship, not provider runtime scripts. The OneDrive path loads no third-party script.

---

## 7. Testing without keys

1. **One interface, one protocol.**
   - The tool side knows only `openCloudSource(provider, {accept, multiple}) → Promise<File[] | 'cancelled'>`, which runs the window and BroadcastChannel protocol from 3.1.
   - Each provider adapter lives only in its `/cloud/<p>` page.
   - A `/cloud/mock` page (built only when `NEXT_PUBLIC_CLOUD_MOCK=1`, as in CI and e2e builds) uses the same protocol. It returns fixtures from `e2e/fixtures` (same-origin) after a fake "pick" UI with *Pick*, *Cancel*, *Fail one file* and *Slow* buttons.
   - This covers popup lifecycle, progress, multi-file, cancel, heartbeat loss, popup blocked (stub `window.open` to return `null` with `addInitScript`), and the "File arrives in ToolFlow / Merge Add / phone + Add" paths. No keys or network are needed.
2. **Fake SDKs at the network layer** (Playwright `context.route`) test the real adapters:
   - Fulfil `https://www.dropbox.com/static/api/2/dropins.js` with a stub `Dropbox.choose` that returns links to a routed `https://dl.dropboxusercontent.com/...` serving a fixture.
   - (Superseded 26 Nov: the mock now simulates Google's top-level picker round trip, `MOCK_ONEPICK_KEY` in `adapters/mock.ts`, and logs the picker parameters it was sent.) Stub `api.js`/`gsi/client` with fake `gapi.load`, `google.accounts.oauth2.initTokenClient` and `google.picker.*` (`toUri` → a routed `docs.google.com/picker` page that `postMessage`s a pick).
   - Route `login.microsoftonline.com` (token endpoint) and serve a fake `onedrive.live.com/picker/...` page that speaks the v8 `initialize` / `authenticate` / `pick` messages.
   - Because the real CSP stays on, these tests also prove the per-route allowlists are correct.
3. **CSP e2e changes:**
   - `csp.spec.ts` keeps asserting the strict policy on every tool page, unchanged.
   - Add: each `/cloud/<p>` route sends exactly its allowlist (section 2.1); its COOP is as specified; tool pages never load a provider host (use `page.on('request')` during a mock pick).
   - Exclude `/cloud/*` from the global COOP header in `next.config.ts`, since `headers()` currently applies `same-origin` to `/:path*`, and set COOP per route. The middleware already builds a per-path CSP, so add a per-provider branch there.
4. **Real popup flow later (not in CI):**
   - A manual or nightly Playwright job against staging, with real keys and dedicated test accounts whose saved `storageState` is kept in Actions secrets. Automating Google sign-in itself is often blocked **[U]**, so reuse pre-authenticated state.
   - Use `context.waitForEvent('page')` for each nested popup.
   - Check on a real iPhone (Safari) and an Android Chrome device by hand: tab switching, nested GIS tab, return to the tool tab **[U]**.

---

## Improvements

| # | Idea | Seen at | User benefit | Cost | Adopt/skip | Reason |
|---|---|---|---|---|---|---|
| 1 | Per-provider `/cloud/<p>` window with its own CSP/COOP; tool pages untouched | none (all competitors relax the tool page) | Cloud import while "nothing is uploaded" stays provable | M | **Adopt** | Only option that keeps the CSP claim [V harness] |
| 2 | `File` handoff over a per-request `BroadcastChannel` + nonce + heartbeat | — | Fast (by reference), works on every COOP path | S | **Adopt** | `window.opener`/`closed` are cut [V] |
| 3 | No consent dialog on the tool page; a short privacy line in the cloud window | Sejda shows a dialog | One click fewer than Sejda | S | **Adopt** | Provider code never loads on the tool page. Legal check **[U]** |
| 4 | Chevron/menu on the main pick button + provider entries in Merge Add and phone "+ Add" | Sejda, Smallpdf (menu); iLovePDF, PDF24 (icons) | Familiar, works on phones | S | **Adopt** | Matches the reference; final UI is the UX designer's call |
| 5 | Remember the last-used source as a one-tap shortcut | Smallpdf | Fewer taps for repeat users | S | **Adopt** | `localStorage` preference only, no file data |
| 6 | Google: `drive.file` only, PDF filter. Picker via `toUri()` in our iframe, **superseded 26 Nov by Google's top-level picker** (§3.1) | PDF24 (`drive.file`) | Smallest consent; no inline-style hole | S | **Adopt** | Non-sensitive scope [V]; renders under `style-src 'self'` [V] |
| 7 | Keep the Google token in tab memory for its lifetime, to skip the second tap on repeat picks | — | Faster second pick | S | **Adopt** | Never persisted; scope limited to picked files |
| 8 | OneDrive via v8 picker in an iframe + bundled MSAL v5 with redirect | none (Sejda and Smallpdf use v7.2 + `Files.Read.All`) | Narrower access, no third-party script, no extra tap | M | **Adopt (personal first)** | [V docs + harness] |
| 9 | OneDrive work/school accounts | Smallpdf, Sejda (`/common`) | Office users | M | **Adopt after publisher verification** | Consent is blocked without it in many tenants [V] |
| 10 | Dropbox Chooser in its window (one extra tap) | Sejda, iLovePDF, Smallpdf, PDF24 | Dropbox users | S | **Adopt** | No approval needed [V]; ties Sejda on taps |
| 11 | Truthful per-file download progress mirrored in the tool tab; per-file errors | — | Wins M3/M9 | S | **Adopt** | Streamed `fetch` |
| 12 | Pre-filter by type and size (Chooser `extensions`/`sizeLimit`, Picker MIME types, Graph `size`) | — | No "wrong file" round trips | S | **Adopt** | [V docs] |
| 13 | Popup-blocked fallback ("Allow pop-ups" + retry) | — | No silent failure | S | **Adopt** | `window.open` can return `null` |
| 14 | Save to Google Drive | iLovePDF, Smallpdf | Result goes back where the source was | M | **Adopt, phase 2** | Same scope, browser-only [V] |
| 15 | Save to OneDrive (personal) | Smallpdf | Same | M | **Adopt, phase 2** | Graph upload, browser-only [V] |
| 16 | Save to Dropbox via Saver | Sejda, iLovePDF, Smallpdf | — | — | **Skip** | Needs a public URL fetched by Dropbox [V] |
| 17 | Save to Dropbox via API (App folder) | — | Dropbox users | M | **Defer** | Production approval after 50 users [V] |
| 18 | "From URL" import | Sejda | Rare use | M | **Skip** | CORS + server fetch break the rules [A] |
| 19 | "Recent Drive files" on the landing page | Sejda (crawl) | Shortcut | M | **Skip** | Needs broader scopes and persistent auth |
| 20 | Own file browser via REST APIs | — | One UI, no gesture tap | L | **Skip for now** | Restricted Google scope; Dropbox approval [V] |
| 21 | Lazy-load the SDK, then ask for a second click | PDF24 | — | S | **Skip** | Our window click already gives the gesture |
| 22 | `/cloud/mock` + fake SDKs via `page.route`, behind a flag | — | CI without keys | M | **Adopt** | Section 7 |

## Recommended architecture (≤ 15 lines)

1. Tool pages keep today's CSP (`connect-src 'self'`, `script-src 'self'` + hashes) and COOP `same-origin`; `csp.spec.ts` stays as is.
2. Each provider gets a same-origin route, `/cloud/dropbox`, `/cloud/google` or `/cloud/onedrive`, with its own CSP in `middleware.ts` (hosts in section 2.1) and its own COOP: `same-origin-allow-popups` for Dropbox and Google, `same-origin` for OneDrive.
3. On click, the tool tab synchronously opens `/cloud/<p>?req=<uuid>`. If `null` comes back, it shows "Allow pop-ups" with a retry.
4. The window signs in (Dropbox Chooser / GIS token client / MSAL v5 redirect) and shows the provider picker (Chooser popup / Google's own top-level picker, the window navigating there and back / OneDrive v8 iframe).
5. It streams the picked files straight from the provider into `Blob`s with progress, and never sends them to our servers.
6. It posts `File[]` on `BroadcastChannel('cloud:<uuid>')`, waits for `ack`, and closes. A heartbeat covers cancel and closing, because the opener is cut.
7. Tokens live only in browser memory (one window or tab session); no storage on the server; no file bytes in origin storage.
8. Providers are hidden when their `NEXT_PUBLIC_*` id is unset. CI uses `/cloud/mock` plus fake SDKs routed by Playwright.
9. Phase 1: open from Dropbox, Google Drive and OneDrive personal. Phase 2: save to Drive and OneDrive. Later: OneDrive work (after publisher verification) and Dropbox API save.
10. Owner setup: a Dropbox app (key + domains); a Google project with no billing (Picker and Drive APIs, a restricted API key, a Web client ID, the project number, `drive.file` consent + brand verification); an Entra tenant + SPA app registration (personal + org accounts).
11. Cost: ₹0. GCP budget impact: none.
