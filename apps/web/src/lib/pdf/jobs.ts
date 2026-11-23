/**
 * Processing jobs that run inside the processing Web Worker
 * (`processing.worker.ts`). Kept free of worker globals so they are unit tested.
 */
import { pdfOutputName, uniqueNames } from "./naming";
import { rotatePdf } from "./rotate";
import { buildZip } from "./zip";

export type JobFile = { name: string; buffer: ArrayBuffer; password?: string };

export type RotateJob = {
  kind: "rotate";
  files: (JobFile & { deltas: number[] })[];
  /** Used when there are two or more files. */
  zipName: string;
};

export type Job = RotateJob;

export type JobOutput = {
  name: string;
  type: "application/pdf" | "application/zip";
  bytes: Uint8Array;
  /** Page count of a single-PDF output. */
  pageCount?: number;
  /** ZIP entries (name and page count), in order. */
  entries?: { name: string; pageCount: number }[];
  /** True when any input was encrypted (the output never is). */
  wasEncrypted: boolean;
};

export type ProgressFn = (fraction: number) => void;

export async function runJob(job: Job, onProgress: ProgressFn): Promise<JobOutput> {
  switch (job.kind) {
    case "rotate":
      return runRotate(job, onProgress);
  }
}

async function runRotate(job: RotateJob, onProgress: ProgressFn): Promise<JobOutput> {
  const totalWeight = job.files.reduce((sum, f) => sum + Math.max(1, f.deltas.length), 0);
  let done = 0;
  onProgress(0);
  const results: { name: string; bytes: Uint8Array; pageCount: number }[] = [];
  let wasEncrypted = false;
  for (const file of job.files) {
    const r = await rotatePdf({ bytes: new Uint8Array(file.buffer), deltas: file.deltas, password: file.password });
    wasEncrypted ||= r.wasEncrypted;
    results.push({ name: pdfOutputName(file.name), bytes: r.bytes, pageCount: r.pageCount });
    done += Math.max(1, file.deltas.length);
    onProgress(done / totalWeight);
  }
  if (results.length === 1) {
    const [only] = results;
    return { name: only.name, type: "application/pdf", bytes: only.bytes, pageCount: only.pageCount, wasEncrypted };
  }
  const zip = buildZip(results);
  const names = uniqueNames(results.map((r) => r.name));
  return {
    name: job.zipName,
    type: "application/zip",
    bytes: zip,
    entries: results.map((r, i) => ({ name: names[i], pageCount: r.pageCount })),
    wasEncrypted,
  };
}
