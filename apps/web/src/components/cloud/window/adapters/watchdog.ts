/**
 * The picker-silence check (F23): Google's picker posts its "loaded" callback to this window as soon
 * as it is up; when Google blocks it (cookies for google.com blocked, another Google account active)
 * its iframe shows "You must sign in…" and posts nothing at all. We can't read that page (another
 * origin), so silence after the frame's load is the signal for the window's failure state.
 */

export type PickerWatch = {
  /** The frame's load event: the countdown starts, unless the picker has already spoken. */
  loaded: () => void;
  /** Stops listening and any countdown (the pick ended, or the window gave up on it). */
  stop: () => void;
};

/**
 * Listens from the moment the picker frame exists, so a "loaded" message posted before the frame's
 * own load event is not missed. `loaded()` (call it on that load event) starts a countdown of `ms`
 * only if nothing has arrived yet; `onQuiet` runs if it ends with still nothing. Any message from
 * `origin` and the frame's window counts. Everything stops once a message arrives or the countdown
 * fires.
 */
export function pickerWatchdog(o: {
  target: Pick<Window, "addEventListener" | "removeEventListener">;
  frame: { contentWindow: unknown } | null;
  origin: string;
  ms: number;
  onQuiet: () => void;
  setTimer?: (f: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}): PickerWatch {
  const set = o.setTimer ?? ((f, ms) => setTimeout(f, ms));
  const clear = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let heard = false;
  let done = false;
  let timer: unknown = null;
  const stop = () => {
    done = true;
    if (timer != null) clear(timer);
    timer = null;
    o.target.removeEventListener("message", onMessage);
  };
  const onMessage = (e: Event) => {
    const m = e as MessageEvent;
    if (m.origin !== o.origin || (o.frame && m.source !== o.frame.contentWindow)) return;
    heard = true;
    stop();
  };
  o.target.addEventListener("message", onMessage);
  return {
    loaded: () => {
      if (heard || done || timer != null) return;
      timer = set(() => {
        timer = null;
        stop();
        o.onQuiet();
      }, o.ms);
    },
    stop,
  };
}

/** How long the picker may stay silent after its load before the window shows the failure state. */
export const PICKER_QUIET_MS = 6000;
