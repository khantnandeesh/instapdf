# InstaPDF on Mint Paper

The single source of truth for InstaPDF's visual design: the owner's **Mint Paper** design system (chosen 2026-11-23, replacing Universal UI), how our `--ip-*` tokens map onto it, the category hues, measured contrast, and every place we deviate from Mint Paper and why. Feature specs (`docs/specs/*.md`, `## UI`) describe layout, components and behavior and point here for every visual value.

- Implementation: `apps/web/src/styles/tokens.css` (Mint Paper tokens with their own names, our `--ip-*` role tokens mapped onto them, Tailwind v4 `@theme`) and `apps/web/src/app/globals.css` (the Mint Paper components, `mp-` classes). Components never use raw hex values.
- Mint Paper's own files (README, tokens, motion, pages, component specs and previews) are the spec. We copy its values exactly; we do not load its `bundle.css` (it imports Google Fonts).
- Rule: **follow Mint Paper strictly**; where it conflicts with WCAG 2.1 AA (our e2e axe gate fails on any serious violation) we take the smallest change, prefer an alternative Mint Paper itself offers, and list it under [Deviations](#deviations-from-mint-paper).

## The idea

A white page, one warm sand wash, one mint action, and many small leaf-cornered cards coloured by category. Only the primary button is filled with mint; colour means category, never state; cards are a 1px sand border plus `shadow-card`; motion is a small nod.

## Tokens

All Mint Paper tokens exist under their Mint Paper names with their exact values:

- Colour (`:root`): `--brand` #00bb88, `--brand-bright` #00cc99, `--brand-strong` #00805c, `--brand-tint`, `--brand-tint-border`, `--brand-deep` #00a37a, `--brand-soft`, `--ink` #333, `--ink-black` #000, `--muted` #666, `--subtle` #9aa5aa, `--surface` #fff, `--surface-soft` #f8f8f8, `--surface-footer` #f8f9fa, `--band` #eee, `--sand` #f3e5d8, `--border` #eee, `--border-card` #e9ecef, `--link` #0282e5, `--danger` #ff3268, `--cat-*` (8), `--choice-bg`, `--tool-active-bg`, `--tool-active-ink`, `--tool-glow`, `--canvas`, `--panel-border`, `--page-tray`, `--switch-off`, `--hint`, `--code-*`, `--syntax-*`. Tailwind: `bg-brand`, `text-brand-strong`, `bg-sand`, `bg-band`, `text-muted`, ...
- Values the component bundle uses without a token: `--mp-*` (hint ink #767676, menu row hover #f5f5f5, alert edges, danger alert #c4124a, prose #555/#444, footer link #222, callout tint, input focus glow).
- Spacing `--space-1..9` (4, 8, 12, 16, 20, 30, 40, 60, 120). Durations `--dur-fast` .15s, `--dur-base` .2s, `--dur-move` .3s, `--dur-slow` .5s, `--dur-attention` 1s, `--dur-tool` .4s. Z: `--z-header` 899, `--z-header-link` 900, `--z-progress` 1000.
- `@theme static` (emitted under the same names): radius `sm` 4, `md` 5, `lg` 6, `card` 10, `leaf` 25, `pill` 20, `panel` 8, `tray` 10, `round` 26; shadows `card`, `button`, `menu`, `plan`, `pressed`, `panel`, `glow`, `window`; easing `standard`, `enter`, `progress-a`, `progress-b`; families `--font-sans` / `--font-ui` / `--font-mono`.
- Type styles become Tailwind utilities with size, line height, tracking and weight: `text-hero` 39/42.9 −1 700, `text-page-title` 36/39.6 −1 700, `text-section-title` 30/33 −.5 700, `text-card-heading` 26/28.6 −.5 700, `text-subtitle` 26/28.6 500, `text-body` 17/25.5, `text-tile-title` 18/28, `text-tile-desc` 14/16, `text-eyebrow` 18/24, `text-button` 18/25.7 700, `text-button-lg` 22/29 700, `text-nav` 17/24.3, App styles with `font-ui`: `text-tool-button` 14/20, `text-choice-label` 15/20, `text-pill` 10/12, `text-help` 12/17; `text-prose-h2` 22/26 700, `text-prose-body` 16/28, `text-step-title` 20/28, `text-code` 13/19, `text-code-chip` 12/16. (Mint Paper's `--text-*` font shorthands are expressed this way instead.) The generic `text-xs…4xl` are re-pointed at this scale (12, 14, 17, 18, 20, 22, 26, 30).

### `--ip-*` role mapping (names kept so feature code keeps working)

| `--ip-*` | Mint Paper | Value | Use |
|---|---|---|---|
| `bg`, `surface-raised`, `surface-overlay`, `chrome` | `surface` | #fff | page, cards, panels, menus, dialogs, sticky bars |
| `surface` | `surface-footer` | #f8f9fa | footer ground |
| `well`, `surface-sunken`, `pressed` | `page-tray` / `band` | #eee | trays, tags, placeholders |
| `hover` | menu row hover | #f5f5f5 | hover rows |
| `border` | `border` | #eee | hairlines (panel rows only) |
| `field-line`, `border-strong` | bundle hint grey | #767676 | text-field edges, switch-off track, range track (deviation, see below) |
| `fg` / `fg-muted` / `fg-disabled` | `ink` / `muted` / `hint` | #333 / #666 / #aaa | text |
| `accent`, `primary` | `brand` | #00bb88 | the one filled action, progress line |
| `primary-hover` | `brand-bright` | #00cc99 | primary hover fill |
| `on-primary` | `ink-black` (see deviation 1) | #000 | label on mint fills |
| `primary-ink`, `on-primary-soft`, `success`, `warning` | `brand-strong` | #00805c | mint text, icons |
| `primary-soft`, `success-soft` | `brand-soft` | mint 7% | soft buttons, icon buttons |
| `primary-faint` | `brand-tint` | mint 6% | ghost fill |
| `focus` | `link` | #0282e5 | 3px focus outline, 2px offset |
| `danger` | `danger` | #ff3268 | field error edge and glow |
| `danger-strong` | danger alert | #c4124a | danger alert fill, error icons |
| `shadow-sm` / `-md` / `-lg` | `shadow-card` / `-panel` / `-menu` | | |
| `cat-<category>` / `-text` | `cat-*` | see below | catalogue hues |

Removed (dark mode, Universal UI only): `--ip-paper-filter`, `--ip-duration-*`, `--ip-ease-*`, `shadow-control*`, `shadow-primary`, `shadow-hero`, `shadow-lift`.

## Categories → `cat-*` hues

| Our category | Mint Paper hue | Icon disc and icon | Eyebrow text (≥ 4.5:1 on sand) |
|---|---|---|---|
| Organize pages | `cat-merge` | #2dc36a | #1b7640 (4.58) |
| Edit & sign | `cat-edit` | #0282e5 | #026aba (4.51) |
| Optimize | `cat-compress` | #29aad2 | #1b6f89 (4.62) |
| Security | `cat-split` | #83b31f | #527013 (4.62) |
| Convert from PDF | `cat-convert-from` | #f9812e | #ad4a05 (4.53) |
| Convert to PDF | `cat-convert-to` | #6b0bff | #6b0bff (5.46, unchanged) |
| Scans | `cat-scans` | #e6405c | #c91a38 (4.61) |
| Automate | `cat-other` | #da00ac | #c00098 (4.60) |
| Popular row | `cat-edit` ("Most Popular") | | #026aba |

Mint Paper pairs Security with `cat-compress`; our Optimize group already takes `cat-compress` and sits next to Security, and `cat-split` is otherwise unused (our Organize group holds merge and split tools), so Security takes `cat-split` to keep eight distinct hues. "Recently used" is not a category: its eyebrow is ink. Planned tools keep the category eyebrow but their icon disc is neutral (muted), so ready tools read as live (F2 H-1 "honest catalogue").

## Type

**Atkinson Hyperlegible**, latin subset, weights 400 and 700, self-hosted with `next/font/local` from `@fontsource/atkinson-hyperlegible` **5.3.0** (pinned; SIL OFL 1.1, verified in the installed package, notice in `apps/web/THIRD-PARTY-NOTICES.md`). Both files are preloaded; no request leaves our origin; metric-adjusted Arial fallback so the swap does not shift. The family exposes `--font-atkinson`, placed first in Mint Paper's stack: `var(--font-atkinson), "Atkinson Hyperlegible", Atkinson, system-ui, sans-serif`. Inter is removed.

- The package has no 500 weight (Atkinson Hyperlegible ships 400/700). Mint Paper's 500 subtitle keeps `font-weight: 500`, which renders the 400 face (no synthesis). Italic is not shipped yet (nothing uses it; the Prose date line will need the 400-italic file).
- App mode (`font-ui`, Mint Paper's system stack `-apple-system, system-ui, "Segoe UI", Roboto, sans-serif`): soft, line, tool and small buttons, choice-tile labels, pills, help text, the runtime marker.
- Case: Title Case on card titles (CSS `capitalize`, as Mint Paper), UPPERCASE eyebrows and footer headings (CSS only; the DOM text keeps our copy), sentence case elsewhere. Copy is unchanged.

## Components (Mint Paper → where)

- **Header**: quiet, borderless; logo (30px mint mark + "InstaPDF" in brand-strong, mark spins one turn and scales to 1.1 on hover, the name fades to mint over 1s), the "All tools" chip (`surface-soft`, 1px border, radius-md), plain 17px ink-black shortcuts (no underline, no active pill; `aria-current` stays). Shortcuts hidden below 768px. Sticky (deviation 7).
- **Hero**: centered, 120px of air above the title (60px below 768px; Mint Paper leaves mobile undefined), hero title in ink, mint subtitle, one primary button, a small muted "See all N tools" link, the trust lines small and muted, faint dotted circles floating in the far corners (≥ 1024px).
- **Catalogue**: the sand wash (`linear-gradient(sand, transparent)`) holds the whole catalogue: section-title + grey subtitle, search, ready-only switch, jump chips (nav-chip style), Recent chips, the Popular row and the eight groups, each under an UPPERCASE eyebrow; cards in 3 columns of 300px (957px block, 20px row gap) from 1024px, 2 columns from 640px, 1 below.
- **ToolCard**: white, 1px sand border, leaf corner 10/10/25/10, `shadow-card`, padding 15 20 7 7, 32px halo (category hue at 20%, 15px line icon at 1.5px stroke in the full hue), 18px Title Case title in ink-black, 14px muted description. Hover: 2px nudge left and back (0.5s linear), halo to full opacity and the icon to white (0.2s). No lift. Beta = pill, Coming soon = grey tag, "Runs in your browser" in help style.
- **Menu**: the tool menu is a Mint Paper dropdown under the All chip (white, 1px rgba(0,0,0,.15), radius-sm, `shadow-menu`, scale-in .15s), rows 3×15 with a 16px icon in the category hue and #f5f5f5 hover, group eyebrows in the category text shade. No dimming: an invisible layer catches the outside click. Below 768px it stays the full-screen dialog (F2 H-7).
- **Buttons** (`Button` variants): `primary` (`mp-btn`, 18px bold, 8×16, radius-sm, `shadow-button`; hover brand-bright; active `shadow-pressed`), `lg` size (22px, 10×16, radius-lg, no shadow), `ghost`, `soft`, `line`, `outline` (also `secondary`), `tool` (EditorToolbar), `plain`; `IconButton` = `mp-iconbtn` (30px round soft) or the plain header style with a round halo. Disabled = 50% opacity.
- **Alert**: floating notices are Mint Paper alerts, top center, dropping in (mp-slide-down 1s); mint for info/success/warning, the danger alert for errors. Inline info/warning notices are **Callouts**.
- **Modal**: dialogs are white, radius-md, 24px padding, card-heading title, muted body, primary + ghost left-aligned (primary first visually; DOM and Tab order unchanged), scale-in .3s.
- **Progress**: the processing state shows the 3px mint line fixed to the top of the viewport (`z-progress`, width animates .5s); the dock keeps "Rotating… 42%".
- **Input**: 1px edge, radius-sm, 17px, inset shadow; focus = link-blue edge + 8px glow (.15s) with a transparent 2px outline for forced colors; error = danger edge + glow. Password fields follow AuthForm: 40px, radius-lg, placeholder in view, label visually hidden.
- **Switch**: 48×26 track, 18px thumb, .4s, label on the left at 16px in #555.
- **Footer**: light sitemap on `surface-footer`, 40px padding, small muted sign-off, bold UPPERCASE 14px headings, near-black links, no icons and no dividers.
- **Prose**: footer info pages are the 680px Prose column (page-title, #555 16/28 body, mint links). Mint Paper drops the header on legal pages; F2 AC-23 keeps it on every page.
- **Working mode (Rotate)**: centered page-title + grey subtitle; empty state is the grey band with the large upload button and small muted reassurance lines (inside the left column, because the F1 dock stays on screen from the first paint); loaded state: a sticky row of editing tools (Pages/Files as a joined toolbar with the blue glow, the size slider, "Add files" as a tool button), each page in a grey tray (20px padding, radius 10, number below), scope selection = link-blue outline; the options dock is an app Panel (≥ 1024px; a sand action strip fixed to the bottom below) with numbered step titles ("1. Apply to" ChoiceTiles, "2. Rotate" blue tool buttons + soft Reset) and mint kept for the single finishing action. Result = one centered Panel; Download is the only mint fill.

## Motion

Exactly Mint Paper's `motion.md`: hovers .2s, focus .15s, transforms .3s ease-in-out, card nudge .5s linear, alert slide-down 1s ease-out, modal .3s, menu .15s, progress loop 2.1s with the two beziers, switch and toolbar .4s, dotted corner art floats 4s alternate. No lift on hover, no staggered or scroll-triggered entrances (the Universal UI settle/rise/drop/draw entrances are removed). Under `prefers-reduced-motion: reduce` every animation and transition is dropped; the one exception is the busy spinner, which pulses (F1 U-4: it carries state). The decorative orbiting section waves are not used (section edges "may" be waves; ours change by background only).

## Dark mode

**Not shipped.** Mint Paper defines none yet ("not yet defined"), so InstaPDF is light only: the dark token blocks and the OS dark-mode switch are removed, `color-scheme: light` keeps native controls light. With the OS in dark mode the light palette stays (asserted by `e2e/f2/axe.spec.ts`, which still runs axe with `colorScheme: "dark"`). Dark mode is pending the designer's definition.

## Deviations from Mint Paper

Each is forced by WCAG 2.1 AA (text 4.5:1, large text 3:1, non-text UI 3:1) or by an F2 acceptance criterion. Contrast measured with the WCAG formula, translucent colours composited on their ground.

| # | Where | Mint Paper | Measured | Ours | Measured |
|---|---|---|---|---|---|
| 1 | Primary button label (`--ip-on-primary`) | white on `brand` | 2.48:1 (2.08 on hover) | `ink-black` #000 | 8.46:1 (10.10 on hover) |
| 2 | Category eyebrows (18px regular) | `cat-*` text on sand | 1.86–3.72:1 (convert-to 5.46 passes) | same hue darkened to 4.5:1 on sand (table above) | 4.51–4.62:1 |
| 3 | Hero subtitle (26px) | `brand-bright` | 2.08:1 | `brand-strong` | 4.95:1 |
| 4 | Grey subtitles (tool, 404) | `subtle` #9aa5aa | 2.52:1 | `muted` #666 | 5.74:1 |
| 5 | Selected ChoiceTile label (15px) | `brand-strong` on `choice-bg` | 4.35:1 | `ink` (icon stays brand-strong) | 11.10:1 |
| 6 | Editing-tool button label (14px) | `link` #0282e5 | 3.94:1 | `tool-active-ink` #01518d (edge and glow stay link blue) | 8.19:1 |
| 7 | Text-field edge (1.4.11) | #ccc | 1.61:1 | #767676 (bundle's hint grey) | 4.54:1 on white, 3.68:1 on sand |
| 8 | Switch track (1.4.11) | off #ccc / on `brand` | 1.61:1 / 2.48:1 | off #767676 / on `brand-strong` | 4.54:1 / 4.95:1 |
| 9 | Alert close × at rest | 60% white | 2.77:1 (mint), 2.86:1 (danger) | 75% white | 3.47:1 / 3.83:1 |
| 10 | Page number under a tray thumbnail (14px) | #767676 on #eee | 3.91:1 | `muted` | 4.95:1 |
| 11 | Header | not sticky, no background | – | sticky on a white ground (F2 AC-32/AC-38: the menu must open without scrolling back up) | – |
| 12 | Legal pages | no header | – | header kept (F2 AC-23) | – |
| 13 | Footer link rows | line-height 1.7 at 14px (23.8px) | – | 24px rows (WCAG 2.5.8 target size) | – |
| 14 | Pill fill | token says `brand-deep` (white 3.22:1) | 3.22:1 | `brand-strong`, as the bundle's own `.mp-pill` | 4.95:1 |

Mint Paper itself flags 1, 3, 4 and the hint tones; 14 follows its own bundle. Hover states that flood ghost, soft and icon buttons to mint use `--ip-on-primary` for their words, so they follow deviation 1 automatically.

**Strict variant for the owner:** set `--ip-on-primary: #ffffff` in `tokens.css` (one line) to get Mint Paper's white-on-mint primary; it fails AA (2.48:1) and the axe gate would flag every primary button. Screenshot: `ui-shots-mint/09-home-strict-white-primary-1280.png` (in the PR/handoff notes).

## Measured contrast (light)

| Pair | Ratio |
|---|---|
| `ink` on surface / sand / band | 12.63 / 10.23 / 10.89 |
| `ink-black` on sand | 17.01 |
| `muted` on surface / sand / band / surface-footer / surface-soft | 5.74 / 4.65 / 4.95 / 5.45 / 5.41 |
| `brand-strong` on surface / brand-tint (ghost) / brand-soft (soft) / surface-soft | 4.95 / 4.71 / 4.62 / 4.66 |
| `brand-strong` on sand / band (not used for text) | 4.01 / 4.27 |
| `#000` on brand / brand-bright | 8.46 / 10.10 |
| white on brand-strong (alert, pill) / on #c4124a (danger alert) | 4.95 / 5.94 |
| `tool-active-ink` on white / on tool-active-bg / on #f6f6f6 | 8.19 / 6.94 / 7.58 |
| #555 (prose, switch label) on white / sand | 7.46 / 6.04 |
| #222 footer links on surface-footer | 15.09 |
| focus `link` outline on surface / sand / band (non-text) | 3.94 / 3.19 / 3.40 |
| field edge #767676 on surface / sand (non-text) | 4.54 / 3.68 |

Rules: mint text is always `brand-strong` and never sits on sand or band; `brand-bright`, `subtle` and `hint` are never used for text; colour is never the only cue for state (selected tiles and pages also get an edge, a check or an outline).

## Forced colors

Shadows and backgrounds are dropped in Windows High Contrast, so controls whose edge is a shadow (`.ip-edge`) get a 1px `ButtonText` border; the selected choice tile (`.ip-seg-checked`, edges drawn with inset shadows) gets a 2px `Highlight` border, so its focus outline stays free; the switch track gets a `ButtonText` border and thumb. Covered by `e2e/ui/forced-colors.spec.ts`.
