/**
 * The synchronous first step of the F23 hand-off, kept tiny so it ships with the tool page:
 * inside the click handler it opens the channel, then the `/cloud/<route>` window. Messages
 * that arrive before the rest of the tool-side code has loaded are kept and replayed
 * (client.ts), so the window's first "ready" is never missed.
 */
import type { CloudProvider, CloudRoute } from "./providers";

export const channelName = (req: string) => `cloud:${req}`;

export type WindowParams = {
  req: string;
  /** Lower-case extensions with the dot, e.g. [".pdf", ".png"]. */
  accept: string[];
  multiple: boolean;
  /** The tool's per-file size cap in bytes. */
  max: number;
  /** Tool name for "Added to Merge PDF". */
  tool: string;
  /** Which provider the mock window stands in for (only on /cloud/mock). */
  provider?: CloudProvider;
  /** Save mode: the window uploads the file the tool sends. */
  mode?: "pick" | "save";
};

export function windowUrl(route: CloudRoute, p: WindowParams): string {
  const q = new URLSearchParams({ req: p.req, accept: p.accept.join(","), multiple: p.multiple ? "1" : "0", max: String(p.max), tool: p.tool });
  if (route === "mock" && p.provider) q.set("p", p.provider);
  if (p.mode === "save") q.set("mode", "save");
  return `/cloud/${route}?${q.toString()}`;
}

/** Crypto-random UUID (tests can pass their own). */
export function newRequestId(): string {
  return crypto.randomUUID();
}

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

/** An opened window's channel plus what it said before anyone handled it. */
export type OpenedWindow = { channel: BroadcastChannel; buffered: MessageEvent[] };

export type OpenDeps = {
  open?: (url: string, target: string, features: string) => Window | null;
  Channel?: typeof BroadcastChannel;
};

/** Must run synchronously in a click or key handler. Null: the browser blocked the window. */
export function openWindowNow(route: CloudRoute, params: WindowParams, deps: OpenDeps = {}): OpenedWindow | null {
  const Channel = deps.Channel ?? BroadcastChannel;
  const open = deps.open ?? ((u: string, t: string, f: string) => window.open(u, t, f));
  // Listen before the window exists, so its first "ready" cannot be missed.
  const channel = new Channel(channelName(params.req));
  const buffered: MessageEvent[] = [];
  channel.onmessage = (e: MessageEvent) => void buffered.push(e);
  const win = open(windowUrl(route, params), `berrypdf-cloud-${params.req}`, typeof window === "undefined" ? "" : popupFeatures(window));
  if (!win) {
    channel.close();
    return null;
  }
  return { channel, buffered };
}
