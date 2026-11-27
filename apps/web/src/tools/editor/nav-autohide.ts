"use client";
import { useEffect } from "react";

/**
 * Edit PDF, the site navbar steps aside while you read (F25 eval G-1, M12): the owner chose "navbar stays
 * + slim editor bar", so at rest both show. Once a document is open and the canvas is scrolled down, the
 * navbar slides up out of view and the editor bar takes its place at the top, giving the pages the
 * navbar's height. It comes back on a scroll up, when the pointer rests at the top edge, or when focus
 * goes into it (Tab, a skip link), and it never hides while focus is in it. CSS does the moving (editor.css, `html[data-ed-nav="hidden"]`), with
 * transforms only, so nothing is a layout shift, and no motion under prefers-reduced-motion.
 *
 * The one switch: NEXT_PUBLIC_EDITOR_NAV_AUTOHIDE=0 builds the editor with the navbar always shown.
 */
export const NAV_AUTOHIDE = process.env.NEXT_PUBLIC_EDITOR_NAV_AUTOHIDE !== "0";

/** How far (px) a scroll must go in one direction before the navbar hides or comes back. */
const HYSTERESIS = 12;
/** Below this canvas scroll the navbar always shows. */
const TOP_ZONE = 48;
/**
 * The pointer resting this close to the top edge for DWELL ms brings the navbar back. Resting, not just
 * passing: while the navbar is away the top of the window is the editor bar, and a pointer on its way to
 * one of the bar's buttons must not have the bar slide 72 px down from under it.
 */
const EDGE = 8;
const DWELL = 350;

const px = (el: Element, name: string) => parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0;
const navHidden = () => document.documentElement.dataset.edNav === "hidden";

/**
 * Whether the navbar is out of view once the pages are scrolled to `to` by one scroll from where they
 * are: the scroll handler's rule below, for code that lands a page or an object (go to page, reveal).
 */
export function navHiddenAt(scroller: HTMLElement, to: number): boolean {
  if (!NAV_AUTOHIDE || !px(scroller, "--ed-under")) return false;
  if (to <= TOP_ZONE) return false;
  const from = scroller.scrollTop;
  if (to - from > HYSTERESIS) return !document.querySelector(".ip-site-header")?.hasAttribute("data-menu-open");
  if (from - to > HYSTERESIS) return false;
  return navHidden();
}

/**
 * The viewport y where the pages' visible part starts: under the editor bar (and the phone band), with
 * the navbar shown or slid away (`hidden`, by default as it is now). The canvas runs up behind the
 * navbar from 1024 px (editor.css, --ed-under), so its own top is not the visible top.
 */
export function visibleTop(scroller: HTMLElement, hidden = navHidden()): number {
  const pad = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
  return scroller.getBoundingClientRect().top + pad - px(scroller, "--ed-rest-gap") - (hidden ? px(scroller, "--ed-under") : 0);
}

/** The scroll padding a page lands under with the navbar as `hidden` says (go to page). */
export function restPadding(scroller: HTMLElement, hidden: boolean): number {
  const pad = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
  return pad - (hidden ? px(scroller, "--ed-under") : 0);
}

export function useNavAutohide(scroller: HTMLElement | null, enabled: boolean) {
  useEffect(() => {
    if (!NAV_AUTOHIDE || !enabled || !scroller) return;
    const root = document.documentElement;
    const header = document.querySelector<HTMLElement>(".ip-site-header");
    // Only from 1024 px and with room for it: a phone already has its own layout (and below 600px tall
    // the navbar is not drawn at all, editor.css).
    const wide = window.matchMedia("(min-width: 1024px) and (min-height: 601px)");
    let hidden = false;
    let anchor = scroller.scrollTop;
    const set = (hide: boolean) => {
      if (hide === hidden) return;
      hidden = hide;
      if (hide) root.dataset.edNav = "hidden";
      else delete root.dataset.edNav;
    };
    const onScroll = () => {
      if (!wide.matches) return set(false);
      const y = scroller.scrollTop;
      if (y <= TOP_ZONE) {
        anchor = y;
        return set(false);
      }
      if (y - anchor > HYSTERESIS) {
        anchor = y;
        // Never while the All tools menu is open from the navbar, nor while focus is in it (a keyboard
        // user on a navbar link would lose sight of it).
        if (!header?.hasAttribute("data-menu-open") && !header?.contains(document.activeElement)) set(true);
      } else if (anchor - y > HYSTERESIS) {
        anchor = y;
        set(false);
      } else if ((hidden && y > anchor) || (!hidden && y < anchor)) anchor = y; // keep going the same way
    };
    let dwell = 0;
    const stopDwell = () => {
      clearTimeout(dwell);
      dwell = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (!hidden || e.clientY > EDGE || e.buttons) return stopDwell();
      dwell ||= window.setTimeout(() => {
        dwell = 0;
        set(false);
      }, DWELL);
    };
    const onFocus = () => set(false);
    const onMedia = () => !wide.matches && set(false);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", stopDwell, { passive: true });
    header?.addEventListener("focusin", onFocus);
    wide.addEventListener("change", onMedia);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", stopDwell);
      stopDwell();
      header?.removeEventListener("focusin", onFocus);
      wide.removeEventListener("change", onMedia);
      delete root.dataset.edNav;
    };
  }, [scroller, enabled]);
}
