"use client";
import { useEffect } from "react";

/**
 * Edit PDF, the site navbar steps aside while you read (F25 eval G-1, M12): the owner chose "navbar stays
 * + slim editor bar", so at rest both show. Once a document is open and the canvas is scrolled down, the
 * navbar slides up out of view and the editor bar takes its place at the top, giving the pages the
 * navbar's height. It comes back on a scroll up, when the pointer reaches the top edge, or when focus
 * goes into it (Tab, a skip link). CSS does the moving (editor.css, `html[data-ed-nav="hidden"]`), with
 * transforms only, so nothing is a layout shift, and no motion under prefers-reduced-motion.
 *
 * The one switch: NEXT_PUBLIC_EDITOR_NAV_AUTOHIDE=0 builds the editor with the navbar always shown.
 */
export const NAV_AUTOHIDE = process.env.NEXT_PUBLIC_EDITOR_NAV_AUTOHIDE !== "0";

/** How far (px) a scroll must go in one direction before the navbar hides or comes back. */
const HYSTERESIS = 12;
/** Below this canvas scroll the navbar always shows. */
const TOP_ZONE = 48;
/** The pointer this close to the top edge brings the navbar back. */
const EDGE = 8;

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
        // Never while the All tools menu is open from the navbar.
        if (!header?.hasAttribute("data-menu-open")) set(true);
      } else if (anchor - y > HYSTERESIS) {
        anchor = y;
        set(false);
      } else if ((hidden && y > anchor) || (!hidden && y < anchor)) anchor = y; // keep going the same way
    };
    const onMove = (e: PointerEvent) => {
      if (hidden && e.clientY <= EDGE) set(false);
    };
    const onFocus = () => set(false);
    const onMedia = () => !wide.matches && set(false);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    header?.addEventListener("focusin", onFocus);
    wide.addEventListener("change", onMedia);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      header?.removeEventListener("focusin", onFocus);
      wide.removeEventListener("change", onMedia);
      delete root.dataset.edNav;
    };
  }, [scroller, enabled]);
}
