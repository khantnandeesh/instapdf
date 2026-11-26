/**
 * Runs a Split, Extract or Delete plan in the processing worker (spec F4/F5 §0a.4).
 *
 * `pageToolJob` builds the same job as `documentsJob` in lib/pdf/jobs.ts. It is repeated here
 * because importing jobs.ts at run time on the page would bring the whole PDF engine (merge,
 * build, pdf-lib) into the tool's first load; job.test.ts checks the two stay identical.
 */
import type { OutputPlan } from "@/lib/page-plans";
import type { DocumentsJob } from "@/lib/pdf/jobs";
import { runInWorker } from "@/lib/pdf/worker-client";
import type { ReadyFile, ToolOutput } from "../tool-flow/types";

type JobFile = { id: string; name: string; source: Blob; password?: string };

export function pageToolJob(kind: DocumentsJob["kind"], plan: Pick<OutputPlan, "documents" | "download">, files: readonly JobFile[], options?: { removeBookmarks?: boolean }): DocumentsJob {
  const used = new Set(plan.documents.flatMap((d) => d.pages.map((p) => p.sourceId)));
  return {
    kind,
    sources: files.filter((f) => used.has(f.id)).map((f) => ({ id: f.id, name: f.name, kind: "pdf", source: f.source, password: f.password })),
    documents: plan.documents.map((d) => ({ name: d.name, pages: d.pages })),
    zipName: plan.download.name,
    options: { bookmarks: options?.removeBookmarks ? "remove" : "keep" },
  };
}

/** The ToolFlow `process` for a plan: one PDF, or one ZIP of several. */
export async function runPlan(
  kind: DocumentsJob["kind"],
  plan: OutputPlan,
  files: readonly ReadyFile[],
  removeBookmarks: boolean,
  signal: AbortSignal,
  onProgress: (fraction: number, phase?: "fonts" | "pages") => void,
): Promise<ToolOutput> {
  const out = await runInWorker(pageToolJob(kind, plan, files, { removeBookmarks }), { signal, onProgress });
  return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
}
