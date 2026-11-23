/// <reference lib="webworker" />
/**
 * Processing Web Worker: runs browser tools off the main thread.
 * Files arrive as Blobs (passed by reference) and never leave the device.
 */
import { runJob, type Job, type JobOutput } from "./jobs";

export type WorkerRequest = { id: number; job: Job };
export type WorkerResponse =
  | { id: number; type: "progress"; value: number }
  | { id: number; type: "done"; output: JobOutput }
  | { id: number; type: "error"; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, job } = event.data;
  const post = (msg: WorkerResponse) => scope.postMessage(msg);
  try {
    let last = 0;
    const output = await runJob(job, (value) => {
      const now = performance.now();
      if (value < 1 && now - last < 16) return; // at most one update per frame
      last = now;
      post({ id, type: "progress", value });
    });
    post({ id, type: "done", output });
  } catch (error) {
    // Log the failure without any file content.
    const message = error instanceof Error ? error.message : String(error);
    post({ id, type: "error", message });
  }
};
