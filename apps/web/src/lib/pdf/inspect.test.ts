import { afterEach, describe, expect, it, vi } from "vitest";

const NONE = { signed: false, outputIntents: false, structTree: false };

afterEach(() => vi.unstubAllGlobals());
// A fresh module each time: its scan worker is module state.
const load = async () => {
  vi.resetModules();
  return import("./inspect");
};

describe("scanOnce", () => {
  it("scans a file once, however often its load is retried (a password retry)", async () => {
    const { inspector, scanOnce } = await load();
    let started = 0;
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((e: { data: unknown }) => void) | null = null;
        onerror: (() => void) | null = null;
        onmessageerror: (() => void) | null = null;
        postMessage({ id }: { id: number }) {
          started++;
          queueMicrotask(() => this.onmessage?.({ data: { id, markers: { ...NONE, signed: true } } }));
        }
        terminate() {}
      },
    );
    const file = new Blob(["%PDF-1.7"]);
    const first = inspector.scan(file);
    expect(inspector.scan(file)).toBe(first);
    expect(scanOnce(file)).toBe(first);
    await expect(first).resolves.toEqual({ ...NONE, signed: true });
    expect(started).toBe(1);
    // Another file is its own scan.
    await scanOnce(new Blob(["%PDF-1.4"]));
    expect(started).toBe(2);
  });

  it("never rejects: a worker that cannot start gives no markers", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("blocked");
        }
      },
    );
    const { scanOnce } = await load();
    await expect(scanOnce(new Blob(["x"]))).resolves.toEqual(NONE);
  });
});
