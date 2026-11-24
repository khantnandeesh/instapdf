/**
 * Window side of the F23 hand-off (runs only on /cloud/<provider>). Sends "ready" and a
 * heartbeat every second, notices when the tool tab stops answering (TOOL_LOST_MS), and
 * reports a cancel when the window is closed (pagehide).
 */
import { channelName, HEARTBEAT_MS, parseFromTool, TOOL_LOST_MS, wrap, type FromTool, type FromWindow } from "./protocol";

export type WindowLinkEvents = {
  onCancel?: () => void;
  onStop?: (id: string) => void;
  onRetry?: (id: string) => void;
  onSave?: (file: File) => void;
  onToolLost?: () => void;
  /** The tool tab answers again after `onToolLost`. */
  onToolBack?: () => void;
};

type Deps = { Channel?: typeof BroadcastChannel; now?: () => number };

export class WindowLink {
  private channel: BroadcastChannel;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPong: number;
  private finished = false;
  /** Away on a full-page sign-in: no heartbeat (the page is leaving), but cancel and error still go out. */
  private isAway = false;
  private lost = false;
  private ackWaiters: (() => void)[] = [];
  private acked = false;
  private now: () => number;

  constructor(
    readonly req: string,
    private events: WindowLinkEvents,
    deps: Deps = {},
  ) {
    const Channel = deps.Channel ?? BroadcastChannel;
    this.now = deps.now ?? (() => Date.now());
    this.lastPong = this.now();
    this.channel = new Channel(channelName(req));
    this.channel.onmessage = (e: MessageEvent) => this.receive(parseFromTool(e.data, req));
  }

  start() {
    this.send({ t: "ready" });
    this.timer = setInterval(() => this.beat(), HEARTBEAT_MS);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onHide);
  }

  /** One heartbeat tick (exposed for tests). */
  beat() {
    if (this.finished || this.isAway) return;
    this.send({ t: "hb" });
    if (!this.lost && this.now() - this.lastPong > TOOL_LOST_MS) {
      this.lost = true;
      this.events.onToolLost?.();
    }
  }

  get toolLost() {
    return this.lost;
  }

  send(m: FromWindow) {
    if (!this.finished || m.t === "cancel") this.channel.postMessage(wrap("window", this.req, m));
  }

  /**
   * Every file handed over: tell the tool and wait for its ack. No ack within `timeoutMs`: false,
   * and the tool counts as lost (onToolBack once it answers again). An ack that came late still
   * counts the next time.
   */
  finish(timeoutMs = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.acked) return resolve(true);
      const t = setTimeout(() => {
        if (!this.lost) {
          this.lost = true;
          this.events.onToolLost?.();
        }
        resolve(false);
      }, timeoutMs);
      this.ackWaiters.push(() => {
        clearTimeout(t);
        resolve(true);
      });
      this.send({ t: "done" });
    });
  }

  /** Leaving for a full-page sign-in: tell the tool to wait, and don't report the navigation as a cancel. */
  away(ms: number) {
    if (this.finished) return;
    this.send({ t: "away", ms });
    this.isAway = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onHide);
  }

  /** The sign-in did not leave after all (it failed): heartbeat and close-as-cancel resume. */
  back() {
    if (!this.isAway || this.finished) return;
    this.isAway = false;
    this.lastPong = this.now();
    this.send({ t: "ready" });
    this.timer = setInterval(() => this.beat(), HEARTBEAT_MS);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onHide);
  }

  /** The user cancelled here (×, Escape, Cancel, the provider's own cancel). */
  cancel() {
    if (this.finished) return;
    this.send({ t: "cancel" });
    this.close();
  }

  close() {
    if (this.finished) return;
    this.finished = true;
    if (this.timer) clearInterval(this.timer);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onHide);
    // Let a final message flush before the port closes.
    setTimeout(() => this.channel.close(), 50);
  }

  private onHide = () => this.cancel();

  private receive(m: FromTool | null) {
    if (!m) return;
    this.lastPong = this.now();
    if (this.lost) {
      this.lost = false;
      this.events.onToolBack?.();
    }
    switch (m.t) {
      case "ack":
        this.acked = true;
        this.ackWaiters.splice(0).forEach((f) => f());
        break;
      case "cancel":
        this.finished = true;
        if (this.timer) clearInterval(this.timer);
        this.events.onCancel?.();
        break;
      case "stop":
        this.events.onStop?.(m.id);
        break;
      case "retry":
        this.events.onRetry?.(m.id);
        break;
      case "save":
        this.events.onSave?.(m.file);
        break;
    }
  }
}
