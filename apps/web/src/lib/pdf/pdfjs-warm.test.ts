import { afterEach, describe, expect, it, vi } from "vitest";

const loadPdfjs = vi.fn();
vi.mock("./pdfjs", () => ({ loadPdfjs, workerUrls: () => ["/w/pdf.worker.mjs", "/w/pdf.renderer.mjs"] }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  loadPdfjs.mockReset();
});

describe("warmPdfjs", () => {
  it("fetches both workers at the given priority and never evaluates pdf.js", async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit & { priority?: string }) => Promise<Response>>(async () => new Response("x"));
    vi.stubGlobal("fetch", fetch);
    const { warmPdfjs } = await import("./pdfjs-warm");
    await warmPdfjs("low");
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.priority])).toEqual([
      ["/w/pdf.worker.mjs", "low"],
      ["/w/pdf.renderer.mjs", "low"],
    ]);
    expect(loadPdfjs).not.toHaveBeenCalled();
  });

  it("warms once, and again after a failure", async () => {
    const fetch = vi.fn(async (): Promise<Response> => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetch);
    const { warmPdfjs } = await import("./pdfjs-warm");
    await warmPdfjs();
    await warmPdfjs();
    expect(fetch).toHaveBeenCalledTimes(4);
    fetch.mockImplementation(async () => new Response("x"));
    await warmPdfjs();
    await warmPdfjs();
    expect(fetch).toHaveBeenCalledTimes(6);
  });
});
