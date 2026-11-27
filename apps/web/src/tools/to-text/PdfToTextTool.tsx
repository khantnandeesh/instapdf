"use client";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { flowTool } from "@/tools/registry";

const tool = flowTool("pdf-to-text");

/** PDF to text (spec F12 §4): all the text of each PDF as a .txt file. No options. */
const process: ProcessFn = async (files, signal, onProgress) => {
  const { pdfsToText } = await import("@/lib/pdf/page-text");
  return pdfsToText(
    files.map((f) => ({ name: f.name, source: f.source, password: f.password })),
    signal,
    onProgress,
  );
};

export function PdfToTextTool() {
  return <ToolFlow tool={tool} process={process} renderOptions={() => null} />;
}
