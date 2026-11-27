# BerryPDF motion system

Owner request (2026-11-24): "use gsap animations everywhere for smoothness and subtle interactions". The owner then picked **GSAP** from three options (Motion, GSAP with a license exception, or plain CSS and WAAPI). This doc is the single spec for how BerryPDF moves. It covers tokens, the engine and its wrapper, rules, a catalogue of every interaction, guards, and where we beat Sejda. `berrypdf.md` → [Motion](berrypdf.md#motion) points here. Where the two differ, this doc wins. (BerryPDF's own bundle also has a file called `motion.md`. That is the bundle's source for hover values; this doc is ours.)

Evidence (2026-11-24, headless Chromium at 1280x720 and 390x844, frame sequences plus `document.getAnimations()` dumps):
- Sejda: `/mnt/project-files/designs/motion/sejda/` (`sheets/*.png` contact sheets, `timings.json`, `motion-inventory-*.json`; 4 page loads of the home page, 2 of /merge-pdf, no uploads, no tasks).
- Ours, before this spec: `/mnt/project-files/designs/motion/ours-before/` (`sheets/*.png`, `timings*.json`, `video/*.webm`; production build of 962832f).
- GSAP licence text as fetched: `/mnt/project-files/designs/motion/gsap-standard-license-2026-11-24.txt`.

## 1. What we measured

### Sejda

| Interaction | What moves | Notes |
|---|---|---|
| Page enter | nothing | Icons (icon font) and the subtitle's web font arrive late, so text shifts a few px in the first ~200ms (`sheets/home-enter.png`, frame 0 vs 1). |
| Tool card hover | `background-color` 0.2s ease | No lift and no press. A 500ms `translateX(-2px)` "nudge" keyframe runs on popular cards. |
| CTA | `transform` 0.5s ease (scale 1.04 → 1) | Runs when the pointer leaves it. Slow for a button. |
| All tools menu | nothing: `display:none` → `block` | Opens and closes in one frame, desktop and phone (`sheets/home-alltools-open.png`, `-close.png`, `phone-alltools-open.png`). Full-page white panel. |
| Upload button menu (cloud sources) | nothing | Bootstrap dropdown: instant (`sheets/merge-upload-menu.png`). |
| Drop zone | `.drop-files-zone:hover` hint `opacity` **2s**, border **1s** | A synthetic drag-over showed no visible change (`sheets/merge-dragover.png`). |
| Modals | `animated-modal-in` 0.3s ease (scale .96 → 1, opacity); Bootstrap `.fade` 0.15s linear; `.modal-dialog` translateY(-25%) 0.3s ease-out | No exit beyond the Bootstrap fade. Not reachable without a task; read from the CSSOM. |
| Collapse | `.collapsing { height; transition: height .35s }`, `section { transition: margin-left .3s }`, `button { transition: all .4s }` | These animate **layout** properties. |
| Alerts | `slideDownAttention`: −30px → +5px → 0 (a bounce) | We inherited this through BerryPDF (`mp-slide-down`, 0.9s). |
| Progress | `indeterminate` keyframes animate `left` / `right` | Layout properties again. |
| Decoration | 12 `how-to-shape` dots on infinite 4s x/y loops; dotted side art | Always running. |
| Anchor jump | smooth scroll, ~400ms | |

In short, Sejda barely moves. Where it does move, it is often slow (1–2s) or animates layout. Menus and dialogs have no exit at all.

### Ours (before)

| Interaction | What moves | Problem |
|---|---|---|
| Home enter | hero fades up 400ms in a stagger; tiles rise 360ms, 30ms apart (CSS) | Fine. The h1 stays static for LCP. |
| Tile hover | lift 3px, 0.2s | Fine. |
| Search filter | nothing | Tiles snap to new positions in one frame (`sheets/home-search.png`). |
| All tools, desktop | panel −8px + fade 300ms; backdrop fade + 6px blur | **No exit** (closes in one frame). Frame capture slowed to ~200ms a frame while the blur was composited (`timings.json` `alltools-open`: 89, 278, 477, 694ms). |
| All tools, phone | the whole full-screen dialog cross-fades | **Double exposure**: for ~150ms the menu text sits over the hero text, unreadable (`sheets/phone-alltools-open.png`, frames 0–1). |
| Drag-over | full-page overlay `opacity` 200ms | Fine. 120ms would feel quicker. |
| Drop card | pop-in 380ms with overshoot, then `mp-breathe` animates `border-color` + `box-shadow` for 3.2s | Paint work for 3.2s. |
| Files arriving | skeleton cards appear all at once; thumbnails pop in whenever each renders; **the h1 animates `font-size` 300ms** | `font-size` is a layout property, so the title reflows on every frame (`timings.json` `merge-files-in`: CSSTransition font-size). Nothing is staggered. |
| Pages view | thumbnails `mp-thumb-in` 300ms; tiles rise in a stagger | Fine. |
| Progress | jam bar `width` 0.5s | Layout property. |
| Result | the grid disappears and the card pops in 380ms with overshoot, then the tick follows after 160ms; the h1 animates `font-size` back | The view swaps abruptly, overshoots on a core flow, and the title reflows (`sheets/merge-run.png`, frames 3–4). |
| Download click | `filter` 200ms; nothing else | No success feedback. |
| Dialog (password) | `mp-modal-in` 300ms with overshoot; backdrop blur 8px | **No exit**. |
| Alerts | `mp-slide-down` **0.9s** with a bounce | Over the 400ms cap (already flagged in `docs/specs/f23-cloud-pickers.md`). |
| Floating berries | ~14 infinite `mp-levitate` loops (5–8s) on home **and tool pages** | Decoration that never stops. **WCAG 2.2.2 (Level A)**: auto-moving content longer than 5s needs a pause, unless it stops. |
| Editor open | shell fades 180ms; then a **blank white page** shows for ~250ms before the raster arrives | `sheets/editor-open.png`, frames 1–2. |
| Editor zoom | old bitmap kept, new raster fades 260ms | Fine (PR #37). |
| Editor tool switch | the rail pill slides 220ms; the options strip fades 160ms | Fine. Align it to the tokens. |
| Library | no WAAPI, no FLIP, no exits anywhere | |

## 2. Engine: GSAP behind `lib/motion`

### Decision and licence

- **Package:** `gsap`, pinned to an exact version (3.15.1 when written). We use **core plus Flip only**. Core is 28.4 kB gzip (`dist/gsap.min.js`) and Flip is 9.7 kB gzip, so about **38 kB** in one lazy chunk. Do not add other plugins (ScrollTrigger, SplitText, Draggable, CustomEase and the rest) or `@gsap/react` without a new design review. Our reorder drag is already pointer-event code, and scroll-triggered reveals are banned (see [Rules](#4-rules)).
- **Licence:** the npm `license` field is `Standard 'no charge' license: https://gsap.com/standard-license.`. It is proprietary and not OSI-approved, so it is an **exception to CLAUDE.md rule 3**. The lead adds the exception to CLAUDE.md in the build PR. The build PR also adds:
  - a `gsap` entry to `EXCEPTIONS` in `apps/web/scripts/license-policy.mjs`, with that exact string and the reason;
  - a row on `/licenses` and in `THIRD-PARTY-NOTICES.md`.

  GreenSock's copyright notice in the shipped files must stay (§III of the licence).
- **What the licence says** (text fetched 2026-11-24; effective 30 Apr 2025, modified 30 May 2025; the licensor is Webflow):
  - Use on "any website, web application, or digital interface" is permitted.
  - Prohibited uses are tools that let users "build visual animations without code" in a way that competes with Webflow's visual animation builder. A PDF toolkit is not such a tool.
  - Commercial use is allowed at no charge.
  - Webflow may amend the terms. Continued use of later releases means you accept the amendment, but versions released before an amendment keep their old terms. This is one more reason to pin the exact version and review the licence on every GSAP bump.
  - Webflow may terminate the licence for non-compliance.
- **Pre-premium check (blocker for any paid tier).** The same page still carries GreenSock's older plain-English summary: use is free "as long as end users are not charged a fee of any kind to use your product or gain access to any part of it", and paid access called for a "Business" membership. The 2025 legal terms quoted above do not repeat that condition. The summary is still on the page, though, so **before any premium tier, paywall or paid API ships**, someone must confirm in writing (Webflow or counsel) that charging users is fine under the then-current terms, or swap the engine. Add this as a gate in `docs/process/backlog.md` and the premium spec. The wrapper below makes a swap a single-file change (`lib/motion/engine.ts` → WAAPI). No call site imports GSAP.

### The wrapper

```
apps/web/src/lib/motion/
  tokens.ts     durations, easings, distances (numbers mirror the CSS custom properties; a unit test checks they agree)
  index.ts      the public API; never imports gsap
  engine.ts     the only file that imports gsap / gsap/Flip (dynamic import target)
  react.ts      useEnter / usePresence / useFlip hooks (layout-effect + cleanup), no @gsap/react
  load.ts       primeMotion(): starts the chunk download on intent or idle
```

The public API is small and declarative. Call sites name a **preset**, never a duration or a GSAP option:

```ts
enter(el | els, preset, opts?)        // fire-and-forget; stagger when given a list
exit(el, preset): Promise<void>       // resolves when gone (immediately if the engine isn't loaded or motion is reduced)
flip(container, mutate, preset?)      // FLIP a layout change made inside mutate()
swap(outEl, inEl, preset)             // crossfade (view changes, icon morphs)
primeMotion()                         // idempotent
```

Presets: `menu`, `popover`, `dialog`, `sheet`, `overlay`, `toast`, `card`, `list`, `thumb`, `result`, `tick`, `reorder`, `filter`, `swap`.

Rules for the wrapper:
1. **It works before the engine arrives.** If the chunk isn't loaded yet:
   - `enter` does nothing, because the CSS entrance or the final state is already on screen;
   - `exit` resolves at once (the element is removed instantly);
   - `flip` applies `mutate` with no animation.

   No interaction ever waits on the network.
2. **Lazy loading.** `engine.ts` is reached only through `import()` in `load.ts`. `primeMotion()` runs from one client component in the root layout, **after hydration**, through the intent helper. Today that is `components/tool-flow/intent.ts` `onIntent(go, ms)` from PR #46. Until that merges, mirror the pattern: `pointerdown`, `keydown`, `focusin` or `dragenter` on `window` (capture), or a 4s timer, then `requestIdleCallback`. The chunk is fetched while the user reaches for the file picker, so it has arrived by the time files do. On a phone that only reads the page, it isn't fetched at all within the first 4s, and after that only when idle.
3. **Reduced motion through `gsap.matchMedia()`.** `engine.ts` creates a single `mm = gsap.matchMedia()` with conditions `{ full: "(prefers-reduced-motion: no-preference)", reduced: "(prefers-reduced-motion: reduce)" }`. Every preset resolves inside it to its full or reduced variant (§3). When the OS setting flips mid-session, the matchMedia cleanup reverts the running tweens, which clears their inline styles. Tweens are not created inside the matchMedia context, because a context keeps every animation added to it for its whole life, and this one lives as long as the page. The engine instead keeps each running animation in a set and drops it when it completes or is interrupted, so a finished tween never retains its targets (detached DOM, Flip states of removed tiles); `engine.test.ts` checks that the count returns to 0. This is needed because GSAP writes inline `transform` and `opacity`, which the global CSS kill switch (`animation: none !important; transition: none !important`) does not touch.
4. **Interruptible.** Every tween uses `overwrite: "auto"`. A new `enter`, `exit` or `flip` on the same element kills the old one, and the new one starts from the element's current visual state. Every tween ends with `clearProps: "transform,opacity"`, so no element is left with an inline transform. That matters because an inline transform would create a containing block for `position: fixed` descendants and break sticky bars.
5. **Never blocks input.** Entering elements are clickable from frame 0. We never set `pointer-events: none` on anything that is arriving. A leaving element gets `inert` and `aria-hidden` at the start of its exit, so focus, clicks and the accessibility tree skip it while it fades. Focus moves when the action happens (to the dialog field, the result heading, the trigger on close), not when the animation ends.
6. **CSP-safe.** Under `style-src 'self'`, GSAP writes `element.style.*` through the CSSOM. The CSP allows that; it forbids only style attributes in markup and `<style>` elements. Core and Flip inject no `<style>` element. The e2e guard below asserts there are no `securitypolicyviolation` events.
7. **Server components never import `lib/motion`.** Only `index.ts`'s types are safe to import anywhere. The runtime is client-only.

### CSS still covers first paint

Everything visible on arrival animates with CSS keyframes, as today: hero, tool title, tile rise, drop card. Nothing is hidden waiting for JavaScript, so a slow or blocked chunk never leaves an empty page. GSAP takes over interactions after hydration. Hovers, presses and focus rings stay CSS transitions, because they must react in the first frame on any device.

## 3. Tokens

Each token is a CSS custom property in `apps/web/src/styles/tokens.css`, mirrored as a number in `lib/motion/tokens.ts`.

| Token | Value | Use |
|---|---|---|
| `--motion-instant` | 0ms | reduced motion, direct manipulation (drag, pinch, handles) |
| `--motion-micro` | 120ms | press, small icon swaps, exits of small things, reduced-motion fades |
| `--motion-quick` | 200ms | menus, popovers, toasts, FLIP moves, overlays, thumbnails |
| `--motion-base` | 320ms | dialogs, sheets, the result card, the options-panel collapse |
| `--motion-stagger` | 24ms per item, **total delay capped at 240ms** | lists (cards, tiles, toasts) |
| hard cap | **400ms** end to end, including stagger | any single interaction |

Exits run at about 0.6–0.7× their enter (a 200ms menu leaves in 120ms; a 320ms dialog in 200ms). Something leaving should never hold the user up.

| Easing | CSS | GSAP | Use |
|---|---|---|---|
| `--ease-out` | `cubic-bezier(0.215, 0.61, 0.355, 1)` | `power3.out` | every enter |
| `--ease-in` | `cubic-bezier(0.55, 0.085, 0.68, 0.53)` | `power2.in` | every exit |
| `--ease-move` | `cubic-bezier(0.455, 0.03, 0.515, 0.955)` | `power2.inOut` | FLIP moves, the rail pill, reorder |
| `--ease-pop` | `cubic-bezier(0.34, 1.4, 0.64, 1)` (exists) | `back.out(1.4)` | **only** the result tick and the download-success tick; never on cards, dialogs or sheets |
| linear | `linear` | `none` | progress fill, loaders |

Distances: we use small translates, opacity, and scale close to 1.

| Token | Value | Use |
|---|---|---|
| `--motion-rise` | 8px | enters (y +8 → 0) for cards, dialogs, the result |
| `--motion-nudge` | 4px | popovers, menus, toasts (direction: away from the anchor), exits |
| `--motion-sheet` | 32px | bottom sheets (y +32 → 0); never a full-height slide |
| scale in | 0.98 (cards, dialogs), 0.96 (popovers and menus, from the anchor corner) | |
| press | 0.97 (buttons, tiles), 0.92 (icon buttons, as today) | |
| lift | −1px buttons, −3px cards (BerryPDF) | |

**Reduced motion.** Under `prefers-reduced-motion: reduce`, every preset becomes either **opacity only at `--motion-micro`** or **instant**:
- Dialogs, sheets, menus, popovers, toasts and the result card: opacity at 120ms. A fade helps people see what changed.
- Stagger, FLIP, reorder settle, the rail pill, page enters and hover lifts: instant.
- Loops: off, except the busy indicator's pulse (F1 U-4, it carries state).
- Progress: the fill jumps to each value.

## 4. Rules

1. **Transform and opacity only.** Never animate `width`, `height`, `top` / `left` / `right` / `bottom`, `margin`, `padding`, `font-size`, `border-*`, `box-shadow`, `filter` (including `blur`) or `backdrop-filter`. Show a layout change with FLIP (measure, change, invert with `transform`). Glows and rings animate the `opacity` of a pseudo-element that already has the shadow. Hover colour changes (`background-color`, `color`, `border-color`) are allowed as CSS transitions of ≤ 200ms, because they repaint one small element.
2. **Nothing delays the main action.** The primary button is visible, enabled and clickable on the first frame its state allows. It never moves after it appears (Flip excludes it). No animation sits between a click and its effect: a download starts on click, a dialog field takes focus on open, a menu item works mid-fade.
3. **Interruptible.** A second click, Escape, typing or a drag cancels or retargets the running animation from where it is. Nothing queues.
4. **No layout shift.** Interactions add no CLS: animated elements already hold their final box, and FLIP uses transforms. Skeletons and placeholders have the final size (page aspect boxes).
5. **No decoration.** Motion explains a change: something arrived, moved, left, or succeeded. No ambient loops on tool pages. On the home page the floating berries make one drift of ≤ 5s and then rest (WCAG 2.2.2). The only remaining loops are the action pill's spinner and its jam glide while work runs, plus the busy pulse (F25). The berry loader is no longer on tool pages. No scroll-triggered reveals and no parallax.
6. **No bounce on core flows.** Overshoot is reserved for the two success ticks.
7. **Big lists stay cheap.** Stagger only the items in the viewport, up to 10 (the cap is 240ms). The rest appear at once. With more than 40 items changing in one FLIP, crossfade the list (120ms) instead.
8. **One engine call per interaction.** Components call `lib/motion`. They never use `requestAnimationFrame` loops, `element.animate` or GSAP directly. CSS keyframes stay for first paint and hovers.
9. **Budgets.** The engine never enters a route's first load:
   - `/edit-pdf` stays at **125 kB** first-load;
   - `/` stays at 120 / 126;
   - `/merge-pdf` stays at 150 / 160;
   - `/rotate-pdf` stays at 141 / 151;
   - the cloud builds keep their budgets;
   - the phone-total budget (≤ 170 KB JS) is unchanged.

   `lib/motion/index.ts` and `load.ts` together stay under 1.5 kB gzip.
10. **Dark mode and forced colours.** Motion is colour-free, so nothing changes in dark mode. Under `forced-colors: active` the same motion runs; rings animated through pseudo-element opacity keep their `Highlight` border.

## 5. Catalogue

"Engine" means: CSS for first paint and hover, GSAP through `lib/motion`, or none. Durations are the full-motion values; the [reduced](#3-tokens) column follows §3.

### Site

| # | Interaction | Spec | Engine | Reduced |
|---|---|---|---|---|
| S1 | Page enter (home hero, tool title, coming-soon) | The h1 is static (LCP). Hero line, action and note fade up 8px, 320ms `--ease-out`, 60ms apart. The tool page h1 fades up 8px in 320ms. | CSS (exists; retime 400 → 320) | none |
| S2 | Tool grid first paint | Tiles in the first viewport rise 8px + fade, 320ms, stagger 24ms (cap 240). Tiles below the fold are just there. | CSS (exists; retime 360/30 → 320/24) | none |
| S3 | Tile hover / press | Lift −3px 200ms `--ease-out`; icon disc fills, icon tips 8°; press 0.97 at 120ms. | CSS (exists) | colour only |
| S4 | Search filtering (home catalogue, All tools menu) | On each query change, `flip(grid, applyFilter, "filter")`. Staying tiles move to new slots in 200ms `--ease-move`. Entering tiles fade + scale 0.98 → 1 in 120ms; leaving tiles fade out in 120ms (taken out of flow at once, so the reflow never waits). Group headings move with their tiles. A new keystroke mid-flip completes the running flip at once and starts from there. The search bar never moves. Live-region count unchanged. | GSAP Flip | instant |
| S5 | Category chip jump (home) | Smooth scroll (exists, home only); the target section's heading does not animate. | CSS | instant |
| S6 | All tools, desktop (panel under the bar) | Open: panel y −8 → 0 + fade, 200ms `--ease-out`; backdrop fade 200ms (the blur is static, never animated). Close (Escape, backdrop, item click): panel fade + y −4, 120ms `--ease-in`; backdrop fade 120ms. Focus returns to the trigger when the close starts. Rows are never staggered (60+ rows would shimmer). The chevron rotates 180° in 200ms (exists). | GSAP (open: CSS fallback exists) | fade 120ms |
| S7 | All tools, phone (full-screen dialog) | The opaque ground is fully opaque on frame 0. Only the **content** fades in and rises 8px, 200ms. The page behind is never seen through it (fixes the double exposure). Close: the whole dialog fades 120ms, crossfading to the page (fading only the content left a blank white frame). | GSAP | fade 120ms |
| S8 | Menus (`Menu`, `Select`, Sort, Add pages) | Open: opacity + scale 0.96 → 1 from the anchor corner + y −4 → 0, 200ms `--ease-out`. Close: fade 120ms `--ease-in`. Item hover is CSS colour 120ms. Selecting an item acts first and fades the menu after. | GSAP (open: CSS fallback) | fade 120ms |
| S9 | Tooltips | Fade 120ms after a 300ms hover delay (exists); leave instantly. | CSS | same |
| S10 | Toasts and notices (`NoticeStack`, `mp-alert`, `ed-toast`) | Enter: y −8 → 0 + fade, 200ms `--ease-out` (replaces the 0.9s bounce). Exit: fade + y −4, 120ms `--ease-in`. The stack closes the gap by FLIP, 200ms `--ease-move`. Error notices don't shake (the field shake stays for invalid input, 4px, 240ms). | GSAP (enter: CSS fallback) | fade 120ms |
| S11 | Dialogs (`Dialog`, password, replace file, leave guard) | Open: backdrop fade 200ms; panel y +8 → 0, scale 0.98 → 1, fade, 320ms `--ease-out` (no overshoot; it replaces `mp-modal-in` with `--ease-pop`). The field has focus on frame 0. Close: panel fade + scale 0.98, 200ms `--ease-in`; backdrop 200ms; then `dialog.close()`. A second Escape mid-exit closes at once. | GSAP (open: CSS fallback) | fade 120ms |
| S12 | Page preview viewer | Open: the page scales from its thumbnail's rect (Flip of the thumbnail onto the viewer) in 320ms `--ease-out`, with the scrim fading 200ms. Next / previous: crossfade 120ms (no slide). Close: back to the thumbnail if it is still on screen, else fade 200ms. | GSAP Flip | fade 120ms |
| S13 | Sheets (Merge options below 1024px, editor sheets) | Open: y +32 → 0 + fade, 320ms `--ease-out`; backdrop 200ms. Close: y +24 + fade, 200ms `--ease-in`. | GSAP (open: CSS fallback) | fade 120ms |

### Tool flow (`components/tool-flow`, `components/page-edit`)

| # | Interaction | Spec | Engine | Reduced |
|---|---|---|---|---|
| T1 | Drop card idle | Pops in on first paint, 320ms `--ease-out`, **no overshoot**. The one-time "breathe" becomes the opacity of a `::after` ring (0 → 1 → 0 over 2.4s, once). No `box-shadow` or `border-color` animation. | CSS | none |
| T2 | Drop card hover | Border colour 200ms; the icon lifts −2px; the ring `::after` fades to 1 in 200ms. | CSS | colour only |
| T3 | Drag-over (file anywhere on the window) | Overlay fade 120ms (was 200); the drop card scales to 1.02 in 120ms and its ring turns solid. Leave or end: back in 120ms. Must react on the first `dragenter` frame, so CSS only. | CSS | fade, no scale |
| T4 | Files arriving | Cards enter as each file is read, not all at once: y +8 → 0, scale 0.98 → 1, fade, 200ms `--ease-out`, stagger 24ms (cap 240). The skeleton has the final aspect box. When its thumbnail is ready, the canvas cross-fades over the skeleton in 120ms with no size change. The "Add files" tile and any cards already present FLIP to their new slots in 200ms. Later additions animate only the new cards. | GSAP (list + Flip) | instant; thumbs fade 120ms |
| T5 | Options move to the top row after upload (F25) | The `h1` moves from the centred head to the left of the top row **on the frame the pages arrive, without animation** (never animating `font-size` or position), hidden by T4. The options appear in the row (≥ 1024) or the bottom dock (< 1024) in their final place; the stage takes its final size at once. The primary is in its final place in the action slot from the row's first frame. | none | instant |
| T6 | Files ↔ Pages view switch | Crossfade 120ms between the two grids; tiles in the new grid enter as T4 (stagger in viewport only). Segmented-control thumb slides 200ms `--ease-move` (transform). | GSAP | instant |
| T7 | Page thumbnails (Pages view, editor rail) | Fade + scale 0.98 → 1, 200ms `--ease-out`, in render order with no extra delay. A cached thumbnail scrolled back into view never animates again. | CSS class added on render (exists; retime 300 → 200) | fade 120ms |
| T8 | Reorder drag (cards and page tiles, pointer) | Pick-up: the card scales to 1.03 and its shadow `::after` fades in, 120ms. It follows the pointer **1:1** (no easing). Other items move aside by FLIP in 200ms `--ease-move` whenever the insertion point changes (once per frame at most). Drop: the card settles into its slot in 200ms `--ease-out`. Escape: it returns to the origin in 200ms. | GSAP Flip | instant settle, no lift |
| T9 | Reorder, keyboard (Alt+Arrow) and the Sort menu | The moved item and its neighbours FLIP 200ms `--ease-move`; focus stays on the moved item; the live region announces. A sort FLIPs the whole visible grid (crossfade above 40 items). | GSAP Flip | instant |
| T10 | Remove a file or page | The item fades + scales to 0.96 in 120ms `--ease-in` (inert at once); neighbours close the gap by FLIP in 200ms. Undo reverses the move. | GSAP | instant |
| T11 | Progress (F25 §6) | The primary morphs into the progress pill in the same slot: label out 120ms, pill in 120ms; it shows at once (no wait) and stays at least 400ms. The jam fill along its bottom edge is `transform: scaleX()`, 200ms `--ease-out` per update and never backwards; with no fraction a short segment glides (1.6s loop). Done: a leaf tick pops 200ms `--ease-pop` and holds 400ms before T12. Cancel puts the primary back with a tick. | CSS | value jumps; the spinner pulses, the glide stops |
| T12 | Result (F25 §7) | The stage becomes the result: the work area fades out in 120ms `--ease-in` (inert at once); the result enters with y +8 → 0, scale 0.98 → 1 and a fade, 320ms `--ease-out` (no overshoot), with its large preview (at least 85% of the stage's height). The tick pops 200ms `--ease-pop` starting 80ms in. **Download, in the action slot, is clickable and focusable from the result's first frame.** "Back to editing" reverses it: the work area enters 200ms (opacity only). | GSAP swap + CSS | fade 120ms |
| T13 | Download success | On click, the download starts at once. The button's icon cross-fades and scales 0.8 → 1 from arrow to tick in 200ms `--ease-pop`, and the live region says "Downloaded". After 2.4s the icon goes back to the arrow in 120ms. The button stays enabled throughout (download again). No confetti. The editor's variant also changes its label to "Downloaded" for those 2.4s (F25 §7). | GSAP swap | icon swaps instantly |
| T14 | "Keep going" chips, Start over | Chips are CSS hover/press. Start over: the result card fades 120ms and the empty state enters as T1. | CSS + GSAP exit | instant |

**Status of T10–T12 (review of PR #50, 24 Nov; T11 and T12 superseded by F25 §6–§7, where the 300ms wait is deleted and Back to options is "Back to editing"):**
- **T12 on the way in is built.** Focus waits on the tool heading while the work area leaves (it is inert), and the result card then focuses Download. **"Back to options" is built in part.** The work area comes back at once and fades in over 200ms, opacity only, because a transform on it would give the dock inside a transformed containing block. Focus moves to the tool heading. **The card's 120ms fade-out before that is deferred.** It keeps the work area out of the DOM for 120ms, and `e2e/f3/options-a11y.spec.ts` (`options()`) checks right after Back, without retrying, whether the Options button is visible.
- **T11: the "stays at least 400ms" part is built** (`MIN_PROCESSING_MS` in `ToolFlow.tsx`). **The 300ms wait before the card shows is deferred.** Focus moves to the progress bar as soon as a run starts (screen readers announce it there), and the e2e suites wait on that state. Hiding the bar for the first 300ms needs its own focus and announcement design.
- **T10 is deferred.** Removing an item in place means keeping it in the model (and the DOM) for its 120ms exit. The specs check the order right after Remove without retrying (`e2e/f3/files.spec.ts`, `pages.spec.ts`, `options-a11y.spec.ts`), so they would read the leaving item. A ghost clone fading over the gap would repeat the item's test ids and labels in the DOM while it fades. Next step: a ghost with its ids and labels stripped, and an e2e that its fade never shows up in role or test-id queries.

### Editor (`tools/editor`)

| # | Interaction | Spec | Engine | Reduced |
|---|---|---|---|---|
| E1 | Opening a PDF | The editor opens in the page under the sticky header (F25 E1), not as an overlay: its layout shows with placeholders from the pick (no "Opening…" on the button). Page placeholders are paper-tinted boxes at the final aspect. Each raster fades in 200ms when ready; the sharp render cross-fades over the low-scale one with no blank frame. | CSS (exists) + render order | fade 120ms |
| E2 | Selection handles | Appear on frame 0 at their final place. Only on first appearance does the frame fade, opacity 80ms. Never animated during move, resize or rotate (direct manipulation is 1:1). | CSS | instant |
| E3 | Popovers (text style, object menu, form field) | Enter: fade + scale 0.96 → 1 from the anchor side + y 4 → 0, 140ms `--ease-out` (exists; keep). Exit: fade 100ms. When the selection moves, the popover jumps to its new place (no tween). | CSS enter + GSAP exit | fade 120ms |
| E4 | Line-edit box opening | The box opens **exactly over** the text in the PDF's font: **instant, no fade, because it overlays live text (F24 AC-299)**, and no scale or translate (either would misalign glyphs). The raster's text hides on the same frame. Caret and focus appear immediately. On commit, the old raster stays until the new one is ready, then cross-fades 120ms (no white flash). | GSAP swap | instant |
| E5 | Zoom | Exists, keep: the old bitmap is CSS-scaled to the new zoom on frame 0, and the new raster fades in when ready. Retime 260 → 200ms. Pinch and Ctrl+wheel are 1:1 transforms with no easing. | CSS (exists) | instant swap |
| E6 | Tool switching | The tools are in the editor bar (F25 E1), not a rail: the active tool's tint changes at once. The properties panel shows the tool's options without moving the page or its zoom. The cursor changes instantly. | CSS | instant |
| E7 | Page operations in the rail (rotate, delete, reorder) | Rotate: the thumbnail rotates 90° in 200ms `--ease-move` (transform), then the re-render replaces it. Delete and reorder as T8–T10. | GSAP | instant |
| E8 | Editor toasts, hints, recover banner | As S10 (rise 180 → 200ms). The download toast is gone (F25 §7): the slot says "Downloaded" and a small card opens under it (popover timing). `ed-pulse` (900ms) and `ed-flash` (1.1s) become ≤ 400ms opacity pulses. | CSS / GSAP | fade 120ms |

## 6. Where we beat Sejda

| Moment | Sejda | Ours |
|---|---|---|
| Menus, All tools, dialogs | Appear and vanish in one frame; no exit | 200ms in, 120ms out, from the anchor; focus moves on the click, not after the animation |
| Phone All tools | Instant white takeover | Opaque ground at once, content rises 8px: no flash and no double exposure |
| Search filtering | (its catalogue just shows/hides) | Tiles FLIP to their new slots in 200ms; typing never waits |
| Drop zone | Hint fades over **2s**, border over 1s; no drag-over state seen | Drag-over reacts on the first frame (120ms), the card swells to 1.02 and its ring turns solid |
| Files arriving | (behind an upload; not compared) | Cards stagger in as each file is read; thumbnails cross-fade onto final-size skeletons; zero CLS |
| Reorder | (not compared without upload) | Items make room by FLIP; the card follows the pointer 1:1; Escape returns it |
| Progress | `left`/`right` keyframes (layout); a full-width bar fixed to the bottom | One pill in the action slot with a real Cancel; `scaleX` only; never runs backwards; server phases (upload, queue position) in the same box |
| Result and download | A separate download page | The stage becomes the result with a big preview; Download takes the primary's box and is usable on frame 1; tick feedback on click |
| Alerts | −30px drop with a bounce | 200ms rise, 120ms leave, stack FLIP |
| Layout properties | Animates `height`, `margin-left`, `all` | Transform and opacity only, enforced in CI |
| Ambient motion | Infinite dot loops | None on tool pages; the home berries stop within 5s |

## 7. Guards (CI)

- **`src/lib/motion/motion-rules.test.ts`** (source scan, modelled on `scroll-rules.test.ts`):
  - no `transition` or `@keyframes` on a layout property (the list in rule 1) in any CSS, TSX class or inline style;
  - no `import … from "gsap"` outside `lib/motion/engine.ts`;
  - no `element.animate(` or `requestAnimationFrame` animation loops outside `lib/motion`;
  - every keyframe animation sits inside a `prefers-reduced-motion: no-preference` block or is covered by the global kill switch;
  - CSS duration values of 400ms or less, except the listed loops;
  - `tokens.ts` matches `tokens.css`.
- **`scripts/first-load-budget.mjs`**: fail if any file in any route's entry + preloads contains GreenSock's banner (`GreenSock` / `gsap`). Route budgets are unchanged.
- **`e2e/ui/motion.spec.ts`** at 1280x720 and 390x844:
  1. No motion chunk is requested before the first pointer, key or focus event, or 4s. One is requested afterwards, once.
  2. With `reducedMotion: "reduce"`: after any open, close or filter, no element has a non-identity inline transform, and only opacity tweens ran.
  3. A click on Download (and on a menu item) during its entrance acts on the first try.
  4. Opening and closing every dialog, menu and sheet, filtering, and adding files record **0 layout-shift** entries.
  5. Exits happen: the All tools panel, the dialogs and the menus are still in the DOM for 1 frame after Escape, and gone within 250ms.
  6. No `securitypolicyviolation` events.
  7. No running animations on the tool pages 5s after load (WCAG 2.2.2), except an active job's loader.
- **Visual gate** (visual-quality-gate.md): every motion PR adds frame-sequence contact sheets (like `ours-before/sheets/`) for the changed interactions to the PR, next to the 1280x720 and 390x844 screenshots.
