/**
 * Tool-tab side of the F23 hand-off (research §3.1). `openCloudWindow` must be called
 * synchronously inside the click or key handler (user activation): it builds everything first,
 * opens `/cloud/<route>` and returns null when the browser blocked the window.
 *
 * The session listens on its own channel only, validates every message (protocol.ts) and
 * treats `WINDOW_LOST_MS` of silence as "the window was closed" (never while this tab is hidden:
 * its timers are throttled there, and it re-checks once visible).
 */
import { channelName, FIRST_CONTACT_MS, parseFromWindow, windowUrl, wrap, WINDOW_LOST_MS, type ErrorCode, type FromTool, type SkipReason, type WindowParams } from "./protocol";
import type { CloudRoute } from "./providers";

export type SessionEvents = {
  onReady?: () => void;
  onProgress?: (id: string, name: string, loaded: number, total: number) => void;
  onFiles?: (files: { id: string; file: File }[]) => void;
  onSkipped?: (items: { name: string; reason: SkipReason }[]) => void;
  onFailed?: (id: string, name: string) => void;
  onError?: (code: ErrorCode) => void;
  onSaveProgress?: (loaded: number, total: number) => void;
  onSaved?: (name: string, link?: string) => void;
  /** The window finished (all files handed over) and was told to close. */
  onDone?: () => void;
  /** The window was cancelled or closed (also: heartbeat lost). */
  onClosed?: (reason: "cancel" | "lost") => void;
};

export type CloudSession = {
  req: string;
  stop: (id: string) => void;
  retry: (id: string) => void;
  /** Save mode: hands the result to the window (sent once the window is ready). */
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
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
};

/** Popup features: a small window on desktop, a plain new tab on phones (no features). */
export function popupFeatures(win: { innerWidth: number; screenX?: number; screenY?: number; outerWidth?: number; outerHeight?: number; matchMedia?: (q: string) => { matches: boolean } }): string {
  const phone = win.innerWidth < 640 || !!win.matchMedia?.("(pointer: coarse)").matches;
  if (phone) return "";
  const w = 480;
  const h = 640;
  const left = Math.round((win.screenX ?? 0) + Math.max(0, ((win.outerWidth ?? w) - w) / 2));
  const top = Math.round((win.screenY ?? 0) + Math.max(0, ((win.outerHeight ?? h) - h) / 2));
  return `popup,width=${w},height=${h},left=${left},top=${top}`;
}

export function openCloudWindow(route: CloudRoute, params: WindowParams, events: SessionEvents, deps: Deps = {}): CloudSession | null {
  const Channel = deps.Channel ?? BroadcastChannel;
  const now = deps.now ?? (() => Date.now());
  const hidden = deps.hidden ?? (() => typeof document !== "undefined" && document.visibilityState === "hidden");
  const setI = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearI = deps.clearInterval ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));
  const open = deps.open ?? ((u: string, t: string, f: string) => window.open(u, t, f));
  const features = typeof window === "undefined" ? "" : popupFeatures(window);

  // Listen before the window exists, so its first "ready" cannot be missed.
  const channel = new Channel(channelName(params.req));
  const win = open(windowUrl(route, params), `berrypdf-cloud-${params.req}`, features);
  if (!win) {
    channel.close();
    return null;
  }

  let ended = false;
  let ready = false;
  let contacted = false;
  let lastSeen = now();
  let pendingSave: File | null = null;
  const post = (m: FromTool) => {
    if (!ended) channel.postMessage(wrap("tool", params.req, m));
  };

  const end = () => {
    if (ended) return;
    ended = true;
    clearI(timer);
    channel.close();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  };

  const onVisible = () => {
    // Back from a hidden state: heartbeats may have been delayed, give the window a fresh window.
    if (!hidden()) lastSeen = Math.max(lastSeen, now() - WINDOW_LOST_MS / 2);
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  channel.onmessage = (e: MessageEvent) => {
    const m = parseFromWindow(e.data, params.req);
    if (!m || ended) return;
    lastSeen = now();
    contacted = true;
    switch (m.t) {
      case "ready":
        ready = true;
        events.onReady?.();
        if (pendingSave) {
          post({ t: "save", file: pendingSave });
          pendingSave = null;
        }
        break;
      case "hb":
        post({ t: "pong" });
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
    }
  };

  const timer = setI(() => {
    if (ended || hidden()) return;
    const limit = contacted ? WINDOW_LOST_MS : FIRST_CONTACT_MS;
    if (now() - lastSeen > limit) {
      end();
      events.onClosed?.("lost");
    }
  }, 500);

  return {
    req: params.req,
    stop: (id) => post({ t: "stop", id }),
    retry: (id) => post({ t: "retry", id }),
    sendSave: (file) => {
      if (ready) post({ t: "save", file });
      else pendingSave = file;
    },
    cancel: () => {
      post({ t: "cancel" });
      end();
    },
    dispose: end,
    get ended() {
      return ended;
    },
  };
}
