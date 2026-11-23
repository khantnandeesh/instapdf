/// <reference lib="webworker" />
/**
 * Processing Web Worker: runs browser tools off the main thread.
 * Files arrive as transferred ArrayBuffers and never leave the device.
 */
import { runJob, type Job, type JobOutput } from "./jobs";

export type WorkerRequest = { id: number; job: Job; fault?: boolean };
export type WorkerResponse =
  | { id: number; type: "progress"; value: number }
  | { id: number; type: "done"; output: JobOutput }
  | { id: number; type: "error"; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, job, fault } = event.data;
  const post = (msg: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);
  try {
    if (fault) throw new Error("Injected test fault");
    let last = 0;
    const output = await runJob(job, (value) => {
      const now = performance.now();
      if (value < 1 && now - last < 16) return; // at most one update per frame
      last = now;
      post({ id, type: "progress", value });
    });
    post({ id, type: "done", output }, [output.bytes.buffer as ArrayBuffer]);
  } catch (error) {
    // Log the failure without any file content.
    const message = error instanceof Error ? error.message : String(error);
    post({ id, type: "error", message });
  }
};
