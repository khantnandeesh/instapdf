/**
 * Motion tokens (docs/design/motion.md §3), in seconds for GSAP. The CSS custom properties in
 * src/styles/tokens.css hold the same numbers; motion-rules.test.ts checks they agree.
 */
export const DUR = {
  instant: 0,
  micro: 0.12,
  quick: 0.2,
  base: 0.32,
} as const;

/**
 * Per item, and the cap on a list's total delay. The spec's 240ms cap plus a 200ms entrance would
 * break the 400ms end-to-end cap, so the total delay is capped at 200ms: the last staggered item
 * still lands by 400ms (only items in view are staggered; the rest arrive with the last one).
 */
export const STAGGER = { each: 0.024, max: 0.2 } as const;

/** No single interaction runs longer than this, stagger included. */
export const CAP = 0.4;

/** Distances in px. */
export const DIST = { rise: 8, nudge: 4, sheet: 32 } as const;

/** The CSS easing of each token and the GSAP ease that matches it. */
export const EASE = {
  out: { css: "cubic-bezier(0.215, 0.61, 0.355, 1)", gsap: "power3.out" },
  in: { css: "cubic-bezier(0.55, 0.085, 0.68, 0.53)", gsap: "power2.in" },
  move: { css: "cubic-bezier(0.455, 0.03, 0.515, 0.955)", gsap: "power2.inOut" },
  pop: { css: "cubic-bezier(0.34, 1.4, 0.64, 1)", gsap: "back.out(1.4)" },
} as const;
