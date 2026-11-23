/**
 * Processing jobs that run inside the processing Web Worker
 * (`processing.worker.ts`). Kept free of worker globals so they are unit tested.
 *
 * Memory: inputs arrive as Blobs (no copy on the main thread) and are read one
 * at a time; each output is handed off (single PDF) or streamed into the ZIP
 * before the next input is read, so at most one input and one output are held.
 */
import { pdfOutputName, uniqueNames } from "./naming";
import { rotatePdf } from "./rotate";
import { createZipWriter } from "./zip";

export type JobFile = { name: string; source: Blob; password?: string };

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
  blob: Blob;
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
  const weights = job.files.map((f) => Math.max(1, f.deltas.length));
  const total = weights.reduce((a, b) => a + b, 0);
  let done = 0;
  onProgress(0);
  let wasEncrypted = false;

  const rotateOne = async (file: RotateJob["files"][number]) => {
    const r = await rotatePdf({ bytes: new Uint8Array(await file.source.arrayBuffer()), deltas: file.deltas, password: file.password });
    wasEncrypted ||= r.wasEncrypted;
    return r;
  };

  if (job.files.length === 1) {
    const [file] = job.files;
    const r = await rotateOne(file);
    onProgress(1);
    return {
      name: pdfOutputName(file.name),
      type: "application/pdf",
      blob: new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      pageCount: r.pageCount,
      wasEncrypted,
    };
  }

  const names = uniqueNames(job.files.map((f) => pdfOutputName(f.name)));
  const zip = createZipWriter();
  const entries: { name: string; pageCount: number }[] = [];
  for (let i = 0; i < job.files.length; i++) {
    const r = await rotateOne(job.files[i]);
    zip.add(names[i], r.bytes); // copied into the ZIP Blob; r.bytes can be collected now
    entries.push({ name: names[i], pageCount: r.pageCount });
    done += weights[i];
    onProgress(done / total);
  }
  return { name: job.zipName, type: "application/zip", blob: zip.finish(), entries, wasEncrypted };
}
