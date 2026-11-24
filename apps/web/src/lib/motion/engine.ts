/**
 * The only file that imports GSAP (docs/design/motion.md §2), reached only through the import() in
 * load.ts, so it is always its own lazy chunk. Swapping the engine (WAAPI, Motion) is a change to this
 * file alone. Rules it keeps:
 * - transform and opacity only; every tween clears them at the end (no inline transform is left to make
 *   a containing block for fixed descendants) except an exit's end state, which the caller removes;
 * - one gsap.matchMedia() context: under prefers-reduced-motion every preset is a 120ms fade or instant,
 *   and flipping the OS setting mid-session reverts running tweens (pending exits then resolve);
 * - overwrite: "auto", so a new call on an element retargets from where it is; nothing queues.
 */
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import type { Preset } from "./presets";
import { CAP, DIST, DUR, EASE, STAGGER } from "./tokens";

gsap.registerPlugin(Flip);

/**
 * GreenSock's notice, kept in the shipped chunk (GSAP Standard License §III). A string, not a comment:
 * the minifier drops comments, and load.ts keeps every export of this module.
 */
export const NOTICE =
  "GSAP 3.15.1 (core + Flip) | Copyright 2026, GreenSock. All rights reserved. Subject to the terms at https://gsap.com/standard-license. Used by BerryPDF for UI motion only.";

type Vars = gsap.TweenVars;

let ctx: gsap.Context | undefined;
let reduced = false;
const pending = new Set<() => void>();

gsap.matchMedia().add({ full: "(prefers-reduced-motion: no-preference)", reduced: "(prefers-reduced-motion: reduce)" }, (c) => {
  ctx = c;
  reduced = !!c.conditions?.reduced;
  // The setting flipped: this context's tweens revert (inline styles cleared); finish any exit waiting on one.
  return () => {
    for (const done of [...pending]) done();
  };
});

/** Runs `make` inside the matchMedia context, so its tweens revert when the setting flips. */
const inCtx = <T>(make: () => T): T => (ctx ? ctx.add(make) : make());

/** Under reduced motion these are instant; the rest become a 120ms fade (motion.md §3). */
const INSTANT_WHEN_REDUCED = new Set<Preset>(["card", "list", "reorder", "filter", "tick", "swap"]);

/** Where each preset enters from (the "to" is always identity). */
const FROM: Record<Preset, Vars & { duration: number }> = {
  menu: { opacity: 0, scale: 0.96, y: -DIST.nudge, duration: DUR.quick },
  panel: { opacity: 0, y: -DIST.rise, duration: DUR.quick },
  popover: { opacity: 0, scale: 0.96, y: DIST.nudge, duration: 0.14 },
  dialog: { opacity: 0, scale: 0.98, y: DIST.rise, duration: DUR.base },
  sheet: { opacity: 0, y: DIST.sheet, duration: DUR.base },
  overlay: { opacity: 0, duration: DUR.quick },
  toast: { opacity: 0, y: -DIST.rise, duration: DUR.quick },
  card: { opacity: 0, scale: 0.98, y: DIST.rise, duration: DUR.quick },
  list: { opacity: 0, scale: 0.98, y: DIST.rise, duration: DUR.quick },
  thumb: { opacity: 0, duration: DUR.micro },
  result: { opacity: 0, scale: 0.98, y: DIST.rise, duration: DUR.base },
  tick: { opacity: 0, scale: 0.8, duration: DUR.quick },
  reorder: { opacity: 0, scale: 0.98, duration: DUR.micro },
  filter: { opacity: 0, scale: 0.98, duration: DUR.micro },
  swap: { opacity: 0, duration: DUR.micro },
};

/** Where each preset leaves to: about 0.6x its entrance, eased in. */
const TO: Record<Preset, Vars & { duration: number }> = {
  menu: { opacity: 0, duration: DUR.micro },
  panel: { opacity: 0, y: -DIST.nudge, duration: DUR.micro },
  popover: { opacity: 0, duration: 0.1 },
  dialog: { opacity: 0, scale: 0.98, duration: DUR.quick },
  sheet: { opacity: 0, y: 24, duration: DUR.quick },
  overlay: { opacity: 0, duration: DUR.micro },
  toast: { opacity: 0, y: -DIST.nudge, duration: DUR.micro },
  card: { opacity: 0, scale: 0.96, duration: DUR.micro },
  list: { opacity: 0, scale: 0.96, duration: DUR.micro },
  thumb: { opacity: 0, duration: DUR.micro },
  result: { opacity: 0, duration: DUR.micro },
  tick: { opacity: 0, scale: 0.8, duration: DUR.micro },
  reorder: { opacity: 0, duration: DUR.micro },
  filter: { opacity: 0, duration: DUR.micro },
  swap: { opacity: 0, duration: DUR.micro },
};

const ease = (p: Preset) => (p === "tick" ? EASE.pop.gsap : EASE.out.gsap);

/** The preset's variant for the current setting, or null when it is instant. */
function pick(table: typeof FROM, p: Preset): (Vars & { duration: number }) | null {
  if (!reduced) return table[p];
  return INSTANT_WHEN_REDUCED.has(p) ? null : { opacity: 0, duration: DUR.micro };
}

/** Hands an element mid CSS keyframe over to GSAP at its current look, so an exit starts from where it is. */
function takeOver(el: HTMLElement) {
  const running = el.getAnimations().filter((a) => a instanceof CSSAnimation);
  if (!running.length) return;
  const cs = getComputedStyle(el);
  const look = { opacity: cs.opacity, transform: cs.transform === "none" ? "" : cs.transform };
  for (const a of running) a.cancel();
  gsap.set(el, look);
}

export function enter(el: HTMLElement | HTMLElement[], p: Preset): void {
  const els = (Array.isArray(el) ? el : [el]).filter((e) => e.isConnected);
  const from = pick(FROM, p);
  if (!els.length || !from) return;
  const { duration, ...start } = from;
  // Stagger only what is in view, at most 10, and land by the 400ms cap; the rest arrive with the last one.
  const inView = els.filter((e) => e.getBoundingClientRect().top < innerHeight).slice(0, 10);
  const each = Math.min(STAGGER.each, STAGGER.max / Math.max(1, inView.length - 1), (CAP - duration) / Math.max(1, inView.length - 1));
  inCtx(() =>
    gsap.fromTo(els, start, {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      duration,
      ease: ease(p),
      delay: p === "tick" ? 0.08 : 0,
      stagger: (i) => Math.min(i, inView.length - 1) * each,
      overwrite: "auto",
      clearProps: "transform,opacity",
    }),
  );
}

export function exit(el: HTMLElement, p: Preset): Promise<void> {
  el.inert = true;
  el.setAttribute("aria-hidden", "true");
  const to = pick(TO, p);
  if (!to || !el.isConnected) return Promise.resolve();
  takeOver(el);
  return new Promise((resolve) => {
    const done = () => {
      pending.delete(done);
      resolve();
    };
    pending.add(done);
    inCtx(() => gsap.to(el, { ...to, ease: EASE.in.gsap, overwrite: "auto", onComplete: done, onInterrupt: done }));
  });
}

let running: gsap.core.Timeline | undefined;

const flipTargets = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[data-flip]"));
const inViewport = (e: HTMLElement) => {
  const r = e.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width > 0;
};

export function flip(container: HTMLElement, mutate: () => void, p: Preset): void {
  // A new change mid-flip completes the running one at once and starts from there.
  running?.progress(1).kill();
  running = undefined;
  if (reduced) return mutate();
  const before = flipTargets(container).filter(inViewport);
  if (before.length > 40) {
    // Too many moving things shimmer: crossfade the list instead (motion.md rule 7).
    mutate();
    inCtx(() => gsap.fromTo(container, { opacity: 0 }, { opacity: 1, duration: DUR.micro, ease: EASE.out.gsap, overwrite: "auto", clearProps: "opacity" }));
    return;
  }
  const state = Flip.getState(before, { simple: true });
  mutate();
  const after = flipTargets(container).filter(inViewport);
  running = inCtx(() =>
    Flip.from(state, {
      targets: after,
      duration: DUR.quick,
      ease: EASE.move.gsap,
      scale: true,
      simple: true,
      prune: true,
      // Items that arrive fade in where they land (the preset's entrance, without its rise).
      onEnter: (els) => {
        const { duration, opacity, scale = 1 } = FROM[p];
        return gsap.fromTo(els, { opacity, scale }, { opacity: 1, scale: 1, duration, ease: EASE.out.gsap, clearProps: "transform,opacity" });
      },
      onComplete: () => void (running = undefined),
    }),
  );
}

export function swap(outEl: HTMLElement, inEl: HTMLElement, p: Preset): void {
  const from = pick(FROM, p);
  if (!from) return;
  const { duration, ...start } = from;
  inCtx(() => {
    gsap.fromTo(outEl, { opacity: 1 }, { opacity: 0, duration: DUR.micro, ease: EASE.in.gsap, overwrite: "auto", clearProps: "opacity" });
    gsap.fromTo(inEl, start, { opacity: 1, scale: 1, y: 0, duration, ease: ease(p), overwrite: "auto", clearProps: "transform,opacity" });
  });
}

export function kill(el: HTMLElement): void {
  gsap.killTweensOf(el);
}
