import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openCloudWindow, popupFeatures } from "./client";
import { openWindowNow } from "./opener";
import { AWAY_FOCUSED_MS, channelName, FIRST_CONTACT_MS, SIGN_IN_AWAY_MS, TOOL_LOST_MS, WINDOW_LOST_MS, wrap } from "./protocol";
import { WindowLink } from "./window-link";

/**
 * In-memory BroadcastChannel: delivers to every other instance of the same name, asynchronously,
 * by reference (browsers clone File/Blob by reference too; Node's own channel cannot clone a File).
 */
class FakeChannel {
  static all = new Set<FakeChannel>();
  onmessage: ((e: MessageEvent) => void) | null = null;
  closed = false;
  constructor(readonly name: string) {
    FakeChannel.all.add(this);
  }
  postMessage(data: unknown) {
    if (this.closed) throw new Error("closed");
    for (const c of FakeChannel.all) if (c !== this && c.name === this.name && !c.closed) queueMicrotask(() => c.onmessage?.({ data } as MessageEvent));
  }
  close() {
    this.closed = true;
    FakeChannel.all.delete(this);
  }
}
const Channel = FakeChannel as unknown as typeof BroadcastChannel;
let n = 0;
let REQ = "";
let params = { req: REQ, accept: [".pdf"], multiple: true, max: 100, tool: "Rotate PDF", provider: "google" as const };
beforeEach(() => {
  REQ = `6f1c2a8e-3b4d-4e5f-8a9b-${String(++n).padStart(12, "0")}`;
  params = { ...params, req: REQ };
});
const peer = () => new FakeChannel(channelName(REQ));
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("openCloudWindow (tool tab)", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] }));
  afterEach(() => vi.useRealTimers());

  it("returns null and leaves nothing open when the browser blocks the window", () => {
    const s = openCloudWindow("mock", params, {}, { Channel, open: () => null });
    expect(s).toBeNull();
  });

  it("opens /cloud/<route> with the request, and hands validated files over", async () => {
    let opened = "";
    const files: string[] = [];
    const events = { onFiles: (f: { file: File }[]) => files.push(...f.map((x) => x.file.name)), onDone: vi.fn(), onReady: vi.fn() };
    const s = openCloudWindow("mock", params, events, { Channel, open: (u) => ((opened = u), { close() {} } as Window), hidden: () => false })!;
    expect(opened).toContain(`/cloud/mock?req=${REQ}`);
    const win = peer();
    const fromTool: unknown[] = [];
    win.onmessage = (e) => fromTool.push(e.data);
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    win.postMessage(wrap("window", "00000000-0000-4000-8000-000000000000", { t: "files", files: [{ id: "x", file: new File(["x"], "evil.pdf") }] }));
    win.postMessage({ from: "window", req: REQ, t: "files", files: [{ id: "x", file: "not a file" }] });
    win.postMessage(wrap("window", REQ, { t: "files", files: [{ id: "f1", file: new File(["%PDF"], "alpha.pdf") }] }));
    win.postMessage(wrap("window", REQ, { t: "hb" }));
    win.postMessage(wrap("window", REQ, { t: "done" }));
    await vi.waitFor(() => expect(events.onDone).toHaveBeenCalled());
    expect(events.onReady).toHaveBeenCalledTimes(1);
    expect(files).toEqual(["alpha.pdf"]);
    expect(fromTool).toEqual(expect.arrayContaining([{ t: "pong", from: "tool", req: REQ }, { t: "ack", from: "tool", req: REQ }]));
    expect(s.ended).toBe(true);
    win.close();
  });

  it("adopts a window opened in the click handler and replays what it said before the session started", async () => {
    let url = "";
    const opened = openWindowNow("mock", params, { Channel, open: (u) => ((url = u), { close() {} } as Window) })!;
    expect(url).toContain(`/cloud/mock?req=${REQ}`);
    const win = peer();
    const fromTool: unknown[] = [];
    win.onmessage = (e) => fromTool.push(e.data);
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    win.postMessage(wrap("window", REQ, { t: "progress", id: "f1", name: "alpha.pdf", loaded: 1, total: 4 }));
    await tick();
    expect(opened.buffered).toHaveLength(2);
    const events = { onReady: vi.fn(), onProgress: vi.fn() };
    const open = vi.fn();
    const s = openCloudWindow("mock", params, events, { Channel, open, opened, hidden: () => false })!;
    expect(open).not.toHaveBeenCalled();
    expect(events.onReady).toHaveBeenCalledTimes(1);
    expect(events.onProgress).toHaveBeenCalledWith("f1", "alpha.pdf", 1, 4);
    win.postMessage(wrap("window", REQ, { t: "hb" }));
    await vi.waitFor(() => expect(fromTool).toContainEqual({ t: "pong", from: "tool", req: REQ }));
    s.cancel();
    win.close();
  });

  it("openWindowNow closes its channel when the window is blocked", () => {
    expect(openWindowNow("mock", params, { Channel, open: () => null })).toBeNull();
    expect([...FakeChannel.all].some((c) => c.name === channelName(REQ))).toBe(false);
  });

  it("treats heartbeat silence as a closed window, but not while this tab is hidden", async () => {
    let hidden = true;
    const onClosed = vi.fn();
    openCloudWindow("mock", params, { onClosed }, { Channel, open: () => ({ close() {} }) as Window, hidden: () => hidden });
    const win = peer();
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    await vi.waitFor(() => expect(true).toBe(true));
    await tick();
    vi.advanceTimersByTime(WINDOW_LOST_MS * 3);
    expect(onClosed).not.toHaveBeenCalled(); // hidden: timers are throttled, don't judge
    hidden = false;
    vi.advanceTimersByTime(WINDOW_LOST_MS + 600);
    expect(onClosed).toHaveBeenCalledWith("lost");
    win.close();
  });

  it("gives a loading window longer before the first message", () => {
    const onClosed = vi.fn();
    openCloudWindow("mock", params, { onClosed }, { Channel, open: () => ({ close() {} }) as Window, hidden: () => false });
    vi.advanceTimersByTime(WINDOW_LOST_MS + 1000);
    expect(onClosed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FIRST_CONTACT_MS);
    expect(onClosed).toHaveBeenCalledWith("lost");
  });

  it("an 'away' notice (sign-in page) holds off the watchdog for that long, then falls back to the first-contact wait", async () => {
    const onClosed = vi.fn();
    openCloudWindow("mock", params, { onClosed }, { Channel, open: () => ({ close() {} }) as Window, hidden: () => false });
    const win = peer();
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    win.postMessage(wrap("window", REQ, { t: "away", ms: 60_000 }));
    await tick();
    vi.advanceTimersByTime(59_000);
    expect(onClosed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000 + WINDOW_LOST_MS + 1000);
    expect(onClosed).not.toHaveBeenCalled(); // back from the redirect: the slower first-contact limit applies
    vi.advanceTimersByTime(FIRST_CONTACT_MS);
    expect(onClosed).toHaveBeenCalledWith("lost");
    win.close();
  });

  it("a sign-in page gets at most SIGN_IN_AWAY_MS (10 minutes), whatever the window asks for", async () => {
    expect(SIGN_IN_AWAY_MS).toBe(10 * 60_000);
    const onClosed = vi.fn();
    openCloudWindow("mock", params, { onClosed }, { Channel, open: () => ({ close() {} }) as Window, hidden: () => false, focused: () => false });
    const win = peer();
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    win.postMessage(wrap("window", REQ, { t: "away", ms: 60 * 60_000 })); // refused (over MAX_AWAY_MS): no hold-off at all
    win.postMessage(wrap("window", REQ, { t: "away", ms: 10 * 60_000 }));
    await tick();
    vi.advanceTimersByTime(SIGN_IN_AWAY_MS - 1000);
    expect(onClosed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FIRST_CONTACT_MS + 2000);
    expect(onClosed).toHaveBeenCalledWith("lost");
    win.close();
  });

  it("while the window is away, this tab in front and focused for AWAY_FOCUSED_MS gives up waiting, but keeps listening (M-c)", async () => {
    let focused = true;
    const onClosed = vi.fn();
    const onGaveUp = vi.fn();
    openCloudWindow("mock", params, { onClosed, onGaveUp }, { Channel, open: () => ({ close() {} }) as Window, hidden: () => false, focused: () => focused });
    const win = peer();
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    win.postMessage(wrap("window", REQ, { t: "away", ms: SIGN_IN_AWAY_MS }));
    await tick();
    vi.advanceTimersByTime(AWAY_FOCUSED_MS - 2000);
    focused = false; // the person went back to the sign-in window: the count starts over
    vi.advanceTimersByTime(5000);
    focused = true;
    vi.advanceTimersByTime(AWAY_FOCUSED_MS - 2000);
    expect(onGaveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onGaveUp).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();
    // Said once; the session lasts until the sign-in allowance runs out.
    vi.advanceTimersByTime(SIGN_IN_AWAY_MS - 3 * AWAY_FOCUSED_MS);
    expect(onGaveUp).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3 * AWAY_FOCUSED_MS + FIRST_CONTACT_MS);
    expect(onClosed).toHaveBeenCalledWith("lost");
    win.close();
  });

  it("never gives up while this tab is in the background (the person is still signing in there)", async () => {
    const onGaveUp = vi.fn();
    openCloudWindow("mock", params, { onGaveUp }, { Channel, open: () => ({ close() {} }) as Window, hidden: () => false, focused: () => false });
    const win = peer();
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    win.postMessage(wrap("window", REQ, { t: "away", ms: SIGN_IN_AWAY_MS }));
    await tick();
    vi.advanceTimersByTime(SIGN_IN_AWAY_MS - 1000);
    expect(onGaveUp).not.toHaveBeenCalled();
    win.close();
  });

  it("a sign-in that comes back after the tool gave up carries on: 'ready' resumes the session, and files arrive", async () => {
    const onGaveUp = vi.fn();
    const onResumed = vi.fn();
    const onClosed = vi.fn();
    const onProgress = vi.fn();
    openCloudWindow("mock", params, { onGaveUp, onResumed, onClosed, onProgress }, { Channel, open: () => ({ close() {} }) as Window, hidden: () => false, focused: () => true });
    const win = peer();
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    win.postMessage(wrap("window", REQ, { t: "away", ms: SIGN_IN_AWAY_MS }));
    await tick();
    vi.advanceTimersByTime(AWAY_FOCUSED_MS + 1000);
    expect(onGaveUp).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3 * 60_000); // an MFA push, an SMS code
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    await tick();
    expect(onResumed).toHaveBeenCalledTimes(1);
    win.postMessage(wrap("window", REQ, { t: "progress", id: "a", name: "a.pdf", loaded: 1, total: 2 }));
    await tick();
    expect(onProgress).toHaveBeenCalledWith("a", "a.pdf", 1, 2);
    // Back to the normal heartbeat rules: no second "gave up", and the session is alive.
    for (let i = 0; i < 40; i++) {
      win.postMessage(wrap("window", REQ, { t: "hb" }));
      await tick();
      vi.advanceTimersByTime(1000);
    }
    expect(onGaveUp).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();
    win.close();
  });

  it("a window back from its sign-in ('ready') is no longer away: focus here does not end it", async () => {
    const onClosed = vi.fn();
    const onGaveUp = vi.fn();
    openCloudWindow("mock", params, { onClosed, onGaveUp }, { Channel, open: () => ({ close() {} }) as Window, hidden: () => false, focused: () => true });
    const win = peer();
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    win.postMessage(wrap("window", REQ, { t: "away", ms: 60_000 }));
    await tick();
    vi.advanceTimersByTime(5000);
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    await tick();
    for (let i = 0; i < 40; i++) {
      win.postMessage(wrap("window", REQ, { t: "hb" }));
      await tick();
      vi.advanceTimersByTime(1000);
    }
    expect(onClosed).not.toHaveBeenCalled();
    expect(onGaveUp).not.toHaveBeenCalled();
    win.close();
  });

  it("cancel closes the window itself too (one that has not opened its channel yet would miss the message), but not after the session ended", async () => {
    const close = vi.fn();
    const s = openCloudWindow("mock", params, {}, { Channel, open: () => ({ close }) as unknown as Window, hidden: () => false })!;
    s.cancel();
    expect(close).toHaveBeenCalledTimes(1);
    s.cancel();
    expect(close).toHaveBeenCalledTimes(1);
    const done = openCloudWindow("mock", params, {}, { Channel, open: () => ({ close }) as unknown as Window, hidden: () => false })!;
    done.dispose();
    done.cancel();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("a cancel from the window ends the session quietly", async () => {
    const onClosed = vi.fn();
    openCloudWindow("mock", params, { onClosed }, { Channel, open: () => ({ close() {} }) as Window, hidden: () => false });
    const win = peer();
    win.postMessage(wrap("window", REQ, { t: "cancel" }));
    await vi.waitFor(() => expect(onClosed).toHaveBeenCalledWith("cancel"));
    win.close();
  });

  it("'device' (Choose from this device) calls onDevice, then onClosed('cancel'), and ends the session", async () => {
    const calls: string[] = [];
    const s = openCloudWindow(
      "mock",
      params,
      { onDevice: () => calls.push("device"), onClosed: (r) => calls.push(`closed:${r}`) },
      { Channel, open: () => ({ close() {} }) as Window, hidden: () => false },
    )!;
    const win = peer();
    win.postMessage(wrap("window", REQ, { t: "device" }));
    await vi.waitFor(() => expect(calls).toEqual(["device", "closed:cancel"]));
    expect(s.ended).toBe(true);
    win.close();
  });

  it("sends the file to save only after the window is ready", async () => {
    const s = openCloudWindow("mock", { ...params, mode: "save" }, {}, { Channel, open: () => ({ close() {} }) as Window, hidden: () => false })!;
    const win = peer();
    const got: { t: string; file?: File }[] = [];
    win.onmessage = (e) => got.push(e.data);
    const f = new File(["%PDF"], "out.pdf");
    s.sendSave(f);
    await tick();
    expect(got.filter((m) => m.t === "save")).toEqual([]);
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    await vi.waitFor(() => expect(got.find((m) => m.t === "save")?.file?.name).toBe("out.pdf"));
    s.dispose();
    win.close();
  });

  it("re-sends the file on every 'ready' until the session ends (a window back from a sign-in redirect is a new page)", async () => {
    const s = openCloudWindow("mock", { ...params, mode: "save" }, {}, { Channel, open: () => ({ close() {} }) as Window, hidden: () => false })!;
    const win = peer();
    const saves: string[] = [];
    win.onmessage = (e) => e.data.t === "save" && saves.push(e.data.file.name);
    s.sendSave(new File(["%PDF"], "out.pdf"));
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    win.postMessage(wrap("window", REQ, { t: "away", ms: 60_000 }));
    win.postMessage(wrap("window", REQ, { t: "ready" }));
    await vi.waitFor(() => expect(saves).toEqual(["out.pdf", "out.pdf"]));
    win.postMessage(wrap("window", REQ, { t: "saved", name: "out.pdf" }));
    win.postMessage(wrap("window", REQ, { t: "done" }));
    await vi.waitFor(() => expect(s.ended).toBe(true));
    win.close();
  });
});

describe("WindowLink (cloud window)", () => {
  it("while away on a sign-in page: no heartbeat, but a cancel still goes out; back() resumes", async () => {
    let t = 0;
    const onToolLost = vi.fn();
    const link = new WindowLink(REQ, { onToolLost }, { Channel, now: () => t });
    const tool = peer();
    const got: string[] = [];
    tool.onmessage = (e) => got.push(e.data.t);
    link.away(60_000);
    t = TOOL_LOST_MS * 10;
    link.beat();
    expect(onToolLost).not.toHaveBeenCalled();
    link.back();
    await vi.waitFor(() => expect(got).toEqual(["away", "ready"]));
    link.cancel();
    await vi.waitFor(() => expect(got).toContain("cancel"));
    tool.close();
  });

  it("an error sent while away reaches the tool", async () => {
    const link = new WindowLink(REQ, {}, { Channel });
    const tool = peer();
    const got: string[] = [];
    tool.onmessage = (e) => got.push(e.data.t);
    link.away(60_000);
    link.send({ t: "error", code: "denied" });
    await vi.waitFor(() => expect(got).toEqual(["away", "error"]));
    link.close();
    tool.close();
  });

  it("says when the tool tab answers again after it was lost", async () => {
    let t = 0;
    const onToolLost = vi.fn();
    const onToolBack = vi.fn();
    const link = new WindowLink(REQ, { onToolLost, onToolBack }, { Channel, now: () => t });
    const tool = peer();
    t = TOOL_LOST_MS + 1;
    link.beat();
    expect(onToolLost).toHaveBeenCalledTimes(1);
    tool.postMessage(wrap("tool", REQ, { t: "pong" }));
    await vi.waitFor(() => expect(onToolBack).toHaveBeenCalledTimes(1));
    expect(link.toolLost).toBe(false);
    link.close();
    tool.close();
  });

  it("notices when the tool tab stops answering", () => {
    let t = 0;
    const onToolLost = vi.fn();
    const link = new WindowLink(REQ, { onToolLost }, { Channel, now: () => t });
    link.beat();
    t = TOOL_LOST_MS + 1;
    link.beat();
    expect(onToolLost).toHaveBeenCalledTimes(1);
    expect(link.toolLost).toBe(true);
    link.close();
  });

  it("finish() resolves when the tool acks", async () => {
    const link = new WindowLink(REQ, {}, { Channel });
    const tool = peer();
    tool.onmessage = (e) => {
      if (e.data.t === "done") tool.postMessage(wrap("tool", REQ, { t: "ack" }));
    };
    await expect(link.finish(2000)).resolves.toBe(true);
    link.close();
    tool.close();
  });

  it("finish() with no ack: false, and the tool counts as lost; a late ack brings it back and counts for the next finish()", async () => {
    const onToolLost = vi.fn();
    const onToolBack = vi.fn();
    const link = new WindowLink(REQ, { onToolLost, onToolBack }, { Channel });
    const tool = peer();
    await expect(link.finish(20)).resolves.toBe(false);
    expect(link.toolLost).toBe(true);
    expect(onToolLost).toHaveBeenCalledTimes(1);
    tool.postMessage(wrap("tool", REQ, { t: "ack" }));
    await vi.waitFor(() => expect(onToolBack).toHaveBeenCalledTimes(1));
    await expect(link.finish(20)).resolves.toBe(true);
    link.close();
    tool.close();
  });

  it("routes stop, retry and save from the tool; ignores other requests", async () => {
    const onStop = vi.fn();
    const onSave = vi.fn();
    const link = new WindowLink(REQ, { onStop, onSave }, { Channel });
    const tool = peer();
    const other = new FakeChannel(channelName("00000000-0000-4000-8000-000000000000"));
    other.postMessage(wrap("tool", "00000000-0000-4000-8000-000000000000", { t: "stop", id: "f1" }));
    tool.postMessage(wrap("tool", "00000000-0000-4000-8000-000000000000", { t: "stop", id: "f1" }));
    tool.postMessage(wrap("tool", REQ, { t: "stop", id: "f2" }));
    tool.postMessage(wrap("tool", REQ, { t: "save", file: new File(["x"], "a.pdf") }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith("f2");
    link.close();
    tool.close();
  });
});

describe("popupFeatures", () => {
  it("a 480x640 popup on desktop, a plain tab on phones", () => {
    const fine = () => ({ matches: false });
    expect(popupFeatures({ innerWidth: 1366, screenX: 0, screenY: 0, outerWidth: 1366, outerHeight: 768, matchMedia: fine })).toBe("popup,width=480,height=640,left=443,top=64");
    expect(popupFeatures({ innerWidth: 390, matchMedia: fine })).toBe("");
    expect(popupFeatures({ innerWidth: 1024, matchMedia: () => ({ matches: true }) })).toBe("");
  });
});
