/**
 * The synchronous first step of the F23 hand-off, kept tiny so it ships with the tool page:
 * inside the click handler it opens the channel, then the `/cloud/<route>` window. Messages
 * that arrive before the rest of the tool-side code has loaded are kept and replayed
 * (client.ts), so the window's first "ready" is never missed.
 */
import { popupFeatures } from "./popup";
import type { CloudProvider, CloudRoute } from "./providers";

export { popupFeatures };

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

/** An opened window's channel plus what it said before anyone handled it, and the window itself (to close it). */
export type OpenedWindow = { channel: BroadcastChannel; buffered: MessageEvent[]; win: Window };

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
  return { channel, buffered, win };
}
