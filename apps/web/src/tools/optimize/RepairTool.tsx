"use client";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { flowTool } from "@/tools/registry";

const tool = flowTool("repair-pdf");

/**
 * Repair (spec F13 §2): no options. A damaged file is read object by object and written out sound;
 * a file this tab cannot even open is still taken and shows as one placeholder page.
 */
export function RepairTool() {
  const process: ProcessFn = async (files, signal, onProgress) => {
    const { repairFiles } = await import("@/lib/pdf/repair-run");
    return repairFiles(
      files.map((f) => ({ name: f.name, source: f.source, password: f.password, pageCount: f.pageCount, damaged: f.damaged === true })),
      tool.flow.outputName?.(files.map((f) => f.name)) ?? "",
      signal,
      onProgress,
    );
  };
  return <ToolFlow tool={tool} process={process} renderOptions={() => null} />;
}
