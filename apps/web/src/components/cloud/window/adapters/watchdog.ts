/**
 * The picker-silence check (F23): Google's picker posts its "loaded" callback to this window as soon
 * as it is up; when Google blocks it (cookies for google.com blocked, another Google account active)
 * its iframe shows "You must sign in…" and posts nothing at all. We can't read that page (another
 * origin), so silence after the frame's load is the signal for the window's failure state.
 */
/**
 * Calls `onQuiet` when the picker frame has posted nothing to this window for `ms` after its load
 * event (Google's own sign-in page inside the picker posts nothing; a working picker posts its
 * "loaded" callback at once). Any message from the frame's origin and window counts as alive.
 * Start it from the iframe's load event. Returns a stop function.
 */
export function pickerWatchdog(o: { target: Pick<Window, "addEventListener" | "removeEventListener">; frame: { contentWindow: unknown } | null; origin: string; ms: number; onQuiet: () => void; setTimer?: (f: () => void, ms: number) => unknown; clearTimer?: (t: unknown) => void }) {
  const set = o.setTimer ?? ((f, ms) => setTimeout(f, ms));
  const clear = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let timer: unknown = set(() => {
    timer = null;
    o.onQuiet();
  }, o.ms);
  const onMessage = (e: Event) => {
    const m = e as MessageEvent;
    if (m.origin !== o.origin || (o.frame && m.source !== o.frame.contentWindow)) return;
    stop();
  };
  const stop = () => {
    if (timer != null) clear(timer);
    timer = null;
    o.target.removeEventListener("message", onMessage);
  };
  o.target.addEventListener("message", onMessage);
  return stop;
}

/** How long the picker may stay silent after its load before the window shows the failure state. */
export const PICKER_QUIET_MS = 6000;
