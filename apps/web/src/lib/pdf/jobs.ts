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
import { buildDocuments } from "./build";
import { mergePdf, type MergeEnv, type MergeInput } from "./merge";
import { pdfOutputName, uniqueNames } from "./naming";
import { protectPdf, unlockPdf, type ProtectOptions } from "./protect";
import { rotatePdf } from "./rotate";
import { USER_ERROR } from "./user-error";
import { createZipWriter } from "./zip";
import type { DocumentsJob, JobFile } from "./documents-job";
export { documentsJob, type DocumentsJob, type JobFile } from "./documents-job";

export type RotateJob = {
  kind: "rotate";
  files: (JobFile & { deltas: number[] })[];
  /** Used when there are two or more files. */
  zipName: string;
};

export type MergeJob = { kind: "merge"; name: string } & MergeInput;

/** Protect (F11): every file encrypted with the same passwords and restrictions. */
export type ProtectJob = { kind: "protect"; files: JobFile[]; zipName: string; options: ProtectOptions };
/** Unlock (F11): every file saved with no password and no restrictions. */
export type UnlockJob = { kind: "unlock"; files: JobFile[]; zipName: string };

export type Job = RotateJob | MergeJob | DocumentsJob | ProtectJob | UnlockJob;

export type JobOutput = {
  name: string;
  type: "application/pdf" | "application/zip";
  blob: Blob;
  /** Page count of a single-PDF output. */
  pageCount?: number;
  /** ZIP entries (name and page count), in order. */
  entries?: { name: string; pageCount: number }[];
  /** True when any input was encrypted and the output is not (Protect's output is, so it says false). */
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
    case "protect":
      // The output is encrypted, so "this copy has no password" never applies.
      return { ...(await runPerFile(job.files, job.zipName, onProgress, async (bytes, file) => protectPdf({ bytes, password: file.password, options: job.options }))), wasEncrypted: false };
    case "unlock": {
      const out = await runPerFile(job.files, job.zipName, onProgress, (bytes, file) => unlockPdf({ bytes, password: file.password }));
      if (!out.wasEncrypted) throw new Error(`${USER_ERROR}${job.files.length === 1 ? "This PDF has" : "These PDFs have"} no password or restrictions, so there is nothing to remove.`);
      // Removing the password is the point here, not a side effect to warn about.
      return { ...out, wasEncrypted: false };
    }
    case "split":
    case "extract":
    case "delete":
      return runDocuments(job, onProgress, env);
  }
}

async function runDocuments(job: DocumentsJob, onProgress: ProgressFn, env: JobEnv): Promise<JobOutput> {
  // Only documents with pages are written (buildDocuments skips the others), so
  // they alone decide between one PDF and a ZIP.
  const written = job.documents.filter((d) => d.pages.length);
  const names = uniqueNames(written.map((d) => d.name));
  const documents = written.map((d, i) => ({ ...d, name: names[i] }));
  const progress = (f: number) => onProgress(f, "pages");
  if (documents.length === 1) {
    const r = await buildDocuments({ sources: job.sources, documents, options: job.options }, env, progress);
    const [doc] = r.documents;
    return {
      name: doc.name,
      type: "application/pdf",
      blob: new Blob([doc.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      pageCount: doc.pageCount,
      wasEncrypted: r.wasEncrypted,
      ...(r.warnings.length ? { warnings: r.warnings } : {}),
    };
  }
  const zip = createZipWriter();
  const entries: { name: string; pageCount: number }[] = [];
  const r = await buildDocuments({ sources: job.sources, documents, options: job.options }, env, progress, (doc) => {
    zip.add(doc.name, doc.bytes); // copied into the ZIP Blob; doc.bytes can be collected now
    entries.push({ name: doc.name, pageCount: doc.pageCount });
  });
  return {
    name: job.zipName,
    type: "application/zip",
    blob: zip.finish(),
    entries,
    wasEncrypted: r.wasEncrypted,
    ...(r.warnings.length ? { warnings: r.warnings } : {}),
  };
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

type FileResult = { bytes: Uint8Array; pageCount: number; wasEncrypted: boolean };

/**
 * One output per input file, each kept under its own name: a single PDF, or a ZIP of them. `weights`
 * share the progress bar between files; `work` reports progress inside its file (F1 eval G-2).
 */
async function runPerFile<F extends JobFile>(
  files: readonly F[],
  zipName: string,
  onProgress: ProgressFn,
  work: (bytes: Uint8Array, file: F, progress: (fraction: number) => void) => Promise<FileResult>,
  weights: number[] = files.map(() => 1),
): Promise<JobOutput> {
  const total = weights.reduce((a, b) => a + b, 0);
  let done = 0;
  onProgress(0);
  let wasEncrypted = false;
  const one = async (file: F, i: number) => {
    const within = (fraction: number) => onProgress(Math.min(0.99, (done + weights[i] * fraction) / total));
    const bytes = new Uint8Array(await file.source.arrayBuffer());
    within(0.1);
    const r = await work(bytes, file, (f) => within(0.1 + 0.9 * f));
    wasEncrypted ||= r.wasEncrypted;
    return r;
  };

  if (files.length === 1) {
    const r = await one(files[0], 0);
    onProgress(1);
    return {
      name: pdfOutputName(files[0].name),
      type: "application/pdf",
      blob: new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      pageCount: r.pageCount,
      wasEncrypted,
    };
  }

  const names = uniqueNames(files.map((f) => pdfOutputName(f.name)));
  const zip = createZipWriter();
  const entries: { name: string; pageCount: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const r = await one(files[i], i);
    zip.add(names[i], r.bytes); // copied into the ZIP Blob; r.bytes can be collected now
    entries.push({ name: names[i], pageCount: r.pageCount });
    done += weights[i];
    onProgress(done / total);
  }
  return { name: zipName, type: "application/zip", blob: zip.finish(), entries, wasEncrypted };
}

const runRotate = (job: RotateJob, onProgress: ProgressFn): Promise<JobOutput> =>
  runPerFile(
    job.files,
    job.zipName,
    onProgress,
    (bytes, file, progress) => rotatePdf({ bytes, deltas: file.deltas, password: file.password }, progress),
    job.files.map((f) => Math.max(1, f.deltas.length)),
  );
