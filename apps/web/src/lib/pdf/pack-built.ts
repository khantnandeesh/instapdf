import type { ToolOutput } from "@/components/tool-flow/types";

export type BuiltPdf = { name: string; blob: Blob; pageCount: number };

/** One finished PDF as it is, several in a ZIP named `zipName` (for the tools that build their files one at a time in the tab). */
export async function packBuilt(built: readonly BuiltPdf[], zipName: string, signal: AbortSignal, rest: { wasEncrypted: boolean; warnings?: string[]; notes?: string[] }): Promise<ToolOutput> {
  if (built.length === 1) return { name: built[0].name, type: "application/pdf", blob: built[0].blob, size: built[0].blob.size, pageCount: built[0].pageCount, ...rest };
  const { createZipWriter } = await import("./zip");
  const zip = createZipWriter();
  for (const b of built) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    zip.add(b.name, new Uint8Array(await b.blob.arrayBuffer()));
  }
  const blob = zip.finish();
  return { name: zipName, type: "application/zip", blob, size: blob.size, entries: built.map((b) => ({ name: b.name, pageCount: b.pageCount })), ...rest };
}
