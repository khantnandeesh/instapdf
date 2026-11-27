import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./pdfjs", () => ({ workerUrls: () => ["/w/pdf.worker.mjs", "/w/pdf.renderer.mjs"] }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("warmPdfjs on intent (eval G-8)", () => {
  it.each([
    [{ saveData: true }, 0],
    [{ effectiveType: "2g" }, 0],
    [{ effectiveType: "slow-2g" }, 0],
    [{ effectiveType: "4g" }, 2],
    [undefined, 2],
  ])("with the connection %o it fetches %i workers", async (connection, n) => {
    const fetch = vi.fn(async () => new Response("x"));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("navigator", { connection });
    const { warmPdfjs } = await import("./pdfjs-warm-intent");
    await warmPdfjs();
    expect(fetch).toHaveBeenCalledTimes(n);
  });
});
