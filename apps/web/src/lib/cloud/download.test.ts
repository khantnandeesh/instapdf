import { describe, expect, it } from "vitest";
import { DownloadError, downloadFile, runPool } from "./download";

function streamResponse(chunks: Uint8Array[], init: ResponseInit & { failAfter?: number } = {}) {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (init.failAfter !== undefined && i >= init.failAfter) return c.error(new Error("reset"));
      if (i < chunks.length) c.enqueue(chunks[i++]);
      else c.close();
    },
  });
  return new Response(body, init);
}

describe("downloadFile", () => {
  it("streams into a File with rising progress and keeps name and type", async () => {
    const seen: number[] = [];
    const chunks = [new Uint8Array(4).fill(1), new Uint8Array(4).fill(2), new Uint8Array(2).fill(3)];
    const file = await downloadFile({ url: "https://x/a", name: "alpha.pdf", type: "application/pdf", total: 10 }, (l) => seen.push(l), undefined, async () => streamResponse(chunks));
    expect(file.name).toBe("alpha.pdf");
    expect(file.type).toBe("application/pdf");
    expect(file.size).toBe(10);
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3]);
    expect(seen).toEqual([0, 4, 8, 10, 10]);
  });

  it("names access errors and broken streams", async () => {
    await expect(downloadFile({ url: "u", name: "a" }, () => {}, undefined, async () => new Response("no", { status: 403 }))).rejects.toMatchObject({ kind: "access", status: 403 });
    await expect(downloadFile({ url: "u", name: "a" }, () => {}, undefined, async () => new Response("no", { status: 500 }))).rejects.toMatchObject({ kind: "network" });
    await expect(downloadFile({ url: "u", name: "a", total: 8 }, () => {}, undefined, async () => streamResponse([new Uint8Array(4)], { failAfter: 1 }))).rejects.toBeInstanceOf(DownloadError);
    // A body shorter than the reported size is a failure, not a truncated file.
    await expect(downloadFile({ url: "u", name: "a", total: 8 }, () => {}, undefined, async () => streamResponse([new Uint8Array(4)]))).rejects.toMatchObject({ kind: "network" });
    await expect(
      downloadFile({ url: "u", name: "a" }, () => {}, undefined, async () => {
        throw new TypeError("offline");
      }),
    ).rejects.toMatchObject({ kind: "network" });
  });
});

describe("runPool", () => {
  it("runs at most `limit` at a time and covers every item", async () => {
    let active = 0;
    let peak = 0;
    const done: number[] = [];
    await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      done.push(n);
      active--;
    });
    expect(peak).toBe(2);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
