import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A fake Worker: records posts and terminate(); never answers (a job "running" forever). */
class FakeWorker {
  static made: FakeWorker[] = [];
  terminated = false;
  posted: unknown[] = [];
  listeners = new Map<string, Set<(e: unknown) => void>>();
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  addEventListener(t: string, fn: (e: unknown) => void) {
    (this.listeners.get(t) ?? this.listeners.set(t, new Set()).get(t)!).add(fn);
  }
  removeEventListener(t: string, fn: (e: unknown) => void) {
    this.listeners.get(t)?.delete(fn);
  }
  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  FakeWorker.made = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

describe("Cancel stops the work (F25 §6)", () => {
  it("runInWorker: abort terminates the processing worker and rejects with AbortError", async () => {
    const { runInWorker } = await import("./worker-client");
    const ac = new AbortController();
    const job = runInWorker({} as never, { signal: ac.signal });
    expect(FakeWorker.made).toHaveLength(1);
    ac.abort();
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.made[0].terminated).toBe(true);
  });

  it("buildInWorker: abort terminates the build worker, rejects with AbortError and warms a fresh one when idle", async () => {
    const idle: (() => void)[] = [];
    vi.stubGlobal("requestIdleCallback", (fn: () => void) => idle.push(fn));
    const { buildInWorker } = await import("@/lib/editor/build-client");
    const ac = new AbortController();
    const build = buildInWorker({} as never, { signal: ac.signal });
    expect(FakeWorker.made).toHaveLength(1);
    ac.abort();
    await expect(build).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.made[0].terminated).toBe(true);
    // The fresh worker waits for an idle moment, so Cancel itself stays quick.
    expect(FakeWorker.made).toHaveLength(1);
    for (const fn of idle) fn();
    expect(FakeWorker.made).toHaveLength(2);
    expect(FakeWorker.made[1].posted).toEqual([{ id: 0, warm: true }]);
  });
});
