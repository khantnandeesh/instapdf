# BerryPDF design system

The single source of truth for the product's visual design: the owner's **BerryPDF** design system (adopted 2026-11-23, replacing Mint Paper; the product itself was renamed from InstaPDF to BerryPDF the same day), how our `--ip-*` tokens map onto it, the category berries, measured contrast, and every place we deviate from BerryPDF and why. Feature specs (`docs/specs/*.md`, `## UI`) describe layout, components and behavior and point here for every visual value.

- Implementation: `apps/web/src/styles/tokens.css` (BerryPDF tokens under their own names, our `--ip-*` role tokens mapped onto them, Tailwind v4 `@theme`), `apps/web/src/app/globals.css` (the BerryPDF components and motifs, `mp-` classes, keyframes, the berry loader) and `apps/web/src/components/berry/Berry.tsx` (the berry sprite, berry mark, berry loader, floating berries, stickers, vine divider). Components never use raw hex values.
- BerryPDF's own files are the spec: `README.md`, **`tokens.json` (the source of truth for values)**, `motion.md`, `pages.md`, `components/bundle.css` and each `components/<Comp>/README.md` + `preview.html`. Its `tokens.css` and `api/tokens.md` are stale (they still hold Mint Paper values) and are ignored. We copy values exactly and resolve `tokens.json`'s `{gooseberry}`-style aliases. We do not load `bundle.css` (it imports Google Fonts and its previews use inline styles).
- Rule: **follow BerryPDF as fully as possible**; where it conflicts with WCAG 2.1 AA (the e2e axe gate fails on any serious violation) or with the strict CSP, we take the smallest change, prefer an alternative BerryPDF itself offers, and list it under [Deviations](#deviations-from-berrypdf).

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

**Fredoka**, latin subset, weights 400, 500, 600 and 700, self-hosted with `next/font/local` from `@fontsource/fredoka` **5.3.0** (exact-pinned; SIL OFL 1.1 verified in the installed `package.json` and `LICENSE`; the package ships CSS and font files only, so the license scan classifies it as a font; notice in `apps/web/THIRD-PARTY-NOTICES.md`, `/licenses` and `/third-party-notices.txt`). All four files are preloaded from our origin, with a metric-adjusted Arial fallback. **One family everywhere**: `--font-sans`, `--font-display`, `--font-ui` and `--font-mono` all resolve to Fredoka. (The EditorToolbar spec and `tokens.json`'s tool-button usage text mention a system font; `tokens.json` sets that style's family to `sans` = Fredoka and the README says "no second font", so Fredoka wins.) Atkinson Hyperlegible is removed. Case: Title Case card titles (CSS `capitalize`), UPPERCASE eyebrows and footer headings (CSS only; DOM text keeps our copy), sentence case elsewhere.

## Icons

**Phosphor, Duotone** (MIT), from `@phosphor-icons/core` **2.1.1** (exact-pinned devDependency; MIT verified in the installed package). `scripts/gen-tool-icons.mjs` copies only the path data into `src/tools/tool-icons.tsx` (45 tool icons, one per tool; the generator fails on a duplicate) and `src/components/ui/icons.tsx` (30 interface icons), each carrying the MIT notice; they render as server-side inline SVG in `currentColor` with the main shape at 20%. In tool cards the icon sits in a 40px disc tinted with the category colour at 16%. Lucide is removed.

## Motifs (Berry kit)

- **Sprite** (`BerrySprite`, once per page in the root layout): the berry skin, cut face, star, blossom and leaf symbols with their gradients and clip paths, referenced with `<use href="#mp-...">`.
- **Logo**: the berry mark (34px) + "BerryPDF" in Fredoka 600; hover tips the berry 14° and grows it to 1.1 (0.3s ease-in-out).
- **Background**: grid paper only (24px squares, 7% berry red, on #fffdfb), carried by `html`/`body` behind every page, working screens included. No waves, gradients, glows, patterns or coloured bands behind sections (BerryPDF's updated Backgrounds; the earlier waves/glow/gingham/skin classes are gone). White surfaces (cards, header, modal, inputs, panels) stay solid white so the grid never runs behind component text.
- **Dividers**: one style per page, the vine: before the footer on every page, between the home hero and catalogue, and between the coming-soon/404 empty state and "Ready to use now" (40px clear on the content side). Sections otherwise change by spacing. The jam drip (under a red header or banner) and the scallop (pink meets cream) exist as classes but have no place yet. Panels split rows with sand hairlines.
- **BerryBits**: seed-bullet lists (hero reassurance, legal "In short" and lists, owner-password permissions), the jam label ("Coming soon"), die-cut stickers (hero: berry and leaf in the margins at ≥ 1280px; Rotate empty state: one blossom; never more than 3 per screen, never over text). The berry **rating** is not used: we have no real rating to show, and BerryPDF requires the number beside it.
- **Floating berries and blossoms** (`Floaties`, sets `hero` and `empty`, positions from the previews as nth-child CSS): behind the hero, the Rotate empty state, coming-soon and 404. Small, pale, depth-layered, out of step; on phones the mid layer (and the hero's back layer) is hidden so nothing sits on words.
- **Feedback**: the berry loader (2.6s), the vine strip, jam progress, the floating-berry empty state.

## Components (BerryPDF → where)

- **Home skeleton**: BerryPDF's Home template is header → hero → catalogue grouped by eyebrow → rating → two feature cards → a seed-list of features → footer. We build header → hero → vine → catalogue → vine → footer. Not built, deliberately: the rating (we have no real rating, and BerryPDF requires the number beside it) and the feature cards and features list (new marketing copy, which needs the copy owner and a spec change; F2 copy is unchanged by this re-theme).
- **Header**: a white bar with a 1.5px sand line (pages.md), sticky (F2 AC-32/AC-38); logo, the "All tools" pill chip (cream, sand ring), up to 5 shortcuts (16px, 8×12, radius 10, milk hover and current page with berry text).
- **Hero**: centred on grid paper, 120px above the title (60px below 768px), 28–44px headline in ink-black, berry subtitle (`brand-strong`), one berry button, a muted "See all N tools" link, reassurance as a seed list, floaties and two stickers.
- **Catalogue**: on the grid paper after a vine; section title + muted subtitle, search (Input), "Only ready tools" (Switch), jump chips (nav chip), Recent chips, the Popular row and eight groups under UPPERCASE eyebrows; 3 columns of 300px from 1024px.
- **ToolCard**: white, 1.5px sand border, 16px corners with the 28px leaf corner bottom right, `shadow-card`; 40px disc (category at 16%) with a 22px duotone icon; Fredoka 600 18px Title Case title; 14/19 muted description. Hover/focus: lifts 3px, `shadow-lift`, border #f5b9c3, disc fills, icon turns white and tips 8° (0.2s). Beta = pill, Coming soon = tag, "Runs in your browser" in help style.
- **Menu**: white, 1.5px sand, radius 14, `shadow-menu`, scale-in .15s; rows 8×12, radius 9, icon in category colour, band hover with berry text. Below 768px it stays the full-screen dialog (F2 H-7).
- **Button**: the berry button (13×22, radius 14, Fredoka 600 17px, solid 4px `brand-strong` lip + pink glow + top light line; hover lifts 1px, press drops 3px in 40ms), `lg` (20px, 16×28, radius 16), `ghost` (tint on a pale lip), `soft`, `line`, `outline`, `tool` (blueberry EditorToolbar), `plain`; `IconButton` = 34px round tint (press 0.92). Focus: 3px blueberry, 3px away. Disabled 50%.
- **Alert**: floating notices, tinted, icon + bold words, round close, drop-in (from 30px up, 5px past, settle, 0.9s ease-out); success green, danger brick, info/warning blueberry. **Callout**: inline info/warning, band + sand outline, radius 14, leaf icon.
- **Modal**: 380px, 24px corners with the 40px leaf corner, pale-pink wave across the top, icon badge (60px white circle, pink ring), centred Fredoka title, muted body, two equal-width buttons (quiet left, filled right = DOM and Tab order), blurred berry backdrop, rise + overshoot 0.3s.
- **Input / FormControls / Switch**: fields 1.5px edge, radius 12, 16px; focus = berry edge + 4px pink ring (0.15s); error = brick edge + bold brick message. Checkbox 22px radius 7, berry when checked. Switch 50×28, 22px thumb, bounce 0.3s, berry when on.
- **Tabs**: the Pages/Files view switch inside a tool (2 modes): pink track, white selected pill with berry text.
- **Prose**: legal and placeholder pages: 680px column, Fredoka headings, muted date line, #5b484c 16/28 body, 24px gap, bold berry links (underlined, deviation 5), "In short" Callout, yellow code chips, owner placeholders bracketed in bold ink on sand.
- **Footer**: cream sitemap after the vine; berry mark + name + muted sign-off, uppercase Fredoka headings in berry red, ink links that turn berry on hover.
- **Working mode (Rotate)**: centred page title + muted subtitle. Empty: the floating-berry EmptyState on grid paper (floaties, one blossom sticker) around a white leaf-cornered card holding the large upload button and muted reassurance. Loaded: a seed-cream working area (no decoration) with a sticky row (Tabs for the view, the size slider, "Add files" as a blueberry tool with the glow), each page in a pink tray with its number in Fredoka; pages in scope get the 2.5px berry ring + leaf tick. Options dock = an app Panel at ≥ 1024px (strawberry-cream tab fixed to the bottom below) with numbered steps (number in a soft berry disc): "1 Apply to" ChoiceTiles (selected: berry edge and text on the tint, leaf tick badge), "2 Rotate" blueberry toolbar + soft Reset; berry kept for the one finishing action. Processing: the jam bar with "Rotating… 42%" in the dock (the progressbar), the vine strip growing under the header, and the 96px berry loader over the dimmed pages. Result: one centred Panel, leaf tick, Download is the only berry fill.

## Motion

Exactly `motion.md`: hovers 0.2s; focus 0.15s; button lift 0.12s and press 40ms; card lift 3px 0.2s; icon disc fill + 8° tip 0.2s; logo 14° + 1.1 0.3s ease-in-out; checkbox and icon button press to ~0.9 in 0.12s; switch 0.3s with a tiny bounce; alert 0.9s ease-out (−30px, +5px, settle); modal 0.3s rise + scale .94→1 with overshoot (menu 0.15s); berry loader 2.6s; floaties 5–8s ease-in-out out of step; jam seeds 2.4s; vine strip 4.4s linear; jam width 0.5s. Loops are only the berry loader, the vine strip and the floating berries (the wave background is gone). Hover lifts, press pushes down, nothing slides sideways (the Mint Paper card nudge is gone); one entrance per view; no scroll-triggered reveals. All motion is CSS. Under `prefers-reduced-motion: reduce` every animation and transition is dropped and the berry loader is a still, whole berry; the one exception is the small busy indicator (F1 U-4: it carries state), which pulses instead.

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
