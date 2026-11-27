import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A stand-in Worker: records what it is sent and lets the test answer. */
class FakeWorker {
  static all: FakeWorker[] = [];
  sent: { id: number; [k: string]: unknown }[] = [];
  terminated = false;
  private handlers: ((e: MessageEvent) => void)[] = [];
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: { id: number }) {
    this.sent.push(m);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    if (type === "message") this.handlers.push(fn);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    for (const h of this.handlers) h({ data } as MessageEvent);
  }
}

async function load() {
  vi.resetModules();
  return import("./build-client");
}

describe("build-client (F25 Cancel)", () => {
  beforeEach(() => {
    FakeWorker.all = [];
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("requestIdleCallback", (fn: () => void) => (fn(), 1));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("cancelling a build rejects only the build; a form read in flight moves to a fresh worker and answers", async () => {
    const m = await load();
    const ac = new AbortController();
    const build = m.buildInWorker({ bytes: new Uint8Array(1) } as never, { signal: ac.signal });
    const forms = m.readFormsInWorker(new Uint8Array(2));
    const [first] = FakeWorker.all;
    const formsId = first!.sent[1]!.id;
    ac.abort();
    await expect(build).rejects.toMatchObject({ name: "AbortError" });
    expect(first!.terminated).toBe(true);
    const second = FakeWorker.all[1]!;
    expect(second.sent).toEqual([expect.objectContaining({ id: formsId, forms: expect.anything() })]);
    second.reply({ id: formsId, ok: true, forms: { fields: [] }, xfa: false });
    await expect(forms).resolves.toEqual({ forms: { fields: [] }, xfa: false });
  });

  it("with nothing else in flight, a cancel warms the next worker on idle", async () => {
    const m = await load();
    const ac = new AbortController();
    const build = m.buildInWorker({ bytes: new Uint8Array(1) } as never, { signal: ac.signal });
    ac.abort();
    await expect(build).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.all).toHaveLength(2);
    expect(FakeWorker.all[1]!.sent).toEqual([{ id: 0, warm: true }]);
  });

  it("closing the editor rejects every request with an AbortError", async () => {
    const m = await load();
    const build = m.buildInWorker({ bytes: new Uint8Array(1) } as never);
    const owner = m.checkOwnerPassword(new Uint8Array(1), "pw");
    m.disposeBuild();
    await expect(build).rejects.toMatchObject({ name: "AbortError", message: "closed" });
    await expect(owner).rejects.toMatchObject({ name: "AbortError" });
  });
});
