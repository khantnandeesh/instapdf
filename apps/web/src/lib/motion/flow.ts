/**
 * lib/motion for lists and swaps (docs/design/motion.md §2; see index.ts). Each call completes at once
 * when the engine hasn't arrived or the preset is instant under reduced motion.
 */
import type { El } from "./index";
import type { Preset } from "./presets";
import { motion } from "./state";

/** Fire-and-forget entrance; a list is staggered (24ms apart, only what is in view, in by 400ms). */
export function enter(el: El | HTMLElement[], preset: Preset): void {
  if (el) motion()?.enter(el, preset);
}

/**
 * FLIP of the [data-flip] items in `container` across a layout change made synchronously inside
 * `mutate` (wrap React state updates in flushSync). Without the engine, just runs `mutate`.
 */
export function flip(container: El, mutate: () => void, preset: Preset = "reorder"): void {
  const m = motion();
  if (container && m) m.flip(container, mutate, preset);
  else mutate();
}

/** Crossfade from `outEl` to `inEl` (an icon morph with "tick"). The caller hides `outEl` with CSS. */
export function swap(outEl: El, inEl: El, preset: Preset = "swap"): void {
  if (outEl && inEl) motion()?.swap(outEl, inEl, preset);
}
