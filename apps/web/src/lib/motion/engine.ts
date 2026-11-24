/**
 * The only file that imports GSAP (docs/design/motion.md §2), reached only through the import() in
 * load.ts, so it is always its own lazy chunk. Swapping the engine (WAAPI, Motion) is a change to this
 * file alone. Rules it keeps:
 * - transform and opacity only; every tween clears them at the end (no inline transform is left to make
 *   a containing block for fixed descendants) except an exit's end state, which the caller removes;
 * - one gsap.matchMedia() query: under prefers-reduced-motion every preset is a 120ms fade or instant,
 *   and flipping the OS setting mid-session reverts running tweens (pending exits then resolve);
 * - only running animations are referenced: each is in `live` until it completes or is interrupted, so
 *   a finished tween never keeps its targets (detached DOM, Flip states of removed tiles) alive. The size
 *   of that set is what e2e/support/axe.ts settled() waits on (window.__motionLive);
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

let reduced = false;
const pending = new Set<() => void>();

/**
 * The animations that are running (or waiting on a delay). They are not created in the matchMedia
 * context: a context keeps every animation added to it for its whole life, and this one lives as long as
 * the page. Each one leaves this set when it completes or is interrupted (killed, overwritten, reverted).
 */
const live = new Set<gsap.core.Animation>();

/** How many animations are running: 0 once everything has settled. */
export const liveCount = () => live.size;

// The same count for the e2e suites: settled() (e2e/support/axe.ts) waits for 0 as it does for CSS
// animations, since GSAP tweens are not in document.getAnimations(). A getter on window, not a DOM
// attribute: nothing is written per tween, and reading it costs nothing.
if (typeof window !== "undefined") Object.defineProperty(window, "__motionLive", { configurable: true, get: liveCount });

/**
 * Registers a running animation and drops it when it completes or is interrupted, keeping any callback it
 * already has. The callbacks go on the returned animation itself (Flip.from hands its vars' callbacks to an
 * inner tween), so every kind of ending is seen.
 */
function track<A extends gsap.core.Animation>(a: A): A {
  if (a.progress() >= 1) return a;
  live.add(a);
  for (const type of ["onComplete", "onInterrupt"] as const) {
    const prev = a.eventCallback(type);
    a.eventCallback(type, (...args: unknown[]) => {
      live.delete(a);
      prev?.apply(a, args);
    });
  }
  return a;
}

gsap.matchMedia().add({ full: "(prefers-reduced-motion: no-preference)", reduced: "(prefers-reduced-motion: reduce)" }, (c) => {
  reduced = !!c.conditions?.reduced;
  // The setting flipped: running tweens revert (inline styles cleared); finish any exit waiting on one.
  return () => {
    for (const a of [...live]) a.revert();
    live.clear();
    for (const done of [...pending]) done();
  };
});

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
  track(
    gsap.fromTo(els, start, {
      // Back to identity on what the preset moves, and nothing else: an opacity-only preset writes no
      // inline transform (which would make a containing block for fixed descendants mid-tween).
      opacity: 1,
      ...("x" in start && { x: 0 }),
      ...("y" in start && { y: 0 }),
      ...("scale" in start && { scale: 1 }),
      duration,
      ease: ease(p),
      delay: p === "tick" ? 0.08 : 0,
      stagger: (i) => Math.min(i, inView.length - 1) * each,
      overwrite: "auto",
      clearProps: "transform,opacity",
    }),
  );
}

/** What an element had before its exit made it inert and aria-hidden, so settle() can put it back. */
const before = new WeakMap<HTMLElement, { inert: boolean; hidden: string | null }>();

export function exit(el: HTMLElement, p: Preset): Promise<void> {
  // Kept from the first exit: a second exit on a leaving element must not record the leaving state.
  if (!before.has(el)) before.set(el, { inert: el.inert, hidden: el.getAttribute("aria-hidden") });
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
    track(gsap.to(el, { ...to, ease: EASE.in.gsap, overwrite: "auto", onComplete: done, onInterrupt: done }));
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
    track(gsap.fromTo(container, { opacity: 0 }, { opacity: 1, duration: DUR.micro, ease: EASE.out.gsap, overwrite: "auto", clearProps: "opacity" }));
    return;
  }
  const state = Flip.getState(before, { simple: true });
  mutate();
  const after = flipTargets(container).filter(inViewport);
  // A CSS entrance on a re-inserted item would fight the move: GSAP owns these items now.
  for (const el of after) for (const a of el.getAnimations()) if (a instanceof CSSAnimation) a.finish();
  const end = () => void (running = undefined);
  running = track(
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
      onComplete: end,
      onInterrupt: end,
    }),
  );
}

export function swap(outEl: HTMLElement, inEl: HTMLElement, p: Preset): void {
  const from = pick(FROM, p);
  if (!from) return;
  const { duration, ...start } = from;
  track(gsap.fromTo(outEl, { opacity: 1 }, { opacity: 0, duration: DUR.micro, ease: EASE.in.gsap, overwrite: "auto", clearProps: "opacity" }));
  track(gsap.fromTo(inEl, start, { opacity: 1, scale: 1, y: 0, duration, ease: ease(p), overwrite: "auto", clearProps: "transform,opacity" }));
}

export function kill(el: HTMLElement): void {
  gsap.killTweensOf(el);
}

/**
 * Stops any motion on `el`, clears the inline opacity/transform it left, and gives back the inert and
 * aria-hidden the element had before an exit (a scrim's aria-hidden="true" in the markup stays).
 */
export function settle(el: HTMLElement): void {
  gsap.killTweensOf(el);
  el.style.opacity = el.style.transform = "";
  const was = before.get(el);
  if (!was) return;
  before.delete(el);
  el.inert = was.inert;
  if (was.hidden === null) el.removeAttribute("aria-hidden");
  else el.setAttribute("aria-hidden", was.hidden);
}
