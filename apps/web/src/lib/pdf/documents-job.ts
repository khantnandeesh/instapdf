/**
 * The Split / Extract / Delete job for a plan (spec F4/F5 §0a.4), on its own so pages can build it
 * without pulling the PDF engine: this module imports types only. jobs.ts re-exports it.
 */
import type { BuildDocumentPlan } from "./build";
import type { MergeOptions } from "./merge-options";
import type { MergeSourceInput } from "./merge";

export type JobFile = { name: string; source: Blob; password?: string };

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

/**
 * The job for a plan from lib/page-plans.ts: its documents and download name,
 * with the loaded files as sources (PDFs). Only the sources a document uses are sent.
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
