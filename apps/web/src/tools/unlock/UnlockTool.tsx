"use client";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";

const tool = flowTool("unlock-pdf");

/**
 * Unlock (spec F11 §3): a copy with no password and no restrictions. The flow asks for the password of
 * a file that needs one to open; there is nothing else to choose.
 */
const process: ProcessFn = async (files, signal, onProgress) => {
  const out = await runInWorker(
    { kind: "unlock", zipName: tool.flow.outputName?.(files.map((f) => f.name)) ?? "", files: files.map((f) => ({ name: f.name, source: f.source, password: f.password })) },
    { signal, onProgress },
  );
  return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
};

export function UnlockTool() {
  return <ToolFlow tool={tool} process={process} renderOptions={() => null} />;
}
