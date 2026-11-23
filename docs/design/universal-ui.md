# InstaPDF on Universal UI

The single source of truth for InstaPDF's visual design system: token values, the accent family, dark mode, type, shape, depth, motion and measured contrast. Feature specs (`docs/specs/*.md`, `## UI`) describe layout, components and behavior and point here for every visual value.

- Implementation: `apps/web/src/styles/tokens.css` (`--ip-*` custom properties, exposed to Tailwind v4 through `@theme inline`) and `apps/web/src/app/globals.css` (field, tint and paper helpers). Components never use raw hex values.
- Basis: the owner's Universal UI system (derived from the Stageshow look). We keep our `--ip-*` names and map them onto Universal UI roles; we do not import its React bundle.
- Adopted 2026-11-23 (owner choice: teal "Lagoon" accent and this dark mode).

## Token meaning (what changed against the pre-Universal tokens)

Every pre-existing `--ip-*` name keeps its meaning; only values moved. In particular `primary` is still both a fill (with `on-primary`) and safe as text, `primary-soft` is still opaque, and `on-danger` still pairs with `danger`. Notes for branches written against the old tokens:

- `bg` and `surface` are now the same warm canvas; cards are `surface-raised`.
- `surface-sunken`, `border` and `border-strong` are now translucent inks (they adapt to whatever they sit on). `border-strong` is reserved for switch and slider tracks; text fields, secondary buttons and chips use the new `field-line` (also ≥ 3:1).
- `shadow-sm` / `shadow-md` / `shadow-lg` now carry Universal UI roles: card ring, window, float.
- New tokens only (no renames): `surface-overlay`, `chrome`, `well`, `hover`, `pressed`, `field-line` / `-hover`, `inverse` / `on-inverse`, `accent`, `primary-ink`, `primary-faint`, `primary-ring`, `danger-hover`, `paper-filter`, `shadow-control` / `-hover`, `shadow-primary`, `shadow-hero`, `shadow-lift`, `radius-2xl`.
- `text-primary` remains valid. `text-primary-ink` is the preferred accent-text utility (identical in light, higher contrast in dark).

## Principles

- **One accent, quiet grays.** Screens read as calm structure in canvas, surface and hairlines. The accent is spent on the thing being acted on: the primary button, the current page, the selected scope, progress, focus. Everything else stays gray.
- **Status colors only where status is the subject**, always with a word or icon (result check, privacy marks, errors, limits). "Runs in your browser" is a fact, so its icon is gray.
- **Depth by role.** Grounds step canvas → surface → raised. On dark, depth comes from those lighter steps and hairlines, not from bigger shadows.
- **No colored left borders, no gradient washes.** Cards are a surface with a 1 px hairline ring.

## Theme switching

Dark follows `prefers-color-scheme`; `data-theme="light"` or `"dark"` on `<html>` forces one. Both theme blocks in `tokens.css` must stay identical (the `[data-theme=dark]` block and the media-query block).

## Token mapping (light / dark)

| `--ip-*` token | Universal UI role | Light | Dark | Use |
|---|---|---|---|---|
| `bg` | canvas | `#F6F5F4` | `#111113` | page ground |
| `surface` | canvas | `#F6F5F4` | `#111113` | secondary ground: footer, planned-tool cards |
| `surface-raised` | surface | `#FFFFFF` | `#1A1A1D` | cards, workspace, dock, fields, secondary buttons |
| `surface-overlay` | raised | `#FFFFFF` | `#26262A` | menus, dialogs, floating notices, tile action bar and badges |
| `chrome` | chrome | `#FFFFFF` | `#1D1D20` | header, mobile dock bar, sticky menu search |
| `well` | well | `#EFEEEC` | `#0A0A0B` | sunken backdrop behind a framed page (result preview, file cards) |
| `surface-sunken` | ink-2 | `rgb(0 0 0/.06)` | `rgb(255 255 255/.07)` | tracks, neutral badge, placeholders, disabled fill |
| `hover` / `pressed` | ink-1 / ink-4 | black `.04` / `.10` | white `.05` / `.13` | hover and pressed tints |
| `border` | line | `rgb(0 0 0/.06)` | `rgb(255 255 255/.08)` | hairlines, card rings (decorative only) |
| `field-line` / `-hover` | field-line (darkened) | black `.45` / `.58` | white `.38` / `.52` | edges of text fields, secondary buttons, chips, drop card (≥ 3:1, WCAG 1.4.11) |
| `border-strong` | control-line | `rgb(0 0 0/.48)` | `rgb(255 255 255/.42)` | switch and slider tracks (≥ 3:1) |
| `fg` | text-strong | `#262628` | `#ECECEE` | body text, titles, neutral badge words |
| `fg-muted` | text / icon | `#707074` | `#9D9DA1` | labels, descriptions, meta, icons |
| `fg-disabled` | text-faint | `#9A9A9D` | `#6C6C70` | placeholders and disabled words only (exempt) |
| `paper` / `paper-filter` | – | `#FFFFFF` / `none` | `#FFFFFF` / `brightness(0.86)` | PDF pages |
| `inverse` / `on-inverse` | inverse | `#262628` / `#FFFFFF` | `#ECECEE` / `#111113` | tooltips |
| `danger` / `danger-hover` / `on-danger` | danger-text (also the fill) | `#B91C1C` / `#A31919` / `#FFFFFF` | `#F87171` / `#FCA5A5` / `#111113` | error words and edges; destructive button fill with `on-danger` |
| `danger-soft` | danger-soft | red `.10` | red `.16` | error notice fill |
| `success` / `success-soft` | success-text / -soft | `#15803D` / green `.12` | `#4ADE80` / green `.16` | result check, privacy marks |
| `warning` / `warning-soft` | warning-text / -soft | `#B45309` / amber `.14` | `#FBBF24` / amber `.18` | limit notices |
| `scrim` | – | `rgb(17 17 19/.45)` | `rgb(0 0 0/.6)` | dialog and menu backdrop |

Universal UI's own `field-line` (`.15` / `.16`) is decorative; we darkened it so every field and secondary-button edge meets 3:1 against both its fill and the ground around it.

## Accent family: Lagoon teal

Change these together, never one alone, and keep the contrast targets in the table below.

| `--ip-*` token | Universal UI role | Light | Dark | Use |
|---|---|---|---|---|
| `accent` | accent | `#0D9488` | `#0D9488` | progress, scope outline, current-page bar, field focus edge, drop borders |
| `primary` | accent-strong, also safe as text | `#0A746B` | `#34A89C` | fills with `on-primary` (primary button, switch on, scope check, brand mark), and accent text |
| `primary-hover` / `primary-active` | accent-hover | `#09665E` / `#085A53` | `#4CB0A7` / `#5FBAB2` | hover and pressed fills (dark lightens) |
| `on-primary` | on-accent | `#FFFFFF` | `#111113` | text and icons on `primary` fills |
| `primary-ink` (= `on-primary-soft`) | accent-ink | `#0A746B` | `#4CB0A7` | links, accent icons, beta and rotation badges (a higher-contrast alternative to `primary` as text in dark) |
| `primary-soft` | accent-soft, composited | `#E2F2F1` (opaque) | `#173232` (opaque) | selected and pressed fills, accent badges and icon tiles |
| `primary-faint` / `primary-ring` | accent-faint / accent-ring | teal `.06` / `.30` | teal `.10` / `.35` | translucent tints: drop hover, field focus halo, text selection |
| `focus` | focus | `#0D9488` | `#0D9488` | 2 px solid outline, 2 px offset |
| `drop-overlay` | – | `rgb(227 237 235/.94)` | `rgb(17 33 33/.94)` | drag-over overlay: canvas tinted with the accent (recompute when the accent changes) |

Why teal: it reads calm and private, which suits "fast, private PDF tools"; it stays clear of the danger red and warning amber; it is distinct from the reference product's blue (`#0282E5`), which Universal UI's default `#3B82F6` sits close to; and one value works as the focus ring in both themes. Candidates not chosen: Vermilion `#E5532D` (collides with danger) and Iris `#6E56CF` (needs a separate dark focus color, close to our old indigo).

## Dark mode

- Grounds: page `#111113` → cards, dock and workspace `#1A1A1D` → header `#1D1D20` → menus, dialogs and floating notices `#26262A`. Hairlines are white at 6–10 %. Shadows are kept only as a backup.
- Text is calm, not glaring: `fg` `#ECECEE` (12.8–16:1), `fg-muted` `#9D9DA1` (5.6–7.0:1).
- White PDF pages would glare in a grid on near-black. Pages get a light hairline ring and `filter: brightness(0.86)` (white on surface drops from 17.4:1 to 12.5:1). Hovering or focusing a tile (`.ip-paper-lit`) restores full brightness, and the page preview dialog is never dimmed.
- Soft tones are translucent, so anything that floats (notice stack, rotation badge) sits on an opaque `surface-overlay` first.
- Accent fills lighten to `#34A89C` with near-black `on-primary` text (6.5:1), the same pattern as `danger` (`#F87171` with `#111113`, 6.8:1). That keeps every `primary` and `danger` pair valid both as a fill and as text.

## Type

- Family: **Inter** (variable, latin subset, one 48,256-byte woff2 covering weights 100–900), self-hosted with `next/font/local` from `@fontsource-variable/inter` 5.3.0 (SIL OFL 1.1, notice in `apps/web/THIRD-PARTY-NOTICES.md`). `font-display: swap`, only that file is preloaded, no request leaves our origin. Fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`, with a metric-adjusted Arial fallback face so the swap does not shift layout.
- Mono (code only): `"SF Mono", "SFMono-Regular", ui-monospace, Consolas, monospace`.
- Scale (Universal UI): `xs` 12/16 (ui-12), `sm` 13/20 (ui-13: buttons, labels, captions), `base` 15/1.55 (body; card and dialog titles at 600), `lg` 17/1.5 (lead text, result filename), `xl` 20/1.3 (heading), `2xl` 24/1.25 −0.01em (page title), `3xl` 28/1.2 −0.01em (section title), `4xl` 40/1.15 −0.02em (display; the home hero grows to 52 px at ≥ 1024 px).
- Weights: 400 body, 500 labels and buttons, 600 titles. Text fields use 16 px below 640 px so iOS does not zoom.
- Numbers that align or change (counts, page numbers, sizes, percentages, limits) use `tabular-nums`.

## Spacing, shape, depth, motion

- Spacing: 4 px base (4, 8, 12, 16, 20, 24, 32, 48, 64). Words keep a 12 px inset from the edge of a row, field or card.
- Radius by role: `sm` 6 (menu rows, segment thumbs), `md` 8 (buttons, fields, segmented track), `lg` 10 (notices, tiles, wells), `xl` 12 (cards, workspace, dock, dialogs, result card), `2xl` 16 (marketing panels); pills for badges, chips, switches, progress.
- Shadows, one per role: `shadow-sm` card ring (cards, workspace, dock); `shadow-control` / `shadow-control-hover` (secondary buttons, chips: an inset `field-line` ring, darker on hover); `shadow-primary` (primary buttons); `shadow-md` window (hovered cards, mobile dock, floating bars); `shadow-lg` float (menu panel, notices); `shadow-hero` (dialogs); `shadow-paper` (the page itself).
- Focus: 2 px solid `focus` outline, 2 px offset, on every interactive element. Text fields instead turn their edge `accent` with a 3 px `primary-ring` halo and keep a transparent 2 px outline, which forced-colors mode paints.
- Forced colors (Windows High Contrast): shadows and backgrounds are dropped, so every control or card whose edge is a shadow ring (`.ip-edge`) gets a 1 px `ButtonText` border, and the selected segment (`.ip-seg-checked`) a 2 px `Highlight` outline. Covered by `e2e/ui/forced-colors.spec.ts`.
- Motion: 80 ms press, 120 ms hover and toggles, 150 ms rotation, crossfades and page dim, 240 ms result check. `cubic-bezier(.25,.8,.25,1)` for things that appear, `cubic-bezier(.45,0,.1,1)` for things that move. Reduced motion sets every duration to 0. Animate only opacity, transform and filter.

## Measured contrast (WCAG 2.1; alpha tokens composited on the ground named)

| Pair | Light | Dark |
|---|---|---|
| `fg` on canvas / surface / raised / chrome | 13.9 / 15.1 / 15.1 / 15.1 | 16.0 / 14.7 / 12.8 / 14.3 |
| `fg-muted` on canvas / surface / raised / chrome | 4.53 / 4.9 / 4.9 / 4.9 | 7.0 / 6.4 / 5.6 / 6.2 |
| `fg` on `surface-sunken` over canvas (neutral badge, segment labels) | 12.2 | 13.5 |
| `on-primary` on `primary` / `primary-hover` | 5.6 / 6.8 | 6.5 / 7.3 |
| `primary` as text on canvas / surface / raised | 5.2 / 5.6 / 5.6 | 6.5 / 6.0 / 5.2 |
| `primary-ink` on canvas / surface / raised | 5.2 / 5.6 / 5.6 | 7.3 / 6.7 / 5.8 |
| `primary-ink` (= `on-primary-soft`) on `primary-soft` | 4.9 | 5.2 |
| `danger` on surface / `danger-soft`; `on-danger` on `danger` | 6.5 / 5.7; 6.5 | 6.3 / 5.3; 6.8 |
| `success` on surface / `success-soft` | 5.0 / 4.5 | 10.0 / 7.6 |
| `warning` on surface / `warning-soft` | 5.0 / 4.5 | 10.4 / 7.4 |
| `field-line` edge (over the field fill) vs fill / canvas / raised (non-text, 3:1) | 3.4 / 3.1 / 3.4 | 3.6 / 3.9 / 3.1 |
| `border-strong` on canvas / surface / raised (non-text, 3:1) | 3.7 / 3.7 / 3.7 | 4.1 / 4.1 / 3.9 |
| `focus` on canvas / surface / raised / chrome (non-text, 3:1) | 3.4 / 3.7 / 3.7 / 3.7 | 5.0 / 4.6 / 4.0 / 4.5 |
| Page (paper) on surface | 1.0 (ringed) | 12.5 (dimmed, was 17.4) |

Rules: `fg-muted` never sits on `surface-sunken` or `well` (it would dip under 4.5:1); use `fg` there. Selected and error states always add a non-color cue (icon, outline, text). The e2e axe checks (F1 AC-50, F2 AC-56) run in both themes.
