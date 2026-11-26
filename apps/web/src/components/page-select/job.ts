/** Runs a Split, Extract or Delete plan in the processing worker (spec F4/F5 §0a.4). */
import type { OutputPlan } from "@/lib/page-plans";
import { documentsJob, type DocumentsJob } from "@/lib/pdf/documents-job";
import { runInWorker } from "@/lib/pdf/worker-client";
import type { ReadyFile, ToolOutput } from "../tool-flow/types";

/** The ToolFlow `process` for a plan: one PDF, or one ZIP of several. */
export async function runPlan(
  kind: DocumentsJob["kind"],
  plan: OutputPlan,
  files: readonly ReadyFile[],
  removeBookmarks: boolean,
  signal: AbortSignal,
  onProgress: (fraction: number, phase?: "fonts" | "pages") => void,
): Promise<ToolOutput> {
  const out = await runInWorker(documentsJob(kind, plan, files, { removeBookmarks }), { signal, onProgress });
  return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
}
