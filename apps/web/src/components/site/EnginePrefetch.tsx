"use client";
/**
 * Fetches the Edit PDF text engine into the HTTP cache on intent only: the first pointer, focus or
 * touch on a link to /edit-pdf. Never on page load, so visitors who don't edit don't pay for it,
 * and not with Data Saver on or on 2g. The files are immutable (content-hashed), so the editor
 * then compiles them without a download.
 *
 * It is on every page, so it is kept small: the two paths are inlined at build (next.config `env`,
 * the same values as lib/editor/engine-assets) and the connection check is the same rule as
 * lib/editor/engine-load `earlyFetchAllowed` (an e2e test checks both).
 */
import { useEffect } from "react";

const EDIT_LINK = 'a[href="/edit-pdf"],a[href^="/edit-pdf?"],a[href^="/edit-pdf#"]';

export function EnginePrefetch() {
  useEffect(() => {
    const events = ["pointerover", "focusin", "touchstart"] as const;
    const stop = () => events.forEach((t) => document.removeEventListener(t, on, true));
    function on(e: Event) {
      if (!(e.target as Element | null)?.closest?.(EDIT_LINK) || location.pathname === "/edit-pdf") return;
      stop();
      const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (c?.saveData || /2g$/.test(c?.effectiveType ?? "")) return;
      for (const href of [process.env.ENGINE_JS_PATH!, process.env.ENGINE_WASM_PATH!]) {
        if (document.head.querySelector(`link[href="${href}"]`)) continue;
        const l = document.createElement("link");
        l.rel = "prefetch";
        l.href = href;
        document.head.append(l);
      }
    }
    events.forEach((t) => document.addEventListener(t, on, { capture: true, passive: true }));
    return stop;
  }, []);
  return null;
}
