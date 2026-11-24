/**
 * Processing jobs that run inside the processing Web Worker
 * (`processing.worker.ts`). Kept free of worker globals so they are unit tested.
 *
 * Memory: inputs arrive as Blobs (no copy on the main thread). Rotate reads
 * them one at a time and hands each output off (single PDF) or streams it into
 * the ZIP before reading the next, so one input and one output are held. Merge
 * builds one output: each source is parsed at its first use and released after
 * its last page is copied (see merge.ts), so only the sources still to come
 * stay parsed next to the growing output.
 */
export { USER_ERROR } from "./user-error";
import { mergePdf, type MergeEnv, type MergeInput } from "./merge";
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

export type MergeJob = { kind: "merge"; name: string } & MergeInput;

export type Job = RotateJob | MergeJob;

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
  /** Non-blocking notes for the user about the result. */
  warnings?: string[];
};

/** `phase` "fonts" = a font download (indeterminate); "pages" = back to the fraction. */
export type ProgressFn = (fraction: number, phase?: "fonts" | "pages") => void;

/** What only the worker can provide (font fetches, browser image decoding). Absent in unit tests unless stubbed. */
export type JobEnv = Omit<MergeEnv, "onPhase">;

export async function runJob(job: Job, onProgress: ProgressFn, env: JobEnv = {}): Promise<JobOutput> {
  switch (job.kind) {
    case "rotate":
      return runRotate(job, onProgress);
    case "merge":
      return runMerge(job, onProgress, env);
  }
}

async function runMerge(job: MergeJob, onProgress: ProgressFn, env: JobEnv): Promise<JobOutput> {
  let phase: "fonts" | "pages" = "pages";
  let last = 0;
  const r = await mergePdf(job, { ...env, onPhase: (p) => onProgress(last, (phase = p)) }, (f) => onProgress((last = f), phase));
  return {
    name: job.name,
    type: "application/pdf",
    blob: new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    pageCount: r.pageCount,
    wasEncrypted: r.wasEncrypted,
    warnings: r.warnings,
  };
}

async function runRotate(job: RotateJob, onProgress: ProgressFn): Promise<JobOutput> {
  const weights = job.files.map((f) => Math.max(1, f.deltas.length));
  const total = weights.reduce((a, b) => a + b, 0);
  let done = 0;
  onProgress(0);
  let wasEncrypted = false;

  /** Reports progress inside file `i`, so the bar moves during long single-file runs (F1 eval G-2). */
  const within = (i: number) => (fraction: number) => onProgress(Math.min(0.99, (done + weights[i] * fraction) / total));

  const rotateOne = async (file: RotateJob["files"][number], i: number) => {
    const bytes = new Uint8Array(await file.source.arrayBuffer());
    within(i)(0.1);
    const r = await rotatePdf({ bytes, deltas: file.deltas, password: file.password }, (f) => within(i)(0.1 + 0.9 * f));
    wasEncrypted ||= r.wasEncrypted;
    return r;
  };

  if (job.files.length === 1) {
    const [file] = job.files;
    const r = await rotateOne(file, 0);
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
    const r = await rotateOne(job.files[i], i);
    zip.add(names[i], r.bytes); // copied into the ZIP Blob; r.bytes can be collected now
    entries.push({ name: names[i], pageCount: r.pageCount });
    done += weights[i];
    onProgress(done / total);
  }
  return { name: job.zipName, type: "application/zip", blob: zip.finish(), entries, wasEncrypted };
}
