/**
 * Repair (spec F13 §2), the part that runs in the tab: each file goes to the processing worker
 * (repair.ts). When nothing sound can be written from a file that this tab can still draw, its pages
 * are saved as pictures instead, and the result says so: a readable copy beats none.
 */
import type { ToolOutput } from "@/components/tool-flow/types";
import { pdfOutputName, uniqueNames } from "./naming";
import { packBuilt, type BuiltPdf } from "./pack-built";
import { USER_ERROR } from "./user-error";
import { runInWorker } from "./worker-client";

export type RepairSource = { name: string; source: Blob; password?: string; pageCount: number; /** Could not be opened in the tab. */ damaged: boolean };

const PICTURE_DPI = 150;
const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export async function repairFiles(sources: readonly RepairSource[], zipName: string, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<ToolOutput> {
  const names = uniqueNames(sources.map((s) => pdfOutputName(s.name)));
  const built: BuiltPdf[] = [];
  const notes = new Set<string>();
  const good = new Set<string>();
  let wasEncrypted = false;
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const within = (f: number) => onProgress(((i + f) / sources.length) * 0.99);
    try {
      const out = await runInWorker({ kind: "repair", zipName: "", files: [{ name: src.name, source: src.source, password: src.password }] }, { signal, onProgress: within });
      wasEncrypted ||= out.wasEncrypted;
      // In a batch, a note says which file it is about.
      out.warnings?.forEach((w) => notes.add(sources.length > 1 ? `${src.name}: ${w}` : w));
      out.notes?.forEach((w) => good.add(sources.length > 1 ? `${src.name}: ${w}` : w));
      built.push({ name: names[i], blob: out.blob, pageCount: out.pageCount ?? 0 });
    } catch (error) {
      if (isAbort(error) || signal.aborted || src.damaged) throw error;
      const { flattenToPictures } = await import("./flatten-images");
      let pictures: ToolOutput;
      try {
        pictures = await flattenToPictures([{ name: src.name, source: src.source, password: src.password, pageCount: src.pageCount }], PICTURE_DPI, "", signal, within);
      } catch (second) {
        if (isAbort(second)) throw second;
        throw error;
      }
      wasEncrypted ||= pictures.wasEncrypted;
      notes.add(`${src.name} could only be saved as pictures of its pages: the text in it can no longer be selected.`);
      built.push({ name: names[i], blob: pictures.blob, pageCount: pictures.pageCount ?? src.pageCount });
    }
  }
  if (!built.length) throw new Error(`${USER_ERROR}Nothing could be repaired.`);
  const out = await packBuilt(built, zipName, signal, { wasEncrypted, warnings: notes.size ? [...notes] : undefined, notes: good.size ? [...good] : undefined });
  onProgress(1);
  return out;
}
