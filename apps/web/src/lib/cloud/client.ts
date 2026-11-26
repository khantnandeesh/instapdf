/**
 * Tool-tab side of the F23 hand-off (research §3.1). `openCloudWindow` must be called
 * synchronously inside the click or key handler (user activation): it builds everything first,
 * opens `/cloud/<route>` and returns null when the browser blocked the window.
 *
 * The session listens on its own channel only, validates every message (protocol.ts) and
 * treats `WINDOW_LOST_MS` of silence as "the window was closed" (never while this tab is hidden:
 * its timers are throttled there, and it re-checks once visible).
 */
import { openWindowNow, popupFeatures, type OpenedWindow, type WindowParams } from "./opener";
import { AWAY_FOCUSED_MS, FIRST_CONTACT_MS, parseFromWindow, SIGN_IN_AWAY_MS, wrap, WINDOW_LOST_MS, type ErrorCode, type FromTool, type SkipReason } from "./protocol";
import type { CloudRoute } from "./providers";

export type SessionEvents = {
  onReady?: () => void;
  onProgress?: (id: string, name: string, loaded: number, total: number) => void;
  onFiles?: (files: { id: string; file: File }[]) => void;
  onSkipped?: (items: { name: string; reason: SkipReason; id?: string }[]) => void;
  onFailed?: (id: string, name: string) => void;
  onError?: (code: ErrorCode) => void;
  onSaveProgress?: (loaded: number, total: number) => void;
  onSaved?: (name: string, link?: string) => void;
  /** The window finished (all files handed over) and was told to close. */
  onDone?: () => void;
  /** The window was cancelled or closed (also: heartbeat lost). */
  onClosed?: (reason: "cancel" | "lost") => void;
  /** The window closed for the tool's own picker ("Choose from this device"); onClosed("cancel") follows. */
  onDevice?: () => void;
  /**
   * The window is away on a sign-in page and this tab has been in front for AWAY_FOCUSED_MS: most
   * likely it was closed there. Say so; the session still listens until the sign-in allowance ends.
   */
  onGaveUp?: () => void;
  /** After onGaveUp, the window came back from its sign-in after all ("ready"): waiting again. */
  onResumed?: () => void;
};

export type CloudSession = {
  req: string;
  stop: (id: string) => void;
  retry: (id: string) => void;
  /** Save mode: hands the result to the window, on its every "ready" until the session ends. */
  sendSave: (file: File) => void;
  /** Tells the window to close and stops listening. */
  cancel: () => void;
  /** Stops listening without telling the window. */
  dispose: () => void;
  readonly ended: boolean;
};

type Deps = {
  open?: (url: string, target: string, features: string) => Window | null;
  Channel?: typeof BroadcastChannel;
  now?: () => number;
  hidden?: () => boolean;
  /** This tab is in front and has focus. */
  focused?: () => boolean;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
  /** The window was already opened in the click handler (opener.ts): adopt its channel. */
  opened?: OpenedWindow;
};

export { popupFeatures };

export function openCloudWindow(route: CloudRoute, params: WindowParams, events: SessionEvents, deps: Deps = {}): CloudSession | null {
  const now = deps.now ?? (() => Date.now());
  const hidden = deps.hidden ?? (() => typeof document !== "undefined" && document.visibilityState === "hidden");
  const focused = deps.focused ?? (() => typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus());
  const setI = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearI = deps.clearInterval ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));
  const opened = deps.opened ?? openWindowNow(route, params, deps);
  if (!opened) return null;
  const { channel, buffered } = opened;

  let ended = false;
  let ready = false;
  let contacted = false;
  let lastSeen = now();
  // Away on a sign-in page: since when this tab has been in front and focused (null: not now), and
  // whether the tool already said it stopped waiting (it keeps listening for a late "ready").
  let away = false;
  let focusedSince: number | null = null;
  let gaveUp = false;
  // Save mode: kept until the session ends, and sent on every "ready": a window back from a
  // full-page sign-in (OneDrive) is a new page that has not seen it (it ignores a repeat).
  let saveFile: File | null = null;
  const post = (m: FromTool) => {
    if (!ended) channel.postMessage(wrap("tool", params.req, m));
  };

  const end = () => {
    if (ended) return;
    ended = true;
    saveFile = null;
    clearI(timer);
    channel.close();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  };

  const onVisible = () => {
    // Back from a hidden state: heartbeats may have been delayed, give the window a fresh window.
    if (!hidden()) lastSeen = Math.max(lastSeen, now() - WINDOW_LOST_MS / 2);
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  const onMessage = (e: MessageEvent) => {
    const m = parseFromWindow(e.data, params.req);
    if (!m || ended) return;
    lastSeen = now();
    contacted = true;
    switch (m.t) {
      case "ready":
        ready = true;
        away = false;
        if (gaveUp) {
          gaveUp = false;
          events.onResumed?.();
        }
        events.onReady?.();
        if (saveFile) post({ t: "save", file: saveFile });
        break;
      case "hb":
        post({ t: "pong" });
        break;
      case "away":
        // A full-page sign-in: silence is expected until the window comes back (it sends "ready" again).
        lastSeen = now() + Math.min(m.ms, SIGN_IN_AWAY_MS);
        contacted = false;
        away = true;
        focusedSince = null;
        break;
      case "progress":
        events.onProgress?.(m.id, m.name, m.loaded, m.total);
        break;
      case "files":
        events.onFiles?.(m.files);
        break;
      case "skipped":
        events.onSkipped?.(m.items);
        break;
      case "failed":
        events.onFailed?.(m.id, m.name);
        break;
      case "error":
        events.onError?.(m.code);
        break;
      case "saveProgress":
        events.onSaveProgress?.(m.loaded, m.total);
        break;
      case "saved":
        events.onSaved?.(m.name, m.link);
        break;
      case "done":
        post({ t: "ack" });
        end();
        events.onDone?.();
        break;
      case "cancel":
        end();
        events.onClosed?.("cancel");
        break;
      case "device":
        end();
        events.onDevice?.();
        events.onClosed?.("cancel");
        break;
    }
  };

  channel.onmessage = onMessage;
  for (const e of buffered.splice(0)) onMessage(e);

  const timer = setI(() => {
    if (ended) return;
    if (away && !gaveUp) {
      // Back here for AWAY_FOCUSED_MS while the window says nothing: most likely it was closed on the
      // sign-in page. Say so, but keep listening: a slow sign-in (an MFA push, a new account, an SMS
      // code) that comes back within the allowance still carries on.
      if (!focused()) focusedSince = null;
      else if (focusedSince === null) focusedSince = now();
      else if (now() - focusedSince >= AWAY_FOCUSED_MS) {
        gaveUp = true;
        events.onGaveUp?.();
      }
    }
    if (hidden()) return;
    const limit = contacted ? WINDOW_LOST_MS : FIRST_CONTACT_MS;
    if (now() > lastSeen && now() - lastSeen > limit) {
      end();
      events.onClosed?.("lost");
    }
  }, 500);

  return {
    req: params.req,
    stop: (id) => post({ t: "stop", id }),
    retry: (id) => post({ t: "retry", id }),
    sendSave: (file) => {
      saveFile = file;
      if (ready) post({ t: "save", file });
    },
    cancel: () => {
      // Closed from here too: a window that has not opened its channel yet would miss "cancel" and be left behind.
      if (!ended) opened.win.close();
      post({ t: "cancel" });
      end();
    },
    dispose: end,
    get ended() {
      return ended;
    },
  };
}
