"use client";
/**
 * Fetches the Edit PDF text engine into the HTTP cache on intent only: the first pointer, focus or
 * touch on a link to /edit-pdf. Never on page load, so visitors who don't edit don't pay for it,
 * and not with Data Saver on or on 2g. The files are immutable (content-hashed), so the editor
 * then compiles them without a download.
 */
import { useEffect } from "react";

const EDIT_LINK = 'a[href="/edit-pdf"], a[href^="/edit-pdf?"], a[href^="/edit-pdf#"]';

export function EnginePrefetch() {
  useEffect(() => {
    const events = ["pointerover", "focusin", "touchstart"] as const;
    const stop = () => events.forEach((t) => document.removeEventListener(t, on, true));
    function on(e: Event) {
      const link = (e.target as Element | null)?.closest?.(EDIT_LINK);
      if (!link || location.pathname === "/edit-pdf") return;
      stop();
      // The paths and the connection check load only now, so every page stays as light as before.
      void Promise.all([import("@/lib/editor/engine-assets"), import("@/lib/editor/engine-load")]).then(([{ ENGINE_JS, ENGINE_WASM }, { earlyFetchAllowed }]) => {
        const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
        if (!earlyFetchAllowed(conn)) return;
        for (const href of [ENGINE_JS, ENGINE_WASM]) {
          if (document.head.querySelector(`link[rel="prefetch"][href="${href}"]`)) continue;
          const l = document.createElement("link");
          l.rel = "prefetch";
          l.href = href;
          l.dataset.engine = "";
          document.head.append(l);
        }
      });
    }
    events.forEach((t) => document.addEventListener(t, on, { capture: true, passive: true }));
    return stop;
  }, []);
  return null;
}
