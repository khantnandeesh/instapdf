import { describe, expect, it, vi } from "vitest";
import type { PillProgress } from "@/components/tool-flow/announce";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { runServerJob, type JobApi, type JobStatus } from "./server-job";

function fakeApi(statuses: JobStatus[]): JobApi & { cancelled: string[] } {
  const cancelled: string[] = [];
  return {
    cancelled,
    async create(_input, onUpload) {
      onUpload(0.5);
      onUpload(1);
      return { id: "j1" };
    },
    async status() {
      return statuses.shift() ?? { state: "working" };
    },
    async result() {
      return new Blob(["%PDF"]);
    },
    async cancel(id) {
      cancelled.push(id);
      return true;
    },
  };
}

const input = { tool: "compress-pdf", files: [{ name: "a.pdf", blob: new Blob(["x"]) }], options: {} };

describe("runServerJob (F25 §6 server phases)", () => {
  it("reports upload, queue, work, then returns the result; registers Cancel once the job exists", async () => {
    const api = fakeApi([{ state: "queued", position: 3, etaSeconds: 90 }, { state: "working", progress: 0.4 }, { state: "done", url: "/r", name: "a-compressed.pdf" }]);
    const phases: PillProgress[] = [];
    const onCancel = vi.fn();
    const out = await runServerJob(api, input, { signal: new AbortController().signal, onPhase: (p) => phases.push(p), onCancel, pollMs: 0 });
    expect(phases.map((p) => p.phase)).toEqual(["upload", "upload", "upload", "queue", "work"]);
    expect(phases[3]).toMatchObject({ position: 3, etaSeconds: 90 });
    expect(out.name).toBe("a-compressed.pdf");
    expect(onCancel).toHaveBeenCalledTimes(1);
    await onCancel.mock.calls[0][0]();
    expect(api.cancelled).toEqual(["j1"]);
  });

  it("a failed job throws the server's message as a user-facing error", async () => {
    const api = fakeApi([{ state: "failed", message: "Server tools are paused until tomorrow." }]);
    await expect(runServerJob(api, input, { signal: new AbortController().signal, onPhase: () => {}, onCancel: () => {}, pollMs: 0 })).rejects.toThrow(USER_ERROR + "Server tools are paused until tomorrow.");
  });

  it("stops polling at once on abort", async () => {
    const api = fakeApi([{ state: "queued", position: 9 }]);
    const ac = new AbortController();
    const run = runServerJob(api, input, { signal: ac.signal, onPhase: (p) => p.phase === "queue" && ac.abort(), onCancel: () => {}, pollMs: 60_000 });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
  });
});
