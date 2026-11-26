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
import { buildDocuments, type BuildDocumentPlan } from "./build";
import { mergePdf, type MergeEnv, type MergeInput, type MergeSourceInput } from "./merge";
import type { MergeOptions } from "./merge-options";
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

/**
 * Split, Extract and Delete (spec F4/F5 §0a.4): one operation, "copy these
 * source pages, in this order, into new documents". One document downloads
 * as that PDF; two or more as one ZIP named `zipName`.
 */
export type DocumentsJob = {
  kind: "split" | "extract" | "delete";
  sources: MergeSourceInput[];
  documents: BuildDocumentPlan[];
  zipName: string;
  /** Remove bookmarks (spec §3a); everything else uses Merge's defaults. */
  options?: Pick<MergeOptions, "bookmarks">;
};

export type Job = RotateJob | MergeJob | DocumentsJob;

/**
 * The job for a plan from lib/page-plans.ts: its documents and download name,
 * with the loaded files as sources (PDFs).
 */
export function documentsJob(
  kind: DocumentsJob["kind"],
  plan: { documents: BuildDocumentPlan[]; download: { name: string } },
  files: readonly (JobFile & { id: string })[],
  options?: { removeBookmarks?: boolean },
): DocumentsJob {
  const used = new Set(plan.documents.flatMap((d) => d.pages.map((p) => p.sourceId)));
  return {
    kind,
    sources: files.filter((f) => used.has(f.id)).map((f) => ({ id: f.id, name: f.name, kind: "pdf", source: f.source, password: f.password })),
    documents: plan.documents.map((d) => ({ name: d.name, pages: d.pages })),
    zipName: plan.download.name,
    options: { bookmarks: options?.removeBookmarks ? "remove" : "keep" },
  };
}

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
