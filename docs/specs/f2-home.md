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

## UI

Designed 2026-11-23 by ux-designer. This is the build contract for the home page, the site header and tool menu, the footer, and the coming-soon, placeholder and 404 pages. It extends the F1 design system (`docs/specs/f1-shared-flow.md`, `## UI`): same tokens, primitives, focus style, motion rules and breakpoints. Where this section says "F1 U-x" it means that section of the F1 spec. The look is InstaPDF's own. The reference screenshots are for behavior only and are never a visual guide.

### H-1. Design principles for the home page

1. **One step to the tool.** A visitor who knows what they want types two letters (search is on the page and in the header menu, and `/` focuses it) or clicks a card. No intermediate pages, no hover-only paths.
2. **Honest catalogue.** Usable tools look and feel live (raised card, tinted icon, lift on hover). Planned tools are clearly quieter (flat card, dashed border, grey icon, "Coming soon" badge) but still readable at full contrast. Nobody should click a coming-soon card by mistake and be surprised.
3. **Privacy is visible.** The "Runs in your browser" marker sits on every client tool, in the same place on every card, so it reads as a property of the tool, not as marketing.
4. **Compact hero, catalogue above the fold on desktop.** At 1280×800 the catalogue heading, the search field and the first row of cards are visible without scrolling. A big hero would only add scrolling.
5. **Server first, small islands.** The page is static HTML. Only search/filter, the menu and the recent-tools list are client code. No layout shift from hydration (H-10).

### H-2. Tokens: additions to F1 U-2

Only additions. Everything else comes from `apps/web/src/styles/tokens.css` unchanged.

| Token | Value | Use |
|---|---|---|
| `--text-4xl` / line height | 3rem / 3.5rem (48/56) | Hero `h1` at ≥ 1024 only |
| `--ip-z-header` | 20 | Site header at rest (same as today) |
| `--ip-z-header-open` | 50 | Site header while the desktop menu is open, so the panel covers the F1 dock (z 20), notices (30) and drop overlay (40) |
| `--ip-menu-max-h` | `calc(100dvh - var(--ip-header-h) - 32px)` | Desktop menu panel height cap (the panel scrolls inside) |
| `--ip-recent-h` | 92px (< 640) / 96px (≥ 640) | Reserved height of the home Recent row (heading 28 + gap 12 + chip row 52 / 56) |

Mark (search highlight): no new color. `<mark>` uses `bg-primary-soft`, `color: inherit`, `rounded-[3px]`, `px-0.5 -mx-0.5` (no width change), plus `box-shadow: inset 0 -2px 0 var(--ip-primary)` as a non-color cue. No weight change, so a highlight never re-wraps a line.

**New contrast pairs (WCAG 2.1, measured)**

| Pair | Light | Dark | Where |
|---|---|---|---|
| `fg-muted` on `surface-sunken` | 5.92 | 8.29 | "Coming soon" badge text |
| `on-primary-soft` on `primary-soft` | 8.79 | 8.97 | "Beta" badge, active chip, open menu button |
| `fg` on `primary-soft` | 15.27 | 12.62 | highlighted name text |
| `fg-muted` on `primary-soft` | 5.93 | 6.16 | highlighted summary text |
| `fg-muted` on `surface` | 6.36 | 7.54 | planned card summary, footer text |
| `success` on `surface-raised` / `surface` (icon, non-text 3:1) | 5.40 / 5.00 | 8.48 / 9.23 | runtime marker icon |
| `primary` on `primary-soft` (icon) | 6.53 | 5.43 | usable card icon tile |
| `border-strong` on `surface` (non-text) | 3.54 | 3.85 | switch track, planned card dashed border on hover, search field border |

All pairs pass AA for normal text (4.5:1) and non-text (3:1). The planned-card dashed `border` at rest is decorative: the "Coming soon" text badge carries the meaning.

### H-3. Icons (AC-60)

- **Source: Lucide**, license **ISC** (`lucide-static` / `lucide` 1.78.0 checked on npm, 2026-11-23). A handful of Lucide icons derive from Feather (**MIT**); both notices ship together in Lucide's LICENSE. Both are on our allow list.
- **Do not use `lucide-react`.** In 1.x its base `Icon` module is marked `"use client"` and reads a React context, so every tool icon would become a client component and land in the first-load JS. Instead **vendor the path data**: add `lucide-static@1.78.0` as an exact-pinned **devDependency**, and a script `apps/web/scripts/gen-tool-icons.mjs` that reads the SVGs listed below and writes `apps/web/src/tools/tool-icons.tsx`: one plain server-safe SVG component per tool (no hooks, no `"use client"`), same frame as F1 `icons.tsx` (24×24 viewBox, `stroke="currentColor"`, `strokeWidth={1.75}`, round caps and joins, `aria-hidden="true"`, `focusable="false"`, `width`/`height` attributes set). The generated file carries the Lucide ISC notice and the Feather MIT notice in its header comment. Commit the generated file. No runtime dependency is added.
- Tool icons are imported **only by server modules**. They reach client islands as already-rendered `ReactNode`s inside props (H-5 `ToolIndexProvider`), so they cost RSC payload bytes, not JS.
- UI chrome icons (search, menu grid, chevron down, clock, device, arrow right, history) are added to F1's `components/ui/icons.tsx` as our own drawings (same style), because client islands import them.
- Mapping (all names exist in 1.78.0; the generator fails the build if one goes missing):

| Tool | Icon | Tool | Icon | Tool | Icon |
|---|---|---|---|---|---|
| merge-pdf | merge | n-up | grid-2x2 | grayscale-pdf | contrast |
| split-pdf | split | pdf-editor | square-pen | repair-pdf | wrench |
| extract-pages | file-output | fill-sign | signature | protect-pdf | lock-keyhole |
| delete-pages | file-minus | create-forms | text-cursor-input | unlock-pdf | lock-keyhole-open |
| rotate-pdf | rotate-cw | watermark-pdf | stamp | pdf-to-word | file-text |
| organize-pdf | layout-grid | page-numbers | list-ordered | pdf-to-excel | sheet |
| combine-reorder | combine | header-footer | panel-top | pdf-to-ppt | presentation |
| alternate-mix | shuffle | bates-numbering | hash | pdf-to-image | image |
| split-by-bookmarks | bookmark | edit-metadata | tags | pdf-to-text | align-left |
| split-by-size | ruler | bookmarks | book-marked | extract-images | images |
| split-by-text | text-search | rename-pdf | file-pen | image-to-pdf | file-image |
| split-in-half | columns-2 | remove-annotations | eraser | word-to-pdf | file-type |
| crop-pdf | crop | flatten-pdf | layers | html-to-pdf | globe |
| resize-pdf | scaling | compress-pdf | shrink | ocr-pdf | scan-text |
| flip-pdf | flip-horizontal-2 | | | deskew-pdf | scan |
| | | | | workflows | workflow |

  Store the icon name on the registry entry (`icon: "rotate-cw"`) or in a slug→component map next to the generated file; the engineer picks. A unit test asserts every registry slug has an icon.

### H-4. Layout

Shared frame on every page (root layout): skip link → `SiteHeader` (56 px, sticky) → page `main#main` → `SiteFooter`. Container `max-w-[1280px]`, gutters 16 / 24 / 32 (F1 U-2). Section rhythm on the home page: 48 between hero and catalogue (32 below 640), 40 between catalogue groups (32 below 640).

#### 1280 px (≥ 1024 behaves the same, 3 card columns at 1024–1279)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ InstaPDF   [▦ All tools ▾]   Rotate                                          │ header 56
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │ pt 48
│ Fast, private PDF tools                                                      │ h1 4xl 600
│ Organize, edit and convert PDFs without installing anything. Most tools run  │ lg fg-muted, max-w 640
│ right in your browser, so your files stay on your device.                    │
│ [🔍 Find a tool]   See all 45 tools ⌄                                        │ primary lg + text link
│ 🔒 Most tools never upload your files    ✓ No account needed                 │ sm fg-muted
│                                                                              │ 48
│ All tools                                       45 tools · 1 ready now       │ h2 2xl (#tools)
│ [🔍 Search tools, e.g. "merge" or "jpg"     / ]  (◯ Only ready tools)  45 shown │ toolbar 48
│ [Organize pages 12] [Edit & sign 16] [Optimize 3] [Security 2] [Convert…] …  │ jump chips 36
│                                                                              │
│ Recently used                                                     Clear      │ h3 (only with history)
│ [⟳ Rotate] [..] [..]                                                         │ chips 44
│                                                                              │
│ Popular                                                                      │ h3 lg
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                                 │ tiles, 5 columns
│ │ ⟳    │ │ ✎    │ │ ⇲    │ │ ⊟    │ │ ⇉    │                                 │
│ │Rotate│ │Edit… │ │Compr…│ │Delet…│ │Merge │                                 │
│ │Beta  │ │Soon  │ │Soon  │ │Soon  │ │Soon  │                                 │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘   (second row of 5)             │
│                                                                              │
│ Organize pages  12 tools                                                     │ h3 xl + count
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐ │ cards, 4 columns
│ │[ic] Merge       │ │[ic] Split       │ │[ic] Extract…    │ │[ic] Delete…  │ │
│ │ Join PDFs and…  │ │ Break a PDF …   │ │ Keep only the … │ │ Remove unw…  │ │
│ │ Coming soon ·   │ │ Coming soon ·   │ │ ...             │ │              │ │
│ │ ▭ Runs in your… │ │ ▭ Runs in your… │ │                 │ │              │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ └──────────────┘ │
│ ... 7 more groups ...                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ footer (surface)                                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Hero: single column, left-aligned, text `max-w-[640px]`, no illustration and no background image (fast LCP; the `h1` is the LCP element). `pt-12 pb-0`. CTA row: primary `Button lg` with search icon, then a text link (`primary`, `base` 500, chevron-down icon, 44 px tall hit area). Trust row 24 px below, two items with 16 px icons (`success` lock, `success` check), `sm fg-muted`, gap 24.
- Catalogue header: `h2` "All tools" (`2xl` 600) with `id="tools"` on its wrapper (`scroll-margin-top: calc(var(--ip-header-h) + 16px)`), and on the same baseline at the end a `sm fg-muted` summary "45 tools · 1 ready now" (both from the registry).
- Toolbar (16 below the heading): `SearchField` (`max-w-[480px]`, 48 tall), then the `Switch` "Only ready tools", then, pushed to the end, the visible result count "45 shown" (`sm fg-muted tabular-nums`, fixed `min-w-[8ch]`, right-aligned). One row, 48 tall.
- Jump chips (12 below): `nav aria-label="Categories"`, a wrapping row of link chips, 36 tall (44 hit area through 4 px vertical padding overflow), gap 8. Each: label + count in `fg-muted`.
- Recent row (32 below the chips): reserved `--ip-recent-h` box when history exists (H-10). Chips 44 tall, one row; up to 6 fit at 1280.
- Popular (32 below): `h3` "Popular" (`lg` 600), tiles in `grid-cols-5` gap 16 (two rows of five for today's 10).
- Groups: `section` per category, `h3` (`xl` 600) + count "12 tools" (`sm fg-muted`), cards in `grid-cols-4` at ≥ 1280 and `grid-cols-3` at 1024–1279, gap 16, `align-items: stretch` (equal heights per row).

#### 768 px (640–1023)

```
┌──────────────────────────────────────────┐
│ InstaPDF  [▦ All tools ▾]  Rotate        │ header 56, ≤ 3 shortcuts
├──────────────────────────────────────────┤
│ Fast, private PDF tools                  │ h1 3xl
│ Organize, edit and convert PDFs …        │ lg
│ [🔍 Find a tool]  See all 45 tools ⌄      │
│ 🔒 Most tools never upload…  ✓ No account │
│                                          │
│ All tools            45 tools · 1 ready  │
│ [🔍 Search tools…                    / ] │ row 1: full width
│ (◯ Only ready tools)           45 shown  │ row 2: 44
│ [Organize 12][Edit & sign 16][Optim… →   │ chips scroll sideways
│ Recently used                     Clear  │
│ [⟳ Rotate] [..] →                        │
│ Popular                                  │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐           │ 5 columns
│ ...                                      │
│ Organize pages  12 tools                 │
│ ┌──────────────────┐ ┌──────────────────┐│ 2 columns
│ └──────────────────┘ └──────────────────┘│
└──────────────────────────────────────────┘
```

- Gutters 24. Hero `pt-10`, `h1` `3xl`.
- Toolbar on two rows: search full width; then switch (start) and count (end).
- Jump chips: one row, `overflow-x: auto`, `scroll-snap-type: x proximity`, scrollbar thin (not hidden), a 24 px fade mask at the end edge (`mask-image`), `scroll-padding-inline: 24px`. Focusing a chip scrolls it into view (native).
- Recent chips: same horizontal scroller.
- Popular: `grid-cols-5`, gap 12. Cards: `grid-cols-2`, gap 16.

#### 375 px (< 640)

```
┌───────────────────────────────┐
│ InstaPDF       [▦ All tools]  │ header 56, no shortcuts
├───────────────────────────────┤
│ Fast, private                 │ h1 2xl
│ PDF tools                     │
│ Organize, edit and convert    │ base fg-muted
│ PDFs without installing …     │
│ [      🔍 Find a tool       ] │ primary lg, full width
│      See all 45 tools ⌄       │ text link, centered, 44
│ 🔒 Most tools never upload    │ sm, items stack
│ ✓ No account needed           │
│                               │
│ All tools                     │ h2 xl
│ 45 tools · 1 ready now        │ sm fg-muted (own line)
│ [🔍 Search tools          ]   │ 48
│ (◯ Only ready tools) 45 shown │ 44
│ [Organize 12][Edit & …  →     │ chip scroller
│ Popular                       │
│ ┌────────────┐┌────────────┐  │ tiles 2 columns
│ │ ⟳ Rotate   ││ ✎ Edit PDF │  │
│ │ Beta       ││ Coming soon│  │
│ └────────────┘└────────────┘  │
│ Organize pages · 12 tools     │
│ ┌───────────────────────────┐ │ cards 1 column, horizontal layout
│ │[ic] Merge                 │ │
│ │     Join PDFs and images… │ │
│ │     Coming soon · ▭ Runs… │ │
│ └───────────────────────────┘ │
└───────────────────────────────┘
```

- Gutters 16. Hero `pt-8`; `h1` `2xl`; pitch `base`; the CTA is full width; the secondary link is centered under it. At 375×812 the primary CTA's bottom edge sits at about 360 px (AC-2).
- Catalogue `h2` is `xl`; the "45 tools · 1 ready now" summary drops to its own line.
- Cards: **one column**, icon left (40 px tile), text right. Two-column cards at this width would squeeze the summary to 3–4 lines and make the meta line wrap; one column reads faster and every card stays ≥ 72 px tall (AC-39 needs ≥ 44).
- Popular tiles: `grid-cols-2`, gap 12, each ≥ 96 px tall.
- No element is wider than the viewport at 320 px: chip and Recent rows scroll inside themselves, long names wrap (`overflow-wrap: anywhere` on names), the toolbar's second row wraps (switch above count) below 360 px.

#### Desktop tool menu (≥ 768 px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ InstaPDF   [▦ All tools ▴]   Rotate                                          │ header (z 50 while open)
├──────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Search tools                      ]  45 tools                        [×] │ panel top row 64
│ Recently used  [⟳ Rotate] [..]                                    Clear      │ 52, only with history
│ ──────────────────────────────────────────────────────────────────────────── │
│ Organize pages        Edit & sign            Optimize           Convert from │
│ ⇉ Merge  Coming soon  ⌗ Crop    Coming soon  ⇲ Compress  Soon…  ▤ PDF to Word│ entries 44–52
│   ▭ Runs in your…       ▭ Runs in your…                                     │
│ ⇆ Split  Coming soon  …                      Security           …            │
│ …                                            …                               │
└──────────────────────────────────────────────────────────────────────────────┘
░░░░░░░░░░░░░░░░░░░░░░░░░░░░ scrim (click closes) ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

- `position: fixed; top: var(--ip-header-h); inset-inline: 0`, `surface-raised`, bottom `border`, `shadow-lg`, `max-height: var(--ip-menu-max-h)`, `overflow-y: auto`, `overscroll-behavior: contain`. Inner container is the same 1280 container as the header, padding 24 top / 32 bottom.
- Top row: `SearchField` (`max-w-[420px]`, 44 tall), the count "45 tools" / "5 of 45" (`sm fg-muted tabular-nums`, `min-w-[9ch]`), and the close `IconButton` "Close all tools" at the end (visually first row, end; **last in DOM**, see H-7).
- Groups in CSS multi-column: `columns: 4` at ≥ 1280, 3 at 1024–1279, 3 at 768–1023 (`column-gap: 32px`), each group `break-inside: avoid`, 24 below the previous group. Group heading `sm` 600 `fg-muted` + count. With 45 tools the panel is about 760 px tall at 1280, so at 1280×720 it scrolls inside (AC-33).
- Scrim: `fixed; inset: var(--ip-header-h) 0 0 0`, `bg-scrim`. The header itself is not dimmed (the All tools button stays visible and is the way to close).
- The page is **not** scroll-locked and **not** scrolled (AC-32). The wheel over the panel scrolls the panel (`overscroll-behavior: contain`); the wheel over the scrim scrolls the page, which is harmless because the panel is fixed.

#### Mobile tool menu (< 768 px)

```
┌───────────────────────────────┐
│ [🔍 Search tools      ]  [ × ]│ sticky top bar 68 + safe-area-top
│ 45 tools                      │ xs fg-muted, part of the sticky bar
├───────────────────────────────┤
│ Recently used          Clear  │
│ [⟳ Rotate] [..]  →            │
│ Organize pages · 12           │ h2 sm 600 fg-muted, sticky under the bar? no
│ ⇉ Merge          Coming soon  │ entry 52, full width
│   ▭ Runs in your browser      │
│ ⇆ Split          Coming soon  │
│ …                             │
└───────────────────────────────┘
```

- Native `<dialog>` opened with `showModal()`, full screen: `width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; border: 0`, `bg`. The dialog element itself scrolls; the top bar is `position: sticky; top: 0` inside it with `surface-raised`, bottom `border`, padding `calc(12px + env(safe-area-inset-top)) 16px 8px`. Content padding 16, bottom `calc(24px + env(safe-area-inset-bottom))`.
- Groups in one column, entries full width, 52 tall (44 for server tools with no marker line), badge aligned to the end of the name row.
- Background: `inert` by `showModal()`; scrolling locked with `overflow: hidden` on `<html>` while open (restored on close; scroll position unchanged, AC-38).
- If the viewport crosses 768 px while the menu is open (rotation, resize), the menu closes and focus returns to the trigger. Simpler and safer than live-switching between a modal and a non-modal container.

#### Header

| Width | Content (DOM order) |
|---|---|
| < 768 | Logo (start) · All tools button (end, `md` 44 tall, icon + "All tools") |
| 768–1023 | Logo · All tools button (`sm` 36 visual, 44 hit) · up to **3** shortcut links |
| ≥ 1024 | Logo · All tools button · up to **5** shortcut links |

- Exactly `var(--ip-header-h)` (56) tall at every width; nothing wraps (shortcut labels are `whitespace-nowrap`; the count limits above guarantee fit at 768 with 5 long names: 3 × ~130 + button 132 + logo 96 + gaps < 720). F1's sticky dock (`top: calc(var(--ip-header-h) + 24px)`), sticky workspace toolbar (`top: var(--ip-header-h)`) and fixed bottom dock keep working unchanged because the height and `position: sticky` stay the same.
- `bg` background, bottom `border`. The end of the header is empty in F2 (F19 adds account items there).
- Shortcut links: `sm` 500, `fg-muted`, hover `fg`, 44 px tall hit area, 12 px horizontal padding. The current page has `aria-current="page"`, `fg` text and a 2 px `primary` bar on the bottom edge (non-color cue).
- All tools button: ghost style with a 16 px grid icon, "All tools" and a 16 px chevron-down. Expanded: `primary-soft` background, `on-primary-soft` text, chevron rotated 180°.

#### Footer (every page)

```
1280:  ┌───────────────────────────────────────────────────────────────┐
       │ InstaPDF                 Tools A–Z (4 CSS columns)   Company  Legal │
       │ Fast, private PDF tools. Alternate & mix  Edit PDF …  About    Privacy│
       │ All tools →               …                           Help     Terms  │
       │                                                                Cookies│
       │                                                                Security│
       │ ───────────────────────────────────────────────────────────── │
       │ © 2026 InstaPDF · Browser tools never upload your files.      │
       └───────────────────────────────────────────────────────────────┘
```

- `surface` background, top `border`, padding 48 top / 32 bottom, `mt-24` (64 below 640) after `main`.
- ≥ 1024: grid `[brand 240px] [tools 1fr] [company 140px] [legal 140px]`; the A–Z list uses `columns: 4` (3 at 1024–1279). 640–1023: brand row on top, then tools (`columns: 3`), then company and legal side by side. < 640: brand, tools (`columns: 2`), company and legal side by side.
- Each group is a `nav` with an `h2` (`sm` 600 `fg`), links `sm` `fg-muted` hover `fg` underline. Link rows are 32 px at ≥ 1024 and 44 px below 1024 (touch).
- A–Z tool links show a trailing "Soon" text in `xs fg-muted` for planned tools, with the full "Coming soon" in the accessible name (`<span aria-hidden>Soon</span><span class="sr-only">, coming soon</span>`). Footer entries carry no runtime marker (AC-59 covers cards and menu entries only).
- Bottom line: `© {current year} InstaPDF` and "Browser tools never upload your files." (`xs fg-muted`). The year is computed at render; the page is static, so the build year shows until the next deploy, which happens far more often than yearly. A unit test pins "current year at build".
- **Tool routes with the F1 dock:** below 1024 the dock is `position: fixed` at the bottom, so it would cover the end of the footer. Move the dock clearance from `main` to the footer: add `data-ip-dock` to `ControlDock`'s root and in `globals.css`:
  `@media (max-width: 1023px) { body:has([data-ip-dock]) .ip-site-footer { padding-bottom: calc(var(--ip-dock-actual, var(--ip-dock-h)) + env(safe-area-inset-bottom) + 24px); } }`
  Then the rotate page's `main` bottom padding becomes a normal `pb-12` at every width (the footer now follows `main`, so the last tile row scrolls clear of the dock anyway). F1 AC-49 (primary visible without scrolling, `scrollY` 0) is unaffected because the dock and header are unchanged.

#### Coming-soon page (`/[slug]` for planned tools)

```
375                                   1280
┌───────────────────────────────┐     ┌────────────────────────────────────────────────────┐
│ ← All tools                   │     │ ← All tools                                        │ sm link 44
│ Merge                         │     │ Merge                                               │ h1 2xl (xl < 640), same as F1 ToolIntro
│ Join PDFs and images into a … │     │ Join PDFs and images into a single document         │ fg-muted
│ ┌───────────────────────────┐ │     │ ┌───────────────────────────────────────────────┐   │
│ │ (clock)                   │ │     │ │ (clock 40)  Coming soon                        │   │ status panel, max-w 760
│ │ Coming soon               │ │     │ │ We're still building Merge. It isn't ready yet. │   │ min-h 280 / 420 like the
│ │ We're still building …    │ │     │ │ ▭ When it's ready it will run in your browser, │   │ F1 DropCard, so the page
│ │ ▭ When it's ready it …    │ │     │ │   so your files stay on your device.            │   │ keeps its shape when the
│ │ [  Browse all tools  ]    │ │     │ │ [Browse all tools]                              │   │ tool ships
│ └───────────────────────────┘ │     │ └───────────────────────────────────────────────┘   │
│ Ready to use now              │     │ Ready to use now                                    │ h2 lg
│ ┌───────────────────────────┐ │     │ ┌───────────┐ ┌───────────┐ ┌───────────┐          │ ToolCard grid 1/2/3
│ │[ic] Rotate   Beta         │ │     │ │ Rotate    │ │           │ │           │          │
│ └───────────────────────────┘ │     │ └───────────┘ └───────────┘ └───────────┘          │
└───────────────────────────────┘     └────────────────────────────────────────────────────┘
```

- Same container and gutters as the F1 tool page, so the `h1` sits in the same place before and after the tool ships.
- Status panel: `surface` background, 2 px dashed `border` (decorative), `rounded-xl`, padding 32 (24 below 640), content start-aligned at ≥ 640 and centered below. Clock icon 40 in a `surface-sunken` circle, `h2` "Coming soon" (`lg` 600), body `base fg-muted`. The runtime line appears only for `runtime: "client"` tools; server tools get "When it's ready, files you add will be processed on our servers and deleted within 2 hours." **No file input of any kind** (AC-48).
- Primary: `Button primary md` link "Browse all tools" → `/#tools`. The "← All tools" link above the `h1` also goes to `/#tools`.
- "Ready to use now": `ToolCard` grid of usable tools (registry order). If none were usable the section would be omitted.
- `<title>` "Merge (coming soon) · InstaPDF", `robots: noindex`.

#### Placeholder pages (About, Help, Privacy, Terms, Cookies, Security)

Prose container `max-w-[720px]`, `pt-12`: `h1` (`2xl`) page name, one paragraph `base fg-muted` "We're writing this page. Check back soon.", then a text link "Back to all tools" → `/#tools`. `robots: noindex`. Same header and footer. Nothing else (F21 replaces them).

#### 404 (`app/not-found.tsx`)

Same container as placeholders: `h1` "We couldn't find that page", `base fg-muted` "The link may be old, or the address may have a typo.", primary `Button md` link "Browse all tools" → `/#tools`, then "Ready to use now" cards like the coming-soon page. HTTP 404 (Next `notFound()` / `not-found.tsx`). Not recorded in Recent.

### H-5. Component tree

New folders: `components/site/` (header, menu, footer, page shells), `components/catalogue/` (cards, search, recent). New primitives in `components/ui/`. Existing F1 primitives are reused as they are: `Button`/`buttonClasses`, `IconButton`, `Dialog` (gains a `fullscreen` variant), `LiveRegion`, `VisuallyHidden`, `icons.tsx`.

```
app/layout.tsx (server)
├─ <html suppressHydrationWarning> + <RecentPrepaintScript/>   inline, before body paint (H-10)
├─ <SkipLink/>                                   server; moved out of F1 SiteHeader
├─ <ToolIndexProvider items={toolIndex}>         client; slim tool list + pre-rendered icons
│   ├─ <SiteHeader/>                              server shell
│   │   ├─ <Logo/>                                server link
│   │   ├─ <ToolMenu/>                            CLIENT island: trigger + panel/dialog + "/" shortcut
│   │   │   ├─ <ToolMenuTrigger/>                 button (noscript fallback link)
│   │   │   └─ (mounted while open) <ToolMenuSurface mode="panel"|"dialog">
│   │   │        <SearchField/> <ResultCount/> <RecentStrip/> <ToolMenuGroups> <ToolMenuEntry/>* </ToolMenuGroups> <NoResults/> <IconButton close/>
│   │   └─ <HeaderShortcuts/>                     server; usable tools only
│   ├─ {page}
│   └─ <SiteFooter/>                              server
│
app/page.tsx (server, static)
└─ <main id="main" tabIndex={-1}>
    ├─ <Hero/>                                    server; CTA is a plain <a href="#tools" data-focus-search>
    └─ <Catalogue/>                               CLIENT island (SSR'd: all 45 links in the HTML)
        ├─ <CatalogueHeader/>                     h2 "All tools" + registry summary
        ├─ <CatalogueToolbar> <SearchField/> <Switch/> <ResultCount/> </CatalogueToolbar>
        ├─ <CategoryJumpLinks/>                   hidden while a query is active
        ├─ <LiveRegion/>                          "5 tools" (debounced)
        ├─ <RecentRow/>                           inside the reserved slot; hidden while searching
        ├─ <PopularRow> <ToolTile/>* </PopularRow> hidden while searching
        ├─ <CategorySection>* <ToolCard/>* </CategorySection>
        └─ <NoResults/>
app/[slug]/page.tsx (server, generateStaticParams = planned slugs, dynamicParams=false)
└─ <ComingSoonPage tool/> → <ToolIntro/> (F1) <ComingSoonPanel/> <AvailableNow/>
app/rotate-pdf/page.tsx  → drops its own <SiteHeader/>; adds <RecordVisit slug="rotate-pdf"/> (client, renders null)
app/(info)/{about,help,privacy,terms,cookies,security}/page.tsx → <PlaceholderPage title/>
app/not-found.tsx → <NotFoundPage/>
```

Why the catalogue is one client island and not server cards with a filter script: search must hide cards, hide empty groups and Popular/Recent, and wrap matches in `<mark>` (AC-63). Doing that by mutating server-rendered DOM from a script would fight React. As one island it is still fully server-rendered (AC-12), and its JS is small because the tool data and the icons arrive as props (payload), not code. **Do not use `useSearchParams`** in it: on a static page that bails out to client rendering up to the nearest Suspense boundary and would remove the cards from the server HTML. Read `?q` from `window.location.search` in an effect.

#### Primitives (new, `components/ui/`)

| Component | Props | Notes |
|---|---|---|
| `SearchField` | `id`, `label` (visible or visually hidden), `value`, `onChange`, `onEscape?`, `onEnter?`, `onArrowDown?`, `placeholder`, `shortcutHint?: boolean`, `size: "md" \| "lg"` (44 / 48) | `<label>` + `<input type="search" enterkeyhint="search" autocomplete="off" spellcheck={false}>`. Leading search icon (20, `fg-muted`). `border-strong` 1 px border, `rounded-md`, `surface-raised`, focus: the global ring. The native cancel button is hidden (`::-webkit-search-cancel-button { appearance: none }`). A fixed 44×44 end slot holds either the `/` `Kbd` hint (empty value, `pointer: fine`, `shortcutHint`) or an `IconButton sm` "Clear search" (non-empty value). Swapping them never changes the width. Escape and Enter and ArrowDown call the handlers and `preventDefault()`. |
| `Badge` | `tone: "beta" \| "soon"`, `children` | `xs` 500, `h-5 px-1.5 rounded-sm`, `whitespace-nowrap`. `beta`: `primary-soft` / `on-primary-soft`. `soon`: `surface-sunken` / `fg-muted` with a 12 px clock icon (non-color cue). |
| `RuntimeMarker` | `compact?: boolean` | 14 px device icon in `success` + `xs` text "Runs in your browser" in `fg-muted`. Not a pill, just icon and text, so it reads as a fact, not a status. |
| `Switch` | `label`, `checked`, `onChange`, `id` | `<input type="checkbox" role="switch">` visually hidden over a 36×20 track (`border-strong` 1 px off, `primary` filled on) with a 16 px thumb that moves by `transform` (`fast`). Visible label to the right, `sm` 500. The whole label row is the 44 px hit area. "On" also shows a check inside the thumb (non-color cue). |
| `Kbd` | `children` | `xs` mono, `h-5 min-w-5`, `border` 1 px + bottom 2 px, `rounded-sm`, `fg-muted`. `aria-hidden` (the shortcut is described in the field's `aria-describedby`: "Press slash to search."). |

`Dialog` gets `variant?: "default" | "fullscreen"` and `closeButton?: boolean`. `fullscreen` applies the sizing from H-4 and a slide-up entry. Everything else (native `showModal`, Escape via `cancel`, focus in and back) is reused as is.

#### Site components (`components/site/`)

| Component | Kind | Props | Behavior and look |
|---|---|---|---|
| `SkipLink` | server | – | Current F1 skip link, moved here. First focusable element on every page. Target `main#main` with `tabIndex={-1}` so focus really moves (AC-58). |
| `SiteHeader` | server | `currentSlug?` (from the page; header shortcuts use it for `aria-current`) | H-4 header. Replaces `components/tool-flow/SiteHeader.tsx` (delete it and its import in the rotate page). Rendered once in `app/layout.tsx`. `<header>` landmark. `z-index: var(--ip-z-header)`; while the menu is open, `ToolMenu` sets `data-menu-open` on the header and CSS raises it to `--ip-z-header-open`. |
| `Logo` | server | – | Link to `/`, wordmark "Insta" `fg` + "PDF" `primary`, `lg` 600, accessible name "InstaPDF home" (`aria-label`). |
| `HeaderShortcuts` | server | `currentSlug?` | `<ul>` of up to 5 links to usable tools (popular order, then registry order). Items 4–5 get `hidden lg:block`; the whole list `hidden md:flex`. |
| `ToolMenu` | client | – (reads `ToolIndexProvider`, recent store) | Owns `open`, `mode`, `query`. Renders the trigger and, while open, `ToolMenuSurface`. Registers the `/` shortcut (H-7). Closes on route change (`usePathname` change), on choosing an entry (click handler on the surface for any `a[href]`), on Escape, on scrim click, on the close button, and (panel mode) when focus leaves both the trigger and the panel (`focusout` with `relatedTarget` outside). Panel content is mounted only while open (keeps the initial DOM small). |
| `ToolMenuTrigger` | client | `open`, `onToggle` | `<button type="button" aria-expanded aria-controls="tool-menu" aria-haspopup="dialog" only in mobile mode>`. Label "All tools" (constant; state is in `aria-expanded`). **No-JS fallback:** the button carries class `ip-js-only` and a sibling `<noscript><a href="/#tools">All tools</a></noscript>` uses the same classes; `@media (scripting: none) { .ip-js-only { display: none } }`. Same box size, no shift. |
| `ToolMenuSurface` | client | `mode: "panel" \| "dialog"`, `onClose(reason)`, `initialFocus: "search" \| "title"` | `panel`: a `<div id="tool-menu">` placed **directly after the trigger in the DOM** (so Tab from the trigger enters it), positioned as in H-4, plus the scrim `div` (`aria-hidden`, click → close). Inside: `<nav aria-label="All tools">`. `dialog`: `Dialog variant="fullscreen"` with `id="tool-menu"`, title "All tools" (`h2`, visually hidden, `tabIndex={-1}`), containing the same `<nav>`. |
| `ToolMenuGroups` | client | `items`, `query`, `readyOnly=false` | One `<section aria-labelledby>` per category: `h2` heading (`sm` 600 `fg-muted`) + count, `<ul>` of `ToolMenuEntry`. Empty groups are not rendered while searching. |
| `ToolMenuEntry` | client | `item`, `idPrefix="menu"` | `<li><a href="/{slug}">`. 44 min height (52 with marker), `rounded-md`, padding `6px 8px`, hover `surface-sunken`. Row 1: icon (20; `primary` for usable, `fg-muted` for planned), name (`sm` 500 `fg`), badge at the end. Row 2 (client tools): `RuntimeMarker`. No summary (the menu is for fast scanning; the home catalogue is the descriptive view). Accessible name = name + ", Beta" / ", Coming soon" + ", Runs in your browser" (separators in `sr-only` spans). |
| `RecentStrip` | client | `items`, `onClear`, `idPrefix` | Shared by the menu and the home page. `h2`/`h3` "Recently used" (level via prop) + a horizontal list of `ToolChip`s + `Button ghost sm` "Clear" (`aria-label="Clear recently used tools"`) **after the chips in DOM** (shown at the end of the heading row visually at ≥ 640, after the chips below 640). Not rendered when empty. |
| `ToolChip` | shared (no hooks) | `item` | Link, 44 tall, `rounded-md`, `surface-raised` + `border`, padding `0 12px 0 8px`, icon 20 `primary` + name `sm` 500. Only usable tools ever appear here, so no badges. Hover `border-strong`. |
| `SiteFooter` | server | – | H-4 footer. Class `ip-site-footer`. `<footer>` landmark containing three `nav`s ("Tools", "Company", "Legal"). |
| `PlaceholderPage` | server | `title` | H-4 placeholder. |
| `ComingSoonPage` / `ComingSoonPanel` / `AvailableNow` | server | `tool` | H-4 coming-soon. Reuses F1 `ToolIntro` for the `h1` and summary. |
| `NotFoundPage` | server | – | H-4 404. |

#### Catalogue components (`components/catalogue/`)

| Component | Kind | Props | Behavior and look |
|---|---|---|---|
| `ToolIndexProvider` | client | `items: ToolIndexItem[]` | Context with the slim list built on the server from the registry: `{ slug, name, summary, category, status, runtime, keywords, popularRank?, icon: ReactNode }`. Rendered once in the root layout, so the header menu and the catalogue share one copy of the payload. |
| `matchTools(items, query)` | pure function in `lib/catalogue/search.ts` | – | One function for the catalogue and the menu (spec §3b). Returns matching items and, per item, the match range in `name` and in `summary` (for `<mark>`), or `keywordOnly: true`. Unit-tested with the AC-15/16/17 cases. |
| `Catalogue` | client | – | Owns `query` (initialized from `location.search` after mount), `readyOnly`. Writes `?q=` with `history.replaceState` (AC-62). Listens for clicks on `[data-focus-search]` and for `hashchange` to `#tools`: scrolls the catalogue heading into view (`behavior: smooth` unless reduced motion) and focuses the search with `preventScroll: true` (AC-3). |
| `CatalogueToolbar` | client | – | Search `SearchField size="lg"` with `id="catalogue-search"`, visible label "Search tools" rendered as a `VisuallyHidden` label (the `h2` "All tools" just above and the placeholder `Search tools, e.g. "merge" or "jpg"` make it obvious) plus `aria-describedby` the slash hint. `Switch` "Only ready tools" (AC-22). `ResultCount` "45 shown" / "5 shown". |
| `CategoryJumpLinks` | client (hidden while searching) | – | `nav aria-label="Jump to a category"`, `<ul>` of links `href="#cat-organize"` etc. Chip look: `secondary` style, `sm` 500, `rounded-md`, 36 tall (44 hit). Clicking scrolls (native anchor, `scroll-margin-top` on sections) and updates the hash (AC-14). |
| `RecentRow` | client | – | Reads the recent store (`useSyncExternalStore` over `lib/recent-tools.ts`, which also listens to the `storage` event for other tabs). Renders `RecentStrip` (heading `h3`) inside the reserved slot `div.ip-recent-slot`. Hidden while a query is active (AC-18). |
| `PopularRow` | client (part of `Catalogue`) | – | `section aria-labelledby` with `h3` "Popular" and a `<ul>` of `ToolTile`s, usable first then planned, each in `popularRank` order (spec §3b). Hidden while searching. |
| `ToolTile` | shared (no hooks) | `item`, `idPrefix="pop"` | Compact card for the Popular row: `rounded-lg`, padding 16, column layout: icon tile 40, name (`base` 600, wraps), then the meta line (badges + `RuntimeMarker compact`). No summary here (it is on the full card in the category below); the summary is the link's `aria-describedby`. Same usable/planned styling as `ToolCard`. Min height 96. |
| `CategorySection` | client (part of `Catalogue`) | `category`, `items`, `query` | `<section id="cat-{category}" aria-labelledby>`, `scroll-margin-top: calc(var(--ip-header-h) + 16px)`. `h3` label + count. `<ul role="list">` grid (H-4 columns). Not rendered when it has no match. |
| `ToolCard` | shared (no hooks) | `item`, `idPrefix="cat"`, `highlight?` | The whole card is **one `<a href="/{slug}">`** (AC-7). Layout: 40 px icon tile at the start; then name (`base` 600 `fg`), summary (`sm fg-muted`, natural wrap, no clamp), and a meta line (min height 20, always present so rows align): `Badge` (Beta / Coming soon) and `RuntimeMarker`, gap 8, wrapping. **Usable:** `surface-raised`, solid `border`, `shadow-sm`, icon tile `primary-soft` with `primary` icon, an arrow-right icon (16, `fg-muted`) at the top end that slides in on hover. **Planned:** `surface` background, 1 px **dashed** `border`, no shadow, icon tile `surface-sunken` with `fg-muted` icon, text colors unchanged (`fg` / `fg-muted`, full contrast). Accessible name via `aria-labelledby="{p}-{slug}-name {p}-{slug}-badge {p}-{slug}-rt"` (only ids that exist), description via `aria-describedby="{p}-{slug}-summary"`. Ids are prefixed per context (`cat`, `pop`, `soon`, `nf`) so duplicates across rows never collide. `highlight` wraps the matched range of name and summary in `<mark>`. |
| `NoResults` | client | `query`, `onClear` | In place of the groups: 40 px search icon in a `surface-sunken` circle, `base` 600 "No tools match “zzqx”", `sm fg-muted` "Try a shorter word, like “split” or “word”.", `Button secondary md` "Clear search". `role="status"` is **not** set here (the live region announces "No tools found"); this avoids a double announcement. |
| `RecordVisit` | client (renders `null`) | `slug` | On mount: `recordVisit(slug)` (move to front, dedupe, cap 12, overwrite corrupt values, swallow storage errors). Placed only on usable tool pages. |

`lib/recent-tools.ts`: `KEY = "instapdf:recent-tools"`, `read(): string[]` (try/catch, must be an array of strings, else `[]`), `visible(index)` (skip unknown and planned, first 6), `record(slug)`, `clear()`, `subscribe(cb)`. All storage access is wrapped so a throwing `localStorage` getter (AC-45) is handled.

### H-6. States

| State | Home page | Header / menu | Focus and announcement |
|---|---|---|---|
| **Initial (server HTML, no JS yet)** | Hero, toolbar (search usable as a field but not filtering yet), chips, Popular, 8 groups with 45 cards, footer. Recent slot reserved if the pre-paint script found history. | Trigger visible (JS) or noscript link (no JS). | Page default. First Tab: skip link. |
| **Hydrated, Recent empty** | No Recent row, no reserved space. | No Recent strip in the menu. | – |
| **Hydrated, Recent populated** | Recent row fills its reserved slot (chips fade in `fast`). | Recent strip at the top of the menu. | – |
| **Searching (matches)** | Chips, Recent and Popular hidden. Groups with matches only, each card's match wrapped in `<mark>`. Count "5 shown". | Menu: same filtering, count "5 of 45". | Focus stays in the field. Live region (debounced 400 ms after the last keystroke): "5 tools". |
| **No results** | `NoResults` block with "Clear search". Count "0 shown". | Menu: one line "No tools match “zzqx”" + `Button ghost sm` "Clear search". | Live: "No tools found". Clear search → field emptied, everything back, focus to the field (AC-19). |
| **Only ready tools on** | Popular shows usable tiles only; groups show usable cards only; empty groups hidden; chips for empty categories hidden. Combined with a query: both filters apply. | Not in the menu. | Live: "1 tool". |
| **Deep link `/?q=split`** | Server HTML has everything; after hydration the filter applies and the field shows "split". | – | No announcement on load. |
| **Menu open, desktop** | Page unchanged underneath, dimmed by the scrim. | Header raised, trigger `aria-expanded="true"` with open style, panel under the header. | Focus in the menu search (AC-28). |
| **Menu open, mobile** | Covered. | Full-screen dialog. | Focus on the dialog title when opened by tap/click (no on-screen keyboard popping over the list); on the search when opened with the `/` key. |
| **Recent cleared** | Row removed. | Strip removed. | Live: "Recently used tools cleared". Focus → the catalogue search field (home) or the menu search (menu). |
| **Storage blocked or corrupt** | Same as Recent empty. No error UI. | Same. | – |
| **Coming-soon page** | – | Header and footer as everywhere; no shortcut has `aria-current`. | Page default. |
| **404 / placeholder** | – | Same. | Page default. |
| **Tool page with work in progress** (F1 states loading → processing) | – | Header links and menu entries still work, but leaving would lose the user's files: see H-11 item 1. | – |

### H-7. Keyboard, focus order and ARIA

**Menu pattern decision.**
- **≥ 768: disclosure (APG "disclosure navigation"), not a dialog and not `role="menu"`.** The panel is a list of ordinary links plus a search field. `role="menu"` would force arrow-key-only navigation and forbid the text field. A modal dialog would be wrong on desktop: the header and its trigger stay visible and usable, the page is not inert, and users expect to Tab out of a navigation list. So: `<button aria-expanded aria-controls="tool-menu">` + a `<nav aria-label="All tools">` panel, focus moved into the search on open (AC-28), Escape returns focus to the button (AC-26), and the panel closes when focus leaves it (so it never sits open over content the keyboard user has moved to).
- **< 768: modal dialog.** The panel covers the whole screen, so the page behind is truly unavailable. Saying so with `role="dialog" aria-modal="true"` (native `showModal()`) gives screen readers the right model, a real focus trap and an inert background (AC-37, AC-38). The trigger also gets `aria-haspopup="dialog"` in this mode.
- Both modes render the same `nav` content, so tests and copy are shared.

**Global keys.**
- `/` (AC-61): handled by `ToolMenu` on `keydown` at `document`. Ignored when the event target is an `input`, `textarea`, `select` or `[contenteditable]`, when a modifier other than Shift is held, or when an F1 dialog is open (`document.querySelector("dialog[open]")`). If `#catalogue-search` exists (home page): `preventDefault()`, scroll it into view, focus it. Otherwise `preventDefault()` and open the menu with the search focused (both modes).
- Escape: catalogue search with text → clear (AC-20); menu open → close and focus the trigger (AC-26; also when the menu search has text: one press closes, it does not first clear).

**Focus order.**
- Every page: Skip link → Logo → All tools → shortcut links → (menu panel when open) → `main` content → footer.
- Home `main`: "Find a tool" → "See all 45 tools" → search field → Clear search (when shown) → Only ready tools → category chips (8) → Recent chips → Recent Clear → Popular tiles (10) → cards (45) in group order → footer.
- Desktop menu: search → Clear search (when shown) → Recent chips → Recent Clear → entries in group order (column by column, which is DOM order: CSS columns flow top-to-bottom then left-to-right, matching reading order) → close button (last in DOM, shown at the top end). Tab past the close button leaves the panel and closes it; Shift+Tab from the search goes back to the trigger (panel stays open). In the search: Enter opens the first visible entry (AC-35); ArrowDown moves focus to the first visible entry. Arrow keys are not otherwise intercepted.
- Mobile dialog: title (programmatic focus only) → search → Clear search → close → Recent chips → Recent Clear → entries. Tab wraps (native modal). Close and Escape return focus to the trigger (F1 `Dialog` return-focus logic).
- Hero CTA: activating it scrolls to `#tools` and focuses the catalogue search (AC-3). Without JS it is a plain jump link.

**ARIA and semantics summary.**

| Element | Markup |
|---|---|
| Landmarks | `header`, `nav aria-label="All tools"` (menu, when open), `main#main`, `footer` with `nav`s "Tools", "Company", "Legal". Catalogue is `section aria-labelledby` the `h2`. |
| Headings | `h1` hero (one per page, AC-1); `h2` "All tools"; `h3` Recently used, Popular, each category. Menu: `h2` per group (in its own `nav`). Footer: `h2` per column. (Spec §3b called the groups `h2`; under the "All tools" `h2` they are `h3` for a correct outline. AC-6 does not fix the level; tests should query `#tools section h3` or by text.) |
| Card, tile, chip, menu entry | Native `<a>`; name, badge and runtime marker in the accessible name; summary as description (cards and tiles). Icons `aria-hidden`. |
| Search fields | `<input type="search">` with a `<label>` (visually hidden on the home page, visible "Search tools" in the menu as a `sr-only` label too; placeholder never the only label). `aria-describedby` → slash hint (`pointer: fine` only) and, for the menu, `aria-controls="tool-menu-results"`. |
| Result count | Visible text is not live. One `LiveRegion` (polite) per search context carries "5 tools" / "No tools found", debounced 400 ms. |
| Switch | `<input type="checkbox" role="switch">` + `<label>`. |
| Trigger | `<button aria-expanded aria-controls="tool-menu">` (+ `aria-haspopup="dialog"` below 768). |
| Mobile menu | Native `<dialog aria-modal="true" aria-labelledby>` (F1 `Dialog`). |
| Scrim | `div aria-hidden="true"`, not focusable. |
| Coming-soon | `h1` tool name; status panel `h2` "Coming soon"; the badge in the `h1` row is plain text. |
| Current page | Header shortcut `aria-current="page"`. |

**Contrast and targets.** All text pairs are in F1 U-2 or H-2. Focus ring: the global 2 px `focus` outline, offset 2 (≥ 7:1 on every surface, F1 U-7); on cards the outline follows `rounded-lg`. Every interactive element is ≥ 44×44 below 1024 (cards, tiles, chips, entries, footer links, switch row, header button) and ≥ 32 visual / 44 hit at ≥ 1024. Zoom: at 400% (320 CSS px) the header still fits (logo + 44 px button), the hero stacks, toolbars wrap, and no horizontal scroll appears (AC-57).

### H-8. Copy (our own wording; keep strings in `components/catalogue/copy.ts` and `components/site/copy.ts`)

| Key | Text |
|---|---|
| meta.home.title / description | "InstaPDF · Fast, private PDF tools" / "Free online PDF tools that run in your browser. Organize, edit and convert PDFs without uploading them." (tune the last clause per F21; keep it true: most tools are client) |
| hero.title | "Fast, private PDF tools" |
| hero.pitch | "Organize, edit and convert PDFs without installing anything. Most tools run right in your browser, so your files stay on your device." |
| hero.cta (featured planned) / (featured usable) | "Find a tool" / registry `actionLabel` of the featured tool, e.g. "Edit a PDF" |
| hero.seeAll | "See all {n} tools" |
| hero.trust | "Most tools never upload your files" · "No account needed" |
| catalogue.title / summary | "All tools" / "{n} tools · {k} ready now" |
| search.label / placeholder | "Search tools" / "Search tools, e.g. “merge” or “jpg”" |
| search.hint | "Press slash to search." |
| search.count / live | "{n} shown" (home), "{n} of {total}" (menu) / "{n} tools", "1 tool", "No tools found" |
| search.none / tip / clear | "No tools match “{q}”" / "Try a shorter word, like “split” or “word”." / "Clear search" |
| filter.readyOnly | "Only ready tools" |
| jump.label | "Jump to a category" |
| recent.title / clear / clearLabel / cleared | "Recently used" / "Clear" / "Clear recently used tools" / "Recently used tools cleared" |
| popular.title | "Popular" |
| badge.beta / soon | "Beta" / "Coming soon" (footer: "Soon" visible, "coming soon" in the name) |
| runtime.client | "Runs in your browser" |
| menu.button / close | "All tools" / "Close all tools" |
| soon.back / heading / body | "All tools" / "Coming soon" / "We're still building {name}. It isn't ready yet." |
| soon.client / server | "When it's ready it will run in your browser, so your files stay on your device." / "When it's ready, files you add will be processed on our servers and deleted within 2 hours." |
| soon.cta / available | "Browse all tools" / "Ready to use now" |
| placeholder.body / back | "We're writing this page. Check back soon." / "Back to all tools" |
| notFound.title / body | "We couldn't find that page" / "The link may be old, or the address may have a typo." |
| footer.tagline / privacy | "Fast, private PDF tools." / "Browser tools never upload your files." |
| leave.title / body / stay / leave | "Leave this tool?" / "Your files and changes here will be lost." / "Stay" / "Leave" |

### H-9. Micro-interactions

Transitions only on `opacity` and `transform` (plus `background-color` / `border-color` / `color` for hover states, which do not cause layout), durations from tokens, all 0 under reduced motion (F1 U-2).

| Moment | Interaction |
|---|---|
| Hover a usable card or tile (pointer) | `translateY(-2px)` + `shadow-sm` → `shadow-md` + border `border` → `border-strong` (`fast`, `ease-out`); the arrow icon fades in and moves 4 px toward the end (`fast`). |
| Hover a planned card | Border `border` → `border-strong`, still dashed. No lift (it is quieter on purpose). |
| Press a card | `scale(0.99)` for `instant`. |
| Focus a card (keyboard) | Focus ring only; no lift (motion on focus is noise when tabbing through 45 cards). |
| Typing in search | Cards hide and show instantly (no fade, no reflow animation: animating 45 cards per keystroke feels slow). The count text swaps without animation. |
| Clear button / slash hint swap | Crossfade in the fixed end slot (`fast`). |
| Switch | Thumb `translateX(16px)` (`fast`), track color (`fast`). |
| Menu open (desktop) | Scrim fades in (`fast`); panel fades in and moves from `translateY(-8px)` (`base`, `ease-out`). Chevron rotates 180° (`fast`). Close: panel and scrim fade out (`fast`); content is unmounted after the transition (`transitionend`, or at once under reduced motion). |
| Menu open (mobile) | Dialog fades in and rises from `translateY(16px)` (`base`); `::backdrop` not visible (the dialog is full screen). Close: fade (`fast`). |
| Hero CTA / "See all" | Smooth scroll to `#tools` (`scroll-behavior` via `scrollIntoView({behavior})`, instant under reduced motion), then the search field gets focus (ring appears). |
| Jump chip | Native smooth scroll (`html { scroll-behavior: smooth }` inside `@media (prefers-reduced-motion: no-preference)`). |
| Recent row fills | Chips fade in (`fast`) inside the already reserved box. |
| Recent cleared | Row disappears without animation (it is user-initiated). |
| Search match | `<mark>` appears with no animation. |

### H-10. Performance and no-shift checklist

- **Static route.** `/` renders at build (no `searchParams`, no cookies, no headers reads). `/[slug]` coming-soon pages are `generateStaticParams` for planned slugs. Placeholders and 404 are static.
- **First-load JS budget (< 150 KB gzip for `/`).** Framework baseline (React, Next runtime) is about 100–105 KB. Islands: `ToolIndexProvider` + `ToolMenu` (with `SearchField`, `Badge`, `RuntimeMarker`, `Dialog`, `matchTools`) about 6–8 KB; `Catalogue` (+ cards, recent store) about 5–7 KB. Expected total about 115–120 KB. Tool icons are not JS (H-3). No new runtime dependency. Check with `next build` output; if the home route goes above 135 KB, lazy-load `ToolMenuSurface` with `next/dynamic` on first pointer-enter/focus of the trigger.
- **Payload.** The tool index (45 items with pre-rendered SVGs) is serialized once in the layout RSC payload, about 20 KB raw / 5 KB gzip. Keep `keywords` short.
- **Pre-paint Recent reservation (no CLS for returning users).** `RecentPrepaintScript` is a tiny inline script in `<head>` generated at build with the list of usable slugs: it reads `localStorage["instapdf:recent-tools"]` in a try/catch, counts entries that are usable slugs, and if ≥ 1 sets `data-recent` on `<html>`. CSS: `.ip-recent-slot { display: none } :root[data-recent] .ip-recent-slot { display: block; min-height: var(--ip-recent-h) }`. After hydration `RecentRow` renders into that slot; the box size does not change. The same validity rules live in `lib/recent-tools.ts`; a unit test runs both on the AC-43/44 fixtures. `<html suppressHydrationWarning>` covers the added attribute. If a CSP is added later, the script needs a hash or nonce.
- **Fixed boxes.** Header 56 at every width; trigger and noscript fallback same size; search end slot 44×44; result count `min-w`; card meta line min 20; icons with explicit `width`/`height`; Recent slot reserved; menu content is fixed-position (never in flow).
- **Accepted shift.** `/?q=…` deep links apply the filter after hydration, which removes cards below the toolbar once. That is a shared-link case, not the Lighthouse target; documented here so QA does not chase it.
- **Fonts.** Geist via `next/font` (self-hosted, size-adjusted fallback, already in the layout). No third-party requests (AC-54).
- **Prefetch.** `next/link` prefetches visible links in production. With 45+ card links that is many prefetches on a slow phone. Set `prefetch={false}` on catalogue cards, tiles, footer links and planned-tool links; keep default prefetch only for usable tools in the header shortcuts and Recent chips. Coming-soon pages are tiny static HTML, so no prefetch is needed.

### H-11. Decisions for the engineer

1. **Leaving a tool mid-task through the new header.** F1's leave guard only handles `beforeunload`, which does not fire on Next client-side navigation. F2 adds many in-app links (header, menu, footer) to the tool page, so a click could silently drop the user's files. Proposal: `useLeaveGuard` also adds a capture-phase `click` listener on `document` while active; for same-origin `a[href]` clicks that would change the path, it `preventDefault()`s + `stopPropagation()`s and opens a `Dialog` ("Leave this tool?" / "Your files and changes here will be lost." / Stay (initial focus) · Leave). Leave then navigates with `router.push`. This touches F1 code; the orchestrator should confirm it belongs in F2 (I recommend yes, because F2 creates the exposure).
2. **AC-34 (hover-to-open, P2) is dropped by design**, as §3d allowed. A large panel that opens on hover pops over the page when the pointer just passes through the header on its way to the logo or a shortcut, and the reference does not close it on mouse-out either. Click (or `/`) is one deliberate action. The evaluator should record AC-34 as "dropped by design (ux)".
3. **Group heading level** is `h3` under the catalogue `h2` (H-7). If the test author prefers `h2` everywhere, drop the "All tools" heading to a visually styled `p` with `id="tools"`; I recommend keeping the `h2`/`h3` outline.
4. **Where the icon name lives** (registry `icon` field vs a map beside the generated file) is the engineer's call; either way a test asserts full coverage.
5. **Header/footer in the root layout** means the rotate page loses its own `SiteHeader` import and its large `pb-[calc(...dock...)]` main padding moves to the footer rule (H-4 footer). Run the F1 e2e suite after the move; F1 AC-49 and AC-50 must stay green.
6. **Popular tiles without a summary.** The tile shows name, badge and marker; the summary is the link description. If the evaluator reads AC-7 as covering Popular too, show the summary in tiles at ≥ 1024 only (`sm fg-muted`, 2 lines) and keep it hidden below.
7. **Featured tool.** Registry `featured: "pdf-editor"` as §2 proposes. The hero CTA label switches from "Find a tool" to the editor's label automatically when its status leaves `planned`.
