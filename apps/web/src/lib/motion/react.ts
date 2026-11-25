/**
 * React glue for lib/motion (no @gsap/react). Client components only.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { exit, motionReady, settle, type Preset } from "./index";

/**
 * Keeps something rendered while it leaves: returns true while `open`, and after it turns false until
 * every part has run its exit (at once when the engine isn't loaded). Reopening mid-exit settles the
 * parts where they are and keeps them. Exits start in a layout effect, so the parts are inert on the
 * very frame the close happens.
 */
export function usePresence(open: boolean, parts: [RefObject<HTMLElement | null>, Preset][]): boolean {
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const partsRef = useRef(parts);
  partsRef.current = parts;
  useLayoutEffect(() => {
    const els = partsRef.current.map(([r, p]) => [r.current, p] as const);
    if (open) return els.forEach(([el]) => settle(el));
    if (!shown) return;
    if (!motionReady()) return setShown(false);
    let live = true;
    // Gone in the frame the last fade ends (flushSync), not in a render scheduled after it.
    void Promise.all(els.map(([el, p]) => exit(el, p))).then(() => live && flushSync(() => setShown(false)));
    return () => {
      live = false;
    };
  }, [open, shown]);
  return open || shown;
}
