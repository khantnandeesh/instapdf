# BerryPDF design system

The single source of truth for the product's visual design: the owner's **BerryPDF** design system (adopted 2026-11-23, replacing Mint Paper; the product itself was renamed from InstaPDF to BerryPDF the same day), how our `--ip-*` tokens map onto it, the category berries, measured contrast, and every place we deviate from BerryPDF and why. Feature specs (`docs/specs/*.md`, `## UI`) describe layout, components and behavior and point here for every visual value.

- Implementation: `apps/web/src/styles/tokens.css` (BerryPDF tokens under their own names, our `--ip-*` role tokens mapped onto them, Tailwind v4 `@theme`), `apps/web/src/app/globals.css` (the BerryPDF components and motifs, `mp-` classes, keyframes, the berry loader) and `apps/web/src/components/berry/Berry.tsx` (the berry sprite, berry mark, berry loader, floating berries and stickers). Components never use raw hex values.
- BerryPDF's own files are the spec: `README.md`, **`tokens.json` (the source of truth for values)**, `motion.md`, `pages.md`, `components/bundle.css` and each `components/<Comp>/README.md` + `preview.html`. Its `tokens.css` and `api/tokens.md` are stale (they still hold Mint Paper values) and are ignored. We copy values exactly and resolve `tokens.json`'s `{gooseberry}`-style aliases. We do not load `bundle.css` (it imports Google Fonts and its previews use inline styles).
- Rule: **follow BerryPDF as fully as possible**, except where the [owner overrides](#owner-overrides-2026-11-23) say otherwise; where it conflicts with WCAG 2.1 AA (the e2e axe gate fails on any serious violation) or with the strict CSP, we take the smallest change, prefer an alternative BerryPDF itself offers, and list it under [Deviations](#deviations-from-berrypdf).

## Owner overrides (2026-11-23)

The owner reviewed the first BerryPDF screens and set four rules that win over BerryPDF where they conflict:

1. **No vine.** The vine divider (home hero → catalogue, before the footer, coming-soon/404 → "Ready now") and the vine progress strip are removed, with their CSS and keyframes. Sections separate by spacing only. Processing keeps the jam bar (an indeterminate jam variant has a short segment gliding) and the berry loader.
2. **Minimal text.** Show only what a task needs; everything else becomes a tooltip or screen-reader text. Tool cards and menu rows: icon + name + at most one small mark ("Soon" or "Beta"); the summary and "Runs in your browser" stay in the accessible name (sr-only) and the summary is the `title` tooltip. Hero: title, one short line, the main action, one short privacy note (no see-all link, no seed list). Catalogue: no subtitle counts, no group or chip counts, no "N shown" (the live region still announces it); the menu count shows only while searching. Tool pages: the `h1` only (no subtitle); the drop card has three short lines (drop hint, short limits with the full limits as tooltip/sr-only, privacy). Coming-soon: title, "Coming soon" tag, one button, "Ready now". Footer: one compact row (wordmark, ©, links; Company/Legal headings sr-only) with the A–Z list folded under a "Tools A–Z" toggle. Legal page text is unchanged.
3. **Quiet motion, CSS only.** Tool tiles rise in staggered (360ms, 30ms apart, capped at 300ms); hero pieces fade up one after another (400ms); tool titles and the coming-soon/404 content fade up; the drop card and the result panel pop in with the small overshoot (380ms) and the result tick follows; the drop card's outline then breathes in pale berry (3.2s loop); rendered page thumbnails ease in (300ms). Cards lift on hover with the overshoot and press to 0.98 on click. Every entrance is ≤ 400ms; all of it is off under `prefers-reduced-motion: reduce` (the global rule drops every animation and transition).

4. **The first screen holds the whole task.** On a tool page nothing the user needs is cut off on arrival: the title, the drop area, the options and the primary action fit the viewport on common laptops and phones, and the primary action never leaves the screen. See [Fit the first screen](#fit-the-first-screen) (owner, 2026-11-23, after Rotate PDF's button was half below the fold at 1366x768).

Also from the PR #11 review: Fredoka is one variable-weight file (`@fontsource-variable/fredoka` 5.3.0, OFL-1.1, latin `wght` 300–700, ~30 KB) instead of four static weights (~64 KB), so the page preloads one font file.

## The idea

A warm white page ruled like pink grid paper, one strawberry-red action, small leaf-cornered cards coloured by category, and a berry that splits while you wait. Only the primary button is filled with `brand`; colour means category, never state; everything is soft and pillowy (big radii, 1.5px strawberry-cream borders, pink-tinted shadows); things lift a little on hover and press down when clicked.

## Tokens

Every `tokens.json` token exists under its BerryPDF name with its exact value:

- **Colour** (`:root`): `--brand` #d92b4b, `--brand-bright` #f0506e, `--brand-strong` #b01e3c, `--brand-tint` #fdeef1, `--brand-tint-border` #f6cfd6, `--brand-deep` #b01e3c, `--brand-soft` #fdeef1, `--ink` #3a2a2e, `--ink-black` #2a1c20, `--muted` #7a6468, `--subtle` #b39aa0, `--surface` #fff, `--surface-soft` #fff8f3, `--surface-footer` #f8f9fa, `--band` #fff1f3, `--sand` #fbe4e1, `--border` #f3d9dc, `--border-card` #f6dfe2, `--link` #4a63d9, `--danger` #9f1d14, `--choice-bg` #fbeaee, `--tool-active-bg` #e2e7ff, `--tool-active-ink` #24338f, `--tool-glow` #c5cdf7, `--canvas` #f4eef0, `--panel-border` #fbe4e1, `--page-tray` #fdeef1, `--switch-off` #e6d3d6, `--hint` #7a6468, `--code-yellow` #fff1c9, `--code-blue` #e2e7ff, `--code-orange` #ffe3c9, `--syntax-keyword` #3147b8, `--syntax-string` #3d7a1a, `--leaf` #287a3c, `--berry-flesh` #ffd9df, `--berry-seed` #ffe9a8, `--cream` #fff8f3, `--milk` #ffeef0, `--blossom` #fff, `--blossom-heart` #ffd84d, `--jam` #d92b4b, and the berries `--gooseberry` #7fae2a, `--blueberry` #4a63d9, `--huckleberry` #2f7fa8, `--blackberry` #4b2a63, `--cloudberry` #f08c2e, `--elderberry` #6b3fd1, `--mulberry` #a03a8c.
- **Categories** (aliases resolved): `--cat-merge` gooseberry, `--cat-split` leaf, `--cat-edit` blueberry, `--cat-compress` huckleberry, `--cat-scans` blackberry, `--cat-convert-from` cloudberry, `--cat-convert-to` elderberry, `--cat-other` mulberry.
- **Bundle values without a token** (`--mp-*`): grid ground #fffdfb and line `rgba(217,43,75,.07)` every 24px, pink hover #fbdde3, card hover border #f5b9c3, the source field/checkbox edges #ecd5d9/#e2b9c1 (see deviations), outline ring #e6d3d6 + lip #efe0e2, choice lip #f3e3e6, editing-tool ink #3147b8 and hover #f1f3ff, prose #5b484c, alert tints (success #e9f6ec/#1d5f2d/#bfe3c7, danger #fdecea/#8a1a12/#f3c1bb, info #eceffd/#2c3fa8/#c9d1f7), jam border #f1c9cf, modal backdrop `rgba(58,20,30,.34)`.
- **Spacing** `--space-1..9`: 4, 8, 12, 16, 20, 30, 40, 60, 120. **Durations** `--dur-fast` .15s, `--dur-base` .2s, `--dur-move` .3s, `--dur-slow` .5s, `--dur-attention` 1s, `--dur-tool` .4s, `--dur-loader` 2.6s, plus motion.md's `--dur-press` 40ms and `--dur-lift` .12s. **Z**: `--z-header` 899, `--z-header-link` 900, `--z-progress` 1000.
- **`@theme static`** (Tailwind emits them under the same names): radius `sm` 8, `md` 12, `lg` 14, `card` 16, `leaf` 28, `pill` 999, `panel` 20, `tray` 14, `round` 24; shadows `card`, `button`, `menu`, `plan` (= `lift`), `pressed`, `panel`, `glow`, `window` (exact `tokens.json` strings); easing `standard`, `enter`, `progress-a`, `progress-b`, `loader`, plus the bundle's overshoot `pop` `cubic-bezier(.34,1.4,.64,1)`.
- **Type styles** → `text-<style>` utilities: `hero` 44/48 700, `page-title` 36/40 600, `section-title` 30/34 600, `card-heading` 24/28 600, `subtitle` 24/30 500, `body` 17/25.5, `tile-title` 18/28 600, `tile-desc` 14/16, `eyebrow` 15/24 600, `button` 17/17 600, `button-lg` 20/20 600, `nav` 17/24.3, `tool-button` 14/20, `choice-label` 15/20, `pill` 10/12, `help` 12/17, `prose-h2` 22/26 700, `prose-body` 16/28, `step-title` 20/28, `blog-title` 35.2/40 700, `blog-body` 20/30, `code` 13/19, `code-chip` 12/16. The generic `text-xs…4xl` are re-pointed at this scale (12, 14, 17, 18, 20, 22, 24, 30).

### `--ip-*` role mapping (names kept so feature code keeps working)

| `--ip-*` | BerryPDF | Value | Use |
|---|---|---|---|
| `bg` | grid ground | #fffdfb (+ pink grid lines) | the page |
| `surface-raised`, `surface-overlay`, `chrome` | `surface` | #fff | cards, panels, menus, dialogs, header |
| `surface` | `cream` | #fff8f3 | footer ground, working area |
| `well` | `page-tray` | #fdeef1 | page trays |
| `surface-sunken`, `hover` | `band` | #fff1f3 | tags, hover rows |
| `pressed` | pink hover | #fbdde3 | pressed soft fills |
| `border` | `sand` | #fbe4e1 | hairlines |
| `field-line`, `border-strong` | darkened checkbox pink | #a2848a | field, checkbox, switch-off and range edges (deviation 2) |
| `fg` / `fg-muted` / `fg-disabled` | `ink` / `muted` / `muted` | #3a2a2e / #7a6468 | text |
| `accent`, `primary`, `primary-hover`, `primary-active` | `brand` | #d92b4b | the one filled action, jam |
| `on-primary` | white | #fff | label on berry (4.78:1) |
| `primary-ink`, `on-primary-soft` | `brand-strong` | #b01e3c | berry text, icons |
| `primary-soft`, `primary-faint` | `brand-soft` / `brand-tint` | #fdeef1 | soft and ghost fills |
| `primary-ring` | field focus ring | `rgba(217,43,75,.16)` | 4px pink ring |
| `focus` | `link` | #4a63d9 | 3px focus outline |
| `danger`, `danger-strong` | `danger` | #9f1d14 | errors |
| `success` / `success-soft` | `leaf` / alert green | #287a3c / #e9f6ec | done ticks |
| `warning` | alert info ink | #2c3fa8 | warnings use the information alert |
| `scrim` | modal backdrop | `rgba(58,20,30,.34)` | dialog backdrop (+ 8px blur) |
| `shadow-sm` / `-md` / `-lg` | `shadow-card` / `-panel` / `-menu` | | |
| `cat-<category>` / `-text` | `cat-*` | see below | catalogue colours |

## Categories → berries

| Our category | BerryPDF token | Disc and icon | Eyebrow text (≥ 4.5:1 on a grid line, #fceeef) |
|---|---|---|---|
| Organize pages | `cat-merge` gooseberry | #7fae2a | #53721c (4.91) |
| Edit & sign | `cat-edit` blueberry | #4a63d9 | unchanged (4.56) |
| Optimize | `cat-compress` huckleberry | #2f7fa8 | #297094 (4.85) |
| Security | `cat-split` leaf | #287a3c | unchanged (4.73) |
| Convert from PDF | `cat-convert-from` cloudberry | #f08c2e | #98591d (4.92) |
| Convert to PDF | `cat-convert-to` elderberry | #6b3fd1 | unchanged (5.72) |
| Scans | `cat-scans` blackberry | #4b2a63 | unchanged (10.28) |
| Automate | `cat-other` mulberry | #a03a8c | unchanged (5.35) |
| Most popular row | `cat-edit` | | unchanged |

BerryPDF pairs Security with `cat-compress`; our Optimize group already takes it and sits next to Security, and `cat-split` (leaf) is otherwise free (our Organize group holds merge and split), so Security takes leaf to keep eight distinct colours. "Recently used" is not a category: its eyebrow is ink. Planned tools keep the category eyebrow but their disc is neutral (muted), so ready tools read as live (F2 H-1).

## Type

**Fredoka**, latin subset, one variable-weight file (300–700; we use 400, 500, 600 and 700), self-hosted with `next/font/local` from `@fontsource-variable/fredoka` **5.3.0** (exact-pinned; SIL OFL 1.1 verified in the installed `package.json` and `LICENSE`; the package ships CSS and font files only, so the license scan classifies it as a font; notice in `apps/web/THIRD-PARTY-NOTICES.md`, `/licenses` and `/third-party-notices.txt`). The one file is preloaded from our origin, with a metric-adjusted Arial fallback. **One family everywhere**: `--font-sans`, `--font-display`, `--font-ui` and `--font-mono` all resolve to Fredoka. (The EditorToolbar spec and `tokens.json`'s tool-button usage text mention a system font; `tokens.json` sets that style's family to `sans` = Fredoka and the README says "no second font", so Fredoka wins.) Atkinson Hyperlegible is removed. Case: Title Case card titles (CSS `capitalize`), UPPERCASE eyebrows and footer headings (CSS only; DOM text keeps our copy), sentence case elsewhere.

## Icons

**Phosphor, Duotone** (MIT), from `@phosphor-icons/core` **2.1.1** (exact-pinned devDependency; MIT verified in the installed package). `scripts/gen-tool-icons.mjs` copies only the path data into `src/tools/tool-icons.tsx` (45 tool icons, one per tool; the generator fails on a duplicate) and `src/components/ui/icons.tsx` (30 interface icons), each carrying the MIT notice; they render as server-side inline SVG in `currentColor` with the main shape at 20%. In tool cards the icon sits in a 40px disc tinted with the category colour at 16%. Lucide is removed.

## Motifs (Berry kit)

- **Sprite** (`BerrySprite`, once per page in the root layout): the berry skin, cut face, star, blossom and leaf symbols with their gradients and clip paths, referenced with `<use href="#mp-...">`.
- **Logo**: the berry mark (34px) + "BerryPDF" in Fredoka 600; hover tips the berry 14° and grows it to 1.1 (0.3s ease-in-out).
- **Background**: grid paper only (24px squares, 7% berry red, on #fffdfb), carried by `html`/`body` behind every page, working screens included. No waves, gradients, glows, patterns or coloured bands behind sections (BerryPDF's updated Backgrounds; the earlier waves/glow/gingham/skin classes are gone). White surfaces (cards, header, modal, inputs, panels) stay solid white so the grid never runs behind component text.
- **Dividers**: *(owner override: no vine; sections separate by spacing only. Historical note follows.)* one style per page, the vine: before the footer on every page, between the home hero and catalogue, and between the coming-soon/404 empty state and "Ready to use now" (40px clear on the content side). Sections otherwise change by spacing. The jam drip (under a red header or banner) and the scallop (pink meets cream) exist as classes but have no place yet. Panels split rows with sand hairlines.
- **BerryBits**: seed-bullet lists (hero reassurance, legal "In short" and lists, owner-password permissions), the jam label ("Coming soon"), die-cut stickers (hero: berry and leaf in the margins at ≥ 1280px; Rotate empty state: one blossom; never more than 3 per screen, never over text). The berry **rating** is not used: we have no real rating to show, and BerryPDF requires the number beside it.
- **Floating berries and blossoms** (`Floaties`, sets `hero` and `empty`, positions from the previews as nth-child CSS): behind the hero, the Rotate empty state, coming-soon and 404. Small, pale, depth-layered, out of step; on phones the mid layer (and the hero's back layer) is hidden so nothing sits on words.
- **Feedback**: the berry loader (2.6s), jam progress (determinate, or a gliding segment), the floating-berry empty state. (The vine strip is gone: owner override.)

## Components (BerryPDF → where)

- **Home skeleton**: BerryPDF's Home template is header → hero → catalogue grouped by eyebrow → rating → two feature cards → a seed-list of features → footer. We build header → hero → catalogue → footer, separated by spacing (owner override). Not built, deliberately: the rating (we have no real rating, and BerryPDF requires the number beside it) and the feature cards and features list (new marketing copy, which needs the copy owner and a spec change; F2 copy is unchanged by this re-theme).
- **Header**: *(owner override 2026-11-24, second pass: a full-width bar, not an inset pill.)* an edge-to-edge frosted bar (82% surface, 16px blur, 1px sand hairline at the bottom; solid surface while the menu is open and under `prefers-reduced-transparency`), 72px from 768px and 64px below (`--ip-header-h`), content up to 1280px wide; sticky (F2 AC-32/AC-38); logo (36px mark), the "All tools" pill chip (cream, sand ring), up to 5 shortcuts (16px, 8×12, radius 10, milk hover and current page with berry text). Edges are real borders (not shadows) so forced colours keep them. The glass is drawn on `header::before`, never on the header, so the header never becomes the containing block of the fixed panel. CSS lives in `components/site/site-header.css`.
- **Hero** (owner override: minimal): centred on grid paper, 120px above the title (60px below 768px), 28–44px headline in ink-black, one short berry line (`brand-strong`), one berry button, one small muted privacy note with a shield; floaties and two stickers. Pieces fade up one after another.
- **Catalogue**: on the grid paper after the hero (spacing only); section title (no subtitle), search (Input), "Only ready tools" (Switch), jump chips (nav chip), Recent chips, the Popular row and eight groups under UPPERCASE eyebrows; 3 columns of 300px from 1024px.
- **ToolCard** (owner override: minimal): white, 1.5px sand border, 16px corners with the 28px leaf corner bottom right, `shadow-card`; 40px disc (category at 16%) with a 22px duotone icon top left, the Fredoka 600 17px Title Case name at the bottom, one small mark top right ("Soon" tag or "Beta" pill); 2 columns on phones, 3 from 640px, 4 from 1024px. Summary and "Runs in your browser" are sr-only (summary also the `title`). Hover/focus: lifts 3px with the small overshoot, `shadow-lift`, border #f5b9c3, disc fills, icon turns white and tips 8° (0.2s); press scales to 0.98.
- **Menu**: from 768px the All tools menu is a full-width panel hanging from the bottom of the bar (white, rounded bottom corners, soft berry shadow), content centred at up to 1280px: search with "Recently used" beside it on one row from 1024px (its own row below that), then the groups in balanced columns (3 / 4 / 5 at md / lg / xl; a long group continues in the next column, rows never split, a heading never ends a column) so the whole menu fits one screen from 1280×632 up (the panel keeps a 24px strip of backdrop below it). The page behind is dimmed (ink at 22%) and blurred 6px; a click on it, Escape or × closes the panel and returns focus to the button; Tab out of the panel closes it. Panel slides in 8px and fades over .3s, backdrop fades; both off under reduced motion. Rows 6×10, 15px, "Soon" as a quiet word (no pill); other menus keep rows 8×12, radius 9, icon in category colour, band hover with berry text. Below 768px it stays the full-screen dialog (F2 H-7).
- **Button**: the berry button (13×22, radius 14, Fredoka 600 17px, solid 4px `brand-strong` lip + pink glow + top light line; hover lifts 1px, press drops 3px in 40ms), `lg` (20px, 16×28, radius 16), `ghost` (tint on a pale lip), `soft`, `line`, `outline`, `tool` (blueberry EditorToolbar), `plain`; `IconButton` = 34px round tint (press 0.92). Focus: 3px blueberry, 3px away. Disabled 50%.
- **Alert**: floating notices, tinted, icon + bold words, round close, drop-in (from 30px up, 5px past, settle, 0.9s ease-out); success green, danger brick, info/warning blueberry. **Callout**: inline info/warning, band + sand outline, radius 14, leaf icon.
- **Modal**: 380px (880px wide variant), 24px corners with the 40px leaf corner, plain white (owner, 2026-11-24: the wave and the icon badge are gone), a small left-aligned Fredoka 600 18px title with an optional × beside it, muted 15px body, content-width buttons at the end of the row (quiet first, filled last = DOM and Tab order), blurred berry backdrop, rise + overshoot 0.3s. The page preview is the full-screen dialog restyled as a viewer (`.mp-viewer`). Rules: [Modals](#modals).
- **Input / FormControls / Switch**: fields 1.5px edge, radius 12, 16px; focus = berry edge + 4px pink ring (0.15s); error = brick edge + bold brick message. Checkbox 22px radius 7, berry when checked. Switch 50×28, 22px thumb, bounce 0.3s, berry when on.
- **Tabs**: the Pages/Files view switch inside a tool (2 modes): pink track, white selected pill with berry text.
- **Prose**: legal and placeholder pages: 680px column, Fredoka headings, muted date line, #5b484c 16/28 body, 24px gap, bold berry links (underlined, deviation 5), "In short" Callout, yellow code chips, owner placeholders bracketed in bold ink on sand.
- **Footer**: compact, on cream (owner override): one row with the berry mark + name and ©, then ink links (All tools, About, Help, Privacy, Terms, Cookies, Licenses, Security) that turn berry on hover; Company/Legal headings are sr-only; the A–Z list is folded under a muted "Tools A–Z" toggle.
- **Working mode (Rotate)**: centred page title (no subtitle: owner override). Empty: the floating-berry EmptyState on grid paper (floaties, one blossom sticker) around a white leaf-cornered card holding the large upload button and three short muted lines (drop hint, limits, privacy); the card pops in and its outline breathes. Loaded: a seed-cream working area (no decoration) with a sticky row (Tabs for the view, the size slider, "Add files" as a blueberry tool with the glow), each page in a pink tray with its number in Fredoka; pages in scope get the 2.5px berry ring + leaf tick. Options dock (no visible "Options" title: the numbered steps head it; owner override 2) = an app Panel at ≥ 1024px in the empty state, at least as tall as the drop area and growing with its options (never scrolling inside; its primary sticks to the bottom of the screen), folding into the strawberry-cream bottom bar once a file is in (always that bar below 1024px),  with numbered steps (number in a soft berry disc): "1 Apply to" ChoiceTiles (selected: berry edge and text on the tint, leaf tick badge), "2 Rotate" blueberry toolbar + soft Reset; berry kept for the one finishing action. Processing: the jam bar with "Rotating… 42%" in the dock (the progressbar), and the 96px berry loader over the dimmed pages. Result: one centred Panel, leaf tick, Download is the only berry fill.

## Fit the first screen

Every tool page is a working surface, not a document. The user arrives to do one task, so the first screen must show the whole task and its finishing button. This holds for every tool and every state (empty, loaded, processing, error, result).

### Why (research, 2026-11-23)

- **The fold still matters.** NN/g: people still spend most of their viewing time above the fold (57% in 2018) and scroll only when what they see promises more. A primary button half under the fold reads as "not ready" or is missed.
- **Screens are not viewports.** A 1366x768 laptop shows about 1366x657 of page in a browser window (tabs, address bar, bookmarks, the OS bar), 1920x1080 about 1920x969. Designing for the screen resolution is what cut Rotate's button off. StatCounter still puts 1366x768 at about 10% of desktops, so the short laptop is a primary target.
- **Competitors pin the action.** Captures at 1366x657 (owner's Sejda recording and our own runs, 2026-11-23): on arrival all three show only the title and the upload button in the top half. Once a file is in, Sejda pins "Apply changes" in a full-width bar fixed to the bottom of the window and keeps its one-row toolbar right above the pages; iLovePDF uses a full-height right panel with the action pinned to its bottom; Smallpdf puts "Finish" in a fixed top toolbar. Sejda's result screen has Download at the top of the first screen. None of them make you scroll to the finishing button.
- **Fitts and the thumb.** The primary action sits at a stable, large, predictable place: the bottom of the options panel on desktop, the bottom bar on phones (thumb zone). It never moves between states (empty, ready, processing all use the same slot).

### Rules (UX designer and frontend engineer)

1. **Primary action always in view.** On load, after a file loads, while the page scrolls, and while processing. Desktop (≥ 1024px), empty state: the options panel is at least `--ip-work-h` tall and grows with its options; it never scrolls inside itself (see [Scrolling](#scrolling)). Its status line + primary action are `position: sticky; bottom: 0`, so when the options run past the fold they sit on the bottom edge of the screen (a soft fade above them says there is more) and the page scrolls to the rest; when the options fit, they rest at the panel's bottom. The drop area is sticky under the header, so the picker stays in view while the options scroll by. Below 1024px: the fixed bottom dock holds the primary action. (Owner, 2026-11-24: the options box scrolling inside the page felt cramped and showed a sideways bar.)
2. **Budget the height, don't hope.** The first screen is `100dvh`: header (`--ip-header-h`: 64px below 768px, 72px from 768px) + tool head (`--ip-intro-h`, 76px, one-line title) + workspace row (`--ip-work-h` = `clamp(320px, 100dvh − header − head − 20px, 640px)`) + 20px gap. Everything that must be seen first lives in those rows. Never size a first-screen element from the screen resolution or with a fixed pixel height taller than `--ip-work-h`. Below about 480px of viewport height at ≥ 1024px the 320px floor wins; the primary still sticks to the bottom of the screen. Browsers without `dvh` use `100vh`.
3. **Pure CSS, no measuring for fit.** Heights come from tokens and `dvh`, so the server HTML already fits (no jump on hydration, no CLS). JavaScript measuring is allowed only for the fixed bottom bar's clearance (`--ip-dock-actual`): on phones, and on desktop after a file is loaded, where `--ip-pages-h` uses it (with an 88px fallback close to the bar's real height, so the first loaded paint barely moves). The first screen (empty state) never depends on it.
4. **One line of head.** The tool page head is the `h1` only (owner override 2), one line from 1024px. Nothing else (no subtitle, no banner, no notice) may sit between the header and the workspace on arrival; notices float (NoticeStack) instead of pushing the workspace down.
5. **Dense options.** Options are numbered steps with short labels; no panel title. If a tool's options are taller than the first screen, the panel runs past the fold and the page scrolls to them (never an inner scroller); the primary action stays pinned on screen. Aim to fit every option of a tool without scrolling at 1366x657: if they don't, reconsider the options (group, collapse "More options") before accepting the scroll.
6. **Once a file is in, the pages get the screen (≥ 1024px).** Like Sejda's compact toolbar + fixed "Apply" bar, but in one bar: the tall options panel folds into a compact bar fixed to the bottom (`ControlDock layout="bar"`, the same strawberry-cream bar phones use), options in one row on the left (with labels, since there is room), status + primary on the right. The pages area then takes the full content width and fills the screen down to that bar (`--ip-pages-h`, at least half the viewport height): its tools row stays at the top and the pages scroll inside it with a slim, squarish BerryPDF scroll bar (10px, 4px corners, muted thumb that turns berry on hover; thin and coloured in Firefox), shown only when the pages overflow (owner, 2026-11-24). The page itself does not need to scroll. Thumbnails are watched against that area so their overscan still works. Options style themselves with the `dock-side:` / `dock-bar:` variants (globals.css), never `lg:` for layout, so they fit both. A tool whose options don't fit one row puts the rest behind a "More options" button in the bar that opens a sheet above it; the primary never moves. Below 1024px the page scrolls as usual (an inner scroller on a phone fights the thumb).
7. **Drop area fits the first screen.** In the empty state the drop area is `--ip-work-h` tall (the panel's minimum height), so a tool with few options is one balanced row that ends inside the viewport; with a taller panel the drop area stays pinned under the header while the page scrolls.
8. **Result screen and dialogs fit too.** Download, the result preview and "keep going" are on the first screen at 1366x657. The bigger page view fills the viewport less a slim row of chrome (see [Modals](#modals)), so its arrows and × are always on screen; any dialog fits the screen the same way.
9. **Phones.** Upload button, limits and privacy line sit above the bottom dock; the dock holds the options row and the primary action; nothing important is covered by it (the e2e check hits the element at its centre).
10. **New layouts inherit this.** A tool with its own workspace (Merge, the editor) keeps the shared head, `--ip-work-h` and the dock's pinned footer, or gives the same guarantees and adds itself to the viewport test.

### Viewport checklist (every UI change; screenshots in the spec's `## UI` and the PR)

| Viewport | Why |
|---|---|
| 1280x632, 1366x657, 1536x730, 1440x789, 1920x969 | real browser viewports of the common laptop and desktop screens |
| 1280x720, 1366x768, 1536x864, 1440x900, 1920x1080 | full-screen / kiosk, and what most tools are tested at |
| 1024x768 | tablet landscape: first width with the side panel |
| 768x1024 | tablet portrait: bottom dock |
| 360x640, 390x664, 412x839 | small Android, iPhone with Safari bars, Pixel 7 with Chrome bars |

For each: primary action fully visible and not covered, on load, after loading a 60-page file, after scrolling that file, in the bigger page view and on the result screen; once loaded, the options are in the bottom bar and the pages area spans the content width and at least half the height; no horizontal scroll and no inner scroller outside the [allowed regions](#scrolling); tool head on one line from 1024px. `apps/web/e2e/ui/viewport-fit.spec.ts` enforces this for every usable tool in CI (it reads the registry, so new tools are covered automatically).

## Modals

Owner, 2026-11-24, on Merge's page preview ("Page 13 of 58" at 1900x1300: a small white page in a huge, mostly empty white modal, a wave across the top, a big title and file name, three chunky full-width buttons and a heavy blue ring): "this can be better". Every modal, sheet and viewer follows these rules.

1. **Content first.** A dialog is as big as its content needs and no bigger; chrome is sized to its content, not to the dialog. The title is small (18px) and left-aligned; a file name is not a second heading (put it in the title, or in a tooltip / screen-reader text).
2. **A preview is mostly page.** The page view covers the viewport on a dark scrim and the page fills **≥ 85% of the available height** on desktop and **≥ 90% of the width** on phones, at its aspect ratio, drawn at the device pixel ratio (up to 3), with a hairline edge and a soft shadow so a white page reads. The only chrome is a quiet "13 / 58" counter, a small × and two small round arrows: beside the page from 640px, in a bottom bar (the thumb zone) on phones. Arrow keys, Home / End and a sideways swipe move; Escape, × and a tap on the backdrop close (the backdrop is the dark area around the page, not the chrome rows; it closes on the click that ends the tap, so that click can never fall through to the page underneath, and a drag never closes). A page turned 90° is centred whole in the same space. The neighbouring pages are drawn ahead so moving is instant; the page change is at most a 140ms fade (none under reduced motion).
3. **No decoration.** No waves, bands, badges, illustrations, grab handles that do nothing, or coloured header strips. Above the content there is only the title, the counter and the close button.
4. **Control size caps.** Action buttons in a dialog are 15px, about 40px tall (never over **48px**), as wide as their label, at the end of the row; they wrap on a narrow phone. Icon buttons are 34–44px. No full-width button rows on desktop.
5. **Focus.** `:focus-visible` only, so a pointer click never shows a ring. In a white dialog the ring is 2px berry (`brand`), 2px away; on the viewer's dark scrim it is 2px pale pink (`brand-tint`). Fields keep their own focus edge. A dialog opens with focus on its content (the field, the first choice), not on ×.
6. **Escape closes every dialog** (the native `cancel` event goes through `onClose`); the default modal ignores backdrop clicks so a stray click can't skip a step, the viewer closes on one.
7. **Component-local CSS.** The modal and sheet surfaces and chrome live in `components/ui/dialog.css`, imported by the screens that open them (tool routes and the editor, not the home page), and the viewer in `components/tool-flow/page-preview.css` (the lazy preview chunk); none of it is in `globals.css`.

Enforced in CI by `apps/web/e2e/ui/modals.spec.ts` at 390x844 and 1280x720: the preview's fill ratio and sharpness, a backdrop tap that closes without a click reaching the page underneath, drags that don't close, a 90° page centred and whole, action buttons ≤ 48px and (desktop) footer buttons as wide as their label, nothing above the content but title, counter and close (and no background image on the modal), no ring after a pointer click and an on-theme ring after Tab, and Escape closing it; for the preview, the password dialog, the leave guard, the page picker, Move to position and the editor's Sign dialog. Units: `components/tool-flow/preview-fit.test.ts` (fit, keys, swipe, render ratio).

Sejda, for reference (2026-11-24, Delete pages "Enlarge", 1280x720 and 390x844): the enlarged page sits on a 60% black backdrop with only a × top right; it is fitted to the width (1000px wide at 1280, so it runs below the fold and the backdrop scrolls; 351px of 390 on a phone), has no counter, no previous / next and no arrow keys; Escape closes it. We keep its bare, page-first look, fit the height so the whole page is on screen, and add the counter, arrows, keys and swipe. Screenshots: `/mnt/project-files/designs/modal-redesign/sejda-*`.

## Scrolling

Owner, 2026-11-24 (screen recording of Merge's options box scrolling inside the page with a sideways bar): "the side box … has a smaller one inside it, that needs to be better", and no horizontal scroller. Generalised for every screen:

### Rules

1. **One scroller per surface: the page.** A card, panel, dock, list or form never scrolls inside itself. If it is taller than the screen, it grows and the page scrolls. Its primary action stays in view with `position: sticky` (bottom: 0, a soft fade above it), never by capping the panel's height.
2. **Only these regions may scroll on their own**, each marked with `data-ip-scroll`:
   - `pages`: a tool's work area from 1024px (the pages grid; the full editor's canvas when it lands), so its tools row and the bottom bar stay put. Slim BerryPDF bar, shown only on overflow. Below 1024px the page scrolls.
   - `rail`: a side list of pages or objects next to a work area (the full editor's thumbnails and objects panel), from 1024px. A sibling of the work area, never inside it.
   - `overlay`: the body of a dialog, sheet, menu, popover or toast stack. It is its own layer, so its body is the scroller and the `<dialog>` element itself never scrolls. A dialog with a long list (the page picker) caps the list and lets the rest of the dialog fit.
   - `chips`: a row of chips that swipes sideways below 1024px (no bar, an edge fade says there is more) and wraps from 1024px.
3. **No scroller inside a scroller.** Two regions may sit side by side (canvas + rail), never one inside the other.
4. **Nothing scrolls sideways.** Not the page, not a panel, not a dialog, at any width. Content wraps, truncates with a tooltip, or stacks (a data table stacks its rows on phones, `.ip-stack-table`). Every registered vertical region clips x (`overflow-x: clip`, in `globals.css`), so a sub-pixel overhang (a switch at the edge, a rounding error) can never summon a sideways bar. Only `chips` scroll sideways.
5. **A region contains what it holds.** Registered regions are `position: relative`, so an absolutely placed child (an `sr-only` note, a popover) can't spill out and make the region's parent scroll too.
6. **Toolbars fit their row.** A one-row toolbar (view, sort, size, add) must fit 768px and 1024px; tighten gaps, shorten tracks or fold into a menu, never widen the page.

### Sticky surfaces

A surface that pins (the site header, the home search bar, a tools row, the dock's primary) uses `position: sticky` and never jumps when it pins; the one size change is the home search field, which grows a little when pinned (owner, 2026-11-24; see "Sticky search and filter bars"). It matches the page: the header is the glass pill; everything else pinned is either transparent (the home search bar) or the same surface as the panel it belongs to (the dock's primary on white, the tools row on cream). No extra boxes or shadows appear only because something is stuck.

### Enforced in CI

- `apps/web/src/lib/ui/scroll-rules.test.ts` (unit, every PR): any TSX element whose classes make it scroll (`overflow-auto`, `lg:overflow-y-auto`, …) must carry `data-ip-scroll="pages | rail | overlay | chips"`; any CSS rule that sets `overflow` to auto/scroll must say its kind in an `/* ip-scroll: <kind> */` comment.
- `apps/web/e2e/ui/scroll-rules.spec.ts` (e2e): on the home, info, coming-soon and editor pages and on every usable tool (empty, loaded, pages view, options sheet), at 375x667, 390x664, 768x1024, 1024x768, 1280x632, 1366x657, 1440x789 and 1920x969: no sideways page scroll, nothing scrolls without a registered kind, no registered region inside another scroller, nothing but chips scrolls sideways, and chips don't scroll from 1024px.
- `apps/web/e2e/ui/viewport-fit.spec.ts`: the primary stays on screen on load and after scrolling a tall panel to its end.

### Sejda, for reference (2026-11-24, 1366x657 and 390x664)

Sejda's tool pages have no inner scrollers at all: the page is the only scroller (0 scrolling elements measured on Merge and Rotate, empty and loaded). The empty state shows only the upload button; once a file is in, a full-width bar fixed to the bottom holds the primary and a "More options" button. We keep our options visible before upload (one less click) and match the rest: one scroller, primary pinned. Screenshots: `/mnt/project-files/designs/scroll-rules/sejda-*`.

## Sticky search and filter bars

**Name:** a *sticky* element (CSS `position: sticky`), on a search box usually called a "sticky search bar" or "sticky filter bar". Owner, 2026-11-24: production sites do this and so do we.

**Behaviour:** the bar sits in its normal place; as you scroll down it reaches the header and stays pinned right under it while the list scrolls; scrolling back up, it drops back into its place when its turn comes. **Only the search pins** (owner, 2026-11-24): filters and jump chips sit below it and scroll away with the content. Pinned, the field grows a little (home: 480 to 540 px, from 768 px wide, 200 ms ease-out, none under reduced motion) and stays centred. It is **fully transparent**, pinned or not (owner, 2026-11-24): no ground, blur, border or shadow, so it never reads as a box sitting on the grid paper, and the strip beside the field lets clicks through (`pointer-events: none` on the strip, `auto` on the field).

**Rules (UX designer and UI engineer):**
1. Any long list or grid the user searches (the catalogue, the tools menu, file lists, future history/batch lists) keeps its search in a sticky bar. Filters and jump chips don't pin. Short lists (one screen) don't need one.
2. `sticky top-(--ip-header-h)` under the sticky site header; never `position: fixed` (fixed leaves a hole and needs JS).
3. The search is centred on its own row. On the home page the filter sits right of it from 1024 px and leads the chip row below that (short visible label on phones, accessible name unchanged). Keep the spec's focus order (search, filter, chips). Everything but the search (filter, chips, headings, counts, recent strip) scrolls away.
4. Stuck state comes from a 1px sentinel directly above the bar (any top margin goes on the sentinel, so stuck turns on exactly when the bar pins) and an IntersectionObserver (`data-stuck`), no scroll listeners. The bar's height goes to `--ip-catbar-h` and in-page anchors use `scroll-mt-[calc(var(--ip-header-h)+var(--ip-catbar-h,0px)+16px)]`, so a jump lands below the pinned bar, not under it.
5. The pinned field is fully usable (typing, Escape, `/` shortcut) and nothing covers it; forced colours get a plain Canvas ground (system colours can't be trusted to keep the list readable behind a transparent bar).
6. Tested by `apps/web/e2e/ui/sticky-search.spec.ts` (pins under the header, stuck state, usable while pinned, returns on the way up, jumps land below it, only the search pins, centred and wider when pinned, clicks pass beside it). Copy that pattern for new sticky bars.

## Motion

Exactly `motion.md`: hovers 0.2s; focus 0.15s; button lift 0.12s and press 40ms; card lift 3px 0.2s; icon disc fill + 8° tip 0.2s; logo 14° + 1.1 0.3s ease-in-out; checkbox and icon button press to ~0.9 in 0.12s; switch 0.3s with a tiny bounce; alert 0.9s ease-out (−30px, +5px, settle); modal 0.3s rise + scale .94→1 with overshoot (menu 0.15s); berry loader 2.6s; floaties 5–8s ease-in-out out of step; jam seeds 2.4s; jam width 0.5s; plus the owner's motion pass above. Loops are only the berry loader, the jam, the drop-card breathing and the floating berries (the wave background is gone). Hover lifts, press pushes down, nothing slides sideways (the Mint Paper card nudge is gone); no scroll-triggered reveals. All motion is CSS. Under `prefers-reduced-motion: reduce` every animation and transition is dropped and the berry loader is a still, whole berry; the one exception is the small busy indicator (F1 U-4: it carries state), which pulses instead.

## Strict CSP

No style attribute, `<style>` element or inline handler in server HTML (the build's `csp-manifest` check enforces it). The previews' inline styles became classes: the floaties' `--x/--y/--s/--r/--d/--amp/--delay` are nth-child rules in `globals.css`, the loader and sprite are JSX with classes, the jam fill width and other runtime sizes are set after hydration through the CSSOM. Decoration is inline SVG (`<use>` of the same-document sprite) or CSS `data:` images, which `img-src 'self' blob: data:` allows. Nothing loads from another origin.

## Dark mode

**Not shipped.** BerryPDF defines none yet ("not yet defined"), so the product is light only: `color-scheme: light`, and with the OS in dark mode the grid-paper ground stays (asserted by `e2e/f2/axe.spec.ts`, which also runs axe with `colorScheme: "dark"`).

## Deviations from BerryPDF

Each is forced by WCAG 2.1 AA (text 4.5:1, large text 3:1, non-text UI 3:1) or by an F1/F2 acceptance criterion. Contrast measured with the WCAG formula; the grid paper is measured at its pinkest point (a grid line, #fceeef).

| # | Where | BerryPDF | Measured | Ours | Measured |
|---|---|---|---|---|---|
| 1 | Berry button hover | `filter: brightness(1.06)` | white 4.31:1 | `brightness(1.03)` | 4.53:1 |
| 2 | Field, checkbox, switch-off and range edges (1.4.11) | #ecd5d9 / #e2b9c1 / #e6d3d6 | 1.39 / 1.76 / 1.43:1 | #a2848a (the checkbox pink, darkened) | 3.39:1 on surface, 3.02:1 on milk |
| 3 | Field placeholder | #a8959a | 2.83:1 | `muted` | 5.45:1 |
| 4 | Category eyebrows (15px 600), on grid paper | `cat-*` | gooseberry 2.33, cloudberry 2.19, huckleberry 3.94 (on a grid line) | those three darkened to 4.5:1 (table above); discs and icons keep the full colour; the other five are unchanged | 4.85–4.92:1 |
| 5 | Prose links | bold berry, no underline | berry vs prose text 1.25:1 (1.4.1) | also underlined (2px, pale berry; full berry on hover) | – |
| 6 | Header | "no bar or border" (Header README) and not sticky | – | white bar + sand line (pages.md, bundle polish), sticky for F2 AC-32/AC-38 | – |
| 7 | Small busy indicator under reduced motion | still berry | – | still berry that pulses (F1 U-4) | – |
| 8 | Hero subtitle | README: `brand-bright` | 3.41:1 (fails at 18px on phones) | `brand-strong`, as the bundle's `.mp-hero h2` | 6.01:1 |

Not deviations, recorded for clarity: white on `brand` measures **4.78:1** (BerryPDF says "about 4.8:1": confirmed, passes AA for the 17px button label); the selected ChoiceTile label `brand-strong` on `brand-tint` is 6.03:1, so BerryPDF's berry text is kept.

## Measured contrast (light)

| Pair | Ratio |
|---|---|
| White on `brand` / hover fill (×1.03) | 4.78 / 4.53 |
| `ink` on grid line / sand / milk | 12.01 / 11.15 / 12.09 |
| `ink-black` on surface | 16.34 |
| `muted` on surface / grid line / cream / milk / band / brand-tint / canvas | 5.45 / 4.83 / 5.19 / 4.87 / 4.97 / 4.85 / 4.76 |
| `brand-strong` on surface / grid line / brand-tint / pink hover / cream / milk / sand | 6.78 / 6.01 / 6.03 / 5.35 / 6.45 / 6.05 / 5.58 |
| White on `brand-strong` (pill) / `leaf` (tick) / `danger` | 6.78 / 5.33 / 7.89 |
| Prose #5b484c on surface / grid line | 8.48 / 7.52 |
| Alert success / danger / info text | 6.92 / 8.21 / 7.69 |
| Alert close at 70% (success / danger / info), non-text | 3.51 / 4.26 / 3.79 |
| Editing tool #3147b8 on white / hover; active `tool-active-ink` on `tool-active-bg` | 7.71 / 6.98; 8.80 |
| Footer: ink links / berry headings / muted, on cream | 12.88 / 6.45 / 5.19 |
| Danger text on surface | 7.89 |
| Focus `link` on surface / grid line / milk / sand / tray (non-text) | 5.15 / 4.56 / 4.60 / 4.24 / 4.58 |
| Field / checkbox / switch-off edge #a2848a on surface / milk / brand-tint (non-text) | 3.39 / 3.02 / 3.01 |
| `brand` as switch-on track and focused field edge (on surface); selected tray ring and tile edge (on brand-tint); jam fill (on cream) | 4.78; 4.25; 4.54 |

Rules: berry text is always `brand-strong`; `brand-bright`, `subtle` and the bundle's pale pinks are never used for text; colour is never the only cue for state (selected tiles get a tick badge, pages in scope a ring and a tick, errors an icon and words).

## Forced colors

Shadows and backgrounds are dropped in Windows High Contrast, so controls whose edge is a shadow (`.ip-edge`) get a 1px `ButtonText` border; the selected ChoiceTile (`.ip-seg-checked`, edges are inset shadows) gets a 2px `Highlight` border so its focus outline stays free; the switch track gets a `ButtonText` border and thumb; trays in scope get a `Highlight` outline; decorative floaties, stickers and the vine are hidden. Covered by `e2e/ui/forced-colors.spec.ts`.
