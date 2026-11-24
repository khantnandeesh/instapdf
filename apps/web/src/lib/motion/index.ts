/**
 * BerryPDF motion (docs/design/motion.md §2). Call sites name a preset, never a duration or a GSAP
 * option. No lib/motion entry point imports GSAP: before the engine chunk has arrived (or under
 * reduced motion where a preset is instant) every call completes at once, so nothing ever waits on
 * the network.
 *
 * The API is split by where it is used, so a route's first load carries only what it calls:
 * - index.ts (overlays, in first loads): exit, settle, motionReady;
 * - flow.ts (lists and swaps, in lazy chunks): enter, flip, swap;
 * - load.ts: primeMotion (MotionPrime only); react.ts: usePresence.
 */
import type { Preset } from "./presets";
import { motion } from "./state";

export type { Preset } from "./presets";

export type El = HTMLElement | null | undefined;

/** Whether the engine has arrived (an exit will animate). */
export const motionReady = () => !!motion();

/**
 * Makes `el` inert and aria-hidden at once, fades it out, and resolves when it is gone (at once without
 * the engine). The element is left at its end state: remove it, or call settle(el) to bring it back.
 */
export function exit(el: El, preset: Preset): Promise<void> {
  const m = motion();
  return el && m ? m.exit(el, preset) : Promise.resolve();
}

/** Stops any motion on `el` and clears what an exit left on it (inline opacity/transform, inert, aria-hidden). */
export function settle(el: El): void {
  if (!el) return;
  motion()?.kill(el);
  el.style.opacity = el.style.transform = "";
  el.inert = false;
  el.removeAttribute("aria-hidden");
}
