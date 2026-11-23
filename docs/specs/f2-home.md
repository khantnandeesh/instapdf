# F2: Home page, tool catalogue and header menu

Status: step 2 (Research) done. Next: Design.
Reference observed: the reference home page (`/`) on desktop (1366×900) and mobile (375×812), its "All tools" mega menu, and its recent-tools behavior, 2026-11-23. No processing task was run. One tool page (`flip-pdf`) was opened only to see how a visit is recorded in the recent list.
Internal screenshots: `docs/specs/assets/f2-home/` (reference only, never ship).

| File | What it shows |
|---|---|
| 01-home-desktop-top.png | Header plus hero, first catalogue row |
| 02-home-desktop-full.png | Whole page: hero, catalogue, product blocks, how-to guides, footer |
| 03-all-tools-menu.png | Desktop mega menu, fresh profile (the Recent column shows the defaults) |
| 04 / 05 | Typing while the menu is open (nothing happens), then the menu closed with Escape |
| 06-menu-recent-after-visit.png | Recent column after visiting one tool page |
| 07-menu-recent-many.png | Recent column with 9 stored tools plus defaults |
| 08 / 11 | Mobile header plus hero, and the mobile catalogue (2-column cards) |
| 09 / 10 | Mobile mega menu (2 columns, no Recent column, page still scrollable) |
| 12-footer.png | Footer columns |
| 13-menu-recent-hover-pin.png | Pin icon and description tooltip when hovering a Recent entry |

## 1. Purpose

The home page is where visitors find the tool they need. It briefly says what the product is, points to the main action, and lists every tool in clear groups, each with a one-line summary. A visitor who knows what they want can type a few letters and jump straight there. The same catalogue is always one click away from the header on every page, and tools the visitor used recently on this device are listed first. Because InstaPDF ships one tool at a time, the catalogue must be honest about status: tools that work link to their page, and tools not built yet are clearly marked as coming soon and lead to a proper placeholder page, never to an error. The home page uploads nothing and needs no account.

## 2. Inputs

The page takes no files.

| Aspect | Reference behavior (observed) | InstaPDF F2 decision |
|---|---|---|
| Files, cloud, URL, encrypted files | None on the home page. The hero button goes to the editor tool page. | None. A drop-a-file-on-the-home-page shortcut is left to step 2 (Research) to propose; it is not in this spec. |
| Search text | A search field exists in the menu markup but is hidden (`display:none`), so visitors cannot use it. Its hidden logic is a case-insensitive substring match on the tool name and description. | A visible search field on the home page and in the menu (see §3). |
| Device history | `localStorage.prevUsedTools` (JSON array of slugs) plus `pinnedTools`. Both are written in the browser and never sent. | `localStorage["instapdf:recent-tools"]` holds a JSON array of tool slugs. It is never sent anywhere. Pinning is deferred (D-3). |
| Data source | Static server-rendered HTML | The tool registry (`apps/web/src/tools/registry.ts`) is the only source. Names, summaries, categories, status and the tool count all come from it. Nothing is hard-coded on the page. |

Registry additions this feature needs (builders decide the exact shape):

- `keywords: string[]`: search aliases such as "encrypt" for Protect, "combine" for Merge, "jpg" and "png" for the image tools, "ppt" for PowerPoint, "sign" for Fill & sign, and "shrink" / "reduce" for Compress. They cover words people type that are not in the name or summary.
- `popular: true` on the tools in the Popular row, plus a fixed order for that row.
- Optional `featured` slug for the hero call to action (see §3a).

## 3. Options (controls)

### 3a. Hero

| Control | Type | Default | Allowed values | Effect |
|---|---|---|---|---|
| Heading plus one-line pitch | text | – | our own copy | Says what InstaPDF is. Mentions that most tools run in the browser. |
| Primary call to action | large button/link | – | – | Reference: goes to its flagship tool (the editor). **Ours:** goes to the `featured` tool once that tool is not `planned`. Until then (today the editor is planned) it is "browse tools": it scrolls the catalogue into view, sets the hash `#tools` and focuses the catalogue search field. |
| Secondary "see all N tools" link | text link plus down chevron | – | – | Reference: scrolls down by a fixed 700 px. **Ours:** scrolls to the catalogue heading. N is the registry count (45 today), never hard-coded. |

### 3b. Catalogue (home page)

Observed reference structure: a "Most popular" block of 9 cards, then 8 group blocks (Merge, Split, Edit & Sign, Compress & Scans, Security, Convert from PDF, Convert to PDF, Others). Each card is an icon, a name and a description. Desktop shows 3 columns and mobile 2. Some tools appear in two groups. Workflows is not on the home page, only in the menu.

| Control | Type | Default | Allowed values | Effect |
|---|---|---|---|---|
| Search | `type=search` field with a visible label | empty | any text | Filters cards live (on every input event, no submit). Case-insensitive. Leading and trailing spaces are trimmed. Matches any substring of the name, the summary or a keyword. Empty means show everything. Escape clears it. Popular row hidden while a query is active (to avoid duplicate hits). Groups with no match are hidden. A polite live region announces "N tools". |
| No-results message | inline message plus "Clear search" button | hidden | – | Shown when nothing matches. The button clears the query and focuses the field. |
| Available-only toggle | switch or checkbox | off | on / off | On: hides `planned` tools. Today only Rotate remains. (P2; this helps while most tools are planned.) |
| Category jump links | row of chips or links | – | the 8 categories | Scrolls to that group and sets the hash (e.g. `#cat-security`). (P2) |
| Popular row | card grid | shown | registry `popular` tools in their fixed order | Shortcut to the most-used tools. Set: the reference's popular block plus Rotate: Rotate, Edit PDF, Compress, Delete pages, Merge, Split, Crop, Fill & sign, PDF to Word, Extract pages. Usable tools (`beta` / `live`) come first, then planned ones; each part keeps the fixed registry order. Always shown (no minimum number of usable tools). Those tools still appear in their own category too. |
| Category groups | `<section>` with an `h2` and a card grid | all shown | registry categories in this order: Organize pages, Edit & sign, Optimize, Security, Convert from PDF, Convert to PDF, Scans, Automate | Each of the 45 tools appears in exactly one group (no duplicates across groups, unlike the reference). Order within a group follows the registry. |
| Tool card | a single link: name, summary, status badge | – | – | Usable tool (`beta` or `live`): links to `/<slug>`. `beta` shows a small "Beta" badge. `planned`: muted style, visible "Coming soon" badge, links to the coming-soon page `/<slug>` (§4). The badge text is part of the link's accessible name. |
| Recent row (home) | card row above Popular | hidden when empty | up to 6 usable tools | Same data as the menu's Recent group (§3d). The reference only shows Recent in the menu, not on the home page. Ours shows it in both. |

### 3c. Header (every page)

Reference: logo; an "All Tools" button with a chevron; 6 shortcut links (Compress, Edit, Fill & Sign, Merge, Delete Pages, Crop) that drop out one by one as the width shrinks (all gone on phones); then Pricing, Desktop, Log in and a language globe on the right. There is no hamburger: on mobile the header shows the logo, All Tools, Pricing and Log in.

| Control | Type | Default | Allowed values | Effect |
|---|---|---|---|---|
| Logo | link | – | – | Goes to `/`. Accessible name "InstaPDF home". |
| All tools | `<button aria-expanded aria-controls>` | collapsed | open / closed | Toggles the tool menu (3d / 3e). |
| Shortcut links | text links | – | up to 5 usable tools (status not `planned`), in popular order and then registry order | Quick access. **Never point to a planned tool.** Today that means only Rotate. Hidden below 768 px. |
| Right-hand area | – | – | – | Pricing, Log in and Account are **deferred to F19**. The language picker is **deferred to F22**. The desktop-app link is out of scope. F2 leaves this area empty (no dead buttons). |

### 3d. Desktop tool menu (mega menu, viewport ≥ 768 px)

Reference behavior (from the page and its script):
- It opens on click (and clicking again closes it) and also on mouse hover over the button (hover-intent). It does not close when the mouse leaves.
- When it opens, the page jumps to the top, a full-width panel appears under the header, and a dim backdrop covers the rest.
- It closes on Escape, a click on the backdrop, or the × button. Its links are plain links.
- Columns: Recent, Merge, Split, Edit & Sign, Compress, Security, Convert from PDF, Convert to PDF, Other, Scans, Automate. Each entry is an icon and a name. The description appears as a hover tooltip. Recent tools get a "New" tag.
- Recent column: pinned tools first, then visited tools (newest first; a tool is added only the first time it is visited and is **not** moved to the front on later visits; at most 12 stored), then the 5 defaults (Compress, Edit, Extract Pages, Merge, Crop). Duplicates are removed and at most 13 are shown. Hovering an entry reveals a pin toggle.
- Under the menu is a "suggest a missing feature" mail link. There is no ARIA: no `aria-expanded`, no roles, and focus does not move.

| Control | Type | Default | Allowed values | Effect |
|---|---|---|---|---|
| Panel | region under the header plus backdrop | closed | open / closed | Lists all tools. Our panel does not scroll the page to the top when it opens. |
| Menu search | `type=search`, focused on open | empty | any text | Same matching as the catalogue search (one shared function). It filters the menu entries and hides empty groups, and shows a no-results line. Enter opens the first visible match (P2). |
| Recent group | list | hidden when empty | up to 6 usable tools, most recent first | See §3f. **No defaults**: with no history the group is not rendered (the reference pads it with defaults; ours would mostly be coming-soon tools). |
| Category groups | heading plus list | all shown | the same 8 categories as the catalogue | Each entry is name plus status badge, linking to `/<slug>`. The summary is available as a `title` tooltip or as visible small text (step 3 Design decides). |
| Close | × button, Escape, backdrop click, choosing an entry, route change | – | – | Closes the panel. Escape and × return focus to the All tools button. |
| Hover open | pointer hover ≥ 300 ms on the button | – | – | Opens the panel (pointer devices only). Moving the mouse away does not close it, matching the reference. (P2; Design may drop it.) |

### 3e. Mobile tool menu (viewport < 768 px)

Reference: the same mega menu in 2 columns, without the Recent column. The page behind still scrolls and there is no focus handling.

Ours: a full-screen dialog (`role=dialog`, `aria-modal=true`) with a sticky top bar holding the search field and a close button, then Recent (if any) and the 8 groups in one column. Background scrolling is locked and focus is trapped. Closing returns focus to the menu button.

### 3f. Recent tools (device-only)

| Rule | Value |
|---|---|
| Storage | `localStorage["instapdf:recent-tools"]`, a JSON array of slugs, newest first |
| When recorded | When a **usable** tool page (`beta` / `live`) is opened. Coming-soon pages, the home page, 404 and footer pages are not recorded. |
| Order | Move to front: revisiting a tool moves it to the front (the reference does not, which we treat as a bug) |
| Cap | 12 stored, 6 shown |
| Unknown or now-planned slugs | Skipped on read, not shown |
| Corrupt value or localStorage unavailable | Treated as empty. No error is shown and nothing breaks. The next record overwrites a corrupt value. |
| Clear | A small "Clear" button on the Recent group empties the list and hides the group (P2, our improvement) |
| Network | Never sent to any server |

### 3g. Footer (every page)

Reference: three columns (resources/company; API; legal), an A–Z list of every tool, a language list and a contact address. Ours:

| Group | Links | Target in F2 |
|---|---|---|
| Tools | All tools (`/#tools`) plus an A–Z list of every tool (status badge on planned ones) | Tool pages or coming-soon pages |
| Company | About, Help | Placeholder pages (F21 replaces them) |
| Legal | Privacy, Terms, Cookies, Security | Placeholder pages (F21) |
| Bottom line | `© <current year> InstaPDF` plus a one-line privacy note | – |

Placeholder page: HTTP 200, the shared header and footer, an `h1` with the page name, a short "being written" note, `noindex`. Language links, pricing, desktop and API links are deferred (F19, F21, F22).

### 3h. Not in F2 (deferred or dropped)

- Accounts, log in, pricing, usage counters: **F19**.
- Language picker and translated home pages: **F22**.
- Marketing blocks on the reference home page (product comparison panel, review-score badge, the long how-to guide list): **F21** may add our own versions. Not in F2.
- "Suggest a missing feature" link: F21 (contact).
- Terms-update banner and cookie consent: F21 (the home page sets no cookies).

## 4. States

| State | What the user sees | Notes |
|---|---|---|
| **Initial (server-rendered)** | Header, hero, Popular row, 8 groups with all 45 cards, footer. The HTML works without JavaScript (links only). | Recent row absent in the server HTML. It appears after hydration if storage has entries. |
| **Recent empty** | No Recent row on the home page and no Recent group in the menu | Fresh profile, cleared list, or unavailable storage |
| **Recent populated** | A Recent row and group with up to 6 usable tools, newest first | |
| **Searching** | Only matching cards. Popular row hidden. Empty groups hidden. Live count announced. | |
| **No results** | Message plus Clear search | |
| **Menu closed / open (desktop)** | Panel plus backdrop when open. `aria-expanded` mirrors the state. | |
| **Menu open (mobile)** | Full-screen dialog, body scroll locked | |
| **Coming-soon tool page** (`/<planned slug>`) | Header, `h1` with the tool name, its summary, a clear "coming soon" status, **no file picker**, a link back to all tools, and a short list of tools available now. `noindex`. HTTP 200. | Replaces what would otherwise be a 404. It is not recorded in Recent. |
| **Not found** (unknown path) | Header, a not-found message, a link to all tools, footer. HTTP 404. | |
| **Uploading / processing / done / limit reached / session expired** | Not applicable: the home page runs no task | Covered by F1 and the tool features |

## 5. Errors and limits

| Case | Reference | InstaPDF |
|---|---|---|
| Unknown URL | Reference 404 page | Our 404 page with header, footer and a link to the catalogue. Status 404. |
| Tool not built yet | Not applicable (all reference tools exist) | Coming-soon page, never a 404 or a dead link (state above) |
| Corrupt recent-tools storage | Silently treated as empty (try/catch) | Same. No console error. |
| Storage blocked (private mode, disabled) | Same try/catch | Same. Recent hidden, everything else works. |
| JavaScript disabled or failed | The catalogue still works (static links). The menu does not open. | Same for the catalogue. The All tools button falls back to a link to `/#tools` (progressive enhancement). |
| Limits | None on this page | None |

## 6. Output

The home page produces no file. Its "output" is navigation:

- Every tool card, menu entry, shortcut and footer tool link goes to `/<registry slug>` (not the reference slug: `rotate-pdf`, not `rotate-pdf-pages`). The evaluator maps them through the registry `ref` field.
- A usable tool opens its F1 empty state. A planned tool opens its coming-soon page.
- No link anywhere on the home page, in the header, menu or footer returns 4xx or 5xx.
- Recent tools change only `localStorage` on this device.
- The home page makes no network request to third-party origins (fonts are self-hosted) and sets no cookies.

## 7. Acceptance criteria

All run against the staging site. "Usable" means registry status `beta` or `live` (today: Rotate only). "Planned" means status `planned` (today: the other 44). Tests read expected counts and names from the registry, so they stay valid as tools ship. The numbers in brackets are today's values.

### Hero and page basics

- **AC-1 (P0)** `GET /` returns 200. The page has exactly one `h1`, a `<title>` containing "InstaPDF" and a non-empty meta description.
- **AC-2 (P0)** The hero's primary call to action is visible without scrolling at both 1366×900 and 375×812.
- **AC-3 (P0)** Activating the primary call to action, while the `featured` tool is planned, brings the catalogue heading into the viewport, sets the URL hash to `#tools` and focuses the catalogue search field. If the featured tool is usable, it navigates to `/<featured slug>` instead.
- **AC-4 (P1)** The hero's "see all tools" link shows the registry tool count [45] and scrolls the catalogue heading into view.

### Catalogue

- **AC-5 (P0)** The category sections of the catalogue (not counting Popular or Recent) contain exactly one link per registry tool [45]. The set of hrefs equals `/<slug>` for every registry slug, with no duplicates.
- **AC-6 (P0)** The category headings appear in this order: Organize pages, Edit & sign, Optimize, Security, Convert from PDF, Convert to PDF, Scans, Automate (our labels may differ in wording but not in order or grouping). Each tool sits under its registry category.
- **AC-7 (P0)** Each card shows the tool's registry name and summary, and the whole card is a single link.
- **AC-8 (P0)** The Rotate card links to `/rotate-pdf`, has no coming-soon badge, and clicking it opens the Rotate tool in its empty state (a file input that accepts `.pdf` is present).
- **AC-9 (P0)** Every planned tool card [44] shows a visible "Coming soon" badge, and its link's accessible name includes it. No usable tool card shows it.
- **AC-10 (P0)** A crawl of every internal `href` on `/` (header, menu, catalogue, footer) finds no response with status ≥ 400.
- **AC-11 (P1)** A Popular row appears above the category sections, whatever the number of usable tools in it. It holds the registry's popular tools, usable ones first and then planned ones, each part in the fixed popular order [today: Rotate, then Edit PDF, Compress, Delete pages, Merge, Split, Crop, Fill & sign, PDF to Word, Extract pages], with the same badges as the catalogue.
- **AC-12 (P1)** With JavaScript disabled, `/` still contains every catalogue link [45] (server-rendered).
- **AC-13 (P1)** A usable tool in `beta` status [Rotate] shows a "Beta" badge on its card and menu entry.
- **AC-14 (P2)** Category jump links scroll the matching section heading into view and update the URL hash.

### Search

- **AC-15 (P0)** The home page has a labeled search field (`type=search`). Typing `split` shows the Split, Split by bookmarks, Split by size, Split by text and Split in half cards and hides Merge, Rotate and Compress. There is no submit step.
- **AC-16 (P1)** Matching ignores case and surrounding spaces: `  ROTATE ` shows the Rotate card.
- **AC-17 (P1)** Keywords match: `encrypt` shows Protect; `jpg` shows both Image to PDF and PDF to image; `combine` shows Merge and Combine & reorder; `ppt` shows PDF to PowerPoint.
- **AC-18 (P1)** While a query is active, the Popular and Recent rows are hidden, and so is every category heading with no visible match.
- **AC-19 (P1)** The query `zzqx` shows a no-results message with a Clear search button. Clicking it empties the field, shows all tools again [45 category links] and focuses the field.
- **AC-20 (P1)** Pressing Escape in a non-empty search field clears it and shows all tools again.
- **AC-21 (P2)** A polite live region announces the number of matching tools after typing.
- **AC-22 (P2)** Turning on the available-only toggle hides every planned card. Today exactly one card (Rotate) remains.

### Header and desktop menu (1366×900)

- **AC-23 (P0)** `/`, `/rotate-pdf`, a coming-soon page (`/merge-pdf`), a footer placeholder page and the 404 page all show the same header: a logo link to `/` and an All tools button.
- **AC-24 (P0)** Clicking All tools opens the menu and sets `aria-expanded="true"`. Clicking it again closes the menu and sets `aria-expanded="false"`.
- **AC-25 (P0)** The open menu lists every registry tool [45] under the same 8 category headings, and planned entries carry the coming-soon badge.
- **AC-26 (P0)** Pressing Escape with the menu open closes it and puts keyboard focus back on the All tools button.
- **AC-27 (P1)** Clicking the backdrop outside the panel closes the menu. So does the close (×) button.
- **AC-28 (P1)** When the menu opens, its search field has focus. Typing `split` filters the menu entries the same way as AC-15, and `zzqx` shows a no-results line.
- **AC-29 (P1)** Choosing Rotate in the menu opens `/rotate-pdf`, and the menu is closed on the new page.
- **AC-30 (P1)** With the menu open, Tab moves through the search field and then every visible tool link, with a visible focus indicator on each.
- **AC-31 (P1)** At ≥ 768 px the header shows at most 5 tool shortcut links, and none of them goes to a planned tool [today: exactly one, Rotate].
- **AC-32 (P1)** Opening the menu does not change the page's scroll position. Checked by scrolling 600 px down and then opening the menu.
- **AC-33 (P2)** At 1280×720, every menu entry [45] can be reached by scrolling inside the panel or the page.
- **AC-34 (P2)** Hovering the All tools button for at least 300 ms with a mouse opens the menu. Moving the pointer away does not close it.
- **AC-35 (P2)** In the menu search, pressing Enter opens the first visible match (`rota` then Enter goes to `/rotate-pdf`).

### Mobile (375×812)

- **AC-36 (P0)** The header shows the logo and the menu button. No tool shortcut links are shown, and the page has no horizontal scroll.
- **AC-37 (P0)** Tapping the menu button opens a `role=dialog` with `aria-modal="true"`. It contains a search field and all registry tools [45] grouped by category. The close button closes it and returns focus to the menu button.
- **AC-38 (P1)** While the mobile menu is open, Tab and Shift+Tab stay inside it (focus trap), and the page behind does not scroll (`scrollY` unchanged after a wheel or touch scroll).
- **AC-39 (P1)** The catalogue cards are at least 44 px tall and do not overflow the viewport. Search works the same as AC-15.

### Recent tools

- **AC-40 (P1)** In a fresh browser profile, neither the home page nor the menu shows a Recent group.
- **AC-41 (P1)** After opening `/rotate-pdf` and coming back to `/`, the home page Recent row and the menu Recent group both show Rotate first. `localStorage["instapdf:recent-tools"]` starts with `"rotate-pdf"`.
- **AC-42 (P1)** Opening a coming-soon page (`/merge-pdf`), a placeholder page or an unknown path does not change the stored recent list.
- **AC-43 (P1)** Seeding the store with `["no-such-tool","merge-pdf","rotate-pdf"]` shows only Rotate in Recent (unknown and planned slugs are skipped).
- **AC-44 (P1)** Seeding the store with the invalid value `{oops` gives a working home page with no Recent group and no uncaught error. Opening `/rotate-pdf` then rewrites the value to a valid JSON array starting with `"rotate-pdf"`.
- **AC-45 (P1)** With `localStorage` access throwing (made to fail by an init script), the home page, menu and search still work, and no Recent group is shown.
- **AC-46 (P2)** The stored list holds at most 12 slugs, and a revisited tool moves to the front. Checked by seeding a list of 12 that ends with `rotate-pdf`, then opening `/rotate-pdf`: the list is still 12 long and starts with `rotate-pdf`.
- **AC-47 (P2)** The Recent group's Clear button empties the stored list and hides the group on the home page and in the menu.

### Coming-soon, placeholder and 404 pages

- **AC-48 (P0)** `/merge-pdf` (a planned tool) returns 200. It shows an `h1` with the tool's registry name, a visible coming-soon status, no file input, and a link back to the catalogue (`/#tools`).
- **AC-49 (P1)** Coming-soon and footer placeholder pages carry `<meta name="robots" content="noindex">`. The home page and usable tool pages do not.
- **AC-50 (P1)** `/does-not-exist` returns HTTP 404 and shows the shared header and footer, a not-found message, and a link to the catalogue.
- **AC-51 (P2)** The coming-soon page lists the tools available now [Rotate] as links.

### Footer

- **AC-52 (P0)** Every page from AC-23 has a footer with links to All tools, About, Help, Privacy, Terms, Cookies and Security, and a copyright line with the current year. Each of those links returns 200.
- **AC-53 (P2)** The footer has an A–Z list of every registry tool [45 links], each going to `/<slug>`.

### Privacy, performance, accessibility

- **AC-54 (P0)** Loading `/` and opening the menu makes no network request to any origin other than the staging origin, and sets no cookies.
- **AC-55 (P1)** Lighthouse (mobile preset) scores `/` at 90 or more for performance (the evaluator pass bar).
- **AC-56 (P1)** axe reports no critical or serious violations on `/` with the menu closed, the desktop menu open, search showing no results, and the mobile menu open.
- **AC-57 (P1)** `/` has no horizontal scroll at widths of 320, 375, 768, 1024 and 1440 px.
- **AC-58 (P2)** The first Tab stop on every page is a "skip to content" link that moves focus to `<main>`.

**Totals: 58 ACs: 19 P0, 28 P1, 11 P2.**

### Deferred (specified here, built later)

- **D-1 (F19)** Header Pricing, Log in and Account entries, and usage counters.
- **D-2 (F22)** Language picker in the header and footer, and translated catalogue text.
- **D-3 (later, P2)** Pinning tools in Recent. The reference keeps pinned tools above recent ones and toggles them from a pin icon on hover. Worth doing once more than a handful of tools are usable.
- **D-4 (F21)** Real About, Help, Privacy, Terms, Cookies and Security pages replace the F2 placeholders. Optional marketing blocks on the home page (our own copy).

## 8. Decisions for review

1. **Planned tools link to a coming-soon page** (HTTP 200, `noindex`) instead of being unclickable. That keeps URLs stable for when each tool ships and makes the "no broken links" check simple. The alternative is non-link cards with `aria-disabled`.
2. **Hero call to action** points to the catalogue until a `featured` tool (proposed: the editor, F16) is usable, so the hero never sends people to a placeholder. Another option is to feature Rotate now, but it is a weak headline tool.
3. **Popular row = the reference's popular set plus Rotate.** Decided by the orchestrator (2026-11-23): Rotate is included, usable tools are ordered before coming-soon ones within the row, and the row is always visible (no hide-until-3-usable rule).
4. **Header shortcuts show usable tools only** (today just Rotate). The reference shows 6 popular tools.
5. **Recent:** no padding with defaults, revisits move a tool to the front, 6 shown, and it also appears on the home page. All four differ from the reference.
6. **Search is visible** on the home page and in the menu (the reference's is hidden), and it includes registry `keywords`. That needs a new registry field.
7. **No duplicate cards across categories** (the reference lists Crop, Compress, Delete pages and others twice). The Popular row is the only duplicate.

## Improvements

Research, 2026-11-23. iLovePDF, Smallpdf and PDF24 were blocked by this session's network proxy, so claims about them come from web search results and prior knowledge. Claims marked *(unverified)* were not checked on the live site this time. PDFgear, Adobe and Stirling-PDF claims come from search results (vendor pages, release notes) unless also marked.

Quick read of the field: all six show a grid of tool cards with an icon each, grouped or filterable by category. iLovePDF and Adobe filter the grid with category chips *(unverified)*. Smallpdf's flow is "pick a tool, then drop the file" and it has a Tools menu plus a header search entry. PDFgear's selling point is that its online tools run locally in the browser. Stirling-PDF (v3) has a tool search, suggests tools based on past use and earlier versions let users star favourites *(favourites unverified)*. None of them shows a tool's processing location (browser or server) on the card itself.

| Idea | Seen at | User benefit | Cost | Adopt/skip | Reason |
|---|---|---|---|---|---|
| "Runs in your browser" marker on cards and menu entries for `runtime: "client"` tools | PDFgear (promotes local processing site-wide, not per card); Stirling-PDF (self-hosted) | Visitors see before they start which tools never upload their file | S | **Adopt** → AC-59 | The registry already has `runtime`; this is our main privacy edge and costs only a badge. |
| One icon per tool on cards and menu entries | All six (iLovePDF, Smallpdf, PDF24 *(unverified)*) | Faster scanning of a 45-tool grid, especially on mobile | M | **Adopt** → AC-60 | Use a permissive icon set (Lucide, ISC) as inline SVG, so there are no extra requests and no license issue. |
| `/` keyboard shortcut focuses search (home) or opens the menu with search focused (other pages) | Not seen at the six; common web pattern (GitHub, MDN) | Keyboard users get to any tool in two keystrokes | S | **Adopt** → AC-61 | Tiny client-side handler that must not fire while typing in a field. |
| Search query kept in the URL (`/?q=split`) | Not seen at the six *(unverified)* | Back button and reload keep the filter, and a filtered view can be shared | S | **Adopt** → AC-62 | Uses `history.replaceState`. It is read on the client only, so the server HTML stays complete (AC-12). |
| Highlight the matched text in card names and summaries | Stirling-PDF tool search *(unverified)* | Shows why a card matched, which matters for keyword-only hits | S | **Adopt** → AC-63 | A `<mark>` around the substring using the shared match function. |
| Category filter chips that hide the other groups | iLovePDF, Adobe *(unverified)* | Narrows the grid to one group | S | Skip | AC-14 jump links cover this without hiding tools. Adding filtering as well would duplicate the search UX. |
| Drop a PDF anywhere on the home page, then pick a tool | Adobe Acrobat online, Smallpdf home toolbox *(unverified)* | Saves a step for people who start with a file | M | Skip | Today only Rotate is usable, and passing files to a tool needs an in-browser handoff that F1 does not have. Revisit once 5 or more tools are usable. |
| Favourite/star tools | Stirling-PDF *(unverified)* | Personal shortlist | S | Skip | Already planned as pinning (D-3). |
| Tool suggestions ranked by past use | Stirling-PDF v3 release notes | Most-used tools surface first | S | Skip | Recent tools (§3f) already cover this. Ranking would make the order unpredictable. |
| Typo-tolerant (fuzzy) search | Not confirmed at the six | `comress` still finds Compress | S | Skip | Risks false hits (it would break AC-15's "split hides Merge"). Keywords cover the common synonyms. |
| "Notify me when ready" on coming-soon pages | Common on product sites; not seen at the six | Visitors come back when the tool ships | M | Skip | Needs email storage and sending, so it is server-side, involves personal data and is not budget-neutral. Belongs with F19/F21. |
| Dark mode | Stirling-PDF (Docker Hub listing) | Comfort | M | Skip | Site-wide design-system work, not specific to the home page. Better done once for all pages. |
| Installable PWA / offline catalogue | PDF24 and PDFgear offer desktop apps instead *(unverified)* | Works offline | L | Skip | Too big for F2. Belongs with a later platform feature. |
| Prefetch tool pages on hover | Common Next.js behavior | Faster tool opening | S | Skip | `next/link` already prefetches by default, so there is nothing extra to specify. |

### Acceptance criteria (improvements)

The evaluator does not hold the reference to these, but they must work on staging.

- **AC-59 (P1) (improvement)** Every catalogue card and menu entry of a tool with registry `runtime: "client"` shows a visible "Runs in your browser" marker (an icon with text, or text alone). The marker text is part of the link's accessible name. Tools with `runtime: "server"` do not show it. This also applies to planned tools, because it describes how the tool will work.
- **AC-60 (P2) (improvement)** Every catalogue card and menu entry shows an icon. Icons are inline SVG with `aria-hidden="true"` (the name stays the accessible label), loading `/` makes no extra network request for icons, and the icon package's license is MIT, ISC, Apache-2.0 or BSD.
- **AC-61 (P2) (improvement)** Pressing `/` while focus is not in a text input, textarea or contenteditable element focuses the catalogue search field on `/`, and opens the tool menu with its search field focused on any other page. The `/` character is not typed into the field. Pressing `/` inside a text field types it normally.
- **AC-62 (P2) (improvement)** Typing in the catalogue search updates the URL to `/?q=<query>` with `replaceState` (no new history entries per keystroke). An empty query removes `q`. Loading `/?q=split` shows the same filtered result as typing `split` (AC-15) with the query in the field. The server HTML for `/?q=…` still contains all catalogue links (AC-12).
- **AC-63 (P2) (improvement)** While a query is active, the matched substring in each visible card's name or summary is wrapped in `<mark>` (case-insensitive, for example `rot` gives `<mark>Rot</mark>ate`). A card matched only by a keyword shows no highlight and is still shown. Clearing the query removes every `<mark>`.

**Totals with improvements: 63 ACs: 19 P0, 29 P1, 15 P2 (5 improvements).**
