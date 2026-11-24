/**
 * The shaping build (engine-client): it loads only on an explicit open, never with the idle
 * preload, in a fresh worker that takes over; its download has its own status and retry; the hang
 * watchdog waits for it; closing the file returns to the default build. A fake Worker stands in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Msg = Record<string, unknown> & { id: number; op: string };
class FakeWorker {
  static last: FakeWorker | null = null;
  sent: Msg[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault(): void }) => void) | null = null;
  terminated = false;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: Msg) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data });
  }
}

let client: typeof import("./engine-client");
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeWorker.last = null;
  vi.stubGlobal("Worker", FakeWorker);
  client = await import("./engine-client");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const w = () => FakeWorker.last!;
const progress = (variant: "base" | "shaping", ready = false, loaded = 10) => ({ id: 0, progress: { loaded, total: 100 }, ready, variant });

describe("shaping build", () => {
  it("is never asked for by the idle preload or a plain open", async () => {
    void client.preloadEngine("low");
    void client.callEngine({ op: "open", bytes: new Uint8Array(4) });
    expect(w().sent.map((m) => m.op)).toEqual(["load", "open"]);
    expect(w().sent.some((m) => "shaping" in m)).toBe(false);
    expect(client.getShapingStatus().state).toBe("idle");
  });

  it("loads in a fresh worker that takes over, counts its own progress, and re-registers fonts", async () => {
    void client.callEngine({ op: "open", bytes: new Uint8Array(4) });
    const first = w();
    first.reply(progress("base", true, 100));
    first.reply({ id: first.sent[0].id, ok: true, reply: { op: "open", pageCount: 1 } });
    const add = client.callEngine({ op: "addFont", family: "Tinos", bold: false, italic: false, bytes: new Uint8Array(3) });
    first.reply({ id: first.sent[1].id, ok: true, reply: { op: "addFont", ok: true } });
    await add;
    const up = client.openInShapingEngine(new Uint8Array(4));
    const next = w();
    expect(next).not.toBe(first);
    expect(next.sent[0]).toMatchObject({ op: "open", shaping: true });
    expect(client.getShapingStatus().state).toBe("loading");
    next.reply(progress("shaping", false, 40));
    expect(client.getShapingStatus()).toMatchObject({ state: "loading", loaded: 40 });
    // The default build's status is untouched by the shaping download.
    expect(client.getEngineStatus().state).toBe("ready");
    next.reply(progress("shaping", true, 100));
    next.reply({ id: next.sent[0].id, ok: true, reply: { op: "open", pageCount: 1 } });
    await vi.waitFor(() => expect(next.sent[1]).toMatchObject({ op: "addFont", family: "Tinos" }));
    next.reply({ id: next.sent[1].id, ok: true, reply: { op: "addFont", ok: true } });
    await up;
    expect(client.isShapingActive()).toBe(true);
    // The old worker (and the default build's memory) is gone; calls go to the new one.
    expect(first.terminated).toBe(true);
    void client.callEngine({ op: "text", page: 0 });
    expect(next.sent[2]).toMatchObject({ op: "text" });
  });

  it("a recovery open says which build it wants; closing the file returns to the default build", async () => {
    void client.callEngine({ op: "open", bytes: new Uint8Array(4), shaping: true });
    w().reply(progress("shaping", true, 100));
    w().reply({ id: w().sent[0].id, ok: true, reply: { op: "open", pageCount: 1 } });
    await vi.waitFor(() => expect(client.isShapingActive()).toBe(true));
    client.disposeEngine();
    expect(client.isShapingActive()).toBe(false);
    expect(client.getShapingStatus().state).toBe("idle");
    // The next file: a plain open, in the default build, with its own ring.
    void client.callEngine({ op: "open", bytes: new Uint8Array(4) });
    expect(w().sent[0]).toMatchObject({ op: "open" });
    expect(w().sent[0]).not.toHaveProperty("shaping");
    expect(client.getEngineStatus().state).toBe("loading");
    expect(client.getShapingStatus().state).toBe("idle");
  });

  it("the watchdog waits while the shaping build downloads", async () => {
    void client.callEngine({ op: "open", bytes: new Uint8Array(4) });
    const first = w();
    first.reply(progress("base", true, 100));
    first.reply({ id: first.sent[0].id, ok: true, reply: { op: "open", pageCount: 1 } });
    const up = client.openInShapingEngine(new Uint8Array(4)).catch((e) => e);
    const next = w();
    // A slow download is not a hang.
    vi.advanceTimersByTime(120_000);
    expect(next.terminated).toBe(false);
    next.reply(progress("shaping", true, 100));
    // Compiled: now the call is timed. A hang drops only the new worker; the document stays open.
    vi.advanceTimersByTime(60_000);
    expect(await up).toEqual({ kind: "crashed" });
    expect(next.terminated).toBe(true);
    expect(first.terminated).toBe(false);
    expect(client.getShapingStatus().state).toBe("failed");
  });

  it("a failed download says so, keeps the default build, and a retry loads it", async () => {
    void client.callEngine({ op: "open", bytes: new Uint8Array(4) });
    const first = w();
    first.reply(progress("base", true, 100));
    first.reply({ id: first.sent[0].id, ok: true, reply: { op: "open", pageCount: 1 } });
    const attempt = client.openInShapingEngine(new Uint8Array(4));
    const failed = w();
    failed.reply({ id: failed.sent[0].id, ok: false, error: { kind: "internal", message: "engine 503" } });
    await expect(attempt).rejects.toMatchObject({ kind: "internal" });
    expect(failed.terminated).toBe(true);
    expect(client.getShapingStatus().state).toBe("failed");
    expect(client.getEngineStatus().state).toBe("ready");
    expect(client.isShapingActive()).toBe(false);
    // Later calls still go to the default build, in the first worker (dropped when the swap ends it).
    const text = client.callEngine({ op: "text", page: 0 }).catch((e) => e);
    expect(first.sent[1]).toMatchObject({ op: "text" });
    const retry = client.openInShapingEngine(new Uint8Array(4));
    const next = w();
    expect(client.getShapingStatus().state).toBe("loading");
    next.reply(progress("shaping", true, 100));
    next.reply({ id: next.sent[0].id, ok: true, reply: { op: "open", pageCount: 1 } });
    await retry;
    expect(client.isShapingActive()).toBe(true);
    expect(await text).toEqual({ kind: "aborted" });
  });
});
