/**
 * The shaping build in the one engine worker (engine-client): it loads only on an explicit open,
 * never with the idle preload; its download has its own status and retry; the hang watchdog waits
 * for it; once open there, later opens (a crash recovery) stay on it. A fake Worker stands in.
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

  it("loads on an open in it, counts its own progress, and later opens stay on it", async () => {
    void client.callEngine({ op: "open", bytes: new Uint8Array(4) });
    w().reply(progress("base", true, 100));
    w().reply({ id: w().sent[0].id, ok: true, reply: { op: "open", pageCount: 1 } });
    const up = client.openInShapingEngine(new Uint8Array(4));
    const msg = w().sent[1];
    expect(msg).toMatchObject({ op: "open", shaping: true });
    expect(client.getShapingStatus().state).toBe("loading");
    w().reply(progress("shaping", false, 40));
    expect(client.getShapingStatus()).toMatchObject({ state: "loading", loaded: 40 });
    // The default build's status is untouched by the shaping download.
    expect(client.getEngineStatus().state).toBe("ready");
    w().reply(progress("shaping", true, 100));
    w().reply({ id: msg.id, ok: true, reply: { op: "open", pageCount: 1 } });
    await up;
    expect(client.isShapingActive()).toBe(true);
    // A recovery open after a crash goes to the shaping build too.
    void client.callEngine({ op: "open", bytes: new Uint8Array(4) });
    expect(w().sent[2]).toMatchObject({ op: "open", shaping: true });
  });

  it("the watchdog waits while the shaping build downloads", async () => {
    void client.callEngine({ op: "open", bytes: new Uint8Array(4) });
    w().reply(progress("base", true, 100));
    w().reply({ id: w().sent[0].id, ok: true, reply: { op: "open", pageCount: 1 } });
    const up = client.openInShapingEngine(new Uint8Array(4)).catch((e) => e);
    // A slow download is not a hang.
    vi.advanceTimersByTime(120_000);
    expect(w().terminated).toBe(false);
    w().reply(progress("shaping", true, 100));
    // Compiled: now the call is timed.
    vi.advanceTimersByTime(60_000);
    expect(await up).toEqual({ kind: "crashed" });
  });

  it("a failed download says so, keeps the default build, and a retry loads it", async () => {
    void client.callEngine({ op: "open", bytes: new Uint8Array(4) });
    w().reply(progress("base", true, 100));
    w().reply({ id: w().sent[0].id, ok: true, reply: { op: "open", pageCount: 1 } });
    const first = client.openInShapingEngine(new Uint8Array(4));
    w().reply({ id: w().sent[1].id, ok: false, error: { kind: "internal", message: "engine 503" } });
    await expect(first).rejects.toMatchObject({ kind: "internal" });
    expect(client.getShapingStatus().state).toBe("failed");
    expect(client.getEngineStatus().state).toBe("ready");
    expect(client.isShapingActive()).toBe(false);
    // Later calls still go to the default build.
    void client.callEngine({ op: "text", page: 0 });
    expect(w().sent[2]).not.toHaveProperty("shaping");
    const retry = client.openInShapingEngine(new Uint8Array(4));
    expect(client.getShapingStatus().state).toBe("loading");
    w().reply(progress("shaping", true, 100));
    w().reply({ id: w().sent[3].id, ok: true, reply: { op: "open", pageCount: 1 } });
    await retry;
    expect(client.isShapingActive()).toBe(true);
  });
});
