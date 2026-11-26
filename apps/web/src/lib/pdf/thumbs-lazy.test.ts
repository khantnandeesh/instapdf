import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("./thumbnails", () => ({
  ThumbnailRenderer: class {
    register(id: string) {
      calls.push(`register ${id}`);
    }
    registerImage(id: string) {
      calls.push(`image ${id}`);
    }
    unregister(id: string) {
      calls.push(`unregister ${id}`);
    }
    request(id: string, index: number, _size: number, _priority: number, onDone: (c: HTMLCanvasElement) => void) {
      calls.push(`request ${id}:${index}`);
      onDone({} as HTMLCanvasElement);
      return () => calls.push(`cancel ${id}:${index}`);
    }
  },
}));

import { LazyThumbnails } from "./thumbs-lazy";

describe("LazyThumbnails", () => {
  it("runs calls made before the renderer arrives in order, skips a request cancelled meanwhile, then forwards directly", async () => {
    calls.length = 0;
    const t = new LazyThumbnails();
    const done = vi.fn();
    t.register("a", {} as never);
    t.request("a", 0, 100, 1, done);
    const cancel = t.request("a", 1, 100, 1, done);
    cancel();
    t.registerImage("b", new Blob(), "png", [{ width: 1, height: 1 }]);
    await t.load();
    expect(calls).toEqual(["register a", "request a:0", "image b"]);
    expect(done).toHaveBeenCalledTimes(1);
    const stop = t.request("b", 0, 100, 1, done);
    stop();
    t.unregister("a");
    expect(calls.slice(3)).toEqual(["request b:0", "cancel b:0", "unregister a"]);
  });
});
