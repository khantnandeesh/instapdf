import { describe, expect, it } from "vitest";
import { countBody, countingStream, earlyFetchAllowed, percent, type Progress } from "./engine-load";

function body(chunks: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const n of chunks) c.enqueue(new Uint8Array(n).fill(7));
      c.close();
    },
  });
}

describe("countingStream", () => {
  it("passes every byte through and reports a rising count up to the raw total", async () => {
    const seen: Progress[] = [];
    const out = body([100, 250, 650]).pipeThrough(countingStream(1000, (p) => seen.push(p)));
    const bytes = new Uint8Array(await new Response(out).arrayBuffer());
    expect(bytes.length).toBe(1000);
    expect(bytes.every((b) => b === 7)).toBe(true);
    expect(seen.map((p) => p.loaded)).toEqual([100, 350, 1000, 1000]);
    expect(seen.map(percent)).toEqual([10, 35, 100, 100]);
  });

  it("never reports more than the total, and ends at 100% even if the body was shorter", async () => {
    const seen: Progress[] = [];
    await new Response(body([600, 600]).pipeThrough(countingStream(1000, (p) => seen.push(p)))).arrayBuffer();
    expect(Math.max(...seen.map((p) => p.loaded))).toBe(1000);
    const short: Progress[] = [];
    await new Response(body([10]).pipeThrough(countingStream(1000, (p) => short.push(p)))).arrayBuffer();
    expect(percent(short.at(-1)!)).toBe(100);
  });
});

describe("countBody", () => {
  it("keeps status and the wasm type, and drops wire-only headers", async () => {
    const res = new Response(body([4, 4]), { status: 200, headers: { "content-type": "application/wasm", "content-length": "3", "content-encoding": "br" } });
    const seen: number[] = [];
    const counted = countBody(res, 8, (p) => seen.push(p.loaded));
    expect(counted.headers.get("content-type")).toBe("application/wasm");
    expect(counted.headers.get("content-length")).toBeNull();
    expect(counted.headers.get("content-encoding")).toBeNull();
    expect((await counted.arrayBuffer()).byteLength).toBe(8);
    expect(seen).toEqual([4, 8, 8]);
  });
});

describe("earlyFetchAllowed", () => {
  it("waits for a file on Data Saver or 2g", () => {
    expect(earlyFetchAllowed(undefined)).toBe(true);
    expect(earlyFetchAllowed({ effectiveType: "4g" })).toBe(true);
    expect(earlyFetchAllowed({ effectiveType: "3g" })).toBe(true);
    expect(earlyFetchAllowed({ effectiveType: "2g" })).toBe(false);
    expect(earlyFetchAllowed({ effectiveType: "slow-2g" })).toBe(false);
    expect(earlyFetchAllowed({ effectiveType: "4g", saveData: true })).toBe(false);
  });
});
